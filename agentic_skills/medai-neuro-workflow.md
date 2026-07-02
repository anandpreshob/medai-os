---
description: "Comprehensive brain analysis including segmentation, brain volumetrics, parcellation, asymmetry, QC, and optional longitudinal atrophy analysis"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Run a full neurology assessment pipeline: assess image quality, segment brain structures, validate segmentation, compute neuro-specific metrics (parcellation volumes, asymmetry indices), and optionally perform longitudinal atrophy analysis. Generate a comprehensive neuro report.

## Parameters
Parse from user request: $ARGUMENTS
- **image_path** — path to the brain MRI NIfTI file (infer from context or datastore)
- **patient_id** — patient identifier (for longitudinal lookup)
- **is_longitudinal** — true if prior brain study is available or requested
- **expected_labels** — list of expected segmentation labels (default: standard brain structures)

## Workflow

1. **Image QC**: Assess image quality before proceeding.
   ```bash
   curl -X POST "$MEDAI_SERVER/neuro-qc/assess-image" \
     -F "image_file=@/path/to/brain.nii.gz" \
     -F 'params={"skip_motion": false, "skip_snr": false}'
   ```
   Check the response for:
   - Motion score (lower is better)
   - SNR (signal-to-noise ratio)
   - Coverage assessment
   - Skull strip quality
   - `is_usable` flag — if false, **warn the user** that image quality is poor and results may be unreliable. Ask whether to proceed.

2. **Segment brain structures** → `/medai-segment` with model=totalsegmentator and MR brain labels.

3. **Segmentation QC**: Validate the segmentation output.
   ```bash
   curl -X POST "$MEDAI_SERVER/neuro-qc/assess-segmentation" \
     -F "segmentation_file=@/path/to/seg.nii.gz" \
     -F "image_file=@/path/to/brain.nii.gz" \
     -F 'params={"expected_labels": [1,2,3,4,5]}'
   ```
   Report any missing or unexpected labels, overlap issues, or volume anomalies.

4. **Compute neuro metrics (parallel with step 5)**:
   ```bash
   curl -X POST "$MEDAI_SERVER/neuro_analytics/neuro-metrics" \
     -F "segmentation_file=@/path/to/seg.nii.gz" \
     -F "image_file=@/path/to/brain.nii.gz"
   ```
   Returns: brain volumes by structure, white/gray matter volumes, parcellation data.

5. **Asymmetry indices (parallel with step 4)**:
   ```bash
   curl -X POST "$MEDAI_SERVER/neuro_analytics/asymmetry-indices" \
     -F "segmentation_file=@/path/to/seg.nii.gz"
   ```
   Returns: left vs right hemisphere volume comparisons for each structure.

6. **ICV normalization**:
   ```bash
   curl -X POST "$MEDAI_SERVER/neuro_analytics/icv-normalization" \
     -F "segmentation_file=@/path/to/seg.nii.gz"
   ```
   Returns: intracranial-volume-normalized percentages for each structure.

7. **If longitudinal** (prior brain study available):
   a. Register current to prior using `/registration/rigid`
   b. Compute atrophy rate:
      ```bash
      curl -X POST "$MEDAI_SERVER/neuro_longitudinal/atrophy-rate" \
        -F "current_segmentation=@/path/to/current_seg.nii.gz" \
        -F "prior_segmentation=@/path/to/prior_seg.nii.gz" \
        -F "interval_days=365"
      ```
   c. Get top changing regions:
      ```bash
      curl -X POST "$MEDAI_SERVER/neuro_longitudinal/top-changes" \
        -F "current_segmentation=@/path/to/current_seg.nii.gz" \
        -F "prior_segmentation=@/path/to/prior_seg.nii.gz"
      ```

8. **Generate report** → `/medai-report` with agent_type="brain", including all computed metrics as additional context.

## Confirmation Required
- If image QC reports `is_usable = false`, confirm with user before proceeding.
- Confirm before any clinical export.

## Output Format
Present a neuro assessment dashboard:

### Image Quality
| Metric | Value | Status |
|--------|-------|--------|
| Motion Score | X | OK / Warning |
| SNR | X | OK / Low |
| Coverage | X% | OK / Incomplete |
| Skull Strip | quality | OK / Poor |
| Overall | usable | Yes / No |

### Brain Volumes
| Structure | Volume (cm³) | ICV-Normalized (%) | Z-Score | Status |
|-----------|-------------|-------------------|---------|--------|

### Asymmetry Indices
| Structure | Left (cm³) | Right (cm³) | Asymmetry Index | Status |
|-----------|-----------|------------|-----------------|--------|
(Flag asymmetry index > 0.10 as notable)

### Segmentation QC
- Labels found vs expected
- Overlap issues
- Volume anomalies

### Longitudinal Analysis (if applicable)
| Structure | Prior Volume | Current Volume | Annualized Atrophy Rate (%) |
|-----------|-------------|---------------|---------------------------|

Top changing regions: [list]

### Report
- Clinical narrative from AI report agent

### Examples
- "Run brain analysis on this MRI"
- "Neuro assessment for patient 3"
- "Brain volumetrics with longitudinal comparison"
