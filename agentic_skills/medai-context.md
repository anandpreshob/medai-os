---
description: "Shared API reference for all MedAI agent skills — endpoints, schemas, curl patterns"
---

# MedAI API Reference

This is the shared context file for all MedAI agent skills. It documents every REST endpoint, MCP tool schema, curl pattern, model capability, and error handling strategy.

## Server Configuration

```bash
# Primary MedAI server (FastAPI + MONAI Label)
MEDAI_SERVER="${MEDAI_SERVER:-http://localhost:8000}"

# MedGemma detection service (separate vLLM-backed microservice)
MEDGEMMA_SERVER="${MEDGEMMA_SERVER:-http://localhost:8005}"

# Common headers
CONTENT_JSON="Content-Type: application/json"
```

---

## 1. Server Info & Health

### GET /info/
Returns app configuration: models, infers, datastore stats.
```bash
curl -s "$MEDAI_SERVER/info/" | jq .
```

### GET /report/health
LLM service health: status, provider, model, API key config.
```bash
curl -s "$MEDAI_SERVER/report/health" | jq .
```

### GET /logs/gpu
GPU utilization (nvidia-smi output).
```bash
curl -s "$MEDAI_SERVER/logs/gpu"
```

---

## 2. Datastore

### GET /datastore/?output=all
List all images with metadata (image_id, patient_id, modality, study_date, etc.).
```bash
curl -s "$MEDAI_SERVER/datastore/?output=all" | jq .
# Filter by modality:
curl -s "$MEDAI_SERVER/datastore/?output=all" | jq '[.[] | select(.modality == "CT")]'
# Filter by patient:
curl -s "$MEDAI_SERVER/datastore/?output=all" | jq '[.[] | select(.patient_id == "P001")]'
```

### PUT /datastore/image?image={id}
Upload new image (multipart/form-data). Supported: .nii.gz, .nrrd, .dcm, .zip
```bash
curl -X PUT "$MEDAI_SERVER/datastore/image?image=patient001_ct" \
  -F "file=@/path/to/image.nii.gz"
```

### GET /datastore/image?image={id}
Download image file.

### GET /datastore/image/info?image={id}
Get image metadata.

### PUT /datastore/label?image={id}&tag={tag}
Save label/segmentation for an image.

### DELETE /datastore/image?image={id}
Remove image and labels (ADMIN only).

---

## 3. Inference (Direct)

### POST /infer/{model}
Run inference directly (alternative to MCP tool).
```bash
curl -X POST "$MEDAI_SERVER/infer/biomedparse?output=json" \
  -F 'params={"text_prompt": "liver segmentation"}' \
  -F "file=@/path/to/image.nii.gz"
```

---

## 4. Analytics

### POST /analytics/volumetrics
Compute volumetric measurements. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/analytics/volumetrics" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"segment_labels": {"1": "liver", "2": "spleen"}}'
```
**Response fields per segment**: volume_mm3, volume_cm3, voxel_count, instance_count, centroid_ijk, centroid_mm, bounding_box_ijk, longest_axis_mm, max_diameter_mm, dimensions_mm

### POST /analytics/radiomics
Extract ~120 PyRadiomics features. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/analytics/radiomics" \
  -F "image_file=@/path/to/image.nii.gz" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"segment_labels": {"1": "tumor"}}'
```
**Feature classes**: firstorder, shape, glcm, glrlm, glszm, ngtdm, gldm

### POST /analytics/recist-measurements
RECIST 1.1 measurements. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/analytics/recist-measurements" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={
    "segment_labels": {"1": "liver_lesion"},
    "lesion_metadata": [{"segment_index": 1, "is_lymph_node": false, "anatomical_region": "liver"}]
  }'
```
**RECIST rules**: Target ≥10mm (non-LN), LN short axis ≥15mm. MAX_TARGET_LESIONS_TOTAL=5, MAX_PER_ORGAN=2.
**Response**: longest_diameter_mm, short_axis_mm, SLD, measurability, RECIST classification (CR/PR/SD/PD).

---

## 5. SUV (PET Imaging)

### POST /suv/compute
Compute SUV metrics. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/suv/compute" \
  -F "pet_file=@/path/to/pet.nii.gz" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={
    "patient_weight_kg": 70,
    "injected_dose_bq": 370000000,
    "segment_labels": {"1": "lesion"},
    "normalization_method": "bw",
    "suv_threshold": 2.5
  }'
```
**Required params**: patient_weight_kg, injected_dose_bq.
**Optional**: normalization_method (bw/lbm/bsa), half_life_seconds (default F-18: 6586.2), injection_time, scan_time, decay_corrected, patient_height_cm, patient_sex.
**Response per segment**: suv_max, suv_mean, suv_peak, suv_min, suv_std, metabolic_volume_cm3, total_lesion_glycolysis, voxel_count, volume_cm3, max_location_ijk/mm.

