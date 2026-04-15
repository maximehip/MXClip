#!/usr/bin/env python3
"""
Audio transcription + speaker diarization using whisperX.
Combines Whisper (speech-to-text) and pyannote (speaker identification).

Usage:
    python3 scripts/audio.py <audio_file> [--hf-token TOKEN] [--language fr] [--model medium]

Output: JSON array on stdout, logs on stderr.
Requires HF_TOKEN env var or --hf-token for speaker diarization.
"""

import argparse
import json
import os
import sys
from dotenv import load_dotenv
import whisperx

load_dotenv()


def log(msg: str):
    print(msg, file=sys.stderr)


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe + diarize audio")
    parser.add_argument("audio_file", help="Path to audio file (WAV)")
    parser.add_argument("--hf-token", default=os.getenv("HF_TOKEN"), help="HuggingFace token for pyannote")
    parser.add_argument("--language", default="fr", help="Language code (default: fr)")
    parser.add_argument("--model", default="small", help="Whisper model size (default: small)")
    parser.add_argument("--diarize", action="store_true", help="Enable speaker diarization (slow, requires HF_TOKEN)")
    return parser.parse_args()


def main():
    args = parse_args()

    if not os.path.isfile(args.audio_file):
        log(f"Error: {args.audio_file} not found")
        sys.exit(1)

    if args.diarize and not args.hf_token:
        log("Error: HuggingFace token required for diarization. Set HF_TOKEN env var or use --hf-token")
        sys.exit(1)

    device = "cpu"

    # Redirect stdout to stderr during processing (whisperX logs to stdout)
    real_stdout = sys.stdout
    sys.stdout = sys.stderr

    # 1. Transcription
    log(f"Loading Whisper model ({args.model})...")
    model = whisperx.load_model(args.model, device, language=args.language, compute_type="int8")

    log("Transcribing audio...")
    audio = whisperx.load_audio(args.audio_file)
    result = model.transcribe(audio)
    log(f"Transcription done: {len(result['segments'])} segments")

    if args.diarize:
        # 2. Alignment (word-level timestamps, required for diarization)
        log("Aligning transcript...")
        align_model, metadata = whisperx.load_align_model(language_code=args.language, device=device)
        result = whisperx.align(result["segments"], align_model, metadata, audio, device)
        log("Alignment done.")

        # 3. Speaker diarization
        log("Running speaker diarization...")
        from whisperx.diarize import DiarizationPipeline
        diarize_pipeline = DiarizationPipeline(token=args.hf_token, device=device)
        diarize_segments = diarize_pipeline(args.audio_file)

        # 4. Assign speakers to transcript segments
        result = whisperx.assign_word_speakers(diarize_segments, result)
        log(f"Diarization done: speakers assigned to {len(result['segments'])} segments")

    # 5. Build output — restore real stdout for JSON
    sys.stdout = real_stdout

    segments = []
    for seg in result["segments"]:
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
            "speaker": seg.get("speaker", None),
        })

    json.dump(segments, sys.stdout, ensure_ascii=False)
    log(f"Done. {len(segments)} segments output.")


if __name__ == "__main__":
    main()
