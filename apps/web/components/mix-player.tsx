"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

interface MixPlayerProps {
    audioUrl: string;
}

const MixPlayer = ({ audioUrl }: MixPlayerProps) => {

    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: "#6366f1",
            progressColor: "#3b82f6",
            cursorColor: "#ffffff",
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 100,
            normalize: true,
        });

        wavesurfer.load(audioUrl);

        wavesurfer.on("ready", () => {
            setDuration(wavesurfer.getDuration());
            setIsLoaded(true);
        });

        wavesurfer.on("audioprocess", () => {
            setCurrentTime(wavesurfer.getCurrentTime());
        });

        wavesurfer.on("finish", () => {
            setIsPlaying(false);
        });

        wavesurferRef.current = wavesurfer;

        return () => {
            wavesurfer.destroy();
        };
    }, [audioUrl]);

    function togglePlay() {
        if (!wavesurferRef.current) return;

        wavesurferRef.current.playPause();
        setIsPlaying(wavesurferRef.current.isPlaying());
    }

    function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }


    return (
        <section className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">🎧 Your Mix</h2>
                <span className="text-sm text-gray-500">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>
            </div>

            {/* Waveform */}
            <div
                ref={containerRef}
                className="w-full rounded-md overflow-hidden"
            />

            {/* Controls */}
            <div className="flex items-center gap-4">
                <button
                    onClick={togglePlay}
                    disabled={!isLoaded}
                    className="rounded-full bg-blue-600 p-3 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                    {isPlaying ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </button>

                <a
                    href={audioUrl}
                    download="automix.mp3"
                    className="text-sm text-blue-600 hover:underline"
                >
                    Download MP3
                </a>
            </div>
        </section>
    )
}

export default MixPlayer;