### GET /suv/info
Supported methods, defaults, required/optional parameters.

---

## 6. Report Generation

### POST /report/generate
Generate AI-powered radiology report. JSON body.
```bash
curl -X POST "$MEDAI_SERVER/report/generate" \
  -H "$CONTENT_JSON" \
  -d '{
    "modality": "CT",
    "agent_type": "liver",
    "findings": "3cm hypodense lesion in segment 7",
    "volumetrics": {},
    "patient_info": {"patient_id": "P001", "age": 55, "sex": "M"}
  }'
```
**Agent types**: breast, chestxray, medgemma, general, lung, liver, brain, chest_longitudinal, breast_longitudinal, abdomen_longitudinal
**Response sections**: clinicalHistory, technique, comparison, findings, impression, recommendations

### GET /report/agents
List available report agents with supported modalities.

### GET /report/health
LLM service health check.

---

## 7. Batch Processing

### POST /batch/process
Start batch inference job. JSON body.
```bash
curl -X POST "$MEDAI_SERVER/batch/process" \
  -H "$CONTENT_JSON" \
  -d '{
    "files": ["image1.nii.gz", "image2.nii.gz"],
    "model": "biomedparse",
    "prompt": "liver segmentation",
    "options": {"confidence_threshold": 0.5}
  }'
```
**Response**: {job_id, status, total, processed}

### GET /batch/process/{job_id}
Poll job status. Query: include_results (bool).
```bash
curl -s "$MEDAI_SERVER/batch/process/$JOB_ID" | jq .
```

### GET /batch/process
List all jobs. Query: status (filter), limit (max 50).

### POST /batch/process/{job_id}/pause
Pause running job.

### POST /batch/process/{job_id}/resume
Resume paused job.

### POST /batch/process/{job_id}/review
Accept/reject results. Body: {reviews: [{file_path, accept: bool, notes}]}

### POST /batch/process/{job_id}/export
Export accepted results. Body: {format: "coco"|"yolo"|"voc"|"overlay", categories, options}

### DELETE /batch/process/{job_id}
Cancel job (ADMIN only).

---

## 8. Export

### POST /exports/oncology-json
Structured oncology export. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/exports/oncology-json" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={
    "context": {"patient_id": "P001", "study_date": "2025-01-15"},
    "segments": [{"index": 1, "label": "liver_lesion", "category": "target", "anatomical_location": "liver"}],
    "provenance": {"model_name": "biomedparse", "model_version": "1.0"}
  }'
```

### POST /exports/oncology-csv
Same params as oncology-json, returns CSV file.
```bash
curl -X POST "$MEDAI_SERVER/exports/oncology-csv" \
  -F "mask_file=@..." -F 'params={...}' --output oncology.csv
```
**CSV columns**: lesion_id, label, category, location, volume_mm3, volume_cm3, longest_axis_mm, axial_diameter_mm, dimensions_mm, centroid_ijk, voxel_count, measurement_source, confidence, segment_index

### POST /exports/recist-assessment
Calculate RECIST response. JSON body: {currentLesions, baselineLesions, nadirLesions}

### POST /exports/batch-export
Export multiple results. JSON body: {results, categories, format, options}
Returns COCO JSON, or ZIP for YOLO/VOC/overlay.

### GET /exports/formats
Available export formats and options.

### POST /exports/convert-mask
Convert mask format. Query: target_format ("png"|"npy"|"nifti"). Params: slice_index for 3D→2D.

---

## 9. DICOM-SEG

### POST /dicomseg/export
Export mask as DICOM-SEG. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/dicomseg/export" \
  -F "mask_file=@/path/to/mask.nii.gz" \
  -F 'params={"studyUID": "1.2.3", "seriesUID": "1.2.3.4", "segments": [{"label": "liver", "index": 1}]}'
```
Response: DICOM-SEG file + header X-SOP-Instance-UID.

