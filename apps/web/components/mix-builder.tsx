"use client";

import { addTrackToMix, createMix, generatePlan, getMixAudioUrl, getTracks, Track, triggerRender, uploadTrack } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import MixPlayer from "./mix-player";
import { PipelineStatus } from "./pipeline-status";

type MixStatus =
    | "idle"
    | "creating"
    | "planning"
    | "rendering"
    | "done"
    | "error";

const MixBuilder = () => {

    const [tracks, setTracks] = useState<Track[]>([]);
    const [selectedA, setSelectedA] = useState<string | null>(null);
    const [selectedB, setSelectedB] = useState<string | null>(null);
    const [mixStatus, setMixStatus] = useState<MixStatus>("idle");
    const [mixAudioUrl, setMixAudioUrl] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // Load tracks
    const loadTracks = useCallback(async () => {
        try {
            const data = await getTracks();
            setTracks(data);
        } catch (err) {
            console.error("Failed to load tracks:", err);
        }
    }, []);

    // Poll for analyzed tracks
    useEffect(() => {
        loadTracks();
    }, [loadTracks]);

    useEffect(() => {
        const hasPending = tracks.some((t) =>
            ["uploaded", "queued", "analyzing"].includes(t.status)
        );

        if (!hasPending) return;

        const interval = setInterval(loadTracks, 2000);
        return () => clearInterval(interval);
    }, [tracks, loadTracks]);

    //   Upload handler 
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

    //   Create mix pipeline
    async function handleCreateMix() {
        if (!selectedA || !selectedB) return;

        setMixStatus("creating");
        setErrorMessage(null);
        setMixAudioUrl(null);

        try {
            // Step 1: Create mix
            const mix = await createMix();

            // Step 2: Add tracks
            await addTrackToMix(mix.id, selectedA);
            await addTrackToMix(mix.id, selectedB);

            // Step 3: Generate plan
            setMixStatus("planning");
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
            setErrorMessage(err?.response?.data?.error ?? err.message ?? "Mix failed");
        }
    }

    // ── Poll for render result ──────────────────────────

    async function pollForRenderResult(mixId: string): Promise<string> {
        const maxAttempts = 60; // 2 minutes max
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const result = await getMixAudioUrl(mixId);
                return result.url;
            } catch {
                // Not ready yet, wait and retry
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }

        throw new Error("Render timed out");
    }

    // ── Filter analyzed tracks ──────────────────────────

    const analyzedTracks = tracks.filter((t) => t.status === "analyzed");


    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Upload Section */}
            <section className="rounded-lg border p-6 space-y-4">
                <h2 className="text-lg font-semibold">Upload Track</h2>

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
            {/* Track Selection */}
            <section className="rounded-lg border p-6 space-y-4">
                <h2 className="text-lg font-semibold">Select Tracks</h2>

                {analyzedTracks.length < 2 && (
                    <p className="text-sm text-gray-500">
                        Need at least 2 analyzed tracks. Upload more audio files above.
                    </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Track A selector */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Track A (Outgoing)
                        </label>
                        <select
                            value={selectedA ?? ""}
                            onChange={(e) => setSelectedA(e.target.value)}
                            className="w-full rounded border px-3 py-2 text-sm"
                        >
                            <option value="">Select track...</option>
                            {analyzedTracks.map((track) => (
                                <option key={track.id} value={track.id}>
                                    {track.originalFileName} ({track.bpm?.toFixed(1)} BPM)
                                </option>
                            ))}
                        </select>
                    </div>
                    {/* Track B selector */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Track B (Incoming)
                        </label>
                        <select
                            value={selectedB ?? ""}
                            onChange={(e) => setSelectedB(e.target.value)}
                            className="w-full rounded border px-3 py-2 text-sm"
                        >
                            <option value="">Select track...</option>
                            {analyzedTracks
                                .filter((t) => t.id !== selectedA)
                                .map((track) => (
                                    <option key={track.id} value={track.id}>
                                        {track.originalFileName} ({track.bpm?.toFixed(1)} BPM)
                                    </option>
                                ))}
                        </select>
                    </div>
                </div>
            </section>
            {/* Mix Button */}
            <section className="rounded-lg border p-6 space-y-4">
                <button
                    onClick={handleCreateMix}
                    disabled={!selectedA || !selectedB || mixStatus === "creating" || mixStatus === "planning" || mixStatus === "rendering"}
                    className="w-full rounded-md bg-blue-600 px-6 py-3 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                >
                    {mixStatus === "idle" && "🎧 Create AutoMix"}
                    {mixStatus === "creating" && "Creating mix..."}
                    {mixStatus === "planning" && "🧠 Planning transition..."}
                    {mixStatus === "rendering" && "🎛️ Rendering audio..."}
                    {mixStatus === "done" && "✅ Mix Complete — Create Another"}
                    {mixStatus === "error" && "❌ Failed — Try Again"}
                </button>

<PipelineStatus status={mixStatus} />
                {errorMessage && (
                    <p className="text-sm text-red-600 text-center">{errorMessage}</p>
                )}
            </section>

            {/* Mix Player */}
            {mixStatus === "done" && mixAudioUrl && (
                <MixPlayer audioUrl={mixAudioUrl} />
            )}
        </div>
    )
}

export default MixBuilder;