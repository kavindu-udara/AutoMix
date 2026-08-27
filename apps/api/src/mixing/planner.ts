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
 * Looks for a downbeat that's at least 4 beats in,
 * preferring phrase boundaries (every 8 or 16 beats).
 */
function findEntryPoint(track: TrackAnalysis): number {
  if (track.downbeats.length === 0) return 0;

  // Look at downbeats in the first 60 seconds
  const candidates = track.downbeats.filter((b) => b >= 2.0 && b <= 60.0);

  if (candidates.length === 0) return 0;

  // Prefer a downbeat that's roughly 4-8 bars in
  // (gives the track a moment to establish rhythm before mixing)
  const idealTime = 8 * (60 / track.bpm); // ~8 beats in

  let best = candidates[0];
  let bestDistance = Math.abs(candidates[0] - idealTime);

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - idealTime);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Find a good outro start point, snapped to a downbeat.
 */
function findOutroStart(track: TrackAnalysis, targetTime: number): number {
  const validDownbeats = track.downbeats.filter(
    (b) => b <= targetTime && b >= 0,
  );

  if (validDownbeats.length === 0) return Math.max(0, targetTime);

  return validDownbeats[validDownbeats.length - 1];
}

export function createMultiTrackMixPlan(
  tracks: TrackAnalysis[],
  transitionBeats: number = 16,
): MixPlan {
  if (tracks.length < 2) {
    throw new Error("Need at least 2 tracks to create a mix plan");
  }

  const segments: MixPlanSegment[] = [];

  // Tracks how far along the master timeline we are
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
    // First track starts from 0.
    // Subsequent tracks start at a matching rhythm point.
    const entryPointSec = isFirst ? 0 : findEntryPoint(track);

    // Outro stretch: match THIS track to the NEXT track
    // The outgoing track's outro is stretched to match the
    // incoming track's BPM. This is the Apple Music approach.
    let outroStretchRatio = 1.0;
    let transitionSeconds: number;

    if (nextTrack) {
      // Stretch THIS track's outro to match the NEXT track's BPM
      outroStretchRatio = nextTrack.bpm / track.bpm;
      transitionSeconds = transitionBeats * (60 / nextTrack.bpm);
    } else {
      // Last track: no stretching needed
      transitionSeconds = transitionBeats * (60 / track.bpm);
    }

    // Calculate outro timing
    // The tempo shift section + crossfade section happen at the end.
    // We use transitionSeconds for the crossfade and another
    // transitionSeconds for the gradual tempo shift.

    let splitPointSec: number;
    let playToSec: number;
    let fadeOutStartSec: number | undefined;
    let fadeOutEndSec: number | undefined;

    if (!isLast && nextTrack) {
      // Total outro in original timeline:
      // tempoShift portion + crossfade portion, both stretched
      const totalOutroOriginal = transitionSeconds * 2 * outroStretchRatio;

      const rawOutroStart = track.durationSec - totalOutroOriginal;
      splitPointSec = findOutroStart(track, rawOutroStart);

      // Cut the track at the end (or slightly before)
      playToSec = track.durationSec;

      // On the master timeline:
      // Normal section: entryPointSec to splitPointSec
      // Stretched section: splitPointSec to playToSec
      // The stretched section duration on master timeline:
      const stretchedDuration = (playToSec - splitPointSec) / outroStretchRatio;

      // Crossfade starts after the tempo shift
      // Tempo shift = first half of stretched section
      // Crossfade = second half of stretched section
      const tempoShiftMaster = stretchedDuration / 2;
      const crossfadeMaster = stretchedDuration / 2;

      fadeOutStartSec = masterTime + tempoShiftMaster;
      fadeOutEndSec = fadeOutStartSec + crossfadeMaster;
    } else {
      // Last track: no outro
      splitPointSec = track.durationSec;
      playToSec = track.durationSec;
    }

    // Fade-in timing
    let fadeInStartSec: number | undefined;
    let fadeInEndSec: number | undefined;

    if (!isFirst) {
      fadeInStartSec = masterTime;
      fadeInEndSec = masterTime + transitionSeconds;
    }

    // Build segment
    const segment: MixPlanSegment = {
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
    };

    segments.push(segment);

    // Advance master time
    if (!isLast && fadeOutStartSec !== undefined) {
      // Next track enters where this track starts fading out
      masterTime = fadeOutStartSec;
    }
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
