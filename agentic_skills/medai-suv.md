---
description: "Compute PET SUV metrics (SUVmax, SUVmean, SUVpeak, metabolic tumor volume, total lesion glycolysis) from PET image and mask"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Compute Standardized Uptake Value (SUV) metrics from a PET image and segmentation mask, including SUVmax, SUVmean, SUVpeak, metabolic tumor volume (MTV), and total lesion glycolysis (TLG).

## Parameters
Parse from user request: $ARGUMENTS
- `pet_file`: Path to PET image NIfTI (.nii.gz) — required. Infer from session context if available.
- `mask_file`: Path to segmentation mask NIfTI (.nii.gz) — required. Infer from session context if available.
- `patient_weight_kg`: float — required. Ask user if not provided.
- `injected_dose_bq`: float — required. Ask user if not provided.
- `normalization_method`: "bw" (body weight), "lbm" (lean body mass), or "bsa" (body surface area). Default: "bw".
- `suv_threshold`: float (default: 2.5) — threshold for metabolic volume computation.
- `half_life_seconds`: float (default F-18: 6586.2).
- `injection_time`: str (HHMMSS format) — for decay correction.
- `scan_time`: str (HHMMSS format) — for decay correction.
- `decay_corrected`: bool — whether the image is already decay-corrected.
- `rescale_slope`, `rescale_intercept`: float — DICOM rescale parameters.
- `segment_labels`: Dict mapping segment index to label name.
- `patient_height_cm`: float — required for LBM/BSA normalization.
- `patient_sex`: str ("M"/"F") — required for LBM normalization.

Use `GET /suv/info` to check supported methods and defaults.

## Workflow

1. Check if PET image and mask are available from session context or user input.

2. Ask user for required params if not provided: `patient_weight_kg`, `injected_dose_bq`. If using LBM normalization, also ask for `patient_height_cm` and `patient_sex`.

3. Optionally get injection/scan times for decay correction.

4. Run SUV computation:
```bash
curl -X POST "$MEDAI_SERVER/suv/compute" \
  -F "pet_file=@/path/to/pet.nii.gz" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"patient_weight_kg": 70, "injected_dose_bq": 370000000, "segment_labels": {"1": "lesion"}}'
```

5. Display SUV table: Segment | SUVmax | SUVmean | SUVpeak | MTV (cm³) | TLG

## Confirmation Required
No confirmation needed.

## Output Format
Present results as a markdown table:

| Segment | SUVmax | SUVmean | SUVpeak | SUVmin | MTV (cm³) | TLG |
|---------|--------|---------|---------|--------|-----------|-----|

Where:
- **SUVmax**: Maximum SUV in the segment
- **SUVmean**: Mean SUV in the segment
- **SUVpeak**: Peak SUV (1 cm³ sphere around max)
- **SUVmin**: Minimum SUV in the segment
- **MTV**: Metabolic Tumor Volume — volume of voxels with SUV > threshold (cm³)
- **TLG**: Total Lesion Glycolysis = SUVmean × MTV

Below the table, include:
- Normalization method used
- SUV threshold for MTV computation
- Location of SUVmax (ijk and mm coordinates)

**Examples**: "Compute SUV for the lesion", "What's the SUVmax?", "Calculate metabolic tumor volume", "What is the total lesion glycolysis?"
