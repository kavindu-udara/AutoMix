import { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { storageService as storage } from "../storage";
import { db } from "../db";
import { queueTrackAnalysis } from "../queue/analysis.queue";

const TMP_DIR = path.resolve(process.env.TMP_DIR ?? "./tmp");

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
]);

const ALLOWED_EXTENSIONS = new Set([".mp3", ".wav", ".m4a"]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const trackRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/tracks/upload", async (req, reply) => {
    let tempPath: string | null = null;

    try {
      if (!req.isMultipart()) {
        return reply.code(400).send({
          error: "Request must be multipart/form-data",
        });
      }

      const file = await req.file();

      if (!file) {
        return reply.code(400).send({
          error: 'No file uploaded. Expected field name "file".',
        });
      }

      const originalFileName = file.filename ?? "unknown";
      const ext = path.extname(originalFileName).toLowerCase();

      const isAllowedMime = ALLOWED_MIME_TYPES.has(file.mimetype);
      const isAllowedExtension = ALLOWED_EXTENSIONS.has(ext);

      if (!isAllowedMime || !isAllowedExtension) {
        return reply.code(415).send({
          error:
            "Unsupported file type. Please upload .mp3, .wav, or .m4a audio.",
        });
      }

      await fs.mkdir(TMP_DIR, {
        recursive: true,
      });

      const id = crypto.randomUUID();
      const safeTempName = `${id}${ext}`;

      tempPath = path.join(TMP_DIR, safeTempName);

      await pipeline(file.file, createWriteStream(tempPath));

      if (file.file.truncated) {
        await fs.unlink(tempPath).catch(() => {});

        return reply.code(413).send({
          error: "File too large.",
        });
      }

      const stats = await fs.stat(tempPath);

      if (stats.size > MAX_FILE_SIZE_BYTES) {
        await fs.unlink(tempPath).catch(() => {});

        return reply.code(413).send({
          error: "File too large.",
        });
      }

      let durationSec: number | null = null;

      try {
        const { parseFile } = await import("music-metadata");

        const metadata = await parseFile(tempPath);

        durationSec = metadata.format.duration ?? null;
      } catch (err) {
        req.log.warn(err, "Failed to extract audio metadata");
      }

      const storageKey = `tracks/${id}${ext}`;

      await storage.saveFile({
        key: storageKey,
        filePath: tempPath,
        contentType: file.mimetype,
      });

      await fs.unlink(tempPath).catch(() => {});
      tempPath = null;

      const track = await db.track.create({
        data: {
          id,
          originalFileName,
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: stats.size,
          durationSec,
          status: "uploaded",
        },
      });

      try {
        await db.track.update({
          where: {
            id: track.id,
          },
          data: {
            status: "queued",
            updatedAt: new Date(),
          },
        });

        await queueTrackAnalysis(track.id);
      } catch (err) {
        await db.track.update({
          where: {
            id: track.id,
          },
          data: {
            status: "failed",
            error: "Failed to queue analysis job",
            updatedAt: new Date(),
          },
        });

        throw err;
      }

      const url = await storage.getSignedUrl(storageKey, 3600);

      const savedTrack = await db.track.findUniqueOrThrow({
        where: {
          id: track.id,
        },
      });

      return reply.code(201).send({
        track: {
          ...savedTrack,
          url,
        },
      });
    } catch (err) {
      if (tempPath) {
        await fs.unlink(tempPath).catch(() => {});
      }

      req.log.error(err);

      return reply.code(500).send({
        error: "Upload failed",
      });
    }
  });

  app.get("/api/tracks", async () => {
    const tracks = await db.track.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    const tracksWithUrl = await Promise.all(
      tracks.map(async (track) => {
        const url = await storage.getSignedUrl(track.storageKey, 3600);

        return {
          ...track,
          url,
        };
      }),
    );

    return {
      tracks: tracksWithUrl,
    };
  });

  app.get("/api/tracks/:id", async (req, reply) => {
    const params = req.params as {
      id: string;
    };

    const track = await db.track.findUnique({
      where: {
        id: params.id,
      },
    });

    if (!track) {
      return reply.code(404).send({
        error: "Track not found",
      });
    }

    const url = await storage.getSignedUrl(track.storageKey, 3600);

    return {
      track: {
        ...track,
        url,
      },
    };
  });

  app.get("/api/tracks/:id/status", async (req, reply) => {
    const params = req.params as {
      id: string;
    };

    const track = await db.track.findUnique({
      where: {
        id: params.id,
      },
      select: {
        id: true,
        status: true,
        bpm: true,
        error: true,
        updatedAt: true,
      },
    });

    if (!track) {
      return reply.code(404).send({
        error: "Track not found",
      });
    }

    return {
      track,
    };
  });

  app.get("/api/tracks/:id/analysis", async (req, reply) => {
    const params = req.params as { id: string };

    const track = await db.track.findUnique({
      where: { id: params.id },
    });

    if (!track) {
      return reply.code(404).send({ error: "Track not found" });
    }

    if (!track.analysisJson) {
      return reply.code(404).send({ error: "Track not analyzed yet" });
    }

    const analysis = JSON.parse(track.analysisJson);

    return {
      trackId: track.id,
      bpm: track.bpm,
      durationSec: track.durationSec,
      beats: analysis.beats ?? [],
      downbeats: analysis.downbeats ?? [],
      source: analysis.source ?? "unknown",
    };
  });

  app.post("/api/tracks/:id/reanalyze", async (req, reply) => {
    const params = req.params as { id: string };

    const track = await db.track.findUnique({ where: { id: params.id } });
    if (!track) return reply.code(404).send({ error: "Track not found" });

    await db.track.update({
      where: { id: params.id },
      data: { status: "queued", error: null, updatedAt: new Date() },
    });

    await queueTrackAnalysis(params.id);

    return { message: "Re-analysis queued", trackId: params.id };
  });
  
};
