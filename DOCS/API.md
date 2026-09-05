# AutoMix API Reference

Base URL: `http://localhost:4000` (development) or your production URL.

All endpoints return JSON. Errors include `{ "error": "description" }`.

---

## Tracks

### Upload Track

Upload an audio file for analysis.

```http
POST /api/tracks/upload
Content-Type: multipart/form-data
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Audio file (.mp3, .wav, .m4a), max 50MB |

**Response:** `201 Created`
```json
{
  "track": {
    "id": "clx1a2b3c0000...",
    "originalFileName": "song.mp3",
    "storageKey": "tracks/clx1a2b3c0000.mp3",
    "mimeType": "audio/mpeg",
    "sizeBytes": 6146644,
    "durationSec": 256.078,
    "status": "queued",
    "bpm": null,
    "musicalKey": null,
    "camelot": null,
    "url": "http://localhost:4000/files/tracks/clx1a2b3c0000.mp3"
  }
}
```

**Status Flow:** `uploaded` → `queued` → `analyzing` → `analyzed` (or `failed`)

---

### List Tracks

```http
GET /api/tracks
```

**Response:** `200 OK`
```json
{
  "tracks": [
    {
      "id": "clx1a2b3c0000...",
      "originalFileName": "song.mp3",
      "status": "analyzed",
      "bpm": 124.532,
      "durationSec": 256.078,
      "musicalKey": "A minor",
      "camelot": "8A",
      "keyMode": "minor",
      "keyConfidence": 0.847,
      "stemsStatus": "completed",
      "url": "http://localhost:4000/files/tracks/clx1a2b3c0000.mp3"
    }
  ]
}
```

---

### Get Track

```http
GET /api/tracks/:id
```

**Response:** `200 OK`
```json
{
  "track": {
    "id": "clx1a2b3c0000...",
    "originalFileName": "song.mp3",
    "status": "analyzed",
    "bpm": 124.532,
    "durationSec": 256.078,
    "musicalKey": "A minor",
    "camelot": "8A",
    "url": "http://localhost:4000/files/tracks/clx1a2b3c0000.mp3"
  }
}
```

---

### Get Track Status

Lightweight endpoint for polling analysis progress.

```http
GET /api/tracks/:id/status
```

**Response:** `200 OK`
```json
{
  "track": {
    "id": "clx1a2b3c0000...",
    "status": "analyzed",
    "bpm": 124.532,
    "error": null,
    "updatedAt": "2026-08-26T00:00:15.123Z"
  }
}
```

---

### Get Track Analysis

Returns beat grid, downbeats, and key data for waveform visualization.

```http
GET /api/tracks/:id/analysis
```

**Response:** `200 OK`
```json
{
  "trackId": "clx1a2b3c0000...",
  "bpm": 124.532,
  "durationSec": 256.078,
  "beats": [0.482, 0.967, 1.451, 1.936, ...],
  "downbeats": [0.482, 2.421, 4.36, ...],
  "source": "librosa"
}
```

---

### Trigger Stem Separation

Queues AI stem separation (vocals, drums, bass, other) using Demucs v4.

```http
POST /api/tracks/:id/stems
```

**Response:** `200 OK`
```json
{
  "message": "Stem separation queued",
  "trackId": "clx1a2b3c0000..."
}
```

---

### Get Stem URLs

Returns signed URLs for separated stems.

```http
GET /api/tracks/:id/stems
```

**Response (completed):** `200 OK`
```json
{
  "status": "completed",
  "stems": {
    "vocals": "https://s3.amazonaws.com/bucket/stems/id/vocals.wav?signed...",
    "drums": "https://s3.amazonaws.com/bucket/stems/id/drums.wav?signed...",
    "bass": "https://s3.amazonaws.com/bucket/stems/id/bass.wav?signed...",
    "other": "https://s3.amazonaws.com/bucket/stems/id/other.wav?signed..."
  }
}
```

**Response (in progress):** `200 OK`
```json
{
  "status": "processing",
  "error": null,
  "stems": null
}
```

---

### Re-analyze Track

Re-queues a track for analysis (useful after schema updates).

```http
POST /api/tracks/:id/reanalyze
```

**Response:** `200 OK`
```json
{
  "message": "Re-analysis queued",
  "trackId": "clx1a2b3c0000..."
}
```

---

## Mixes

### Create Mix

```http
POST /api/mixes
Content-Type: application/json
```

**Body (optional):**
```json
{
  "name": "My Mix"
}
```

**Response:** `201 Created`
```json
{
  "mix": {
    "id": "cly1a2b3c0000...",
    "name": "My Mix",
    "status": "planning",
    "targetBpm": null,
    "planJson": null,
    "outputStorageKey": null,
    "createdAt": "2026-08-26T00:00:00.000Z"
  }
}
```

---

### Add Track to Mix

```http
POST /api/mixes/:mixId/tracks
Content-Type: application/json
```

**Body:**
```json
{
  "trackId": "clx1a2b3c0000..."
}
```

**Response:** `201 Created`
```json
{
  "mixTrack": {
    "id": "clz1a2b3c0000...",
    "mixId": "cly1a2b3c0000...",
    "trackId": "clx1a2b3c0000...",
    "order": 1
  }
}
```

---

### Remove Track from Mix

```http
DELETE /api/mixes/:mixId/tracks/:trackId
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Get Mix with Tracks

