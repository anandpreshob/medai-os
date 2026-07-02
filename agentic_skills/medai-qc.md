---
description: "Run quality control checks on medical images and segmentations"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Assess quality of medical images and segmentations using the neuro-QC service and rule-based validation. Checks include motion artifacts, SNR, coverage, skull stripping, fragmentation, missing labels, volume range validation, connectivity, and boundary quality.

## Parameters
Parse from user request: $ARGUMENTS
- **target** (required): infer from request — "image", "segmentation", or "both"
- **image_file** (optional): path to image file (.nii.gz)
- **segmentation_file** (optional): path to segmentation file (.nii.gz)
- **expected_labels** (optional): list of expected label integers (e.g. [1,2,3,4,5])
- **segment_labels** (optional): label name mapping (e.g. {"1": "liver", "2": "spleen"})
- **skip_checks** (optional): any of skip_motion, skip_snr, skip_coverage, skip_skull_strip

## Workflow

1. Get current segmentation and image from session context, or use user-provided paths.
2. Run image QC if an image file is available:

```bash
curl -X POST "$MEDAI_SERVER/neuro-qc/assess-image" \
  -F "image_file=@/path/to/image.nii.gz"
```

Optional params and brain mask:
```bash
curl -X POST "$MEDAI_SERVER/neuro-qc/assess-image" \
  -F "image_file=@/path/to/image.nii.gz" \
  -F "brain_mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"skip_motion": false, "skip_snr": false}'
```

`$MEDAI_SERVER` defaults to `http://localhost:8000`.

Response includes:
- `motion_score`: 0-100 (higher = less motion = better)
- `snr`: signal-to-noise ratio
- `coverage`: brain coverage percentage
- `skull_strip_quality`: quality assessment
- `is_usable`: overall usability flag
- `findings`: list of specific QC findings
- Severity levels: excellent (>=90), good (>=70), warning (>=40), critical (<40)

3. Run segmentation QC:

```bash
curl -X POST "$MEDAI_SERVER/neuro-qc/assess-segmentation" \
  -F "segmentation_file=@/path/to/seg.nii.gz" \
  -F "image_file=@/path/to/image.nii.gz" \
  -F 'params={"expected_labels": [1,2,3]}'
```

4. Run rule-based volumetric validation — check organ volumes against known reference ranges:
   - Liver: 1000-2000 cm3
   - Kidney: 120-200 cm3
   - Spleen: 100-400 cm3
   - Heart: 200-400 cm3
   Flag volumes outside expected ranges.

5. Check connectivity: flag structures with too many disconnected components.
6. Check label consistency: flag overlapping labels.
7. Check boundary quality: flag jagged or unrealistic boundaries.

## Confirmation Required
None. QC is a read-only assessment.

## Output Format

### Image Quality
| Check | Result | Score | Severity | Notes |
|-------|--------|-------|----------|-------|
| Motion | PASS/FAIL | 0-100 | excellent/good/warning/critical | details |
| SNR | PASS/FAIL | value | excellent/good/warning/critical | details |
| Coverage | PASS/FAIL | % | excellent/good/warning/critical | details |
| Skull Strip | PASS/FAIL | - | excellent/good/warning/critical | details |

**Overall Score**: X/100 | **Usable**: Yes/No

### Segmentation Quality
| Check | Result | Details |
|-------|--------|---------|
| Fragmentation | PASS/WARN | component count |
| Missing Labels | PASS/FAIL | list missing |
| Volume Ranges | PASS/WARN | out-of-range organs |
| Connectivity | PASS/WARN | disconnected structures |
| Label Overlap | PASS/FAIL | overlapping labels |
| Boundary Quality | PASS/WARN | jagged boundaries |

### Recommendations
- Bulleted list of actionable recommendations for any failures or warnings.
- If `is_usable` is false, prominently warn the user.

## Examples
- "Run QC on this segmentation before export"
- "Check image quality"
- "Is this scan usable?"
- "Validate segmentation labels and volumes"
