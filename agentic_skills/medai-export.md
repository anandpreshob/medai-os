---
description: "Export segmentation masks in NIfTI, DICOM-SEG, PNG, COCO, YOLO, or VOC formats with optional PACS upload"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Export segmentation results in various formats (NIfTI, DICOM-SEG, PNG, NPZ) to local storage or PACS, and support batch ML dataset exports in COCO, YOLO, and VOC formats.

## Parameters
Parse from user request: $ARGUMENTS
- **format**: Infer from user request — "nifti" (default), "dicom-seg", "png", "npz", "coco", "yolo", "voc", "overlay"
- **destination**: "local" (default), "pacs", or "both"
- **preview_id**: From current session segmentation result; ask user if ambiguous
- **filename_prefix**: Optional custom prefix for output files
- **labels_to_save**: Optional list of label indices to export (default: all)
- **pacs_url**: Required if destination includes PACS; check session config or ask user

## Workflow

1. **Determine export format** from the user request. Map common terms:
   - "NIfTI" / "nifti" / ".nii.gz" → `nifti`
   - "DICOM-SEG" / "dicom seg" / "dcm" → `dicom-seg`
   - "PNG" / "image" → `png`
   - "COCO" / "YOLO" / "VOC" / "overlay" → ML batch format

2. **Get preview_id or mask file** from the current session. Use the `case_context` MCP tool to find the active segmentation result.

3. **For simple single-file export**, use the `save_annotation` MCP tool:
   ```json
   {
     "preview_id": "<preview_id>",
     "format": "nifti",
     "destination": "local",
     "filename_prefix": "",
     "include_metadata": true,
     "labels_to_save": []
   }
   ```

4. **For DICOM-SEG export**:
   ```bash
   curl -X POST "$MEDAI_SERVER/dicomseg/export" \
     -F "mask_file=@/path/to/mask.nii.gz" \
     -F 'params={"studyUID": "1.2.3", "seriesUID": "1.2.3.4", "segments": [{"label": "liver", "index": 1}], "seriesDescription": "AI Segmentation"}'
   ```

5. **For PACS upload** (REQUIRES CONFIRMATION):
   ```bash
   curl -X POST "$MEDAI_SERVER/dicomseg/upload-pacs" \
     -H "X-PACS-URL: http://orthanc:8042/dicom-web" \
     -F "file=@/path/to/dicomseg.dcm"
   ```

6. **For ML batch formats** (COCO, YOLO, VOC, overlay):
   ```bash
   curl -X POST "$MEDAI_SERVER/exports/batch-export" \
     -H "Content-Type: application/json" \
     -d '{
       "results": [{"mask_path": "/path/to/mask.nii.gz", "image_path": "/path/to/image.nii.gz"}],
       "format": "coco",
       "categories": ["liver", "tumor"]
     }'
   ```

7. **Display results**: saved file paths, file sizes, PACS SOP Instance UIDs if applicable, and segmentation_id.

## Confirmation Required
- **PACS export**: Always confirm before uploading to PACS (destination=pacs or destination=both). Display the PACS URL and file details, then ask: "Confirm upload to PACS at <url>?"
- **Batch exports**: Confirm before batch operations affecting multiple files. Display the file count and format.
- **No confirmation needed** for local single-file exports.

## Output Format
Present export results as:
- **Format**: The export format used
- **Destination**: local / pacs / both
- **Files saved**: List each file with path and size
- **PACS UID**: SOP Instance UID if uploaded to PACS
- **Segmentation ID**: The segmentation identifier for reference

### Example Requests
- "Export as DICOM-SEG to PACS"
- "Save the segmentation in COCO format"
- "Export as NIfTI"
- "Export liver and tumor labels as PNG"
- "Batch export all results in YOLO format"
