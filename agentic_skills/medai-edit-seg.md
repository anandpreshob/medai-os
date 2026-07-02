---
description: "Edit an existing segmentation with morphological operations like grow, shrink, smooth, merge, or delete labels"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Edit an existing segmentation mask using morphological and label operations. Supports growing, shrinking, smoothing, deleting, renaming, merging, splitting labels, and filling holes.

## Parameters
Parse from user request: $ARGUMENTS

- `segmentation_id` (str, required): ID of the segmentation to edit. If not provided, obtain from the current case context or the most recent segmentation result.
- `operation` (str, required): One of: "grow", "shrink", "smooth", "delete_label", "rename_label", "merge_labels", "split", "fill_holes".
- `label_id` (int, optional): Target label index for the operation.
- `pixels` (int, 1-50, optional): Number of pixels to grow or shrink by. Default varies by operation.
- `new_label_name` (str, optional): New name for rename_label operation.
- `target_label_id` (int, optional): Target label to merge into for merge_labels operation.
- `parameters` (dict, optional): Additional operation-specific parameters.

**Operation inference from user request**:
- "grow liver by 3 pixels" -> operation="grow", label_id=<liver_index>, pixels=3
- "shrink the tumor" -> operation="shrink", label_id=<tumor_index>, pixels=1 (default)
- "smooth the boundary" or "smooth liver" -> operation="smooth", label_id=<label_index>
- "delete background" or "remove label 0" -> operation="delete_label", label_id=0
- "rename label 1 to tumor" -> operation="rename_label", label_id=1, new_label_name="tumor"
- "merge labels 1 and 2" or "combine liver and spleen" -> operation="merge_labels", label_id=1, target_label_id=2
- "split the segmentation" -> operation="split"
- "fill holes in liver" -> operation="fill_holes", label_id=<liver_index>

**Label resolution**: When the user refers to labels by name (e.g., "liver", "tumor"), resolve the label_id from the current session's segmentation metadata. If ambiguous, ask the user to clarify.

## Workflow

1. Parse the operation and parameters from the user request.

2. If `segmentation_id` is not provided, retrieve it from the current case context or ask the user.

3. Resolve any label names to label IDs using the session's segmentation metadata.

4. Call the MCP `edit_annotation` tool:
```bash
curl -s -X POST "${MEDAI_SERVER:-http://localhost:8000}/mcp/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "edit_annotation",
    "input": {
      "segmentation_id": "<segmentation_id>",
      "operation": "<operation>",
      "label_id": <label_id_or_null>,
      "pixels": <pixels_or_null>,
      "new_label_name": "<name_or_null>",
      "target_label_id": <target_or_null>,
      "parameters": <params_or_null>
    }
  }'
```

5. Parse the response and display the changes summary.

6. If `can_undo` is true, inform the user they can undo the operation.

## Confirmation Required
None. Single edit operations are applied immediately and can be undone.

## Output Format

```
Edit applied:
  Operation:  <operation_applied>
  Summary:    <changes_summary>

Labels before: <original_labels>
Labels after:  <updated_labels>

[Undo available: say "undo" to revert this change.]
```

If the operation fails (e.g., invalid label ID, segmentation not found), display the error and suggest:
- Checking that a segmentation exists in the current session
- Listing available labels with their IDs
- Verifying the segmentation_id is correct
