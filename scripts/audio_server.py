#!/usr/bin/env python3
"""
Persistent audio transcription server for live mode.
Keeps Whisper loaded in memory — no reload between chunks.
No alignment, no diarization (live mode only).
Reads audio file paths line by line from stdin, outputs JSON segments to stdout.

For video mode (with diarization + alignment), use audio.py instead.
"""

import json
import os
import sys

def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="medium", help="Whisper model size")
    parser.add_argument("--language", default="fr")
    args = parser.parse_args()

    log(f"Loading Whisper {args.model}...")
    try:
        import whisperx
    except ImportError as e:
        log(f"Import error: {e}")
        sys.exit(1)

    model = whisperx.load_model(args.model, device="cpu", language=args.language, compute_type="int8")
    log("Whisper ready.")

    for line in sys.stdin:
        audio_path = line.strip()
        if not audio_path:
            continue

        try:
            audio = whisperx.load_audio(audio_path)
            result = model.transcribe(audio, language=args.language)

            segments: list[dict] = []
            for seg in result.get("segments", []):
                segments.append({
                    "start": round(float(seg["start"]), 2),
                    "end": round(float(seg["end"]), 2),
                    "text": seg["text"].strip(),
                    "speaker": None,
                })

            print(json.dumps(segments), flush=True)

        except FileNotFoundError:
            print(json.dumps([]), flush=True)
        except Exception as e:
            log(f"Error on {audio_path}: {e}")
            print(json.dumps([]), flush=True)


if __name__ == "__main__":
    main()
