import os
import tempfile
from fastapi import FastAPI, File, HTTPException, UploadFile
import librosa
import numpy as np
import torch
import torchaudio
from pathlib import Path

app = FastAPI(title="AutoMix Analyzer")

# ── Camelot key mapping
# Maps chroma index (0=C, 1=C#, ... 11=B) to Camelot notation
MINOR_CAMELOT = {
    0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A",
    6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A",
}

MAJOR_CAMELOT = {
    0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
    6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B",
}

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def detect_key(y, sr):
    """
    Detect musical key using chroma features and Krumhansl-Schmuckler profile.
    Returns (key_name, camelot, mode, confidence).
    """
    # Compute chroma features
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)

    # Krumhansl-Schmuckler key profiles
    major_profile = np.array([
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
        2.52, 5.19, 2.39, 3.66, 2.29, 2.88
    ])
    minor_profile = np.array([
        6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
        2.54, 4.75, 3.98, 2.69, 3.34, 3.17
    ])

    # Correlate with all 12 rotations
    best_major_score = -1
    best_major_key = 0
    best_minor_score = -1
    best_minor_key = 0

    for shift in range(12):
        rotated_major = np.roll(major_profile, shift)
        rotated_minor = np.roll(minor_profile, shift)

        major_corr = np.corrcoef(chroma_mean, rotated_major)[0, 1]
        minor_corr = np.corrcoef(chroma_mean, rotated_minor)[0, 1]

        if major_corr > best_major_score:
            best_major_score = major_corr
            best_major_key = shift

        if minor_corr > best_minor_score:
            best_minor_score = minor_corr
            best_minor_key = shift

    # Pick the better match
    if best_major_score >= best_minor_score:
        mode = "major"
        pitch_class = best_major_key
        confidence = best_major_score
        camelot = MAJOR_CAMELOT[pitch_class]
    else:
        mode = "minor"
        pitch_class = best_minor_key
        confidence = best_minor_score
        camelot = MINOR_CAMELOT[pitch_class]

    key_name = KEY_NAMES[pitch_class]

    return {
        "key": f"{key_name} {mode}",
        "camelot": camelot,
        "mode": mode,
        "pitchClass": pitch_class,
        "confidence": round(float(confidence), 3),
    }


@app.get("/health")
def health():
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

        y, sr = librosa.load(tmp_path, sr=22050, mono=True)
        duration = float(len(y) / sr)

        # Beat tracking
        tempo, beat_times = librosa.beat.beat_track(y=y, sr=sr, units="time")
        bpm = float(np.asarray(tempo).flatten()[0])
        beats = [round(float(t), 3) for t in beat_times]
        downbeats = beats[::4]

        # ── Key detection ──────────────────────────────
        key_info = detect_key(y, sr)

        return {
            "bpm": round(bpm, 3),
            "durationSec": round(duration, 3),
            "beats": beats,
            "downbeats": downbeats,
            "key": key_info["key"],
            "camelot": key_info["camelot"],
            "mode": key_info["mode"],
            "pitchClass": key_info["pitchClass"],
            "keyConfidence": key_info["confidence"],
            "source": "librosa",
        }

    except Exception as err:
        raise HTTPException(status_code=422, detail=f"Analysis failed: {str(err)}")

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/separate")
async def separate_stems(file: UploadFile = File(...)):
    """
    Separate audio into 4 stems: vocals, drums, bass, other.
    Returns paths to each stem WAV file.
    """
    suffix = os.path.splitext(file.filename or "audio.bin")[1] or ".wav"
    tmp_path = None
    output_dir = None

    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        # Create output directory
        output_dir = tempfile.mkdtemp(prefix="stems_")

        # Determine device
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

        print(f"🎵 Running Demucs on {device}...")

        # Load model (htdemucs = Hybrid Transformer Demucs v4)
        # First run downloads the model (~80MB), subsequent runs are cached
        from demucs.pretrained import get_model
        from demucs.apply import apply_model

        model = get_model("htdemucs")
        model.to(device)
        model.eval()

        # Load audio
        wav, sr = torchaudio.load(tmp_path)

        # Resample to model's expected rate (44100 Hz)
        if sr != model.samplerate:
            resampler = torchaudio.transforms.Resample(sr, model.samplerate)
            wav = resampler(wav)
            sr = model.samplerate

        # Ensure stereo
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)

        # Add batch dimension: (channels, samples) → (1, channels, samples)
        wav = wav.unsqueeze(0).to(device)

        # Run separation
        with torch.no_grad():
            sources = apply_model(model, wav, device=device, progress=True)

        # sources shape: (1, num_sources, channels, samples)
        # htdemucs sources: drums, bass, other, vocals
        source_names = model.sources  # ['drums', 'bass', 'other', 'vocals']

        result = {}
        for i, name in enumerate(source_names):
            stem_wav = sources[0, i].cpu()
            stem_path = os.path.join(output_dir, f"{name}.wav")
            torchaudio.save(stem_path, stem_wav, sr)
            result[name] = stem_path

        print(f"✅ Stems separated: {list(result.keys())}")

        return {
            "stems": {
                name: path
                for name, path in result.items()
            },
            "sampleRate": sr,
            "device": device,
        }

    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Stem separation failed: {str(err)}")

    finally:
        # Clean up input file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        # Note: stem files are cleaned up by the worker after upload
