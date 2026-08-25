import "dotenv/config";
import { Worker } from "bullmq";
import { ANALYSIS_QUEUE, type AnalysisJobPayload } from "./queue/analysis.queue";
import { createRedisConnection } from "./queue/connection";
import { analyzeTrackProcessor } from "./workers/analyze-track";

const worker = new Worker(
    ANALYSIS_QUEUE,
    async (job) => {
        if(job.name ==  "analyze-track"){
            return analyzeTrackProcessor(
                job.data as AnalysisJobPayload
            );
        }

        throw new Error(`Unknown job name: ${job.name}`);
    },
    {
        connection: createRedisConnection(),
        concurrency: 1,
    }
);

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully.`);
});

worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed with error: ${err.message}`);
    console.error(err);
});

console.log("Analysis worker started");
