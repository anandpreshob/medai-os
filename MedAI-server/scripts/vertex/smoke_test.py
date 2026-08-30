#!/usr/bin/env python3
# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License")

"""
End-to-end smoke test for the Vertex batch backend.

Stages one synthetic NIfTI, submits a Vertex Custom Job via VertexBatchProvider,
polls to completion, downloads the result, and prints the manifest. Validates the
whole cloud path except the datastore/save-pacs (which need Orthanc).

Run from MedAI-server/ with the same GCP env the orchestrator uses:
    GCP_PROJECT=... GCS_BUCKET=... VERTEX_AR_IMAGE=... \
    GOOGLE_APPLICATION_CREDENTIALS=secrets/gcp-sa.json \
    python scripts/vertex/smoke_test.py --model biomedparse --prompt liver
"""

import argparse
import os
import sys
import tempfile
import time

# Make the MedAI-server package importable when run from anywhere.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from monailabel.cloud.base import CloudJobStatus, StagedImage  # noqa: E402
from monailabel.cloud.vertex_provider import VertexBatchProvider  # noqa: E402


def _make_synthetic_nifti(path: str) -> None:
    import nibabel as nib
    import numpy as np

    data = np.zeros((64, 64, 32), dtype=np.int16)
    data[16:48, 16:48, 8:24] = 400  # a bright cuboid
    nib.save(nib.Nifti1Image(data, affine=np.eye(4)), path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="biomedparse")
    ap.add_argument("--prompt", default="liver")
    ap.add_argument("--timeout", type=int, default=1800, help="max seconds to wait")
    args = ap.parse_args()

    try:
        provider = VertexBatchProvider()
    except RuntimeError as e:
        print(f"[config] {e}", file=sys.stderr)
        return 2

    scratch = tempfile.mkdtemp(prefix="vertex_smoke_")
    img_path = os.path.join(scratch, "synthetic.nii.gz")
    _make_synthetic_nifti(img_path)

    job_id = f"smoke-{int(time.time())}"
    images = [StagedImage(image_id="synthetic", local_path=img_path)]
    request = {"model": args.model, "prompt": args.prompt, "options": {}, "image_ids": ["synthetic"]}

    print(f"[stage] uploading input to gs://{provider.bucket}/jobs/{job_id}/ ...")
    staged_uri = provider.stage_inputs(job_id, images, request)

    print(f"[submit] launching Vertex CustomJob ({provider.image_uri}) ...")
    try:
        provider_job_id = provider.submit_job(job_id, staged_uri)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        print(f"[submit] FAILED: {msg}", file=sys.stderr)
        if "quota" in msg.lower() or "resource" in msg.lower():
            print(
                "\n>>> Likely GPU quota. Request Vertex "
                f"'{provider.accelerator_type}' quota in {provider.region}.",
                file=sys.stderr,
            )
        return 3
    print(f"[submit] {provider_job_id}")

    deadline = time.time() + args.timeout
    state = None
    while time.time() < deadline:
        state = provider.poll_job(provider_job_id)
        print(f"[poll] {state.raw_state} -> {state.status.value}")
        if state.status.is_terminal:
            break
        time.sleep(15)

    if not state or not state.status.is_terminal:
        print("[poll] timed out", file=sys.stderr)
        return 4
    if state.status != CloudJobStatus.SUCCEEDED:
        print(f"[done] job ended {state.status.value}: {state.message}", file=sys.stderr)
        return 5

    dest = os.path.join(scratch, "outputs")
    results = provider.fetch_results(job_id, dest)
    print(f"[fetch] {len(results)} result(s):")
    ok = 0
    for r in results:
        print(f"  - {r.image_id}: {r.status} mask={r.local_mask_path} labels={r.labels} err={r.error}")
        ok += 1 if r.status == "completed" else 0

    print(f"\nSMOKE {'PASS' if ok else 'FAIL'} ({ok}/{len(results)} completed)")
    return 0 if ok else 6


if __name__ == "__main__":
    raise SystemExit(main())
