export interface MixPlanSegment {
  trackId: string;
  type: "outgoing" | "incoming";

  // where to start the reading from the original audio file
  playFromSec: number;

  // Where to stop reading from the original audio file
  playToSec: number;

  // For incoming track: how much speed up/slow down the audio
  stretchRatio?: number;

  // Master timeline coordinates for the crossfade
  fadeInStartSec?: number;
  fadeInEndSec?: number;
  fadeOutStartSec?: number;
  fadeOutEndSec?: number;
}

export interface MixPlan {
  targetBpm: number;
  transitionBeats: number;
  transitionSeconds: number;
  totalDurationSec: number;
  segments: MixPlanSegment[];
}
