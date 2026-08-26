import { FastifyPluginAsync } from "fastify";
import { db } from "../db";
import { createMixPlan } from "../mixing/planner";
import { queueMixRendering } from "../queue/render.queue";
import { storageService as storage } from "../storage";

export const mixRoutes: FastifyPluginAsync = async (app) => {
  // 1. Create a new mix
  app.post("/api/mixes", async (req, reply) => {
    const mix = await db.mix.create({
      data: {
        name: "My Automix",
      },
    });

    return reply.code(201).send({ mix });
  });

  // 2. Add a track to the mix
  app.post("/api/mixes/:mixId/tracks", async (req, reply) => {
    const { mixId } = req.params as { mixId: string };
    const { trackId } = req.body as { trackId: string };

    // Find current max order
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

  // 3. Generate the Mix Plan
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

    // For MVP, we only plan the transition between the first two tracks
    const trackAData = mixTracks[0].track;
    const trackBData = mixTracks[1].track;

    if (
      !trackAData.analysisJson ||
      !trackBData.analysisJson ||
      !trackAData.bpm ||
      !trackBData.bpm ||
      !trackAData.durationSec ||
      !trackBData.durationSec
    ) {
      return reply.code(400).send({
        error: "Both tracks must be fully analyzed before planning.",
      });
    }

    const analysisA = JSON.parse(trackAData.analysisJson);
    const analysisB = JSON.parse(trackBData.analysisJson);

    const plan = createMixPlan(
      {
        id: trackAData.id,
        durationSec: trackAData.durationSec,
        bpm: trackAData.bpm,
        beats: analysisA.beats,
        downbeats: analysisA.downbeats,
      },
      {
        id: trackBData.id,
        durationSec: trackBData.durationSec,
        bpm: trackBData.bpm,
        beats: analysisB.beats,
        downbeats: analysisB.downbeats,
      },
    );

    // Save the plan to the database
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


    // 4. Trigger Rendering
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

    // 5. Get Rendered Audio URL
    app.get("/api/mixes/:mixId/audio", async (req, reply) => {
      const { mixId } = req.params as { mixId: string };

      const mix = await db.mix.findUnique({ where: { id: mixId } });
      if (!mix || !mix.outputStorageKey) {
        return reply
          .code(404)
          .send({ error: "Rendered audio not found or still processing." });
      }

      const url = await storage.getSignedUrl(mix.outputStorageKey, 3600);
      return { url, status: mix.status };
    });
};