### POST /dicomseg/import
Import DICOM-SEG → NIfTI. Multipart.
```bash
curl -X POST "$MEDAI_SERVER/dicomseg/import" -F "dicom_seg_file=@/path/to/seg.dcm"
```

### POST /dicomseg/upload-pacs
Upload DICOM-SEG to PACS (DICOMweb STOW-RS). **REQUIRES CONFIRMATION**.
```bash
curl -X POST "$MEDAI_SERVER/dicomseg/upload-pacs" \
  -H "X-PACS-URL: http://orthanc:8042/dicom-web" \
  -F "file=@/path/to/dicomseg.dcm"
```

### GET /dicomseg/segments/{study_uid}/{series_uid}
List segments in a DICOM-SEG series.

---

## 10. Registration

### GET /registration/status
Check availability. Response: {available, sitk_version}

### POST /registration/rigid
6-DOF rigid registration. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/registration/rigid" \
  -F "fixed_image_id=current_img" \
  -F "moving_image_id=prior_img"
```
Response: 4x4 transformation matrix.

### POST /registration/affine
12-DOF affine registration. Same params as rigid.

### POST /registration/resample-mask
Propagate segmentation to new space. Multipart.
```bash
curl -X POST "$MEDAI_SERVER/registration/resample-mask" \
  -F "source_mask_id=prior_seg" \
  -F "source_image_id=prior_img" \
  -F "target_image_id=current_img" \
  -F 'transform_matrix=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]' \
  -F "interpolation=nearest"
```

### POST /registration/check-compatibility
Check if two images can be registered. Response: {compatible, reason, spacing_ratio}

---

## 11. RTSTRUCT (RT Contouring)

### POST /rtstruct/export
Export as DICOM RTSTRUCT. Multipart/form-data.
```bash
curl -X POST "$MEDAI_SERVER/rtstruct/export" \
  -F "segmentation_file=@/path/to/seg.nii.gz" \
  -F "reference_image=@/path/to/ct.nii.gz" \
  -F 'params={"patient_id": "P001", "study_uid": "1.2.3", "structures": [{"label": "Heart", "index": 1, "color": [255,0,0]}]}'
```

### POST /rtstruct/parse
Parse existing RTSTRUCT file.

### POST /rtstruct/import
Import RTSTRUCT as NIfTI masks.

### GET /rtstruct/download/{filename}
Download exported RTSTRUCT file.

---

## 12. Neuro Analytics

### POST /neuro_analytics/neuro-metrics
Brain volumes, parcellation, white/gray matter. Multipart.
```bash
curl -X POST "$MEDAI_SERVER/neuro_analytics/neuro-metrics" \
  -F "segmentation_file=@/path/to/brain_seg.nii.gz" \
  -F "image_file=@/path/to/brain.nii.gz"
```

### POST /neuro_analytics/asymmetry-indices
Hemisphere volume comparison.

### POST /neuro_analytics/lesion-classification
Classify brain lesions.

### POST /neuro_analytics/icv-normalization
ICV-normalized brain volumes.

---

## 13. Neuro QC

### POST /neuro-qc/assess-image
Image quality assessment: motion, SNR, coverage, skull strip.
```bash
curl -X POST "$MEDAI_SERVER/neuro-qc/assess-image" \
  -F "image_file=@/path/to/brain.nii.gz" \
  -F 'params={"skip_motion": false, "skip_snr": false}'
```
Response: motion (score, severity), snr (value, quality), coverage, skull_strip, overall_score, is_usable.

### POST /neuro-qc/assess-segmentation
Segmentation quality: fragmentation, missing labels, per-segment info.
```bash
curl -X POST "$MEDAI_SERVER/neuro-qc/assess-segmentation" \
  -F "segmentation_file=@/path/to/seg.nii.gz" \
  -F "image_file=@/path/to/brain.nii.gz" \
  -F 'params={"expected_labels": [1,2,3,4,5]}'
```

---

## 14. Neuro Longitudinal

### POST /neuro_longitudinal/neuro-longitudinal
Full longitudinal neuro comparison.

### POST /neuro_longitudinal/atrophy-rate
Annualized atrophy rates.

### POST /neuro_longitudinal/top-changes
Regions with most volume change.

---

## 15. Triage

### POST /triage/prioritize
Prioritize studies. JSON body.
```bash
curl -X POST "$MEDAI_SERVER/triage/prioritize" \
  -H "$CONTENT_JSON" \
  -d '{
    "studies": [{"studyUID": "1.2.3", "patientName": "DOE^JOHN", "modality": "CT", "studyDescription": "CT Chest"}],
    "useLLM": true,
    "autoFetchDetections": true
  }'
