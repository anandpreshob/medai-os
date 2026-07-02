---
description: "Compute volumetric measurements (volume, dimensions, centroid, connected components) from a segmentation mask"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Compute volumetric measurements for segments in a NIfTI segmentation mask, including volume, voxel count, connected components, centroid, bounding box, longest axis, and dimensions.

## Parameters
Parse from user request: $ARGUMENTS
- `mask_file`: Path to NIfTI mask file (.nii.gz) — required. Infer from session context if available.
- `image_file`: Path to source image (optional).
- `segment_labels`: Dict mapping segment index to label name (e.g., {"1": "liver", "2": "spleen"}). Infer from segmentation metadata if available.
- `spacing`: Optional voxel spacing override [x, y, z] in mm. Only needed if mask header is incorrect.

## Workflow

1. Get the current mask file path. If a session is loaded, use `case_context` MCP tool to get the mask path. Otherwise, user must provide a mask file path.

2. Optionally get segment_labels from the segmentation metadata.

3. Run volumetrics:
```bash
curl -X POST "$MEDAI_SERVER/analytics/volumetrics" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"segment_labels": {"1": "liver", "2": "spleen"}}'
```

4. Display results as a table: Label | Volume (cm³) | Instances | Longest Axis (mm) | Dimensions (mm)

## Confirmation Required
No confirmation needed.

## Output Format
Present results as a markdown table with columns:
- **Label**: Segment name
- **Volume (cm³)**: `volume_cm3` rounded to 2 decimal places
- **Instances**: `instance_count` (connected components, 26-connectivity)
- **Longest Axis (mm)**: `longest_axis_mm` rounded to 1 decimal place
- **Dimensions (mm)**: `dimensions_mm` (x × y × z extent)

Include centroid coordinates and bounding box details below the table if the user asks for spatial information.

**Examples**: "What is the volume of the liver?", "Compute volumes for all segments", "How many connected components are in the tumor mask?"
