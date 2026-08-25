export interface StubTrackAnalysis {
    bpm: number;
    beats: number[];
    downbeats: number[];
    source: "stub";
}

interface StubAnalysisInput {
    filePath: string;
    durationSec: number | null;
}

export async function runStabAnalysis(input: StubAnalysisInput): Promise<StubTrackAnalysis>{
    const duration = input.durationSec ?? 180;

    const bpm = 120;
    const secondsPerBeat = 60 / bpm;

    const beats: number[] = [];

    for(let time=0; time < duration; time += secondsPerBeat){
        beats.push(Number(time.toFixed(3)));
    }

    const downbeats = beats.filter((_, index) => index % 4 === 0);

    return {
        bpm,
        beats,
        downbeats,
        source: "stub",
    };

}
