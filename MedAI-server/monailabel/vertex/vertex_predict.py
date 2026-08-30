# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
Vertex AI Custom Job entrypoint (runs INSIDE the GPU container on Vertex).

This is the cloud counterpart of ``batch_process.run_batch_inference``: it loads
the requested model **once** and runs it over every staged input, reading from
and writing back to the GCS staging prefix that the orchestrator prepared.

Invocation (set by ``VertexBatchProvider.submit_job``)::

    python -m monailabel.vertex.vertex_predict --job-gcs-uri gs://<bucket>/jobs/<job_id>

Contract with the orchestrator:
  reads  <prefix>/request.json               {model, prompt, options, images:[{image_id,leaf}]}
  reads  <prefix>/inputs/<leaf>.nii.gz        one per image
  writes <prefix>/outputs/<leaf>.nii.gz       one per successful image
  writes <prefix>/outputs/manifest.json       {results:[{image_id, leaf, status, labels,
                                                          confidence, error, processing_time}]}

The whole job exits non-zero only on catastrophic failure (bad manifest, no app).
Per-file failures are recorded in the manifest so a job is FAILED only if *all*
files fail — matching the local batch semantics.
"""

import argparse
import json
import logging
import os
import sys
import tempfile
import time
import traceback
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("vertex_predict")

APP_DIR = os.environ.get("MONAI_APP_DIR", "/code/apps/radiology")


def _parse_gs_uri(uri: str) -> Tuple[str, str]:
    """gs://bucket/path -> (bucket, path)."""
    if not uri.startswith("gs://"):
        raise ValueError(f"Expected a gs:// URI, got: {uri}")
    without = uri[len("gs://") :]
    bucket, _, path = without.partition("/")
    return bucket, path.rstrip("/")


def _build_app(models: str):
    """Construct the radiology MONAI Label app with only the requested model(s).

    Mirrors ``apps/radiology/main.py``'s construction so infer behaviour is
    identical to the local batch path. A dummy local ``studies`` dir is used —
    the worker feeds explicit local image paths and never touches a datastore.
    """
    sys.path.insert(0, APP_DIR)
    from main import MyApp  # noqa: E402  (app dir on path)

    studies = tempfile.mkdtemp(prefix="vertex_studies_")
    conf = {
        "models": models,
        "preload": "false",
        "use_pretrained_model": "true",
    }
    return MyApp(app_dir=APP_DIR, studies=studies, conf=conf)


def _run_one(app, model: str, prompt: str, options: Dict[str, Any], image_path: str) -> Dict[str, Any]:
    request = {"model": model, "image": image_path, "prompt": prompt, **(options or {})}
    result = app.infer(request)
    if result is None:
        raise RuntimeError("Inference returned None")

    result_file = result.get("file")
    params = result.get("params", {}) or {}

    labels = params.get("labels") or ([prompt] if prompt else [])
    confidence = params.get("confidence")
    if confidence is None and params.get("scores"):
        try:
            confidence = max(params["scores"])
        except (ValueError, TypeError):
            confidence = None

    if not isinstance(result_file, str) or not os.path.exists(result_file):
        raise RuntimeError(f"Inference produced no mask file (got {result_file!r})")

    return {"mask_path": result_file, "labels": labels, "confidence": confidence, "params": params}


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] [%(levelname)s] (%(name)s) %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )

    parser = argparse.ArgumentParser()
    parser.add_argument("--job-gcs-uri", required=True, help="gs://bucket/jobs/<job_id>")
    args = parser.parse_args()

    from google.cloud import storage

    bucket_name, prefix = _parse_gs_uri(args.job_gcs_uri)
    client = storage.Client()
    bucket = client.bucket(bucket_name)

    # ---- read request manifest ----
    req_blob = bucket.blob(f"{prefix}/request.json")
    if not req_blob.exists():
        logger.error("request.json not found at %s/request.json", prefix)
        return 2
    request = json.loads(req_blob.download_as_text())

    model = request.get("model") or "biomedparse"
    prompt = request.get("prompt") or ""
    options = request.get("options") or {}
    images: List[Dict[str, str]] = request.get("images") or []
    logger.info("Job %s: model=%s prompt=%r images=%d", request.get("job_id"), model, prompt, len(images))

    # ---- download inputs ----
    scratch = tempfile.mkdtemp(prefix="vertex_inputs_")
    for entry in images:
        leaf = entry["leaf"]
        dst = os.path.join(scratch, f"{leaf}.nii.gz")
        bucket.blob(f"{prefix}/inputs/{leaf}.nii.gz").download_to_filename(dst)
        entry["local_path"] = dst

    # ---- load model once ----
    try:
        app = _build_app(model)
    except Exception as e:  # noqa: BLE001
        logger.error("Failed to build app for model %s: %s\n%s", model, e, traceback.format_exc())
        return 3

    # ---- run each image, upload masks ----
    results: List[Dict[str, Any]] = []
    for entry in images:
        image_id = entry["image_id"]
        leaf = entry["leaf"]
        started = time.time()
        record: Dict[str, Any] = {"image_id": image_id, "leaf": leaf}
        try:
            out = _run_one(app, model, prompt, options, entry["local_path"])
            bucket.blob(f"{prefix}/outputs/{leaf}.nii.gz").upload_from_filename(out["mask_path"])
            record.update(
                status="completed",
                labels=out["labels"],
                confidence=out["confidence"],
                processing_time=round(time.time() - started, 2),
                metadata={"model": model, "prompt": prompt},
            )
            logger.info("Completed %s in %.2fs", image_id, record["processing_time"])
        except Exception as e:  # noqa: BLE001 - per-file failures are non-fatal
            record.update(
                status="failed",
                error=str(e),
                processing_time=round(time.time() - started, 2),
            )
            logger.error("Failed %s: %s\n%s", image_id, e, traceback.format_exc())
        results.append(record)

    # ---- write manifest ----
    manifest = {"job_id": request.get("job_id"), "model": model, "prompt": prompt, "results": results}
    bucket.blob(f"{prefix}/outputs/manifest.json").upload_from_string(
        json.dumps(manifest, indent=2), content_type="application/json"
    )

    n_ok = sum(1 for r in results if r["status"] == "completed")
    logger.info("Job finished: %d/%d succeeded", n_ok, len(results))
    # Non-zero only if nothing succeeded and there was work to do.
    return 0 if (n_ok > 0 or not results) else 4


if __name__ == "__main__":
    raise SystemExit(main())
