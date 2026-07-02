---
description: "Generate structured radiology reports using AI agents specialized by modality and body region"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Generate a structured radiology report using an AI agent selected by modality and body region. The report includes standard sections: clinical history, technique, comparison, findings, impression, and recommendations.

## Parameters
Parse from user request: $ARGUMENTS
- **modality**: Infer from case context or user mention (CT, MR, CR, PT, etc.)
- **body_region**: Infer from user mention or loaded study (breast, chest, lung, liver, brain, abdomen)
- **agent_type**: Auto-select using logic below; user may override explicitly
- **findings**: Radiologist's initial findings text, if provided
- **patient_info**: Extract patient_id, age, sex, clinical_history from case context or user input
- **clinical_context**: Any additional clinical context the user provides

### Agent Auto-Selection Logic
| Condition | agent_type |
|---|---|
| Breast MRI or mammography | `breast` |
| Chest X-ray | `chestxray` or `medgemma` |
| Lung CT | `lung` |
| Liver CT or MR | `liver` |
| Brain MR | `brain` |
| Any modality + longitudinal data present | append `_longitudinal` (e.g. `chest_longitudinal`) |
| Default / unclear | `general` |

## Workflow

1. **Get case context** using the `case_context` MCP tool if a session is loaded to obtain modality, patient info, and study metadata.

2. **Auto-select agent_type** from the modality and body region using the table above. If the user explicitly names an agent, use that instead.

3. **Gather prior analyses** (optional). If volumetrics, radiomics, or detection results exist from earlier steps in this session, include them in the request body.

4. **Search guidelines** (optional). Use the `local_rag_search` MCP tool to retrieve relevant reporting guidelines or templates for the modality/region.

5. **List available agents** (optional, for discovery):
```bash
curl -s "$MEDAI_SERVER/report/agents" | jq .
```

6. **Generate the report**:
```bash
curl -X POST "$MEDAI_SERVER/report/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "modality": "CT",
    "agent_type": "liver",
    "findings": "3cm hypodense lesion in segment 7",
    "volumetrics": {},
    "radiomics": {},
    "patient_info": {"patient_id": "P001", "age": 55, "sex": "M", "clinical_history": ""},
    "clinical_context": "",
    "detections": [],
    "longitudinal": null,
    "mosaic_image": null
  }'
```

7. **Display the report** by presenting each section clearly:
   - **Clinical History**
   - **Technique**
   - **Comparison**
   - **Findings**
   - **Impression**
   - **Recommendations**

8. If the response `success` field is `false`, display the `error` message and suggest corrective action.

## Confirmation Required
No confirmation needed for single report generation.

## Output Format
Present the generated report with each section as a labeled heading. Include the agent_type used and any warnings or errors from the response. If volumetrics or detections were included, note that in the output summary.

### Example Requests
- "Generate a report for this breast MRI"
- "Create a chest CT report with findings: bilateral ground-glass opacities"
- "Write a report for patient 5"
- "Generate a liver MR report using the longitudinal agent"
