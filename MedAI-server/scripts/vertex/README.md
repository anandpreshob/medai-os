# Vertex AI Batch Inference — Bootstrap

Provision Google Vertex AI as the cloud backend for MedAI-OS batch segmentation.
The orchestrator (CPU) stages images to GCS, submits a Vertex **Custom Job** (GPU
T4) that runs the segmentation models, downloads the masks, and pushes DICOM-SEG
back to Orthanc — all driven by the existing Agent window.

## Prerequisites
- `gcloud` CLI authenticated (`gcloud auth login`) with **Owner/Editor** on the project.
- A GCP project (billing enabled).
- **GPU quota**: new projects have **0**. Request Vertex
  `custom_model_training_nvidia_t4_gpus` ≥ 1 in your region *before* submitting jobs
  (IAM & Admin → Quotas). Submission fails with a quota error otherwise.

## One-time setup
```bash
cd MedAI-server/scripts/vertex
cp /dev/null .env    # optional: put GCP_PROJECT=... GCP_REGION=... GCS_BUCKET=... here
export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1

./00_enable_apis.sh     # enable aiplatform, artifactregistry, storage, cloudbuild, compute, iam
./01_bootstrap.sh       # Artifact Registry repo + GCS bucket (auto-delete) + service account + IAM
./02_build_push.sh      # Cloud Build: inference base -> thin Vertex worker -> Artifact Registry
./create_key.sh         # service-account JSON key -> ../../secrets/gcp-sa.json (chmod 600)
```

`config.sh` holds shared values (repo name, bucket, SA email). Override via env or
a local `.env` in this directory.

## Configure the deployment
Copy the printed values into `MedAI-server/.env` (see `.env.example` → *Cloud Batch
Backend* block):
```
BATCH_BACKEND=vertex
MONAI_LABEL_SERVER_URL=http://orchestrator:8001
GCP_PROJECT=your-project-id
GCP_REGION=us-central1
GCS_BUCKET=medai-vertex-staging-your-project-id
VERTEX_AR_IMAGE=us-central1-docker.pkg.dev/your-project-id/medai/inference-vertex:latest
VERTEX_SERVICE_ACCOUNT=vertex-runner@your-project-id.iam.gserviceaccount.com
GCP_SA_KEY_FILE=./secrets/gcp-sa.json
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-sa.json
```

## Verify
```bash
# 1. Worker in isolation (submits a real 1-file Custom Job, ~a few min + cold start)
GOOGLE_APPLICATION_CREDENTIALS=secrets/gcp-sa.json \
  python scripts/vertex/smoke_test.py --model biomedparse --prompt liver

# 2. Full stack (no local GPU)
docker compose --profile vertex up -d
#   upload a study to Orthanc (:8042), open the Agent window, and run e.g.
#   "segment the liver in patient 1 with biomedparse", then save to PACS.
```

## Files
| File | Purpose |
|------|---------|
| `config.sh` | Shared config (project, region, repo, bucket, SA). |
| `00_enable_apis.sh` | Enable required GCP APIs. |
| `01_bootstrap.sh` | Artifact Registry + GCS bucket (lifecycle) + SA + IAM (idempotent). |
| `cloudbuild.vertex.yaml` | Cloud Build: inference base → thin Vertex worker. |
| `02_build_push.sh` | Submit the Cloud Build. |
| `create_key.sh` | Create the orchestrator SA key. |
| `smoke_test.py` | End-to-end 1-file job test. |

## Data residency / PHI
DICOM volumes are staged to a **regional** GCS bucket (same region as Vertex, TLS in
transit, bucket-scoped IAM) and **auto-deleted** after `GCS_JOB_TTL_DAYS` (default 7).
This v1 does **not** de-identify or use CMEK — add those before processing PHI
outside a BAA-covered project.
