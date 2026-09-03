import fs from "node:fs";                    
import fsp from "node:fs/promises";       
import path from "node:path";
import axios from "axios";
import FormData from "form-data";
import { db } from "../db";
import { storageService as storage } from "../storage";
import type { StemsJobPayload } from "../queue/stems.queue";

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://localhost:8000";

interface StemPaths {
  vocals: string;
  drums: string;
  bass: string;
  other: string;
}

export async function separateStemsProcessor(payload: StemsJobPayload) {
  const { trackId } = payload;

  const track = await db.track.findUnique({ where: { id: trackId } });
  if (!track) throw new Error(`Track not found: ${trackId}`);

  await db.track.update({
    where: { id: trackId },
    data: { stemsStatus: "processing" },
  });

  const tempDir = path.resolve(process.env.TMP_DIR ?? "./tmp");
  await fsp.mkdir(tempDir, { recursive: true });

  const tempInputPath = path.join(tempDir, `stems-in-${trackId}.mp3`);
  const stemTempPaths: Record<string, string> = {};

  try {
    // 1. Download original track
    console.log(`📥 Downloading track for stem separation: ${trackId}`);
    await storage.downloadToFile(track.storageKey, tempInputPath);

    // 2. Send to Python separator
    console.log(`🎵 Sending to Demucs separator...`);
    const form = new FormData();
    form.append("file", fs.createReadStream(tempInputPath), {   // ← FIXED
      filename: path.basename(tempInputPath),
    });

    const response = await axios.post<{ stems: StemPaths }>(
      `${ANALYZER_URL}/separate`,
      form,
      {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 600000,
      }
    );

    const stemPaths = response.data.stems;

    // 3. Upload each stem to storage
    const stemKeys: Record<string, string> = {};
    const stemNames = ["vocals", "drums", "bass", "other"] as const;

    for (const stemName of stemNames) {
      const localPath = stemPaths[stemName];
      const storageKey = `stems/${trackId}/${stemName}.wav`;

      console.log(`  Uploading ${stemName} stem...`);
      await storage.saveFile({
        key: storageKey,
        filePath: localPath,
        contentType: "audio/wav",
      });

      stemKeys[stemName] = storageKey;
      stemTempPaths[stemName] = localPath;
    }

    // 4. Update database
    await db.track.update({
      where: { id: trackId },
      data: {
        stemsStatus: "completed",
        stemsVocalsKey: stemKeys.vocals,
        stemsDrumsKey: stemKeys.drums,
        stemsBassKey: stemKeys.bass,
        stemsOtherKey: stemKeys.other,
        stemsError: null,
      },
    });

    console.log(`✅ Stems separated and uploaded for ${trackId}`);
    return { trackId, stems: stemKeys };

  } catch (error) {
    console.error("❌ Stem separation error:", error);

    await db.track.update({
      where: { id: trackId },
      data: {
        stemsStatus: "failed",
        stemsError: error instanceof Error ? error.message : "Stem separation failed",
      },
    });

    throw error;
  } finally {
    // Clean up all temp files
    await fsp.unlink(tempInputPath).catch(() => {});
    for (const stemPath of Object.values(stemTempPaths)) {
      await fsp.unlink(stemPath).catch(() => {});
    }
  }
}