import path from "node:path";
import fs from "node:fs/promises";
import { db } from "../db";
import { MixPlan } from "../mixing/types";
import { RenderJobPayload } from "../queue/render.queue";
import { storageService as storage } from "../storage";
import { renderMixAudio } from "../audio/ffmpeg-renderer";

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

  await db.mix.update({
    where: { id: mix.id },
    data: { status: "rendering" },
  });

  const tempDir = path.resolve(process.env.TMP_DIR ?? "./tmp");
  await fs.mkdir(tempDir, { recursive: true });

  const trackA = mix.tracks[0].track;
  const trackB = mix.tracks[1].track;

  const tempPathA = path.join(tempDir, `render-a-${trackA.id}.mp3`);
  const tempPathB = path.join(tempDir, `render-b-${trackB.id}.mp3`);
  const outputPath = path.join(tempDir, `render-out-${mix.id}.mp3`);

  try {
    // 1. Download original tracks
    await storage.downloadToFile(trackA.storageKey, tempPathA);
    await storage.downloadToFile(trackB.storageKey, tempPathB);

    // 2. Render the mix
    await renderMixAudio(tempPathA, tempPathB, outputPath, plan);

    // 3. Upload the final mix to storage
    const outputKey = `mixes/${mix.id}.mp3`;
    await storage.saveFile({
      key: outputKey,
      filePath: outputPath,
      contentType: "audio/mpeg",
    });

    // 4. Update DB
    await db.mix.update({
      where: { id: mix.id },
      data: {
        status: "completed",
        outputStorageKey: outputKey,
        renderError: null,
      },
    });

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
    // Clean up temp files
    await fs.unlink(tempPathA).catch(() => {});
    await fs.unlink(tempPathB).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
