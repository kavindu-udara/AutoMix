import { execa} from "execa";
import { MixPlan } from "../mixing/types";

export async function renderMixAudio(
    trackAPath: string,
    trackBPath: string,
    outputPath: string,
    plan: MixPlan,
){

    const segA = plan.segments.find((s) => s.type === "outgoing")!;
    const segB = plan.segments.find((s) => s.type === "incoming")!;

    // adelay takes milliseconds
  const delayMs = Math.round((segB.fadeInStartSec ?? 0) * 1000);

    // Build the ffmpeg filtergraph
    const filters = [
         // 1. Trim Track A to the exact end point
    `[0]atrim=start=${segA.playFromSec}:end=${segA.playToSec},asetpts=PTS-STARTPTS[a]`,
    
    // 2. Trim Track B from its cue point and time-stretch it to match Target BPM
    `[1]atrim=start=${segB.playFromSec},asetpts=PTS-STARTPTS,atempo=${segB.stretchRatio}[b]`,
    
    // 3. Delay Track B so it enters exactly when Track A starts fading out
    `[b]adelay=${delayMs}|${delayMs}[b_d]`,
    
    // 4. Apply volume fades (Crossfade)
    `[a]afade=t=out:st=${segA.fadeOutStartSec}:d=${plan.transitionSeconds}[a_f]`,
    `[b_d]afade=t=in:st=${segB.fadeInStartSec}:d=${plan.transitionSeconds}[b_f]`,
    
    // 5. Mix them together. normalize=0 prevents FFmpeg from halving the volume.
    // alimiter prevents clipping if the combined audio is too loud.
    `[a_f][b_f]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[out]`,
  ];

   const filterComplex = filters.join(";");

  const args = [
    "-y",
    "-i", trackAPath,
    "-i", trackBPath,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    outputPath,
  ];

  console.log("🎧 Running FFmpeg render...");
  
  // Execute FFmpeg
  await execa("ffmpeg", args);

}
