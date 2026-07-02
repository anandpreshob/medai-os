---
description: "Run AI segmentation on a loaded session using BiomedParse, TotalSegmentator, or interactive SAM models"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Run a single AI segmentation inference on the currently loaded session. Automatically selects the best model based on the user's request, builds the appropriate prompt, and displays volumetric results.

## Parameters
Parse from user request: $ARGUMENTS

- `session_id` (str, required): The active session. Obtain from prior `/medai-session` call or case context.
- `model` (str, default "biomedparse"): One of "biomedparse", "medsam", "totalsegmentator". Inferred from request.
- `text_prompt` (str, optional): Anatomical structures to segment. E.g., "liver", "liver and spleen".
- `point_prompts` (list, optional): Interactive point prompts. Each: `{x, y, z, label (1=foreground, 0=background), is_normalized}`.
- `box_prompt` (dict, optional): Bounding box `{x_min, y_min, x_max, y_max}` with normalized 0-1 coordinates.
- `slice_index` (int, optional): Target slice for 2D inference.
- `propagate_3d` (bool, default true): Whether to propagate 2D results across the volume.

**Model selection logic** (infer from user request):
- User says "totalsegmentator", "total seg", or "all organs" -> `model=totalsegmentator`
- User provides a text prompt or says "biomedparse" -> `model=biomedparse`
- User says "interactive", "click", or provides point/box prompts -> `model=medsam`
- Default when unclear -> `model=biomedparse`

**BiomedParse prompt formatting**:
- Supports `[SEP]`, comma, and "and" as separators
- "liver and kidney" -> `text_prompt="liver[SEP]kidney"`
- "liver, kidney, spleen" -> `text_prompt="liver[SEP]kidney[SEP]spleen"`
- Single organ "liver" -> `text_prompt="liver"`

**Multi-patient detection**: If the request mentions multiple patients (e.g., "segment liver for patients 1-25"), tell the user to use `/medai-batch-segment` instead.

## Workflow

1. Determine the model from the user's request using the selection logic above.

2. Build the `text_prompt` by extracting anatomical terms and joining with `[SEP]`.

3. Call the MCP `run_segmentation` tool:
```bash
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "run_segmentation",
    "input": {
      "session_id": "<session_id>",
      "model": "<model>",
      "text_prompt": "<prompt>",
      "propagate_3d": true
    }
  }'
```

For interactive prompts with points:
```bash
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "run_segmentation",
    "input": {
      "session_id": "<session_id>",
      "model": "medsam",
      "point_prompts": [{"x": 0.5, "y": 0.5, "z": 50, "label": 1, "is_normalized": true}],
      "slice_index": 50,
      "propagate_3d": true
    }
  }'
```

Alternative direct inference endpoint (for file-based inference):
```bash
curl -X POST "${MEDAI_SERVER:-http://localhost:8000}/infer/biomedparse?output=json" \
  -F "params={\"text_prompt\": \"liver\"}" \
  -F "file=@image.nii.gz"
```

4. Parse the `RunSegmentationOutput` response.

5. Display results:
   - Model used and inference time
   - Labels found with volumes and colors
   - Confidence score (if available)

6. If results look good (confidence > 0.5 or no confidence reported), auto-save via:
```bash
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "save_annotation",
    "input": {
      "preview_id": "<preview_id>"
    }
  }'
```

## Confirmation Required
None. Single segmentation runs immediately and auto-saves on success.

## Output Format

```
Segmentation complete:
  Model:     <model_used>
  Time:      <inference_time_ms> ms
  Confidence: <confidence or "N/A">

Labels found:
  - <name> (index <index>): <volume> mL [<color>]
  ...

Annotation saved.
```

If segmentation fails or returns no labels, report the error and suggest:
- Checking that the session is loaded
- Trying a different model
- Adjusting the text prompt