```http
GET /api/mixes/:mixId
```

**Response:** `200 OK`
```json
{
  "mix": {
    "id": "cly1a2b3c0000...",
    "name": "My Mix",
    "status": "planned",
    "targetBpm": 124.532,
    "tracks": [
      {
        "id": "clz1a2b3c0000...",
        "order": 1,
        "track": {
          "id": "clx1a2b3c0000...",
          "originalFileName": "song-a.mp3",
          "bpm": 124.532,
          "camelot": "8A"
        }
      },
      {
        "id": "clz1a2b3c0001...",
        "order": 2,
        "track": {
          "id": "clx1a2b3c0001...",
          "originalFileName": "song-b.mp3",
          "bpm": 128.100,
          "camelot": "9A"
        }
      }
    ]
  }
}
```

---

### Generate Mix Plan

Calculates beat-matched transitions for all tracks in the mix.

```http
POST /api/mixes/:mixId/plan
Content-Type: application/json
```

**Body (optional):**
```json
{
  "cuePoints": {
    "clx1a2b3c0000...": { "entry": 0, "exit": 240.5 },
    "clx1a2b3c0001...": { "entry": 8.2, "exit": null }
  }
}
```

**Response:** `200 OK`
```json
{
  "mix": {
    "id": "cly1a2b3c0000...",
    "status": "planned",
    "targetBpm": 124.532
  },
  "plan": {
    "transitionBeats": 16,
    "transitionSeconds": 7.708,
    "totalDurationSec": 412.5,
    "segments": [
      {
        "trackId": "clx1a2b3c0000...",
        "type": "outgoing",
        "playFromSec": 0,
        "playToSec": 256.078,
        "splitPointSec": 240.5,
        "outroStretchRatio": 1.029,
        "entryPointSec": 0,
        "masterStartSec": 0,
        "fadeOutStartSec": 244.2,
        "fadeOutEndSec": 251.9
      },
      {
        "trackId": "clx1a2b3c0001...",
        "type": "incoming",
        "playFromSec": 8.2,
        "playToSec": 220.1,
        "splitPointSec": 220.1,
        "outroStretchRatio": 1.0,
        "entryPointSec": 8.2,
        "masterStartSec": 244.2,
        "fadeInStartSec": 244.2,
        "fadeInEndSec": 251.9
      }
    ]
  }
}
```

---

### Trigger Render

Queues FFmpeg rendering of the planned mix.

```http
POST /api/mixes/:mixId/render
```

**Response:** `200 OK`
```json
{
  "message": "Rendering queued",
  "mixId": "cly1a2b3c0000..."
}
```

---

### Get Rendered Audio URL

```http
GET /api/mixes/:mixId/audio
```

**Response (completed):** `200 OK`
```json
{
  "url": "https://s3.amazonaws.com/bucket/mixes/cly1a2b3c0000.mp3?signed...",
  "status": "completed"
}
```

**Response (not ready):** `404 Not Found`
```json
{
  "error": "Rendered audio not found or still processing."
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `400` | Bad request (missing fields, invalid state) |
| `404` | Resource not found |
| `413` | File too large (>50MB) |
| `415` | Unsupported file type |
| `422` | Analysis failed (Python analyzer error) |
| `500` | Internal server error |
```
