"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { Track, TrackAnalysis, getTrackAnalysis } from "@/lib/api";

interface TrackWaveformProps {
    track: Track;
    entryPoint?: number;
    exitPoint?: number;
    onCueChange?: (entry: number, exit: number) => void;
    height?: number;
}

export function TrackWaveform({
    track,
    entryPoint = 0,
    exitPoint,
    onCueChange,
    height = 80,
}: TrackWaveformProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);
    const analysisRef = useRef<TrackAnalysis | null>(null);

    const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [entry, setEntry] = useState(entryPoint);
    const [exit, setExit] = useState(exitPoint ?? track.durationSec ?? 0);


    //Snap to nearest beat
    function snapToBeat(
        time: number,
        analysis: TrackAnalysis | null
    ): number {
        if (!analysis || analysis.beats.length === 0) return time;

        let closest = analysis.beats[0];
        let minDist = Math.abs(time - closest);

        for (const beat of analysis.beats) {
            const dist = Math.abs(time - beat);
            if (dist < minDist) {
                closest = beat;
                minDist = dist;
            }
        }

        return closest;
    }

    //  Load analysis 
    useEffect(() => {
        async function load() {
            try {
                const data = await getTrackAnalysis(track.id);
                setAnalysis(data);
                analysisRef.current = data;
            } catch {
                // Not analyzed yet
            }
        }
        load();
    }, [track.id]);


    //  Draw beat markers on canvas overlay
    const drawBeatMarkers = useCallback((ws: WaveSurfer) => {
        if (!canvasRef.current || !analysisRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const duration = ws.getDuration();
        const width = ws.getWrapper().scrollWidth;

        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, width, height);

        const { beats, downbeats } = analysisRef.current;

        // Draw beat lines
        for (const beat of beats) {
            if (beat > duration) break;

            const x = (beat / duration) * width;
            const isDownbeat = downbeats.includes(beat);

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);

            if (isDownbeat) {
                ctx.strokeStyle = "rgba(59, 130, 246, 0.6)"; // blue
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = "rgba(148, 163, 184, 0.3)"; // gray
                ctx.lineWidth = 1;
            }

            ctx.stroke();
        }
    }, [height]);


    //  Create draggable cue regions

    const createCueRegions = useCallback(
        (regions: RegionsPlugin, ws: WaveSurfer) => {
            const duration = ws.getDuration();
            const exitTime = exit ?? duration;

            // Entry point marker
            const entryRegion = regions.addRegion({
                id: "entry-cue",
                start: entry,
                end: entry + 0.5,
                color: "rgba(34, 197, 94, 0.3)", // green
                drag: true,
                resize: false,
            });

            // Exit point marker
            const exitRegion = regions.addRegion({
                id: "exit-cue",
                start: exitTime - 0.5,
                end: exitTime,
                color: "rgba(239, 68, 68, 0.3)", // red
                drag: true,
                resize: false,
            });

            // Handle drag with snap-to-beat
            entryRegion.on("update-end", () => {
                const snapped = snapToBeat(entryRegion.start, analysisRef.current);
                setEntry(snapped);
                onCueChange?.(snapped, exit);
            });

            exitRegion.on("update-end", () => {
                const snapped = snapToBeat(exitRegion.end, analysisRef.current);
                setExit(snapped);
                onCueChange?.(entry, snapped);
            });
        },
        [entry, exit, onCueChange]
    );


    // ── Initialize wavesurfer ──────────────────────────

    useEffect(() => {
        if (!containerRef.current || !track.url) return;

        const regions = RegionsPlugin.create();

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: "#94a3b8",
            progressColor: "#3b82f6",
            cursorColor: "#ffffff",
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height,
            normalize: true,
        });

        ws.registerPlugin(regions);
        wsRef.current = ws;
        regionsRef.current = regions;

        ws.load(track.url);

        ws.on("ready", () => {
            setIsLoaded(true);
            drawBeatMarkers(ws);
            createCueRegions(regions, ws);
        });

        ws.on("audioprocess", () => {
            setCurrentTime(ws.getCurrentTime());
        });

        ws.on("interaction", () => {
            ws.playPause();
        });

        return () => {
            ws.destroy();
        };
    }, [track.url, height]);




    // ── Playback controls ──────────────────────────────

    function togglePlay() {
        wsRef.current?.playPause();
    }

    function formatTime(s: number): string {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    }

    // ── Render ─────────────────────────────────────────

    return (
        <div className="space-y-2">
            {/* Track info */}
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate">{track.originalFileName}</span>
                <div className="flex items-center gap-3 text-gray-500">
                    {analysis?.bpm && <span>{analysis.bpm.toFixed(1)} BPM</span>}
                    <span>{formatTime(currentTime)} / {formatTime(track.durationSec ?? 0)}</span>
                </div>
            </div>

            {/* Waveform + canvas overlay */}
            <div className="relative">
                <div ref={containerRef} />

                {/* Beat markers canvas */}
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 2 }}
                />

                {/* Cue labels */}
                {isLoaded && (
                    <>
                        <div
                            className="absolute top-0 text-[10px] text-green-600 font-medium pointer-events-none"
                            style={{
                                left: `${((entry / (track.durationSec ?? 1)) * 100).toFixed(1)}%`,
                                zIndex: 3,
                            }}
                        >
                            IN
                        </div>
                        <div
                            className="absolute top-0 text-[10px] text-red-600 font-medium pointer-events-none"
                            style={{
                                left: `${((exit / (track.durationSec ?? 1)) * 100).toFixed(1)}%`,
                                zIndex: 3,
                            }}
                        >
                            OUT
                        </div>
                    </>
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
                <button
                    onClick={togglePlay}
                    disabled={!isLoaded}
                    className="rounded-full bg-gray-800 p-2 text-white hover:bg-gray-700 disabled:opacity-50"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </button>

                <div className="text-xs text-gray-500">
                    <span className="text-green-600">IN</span> {formatTime(entry)}
                    <span className="mx-2">·</span>
                    <span className="text-red-600">OUT</span> {formatTime(exit)}
                </div>
            </div>
        </div>
    );
}