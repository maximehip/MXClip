#!/usr/bin/env python3
"""
FastVLM vision server — MLX backend (Apple Silicon optimized).
Reads frame paths line by line from stdin, outputs JSON captions to stdout.
The model stays loaded in memory — no reload between frames.
Consecutive frames with >98% similarity are skipped (previous caption reused).

Pipeline: a background thread pre-loads images from disk while the GPU runs
inference, so the Metal engine is never idle waiting on I/O.

Setup:
    Already installed via ml-fastvlm + mlx-vlm patch in the project venv.
"""

import argparse
import json
import os
import sys
import threading
from queue import Queue, Empty

def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


MODEL_PATH = os.path.expanduser(
    "~/ml-fastvlm/checkpoints/fastvlm-mlx-4bit"
)

DEFAULT_SYSTEM_PROMPT = (
    "You are analyzing a single Twitch livestream frame. "
    "In 1-2 sentences, describe only what is actively happening: "
    "what the streamer is doing or saying (based on expression/gesture), "
    "and any overlay text or on-screen information that is part of the stream content. "
    "Do NOT mention background decor (posters, wall art, objects behind the streamer). "
    "Do NOT assume there is gameplay unless a game interface is clearly the main screen content. "
    "Do NOT hallucinate elements that are not clearly visible."
)

VIDEO_SYSTEM_PROMPT = (
    "You are analyzing a single video frame. "
    "In 1-2 sentences, describe only what is actively happening: "
    "what people are doing or expressing (based on expression/gesture), "
    "the main content type (game, screen recording, real-world scene, presentation), "
    "and any important on-screen text, numbers, or key visual elements. "
    "Do NOT hallucinate elements that are not clearly visible."
)

SIMILARITY_THRESHOLD = 0.02  # skip inference if mean pixel diff < 2%
PREFETCH_SIZE = 4             # images buffered ahead of GPU inference


def frame_diff(img_a, img_b) -> float:
    """Return mean absolute pixel difference in [0, 1] between two PIL images."""
    import numpy as np
    size = (64, 64)
    a = np.array(img_a.resize(size).convert("L"), dtype=np.float32) / 255.0
    b = np.array(img_b.resize(size).convert("L"), dtype=np.float32) / 255.0
    return float(np.mean(np.abs(a - b)))


def start_prefetch_thread(image_queue: Queue) -> threading.Thread:
    """
    Reads frame paths from stdin and pre-loads images into image_queue.
    Runs on a background thread so image I/O overlaps with GPU inference.
    Puts None as sentinel when stdin is exhausted.
    """
    from PIL import Image

    def worker() -> None:
        for line in sys.stdin:
            path = line.strip()
            if not path:
                continue
            try:
                img = Image.open(path).convert("RGB")
            except Exception:
                img = None
            image_queue.put((path, img))
        image_queue.put(None)  # sentinel — no more frames

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return t


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-path",
        default=MODEL_PATH,
        help="Path to the exported fastvlm-mlx model directory"
    )
    parser.add_argument("--max-new-tokens", type=int, default=80)
    parser.add_argument(
        "--mode",
        choices=["stream", "video"],
        default="stream",
        help="System prompt preset: 'stream' for Twitch live, 'video' for recorded video"
    )
    args = parser.parse_args()

    SYSTEM_PROMPT = VIDEO_SYSTEM_PROMPT if args.mode == "video" else DEFAULT_SYSTEM_PROMPT
    log(f"Loading FastVLM MLX from {args.model_path}... (mode={args.mode})")
    try:
        import mlx.core as mx
        from mlx_vlm import load, generate
        from mlx_vlm.utils import load_config
        from mlx_vlm.prompt_utils import apply_chat_template
    except ImportError as e:
        log(f"Import error: {e}")
        log("Ensure mlx-vlm is installed in the venv.")
        sys.exit(1)

    model, processor = load(args.model_path)
    config = load_config(args.model_path)

    # Materialize all model parameters into Metal memory before first inference
    mx.eval(model.parameters())

    # Pre-build the prompt string (constant across all frames)
    prompt: str = apply_chat_template(
        processor,
        config,
        SYSTEM_PROMPT,
        num_images=1,
    )

    log("FastVLM MLX ready.")

    # Start prefetch thread — images are loaded while GPU runs inference
    image_queue: Queue = Queue(maxsize=PREFETCH_SIZE)
    start_prefetch_thread(image_queue)

    prev_img = None
    prev_caption: str = ""

    while True:
        try:
            item = image_queue.get(timeout=60)
        except Empty:
            break

        if item is None:
            break  # sentinel: stdin exhausted

        frame_path, img = item
        basename = os.path.basename(frame_path)

        if img is None:
            print(json.dumps({"file": basename, "caption": ""}), flush=True)
            continue

        try:
            # Skip inference if frame is nearly identical to previous
            if prev_img is not None and frame_diff(prev_img, img) < SIMILARITY_THRESHOLD:
                print(json.dumps({"file": basename, "caption": prev_caption, "skipped": True}), flush=True)
                continue

            caption: str = generate(
                model,
                processor,
                prompt,
                image=frame_path,
                max_tokens=args.max_new_tokens,
                temp=0.0,
                verbose=False,
            )
            caption = caption.strip()
            prev_img = img
            prev_caption = caption
            print(json.dumps({"file": basename, "caption": caption}), flush=True)

        except Exception as e:
            log(f"Error on {basename}: {e}")
            print(json.dumps({"file": basename, "caption": ""}), flush=True)


if __name__ == "__main__":
    main()
