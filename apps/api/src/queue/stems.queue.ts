import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";

export const STEMS_QUEUE = "stem-separation";

export type StemsJobPayload = {
  trackId: string;
};

export const stemsQueue = new Queue(STEMS_QUEUE, {
  connection: createRedisConnection(),
});

export async function queueStemSeparation(trackId: string) {
  await stemsQueue.add(
    "separate-stems",
    { trackId },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
}
