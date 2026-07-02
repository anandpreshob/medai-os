---
description: "Run AI detection on medical images using MedGemma or inference models for abnormality detection"
---

You are a MedAI agent skill. Execute the following medical imaging task.
Refer to the medai-context skill for full API reference and curl patterns.

## Task
Run AI-powered detection on medical images. Supports two modes: (1) MedGemma for 2D image detection with bounding boxes and natural language descriptions, and (2) the standard inference endpoint for 3D model-based detection/segmentation.

## Parameters
Parse from user request: $ARGUMENTS
- **image** (required): path to image file, base64 string, session ID, or datastore image ID
- **mode** (optional): "detect" (bounding boxes) or "describe" (natural language), default "detect"
- **threshold** (optional): confidence threshold 0-1, default 0.3
- **model** (optional): specific model name for 3D inference; if omitted, use MedGemma for 2D
- **prompt** (optional): custom prompt for describe mode

**Inference rules**:
- "detect abnormalities on this X-ray" -> mode="detect", use MedGemma
- "describe this scan" -> mode="describe", use MedGemma
- "run detection model on this CT" -> use inference endpoint with appropriate model
- "find nodules" -> mode="detect", adjust prompt or model for lung nodules

## Workflow

### MedGemma Detection (2D images)
1. Get the image — from session context, file path, or base64 string.
2. Convert to base64 if a file path is provided:
   ```bash
   IMAGE_B64=$(base64 -i /path/to/image.png)
   ```

3. Check MedGemma service health:
   ```bash
   curl -s "$MEDGEMMA_SERVER/health" | jq .
   ```
   `$MEDGEMMA_SERVER` defaults to `http://localhost:8005`.

4. Run detection:
   ```bash
   curl -X POST "$MEDGEMMA_SERVER/detect" \
     -H "Content-Type: application/json" \
     -d "{\"image\": \"$IMAGE_B64\", \"threshold\": 0.3}"
   ```

5. Or run description:
   ```bash
   curl -X POST "$MEDGEMMA_SERVER/describe" \
     -H "Content-Type: application/json" \
     -d "{\"image\": \"$IMAGE_B64\", \"prompt\": \"Describe any abnormalities visible in this chest X-ray.\"}"
   ```

### Standard Inference (3D volumes)
1. Check available models:
   ```bash
   curl -s "$MEDAI_SERVER/info/" | jq '.models | keys'
   ```
   `$MEDAI_SERVER` defaults to `http://localhost:8000`.

2. Run inference:
   ```bash
   # Using session ID
   curl -X POST "$MEDAI_SERVER/infer/MODEL_NAME?session_id=SESSION_ID&output=json" \
     -d '{"params": {"confidence_threshold": 0.5}}'

   # Using image from datastore
   curl -X POST "$MEDAI_SERVER/infer/MODEL_NAME?image=IMAGE_ID&output=json" \
     -d '{}'

   # Using file upload
   curl -X POST "$MEDAI_SERVER/infer/MODEL_NAME?output=json" \
     -F "file=@/path/to/image.nii.gz" \
     -F 'params={"confidence_threshold": 0.5}'
   ```

## Confirmation Required
None. Detection/inference is a read-only operation.

## Output Format

### Detection Results
**Model**: MODEL_NAME | **Image**: IMAGE_ID | **Detections**: X found

| # | Finding | Confidence | Bounding Box | Location |
|---|---------|-----------|--------------|----------|
| 1 | Cardiomegaly | 0.95 | (x,y,w,h) | Global |
| 2 | Pleural Effusion | 0.87 | (x,y,w,h) | Right lower |

**Processing Time**: X ms

### Description (if describe mode)
Natural language description of findings from the model.

### Summary
- High confidence findings (> 0.8): [list]
- Moderate confidence findings (0.5-0.8): [list]
- Below threshold: X detections filtered out

If no detections are found above the threshold, report that clearly. Suggest lowering the threshold or trying a different model if the user expected findings.

## Examples
- "Run AI detection on this chest X-ray"
- "Detect abnormalities in this image"
- "Describe this CT scan slice"
- "What does MedGemma see in this image?"
- "Find nodules in this lung CT"
