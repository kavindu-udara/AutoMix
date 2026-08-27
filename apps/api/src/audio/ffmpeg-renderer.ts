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
    const hasOutroStretch =
      Math.abs(seg.outroStretchRatio - 1.0) > 0.001 &&
      seg.splitPointSec < seg.playToSec;

    let currentLabel: string;

    if (hasOutroStretch) {
      // Outgoing/Middle track: split into normal + stretched outro

      // 1. Normal section (original BPM)
      const normalLabel = `[${i}_normal]`;
      filters.push(
        `[${i}]atrim=start=${seg.playFromSec}:end=${seg.splitPointSec},asetpts=PTS-STARTPTS${normalLabel}`,
      );

      // 2. Stretched outro (matched to NEXT track's BPM)
      const outroLabel = `[${i}_outro]`;
      filters.push(
        `[${i}]atrim=start=${seg.splitPointSec}:end=${seg.playToSec},asetpts=PTS-STARTPTS,atempo=${seg.outroStretchRatio.toFixed(6)}${outroLabel}`,
      );

      // 3. Crossfade between normal and stretched outro
      // This creates the gradual tempo shift
      const combinedLabel = `[${i}_combined]`;
      filters.push(
        `${normalLabel}${outroLabel}acrossfade=d=3:c1=tri:c2=tri${combinedLabel}`,
      );

      currentLabel = combinedLabel;
    } else {
      // First track or last track: no stretch, just trim
      const trimLabel = `[${i}_trim]`;
      filters.push(
        `[${i}]atrim=start=${seg.playFromSec}:end=${seg.playToSec},asetpts=PTS-STARTPTS${trimLabel}`,
      );
      currentLabel = trimLabel;
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
      const d = seg.fadeInEndSec - seg.fadeInStartSec;
      fadeFilters.push(
        `afade=t=in:st=${seg.fadeInStartSec.toFixed(3)}:d=${d.toFixed(3)}`,
      );
    }

    if (seg.fadeOutStartSec !== undefined && seg.fadeOutEndSec !== undefined) {
      const d = seg.fadeOutEndSec - seg.fadeOutStartSec;
      fadeFilters.push(
        `afade=t=out:st=${seg.fadeOutStartSec.toFixed(3)}:d=${d.toFixed(3)}`,
      );
    }

    if (fadeFilters.length > 0) {
      const fadeLabel = `[${i}_faded]`;
      filters.push(`${currentLabel}${fadeFilters.join(",")}${fadeLabel}`);
      currentLabel = fadeLabel;
    }

    // Final label
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

  const args: string[] = ["-y"];
  for (const p of trackPaths) args.push("-i", p);
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

  console.log(
    `🎧 Rendering ${segments.length}-track mix (Apple Music style)...`,
  );
  await execa("ffmpeg", args);
}
