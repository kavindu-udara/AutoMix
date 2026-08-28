import { MixPlan, MixPlanSegment } from "./types";

export interface TrackAnalysis {
  id: string;
  durationSec: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
}

/**
 * Find a good entry point in a track's first ~60 seconds.
 */
function findEntryPoint(track: TrackAnalysis): number {
  if (track.downbeats.length === 0) return 0;

  const candidates = track.downbeats.filter((b) => b >= 2.0 && b <= 60.0);

  if (candidates.length === 0) return 0;

  // Prefer a point ~8 beats in
  const idealTime = 8 * (60 / track.bpm);

  let best = candidates[0];
  let bestDistance = Math.abs(candidates[0] - idealTime);

  for (const c of candidates) {
    const dist = Math.abs(c - idealTime);
    if (dist < bestDistance) {
      best = c;
      bestDistance = dist;
    }
  }

  return best;
}

/**
 * Find a downbeat at or before targetTime.
 */
function snapToDownbeat(track: TrackAnalysis, targetTime: number): number {
  const valid = track.downbeats.filter((b) => b <= targetTime && b >= 0);
  if (valid.length === 0) return Math.max(0, targetTime);
  return valid[valid.length - 1];
}

export function createMultiTrackMixPlan(
  tracks: TrackAnalysis[],
  transitionBeats: number = 16,
): MixPlan {
  if (tracks.length < 2) {
    throw new Error("Need at least 2 tracks");
  }

  const segments: MixPlanSegment[] = [];
  let masterTime = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isFirst = i === 0;
    const isLast = i === tracks.length - 1;
    const nextTrack = isLast ? null : tracks[i + 1];

    const type: MixPlanSegment["type"] = isFirst
      ? "outgoing"
      : isLast
        ? "incoming"
        : "middle";

    // Entry point
    const entryPointSec = isFirst ? 0 : findEntryPoint(track);

    // Transition timing
    // The OUTGOING track's outro is stretched to match the NEXT track.
    let outroStretchRatio = 1.0;
    let transitionSeconds: number;

    if (nextTrack) {
      outroStretchRatio = nextTrack.bpm / track.bpm;
      transitionSeconds = transitionBeats * (60 / nextTrack.bpm);
    } else {
      transitionSeconds = transitionBeats * (60 / track.bpm);
    }

    // Calculate split point and fade timing

    let splitPointSec: number;
    let playToSec: number;
    let fadeOutStartSec: number | undefined;
    let fadeOutEndSec: number | undefined;
    let fadeInStartSec: number | undefined;
    let fadeInEndSec: number | undefined;

    if (!isLast && nextTrack) {
      // This track has an outro that needs to be stretched.
      //
      // Timeline in the track's ORIGINAL seconds:
      //   [entryPointSec ... splitPointSec] = normal speed
      //   [splitPointSec ... playToSec]     = stretched to match next track
      //
      // The stretched section contains:
      //   - Tempo shift portion (gradual BPM change)
      //   - Crossfade portion (overlap with next track)

      // How much original audio we need for the stretched outro:
      // transitionSeconds of master time × stretchRatio = original seconds needed
      // We need 2× transitionSeconds: one for tempo shift, one for crossfade
      const outroOriginalDuration = transitionSeconds * 2 * outroStretchRatio;

      const rawOutroStart = track.durationSec - outroOriginalDuration;
      splitPointSec = snapToDownbeat(track, rawOutroStart);
      playToSec = track.durationSec;

      // Master timeline calculation
      // Normal section plays at 1:1 speed
      const normalDuration = splitPointSec - entryPointSec;

      // Stretched section duration on master timeline
      const stretchedOriginal = playToSec - splitPointSec;
      const stretchedMaster = stretchedOriginal / outroStretchRatio;

      // The tempo shift takes the first half, crossfade takes the second half
      const tempoShiftMaster = stretchedMaster / 2;
      const crossfadeMaster = stretchedMaster / 2;

      // Fade-out starts after normal section + tempo shift
      fadeOutStartSec = masterTime + normalDuration + tempoShiftMaster;

      fadeOutEndSec = fadeOutStartSec + crossfadeMaster;

      // Fade-in for this track (if not first)
      if (!isFirst) {
        fadeInStartSec = masterTime;
        fadeInEndSec = masterTime + transitionSeconds;
      }

      // Next track enters where this track starts fading out
      masterTime = fadeOutStartSec;
    } else {
      // Last track: no outro stretch, no fade-out
      splitPointSec = track.durationSec;
      playToSec = track.durationSec;

      if (!isFirst) {
        fadeInStartSec = masterTime;
        fadeInEndSec = masterTime + transitionSeconds;
      }
    }

    // Build segmen
    segments.push({
      trackId: track.id,
      type,
      playFromSec: entryPointSec,
      playToSec,
      splitPointSec,
      outroStretchRatio,
      entryPointSec,
      masterStartSec: isFirst ? 0 : masterTime,
      fadeInStartSec,
      fadeInEndSec,
      fadeOutStartSec,
      fadeOutEndSec,
    });
  }

  // Total duration
  const lastSeg = segments[segments.length - 1];
  const lastTrack = tracks[tracks.length - 1];
  const lastDuration = lastTrack.durationSec - lastSeg.entryPointSec;
  const totalDurationSec = lastSeg.masterStartSec + lastDuration;

  return {
    transitionBeats,
    transitionSeconds: transitionBeats * (60 / tracks[0].bpm),
    totalDurationSec,
    segments,
  };
}
