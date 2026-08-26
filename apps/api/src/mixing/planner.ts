import { MixPlan, MixPlanSegment } from "./types";

interface TrackAnalysis {
  id: string;
  durationSec: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
}

export function createMixPlan(
  trackA: TrackAnalysis,
  trackB: TrackAnalysis,
  transitionBeats: number = 16,
): MixPlan {
  // 1. Determine Target BPM
  // For MVP, we just match Track A's BPM.
  // (Later you could average them or limit the stretch ratio to +/- 8%)
  const targetBpm = trackA.bpm;
  const secondsPerBeat = 60 / targetBpm;
  const transitionSeconds = transitionBeats * secondsPerBeat;

  // 2. Find Track A Outro Cue Point
  // We want to start the fade out 16 beats before the end of the song.
  // We snap it to the nearest downbeat for a musical transition.
  let trackAOutroStart = Math.max(0, trackA.durationSec - transitionSeconds);

  // Find the closest downbeat that is <= trackAOutroStart
  const validDownbeatsA = trackA.downbeats.filter((b) => b <= trackAOutroStart);
  const fadeOutStartSec =
    validDownbeatsA.length > 0
      ? validDownbeatsA[validDownbeatsA.length - 1]
      : trackAOutroStart;

  const fadeOutEndSec = fadeOutStartSec + transitionSeconds;

  // 3. Find Track B Intro Cue Point
  // We want to start Track B at its first downbeat (or 0 if none)
  const playFromSecB = trackB.downbeats.length > 0 ? trackB.downbeats[0] : 0;

  // 4. Calculate Stretch Ratio for Track B
  const stretchRatio = targetBpm / trackB.bpm;

  // 5. Build the Segments
  const segmentA: MixPlanSegment = {
    trackId: trackA.id,
    type: "outgoing",
    playFromSec: 0,
    playToSec: Math.min(fadeOutEndSec, trackA.durationSec),
    fadeOutStartSec,
    fadeOutEndSec,
  };
  const segmentB: MixPlanSegment = {
    trackId: trackB.id,
    type: "incoming",
    playFromSec: playFromSecB,
    playToSec: trackB.durationSec,
    stretchRatio,
    fadeInStartSec: fadeOutStartSec, // Starts exactly when A starts fading
    fadeInEndSec: fadeOutEndSec,
  };

  // Calculate total duration of the mix
  // (Track A duration) + (Track B duration adjusted for stretch and overlap)
  const trackBEffectiveDuration =
    (trackB.durationSec - playFromSecB) / stretchRatio;
  const totalDurationSec = fadeOutStartSec + trackBEffectiveDuration;

  return {
    targetBpm,
    transitionBeats,
    transitionSeconds,
    totalDurationSec,
    segments: [segmentA, segmentB],
  };
}
