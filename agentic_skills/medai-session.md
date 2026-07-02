---
description: "Load or resume a MedAI viewer session by patient ID, session ID, or natural language query"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Load or resume a DICOM viewer session. This retrieves study metadata, existing segmentations, and session state so the user can continue working on a case.

## Parameters
Parse from user request: $ARGUMENTS

- `query` (str, required): Natural language description if no explicit IDs given. E.g., "yesterday's liver study", "recent chest CT".
- `session_id` (str, optional): Direct session ID if user provides one (e.g., "resume session abc-123").
- `patient_id` (str, optional): Patient identifier (e.g., "patient 5", "MRN 12345").
- `date_range_days` (int, 1-365, default 30): How far back to search. Widen if user says "old" or "last year".
- `modality_filter` (str, optional): CT, MR, US, XR, etc. Infer from context (e.g., "CT scan" -> "CT").

**Inference rules**:
- "patient 5" or "patient_id 5" -> patient_id="5"
- "session abc-123" or "resume abc-123" -> session_id="abc-123"
- "yesterday's liver CT" -> query="liver CT", date_range_days=2, modality_filter="CT"
- "last year's MRI" -> query="MRI", date_range_days=365, modality_filter="MR"

## Workflow

1. Parse the user request to extract `session_id`, `patient_id`, `modality_filter`, `date_range_days`, or a natural language `query`.

2. Call the MCP `load_session` tool:
```bash
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "load_session",
    "input": {
      "query": "<parsed_query>",
      "session_id": "<if_provided>",
      "patient_id": "<if_provided>",
      "date_range_days": <days>,
      "modality_filter": "<if_provided>"
    }
  }'
```

3. Parse the `LoadSessionOutput` response.

4. Display session info to the user:
   - Session ID
   - Study description, modality, body region
   - Study date
   - Existing segmentations (label name, volume in mL, color, instance count)
   - Last modified timestamp

5. If `has_unsaved_changes` is true, warn the user:
   > **Warning**: This session has unsaved changes from a previous editing session.

6. If `thumbnail_url` is present, mention it is available for preview.

## Confirmation Required
None. Loading a session is a read-only operation.

## Output Format

```
Session loaded:
  ID:          <session_id>
  Study:       <study_description>
  Modality:    <modality> | Body Region: <body_region>
  Study Date:  <study_date>
  Created:     <session_created> | Modified: <last_modified>

Existing Segmentations:
  - <label> : <volume_ml> mL (<instance_count> instances) [<color>]
  ...

[Warning: Unsaved changes detected from previous session.]
```

If no session is found, inform the user and suggest broadening the search (wider date range, different modality, or checking the patient ID).
