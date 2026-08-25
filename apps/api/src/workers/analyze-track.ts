import fs from "node:fs/promises";
import path from "node:path";

import { db } from "../db";
import { storage } from "../storage";
import { runStabAnalysis } from "../analysis/stub";
import type { AnalysisJobPayload } from "../queue/analysis.queue";

export async function analyzeTrackProcessor(payload: AnalysisJobPayload) {
  const track = await db.track.findUnique({
    where: {
      id: payload.trackId,
    },
  });

  if (!track) {
    throw new Error(`Track not found with id: ${payload.trackId}`);
  }

  await db.track.update({
    where: {
      id: track.id,
    },
    data: {
      status: "analyzing",
      updatedAt: new Date(),
    },
  });

  const tempDir = path.resolve(process.env.TMP_DIR ?? "./tmp");
  await fs.mkdir(tempDir, {
    recursive: true,
  });

  const ext = path.extname(track.storageKey) || ".tmp";
  const tempAudioPath = path.join(tempDir, `analysis-${track.id}${ext}`);

  try {
    await storage.downloadToFile(track.storageKey, tempAudioPath);

    const analysis = await runStubAnalysis({
      filePath: tempAudioPath,
      durationSec: track.durationSec,
    });

    await db.track.update({
      where: {
        id: track.id,
      },
      data: {
        status: "analyzed",
        bpm: analysis.bpm,
        analysisJson: JSON.stringify(analysis),
        error: null,
        updatedAt: new Date(),
      },
    });

    return {
      trackId: track.id,
      bpm: analysis.bpm,
    };
  } catch (error) {
    await db.track.update({
      where: {
        id: track.id,
      },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Analysis failed",
        updatedAt: new Date(),
      },
    });

    throw err;
  } finally {
    await fs.unlink(tempAudioPath).catch(() => {});
  }
}
