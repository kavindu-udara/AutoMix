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

  const segments: MixPlanSegment[] = [];

  // masterTime tracks where the next track should enter
  let masterTime = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isFirst = i === 0;
    const isLast = i === tracks.length - 1;

    const type: MixPlanSegment["type"] = isFirst
      ? "outgoing"
      : isLast
        ? "incoming"
        : "middle";

    // Determine transition BPM and stretch ratio
    // Each transition matches the OUTGOING track's BPM.
    // Track 1 is the reference (no stretch).
    // Track 2 stretches to match Track 1's BPM during the intro.
    // Track 3 stretches to match Track 2's ORIGINAL BPM during its intro.

    let stretchRatio = 1.0;
    let transitionSeconds: number;

    if (isFirst) {
      // First track: no stretch, transition based on its own BPM
      transitionSeconds = transitionBeats * (60 / track.bpm);
    } else {
      // Subsequent tracks: stretch to match the PREVIOUS track's BPM
      const outgoingBpm = tracks[i - 1].bpm;
      stretchRatio = outgoingBpm / track.bpm;
      transitionSeconds = transitionBeats * (60 / outgoingBpm);
    }

    // Play-from point
    const playFromSec = isFirst
      ? 0
      : track.downbeats.length > 0
        ? track.downbeats[0]
        : 0;

    // Split point: where stretched intro ends
    // The intro uses `transitionSeconds` of master time.
    // In the original timeline, that's `transitionSeconds * stretchRatio` seconds.
    const introOriginalLength = transitionSeconds * stretchRatio;
    const splitPointSec = playFromSec + introOriginalLength;

    // Body duration (original speed)
    const bodyDuration = Math.max(0, track.durationSec - splitPointSec);

    // Calculate positions

    let fadeOutStartSec: number | undefined;
    let fadeOutEndSec: number | undefined;
    let fadeInStartSec: number | undefined;
    let fadeInEndSec: number | undefined;

    if (isFirst) {
      // First track: starts at 0, plays at original speed
      masterTime = 0;

      // Find outro cue point (snapped to downbeat)
      const rawOutroStart = track.durationSec - transitionSeconds;
      const validDownbeats = track.downbeats.filter((b) => b <= rawOutroStart);
      fadeOutStartSec =
        validDownbeats.length > 0
          ? validDownbeats[validDownbeats.length - 1]
          : rawOutroStart;

      fadeOutEndSec = fadeOutStartSec + transitionSeconds;

      // Next track enters here
      masterTime = fadeOutStartSec;
    } else {
      // Subsequent tracks
      fadeInStartSec = masterTime;
      fadeInEndSec = masterTime + transitionSeconds;

      if (!isLast) {
        // This track also needs a fade-out for the next transition.
        // After the stretched intro, the body plays at original speed.
        // The fade-out should happen near the end of the body.

        // Total time this track occupies on the master timeline:
        // transitionSeconds (stretched intro) + bodyDuration (original speed)
        const totalTrackTime = transitionSeconds + bodyDuration;

        // Fade-out starts `transitionSeconds` before the track ends
        const rawFadeOutStart = masterTime + totalTrackTime - transitionSeconds;

        // Snap to a downbeat in the track's original timeline
        // Convert master time to track's original time:
        // masterTime → playFromSec (start of stretched intro)
        // After intro, each master second = 1 original second
        const fadeOutInTrackTime =
          splitPointSec + (rawFadeOutStart - masterTime - transitionSeconds);

        const validDownbeats = track.downbeats.filter(
          (b) => b <= fadeOutInTrackTime && b >= splitPointSec,
        );

        const snappedFadeOutInTrackTime =
          validDownbeats.length > 0
            ? validDownbeats[validDownbeats.length - 1]
            : fadeOutInTrackTime;

        // Convert back to master timeline
        fadeOutStartSec =
          masterTime +
          transitionSeconds +
          (snappedFadeOutInTrackTime - splitPointSec);

        fadeOutEndSec = fadeOutStartSec + transitionSeconds;

        // Next track enters here
        masterTime = fadeOutStartSec;
      }
    }

    // Build segment
    const segment: MixPlanSegment = {
      trackId: track.id,
      type,
      playFromSec,
      playToSec: track.durationSec,
      stretchRatio,
      splitPointSec,
      masterStartSec: isFirst ? 0 : fadeInStartSec!,
      fadeInStartSec,
      fadeInEndSec,
      fadeOutStartSec,
      fadeOutEndSec,
    };

    segments.push(segment);
  }

  // Calculate total duration
  const lastSegment = segments[segments.length - 1];
  const lastTrack = tracks[tracks.length - 1];
  const lastBodyDuration = Math.max(
    0,
    lastTrack.durationSec - lastSegment.splitPointSec,
  );
  const lastTransitionSeconds =
    transitionBeats *
    (60 / (tracks.length > 1 ? tracks[tracks.length - 2].bpm : lastTrack.bpm));

  const totalDurationSec =
    lastSegment.masterStartSec + lastTransitionSeconds + lastBodyDuration;

  return {
    transitionBeats,
    transitionSeconds: transitionBeats * (60 / tracks[0].bpm),
    totalDurationSec,
    segments,
  };
}
