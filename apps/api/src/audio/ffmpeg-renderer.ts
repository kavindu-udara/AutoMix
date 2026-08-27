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

  // ── Build per-track filters ──────────────────────────

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const inputLabel = `[${i}]`;
    let currentLabel = `[${i}]`;

    // 1. Trim to the play range
    const trimLabel = `[${i}_trim]`;
    filters.push(
      `${currentLabel}atrim=start=${seg.playFromSec}:end=${seg.playToSec},asetpts=PTS-STARTPTS${trimLabel}`,
    );
    currentLabel = trimLabel;

    // 2. Time-stretch (skip if ratio is ~1.0)
    if (Math.abs(seg.stretchRatio - 1.0) > 0.001) {
      const stretchLabel = `[${i}_stretch]`;
      filters.push(
        `${currentLabel}atempo=${seg.stretchRatio.toFixed(6)}${stretchLabel}`,
      );
      currentLabel = stretchLabel;
    }

    // 3. Delay to position on master timeline
    if (seg.masterStartSec > 0.01) {
      const delayMs = Math.round(seg.masterStartSec * 1000);
      const delayLabel = `[${i}_delay]`;
      filters.push(`${currentLabel}adelay=${delayMs}|${delayMs}${delayLabel}`);
      currentLabel = delayLabel;
    }

    // 4. Apply fades
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

    // Rename final label for amix
    const finalLabel = `[t${i}]`;
    if (currentLabel !== finalLabel) {
      filters.push(`${currentLabel}anull${finalLabel}`);
    }
  }

  // ── Mix all tracks together ──────────────────────────

  const inputLabels = segments.map((_, i) => `[t${i}]`).join("");
  const normalize = segments.length > 1 ? "normalize=0" : "";

  filters.push(
    `${inputLabels}amix=inputs=${segments.length}:duration=longest:dropout_transition=0:${normalize},alimiter=limit=0.95[out]`,
  );

  const filterComplex = filters.join(";");

  // ── Build FFmpeg args ────────────────────────────────

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
