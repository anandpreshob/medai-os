---
description: "Run batch AI segmentation across multiple patients or studies with progress tracking"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Run AI segmentation in batch across multiple patients or studies. This is a long-running operation that requires user confirmation before starting due to its scope and compute cost.

## Parameters
Parse from user request: $ARGUMENTS

- `scope` (str, required): "all", "selected", or "filter". Inferred from request.
- `model` (str, default "biomedparse"): Model to use for all images in the batch.
- `prompt` (str, required): Anatomical structures to segment. E.g., "liver and spleen".
- `filter_criteria` (dict, optional): For scope=filter. Keys: `modality`, `body_region`, `date_range`.
- `selected_image_ids` (list of str, optional): For scope=selected. Resolved from datastore.
- `save_format` (str, default "nifti"): "nifti" or "dicom-seg".
- `auto_save` (bool, default false): Whether to auto-save results without review.
- `max_concurrent` (int, 1-10, default 2): Parallel inference workers.

**Scope resolution from user request**:
- "patients 1-25" or "images img_001 to img_025" -> `scope=selected`, resolve image IDs
- "all CT scans" -> `scope=filter`, `filter_criteria={"modality": "CT"}`
- "all chest studies" -> `scope=filter`, `filter_criteria={"body_region": "chest"}`
- "all" or "everything" or "entire dataset" -> `scope=all`

## Workflow

1. Parse scope, model, and prompt from the user request.

2. If `scope=selected` and image IDs need resolution, fetch the datastore index:
```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/datastore/?output=all"
```
Then resolve patient/image IDs from the response. Map patient ranges (e.g., "patients 1-25") to their corresponding image IDs.

3. If `scope=filter`, build the `filter_criteria` dict from the user's description.

4. **CONFIRMATION GATE** -- Present the batch plan and wait for user approval:
```
Batch Segmentation Plan:
  Scope:    <scope> (<detail>)
  Images:   <total_images> studies
  Model:    <model>
  Prompt:   "<prompt>"
  Format:   <save_format>
  Workers:  <max_concurrent>
  Est. Time: ~<estimated_minutes> minutes

Proceed? (yes/no)
```
**Do NOT start the batch until the user explicitly confirms.**

5. Start the batch job:
```bash
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/batch/process" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "<scope>",
    "model": "<model>",
    "prompt": "<prompt>",
    "filter_criteria": <filter_criteria_or_null>,
    "selected_image_ids": <ids_or_null>,
    "save_format": "<save_format>",
    "auto_save": <auto_save>,
    "max_concurrent": <max_concurrent>
  }'
```

6. Poll for progress every 5 seconds:
```bash
curl -s "${MEDAI_SERVER:-http://localhost:8000}/batch/process/<job_id>"
```
Display a progress update each poll cycle:
```
[####------] 4/10 completed | 1 failed | ~3 min remaining
```

7. When status is "completed" or "cancelled", display the final summary.

8. After completion, offer review and export options:
```bash
# Review results
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/batch/process/<job_id>/review"

# Export results
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/batch/process/<job_id>/export"
```

## Confirmation Required
**YES** -- User must confirm before the batch starts. Display the image count, estimated time, and model/prompt details. Only proceed after explicit "yes" from the user.

## Output Format

**During execution** (progress updates):
```
Batch job <job_id> running...
[########--] 8/10 completed | 0 failed | ~1 min remaining
```

**On completion**:
```
Batch Segmentation Complete:
  Job ID:     <job_id>
  Total:      <total_images> images
  Completed:  <completed_count>
  Failed:     <failed_count>
  Duration:   <elapsed_time>

Labels found across batch:
  - <label>: avg <volume> mL (range <min>-<max> mL)
  ...

Next steps:
  - Review results: /medai-batch-segment review <job_id>
  - Export results: /medai-batch-segment export <job_id>
```

If any images failed, list them with error reasons so the user can retry individually.
