import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const api = axios.create({
    baseURL: API_URL,
});

export interface Track{
    id: string;
    originalFileName: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    durationSec: number | null;
    status: "uploaded" | "queued" | "analyzing" | "analyzed" | "failed";
    bpm: number | null;
    analysisJson: string | null;
    error: string | null;
    createdAt: string;
    url?: string;
}

export async function getTracks(): Promise<Track[]> {
    const res = await api.get("/api/tracks");
    return res.data.tracks;
}

export async function uploadTrack(file: File): Promise<Track>{
    const formData = new FormData();
    formData.append("file", file);

    const res = await api.post("/api/tracks/upload", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });

    return res.data.track;
}

// Mixes
export interface Mix {
    id: string;
    name: string;
    status: string;
    targetBpm: number | null;
    planJson: string | null;
    outputStorageKey: string | null;
    renderError: string | null;
    createdAt: string;
}

export async function createMix(): Promise<Mix> {
const res = await api.post("/api/mixes");
  return res.data.mix;
}

export async function addTrackToMix(mixId: string, trackId: string) {
  const res = await api.post(`/api/mixes/${mixId}/tracks`, { trackId });
  return res.data.mixTrack;
}

export async function generatePlan(mixId: string) {
  const res = await api.post(`/api/mixes/${mixId}/plan`);
  return res.data;
}

export async function triggerRender(mixId: string) {
  const res = await api.post(`/api/mixes/${mixId}/render`);
  return res.data;
}

export async function getMixAudioUrl(mixId: string): Promise<{ url: string; status: string }> {
  const res = await api.get(`/api/mixes/${mixId}/audio`);
  return res.data;
}
