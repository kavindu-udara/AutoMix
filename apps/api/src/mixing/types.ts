export interface MixPlanSegment {
  trackId: string;
  type: "outgoing" | "incoming" | "middle";

  // Where to read from the original audio file
  playFromSec: number;
  playToSec: number;

  // For outgoing/middle tracks: the point where the track
  // switches from normal speed → stretched to match NEXT track
  splitPointSec: number;

  // Stretch ratio applied to the OUTRO section only
  // > 1.0 = speed up, < 1.0 = slow down, 1.0 = no stretch
  // This matches the outgoing track to the INCOMING track's BPM
  outroStretchRatio: number;

  // For incoming tracks: the entry point in the track's timeline
  // where the rhythm matches the outgoing track
  entryPointSec: number;

  // Position on the master timeline (seconds)
  masterStartSec: number;

  // Fade coordinates on the master timeline
  fadeInStartSec?: number;
  fadeInEndSec?: number;
  fadeOutStartSec?: number;
  fadeOutEndSec?: number;
}

export interface MixPlan {
  transitionBeats: number;
  transitionSeconds: number;
  totalDurationSec: number;
  segments: MixPlanSegment[];
}
