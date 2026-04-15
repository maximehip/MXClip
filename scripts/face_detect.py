#!/usr/bin/env python3
"""
Face detection + recognition + clustering pipeline.
Uses InsightFace (RetinaFace + ArcFace) and DBSCAN clustering.

Usage:
    python3 scripts/face_detect.py <frames_dir> [--eps 0.4] [--min-samples 2] [--no-embeddings]

Output: JSON on stdout, logs on stderr.
"""

import argparse
import json
import os
import sys
import glob

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from sklearn.cluster import DBSCAN
from ultralytics import YOLO


def log(msg: str):
    print(msg, file=sys.stderr)


def parse_args():
    parser = argparse.ArgumentParser(description="Face detection and clustering")
    parser.add_argument("frames_dir", help="Path to directory containing frame images")
    parser.add_argument("--eps", type=float, default=0.4, help="DBSCAN eps (cosine distance)")
    parser.add_argument("--min-samples", type=int, default=2, help="DBSCAN min_samples")
    parser.add_argument("--no-embeddings", action="store_true", help="Exclude embeddings from output")
    return parser.parse_args()


def load_models():
    log("Loading InsightFace model (buffalo_l)...")
    # Redirect stdout to suppress InsightFace provider messages
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0)
    sys.stdout = old_stdout
    log("InsightFace model loaded.")

    log("Loading YOLO model (yolov8n.pt)...")
    yolo = YOLO("yolov8n.pt")
    log("YOLO model loaded.")
    return app, yolo


def detect_faces_in_frames(app, yolo, frames_dir):
    """Detect faces and persons in all frames and return per-frame data + all embeddings."""
    frame_paths = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
    if not frame_paths:
        frame_paths = sorted(glob.glob(os.path.join(frames_dir, "*.jpg")))
    if not frame_paths:
        log("No frame images found in " + frames_dir)
        return [], np.array([])

    log(f"Processing {len(frame_paths)} frames...")

    all_embeddings = []
    embedding_indices = []  # (frame_idx, face_idx) for each embedding
    frames_data = []

    for frame_idx, frame_path in enumerate(frame_paths):
        img = cv2.imread(frame_path)
        if img is None:
            log(f"Warning: could not read {frame_path}")
            frames_data.append({"framePath": os.path.basename(frame_path), "faces": [], "personCount": 0})
            continue

        # YOLO person detection (class 0 = "person")
        yolo_results = yolo(img, verbose=False)
        person_count = 0
        for r in yolo_results:
            for box in r.boxes:
                if int(box.cls[0]) == 0:
                    person_count += 1

        # InsightFace face detection
        faces = app.get(img)
        frame_faces = []
        for face_idx, face in enumerate(faces):
            bbox = face.bbox.tolist()
            bbox = [round(v, 1) for v in bbox]
            confidence = round(float(face.det_score), 4)
            embedding = face.embedding.tolist()

            frame_faces.append({
                "bbox": bbox,
                "confidence": confidence,
                "embedding": embedding,
                "clusterId": -1,
            })

            all_embeddings.append(face.embedding)
            embedding_indices.append((frame_idx, face_idx))

        frames_data.append({
            "framePath": os.path.basename(frame_path),
            "faces": frame_faces,
            "personCount": person_count,
        })

        if (frame_idx + 1) % 10 == 0:
            log(f"  Processed {frame_idx + 1}/{len(frame_paths)} frames")

    embeddings_array = np.array(all_embeddings) if all_embeddings else np.array([])
    return frames_data, embeddings_array, embedding_indices


def cluster_faces(frames_data, embeddings, embedding_indices, eps, min_samples):
    """Cluster face embeddings with DBSCAN using cosine distance."""
    if len(embeddings) == 0:
        log("No faces found, skipping clustering.")
        return frames_data, 0

    log(f"Clustering {len(embeddings)} face embeddings (eps={eps}, min_samples={min_samples})...")

    # Normalize embeddings for cosine distance
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normalized = embeddings / norms

    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine").fit(normalized)
    labels = clustering.labels_

    n_clusters = len(set(labels) - {-1})
    log(f"Found {n_clusters} clusters, {(labels == -1).sum()} noise points")

    for i, (frame_idx, face_idx) in enumerate(embedding_indices):
        frames_data[frame_idx]["faces"][face_idx]["clusterId"] = int(labels[i])

    return frames_data, n_clusters


def main():
    args = parse_args()

    if not os.path.isdir(args.frames_dir):
        log(f"Error: {args.frames_dir} is not a directory")
        sys.exit(1)

    app, yolo = load_models()
    frames_data, embeddings, embedding_indices = detect_faces_in_frames(app, yolo, args.frames_dir)
    frames_data, n_clusters = cluster_faces(frames_data, embeddings, embedding_indices, args.eps, args.min_samples)

    total_faces = sum(len(f["faces"]) for f in frames_data)

    if args.no_embeddings:
        for frame in frames_data:
            for face in frame["faces"]:
                del face["embedding"]

    result = {
        "totalFaces": total_faces,
        "totalClusters": n_clusters,
        "frames": frames_data,
    }

    json.dump(result, sys.stdout)
    log(f"Done. {total_faces} faces detected, {n_clusters} clusters.")


if __name__ == "__main__":
    main()
