---
description: "Compare current study with prior timepoint, including registration, segmentation propagation, volumetric deltas, and RECIST response classification"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Perform a longitudinal comparison between the current study and a prior timepoint. Register the images, propagate prior segmentations, compute volumetric deltas, classify RECIST response, and generate a longitudinal report.

## Parameters
Parse from user request: $ARGUMENTS
- **patient_id** — patient identifier to find prior studies
- **current_image_id** — current study image ID (infer from active session or datastore)
- **prior_image_id** — prior study image ID (auto-detected from datastore if not specified)
- **registration_type** — "rigid" or "affine" (default: rigid, fallback to affine)
- **body_region** — anatomical region for segmentation model selection

## Workflow

1. **Identify prior study** from datastore: filter by patient_id and earlier study date.
   ```bash
   curl -s "$MEDAI_SERVER/datastore/?output=all" | jq '[.[] | select(.patient_id == "PATIENT_ID")] | sort_by(.study_date)'
   ```
   Select the most recent prior study. If no prior exists, report that longitudinal comparison is not possible.

2. **Check compatibility**: Verify the two images can be registered.
   ```bash
   curl -X POST "$MEDAI_SERVER/registration/check-compatibility" \
     -F "source_image_id=prior_image_id" \
     -F "target_image_id=current_image_id"
   ```

3. **Register images**: Align the prior study to the current study.
   ```bash
   curl -X POST "$MEDAI_SERVER/registration/rigid" \
     -F "fixed_image_id=current_image_id" \
     -F "moving_image_id=prior_image_id"
   ```
   If rigid registration fails or quality is poor, fall back to affine:
   ```bash
   curl -X POST "$MEDAI_SERVER/registration/affine" \
     -F "fixed_image_id=current_image_id" \
     -F "moving_image_id=prior_image_id"
   ```
   The response returns a 4x4 transform matrix.

4. **Propagate prior segmentation**: Resample the prior segmentation mask into the current image space.
   ```bash
   curl -X POST "$MEDAI_SERVER/registration/resample-mask" \
     -F "source_mask_id=prior_seg_id" \
     -F "source_image_id=prior_image_id" \
     -F "target_image_id=current_image_id" \
     -F 'transform_matrix=[[1,0,0,tx],[0,1,0,ty],[0,0,1,tz],[0,0,0,1]]' \
     -F "interpolation=nearest"
   ```
   Use the transform matrix returned from step 3.

5. **Segment current study** if not already segmented → `/medai-segment` with appropriate model for the body region.

6. **Compute volumetrics on both timepoints (parallel)**:
   - `/medai-volumetrics` on current segmentation
   - `/medai-volumetrics` on propagated prior segmentation

7. **Compute volume deltas**: For each lesion, calculate:
   - Absolute change: current_volume - prior_volume
   - Percent change: (current_volume - prior_volume) / prior_volume × 100%

8. **RECIST on both timepoints (parallel)**:
   - `/medai-recist` on current segmentation
   - `/medai-recist` on propagated prior segmentation
   Classify RECIST response based on sum of longest diameters:
   - **CR** (Complete Response): all target lesions disappeared
   - **PR** (Partial Response): >= 30% decrease in sum LD
   - **PD** (Progressive Disease): >= 20% increase in sum LD or new lesions
   - **SD** (Stable Disease): neither PR nor PD criteria met

9. **Generate longitudinal report**:
   ```bash
   curl -X POST "$MEDAI_SERVER/report/generate" \
     -H "Content-Type: application/json" \
     -d '{
       "image_id": "current_image_id",
       "segmentation_id": "current_seg_id",
       "agent_type": "oncology_longitudinal",
       "additional_context": {
         "prior_volumes": {...},
         "current_volumes": {...},
         "volume_deltas": {...},
         "recist_response": "PR"
       }
     }'
   ```

10. **Export comparison data** → `/medai-export-oncology` with longitudinal payload.

## Confirmation Required
- Confirm if the automatically selected prior study is correct (especially if multiple priors exist).
- Confirm before any PACS export.

## Output Format
Present a longitudinal comparison dashboard:

### Study Timeline
- Prior: [date] — [description]
- Current: [date] — [description]
- Interval: [days/months between studies]

### Registration Quality
- Method: rigid / affine
- Quality metric from registration response

### Comparison Table
| Lesion | Prior Volume (cm³) | Current Volume (cm³) | Change (%) | Prior LD (mm) | Current LD (mm) | RECIST Response |
|--------|-------------------|---------------------|------------|--------------|-----------------|-----------------|

### Overall RECIST Assessment
- Sum of target LDs: prior → current
- Overall response classification: CR / PR / SD / PD

### Report
- Longitudinal findings narrative
- Clinical significance assessment

### Examples
- "Compare this scan with the prior study"
- "Longitudinal analysis for patient 5"
- "Show me how the tumors changed since last scan"
