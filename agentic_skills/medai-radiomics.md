---
description: "Extract ~120 PyRadiomics features (shape, intensity, texture) from an image and segmentation mask"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Extract radiomic features from a medical image and segmentation mask using PyRadiomics. Returns ~120 features across 7 classes: firstorder, shape, GLCM, GLRLM, GLSZM, NGTDM, and GLDM.

## Parameters
Parse from user request: $ARGUMENTS
- `image_file`: Path to source image NIfTI (.nii.gz) — required. Infer from session context if available.
- `mask_file`: Path to segmentation mask NIfTI (.nii.gz) — required. Infer from session context if available.
- `segment_labels`: Dict mapping segment index to label name (e.g., {"1": "tumor"}). Infer from segmentation metadata if available.
- Feature class selection (all enabled by default): firstorder, shape, glcm, glrlm, glszm, ngtdm, gldm.

## Workflow

1. Get image and mask file paths. From session context or user-provided paths.

2. Run radiomics:
```bash
curl -X POST "$MEDAI_SERVER/analytics/radiomics" \
  -F "image_file=@/path/to/image.nii.gz" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"segment_labels": {"1": "tumor"}}'
```

3. Display summary table of key features first (volume, surface area, sphericity, mean intensity, entropy).

4. Offer to show full feature set on request.

## Confirmation Required
No confirmation needed.

## Output Format
Present a **summary table** first with the most clinically relevant features:

| Feature | Value |
|---------|-------|
| Volume (cm³) | shape_MeshVolume |
| Surface Area (mm²) | shape_SurfaceArea |
| Sphericity | shape_Sphericity |
| Mean Intensity | firstorder_Mean |
| Entropy | firstorder_Entropy |

Then group remaining features by class if the user requests the full set:
- **First Order**: mean, median, std, skewness, kurtosis, entropy, energy, etc.
- **Shape**: volume, surface area, sphericity, compactness, elongation, flatness, etc.
- **GLCM**: contrast, correlation, energy, homogeneity, etc.
- **GLRLM**: run length features
- **GLSZM**: size zone features
- **NGTDM**: neighborhood features
- **GLDM**: dependence features

Include `pyradiomics_version` and `computation_time_ms` at the end.

**Examples**: "Extract radiomics features for the tumor", "Run radiomics analysis", "Show me the texture features for segment 1"
