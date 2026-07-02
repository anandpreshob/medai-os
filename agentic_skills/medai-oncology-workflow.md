---
description: "End-to-end oncology assessment workflow combining segmentation, analytics, reporting, and export"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Run a complete oncology assessment pipeline: segment lesions, compute volumetrics and radiomics, measure RECIST diameters, optionally compute SUV metrics, generate an AI report with literature evidence, and export structured results.

## Parameters
Parse from user request: $ARGUMENTS
- **patient_id / session_id** — identifier for the study (infer from context or datastore)
- **body_region** — e.g. liver, lung, pelvis (determines lesion prompts and agent selection)
- **is_pet** — true if modality is PET or PET/CT (enables SUV step)
- **export_to_pacs** — true if user requests PACS export (triggers confirmation gate)
- **baseline_lesions** — prior lesion metadata if available (for RECIST response classification)

## Workflow

1. **Segment lesions** → Use `/medai-segment` with model=biomedparse and a lesion prompt appropriate for the body region (e.g. "liver lesion", "lung nodule").

2. **Compute metrics (parallel)**:
   - `/medai-volumetrics` → compute volumes for all segmented lesion labels
   - `/medai-radiomics` → extract radiomic features from segmentation

3. **RECIST measurements** → `/medai-recist` with lesion metadata including target/non-target classification.

4. **SUV metrics (conditional)** → If `is_pet` is true, run `/medai-suv` to compute SUVmax, SUVmean, SUVpeak, and metabolic tumor volume.

5. **Generate report + evidence (parallel)**:
   - `/medai-report` → AI-generated oncology report incorporating volumetrics, radiomics, and RECIST data
   - `/medai-report-evidence` → search literature for evidence supporting findings

6. **Export (parallel)**:
   - `/medai-export-oncology` → structured JSON/CSV export with full provenance chain
   - `/medai-export` → DICOM-SEG to PACS (**REQUIRES CONFIRMATION**)

7. **Verify audit chain**:
   ```bash
   curl -s "$MEDAI_SERVER/audit/verify"
   ```
   Confirm audit hash-chain integrity for the session.

## Error Recovery
If any step fails, report the error clearly and continue with the remaining steps. Preserve and present all partial results. Do not abort the entire workflow for a single step failure.

## Confirmation Required
- **PACS export**: Always confirm with the user before pushing DICOM-SEG to PACS.
- **Batch processing**: If multiple studies are involved, confirm scope before proceeding.

## Output Format
Present a summary dashboard:

### Lesion Table
| Lesion | Label | Volume (cm³) | Longest Diameter (mm) | Target/Non-Target | RECIST Classification |
|--------|-------|-------------|----------------------|-------------------|----------------------|

### Key Radiomics Features
- Shape: sphericity, elongation, surface-to-volume ratio
- First-order: mean, skewness, kurtosis, entropy
- Texture: GLCM contrast, correlation, homogeneity

### SUV Metrics (if PET)
| Lesion | SUVmax | SUVmean | SUVpeak | MTV (cm³) | TLG |

### Report Sections
- Clinical summary
- Findings with measurements
- Literature evidence citations

### Export & Audit
- Export file paths (JSON/CSV)
- PACS UIDs (if exported)
- Audit verification status: PASS / FAIL

### Examples
- "Run full oncology assessment on this liver CT"
- "Complete oncology workup for patient 5"
- "Oncology pipeline for this PET/CT with PACS export"
