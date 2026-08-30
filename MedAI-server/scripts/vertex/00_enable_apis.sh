#!/usr/bin/env bash
# Enable the GCP APIs needed for Vertex AI batch inference.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

gcloud services enable \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  --project "${GCP_PROJECT}"

echo "APIs enabled."
