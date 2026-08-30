#!/usr/bin/env bash
# Shared configuration for the Vertex bootstrap scripts.
# Override any value via environment or a local `.env` in this directory.
set -euo pipefail

# Load a local .env in this dir if present (KEY=VALUE lines).
_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${_here}/.env" ]]; then
  set -a; source "${_here}/.env"; set +a
fi

: "${GCP_PROJECT:?Set GCP_PROJECT (gcloud project id)}"
export GCP_REGION="${GCP_REGION:-us-central1}"

# Artifact Registry Docker repo
export AR_REPO="${AR_REPO:-medai}"
export AR_HOST="${GCP_REGION}-docker.pkg.dev"
export INFERENCE_IMAGE="${AR_HOST}/${GCP_PROJECT}/${AR_REPO}/inference"
export VERTEX_IMAGE="${AR_HOST}/${GCP_PROJECT}/${AR_REPO}/inference-vertex"

# GCS staging bucket (regional, same region as Vertex)
export GCS_BUCKET="${GCS_BUCKET:-medai-vertex-staging-${GCP_PROJECT}}"
# Days after which staged job data (jobs/**) is auto-deleted
export GCS_JOB_TTL_DAYS="${GCS_JOB_TTL_DAYS:-7}"

# Runtime service account (identity for the Vertex job + orchestrator key)
export SA_NAME="${SA_NAME:-vertex-runner}"
export SA_EMAIL="${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"

echo "Project : ${GCP_PROJECT}"
echo "Region  : ${GCP_REGION}"
echo "AR repo : ${AR_HOST}/${GCP_PROJECT}/${AR_REPO}"
echo "Bucket  : gs://${GCS_BUCKET} (jobs TTL ${GCS_JOB_TTL_DAYS}d)"
echo "SA      : ${SA_EMAIL}"
