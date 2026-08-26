import fs from "node:fs";
import path from "node:path";
import FormData from "form-data";
import axios from "axios";

export interface AnalyzerResult {
    bpm: number;
    durationSec: number;
    beats: number[];
    downbeats: number[];
    source: string;
}

export async function analyzeAudioFile(filePath: string) : Promise<AnalyzerResult>{
    const analyzeUrl = process.env.ANALYZER_URL ?? "http://localhost:8000";

    const form = new FormData();

    form.append("file", 
        fs.createReadStream(filePath), {
        filename: path.basename(filePath),
    });

    const response = await axios.post<AnalyzerResult>(
        `${analyzeUrl}/analyze`,
        form,
        {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 120000, // 2 minutes
        }
    );

    return response.data;

}

