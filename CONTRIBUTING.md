# Contributing

Thank you for your interest in contributing! Here's how to get started.

## Prerequisites

- Node.js 18+
- Python 3.10+
- [Ollama](https://ollama.com) installed and running
- ffmpeg installed (`brew install ffmpeg` on macOS)

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/mxclip.git
cd mxclip

# Node dependencies
npm install

# Python dependencies
cd scripts && pip install -r requirements.txt && cd ..

# Copy env template
cp .env.example .env
# Fill in your Twitch credentials in .env

# Build TypeScript
npm run build
```

## Development workflow

```bash
# Watch mode (recompiles on save)
npm run dev

# Run CLI
npm start

# Run Electron GUI
npm run electron
```

## Project structure

```
src/
  index.ts          — CLI entry point
  electron/         — Electron main process + preload
  renderer/         — Electron frontend (HTML/CSS/JS)
  pipeline/         — Video analysis pipeline
  clip/             — Clip detection and scoring
  stream/           — Live stream analysis
  types/            — TypeScript type definitions
  prompts/          — LLM prompt templates
scripts/
  audio_server.py   — Whisper transcription server
  face_server.py    — InsightFace detection server
  fastvlm_server.py — FastVLM vision server
```

## How to contribute

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes and run `npm run build` to verify compilation
4. Open a Pull Request with a clear description

## Guidelines

- Keep TypeScript strict — no `any`, all functions explicitly typed
- For new features involving the pipeline, add a type definition in `src/types/`
- Python scripts should be compatible with Python 3.10+
- Test with at least one local video before submitting a PR

## Reporting bugs

Open an issue with:
- Your OS and Node/Python version
- The Ollama model you're using
- Reproduction steps
- Error output (from terminal or Electron DevTools)
