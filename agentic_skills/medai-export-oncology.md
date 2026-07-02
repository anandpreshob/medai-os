---
description: "Export structured oncology data with lesion measurements, RECIST response assessment, and provenance tracking"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Export structured oncology data including lesion measurements, volumetrics, RECIST response assessment, and full provenance chain of custody. Supports JSON and CSV formats for clinical trial submission and longitudinal tracking.

## Parameters
Parse from user request: $ARGUMENTS
- **format**: "json" (default) or "csv" — infer from user request
- **mask_file**: Path to NIfTI segmentation mask from current session
- **patient_id**: From case context or user input
- **study_date**: From case context or user input
- **study_uid**: From case context DICOM metadata
- **series_uid**: From case context DICOM metadata
- **modality**: From case context (CT, MR, etc.)
- **segments**: List of segments with index, label, category (target/non-target/new), and anatomical_location
- **provenance**: Model name, version, list of edits, reviewer name, timestamp
- **baseline_lesions**: Optional prior measurements for RECIST comparison
- **nadir_lesions**: Optional nadir measurements for RECIST comparison

### Segment Category Inference
- User says "target lesion" → category: `target`
- User says "non-target" → category: `non-target`
- User says "new lesion" → category: `new`
- Default if unspecified → `target`

## Workflow

1. **Get mask file and segment info** from the current session using `case_context` MCP tool. Identify the segmentation result and its label map.

2. **Gather provenance information**: Determine which model produced the segmentation, any manual edits applied, and who reviewed the result.

3. **Build the segments list** with index, label, category, and anatomical location for each segment in the mask.

4. **Choose format** based on user request:

   **JSON export**:
   ```bash
   curl -X POST "$MEDAI_SERVER/exports/oncology-json" \
     -F "mask_file=@/path/to/mask.nii.gz" \
     -F 'params={
       "context": {
         "patient_id": "P001",
         "study_date": "2025-01-15",
         "study_uid": "1.2.3.4.5",
         "series_uid": "1.2.3.4.5.6",
         "modality": "CT"
       },
       "segments": [
         {"index": 1, "label": "liver_lesion_1", "category": "target", "anatomical_location": "liver segment 7"},
         {"index": 2, "label": "liver_lesion_2", "category": "non-target", "anatomical_location": "liver segment 4"}
       ],
       "provenance": {
         "model_name": "biomedparse",
         "model_version": "1.0",
         "edits": ["manual boundary correction on slice 45"],
         "reviewer": "Dr. Smith",
         "timestamp": "2025-01-15T10:30:00Z"
       },
       "baselineLesions": [],
       "nadirLesions": []
     }'
   ```

   **CSV export**:
   ```bash
   curl -X POST "$MEDAI_SERVER/exports/oncology-csv" \
     -F "mask_file=@/path/to/mask.nii.gz" \
     -F 'params={...}' \
     --output oncology_export.csv
   ```

   CSV columns: lesion_id, label, category, location, volume_mm3, volume_cm3, longest_axis_mm, axial_diameter_mm, dimensions_mm, centroid_ijk, voxel_count, measurement_source, confidence, segment_index

5. **RECIST assessment** (if baseline or nadir data available):
   ```bash
   curl -X POST "$MEDAI_SERVER/exports/recist-assessment" \
     -H "Content-Type: application/json" \
     -d '{
       "currentLesions": [{"label": "liver_lesion_1", "longest_axis_mm": 28.5}],
       "baselineLesions": [{"label": "liver_lesion_1", "longest_axis_mm": 32.0}],
       "nadirLesions": [{"label": "liver_lesion_1", "longest_axis_mm": 30.0}]
     }'
   ```

6. **Display results**:
   - Lesion count and summary table
   - Per-lesion measurements (volume, diameters, centroid)
   - RECIST response classification (CR, PR, SD, PD) with percent change from baseline and nadir
   - Provenance chain of custody
   - Export file path

## Confirmation Required
No confirmation needed for local exports.

## Output Format
Present oncology export results as:

### Lesion Summary
| Lesion | Category | Location | Volume (cm3) | Longest Axis (mm) |
|---|---|---|---|---|

### Response Assessment (if applicable)
- **RECIST Classification**: e.g., Partial Response (PR)
- **Sum of Target Lesions**: Current vs baseline (% change)
- **New Lesions**: Yes/No

### Provenance
- **Model**: name and version
- **Edits**: list of modifications
- **Reviewer**: name
- **Timestamp**: ISO timestamp

### Export Path
- File path and format

### Example Requests
- "Export oncology data for clinical trial submission"
- "Export lesion measurements as CSV"
- "Calculate RECIST response compared to baseline"
- "Export structured oncology JSON with provenance"
