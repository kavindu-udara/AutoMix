import { MixPlan, MixPlanSegment } from "./types";

export interface TrackAnalysis {
  id: string;
  durationSec: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
}

export function createMultiTrackMixPlan(
  tracks: TrackAnalysis[],
  transitionBeats: number = 16,
): MixPlan {
  if (tracks.length < 2) {
    throw new Error("Need at least 2 tracks to create a mix plan");
  }

  // Use the first track's BPM as the target for the entire mix
  const targetBpm = tracks[0].bpm;
  const secondsPerBeat = 60 / targetBpm;
  const transitionSeconds = transitionBeats * secondsPerBeat;

  const segments: MixPlanSegment[] = [];

  // masterTime tracks where the next track should enter
  let masterTime = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isFirst = i === 0;
    const isLast = i === tracks.length - 1;

    // Determine segment type
    const type: MixPlanSegment["type"] = isFirst
      ? "outgoing"
      : isLast
        ? "incoming"
        : "middle";

    // ── Stretch ratio ──────────────────────────────────
    // First track is the reference, no stretch needed
    const stretchRatio = isFirst ? 1.0 : targetBpm / track.bpm;

    // ── Play-from point ────────────────────────────────
    // First track plays from the beginning.
    // Subsequent tracks start at their first downbeat (skip empty intro).
    const playFromSec = isFirst
      ? 0
      : track.downbeats.length > 0
        ? track.downbeats[0]
        : 0;

    // ── Effective duration after stretching ────────────
    const effectiveDuration = (track.durationSec - playFromSec) / stretchRatio;

    // ── Fade-out calculation ───────────────────────────
    let fadeOutStartSec: number | undefined;
    let fadeOutEndSec: number | undefined;
    let playToSec: number;

    if (!isLast) {
      // Find the best outro cue point (snapped to downbeat)
      const rawOutroStart = masterTime + effectiveDuration - transitionSeconds;

      // Snap to the nearest downbeat that is <= rawOutroStart
      // We search in the track's own timeline
      const outroInTrackTime =
        playFromSec + (rawOutroStart - masterTime) * stretchRatio;

      const validDownbeats = track.downbeats.filter(
        (b) => b <= outroInTrackTime && b >= playFromSec,
      );

      const snappedOutroInTrackTime =
        validDownbeats.length > 0
          ? validDownbeats[validDownbeats.length - 1]
          : outroInTrackTime;

      // Convert back to master timeline
      fadeOutStartSec =
        masterTime + (snappedOutroInTrackTime - playFromSec) / stretchRatio;

      fadeOutEndSec = fadeOutStartSec + transitionSeconds;

      // Play to the end of the track (fade handles volume)
      playToSec = track.durationSec;
    } else {
      // Last track: no fade-out, play to the end
      playToSec = track.durationSec;
    }

    // ── Fade-in calculation ────────────────────────────
    let fadeInStartSec: number | undefined;
    let fadeInEndSec: number | undefined;

    if (!isFirst) {
      fadeInStartSec = masterTime;
      fadeInEndSec = masterTime + transitionSeconds;
    }

    // ── Build segment ──────────────────────────────────
    const segment: MixPlanSegment = {
      trackId: track.id,
      type,
      playFromSec,
      playToSec,
      stretchRatio,
      masterStartSec: masterTime,
      fadeInStartSec,
      fadeInEndSec,
      fadeOutStartSec,
      fadeOutEndSec,
    };

    segments.push(segment);

    // ── Advance master time ────────────────────────────
    if (!isLast && fadeOutStartSec !== undefined) {
      // Next track enters where this track starts fading out
      masterTime = fadeOutStartSec;
    }
  }

  // Total duration = last track's master start + its effective duration
  const lastSegment = segments[segments.length - 1];
  const lastTrack = tracks[tracks.length - 1];
  const lastEffectiveDuration =
    (lastTrack.durationSec - lastSegment.playFromSec) /
    lastSegment.stretchRatio;

  const totalDurationSec = lastSegment.masterStartSec + lastEffectiveDuration;

  return {
    targetBpm,
    transitionBeats,
    transitionSeconds,
    totalDurationSec,
    segments,
  };
}
