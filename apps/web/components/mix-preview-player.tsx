"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { MixAudioEngine, MixPlan } from "@/lib/audio-engine";

interface MixPreviewPlayerProps {
  plan: MixPlan;
  trackUrls: Record<string, string>; // trackId → audio URL
}

export function MixPreviewPlayer({ plan, trackUrls }: MixPreviewPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MixAudioEngine | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [volume, setVolume] = useState(0.8);

  function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    writeString(view, 0, "RIFF");
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    // Interleave channels and write samples
    let offset = 44;
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // ── Initialize engine and load tracks ──────────────
  useEffect(() => {
    const engine = new MixAudioEngine();
    engineRef.current = engine;

    engine.setPlan(plan);
    engine.setCallbacks(
      (time) => setCurrentTime(time),
      () => {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    );

    async function loadAll() {
      setIsLoading(true);
      try {
        const tracks = Object.entries(trackUrls).map(([trackId, url]) => ({
          trackId,
          url,
        }));

        await engine.loadTracks(tracks);
        engine.setVolume(volume);
      } catch (err) {
        console.error("Failed to load tracks:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      engine.destroy();
    };
  }, [plan, trackUrls]);

  // ── Initialize waveform (synthetic timeline) ───────

  useEffect(() => {
    if (!waveformRef.current) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#cbd5e1",
      progressColor: "#3b82f6",
      cursorColor: "#ef4444",
      barWidth: 2,
      barGap: 1,
      height: 60,
      normalize: false,
      minPxPerSec: 20,
    });

    // Generate a synthetic waveform representing the mix timeline
    // This is a visual placeholder — real per-track waveforms come later
    const sampleRate = 8000;
    const numSamples = Math.floor(plan.totalDurationSec * sampleRate);
    const channelData = new Float32Array(numSamples);

    // Fill with low-amplitude noise to show the timeline
    for (let i = 0; i < numSamples; i++) {
      channelData[i] = (Math.random() - 0.5) * 0.1;
    }

    // Mark transition regions with higher amplitude
    for (const seg of plan.segments) {
      if (seg.fadeInStartSec !== undefined && seg.fadeInEndSec !== undefined) {
        const startSample = Math.floor(seg.fadeInStartSec * sampleRate);
        const endSample = Math.floor(seg.fadeInEndSec * sampleRate);
        for (let i = startSample; i < endSample && i < numSamples; i++) {
          channelData[i] = 0.5;
        }
      }
      if (seg.fadeOutStartSec !== undefined && seg.fadeOutEndSec !== undefined) {
        const startSample = Math.floor(seg.fadeOutStartSec * sampleRate);
        const endSample = Math.floor(seg.fadeOutEndSec * sampleRate);
        for (let i = startSample; i < endSample && i < numSamples; i++) {
          channelData[i] = 0.5;
        }
      }
    }

    const audioBuffer = new AudioBuffer({
      length: numSamples,
      numberOfChannels: 1,
      sampleRate,
    });
    audioBuffer.copyToChannel(channelData, 0);

    // Convert AudioBuffer to WAV blob for wavesurfer v7
    const wavBlob = audioBufferToWav(audioBuffer);
    ws.loadBlob(wavBlob);
    wsRef.current = ws;

    ws.on("click", () => {
      // Seek on click handled separately
    });

    return () => {
      ws.destroy();
    };
  }, [plan]);

  // ── Sync waveform cursor with playback ─────────────

  useEffect(() => {
    if (wsRef.current && isPlaying) {
      wsRef.current.seekTo(currentTime / plan.totalDurationSec);
    }
  }, [currentTime, isPlaying, plan.totalDurationSec]);

  // ── Controls ────────────────────────────────────────

  const togglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      await engine.play(currentTime);
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !engineRef.current) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = ratio * plan.totalDurationSec;

    engineRef.current.seek(time);
    setCurrentTime(time);
    wsRef.current?.seekTo(ratio);
  }, [plan.totalDurationSec]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    engineRef.current?.setVolume(v);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Render ──────────────────────────────────────────

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">🎧 Live Preview</h2>
        <span className="text-sm text-gray-500">
          {formatTime(currentTime)} / {formatTime(plan.totalDurationSec)}
        </span>
      </div>

      {/* Timeline waveform */}
      <div
        ref={waveformRef}
        onClick={handleSeek}
        className="cursor-pointer rounded overflow-hidden"
      />

      {/* Transition markers legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-400 rounded-sm inline-block" />
          Transition zones
        </span>
        <span>{plan.segments.length} tracks · {plan.transitionBeats}-beat transitions</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className="rounded-full bg-blue-600 p-3 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" className="animate-spin" strokeDasharray="32" strokeDashoffset="8" />
            </svg>
          ) : isPlaying ? (
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

        {/* Volume slider */}
        <div className="flex items-center gap-2 flex-1 max-w-[200px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="flex-1 accent-blue-600"
          />
        </div>

        {isLoading && (
          <span className="text-sm text-gray-500 animate-pulse">Loading audio...</span>
        )}
      </div>
    </div>
  );
}