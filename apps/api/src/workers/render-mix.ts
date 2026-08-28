import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { storageService as storage } from "../storage";
import { renderMixAudio } from "../audio/ffmpeg-renderer";
import type { MixPlan } from "../mixing/types";
import type { RenderJobPayload } from "../queue/render.queue";

export async function renderMixProcessor(payload: RenderJobPayload) {
  const mix = await db.mix.findUnique({
    where: { id: payload.mixId },
    include: {
      tracks: {
        orderBy: { order: "asc" },
        include: { track: true },
      },
    },
  });

  if (!mix || !mix.planJson) {
    throw new Error("Mix or plan not found");
  }

  const plan: MixPlan = JSON.parse(mix.planJson);
  const mixTracks = mix.tracks;

  if (mixTracks.length !== plan.segments.length) {
    throw new Error(
      `Track count (${mixTracks.length}) does not match plan segments (${plan.segments.length})`,
    );
  }

  await db.mix.update({
    where: { id: mix.id },
    data: { status: "rendering" },
  });

  const tempDir = path.resolve(process.env.TMP_DIR ?? "./tmp");
  await fs.mkdir(tempDir, { recursive: true });

  // Download all tracks
  const tempPaths: string[] = [];

  try {
    for (let i = 0; i < mixTracks.length; i++) {
      const track = mixTracks[i].track;
      const ext = path.extname(track.storageKey) || ".mp3";
      const tempPath = path.join(tempDir, `render-${mix.id}-${i}${ext}`);

      await storage.downloadToFile(track.storageKey, tempPath);
      tempPaths.push(tempPath);
    }

    // Render
    const outputPath = path.join(tempDir, `render-out-${mix.id}.mp3`);
    await renderMixAudio(tempPaths, outputPath, plan);

    // Upload result
    const outputKey = `mixes/${mix.id}.mp3`;
    await storage.saveFile({
      key: outputKey,
      filePath: outputPath,
      contentType: "audio/mpeg",
    });

    await db.mix.update({
      where: { id: mix.id },
      data: {
        status: "completed",
        outputStorageKey: outputKey,
        renderError: null,
      },
    });

    // Clean up output file
    await fs.unlink(outputPath).catch(() => {});

    return { mixId: mix.id, outputKey };
  } catch (error) {
    console.error("Render error:", error);

    await db.mix.update({
      where: { id: mix.id },
      data: {
        status: "failed",
        renderError: error instanceof Error ? error.message : "Render failed",
      },
    });

    throw error;
  } finally {
    // Clean up all temp input files
    for (const tempPath of tempPaths) {
      await fs.unlink(tempPath).catch(() => {});
    }
  }
}
