"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

interface StemPlayerProps {
  trackId: string;
  stemUrls: Record<string, string>; // { vocals, drums, bass, other }
}

interface StemChannel {
  name: string;
  label: string;
  color: string;
  url: string;
  volume: number;
  muted: boolean;
}

const STEM_CONFIG = [
  { name: "vocals", label: "Vocals", color: "#ec4899" },
  { name: "drums",  label: "Drums",  color: "#f59e0b" },
  { name: "bass",   label: "Bass",   color: "#8b5cf6" },
  { name: "other",  label: "Other",  color: "#06b6d4" },
];

export function StemPlayer({ trackId, stemUrls }: StemPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const [channels, setChannels] = useState<StemChannel[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Initialize channels
  useEffect(() => {
    const chans = STEM_CONFIG.filter((cfg) => stemUrls[cfg.name]).map((cfg) => ({
      name: cfg.name,
      label: cfg.label,
      color: cfg.color,
      url: stemUrls[cfg.name],
      volume: 1.0,
      muted: false,
    }));
    setChannels(chans);
  }, [stemUrls]);

  // Initialize wavesurfer with the first stem as visual reference
  useEffect(() => {
    if (!containerRef.current || channels.length === 0) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#475569",
      progressColor: "#3b82f6",
      cursorColor: "#ffffff",
      barWidth: 2,
      barGap: 1,
      height: 80,
      normalize: true,
    });

    ws.load(channels[0].url);
    ws.on("ready", () => setDuration(ws.getDuration()));
    ws.on("audioprocess", () => setCurrentTime(ws.getCurrentTime()));
    ws.on("finish", () => setIsPlaying(false));

    wsRef.current = ws;

    // Create hidden audio elements for each stem
    for (const ch of channels) {
      const audio = new Audio(ch.url);
      audio.preload = "auto";
      audioRefs.current[ch.name] = audio;
    }

    return () => {
      ws.destroy();
      for (const audio of Object.values(audioRefs.current)) {
        audio.pause();
        audio.src = "";
      }
      audioRefs.current = {};
    };
  }, [channels]);

  // Sync all stem audio elements with wavesurfer
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    const syncStems = () => {
      const time = ws.getCurrentTime();
      for (const ch of channels) {
        const audio = audioRefs.current[ch.name];
        if (audio && Math.abs(audio.currentTime - time) > 0.1) {
          audio.currentTime = time;
        }
      }
    };

    ws.on("seek", syncStems);
    ws.on("audioprocess", syncStems);
  }, [channels]);

  // Volume/mute changes
  useEffect(() => {
    for (const ch of channels) {
      const audio = audioRefs.current[ch.name];
      if (audio) {
        audio.volume = ch.muted ? 0 : ch.volume;
      }
    }
  }, [channels]);

  // Controls
  const togglePlay = () => {
    const ws = wsRef.current;
    if (!ws) return;

    if (isPlaying) {
      ws.pause();
      for (const audio of Object.values(audioRefs.current)) audio.pause();
    } else {
      ws.play();
      for (const ch of channels) {
        const audio = audioRefs.current[ch.name];
        if (audio && !ch.muted) audio.play().catch(() => {});
      }
    }
    setIsPlaying(!isPlaying);
  };

  const updateVolume = (name: string, vol: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.name === name ? { ...ch, volume: vol } : ch))
    );
  };

  const toggleMute = (name: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.name === name ? { ...ch, muted: !ch.muted } : ch))
    );
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (channels.length === 0) return null;

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">🎛️ Stem Mixer</h3>

      {/* Waveform */}
      <div ref={containerRef} />

      {/* Stem controls */}
      <div className="space-y-2">
        {channels.map((ch) => (
          <div key={ch.name} className="flex items-center gap-3">
            {/* Color indicator */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: ch.color }}
            />

            {/* Label */}
            <span className="w-16 text-xs font-medium text-gray-600">{ch.label}</span>

            {/* Volume slider */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ch.volume}
              onChange={(e) => updateVolume(ch.name, parseFloat(e.target.value))}
              disabled={ch.muted}
              className="flex-1 accent-gray-600 h-1"
            />

            {/* Mute button */}
            <button
              onClick={() => toggleMute(ch.name)}
              className={`text-xs px-2 py-1 rounded border ${
                ch.muted
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {ch.muted ? "MUTED" : "ON"}
            </button>
          </div>
        ))}
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={togglePlay}
          className="rounded-full bg-gray-800 p-2 text-white hover:bg-gray-700"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <span className="text-xs text-gray-500">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}