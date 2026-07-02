---
description: "Prioritize radiology studies into STAT, URGENT, SEMI_URGENT, and ROUTINE triage levels"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Triage and prioritize a batch of radiology studies for radiologist review. Uses a hybrid approach: rules-based classification for STAT/URGENT cases, AI detection analysis for X-ray studies (CR, DX, XR modalities), and LLM-based refinement for ordering within priority tiers.

## Parameters
Parse from user request: $ARGUMENTS
- **studies** (optional): if user specifies specific studies; otherwise fetch from datastore
- **useLLM** (optional): enable LLM-enhanced triage, default true
- **autoFetchDetections** (optional): auto-fetch AI detections from Orthanc for X-ray studies, default true

## Workflow

1. Get the study list. If user provides specific studies, use those. Otherwise fetch from datastore:
   ```bash
   curl -s "$MEDAI_SERVER/datastore/?output=all" | jq .
   ```

2. Build the StudyInput list. Each study can include:
   - `studyUID` (required): DICOM Study Instance UID
   - `patientName`, `patientID`, `studyDate`, `modality`, `studyDescription`
   - `reasonForVisit`: clinical reason/indication
   - `urgencyFlag`: "STAT", "URGENT", or "ROUTINE"
   - `patientHistory`, `symptoms`
   - `patientLocation`: "ED", "ICU", "Floor", "Outpatient"
   - `detections`: pre-computed AI findings (label, confidence, bounding box)

3. Check triage service health:
   ```bash
   curl -s "$MEDAI_SERVER/triage/health" | jq .
   ```

4. Prioritize studies:
   ```bash
   curl -X POST "$MEDAI_SERVER/triage/prioritize" \
     -H "Content-Type: application/json" \
     -d '{
       "studies": [
         {
           "studyUID": "1.2.840.xxxxx",
           "patientName": "Patient Name",
           "patientID": "MRN123",
           "studyDate": "20260209",
           "modality": "CR",
           "studyDescription": "Chest PA and Lateral",
           "reasonForVisit": "Shortness of breath",
           "urgencyFlag": "STAT",
           "patientLocation": "ED",
           "symptoms": "Acute dyspnea, chest pain"
         }
       ],
       "useLLM": true,
       "autoFetchDetections": true
     }'
   ```
   `$MEDAI_SERVER` defaults to `http://localhost:8000`.

   When `autoFetchDetections` is true, the server automatically retrieves AI detection results from Orthanc attachments for X-ray modalities (CR, DX, XR) if no detections are provided in the request.

5. Parse the `TriageResponse`:
   - `triagedStudies`: list with `priorityRank`, `triageLevel`, `priorityScore` (0-100), `rationale`, `keyFactors`, `rulesApplied`
   - `statCount`, `urgentCount`, `semiUrgentCount`, `routineCount`

6. Optionally get triage level reference:
   ```bash
   curl -s "$MEDAI_SERVER/triage/levels" | jq .
   ```

## Triage Levels
| Level | Description | Turnaround | Color |
|-------|-------------|------------|-------|
| STAT | Immediate attention required | ASAP | Red |
| URGENT | High priority | < 24 hours | Orange |
| SEMI_URGENT | Moderate priority | < 48 hours | Yellow |
| ROUTINE | Standard workflow | Standard | Green |

## Confirmation Required
None. Triage is an advisory prioritization — it does not modify study data.

## Output Format

### Triage Summary
- **Total**: X studies
- **STAT**: X | **URGENT**: X | **SEMI-URGENT**: X | **ROUTINE**: X

### Prioritized Worklist
| Rank | Patient | Modality | Study | Level | Score | Key Factors | Rationale |
|------|---------|----------|-------|-------|-------|-------------|-----------|
| 1 | Name (MRN) | CT | Description | STAT | 95 | ED, SOB | ... |

STAT and URGENT cases should be listed first and flagged prominently.

### AI Detections (if applicable)
For X-ray studies with auto-fetched detections:
| Study | Finding | Confidence |
|-------|---------|------------|

### Rules Applied
- List deterministic rules that triggered for STAT/URGENT cases

## Examples
- "Triage the current worklist"
- "Prioritize today's studies"
- "Which study should I read first?"
- "Triage this ED chest X-ray — patient has acute SOB"
