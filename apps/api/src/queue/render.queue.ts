import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";

export const RENDER_QUEUE = "mix-render";

export type RenderJobPayload = {
  mixId: string;
};

export const renderQueue = new Queue(RENDER_QUEUE, {
  connection: createRedisConnection(),
});

export async function queueMixRendering(mixId: string) {
  await renderQueue.add(
    "render-mix",
    { mixId },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
}
