import { execa } from "execa";
import path from "node:path";
import fs from "node:fs/promises";
import { MixPlan } from "../mixing/types";

export async function renderMixAudio(
  trackPaths: string[],
  outputPath: string,
  plan: MixPlan,
) {
  const { segments } = plan;
  const tempDir = path.dirname(outputPath);
  const tempFiles: string[] = [];

  try {
    // PASS 1: Prepare each track
    // For each track (except the last):
    //   - Normal section plays at original BPM
    //   - Outro section is stretched to match NEXT track's BPM
    //   - They are joined into one "prepared" WAV
    //   - Just trim from the entry point

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const tempPath = path.join(tempDir, `_prep_${i}.wav`);
      tempFiles.push(tempPath);

      const hasStretch =
        !isLast &&
        Math.abs(seg.outroStretchRatio - 1.0) > 0.001 &&
        seg.splitPointSec < seg.playToSec;

      if (hasStretch) {
        // Split into normal + stretched outro
        const filterComplex = [
          // Split input into two branches
          `[0]asplit=2[a][b]`,

          // Normal section (original BPM)
          `[a]atrim=start=${seg.playFromSec}:end=${seg.splitPointSec},` +
            `asetpts=PTS-STARTPTS,` +
            `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo` +
            `[normal]`,

          // Stretched outro (matched to next track's BPM)
          `[b]atrim=start=${seg.splitPointSec}:end=${seg.playToSec},` +
            `asetpts=PTS-STARTPTS,` +
            `atempo=${seg.outroStretchRatio.toFixed(6)},` +
            `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo` +
            `[outro]`,

          // Join them
          `[normal][outro]concat=n=2:v=0:a=1[out]`,
        ].join(";");

        console.log(
          `  Prep track ${i + 1}: stretch outro ×${seg.outroStretchRatio.toFixed(3)}`,
        );

        await execa("ffmpeg", [
          "-y",
          "-i",
          trackPaths[i],
          "-filter_complex",
          filterComplex,
          "-map",
          "[out]",
          "-c:a",
          "pcm_s16le",
          tempPath,
        ]);
      } else {
        // No stretch: just trim
        console.log(
          `  Prep track ${i + 1}: trim from ${seg.playFromSec.toFixed(1)}s`,
        );

        await execa("ffmpeg", [
          "-y",
          "-i",
          trackPaths[i],
          "-af",
          `atrim=start=${seg.playFromSec}:end=${seg.playToSec},asetpts=PTS-STARTPTS`,
          "-c:a",
          "pcm_s16le",
          "-ar",
          "44100",
          "-ac",
          "2",
          tempPath,
        ]);
      }

      // Verify output
      const stats = await fs.stat(tempPath);
      console.log(`    → ${stats.size} bytes`);

      if (stats.size < 1000) {
        throw new Error(
          `Prepared track ${i + 1} is too small (${stats.size} bytes)`,
        );
      }
    }

    // PASS 2: Chain acrossfade between prepared tracks
    // acrossfade overlaps the END of track A with the
    // START of track B. Since track A's end is the
    // stretched outro, the beats match during the overlap.

    const crossfadeSeconds = Math.min(plan.transitionSeconds, 10);

    if (tempFiles.length === 1) {
      await execa("ffmpeg", [
        "-y",
        "-i",
        tempFiles[0],
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        outputPath,
      ]);
    } else {
      const args: string[] = ["-y"];

      for (const f of tempFiles) {
        args.push("-i", f);
      }

      const filters: string[] = [];
      let prevLabel = "[0]";

      for (let i = 1; i < tempFiles.length; i++) {
        const isLast = i === tempFiles.length - 1;
        const outLabel = isLast ? "[out]" : `[mix${i}]`;

        filters.push(
          `${prevLabel}[${i}]acrossfade=d=${crossfadeSeconds.toFixed(2)}:c1=tri:c2=tri${outLabel}`,
        );

        prevLabel = outLabel;
      }

      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        outputPath,
      );

      console.log(
        `  Mixing: ${tempFiles.length} tracks, ` +
          `${crossfadeSeconds.toFixed(1)}s crossfade each`,
      );

      await execa("ffmpeg", args);
    }

    const outputStats = await fs.stat(outputPath);
    console.log(` Render complete: ${outputStats.size} bytes`);
  } catch (err: any) {
    console.error("FFmpeg error:", err.stderr ?? err.message);
    throw err;
  } finally {
    for (const f of tempFiles) {
      await fs.unlink(f).catch(() => {});
    }
  }
}
