import "dotenv/config";
import { Worker } from "bullmq";

import {
  ANALYSIS_QUEUE,
  type AnalysisJobPayload,
} from "./queue/analysis.queue";
import {
  RENDER_QUEUE,
  type RenderJobPayload,
} from "./queue/render.queue";
import { createRedisConnection } from "./queue/connection";
import { analyzeTrackProcessor } from "./workers/analyze-track";
import { renderMixProcessor } from "./workers/render-mix";
import { separateStemsProcessor } from "./workers/separate-stems";
import { STEMS_QUEUE, StemsJobPayload } from "./queue/stems.queue";

const connection = createRedisConnection();

// 1. Analysis Worker
const analysisWorker = new Worker(
  ANALYSIS_QUEUE,
  async (job) => {
    if (job.name === "analyze-track") {
      return analyzeTrackProcessor(job.data as AnalysisJobPayload);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 1 }
);

// 2. Render Worker
const renderWorker = new Worker(
  RENDER_QUEUE,
  async (job) => {
    if (job.name === "render-mix") {
      return renderMixProcessor(job.data as RenderJobPayload);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 1 } // Rendering is CPU heavy, keep concurrency at 1!
);

// 3. Stems Worker
const stemsWorker = new Worker(
  STEMS_QUEUE,
  async (job) => {
    if (job.name === "separate-stems") {
      return separateStemsProcessor(job.data as StemsJobPayload);
    }
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection, concurrency: 1 } // Keep concurrency at 1 — Demucs is memory-heavy
);

analysisWorker.on("completed", (job) => console.log(`✅ Analysis completed: ${job.id}`));
analysisWorker.on("failed", (job, err) => console.error(`❌ Analysis failed: ${job?.id}`, err));

renderWorker.on("completed", (job) => console.log(`✅ Render completed: ${job.id}`));
renderWorker.on("failed", (job, err) => console.error(`❌ Render failed: ${job?.id}`, err));

stemsWorker.on("completed", (job) => console.log(`✅ Stems completed: ${job.id}`));
stemsWorker.on("failed", (job, err) => console.error(`❌ Stems failed: ${job?.id}`, err));

console.log("🎧 Workers started (Analysis & Render)");