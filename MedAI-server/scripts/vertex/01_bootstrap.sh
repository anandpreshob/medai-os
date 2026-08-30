#!/usr/bin/env bash
# Idempotently create the Artifact Registry repo, GCS staging bucket (+ lifecycle
# auto-delete), and the runtime service account with least-privilege roles.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# --- Artifact Registry Docker repo ---
if ! gcloud artifacts repositories describe "${AR_REPO}" \
      --location "${GCP_REGION}" --project "${GCP_PROJECT}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location "${GCP_REGION}" \
    --description "MedAI inference images" \
    --project "${GCP_PROJECT}"
else
  echo "Artifact Registry repo ${AR_REPO} already exists."
fi

# --- GCS staging bucket (regional, uniform access) ---
if ! gcloud storage buckets describe "gs://${GCS_BUCKET}" --project "${GCP_PROJECT}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${GCS_BUCKET}" \
    --location "${GCP_REGION}" \
    --uniform-bucket-level-access \
    --project "${GCP_PROJECT}"
else
  echo "Bucket gs://${GCS_BUCKET} already exists."
fi

# Lifecycle rule: auto-delete staged job data after N days (PHI hygiene).
lifecycle_json="$(mktemp)"
cat > "${lifecycle_json}" <<JSON
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": ${GCS_JOB_TTL_DAYS}, "matchesPrefix": ["jobs/"]}
    }
  ]
}
JSON
gcloud storage buckets update "gs://${GCS_BUCKET}" \
  --lifecycle-file="${lifecycle_json}" --project "${GCP_PROJECT}"
rm -f "${lifecycle_json}"
echo "Lifecycle rule: delete jobs/** after ${GCS_JOB_TTL_DAYS} days."

# --- Runtime service account ---
if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project "${GCP_PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name "MedAI Vertex runner" \
    --project "${GCP_PROJECT}"
else
  echo "Service account ${SA_EMAIL} already exists."
fi

# Project-level: submit/poll Vertex jobs + pull images.
gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/aiplatform.user" --condition=None >/dev/null
gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/artifactregistry.reader" --condition=None >/dev/null

# Bucket-scoped: read inputs / write outputs (not project-wide storage admin).
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/storage.objectAdmin" >/dev/null

# Allow the SA to act as itself for Vertex CustomJob (service_account=...).
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/iam.serviceAccountUser" \
  --project "${GCP_PROJECT}" >/dev/null

echo
echo "Bootstrap complete. Next:"
echo "  ./02_build_push.sh     # build + push the worker image"
echo "  ./create_key.sh        # create the orchestrator SA key"
echo
echo "IMPORTANT: request GPU quota if this is a new project:"
echo "  Vertex 'custom_model_training_nvidia_t4_gpus' >= ${VERTEX_ACCELERATOR_COUNT:-1} in ${GCP_REGION}"