```
Response: triagedStudies (priorityRank, triageLevel: STAT/URGENT/SEMI_URGENT/ROUTINE, priorityScore 0-100, rationale).

### GET /triage/health
Service health.

### GET /triage/levels
Triage level descriptions and turnaround times.

---

## 16. Audit

### GET /audit/verify
Verify hash chain integrity. Response: {valid, records_checked, error}.
```bash
curl -s "$MEDAI_SERVER/audit/verify" | jq .
```

### GET /audit/query
Query logs. Params: event_types, username, patient_id, study_uid, segmentation_id, start_time, end_time, severities, limit, offset, sort_order.

### GET /audit/stats
Event counts by type, user, time period. Params: start_time, end_time.

### GET /audit/export
Export as JSONL or CSV. Params: format ("jsonl"|"csv") + query filters.

### POST /audit/log
Log events. Body: {events: [...]}

### GET /audit/segmentation/{segmentation_id}
Audit trail for specific segmentation.

### GET /audit/study/{study_uid}
Audit trail for specific study.

---

## 17. MedGemma Detection Service

Separate microservice at `$MEDGEMMA_SERVER` (default port 8005).

### POST /detect
Detection with bounding boxes.
```bash
IMAGE_B64=$(base64 -i /path/to/cxr.png)
curl -X POST "$MEDGEMMA_SERVER/detect" \
  -H "$CONTENT_JSON" \
  -d "{\"image\": \"$IMAGE_B64\", \"threshold\": 0.3}"
```
Response: {detections: [{label, confidence, x_min, y_min, x_max, y_max}], description, processing_time_ms}

### POST /describe
Image description.
```bash
curl -X POST "$MEDGEMMA_SERVER/describe" \
  -H "$CONTENT_JSON" \
  -d "{\"image\": \"$IMAGE_B64\"}"
```

### GET /health
Service health.

### GET /info
Service info.

---

## 18. RT Suites & TG-263

### GET /suites/
List available RT contouring suites.

### POST /suites/validate-names
Validate structure names against TG-263.
```bash
curl -X POST "$MEDAI_SERVER/suites/validate-names" \
  -H "$CONTENT_JSON" \
  -d '{"names": ["Heart", "Lung_L", "SpinalCord"]}'
