#!/bin/bash
# DICOM Data Seeding Script for MedAI Orthanc
# Uploads DICOM files to Orthanc via REST API

set -e

ORTHANC_URL="${ORTHANC_URL:-http://orthanc:8042}"
DICOM_DIR="/dicom-data"

echo "=========================================="
echo "MedAI DICOM Data Seeder"
echo "=========================================="
echo "Orthanc URL: $ORTHANC_URL"
echo "DICOM Directory: $DICOM_DIR"
echo ""

# Wait for Orthanc to be ready
echo "Waiting for Orthanc to be ready..."
until curl -s "$ORTHANC_URL/system" > /dev/null 2>&1; do
    echo "  Orthanc not ready, waiting..."
    sleep 5
done
echo "Orthanc is ready!"
echo ""

# Check current statistics
echo "Current Orthanc Statistics:"
curl -s "$ORTHANC_URL/statistics" 2>/dev/null || echo "Could not get statistics"
echo ""

# Upload DICOM files
if [ -d "$DICOM_DIR" ] && [ "$(ls -A $DICOM_DIR 2>/dev/null)" ]; then
    echo "Uploading DICOM files from $DICOM_DIR..."

    UPLOADED=0
    FAILED=0

    # Find all DICOM files (including in subdirectories)
    find "$DICOM_DIR" -type f \( -name "*.dcm" -o -name "*.DCM" -o -name "*.dicom" \) 2>/dev/null | while read -r file; do
        echo "  Uploading: $(basename "$file")"

        RESPONSE=$(curl -s -w "%{http_code}" -X POST \
            -H "Content-Type: application/dicom" \
            --data-binary "@$file" \
            "$ORTHANC_URL/instances" 2>/dev/null)

        HTTP_CODE="${RESPONSE: -3}"

        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
            echo "    Success (HTTP $HTTP_CODE)"
        else
            echo "    Failed (HTTP $HTTP_CODE)"
        fi
    done

    # Also try uploading files without extension (common for DICOM)
    find "$DICOM_DIR" -type f ! -name "*.*" 2>/dev/null | head -100 | while read -r file; do
        # Check if it looks like a DICOM file (has DICM magic bytes at offset 128)
        if head -c 132 "$file" 2>/dev/null | tail -c 4 | grep -q "DICM"; then
            echo "  Uploading (no ext): $(basename "$file")"
            curl -s -X POST \
                -H "Content-Type: application/dicom" \
                --data-binary "@$file" \
                "$ORTHANC_URL/instances" > /dev/null 2>&1 || true
        fi
    done

    echo ""
    echo "Upload complete!"
else
    echo "No DICOM files found in $DICOM_DIR"
    echo "Place DICOM files in the sample-dicom directory and run again."
fi

# Final statistics
echo ""
echo "Final Orthanc Statistics:"
curl -s "$ORTHANC_URL/statistics" 2>/dev/null || echo "Could not get statistics"

echo ""
echo "=========================================="
echo "Seeding Complete!"
echo "=========================================="
