<p align="center">
  <img src="./src/renderer/logo.svg" alt="MXCLip logo" width="80"/>
</p>

# MXCLip

**Turn your streams and video into viral clips with AI  — 100% locally**

> Powered by [Ollama](https://ollama.com), Whisper, and FFmpeg. Your videos never leave your machine.

---

<p align="center">
  <img src="assets/demo.gif" alt="MXCLip demo" width="80%"/>
</p>

---

## Screenshots

<p align="center">
  <img src="assets/First View In GUI.png" alt="Home screen" width="48%"/>
  &nbsp;
  <img src="assets/Clip Detected in GUI.png" alt="Detected clips" width="48%"/>
</p>
<p align="center">
  <em>Home screen &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Detected clips with scores</em>
</p>

<p align="center">
  <img src="assets/Clip extrait.png" alt="Extracted clip" width="28%"/>
  &nbsp;&nbsp;&nbsp;
  <img src="assets/Performance Analyse CLI.png" alt="CLI output" width="60%"/>
</p>
<p align="center">
  <em>Extracted clip &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; CLI performance analysis</em>
</p>

---

## Why MXClip ?

| | MXCLip | Opus Clip | Captions |
|---|---|---|---|
| Price | Free | ~$30/mo | ~$20/mo |
| Runs locally | ✅ | ❌ | ❌ |
| Privacy | 100% offline | Cloud upload | Cloud upload |
| Custom AI model | Yes (any Ollama model) | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ |

## Features

- **Automatic clip detection** — Analyzes your video to find the most engaging moments
- **Live stream monitoring** — Works with Twitch streams in real time
- **Face detection** — Tracks speaker presence throughout the video
- **Audio transcription** — Whisper-powered speech-to-text, no API needed
- **Vision analysis** — Understands what's happening on screen via local LLM
- **Q&A mode** — Ask questions about any moment in your video
- **Electron GUI + CLI** — Pick whichever interface you prefer
- **Vector search** — Semantic search over embedded video events

## Requirements

- **Node.js** 18+
- **Python** 3.10+
- **[Ollama](https://ollama.com)** running locally
- **ffmpeg** (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux)
- A Twitch account (only for stream mode)

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/mxclip.git
cd mxclip

# Install Node dependencies
npm install

# Install Python dependencies
cd scripts && pip install -r requirements.txt && cd ..

# Set up environment
cp .env.example .env
# Edit .env and add your Twitch credentials (only needed for stream mode)

# Build
npm run build
```

That's it — **no need to install models manually**. MXCLip downloads and configures everything automatically on first launch.

## Models

MXCLip downloads the following models automatically the first time you run it:

| Model | Role | Source |
|---|---|---|
| **Whisper** (`ggml-small`) | Audio transcription | whisper.cpp / HuggingFace |
| **nomic-embed-text** | Vector embeddings | Ollama |
| **gemma4:e4b** | Semantic analysis & Q&A | Ollama |
| **FastVLM** (Apple, 4-bit) | Vision understanding | Apple CDN + MLX |

Progress is shown in real time — a dedicated screen in the Electron GUI, and progress bars in the CLI terminal. Once all models are ready the app starts normally. Subsequent launches skip the download entirely.

## Usage

### Electron GUI (recommended)

```bash
npm run electron
```

### CLI

```bash
npm start
```

You will be prompted to choose between:
- **Video mode** — Analyze a local video file (`video.mp4` in project root)
- **Stream mode** — Connect to a live Twitch stream

## Configuration

Copy `.env.example` to `.env` and fill in:

```env
TWITCH_CLIENT_ID=your_client_id_here
TWITCH_CLIENT_SECRET=your_client_secret_here
```

Get your Twitch credentials at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps).

## How it works

```
Video / Stream
     │
     ▼
Frame extraction (FFmpeg)
     │
     ├── OCR (Tesseract)
     ├── Audio transcription (Whisper)
     ├── Face detection (InsightFace + YOLOv8)
     └── Vision analysis (FastVLM / Ollama)
     │
     ▼
Event embedding + Vector search
     │
     ▼
Clip scoring & detection
     │
     ▼
Output clips (MP4)
```

## Output

Clips are saved to `output/clips/`. Each video gets its own cache directory based on a hash of the file path, so re-runs are fast.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