```

### GET /suites/naming/tg263/{structure_name}
Look up TG-263 compliant name.

---

## MCP Tool Schemas

The MCP server exposes 11 tools. Skills can invoke them via the MCP protocol or equivalent REST endpoints.

### run_segmentation
```json
{
  "session_id": "string (required)",
  "model": "biomedparse | medsam | totalsegmentator",
  "text_prompt": "liver segmentation",
  "point_prompts": [{"x": 0.5, "y": 0.5, "z": 50, "label": 1}],
  "box_prompt": {"x_min": 0.1, "y_min": 0.2, "x_max": 0.8, "y_max": 0.9},
  "slice_index": 50,
  "propagate_3d": true
}
```
Output: preview_id, labels[], model_used, inference_time_ms, confidence, requires_confirmation

### save_annotation
```json
{
  "preview_id": "string (required)",
  "format": "nifti | dicom-seg | png | npz",
  "destination": "local | pacs | both",
  "filename_prefix": "patient001",
  "include_metadata": true,
  "labels_to_save": [1, 2]
}
```
Output: saved_files[], pacs_uid, segmentation_id, success

### load_session
```json
{
  "query": "yesterday's liver study",
  "session_id": "optional",
  "patient_id": "optional",
  "date_range_days": 30,
  "modality_filter": "CT"
}
```
Output: session_id, modality, body_region, study_date, segmentations[], has_unsaved_changes

### batch_process
```json
{
  "scope": "all | selected | filter",
  "model": "biomedparse",
  "prompt": "liver and spleen",
  "filter_criteria": {"modality": "CT"},
  "selected_image_ids": ["img1", "img2"],
  "save_format": "nifti | dicom-seg",
  "auto_save": false,
  "max_concurrent": 2
}
```
Output: job_id, total_images, status, completed_count, failed_count, estimated_time_remaining_s

### edit_annotation
```json
{
  "segmentation_id": "string (required)",
  "operation": "grow | shrink | smooth | delete_label | rename_label | merge_labels | split | fill_holes",
  "label_id": 1,
  "pixels": 5,
  "new_label_name": "tumor_core",
  "target_label_id": 2
}
```
Output: preview_id, original_labels[], updated_labels[], changes_summary, can_undo

### case_context
```json
{
  "session_id": "string (required)",
  "include_segmentations": true,
  "include_analytics": true,
  "include_detections": true
}
```
Output: session_id, modality, body_region, segmentations[], volumetrics_summary, radiomics_summary, detections[], is_longitudinal, prior_studies[]

### pubmed_search
```json
{
  "query": "liver segmentation deep learning",
  "max_results": 10,
  "date_range_years": 5
}
```
Output: articles[] (pmid, title, authors, abstract, journal, pub_date, url, citation), total_count

### semantic_scholar_search
```json
{
  "query": "liver segmentation deep learning",
  "max_results": 10
}
```
Output: papers[] (paper_id, title, authors, abstract, year, venue, citation_count, url, is_open_access), total_count

### local_rag_search
```json
{
  "query": "BI-RADS 4 management",
  "top_k": 5,
  "filter_type": "guideline | template | ontology | all",
  "modality": "MR",
  "body_region": "breast"
}
```
Output: results[] (id, content, source_type, score), total_found, query_time_ms

### evidence_summarizer
```json
{
  "question": "clinical question",
  "pubmed_articles": [],
  "semantic_scholar_papers": [],
  "local_guidelines": [],
  "max_length_words": 500
}
```
Output: summary, key_points[], evidence_quality (high/moderate/low), citations[], limitations, recommendation_strength

### report_agent
```json
{
  "task": "draft_findings | draft_impression | draft_full_report",
  "case_context": {},
  "guidelines": [],
  "evidence": [],
  "radiologist_notes": "",
  "report_style": "standard | structured | concise"
}
```
Output: section_name, content, citations_used[], guidelines_referenced[], confidence_note

---

## Model Capabilities

| Model | Type | Input | Structures | Notes |
|-------|------|-------|------------|-------|
| biomedparse | Text-prompted | NIfTI + text prompt | Any named structure | Supports [SEP], comma, "and" separators |
| totalsegmentator | Automatic | NIfTI | CT: 117, MR: 56 | Full-body or region-specific |
| medsam / sam2 | Interactive | NIfTI + points/boxes | Any (guided) | Point prompts with fg/bg labels |
| sam3 | Interactive 3D | NIfTI + points/boxes | Any (guided) | 3D-aware segmentation |
| nninteractive | Interactive | NIfTI + points | Any (guided) | nnU-Net based interactive |
| medgemma | Detection | PNG/JPEG base64 | Chest findings | Bounding box detections |

---

## Confirmation Policy

**Requires explicit user confirmation:**
- Batch processing (multi-patient operations)
- PACS exports (destination=pacs or destination=both)
- RTSTRUCT export (clinical RT use)
- Destructive operations (delete image, delete label, cancel job)

**Runs immediately (no confirmation):**
- Single segmentation
- Analytics (volumetrics, radiomics, RECIST, SUV)
- Report generation
- Local file exports
- Literature search
- Audit queries
- QC checks
- Triage

---

## Error Handling

| HTTP Code | Meaning | Recovery |
|-----------|---------|----------|
| 400 | Bad request / validation error | Check params, fix and retry |
| 401 | Unauthorized | Check auth token |
| 404 | Resource not found | Verify image/session ID exists |
| 409 | Conflict (job already running) | Wait or cancel existing |
| 413 | File too large | Compress or split |
| 422 | Validation error (Pydantic) | Fix request schema |
| 500 | Internal server error | Check server logs, retry once |
| 503 | Service unavailable (GPU busy) | Wait and retry |

**Retry strategy**: Retry once on 500/503 with 5s delay. Do not retry 4xx errors.

---

## Audit Integration

Every skill should log its operation on completion:
```bash
curl -X POST "$MEDAI_SERVER/audit/log" \
  -H "$CONTENT_JSON" \
  -d '{"events": [{"event_type": "segmentation_created", "details": {"model": "biomedparse", "labels": ["liver"]}}]}'
```
