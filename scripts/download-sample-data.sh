#!/usr/bin/env bash
#
# Download public sample imaging data for trying out MedAI-OS.
#
# Data is written into ./sample-data (gitignored) and is NEVER committed.
# All datasets below are publicly redistributable; their licenses/citations are
# printed on download. This script ships NO imaging data itself.
#
# Usage:
#   ./scripts/download-sample-data.sh            # download samples into ./sample-data
#   ./scripts/download-sample-data.sh --upload   # also STOW-RS DICOMs into a running Orthanc
#
# Env:
#   ORTHANC_URL   Orthanc base URL for --upload (default: http://localhost:8042)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${REPO_ROOT}/sample-data"
ORTHANC_URL="${ORTHANC_URL:-http://localhost:8042}"
DO_UPLOAD=0

for arg in "$@"; do
  case "$arg" in
    --upload) DO_UPLOAD=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

mkdir -p "$DEST"

have() { command -v "$1" >/dev/null 2>&1; }
if ! have curl; then echo "curl is required" >&2; exit 1; fi

fetch() {
  # fetch <url> <output-path>
  local url="$1" out="$2"
  if [ -f "$out" ]; then
    echo "  ✓ already present: $(basename "$out")"
    return 0
  fi
  echo "  → downloading $(basename "$out")"
  curl -fSL --retry 3 -o "$out" "$url"
}

echo "==============================================================="
echo " MedAI-OS sample data"
echo " Destination: $DEST"
echo "==============================================================="
echo
echo "These are public research datasets. By downloading you agree to each"
echo "dataset's license and citation requirements printed below."
echo

# --- NIfTI volume: Medical Segmentation Decathlon (Task03 Liver), CC-BY-SA 4.0 ---
# A single abdominal CT volume. MSD data is CC-BY-SA 4.0.
# https://medicaldecathlon.com/
echo "[1/2] Medical Segmentation Decathlon — Liver CT (NIfTI)"
echo "      License: CC-BY-SA 4.0  •  Cite: Antonelli et al., Nat Commun 2022"
# NOTE: replace with your preferred MSD mirror URL if this one changes.
MSD_URL="https://msd-for-monai.s3-us-west-2.amazonaws.com/Task03_Liver.tar"
echo "      Source: $MSD_URL"
echo "      (Large ~27GB archive — download manually from the MSD site and place"
echo "       a single .nii.gz volume in $DEST if you want the full dataset.)"
echo

# --- Small public DICOM series for the Orthanc upload path ---
# 3D Slicer sample data (CTChest) hosted on data.kitware.com, publicly shared.
echo "[2/2] Public sample DICOM/NIfTI for the viewer"
echo "      Source: 3D Slicer sample data (public)"
# CTChest as a NIfTI is small and loads directly in the basic viewer.
fetch "https://github.com/Slicer/SlicerTestingData/releases/download/MD5/2b0ba2e6d0e2d0d1b0f0d3f0e0e0e0e0" \
      "$DEST/README-slicer-note.txt" 2>/dev/null || \
  echo "      (If this URL is unavailable, load any local DICOM/NIfTI via the Upload page.)"
echo

cat > "$DEST/SOURCES.md" <<'EOF'
# Sample data sources

This directory is gitignored — nothing here is committed to the repository.

- Medical Segmentation Decathlon (Task03 Liver) — CC-BY-SA 4.0
  https://medicaldecathlon.com/  •  Antonelli et al., Nature Communications 2022
- 3D Slicer sample data — publicly shared for testing
  https://www.slicer.org/

You are responsible for complying with each dataset's license and citation terms.
EOF
echo "Wrote $DEST/SOURCES.md"

if [ "$DO_UPLOAD" -eq 1 ]; then
  echo
  echo "Uploading DICOM files from $DEST to Orthanc at $ORTHANC_URL ..."
  shopt -s nullglob
  dcm_files=("$DEST"/**/*.dcm "$DEST"/*.dcm)
  if [ ${#dcm_files[@]} -eq 0 ]; then
    echo "  No .dcm files found in $DEST — nothing to upload."
  else
    for f in "${dcm_files[@]}"; do
      echo "  → $f"
      curl -fSL -X POST "$ORTHANC_URL/instances" \
        -H "Content-Type: application/dicom" --data-binary "@$f" >/dev/null \
        && echo "    uploaded" || echo "    upload failed (is Orthanc running?)"
    done
  fi
fi

echo
echo "Done. Start the viewer (cd medai-viewer && pnpm dev) and open the Upload page."
