#!/usr/bin/env bash
# Build + push the inference base and Vertex worker images via Cloud Build.
# Runs from the MedAI-server/ build context.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# Server dir (build context) is two levels up from scripts/vertex/.
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Tag by git sha when available, else a caller-provided TAG, else 'latest'.
TAG="${TAG:-$(git -C "${SERVER_DIR}" rev-parse --short HEAD 2>/dev/null || echo latest)}"

echo "Building via Cloud Build (context: ${SERVER_DIR}, tag: ${TAG})..."
gcloud builds submit "${SERVER_DIR}" \
  --project "${GCP_PROJECT}" \
  --region "${GCP_REGION}" \
  --config "$(dirname "${BASH_SOURCE[0]}")/cloudbuild.vertex.yaml" \
  --substitutions "_INFERENCE_IMAGE=${INFERENCE_IMAGE},_VERTEX_IMAGE=${VERTEX_IMAGE},_TAG=${TAG}"

echo
echo "Pushed:"
echo "  ${VERTEX_IMAGE}:${TAG}"
echo "  ${VERTEX_IMAGE}:latest"
echo
echo "Set in your .env:"
echo "  VERTEX_AR_IMAGE=${VERTEX_IMAGE}:latest"
