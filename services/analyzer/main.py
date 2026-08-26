import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
import librosa
import numpy as np

app = FastAPI(title="AutoMix Analyzer")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "audio.bin")[1] or ".wav"
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name

            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        y, sr = librosa.load(
            tmp_path, sr=22050, mono=True
        )

        duration = float(len(y) / sr)

        tempo, beat_times = librosa.beat.beat_track(
            y=y,
            sr=sr,
            units="time"
        )

        bpm = float(np.asarray(tempo).flatten()[0])

        beats = [
            round(float(time), 3)
            for time in beat_times
        ]

        # Simple approximation
        # treat every 4th beat as a downbeat
        downbeats = beats[::4]

        return {
            "bpm" : round(bpm, 3),
            "durationSec": round(duration, 3),
            "beats": beats,
            "downbeats": downbeats,
            "source": "librosa"
        }

    except Exception as err:
        raise HTTPException(
            status_code=422,
            detail=f"Analysis failed: {str(err)}"
        )

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
