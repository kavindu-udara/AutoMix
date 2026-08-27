import { execa } from "execa";
import { MixPlan } from "../mixing/types";

export async function renderMixAudio(
  trackPaths: string[],
  outputPath: string,
  plan: MixPlan,
) {
  const { segments } = plan;

  if (trackPaths.length !== segments.length) {
    throw new Error(
      `Track count (${trackPaths.length}) does not match segment count (${segments.length})`,
    );
  }

  const filters: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isFirst = i === 0;
    let currentLabel: string;

    if (isFirst) {
      // First track: no stretch, just trim
      const trimLabel = `[${i}_trim]`;
      filters.push(
        `[${i}]atrim=start=${seg.playFromSec}:end=${seg.playToSec},asetpts=PTS-STARTPTS${trimLabel}`,
      );
      currentLabel = trimLabel;
    } else {
      // Subsequent tracks: split into intro + body

      // 1. Stretched intro (beat-matched with previous track)
      const introLabel = `[${i}_intro]`;
      filters.push(
        `[${i}]atrim=start=${seg.playFromSec}:end=${seg.splitPointSec},asetpts=PTS-STARTPTS,atempo=${seg.stretchRatio.toFixed(6)}${introLabel}`,
      );

      // 2. Original-speed body (natural tempo)
      const bodyLabel = `[${i}_body]`;
      filters.push(
        `[${i}]atrim=start=${seg.splitPointSec}:end=${seg.playToSec},asetpts=PTS-STARTPTS${bodyLabel}`,
      );

      // 3. Crossfade between stretched intro and original body
      // This creates a smooth tempo transition over ~2 seconds
      const combinedLabel = `[${i}_combined]`;
      filters.push(
        `${introLabel}${bodyLabel}acrossfade=d=2:c1=tri:c2=tri${combinedLabel}`,
      );

      currentLabel = combinedLabel;
    }

    // Delay to position on master timeline
    if (seg.masterStartSec > 0.01) {
      const delayMs = Math.round(seg.masterStartSec * 1000);
      const delayLabel = `[${i}_delay]`;
      filters.push(`${currentLabel}adelay=${delayMs}|${delayMs}${delayLabel}`);
      currentLabel = delayLabel;
    }

    // Apply fades
    const fadeFilters: string[] = [];

    if (seg.fadeInStartSec !== undefined && seg.fadeInEndSec !== undefined) {
      const fadeDuration = seg.fadeInEndSec - seg.fadeInStartSec;
      fadeFilters.push(
        `afade=t=in:st=${seg.fadeInStartSec.toFixed(3)}:d=${fadeDuration.toFixed(3)}`,
      );
    }

    if (seg.fadeOutStartSec !== undefined && seg.fadeOutEndSec !== undefined) {
      const fadeDuration = seg.fadeOutEndSec - seg.fadeOutStartSec;
      fadeFilters.push(
        `afade=t=out:st=${seg.fadeOutStartSec.toFixed(3)}:d=${fadeDuration.toFixed(3)}`,
      );
    }

    if (fadeFilters.length > 0) {
      const fadeLabel = `[${i}_faded]`;
      filters.push(`${currentLabel}${fadeFilters.join(",")}${fadeLabel}`);
      currentLabel = fadeLabel;
    }

    // Final label for amix
    const finalLabel = `[t${i}]`;
    if (currentLabel !== finalLabel) {
      filters.push(`${currentLabel}anull${finalLabel}`);
    }
  }

  // Mix all tracks

  const inputLabels = segments.map((_, i) => `[t${i}]`).join("");
  const normalize = segments.length > 1 ? "normalize=0" : "";

  filters.push(
    `${inputLabels}amix=inputs=${segments.length}:duration=longest:dropout_transition=0:${normalize},alimiter=limit=0.95[out]`,
  );

  const filterComplex = filters.join(";");

  // Build FFmpeg args

  const args: string[] = ["-y"];

  for (const trackPath of trackPaths) {
    args.push("-i", trackPath);
  }

  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[out]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputPath,
  );

  console.log(`🎧 Rendering ${segments.length}-track mix with FFmpeg...`);

  await execa("ffmpeg", args);
}
