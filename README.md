# AutoMix 🎧 | AI-Powered DJ Mix Generator

AutoMix is a full-stack web application that automatically generates seamless, beat-matched, and harmonically aligned DJ mixes from user-uploaded audio files. 

It combines advanced audio analysis (Librosa), AI stem separation (Meta's Demucs), and real-time Web Audio processing with FFmpeg rendering to create professional-grade transitions.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Fastify](https://img.shields.io/badge/Fastify-5-green)
![Python](https://img.shields.io/badge/Python-3.12-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## ✨ Features

- **🎵 Intelligent Transition Planning:** Calculates beat-matched transitions using an "Apple Music-style" algorithm where the outgoing track's outro gradually tempo-shifts to match the incoming track.
- **🎛️ AI Stem Separation:** Isolates Vocals, Drums, Bass, and Instruments using Meta's Demucs v4 (Hybrid Transformer) for advanced mashups andacapella/instrumental mixing.
- **🎼 Harmonic Mixing:** Detects musical keys using the Krumhansl-Schmuckler algorithm and maps them to the Camelot Wheel to ensure harmonically compatible transitions.
- **⚡ Real-Time Web Audio Preview:** Instantly preview the generated mix plan in the browser using the Web Audio API—no waiting for FFmpeg to render.
- **🌊 Interactive Waveforms:** Visualize audio with WaveSurfer.js, featuring beat/downbeat markers and draggable, snap-to-beat cue points.
- **🎬 FFmpeg Multi-Track Rendering:** Chains N-tracks together using complex FFmpeg filtergraphs for high-quality MP3 export.
- **☁️ Cloud-Native Architecture:** Fully containerized with Docker, backed by AWS S3 for object storage, and powered by asynchronous BullMQ job queues.

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                     │
│  [ Upload ] -> [ Waveform Editor ] -> [ Live Preview ]   │
└────────────────────────┬─────────────────────────────────┘
                         │ REST API
┌────────────────────────▼─────────────────────────────────┐
│                 API Gateway (Fastify)                    │
│  [ Auth/CORS ] -> [ Routes ] -> [ BullMQ Dispatcher ]    │
└──────┬─────────────────┬────────────────────┬────────────┘
       │                 │                    │
   ┌───▼───┐        ┌────▼────┐          ┌────▼─────┐
   │ Redis │        │ Postgres│          │ AWS S3   │
   │(Queue)│        │ (Prisma)│          │ (Storage)│
   └───┬───┘        └─────────┘          └──────────┘
       │
┌──────▼───────────────────────────────────────────────────┐
│               Background Workers (Node.js)               │
│  1. Download from S3 -> 2. Process -> 3. Upload to S3    │
└──────┬──────────────────────────────────────┬────────────┘
       │                                      │
┌──────▼──────────┐                  ┌────────▼───────────┐
│ Python Analyzer │                  │   FFmpeg Engine    │
│ (Librosa/Demucs)│                  │ (Audio Rendering)  │
└─────────────────┘                  └────────────────────┘
```

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS, WaveSurfer.js, Web Audio API |
| **Backend API** | Fastify, TypeScript, Zod, BullMQ |
| **Database** | PostgreSQL, Prisma ORM |
| **AI / Audio** | Python 3.12, FastAPI, Librosa, Demucs v4, PyTorch, FFmpeg |
| **Infrastructure** | Docker, Docker Compose, AWS S3, Redis |
| **Package Manager**| pnpm (Node), uv (Python) |

## 🚀 Getting Started

### Prerequisites
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- [AWS Account](https://aws.amazon.com/s3/) (for S3 storage)

### 1. Clone and Configure

```bash
git clone https://github.com/your-username/automix.git
cd automix
```

Create your environment file from the template:
```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` and add your AWS S3 credentials:
```env
STORAGE_DRIVER=s3
S3_BUCKET=your-automix-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
```

### 2. Run with Docker Compose

Build and start all services (API, Worker, Analyzer, Web, Postgres, Redis):

```bash
docker compose up -d --build
```

Run database migrations:
```bash
docker compose run --rm migrate
```

### 3. Access the App

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **API:** [http://localhost:4000](http://localhost:4000)
- **Python Analyzer:** [http://localhost:8000/docs](http://localhost:8000/docs)

## 📂 Project Structure

```text
automix/
├── apps/
│   ├── api/               # Fastify Backend & BullMQ Workers
│   │   ├── prisma/        # Database schema
│   │   └── src/
│   │       ├── analysis/  # Python API client
│   │       ├── audio/     # FFmpeg renderer
│   │       ├── mixing/    # Transition planner
│   │       ├── queue/     # BullMQ definitions
│   │       ├── routes/    # API endpoints
│   │       ├── storage/   # S3/Local storage abstraction
│   │       └── workers/   # Background job processors
│   └── web/               # Next.js Frontend
│       └── src/
│           ├── components/# UI, Waveforms, Stem Player
│           └── lib/       # API client, Audio Engine, Harmonic logic
├── services/
│   └── analyzer/          # Python FastAPI Microservice
│       ├── main.py        # Librosa & Demucs endpoints
│       └── Dockerfile
├── docker-compose.yml     # Orchestration
└── pnpm-workspace.yaml    # Monorepo config
```

## ⚙️ Local Development (Without Docker)

If you prefer running services natively for faster hot-reloading:

1. **Infrastructure:** Start Postgres and Redis locally.
2. **Python Analyzer:**
   ```bash
   cd services/analyzer
   uv venv && source .venv/bin/activate
   uv pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
3. **Backend API & Worker:**
   ```bash
   cd apps/api
   pnpm install
   pnpm dev     # Terminal 1 (API)
   pnpm worker  # Terminal 2 (Worker)
   ```
4. **Frontend:**
   ```bash
   cd apps/web
   pnpm install
   pnpm dev     # Terminal 3 (Next.js)
   ```

## 📖 Documentation
- **[API Reference](./docs/API.md)** - REST API endpoints and payloads.
- **[Audio Engine](./docs/AUDIO_ENGINE.md)** - Deep dive into the FFmpeg filtergraph and Web Audio API implementation.
- **[Harmonic Mixing](./docs/HARMONIC.md)** - How the Camelot Wheel compatibility logic works.

## 📄 License
MIT License. Feel free to use this project for learning or commercial purposes.
