import fs from "node:fs/promises";
import path from "node:path";

import { db } from "../db";
import { storageService as storage } from "../storage/index";
import { analyzeAudioFile } from "../analysis/analyzer-client";
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

    const analysis = await analyzeAudioFile(tempAudioPath);

    await db.track.update({
      where: { id: track.id },
      data: {
        status: "analyzed",
        bpm: analysis.bpm,
        durationSec: analysis.durationSec ?? track.durationSec,
        analysisJson: JSON.stringify(analysis),
        musicalKey: analysis.key ?? null,
        camelot: analysis.camelot ?? null,
        keyMode: analysis.mode ?? null,
        keyConfidence: analysis.keyConfidence ?? null,
        error: null,
        updatedAt: new Date(),
      },
    });

    return {
      trackId: track.id,
      bpm: analysis.bpm,
    };
  } catch (error) {
    console.error("analysis error:", error);

    await db.track.update({
      where: {
        id: track.id,
      },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Analysis failed",
        updatedAt: new Date(),
      },
    });

    throw error; // 👈 Throw the same variable
  } finally {
    await fs.unlink(tempAudioPath).catch(() => {});
  }
}
