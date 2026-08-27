// apps/api/src/mixing/types.ts

export interface MixPlanSegment {
  trackId: string;
  type: "outgoing" | "incoming" | "middle";

  // Where to read from the original audio file
  playFromSec: number;
  playToSec: number;

  // Time-stretch ratio for the intro/transition section
  // 1.0 = no stretch. Only applies to the intro portion.
  stretchRatio: number;

  // Where in the ORIGINAL timeline the track switches from
  // stretched intro → original-speed body
  splitPointSec: number;

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