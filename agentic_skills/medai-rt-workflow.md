---
description: "Radiation therapy contouring workflow: auto-segment OARs, validate TG-263 naming, export as RTSTRUCT, document for RT planning"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Execute a radiation therapy contouring workflow: auto-segment organs at risk (OARs), validate structure names against the TG-263 standard, review volumes, export as DICOM RTSTRUCT for treatment planning, and generate RT planning documentation.

## Parameters
Parse from user request: $ARGUMENTS
- **image_path** — path to the planning CT NIfTI file
- **patient_id** — patient identifier
- **study_uid** — DICOM study UID for RTSTRUCT export
- **target_oars** — specific OARs to contour (default: all standard OARs for the body region)
- **body_region** — treatment site (e.g. thorax, head-neck, abdomen, pelvis) — determines which OARs to prioritize

## Workflow

1. **Segment OARs** → `/medai-segment` with model=totalsegmentator.
   Target structures based on body region:
   - **Thorax**: heart, lung_L, lung_R, esophagus, spinal_cord, trachea
   - **Head & Neck**: parotid_L, parotid_R, submandibular_L, submandibular_R, spinal_cord, brainstem, optic_nerve_L, optic_nerve_R, cochlea_L, cochlea_R, mandible
   - **Abdomen**: liver, kidney_L, kidney_R, spleen, stomach, spinal_cord, bowel
   - **Pelvis**: bladder, rectum, femur_L, femur_R, bowel

2. **Validate TG-263 naming compliance**: Check all structure names against the AAPM TG-263 standard.
   ```bash
   curl -X POST "$MEDAI_SERVER/suites/validate-names" \
     -H "Content-Type: application/json" \
     -d '{"names": ["Heart", "Lung_L", "Lung_R", "SpinalCord", "Esophagus"]}'
   ```
   For any non-compliant names, look up the correct TG-263 name:
   ```bash
   curl -s "$MEDAI_SERVER/suites/naming/tg263/SpinalCord"
   ```
   Report all naming corrections applied.

3. **Review structure volumes** → `/medai-volumetrics` to compute volumes for all contoured OARs. Flag any volumes that appear anomalous (e.g. unexpectedly small or large for the structure type).

4. **Export as RTSTRUCT** (**REQUIRES CONFIRMATION**):
   ```bash
   curl -X POST "$MEDAI_SERVER/rtstruct/export" \
     -F "segmentation_file=@/path/to/seg.nii.gz" \
     -F "reference_image=@/path/to/ct.nii.gz" \
     -F 'params={
       "patient_id": "PATIENT_ID",
       "study_uid": "STUDY_UID",
       "structures": [
         {"label": "Heart", "index": 1, "color": [255, 0, 0]},
         {"label": "Lung_L", "index": 2, "color": [0, 255, 0]},
         {"label": "Lung_R", "index": 3, "color": [0, 0, 255]},
         {"label": "SpinalCord", "index": 4, "color": [255, 255, 0]},
         {"label": "Esophagus", "index": 5, "color": [255, 0, 255]}
       ]
     }'
   ```
   Download the exported file:
   ```bash
   curl -s "$MEDAI_SERVER/rtstruct/download/{filename}" -o /path/to/output.dcm
   ```

5. **Generate RT planning documentation** → `/medai-report` with RT planning context, including:
   - All contoured structures with volumes
   - TG-263 compliance status
   - Any QC flags or anomalies
   - RTSTRUCT export details

## Importing Existing RTSTRUCT (if applicable)
If the user has an existing RTSTRUCT to compare or merge:
```bash
# Parse existing RTSTRUCT
curl -X POST "$MEDAI_SERVER/rtstruct/parse" \
  -F "rtstruct_file=@/path/to/existing_rtstruct.dcm"

# Import as NIfTI masks
curl -X POST "$MEDAI_SERVER/rtstruct/import" \
  -F "rtstruct_file=@/path/to/existing_rtstruct.dcm" \
  -F "reference_image=@/path/to/ct.nii.gz"
```

## Confirmation Required
- **RTSTRUCT export**: Always confirm before exporting RTSTRUCT for clinical use. Present the structure list, volumes, and TG-263 compliance status for review.
- **PACS upload**: If requested, confirm before sending to PACS.

## Output Format
Present an RT contouring summary:

### OAR Segmentation Summary
| Structure | TG-263 Name | Label Index | Volume (cm³) | Color | Status |
|-----------|-------------|-------------|-------------|-------|--------|

### TG-263 Compliance
| Original Name | TG-263 Name | Compliant | Action |
|--------------|-------------|-----------|--------|
(List all structures with compliance status and any corrections applied)

### Volume QC
- Structures with anomalous volumes flagged
- Expected ranges vs actual

### RTSTRUCT Export
- Export file path: [path]
- Patient ID: [id]
- Study UID: [uid]
- Number of structures: [count]

### RT Planning Documentation
- AI-generated RT planning summary
- Structure delineation notes
- QC observations

### Examples
- "Auto-contour OARs for RT planning"
- "Create RTSTRUCT for this CT"
- "RT contouring workflow for head and neck treatment"
- "Segment OARs and export RTSTRUCT for thorax plan"
