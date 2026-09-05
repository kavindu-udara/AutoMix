# Audio Engine Documentation

This document provides a deep technical dive into AutoMix's two audio rendering systems: the server-side FFmpeg renderer and the client-side Web Audio API preview engine.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Transition Planning Algorithm](#transition-planning-algorithm)
3. [FFmpeg Renderer](#ffmpeg-renderer)
4. [Web Audio API Preview Engine](#web-audio-api-preview-engine)
5. [Performance Considerations](#performance-considerations)

---

## Architecture Overview

AutoMix uses a dual-render architecture:

```
                    ┌─────────────────────┐
                    │   MixPlan JSON      │
                    │  (from planner.ts)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
    ┌─────────▼─────────┐           ┌──────────▼──────────┐
    │  Web Audio API    │           │   FFmpeg Renderer   │
    │  (Instant Preview)│           │  (High-Quality MP3) │
    │                   │           │                     │
    │ • Real-time       │           │ • Server-side       │
    │ • No render wait  │           │ • MP3 encoding      │
    │ • playbackRate    │           │ • Precise filters   │
    │   time-stretching │           │ • acrossfade        │
    └───────────────────┘           └─────────────────────┘
```

The **MixPlan** is the single source of truth, generated once and consumed by both engines.

---

## Transition Planning Algorithm

### Apple Music-Style Transitions

AutoMix uses an "outgoing track tempo shift" approach, inspired by Apple Music's crossfade behavior:

```
Track A: [=========original BPM=========|→ tempo shifts to B →|fade out]
Track B:                                    [enters at matching point → original BPM →=========]
```

**Key principles:**
1. Each track plays at its **original BPM** for most of its duration
2. Only the **outgoing track's outro** is time-stretched to match the incoming track's BPM
3. The incoming track enters at a **rhythmically appropriate point** (not necessarily the beginning)
4. Transitions are snapped to **downbeats** for musical alignment

### Planner Output (MixPlan)

```typescript
interface MixPlan {
  transitionBeats: number;        // e.g., 16 beats
  transitionSeconds: number;      // duration of crossfade
  totalDurationSec: number;       // total mix length
  segments: MixPlanSegment[];     // per-track instructions
}

interface MixPlanSegment {
  trackId: string;
  type: "outgoing" | "incoming" | "middle";
  
  playFromSec: number;            // where to start reading original audio
  playToSec: number;              // where to stop reading
  splitPointSec: number;          // where normal speed ends, stretch begins
  outroStretchRatio: number;      // tempo multiplier (e.g., 1.029 = 2.9% faster)
  entryPointSec: number;          // rhythmically chosen entry point
  
  masterStartSec: number;         // position on master timeline
  fadeInStartSec?: number;        // fade-in start (master time)
  fadeInEndSec?: number;
  fadeOutStartSec?: number;       // fade-out start (master time)
  fadeOutEndSec?: number;
}
```

### Cue Point Selection

**Entry points** (incoming tracks):
- Searches for downbeats between 2s and 60s
- Prefers ~8 beats into the track (establishes rhythm before mixing)
- Can be overridden by user via draggable cue points

**Exit points** (outgoing tracks):
- Calculated as `duration - (2 × transitionSeconds)`
- Snapped to nearest downbeat before that point
- Can be overridden by user

---

## FFmpeg Renderer

### Two-Pass Architecture

To avoid filtergraph complexity issues, rendering uses two passes:

```
Pass 1: Prepare each track
  Input: original audio file
  Output: prepared WAV (trimmed, stretched, faded)

Pass 2: Chain tracks together
  Input: prepared WAV files
  Output: final MP3 mix
```

### Pass 1: Track Preparation

For each track (except the last), the filtergraph:

1. **Splits** the audio into two branches using `asplit`
2. **Trims** the normal section (original BPM)
3. **Trims + stretches** the outro section (matched to next track's BPM)
4. **Normalizes format** to 44100Hz stereo fltp
5. **Concatenates** normal + stretched outro

```
[0]asplit=2[a][b];
[a]atrim=start=0:end=240.5,asetpts=PTS-STARTPTS,aformat=...[normal];
[b]atrim=start=240.5:end=256.078,asetpts=PTS-STARTPTS,atempo=1.029,aformat=...[outro];
[normal][outro]concat=n=2:v=0:a=1[out]
```

**Why `asplit`?** Reading the same input twice without splitting can cause the second read to receive empty data.

**Why `aformat`?** Ensures both branches have identical sample format, rate, and channel layout before concatenation. Without this, `concat` may produce silence due to format mismatch.

### Pass 2: Crossfade Chaining

Prepared WAVs are chained using `acrossfade`:

```
[0][1]acrossfade=d=7.708:c1=tri:c2=tri[mix1];
[mix1][2]acrossfade=d=7.708:c1=tri:c2=tri[out]
```

**Why `acrossfade` instead of `adelay` + `amix`?**
- `adelay` with large values (>30s) causes FFmpeg to produce silence
- `acrossfade` naturally handles the overlap: it takes the END of track A and overlaps it with the START of track B
- Since track A's end is the stretched outro, beats align during the crossfade
- No explicit delay calculation needed

**Curve types:**
- `c1=tri` (triangle) for fade-out: linear decrease
- `c2=tri` (triangle) for fade-in: linear increase
- Other options: `exp` (exponential), `log` (logarithmic), `ipar` (inverse parabolic)

### Complete Filtergraph Example (3-track mix)

```
Pass 1 - Track 1:
[0]asplit=2[a][b];
[a]atrim=start=0:end=207.592,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[normal];
[b]atrim=start=207.592:end=215.3,asetpts=PTS-STARTPTS,atempo=1.032,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outro];
[normal][outro]concat=n=2:v=0:a=1[out]

Pass 1 - Track 2:
[0]asplit=2[a][b];
[a]atrim=start=3.2:end=195.8,asetpts=PTS-STARTPTS,aformat=...[normal];
[b]atrim=start=195.8:end=203.5,asetpts=PTS-STARTPTS,atempo=0.971,aformat=...[outro];
[normal][outro]concat=n=2:v=0:a=1[out]

Pass 1 - Track 3:
[0]atrim=start=8.2,end=220.1,asetpts=PTS-STARTPTS[out]

Pass 2:
[0][1]acrossfade=d=7.708:c1=tri:c2=tri[mix1];
[mix1][2]acrossfade=d=7.708:c1=tri:c2=tri[out]
```

---

## Web Audio API Preview Engine

### Overview

The `MixAudioEngine` class provides instant preview playback without waiting for FFmpeg rendering. It uses the same `MixPlan` JSON but applies it in real-time using the Web Audio API.

### Architecture

```typescript
class MixAudioEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private trackBuffers: Map<string, AudioBuffer>;
  private activeSources: AudioBufferSourceNode[];
  
  async loadTracks(tracks: { trackId: string; url: string }[])
  setPlan(plan: MixPlan)
  async play(fromTime?: number)
  pause()
  stop()
  async seek(time: number)
  setVolume(vol: number)
}
```

### Scheduling Segments

Each segment is scheduled as one or two `AudioBufferSourceNode`s:

1. **Normal section** (original speed):
   ```typescript
   const source = ctx.createBufferSource();
   source.buffer = trackBuffer;
   source.playbackRate.value = 1.0;
   source.start(absoluteStartTime, bufferOffset, duration);
   ```

2. **Stretched outro section** (matched to next track):
   ```typescript
   const source = ctx.createBufferSource();
   source.buffer = trackBuffer;
   source.playbackRate.value = segment.outroStretchRatio; // e.g., 1.029
   source.start(absoluteStartTime, bufferOffset, duration);
   ```

### Gain Automation for Fades

Fades are applied using `GainNode` automation:

```typescript
// Fade in
gainNode.gain.setValueAtTime(0, fadeInStartAbs);
gainNode.gain.linearRampToValueAtTime(1, fadeInEndAbs);

// Fade out
gainNode.gain.setValueAtTime(1, fadeOutStartAbs);
gainNode.gain.linearRampToValueAtTime(0, fadeOutEndAbs);
```

### Limitations

| Feature | Web Audio Preview | FFmpeg Render |
|---------|-------------------|---------------|
| Time-stretching | `playbackRate` (changes pitch) | `atempo` (preserves pitch) |
| Audio quality | Good | Excellent |
| Latency | Instant | 30-60s render time |
| Output format | Browser playback | MP3 file |

**Pitch shifting:** `playbackRate` changes both tempo and pitch. A 3% speed increase raises pitch by ~3%. FFmpeg's `atempo` filter uses phase vocoder techniques to change tempo without affecting pitch. For production mixes, always use the FFmpeg-rendered MP3.

---

## Performance Considerations

### FFmpeg Rendering

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Track count | Linear scaling | Limit to 10-15 tracks per mix |
| Track duration | Linear scaling | Trim long tracks before mixing |
| CPU cores | Parallel processing | FFmpeg uses multiple threads automatically |
| Disk I/O | WAV temp files | Use SSD storage |
| Memory | ~50MB per track | Monitor worker memory usage |

**Typical render times:**
- 2 tracks (3 min each): 15-30s
- 5 tracks (3 min each): 45-90s
- 10 tracks (3 min each): 2-4 min

### Web Audio Preview

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Audio decoding | One-time cost per track | Decode on load, cache in memory |
| Source scheduling | Minimal overhead | Schedule all sources at once |
| Memory | ~10MB per decoded track | Limit concurrent tracks |

**Optimization:** The preview engine decodes all tracks upfront during `loadTracks()`. This causes a 2-5s loading delay but ensures smooth playback without decoding hiccups.

---

## Debugging

### FFmpeg Filtergraph Logging

The renderer logs the complete filtergraph to stdout:

```typescript
console.log("📋 FFmpeg filtergraph:");
filters.forEach((f) => console.log(`  ${f}`));
```

Use this to verify:
- Trim ranges are correct
- Stretch ratios match the plan
- Fade times align with master timeline
- No duplicate or missing labels

### Common Issues

**Silence in output:**
- Check `aformat` is applied before `concat`
- Verify `asetpts=PTS-STARTPTS` after every `atrim`
- Ensure fade times don't exceed track duration

**Beats not aligned:**
- Verify `outroStretchRatio` matches `targetBpm / trackBpm`
- Check `splitPointSec` is on a downbeat
- Confirm `masterStartSec` accounts for previous track's fade-out

**FFmpeg crashes:**
- Check for invalid time ranges (e.g., `start > end`)
- Verify all labels are defined before use
- Ensure temp directory has write permissions
```
