#!/usr/bin/env python3
"""
Persistent face detection server for live stream mode.
Reads frame paths line by line from stdin, outputs JSON per frame.
Maintains face embeddings and re-clusters periodically.
"""

import sys
import json
import os

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from sklearn.cluster import DBSCAN


def log(msg: str):
    print(msg, file=sys.stderr, flush=True)


RECLUSTER_EVERY = 5  # re-cluster every N frames with new faces


def main():
    log("Loading InsightFace...")
    old_stdout = sys.stdout
    sys.stdout = sys.stderr
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0)
    sys.stdout = old_stdout
    log("InsightFace ready.")

    all_embeddings = []          # flat list of all embeddings seen
    frame_face_map = {}          # basename -> list of face index in all_embeddings
    labels = []                  # cluster label per embedding
    frames_since_recluster = 0

    for line in sys.stdin:
        frame_path = line.strip()
        if not frame_path:
            continue

        basename = os.path.basename(frame_path)
        img = cv2.imread(frame_path)

        if img is None:
            print(json.dumps({"frame": basename, "clusterIds": [], "totalClusters": 0}), flush=True)
            continue

        faces = app.get(img)
        face_indices = []

        for face in faces:
            idx = len(all_embeddings)
            all_embeddings.append(face.embedding)
            face_indices.append(idx)
            labels.append(-1)

        frame_face_map[basename] = face_indices
        frames_since_recluster += 1 if face_indices else 0

        # Re-cluster when enough new faces accumulated
        if len(all_embeddings) >= 2 and frames_since_recluster >= RECLUSTER_EVERY:
            embeddings_array = np.array(all_embeddings)
            norms = np.linalg.norm(embeddings_array, axis=1, keepdims=True)
            norms[norms == 0] = 1
            normalized = embeddings_array / norms
            result = DBSCAN(eps=0.4, min_samples=2, metric="cosine").fit(normalized)
            labels = result.labels_.tolist()
            frames_since_recluster = 0
            n_clusters = len(set(labels) - {-1})
            log(f"Re-clustered: {n_clusters} unique faces from {len(all_embeddings)} embeddings")

        n_clusters = len(set(labels) - {-1}) if labels else 0
        cluster_ids = [labels[i] for i in face_indices] if face_indices else []

        print(json.dumps({
            "frame": basename,
            "clusterIds": cluster_ids,
            "totalClusters": n_clusters
        }), flush=True)


if __name__ == "__main__":
    main()
