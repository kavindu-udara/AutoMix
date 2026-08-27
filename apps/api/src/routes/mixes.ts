import { FastifyPluginAsync } from "fastify";
import { db } from "../db";
import { createMultiTrackMixPlan } from "../mixing/planner";
import { queueMixRendering } from "../queue/render.queue";
import { storageService as storage } from "../storage";

export const mixRoutes: FastifyPluginAsync = async (app) => {
  // 1. Create a new mix
  app.post("/api/mixes", async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string };

    const mix = await db.mix.create({
      data: {
        name: body.name ?? "Untitled Mix",
      },
    });

    return reply.code(201).send({ mix });
  });

  // 2. Add a track to the mix
  app.post("/api/mixes/:mixId/tracks", async (req, reply) => {
    const { mixId } = req.params as { mixId: string };
    const { trackId } = req.body as { trackId: string };

    const lastTrack = await db.mixTrack.findFirst({
      where: { mixId },
      orderBy: { order: "desc" },
    });

    const nextOrder = lastTrack ? lastTrack.order + 1 : 1;

    const mixTrack = await db.mixTrack.create({
      data: {
        mixId,
        trackId,
        order: nextOrder,
      },
    });

    return reply.code(201).send({ mixTrack });
  });

  // 3. Remove a track from the mix
  app.delete("/api/mixes/:mixId/tracks/:trackId", async (req, reply) => {
    const { mixId, trackId } = req.params as {
      mixId: string;
      trackId: string;
    };

    await db.mixTrack.deleteMany({
      where: { mixId, trackId },
    });

    // Re-order remaining tracks
    const remaining = await db.mixTrack.findMany({
      where: { mixId },
      orderBy: { order: "asc" },
    });

    for (let i = 0; i < remaining.length; i++) {
      await db.mixTrack.update({
        where: { id: remaining[i].id },
        data: { order: i + 1 },
      });
    }

    return { success: true };
  });

  // 4. Get mix with tracks
  app.get("/api/mixes/:mixId", async (req, reply) => {
    const { mixId } = req.params as { mixId: string };

    const mix = await db.mix.findUnique({
      where: { id: mixId },
      include: {
        tracks: {
          orderBy: { order: "asc" },
          include: { track: true },
        },
      },
    });

    if (!mix) {
      return reply.code(404).send({ error: "Mix not found" });
    }

    return { mix };
  });

  // 5. Generate the mix plan (supports N tracks)
  app.post("/api/mixes/:mixId/plan", async (req, reply) => {
    const { mixId } = req.params as { mixId: string };

    const mixTracks = await db.mixTrack.findMany({
      where: { mixId },
      orderBy: { order: "asc" },
      include: { track: true },
    });

    if (mixTracks.length < 2) {
      return reply.code(400).send({
        error: "Need at least 2 tracks to generate a plan.",
      });
    }

    // Verify all tracks are analyzed
    for (const mt of mixTracks) {
      if (!mt.track.analysisJson || !mt.track.bpm || !mt.track.durationSec) {
        return reply.code(400).send({
          error: `Track "${mt.track.originalFileName}" is not fully analyzed yet.`,
        });
      }
    }

    // Build analysis array for the planner
    const analyses = mixTracks.map((mt) => {
      const parsed = JSON.parse(mt.track.analysisJson!);
      return {
        id: mt.track.id,
        durationSec: mt.track.durationSec!,
        bpm: mt.track.bpm!,
        beats: parsed.beats ?? [],
        downbeats: parsed.downbeats ?? [],
      };
    });

    const plan = createMultiTrackMixPlan(analyses);

    const updatedMix = await db.mix.update({
      where: { id: mixId },
      data: {
        status: "planned",
        targetBpm: plan.targetBpm,
        planJson: JSON.stringify(plan),
      },
    });

    return { mix: updatedMix, plan };
  });

  // 6. Trigger rendering
  app.post("/api/mixes/:mixId/render", async (req, reply) => {
    const { mixId } = req.params as { mixId: string };

    const mix = await db.mix.findUnique({ where: { id: mixId } });

    if (!mix || mix.status !== "planned") {
      return reply.code(400).send({
        error: "Mix must be in 'planned' status to render.",
      });
    }

    await queueMixRendering(mixId);

    return { message: "Rendering queued", mixId };
  });

  // 7. Get rendered audio URL
  app.get("/api/mixes/:mixId/audio", async (req, reply) => {
    const { mixId } = req.params as { mixId: string };

    const mix = await db.mix.findUnique({ where: { id: mixId } });

    if (!mix || !mix.outputStorageKey) {
      return reply.code(404).send({
        error: "Rendered audio not found or still processing.",
      });
    }

    const url = await storage.getSignedUrl(mix.outputStorageKey, 3600);

    return { url, status: mix.status };
  });
};
