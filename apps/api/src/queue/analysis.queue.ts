import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";

export const ANALYSIS_QUEUE = "track-analysis";

export type AnalysisJobPayload = {
    trackId: string;
}

export const analysisQueue = new Queue(ANALYSIS_QUEUE, {
    connection: createRedisConnection(),
});

export async function queueTrackAnalysis(trackId: string){
    await analysisQueue.add("analyze-track", { trackId }, {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 2000, // 2 sec
        },
        removeOnComplete: 100,
        removeOnFail: 100,
    });
}
