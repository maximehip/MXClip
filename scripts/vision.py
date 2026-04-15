#!/usr/bin/env python3
"""
Frame captioning using Salesforce/blip-image-captioning-large.

Usage:
    python3 scripts/vision.py <frames_dir>

Output: JSON array of {file, caption} on stdout, logs on stderr.
"""

import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

import sys
import json
import glob

from PIL import Image
import torch
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
from transformers import BlipProcessor, BlipForConditionalGeneration


def log(msg: str):
    print(msg, file=sys.stderr)


def main():
    if len(sys.argv) < 2:
        log("Usage: vision.py <frames_dir>")
        sys.exit(1)

    frames_dir = sys.argv[1]
    if not os.path.isdir(frames_dir):
        log(f"Error: {frames_dir} is not a directory")
        sys.exit(1)

    frame_paths = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
    if not frame_paths:
        frame_paths = sorted(glob.glob(os.path.join(frames_dir, "*.jpg")))
    if not frame_paths:
        log("No frame images found.")
        json.dump([], sys.stdout)
        return

    log("Loading BLIP model (Salesforce/blip-image-captioning-large)...")
    processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-large")
    model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-large")
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(device)
    model.eval()
    log(f"Model loaded on {device}. Processing {len(frame_paths)} frames...")

    results = []
    batch_size = 4 if device == "cuda" else 3

    for i in range(0, len(frame_paths), batch_size):
        batch_paths = frame_paths[i:i + batch_size]
        images = [Image.open(p).convert("RGB") for p in batch_paths]

        inputs = processor(images=images, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=100)

        for j, output in enumerate(outputs):
            caption = processor.decode(output, skip_special_tokens=True)
            results.append({
                "file": os.path.basename(batch_paths[j]),
                "caption": caption
            })

        log(f"  Processed {min(i + batch_size, len(frame_paths))}/{len(frame_paths)} frames")

    json.dump(results, sys.stdout)
    log(f"Done. {len(results)} frames captioned.")


if __name__ == "__main__":
    main()
