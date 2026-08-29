"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Track,
    getTracks,
    uploadTrack,
    createMix,
    addTrackToMix,
    generatePlan,
    triggerRender,
    getMixAudioUrl,
    api,
} from "@/lib/api";
import MixPlayer from "./mix-player";
import { TrackWaveform } from "./track-waveform";

type MixStatus =
    | "idle"
    | "creating"
    | "planning"
    | "rendering"
    | "done"
    | "error";

export default function MixBuilder() {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
    const [mixStatus, setMixStatus] = useState<MixStatus>("idle");
    const [mixAudioUrl, setMixAudioUrl] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [cuePoints, setCuePoints] = useState<Record<string, { entry: number; exit: number }>>({});

    // ── Load tracks ─────────────────────────────────────

    const loadTracks = useCallback(async () => {
        try {
            const data = await getTracks();
            setTracks(data);
        } catch (err) {
            console.error("Failed to load tracks:", err);
        }
    }, []);

    useEffect(() => {
        loadTracks();
    }, [loadTracks]);

    // ── Poll for analyzed tracks ────────────────────────

    useEffect(() => {
        const hasPending = tracks.some((t) =>
            ["uploaded", "queued", "analyzing"].includes(t.status)
        );

        if (!hasPending) return;

        const interval = setInterval(loadTracks, 2000);
        return () => clearInterval(interval);
    }, [tracks, loadTracks]);

    // Upload handler

    async function handleUpload(file: File) {
        setUploading(true);
        try {
            await uploadTrack(file);
            await loadTracks();
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            setUploading(false);
        }
    }

    // Track selection helpers 

    const analyzedTracks = tracks.filter((t) => t.status === "analyzed");

    function addTrack(trackId: string) {
        if (!selectedTracks.includes(trackId)) {
            setSelectedTracks([...selectedTracks, trackId]);
        }
    }

    function removeTrack(trackId: string) {
        setSelectedTracks(selectedTracks.filter((id) => id !== trackId));
    }

    function moveTrack(index: number, direction: "up" | "down") {
        const newTracks = [...selectedTracks];
        const targetIndex = direction === "up" ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= newTracks.length) return;

        [newTracks[index], newTracks[targetIndex]] = [
            newTracks[targetIndex],
            newTracks[index],
        ];

        setSelectedTracks(newTracks);
    }

    // ── Create mix pipeline ─────────────────────────────

    async function handleCreateMix() {
        if (selectedTracks.length < 2) return;

        setMixStatus("creating");
        setErrorMessage(null);
        setMixAudioUrl(null);

        try {
            // Step 1: Create mix
            const mix = await createMix();

            // Step 2: Add all tracks in order
            for (const trackId of selectedTracks) {
                await addTrackToMix(mix.id, trackId);
            }

            // Step 3: Generate plan
            setMixStatus("planning");
            // Send custom cue points with the plan request
            const planResponse = await api.post(`/api/mixes/${mix.id}/plan`, {
                cuePoints, // { trackId: { entry, exit } }
            });
            await generatePlan(mix.id);

            // Step 4: Trigger render
            setMixStatus("rendering");
            await triggerRender(mix.id);

            // Step 5: Poll for result
            const audioUrl = await pollForRenderResult(mix.id);
            setMixAudioUrl(audioUrl);
            setMixStatus("done");
        } catch (err: any) {
            setMixStatus("error");
            setErrorMessage(
                err?.response?.data?.error ?? err.message ?? "Mix failed"
            );
        }
    }

    // Poll for render result
    async function pollForRenderResult(mixId: string): Promise<string> {
        const maxAttempts = 120; // 4 minutes for multi-track
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const result = await getMixAudioUrl(mixId);
                return result.url;
            } catch {
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }

        throw new Error("Render timed out");
    }

    // Render

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Upload */}
            <section className="rounded-lg border p-6 space-y-4">
                <h2 className="text-lg font-semibold">Upload Tracks</h2>

                <input
                    type="file"
                    accept=".mp3,.wav,.m4a"
                    disabled={uploading}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                        e.target.value = "";
                    }}
                    className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-white hover:file:bg-gray-700"
                />

                {uploading && <p className="text-sm text-gray-500">Uploading...</p>}
            </section>

            {/* Track Pool */}
            <section className="rounded-lg border p-6 space-y-4">
                <h2 className="text-lg font-semibold">
                    Available Tracks ({analyzedTracks.length} analyzed)
                </h2>

                {analyzedTracks.length === 0 && (
                    <p className="text-sm text-gray-500">
                        No analyzed tracks yet. Upload audio files above and wait for
                        analysis to complete.
                    </p>
                )}

                <div className="space-y-2">
                    {analyzedTracks.map((track) => {
                        const isSelected = selectedTracks.includes(track.id);

                        return (
                            <div
                                key={track.id}
                                className={`flex items-center justify-between rounded border px-4 py-2 text-sm ${isSelected
                                    ? "border-blue-400 bg-blue-50"
                                    : "border-gray-200"
                                    }`}
                            >
                                <div>
                                    <span className="font-medium">
                                        {track.originalFileName}
                                    </span>
                                    <span className="ml-2 text-gray-500">
                                        {track.bpm?.toFixed(1)} BPM
                                    </span>
                                </div>

                                {isSelected ? (
                                    <button
                                        onClick={() => removeTrack(track.id)}
                                        className="text-red-500 hover:text-red-700 text-xs"
                                    >
                                        Remove
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => addTrack(track.id)}
                                        className="text-blue-600 hover:text-blue-800 text-xs"
                                    >
                                        + Add to Mix
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Mix Queue */}
            {selectedTracks.length > 0 && (
                <section className="rounded-lg border p-6 space-y-6">
                    <h2 className="text-lg font-semibold">
                        Mix Queue ({selectedTracks.length} tracks)
                    </h2>

                    {selectedTracks.length < 2 && (
                        <p className="text-sm text-yellow-600">
                            Add at least 2 tracks to create a mix.
                        </p>
                    )}

                    <div className="space-y-6">
                        {selectedTracks.map((trackId, index) => {
                            const track = analyzedTracks.find((t) => t.id === trackId);
                            if (!track) return null;

                            return (
                                <div key={trackId} className="space-y-2">
                                    {/* Track header with reorder controls */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-mono text-gray-400">
                                            Track {index + 1}
                                        </span>

                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => moveTrack(index, "up")}
                                                disabled={index === 0}
                                                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded border"
                                            >
                                                ↑
                                            </button>
                                            <button
                                                onClick={() => moveTrack(index, "down")}
                                                disabled={index === selectedTracks.length - 1}
                                                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded border"
                                            >
                                                ↓
                                            </button>
                                            <button
                                                onClick={() => removeTrack(trackId)}
                                                className="px-2 py-1 text-xs text-red-400 hover:text-red-600 rounded border"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {/* Waveform with beat markers */}
                                    <TrackWaveform
                                        track={track}
                                        height={64}
                                        entryPoint={cuePoints[trackId]?.entry}
                                        exitPoint={cuePoints[trackId]?.exit}
                                        onCueChange={(entry, exit) => {
                                            setCuePoints((prev) => ({
                                                ...prev,
                                                [trackId]: { entry, exit },
                                            }));
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Mix Button */}
            <section className="rounded-lg border p-6 space-y-4">
                <button
                    onClick={handleCreateMix}
                    disabled={
                        selectedTracks.length < 2 ||
                        ["creating", "planning", "rendering"].includes(mixStatus)
                    }
                    className="w-full rounded-md bg-blue-600 px-6 py-3 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                >
                    {mixStatus === "idle" &&
                        `🎧 Create AutoMix (${selectedTracks.length} tracks)`}
                    {mixStatus === "creating" && "Creating mix..."}
                    {mixStatus === "planning" && "🧠 Planning transitions..."}
                    {mixStatus === "rendering" && "🎛️ Rendering audio..."}
                    {mixStatus === "done" && "✅ Mix Complete — Create Another"}
                    {mixStatus === "error" && "❌ Failed — Try Again"}
                </button>

                {errorMessage && (
                    <p className="text-sm text-red-600 text-center">{errorMessage}</p>
                )}
            </section>

            {/* Player */}
            {mixStatus === "done" && mixAudioUrl && (
                <MixPlayer audioUrl={mixAudioUrl} />
            )}
        </div>
    );
}