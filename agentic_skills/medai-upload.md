---
description: "Upload images or labels to the MedAI datastore or create a new session from a file"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Upload medical images (NIfTI, NRRD, DICOM, ZIP) to the MedAI datastore, upload labels/segmentations to associate with existing images, or create a new viewer session from an uploaded file.

## Parameters
Parse from user request: $ARGUMENTS
- **action** (required): infer from context — one of: "image", "label", "session"
  - "image" — upload a new image to the datastore
  - "label" — upload a segmentation label for an existing image
  - "session" — create a new session from a file
- **file_path** (required): absolute path to the file to upload
- **image_id** (optional): identifier for the image in the datastore (auto-derived from filename if not provided)
- **tag** (optional): label tag for label uploads — "final", "original", "user" (default: "final")
- **label_info** (optional): JSON metadata for label (e.g. model name, label names)
- **params** (optional): additional parameters as JSON

**Inference rules**:
- "upload this scan" / "add to datastore" -> action="image"
- "save this segmentation" / "upload label" -> action="label"
- "create a session from this file" -> action="session"

## Workflow

### Upload Image to Datastore
1. Validate the file exists and has a supported format:
   - Supported: `.nii.gz`, `.nrrd`, `.dcm`, `.zip`
   - Reject unsupported formats with an error message.

2. Generate image ID from filename if not provided:
   - `patient001.nii.gz` -> `patient001`
   - `CT_Chest_2024.nii.gz` -> `CT_Chest_2024`

3. Upload the file:
   ```bash
   curl -X PUT "$MEDAI_SERVER/datastore/image?image=IMAGE_ID" \
     -F "file=@/path/to/image.nii.gz" \
     -F 'params={}'
   ```
   `$MEDAI_SERVER` defaults to `http://localhost:8000`.

4. Verify the upload:
   ```bash
   curl -s "$MEDAI_SERVER/datastore/image/info?image=IMAGE_ID" | jq .
   ```

### Upload Label/Segmentation
1. Upload a label for an existing image:
   ```bash
   curl -X PUT "$MEDAI_SERVER/datastore/label?image=IMAGE_ID&tag=final" \
     -F "file=@/path/to/segmentation.nii.gz" \
     -F 'label_info={"model": "totalsegmentator", "labels": {"1": "liver", "2": "spleen"}}'
   ```

2. Verify the label:
   ```bash
   curl -s "$MEDAI_SERVER/datastore/label/info?image=IMAGE_ID&tag=final" | jq .
   ```

### Create Session from File
1. Create a new session by uploading an image:
   ```bash
   curl -X PUT "$MEDAI_SERVER/session/" \
     -F "file=@/path/to/image.nii.gz" \
     -F 'params={"patient_id": "P001"}'
   ```
   Returns a session ID that can be used with other skills (e.g., /medai-segment, /medai-browse).

## Confirmation Required
- Confirm if overwriting an existing image ID or label tag.

## Output Format

### Image Upload
```
Image uploaded successfully:
  Image ID:   IMAGE_ID
  File:       filename.nii.gz
  Size:       X MB
  Status:     Success
```

### Label Upload
```
Label uploaded successfully:
  Image ID:   IMAGE_ID
  Tag:        final
  Labels:     {1: "liver", 2: "spleen", ...}
  Model:      totalsegmentator
```

### Session Creation
```
Session created:
  Session ID:  SESSION_ID
  Image loaded: filename.nii.gz
  Use /medai-browse to open the viewer.
```

If the upload fails, display the error message and suggest troubleshooting steps (check file format, file size, server availability).

## Examples
- "Upload /data/patient001.nii.gz"
- "Add this scan to the datastore"
- "Save this segmentation as the final label"
- "Create a session from this NIfTI file"
- "Upload /tmp/CT_Chest.nii.gz as chest_ct_001"
