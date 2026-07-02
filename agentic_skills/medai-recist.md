---
description: "Compute RECIST 1.1 measurements (longest diameter, short axis, SLD, response classification) from a segmentation mask"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Compute RECIST 1.1 measurements from a segmentation mask, including longest diameter, short axis for lymph nodes, measurability assessment, target eligibility, sum of longest diameters (SLD), and response classification when baseline is provided.

## Parameters
Parse from user request: $ARGUMENTS
- `mask_file`: Path to segmentation mask NIfTI (.nii.gz) — required. Infer from session context if available.
- `segment_labels`: Dict mapping segment index to label name (e.g., {"1": "liver_lesion", "2": "lung_nodule"}).
- `spacing`: Optional voxel spacing override [x, y, z] in mm.
- `lesion_metadata`: Optional list of per-lesion metadata:
  - `segment_index`: int — which segment this describes
  - `is_lymph_node`: bool — true if the lesion is a lymph node
  - `anatomical_region`: str — anatomical location (e.g., "liver", "lung", "mediastinum")

RECIST 1.1 validation rules:
- MAX_TARGET_LESIONS_TOTAL = 5
- MAX_PER_ORGAN = 2
- MIN_MEASURABLE = 10 mm (non-lymph node)
- Lymph node target eligibility: short axis >= 15 mm

## Workflow

1. Get mask file path from session or user input.

2. Parse lesion metadata from user request (which segments are lymph nodes, anatomical regions).

3. Run RECIST:
```bash
curl -X POST "$MEDAI_SERVER/analytics/recist-measurements" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"segment_labels": {"1": "liver_lesion", "2": "lung_nodule"}, "lesion_metadata": [{"segment_index": 1, "is_lymph_node": false, "anatomical_region": "liver"}]}'
```

4. Display RECIST table: Lesion | Type | Longest Diameter | Short Axis | Measurable | Target Eligible

5. Show SLD and response classification if baseline provided.

## Confirmation Required
No confirmation needed.

## Output Format
Present results as a markdown table:

| Lesion | Type | Longest Diameter (mm) | Short Axis (mm) | Measurable | Target Eligible |
|--------|------|-----------------------|------------------|------------|-----------------|

Below the table, include:
- **Sum of Longest Diameters (SLD)**: total across target lesions
- **Response Classification** (if baseline provided): CR / PR / SD / PD
  - CR: Complete Response (all target lesions disappeared)
  - PR: Partial Response (>=30% decrease in SLD)
  - PD: Progressive Disease (>=20% increase in SLD and >=5mm absolute increase)
  - SD: Stable Disease (neither PR nor PD)

**Examples**: "Compute RECIST measurements", "What's the sum of longest diameters?", "Is this lesion measurable by RECIST criteria?"
