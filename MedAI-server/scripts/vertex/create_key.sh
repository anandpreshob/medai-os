#!/usr/bin/env bash
# Create a service-account JSON key for the orchestrator to authenticate to GCP.
# Writes to MedAI-server/secrets/gcp-sa.json (gitignored, chmod 600).
#
# On a GCE host, prefer the attached VM service account and skip this entirely.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

SECRETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/secrets"
KEY_FILE="${SECRETS_DIR}/gcp-sa.json"
mkdir -p "${SECRETS_DIR}"

if [[ -f "${KEY_FILE}" ]]; then
  echo "Key already exists at ${KEY_FILE} — refusing to overwrite. Delete it to rotate."
  exit 1
fi

gcloud iam service-accounts keys create "${KEY_FILE}" \
  --iam-account "${SA_EMAIL}" \
  --project "${GCP_PROJECT}"

chmod 600 "${KEY_FILE}"
echo "Wrote ${KEY_FILE} (chmod 600). It is mounted read-only into the orchestrator."
echo "Set in your .env:  GCP_SA_KEY_FILE=./secrets/gcp-sa.json"
