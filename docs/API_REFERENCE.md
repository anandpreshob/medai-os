# MONAI Label Server API Reference

Complete API documentation for the MedAI MONAI Label server with SAM2/SAM3 interactive segmentation.

---

## Base URLs

All services are accessible via the nginx gateway at port 8002. Direct internal ports are listed for debugging.

| Service | External (via nginx) | Internal Port | Description |
|---------|---------------------|---------------|-------------|
| API Gateway | 8002 | - | nginx reverse proxy (main entry point) |
| Inference (MONAI) | 8002/monai/* | 8001 | AI segmentation models |
| MedGemma | 8002/monai/medgemma/* | 8004 | Image detection/description |
| LLM Service | 8002/llm/* | 8003 | Report generation |
| Chat Service | 8002/chat/* | 8005 | LangGraph radiology Q&A |
| Orthanc PACS | 8042 | 8042 | DICOMweb server |

**Examples:**
- API Gateway: `http://localhost:8002`
- Inference via gateway: `http://localhost:8002/monai/info/`
- Chat via gateway: `http://localhost:8002/chat/health`
- Direct inference (debug): `http://localhost:8001/info/`

---

## Authentication

Currently, the server does not require authentication. For production deployments, consider adding authentication via:
- nginx reverse proxy with Basic Auth
- API Gateway with token authentication
- VPN access only

---

## Endpoints

### 1. Health Check

**Endpoint:** `GET /`

Check if the server is running.

**Request:**
```bash
curl http://localhost:8002/
```

**Response:**
```json
{
  "status": "UP"
}
```

**Status Codes:**
- `200 OK` - Server is running
- `503 Service Unavailable` - Server is down

---

### 2. Server Information

**Endpoint:** `GET /info/`

Get server information, loaded models, and configuration.

**Request:**
```bash
curl http://localhost:8002/info/
```

**Response:**
```json
{
  "name": "MONAILabel - Radiology (0.8.1)",
  "version": "0.8.1",
  "description": "DeepLearning models for radiology",
  "labels": [
    "spleen",
    "kidney_right",
    "kidney_left",
    "gallbladder",
    "liver",
    ...
  ],
  "models": {
    "segmentation": {
      "type": "segmentation",
      "labels": {
        "spleen": 1,
        "kidney_right": 2,
        "kidney_left": 3,
        ...
      },
      "dimension": 3,
      "description": "A pre-trained model for volumetric (3D) Segmentation from CT image",
      "config": {
        "largest_cc": false
      }
    },
    "Histogram+GraphCut": {
      "type": "scribbles",
      ...
    },
    "GMM+GraphCut": {
      "type": "scribbles",
      ...
    }
  },
  "trainers": {},
  "strategies": {
    "random": {...},
    "first": {...},
    "last": {...}
  },
  "scoring": {},
  "train_stats": {},
  "datastore": {
    "objects": 0,
    "completed": 0
  },
  "config": {...}
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Server name and version |
| `version` | string | MONAI Label version |
| `labels` | array | All available segmentation labels |
| `models` | object | Loaded inference models |
| `datastore` | object | Datastore statistics |

**Status Codes:**
- `200 OK` - Success

---

### 3. Run Inference

**Endpoint:** `POST /infer/{model}`

Run inference using the specified model.

**Models:**
- `segmentation` - Interactive SAM2/SAM3 segmentation (primary use case)
- `Histogram+GraphCut` - Classical segmentation
- `GMM+GraphCut` - Classical segmentation

**Request Format:**

Content-Type: `multipart/form-data`

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes* | ZIP of DICOM series, single DICOM, or NIfTI file |
| `image` | string | Yes* | Image ID (if using datastore) |
| `params` | JSON string | Yes | Inference parameters |
| `label` | File | No | Existing label file for refinement |
| `output` | string | No | Output format: `image`, `json`, `all` (default: `all`) |

*Either `file` or `image` must be provided

**Params JSON Structure:**

```json
{
  "nninter": "sam3",           // Required: "init", "sam3", or "reset"
  "prompt_info": [...],        // Optional: Array of prompts (OHIF format)
  "pos_points": [[x,y,z]],     // Optional: Positive point prompts
  "neg_points": [[x,y,z]],     // Optional: Negative point prompts
  "pos_boxes": [[x1,y1,x2,y2,z]], // Optional: Positive box prompts
  "neg_boxes": [[x1,y1,x2,y2,z]], // Optional: Negative box prompts
  "device": "cuda",            // Optional: "cuda" or "cpu" (default: "cuda")
  "result_extension": ".nrrd", // Optional: Output format (ignored for now)
  "result_dtype": "uint16",    // Optional: Output data type (ignored for now)
  "result_compress": false,    // Optional: Compress output (ignored for now)
  "restore_label_idx": false   // Optional: Restore label indices (ignored for now)
}
```

**nninter Modes:**

| Mode | Description | Returns |
|------|-------------|---------|
| `init` | Initialize session with DICOM series | Empty JSON `{}` |
| `sam3` | Run SAM3 segmentation with prompts | Segmentation mask + metadata |
| `reset` | Reset session and clear all interactions | Empty JSON `{}` |

**Prompt Info Format (OHIF):**

```json
{
  "prompt_info": [
    {
      "type": "point",
      "data": {
        "pointType": "click",  // "click" = positive, "erase" = negative
        "slice": 40,           // Z-coordinate (slice index)
        "x": 256,              // X-coordinate in pixels
        "y": 256               // Y-coordinate in pixels
      }
    },
    {
      "type": "box",
      "data": {
        "pointType": "click",
        "slice": 40,
        "x": 100,              // Top-left X
        "y": 100,              // Top-left Y
        "width": 50,           // Box width
        "height": 50           // Box height
      }
    }
  ]
}
```

**Direct Prompt Format:**

```json
{
  "pos_points": [
    [256, 256, 40],  // [x, y, z] in pixel coordinates
    [200, 200, 40]
  ],
  "neg_points": [
    [100, 100, 40]
  ],
  "pos_boxes": [
    [100, 100, 150, 150, 40]  // [x1, y1, x2, y2, z]
  ],
  "neg_boxes": []
}
```

**Response Format:**

Content-Type: `multipart/form-data`

The response contains multiple parts:

**Part 1: params** (JSON metadata)
```json
{
  "prompt_info": {
    "pos_points": [[256, 256, 40]],
    "neg_points": [],
    "pos_boxes": [],
    "neg_boxes": []
  },
  "nninter_elapsed": 0.578,      // Inference time in seconds
  "flipped": true,                // Whether image was flipped
  "label_name": "nninter_pred_20260106044256"  // Generated label name
}
```

**Part 2: image** (Binary segmentation mask)
- Format: NIfTI (`.nii.gz`)
- Data type: uint8
- Dimensions: Same as input DICOM series (W x H x D)
- Values: 0 = background, 1 = segmented region

**Example Requests:**

**1. Initialize Session:**
```bash
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@/path/to/dicom_series.zip" \
  -F 'params={"nninter":"init"}'
```

**Response:**
```json
{}
```

**2. Segment with Single Point (OHIF format):**
```bash
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@/path/to/dicom_series.zip" \
  -F 'params={
    "nninter": "sam3",
    "prompt_info": [
      {
        "type": "point",
        "data": {
          "pointType": "click",
          "slice": 40,
          "x": 256,
          "y": 256
        }
      }
    ]
  }'
```

**3. Segment with Multiple Points (Direct format):**
```bash
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@/path/to/dicom_series.zip" \
  -F 'params={
    "nninter": "sam3",
    "pos_points": [[256, 256, 40], [200, 200, 40]],
    "neg_points": [[100, 100, 40]]
  }'
```

**4. Segment with Box Prompt:**
```bash
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@/path/to/dicom_series.zip" \
  -F 'params={
    "nninter": "sam3",
    "pos_boxes": [[100, 100, 200, 200, 40]]
  }'
```

**5. Reset Session:**
```bash
curl -X POST "http://localhost:8002/infer/segmentation" \
  -F "file=@/path/to/dicom_series.zip" \
  -F 'params={"nninter":"reset"}'
```

**Response:**
```json
{}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| `200 OK` | Inference successful |
| `400 Bad Request` | Invalid parameters or file format |
| `500 Internal Server Error` | Server error during inference |

**Common Errors:**

**Missing nninter parameter:**
```json
{
  "detail": "KeyError: 'nninter'"
}
```
Fix: Add `"nninter": "init"` or `"nninter": "sam3"` to params

**Invalid file format:**
```json
{
  "detail": "Neither Image nor File not Session ID input is provided"
}
```
Fix: Ensure `file` field is included in request

**GPU out of memory:**
```json
{
  "detail": "CUDA out of memory"
}
```
Fix: Reduce image size, restart server, or use smaller batch size

---

## JavaScript/TypeScript Integration

### Using Fetch API

```typescript
async function runSegmentation(
  serverUrl: string,
  dicomZipBlob: Blob,
  prompts: Array<{x: number, y: number, slice: number, positive: boolean}>
): Promise<{metadata: any, maskBlob: Blob}> {

  // Build form data
  const formData = new FormData();

  // Add DICOM file
  formData.append('file', dicomZipBlob, 'series.zip');

  // Add parameters
  const params = {
    nninter: 'sam3',
    prompt_info: prompts.map(p => ({
      type: 'point',
      data: {
        pointType: p.positive ? 'click' : 'erase',
        slice: p.slice,
        x: p.x,
        y: p.y
      }
    }))
  };
  formData.append('params', JSON.stringify(params));

  // Send request
  const response = await fetch(`${serverUrl}/infer/segmentation`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  // Parse multipart response
  const contentType = response.headers.get('content-type') || '';
  const boundary = contentType.split('boundary=')[1];

  const arrayBuffer = await response.arrayBuffer();
  const text = new TextDecoder().decode(arrayBuffer);

  // Extract parts
  const parts = text.split(`--${boundary}`);

  // Parse JSON metadata
  const metadataPart = parts.find(p => p.includes('name="params"'));
  const metadataJson = metadataPart?.split('\r\n\r\n')[1].split('\r\n')[0];
  const metadata = JSON.parse(metadataJson || '{}');

  // Extract binary mask
  const imagePart = parts.find(p => p.includes('name="image"'));
  const imageData = imagePart?.split('\r\n\r\n')[1];
  // Note: This is simplified - actual implementation needs proper binary parsing

  return {
    metadata,
    maskBlob: new Blob([imageData], {type: 'application/gzip'})
  };
}
```

### Using Axios

```typescript
import axios from 'axios';
import FormData from 'form-data';

async function initSession(serverUrl: string, dicomFile: Buffer) {
  const formData = new FormData();
  formData.append('file', dicomFile, 'series.zip');
  formData.append('params', JSON.stringify({nninter: 'init'}));

  const response = await axios.post(
    `${serverUrl}/infer/segmentation`,
    formData,
    {
      headers: formData.getHeaders()
    }
  );

  return response.data; // {}
}

async function segment(
  serverUrl: string,
  dicomFile: Buffer,
  points: Array<[number, number, number]>
) {
  const formData = new FormData();
  formData.append('file', dicomFile, 'series.zip');
  formData.append('params', JSON.stringify({
    nninter: 'sam3',
    pos_points: points,
    neg_points: []
  }));

  const response = await axios.post(
    `${serverUrl}/infer/segmentation`,
    formData,
    {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer'
    }
  );

  return response.data; // multipart data
}
```

---

## Python Integration

### Using requests

```python
import requests
import json

def init_session(server_url: str, dicom_zip_path: str):
    """Initialize segmentation session."""
    with open(dicom_zip_path, 'rb') as f:
        files = {'file': ('series.zip', f, 'application/zip')}
        data = {'params': json.dumps({'nninter': 'init'})}

        response = requests.post(
            f'{server_url}/infer/segmentation',
            files=files,
            data=data
        )
        response.raise_for_status()
        return response.json()

def run_segmentation(
    server_url: str,
    dicom_zip_path: str,
    pos_points: list,
    neg_points: list = None
):
    """Run interactive segmentation."""
    params = {
        'nninter': 'sam3',
        'pos_points': pos_points,
        'neg_points': neg_points or []
    }

    with open(dicom_zip_path, 'rb') as f:
        files = {'file': ('series.zip', f, 'application/zip')}
        data = {'params': json.dumps(params)}

        response = requests.post(
            f'{server_url}/infer/segmentation',
            files=files,
            data=data
        )
        response.raise_for_status()

        # Parse multipart response
        content_type = response.headers['content-type']
        boundary = content_type.split('boundary=')[1]

        # Simple parsing (for production, use multipart parser library)
        parts = response.content.split(f'--{boundary}'.encode())

        # Extract metadata
        for part in parts:
            if b'name="params"' in part:
                metadata_json = part.split(b'\r\n\r\n')[1].split(b'\r\n')[0]
                metadata = json.loads(metadata_json.decode())
            elif b'name="image"' in part:
                image_data = part.split(b'\r\n\r\n')[1]

        return metadata, image_data

# Example usage
if __name__ == '__main__':
    server = 'http://localhost:8002'
    dicom_file = '/path/to/series.zip'

    # Initialize
    init_session(server, dicom_file)

    # Segment with point prompts
    metadata, mask = run_segmentation(
        server,
        dicom_file,
        pos_points=[[256, 256, 40]],
        neg_points=[[100, 100, 40]]
    )

    print(f"Inference time: {metadata['nninter_elapsed']:.3f}s")
    print(f"Label: {metadata['label_name']}")

    # Save mask
    with open('segmentation_mask.nii.gz', 'wb') as f:
        f.write(mask)
```

---

## File Format Specifications

### Input Formats

**1. ZIP of DICOM Series**

Structure (flat):
```
series.zip
├── IM0001.dcm
├── IM0002.dcm
├── IM0003.dcm
└── ...
```

Structure (nested - also supported):
```
series.zip
└── 2.000000-PRE LIVER-76970/
    ├── IM0001.dcm
    ├── IM0002.dcm
    └── ...
```

**2. Single DICOM File**
- Extension: `.dcm`
- Format: DICOM Part 10 format

**3. NIfTI File**
- Extension: `.nii` or `.nii.gz`
- Format: NIfTI-1

### Output Format

**NIfTI Segmentation Mask**
- Format: NIfTI-1 compressed (`.nii.gz`)
- Data type: uint8
- Dimensions: [W, H, D] matching input series
- Coordinate system: RAS (Right-Anterior-Superior)
- Values:
  - 0: Background
  - 1: Segmented region

**Metadata JSON**
```json
{
  "prompt_info": {
    "pos_points": [[x, y, z], ...],
    "neg_points": [[x, y, z], ...],
    "pos_boxes": [[x1, y1, x2, y2, z], ...],
    "neg_boxes": [[x1, y1, x2, y2, z], ...]
  },
  "nninter_elapsed": 0.578,
  "flipped": true,
  "label_name": "nninter_pred_TIMESTAMP"
}
```

---

## MedGemma Detection API

The MedGemma service provides AI-powered chest X-ray analysis with bounding box detection.

### Health Check

**Endpoint:** `GET /monai/medgemma/health`

Check MedGemma service status.

**Request:**
```bash
curl http://localhost:8002/monai/medgemma/health
```

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "gpu_available": true
}
```

---

### Service Info

**Endpoint:** `GET /monai/medgemma/info`

Get MedGemma service information.

**Request:**
```bash
curl http://localhost:8002/monai/medgemma/info
```

**Response:**
```json
{
  "service": "medgemma-wrapper",
  "version": "1.0.0",
  "model": "medgemma-4b",
  "endpoints": ["/health", "/info", "/detect"]
}
```

---

### Run Detection

**Endpoint:** `POST /monai/medgemma/detect`

Run AI detection on a chest X-ray image.

**Request:**

Content-Type: `application/json`

```json
{
  "image": "<base64 encoded image>",
  "image_id": "patient_13_cxr",
  "return_boxes": true
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | string | Yes | Base64-encoded image data |
| `image_id` | string | No | Optional identifier for tracking |
| `return_boxes` | boolean | No | Return bounding box coordinates (default: true) |

**Response:**
```json
{
  "detections": [
    {
      "id": "det_001",
      "label": "Pneumothorax",
      "confidence": 0.92,
      "x_min": 0.65,
      "y_min": 0.20,
      "x_max": 0.85,
      "y_max": 0.45,
      "source": "ai"
    },
    {
      "id": "det_002",
      "label": "Pleural Effusion",
      "confidence": 0.78,
      "x_min": 0.10,
      "y_min": 0.60,
      "x_max": 0.35,
      "y_max": 0.90,
      "source": "ai"
    }
  ],
  "description": "The chest X-ray shows a right-sided pneumothorax with partial lung collapse. There is also evidence of a small left pleural effusion at the costophrenic angle.",
  "processing_time_ms": 1250
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `detections` | array | List of detected abnormalities |
| `detections[].id` | string | Unique detection identifier |
| `detections[].label` | string | Abnormality type (e.g., "Pneumothorax") |
| `detections[].confidence` | float | Confidence score (0.0 - 1.0) |
| `detections[].x_min` | float | Left edge of bounding box (normalized 0-1) |
| `detections[].y_min` | float | Top edge of bounding box (normalized 0-1) |
| `detections[].x_max` | float | Right edge of bounding box (normalized 0-1) |
| `detections[].y_max` | float | Bottom edge of bounding box (normalized 0-1) |
| `detections[].source` | string | Source of detection ("ai" or "manual") |
| `description` | string | Natural language description of findings |
| `processing_time_ms` | int | Inference time in milliseconds |

**Bounding Box Coordinate System:**
- Coordinates are normalized to [0, 1] range
- Origin (0, 0) is top-left corner of image
- (1, 1) is bottom-right corner
- To convert to pixel coordinates: `pixel_x = normalized_x * image_width`

**Confidence Levels:**
- **High (>0.80)**: Report as definite findings
- **Moderate (0.50-0.80)**: Report as probable findings
- **Low (<0.50)**: Report as possible findings for review

**Status Codes:**
- `200 OK` - Detection successful
- `400 Bad Request` - Invalid image data
- `503 Service Unavailable` - Model not loaded

---

## Report Generation API

Generate structured radiology reports with LLM.

### Generate Report

**Endpoint:** `POST /report/generate`

Generate an AI-assisted radiology report.

**Request:**

Content-Type: `application/json`

```json
{
  "agent_type": "medgemma",
  "image_data": "<base64 mosaic image>",
  "radiologist_findings": "Patient presents with shortness of breath...",
  "ai_detections": [
    {"label": "Pneumothorax", "confidence": 0.92}
  ],
  "volumetrics": {...},
  "clinical_context": "58-year-old male with chest pain"
}
```

**Response:**
```json
{
  "report_id": "rpt_20260123_001",
  "sections": {
    "clinicalHistory": "58-year-old male presenting with chest pain...",
    "technique": "PA and lateral chest radiographs obtained...",
    "comparison": "No prior studies available for comparison.",
    "findings": "The patient's observations note shortness of breath...",
    "aiFindings": "**High Confidence Findings (>80%):**\n- Pneumothorax (92% confidence) - right upper lung zone\n\n**Moderate Confidence Findings:**\n- None detected",
    "impression": "1. Right pneumothorax requiring immediate attention...",
    "recommendations": "1. Urgent thoracic surgery consultation..."
  },
  "agent_type": "medgemma",
  "generated_at": "2026-01-23T10:30:00Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `report_id` | string | Unique report identifier |
| `sections.clinicalHistory` | string | Patient history and indication |
| `sections.technique` | string | Imaging technique description |
| `sections.comparison` | string | Prior study comparison |
| `sections.findings` | string | **Radiologist** observations (human input) |
| `sections.aiFindings` | string | **AI-detected** abnormalities (MedGemma) |
| `sections.impression` | string | Summary combining both sources |
| `sections.recommendations` | string | Follow-up recommendations |
| `agent_type` | string | Agent used for generation |
| `generated_at` | string | ISO timestamp of generation |

**Available Agent Types:**
- `medgemma` - Chest X-ray with AI detection integration
- `breast_analysis` - BI-RADS formatted reports
- `lung_analysis` - Lung-RADS formatted reports
- `liver_analysis` - LI-RADS formatted reports
- `brain_analysis` - Neuroimaging reports
- `general` - Standard radiology reports

---

## Performance Benchmarks

Tested on NVIDIA A10 GPU (24GB VRAM):

| Operation | Image Size | Time | Notes |
|-----------|-----------|------|-------|
| Session Init | 512x512x43 | ~0.18s | First time loads model |
| Point Inference | 512x512x43 | ~0.58s | SAM3 with 1 point |
| Box Inference | 512x512x43 | ~0.62s | SAM3 with 1 box |
| Multi-point | 512x512x43 | ~0.71s | SAM3 with 5 points |

**Optimization Tips:**
- Initialize session once, reuse for multiple inferences
- Batch multiple prompts in single request
- Use GPU instance for 10-20x speedup vs CPU

---

## Rate Limits

Currently no rate limits enforced. For production:
- Consider nginx rate limiting (e.g., 10 req/min per IP)
- Monitor GPU memory usage
- Implement request queuing for concurrent requests

---

---

## Oncology Suite API

Endpoints for tumor analysis, RECIST assessment, PET/SUV metrics, and clinical trial workflows.

### Lesion Analysis

**Endpoint:** `POST /analytics/lesion_analysis`

Compute per-lesion metrics from a segmentation mask.

**Request:**

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mask_file` | File | Yes | NIfTI segmentation mask |
| `params` | JSON string | No | Additional parameters |

**Response:**
```json
{
  "lesions": [
    {
      "lesion_id": "Tumor_1",
      "label_index": 1,
      "instance_id": 1,
      "label_name": "Tumor",
      "volume_mm3": 8234.5,
      "volume_cm3": 8.23,
      "centroid_ijk": [128, 145, 67],
      "bounding_box": [[110, 130, 55], [146, 160, 79]]
    }
  ],
  "summary": {
    "total_lesion_count": 3,
    "total_tumor_burden_mm3": 12400.0,
    "total_tumor_burden_cm3": 12.4,
    "largest_lesion_id": "Tumor_1",
    "largest_lesion_volume_cm3": 8.23
  }
}
```

---

### RECIST Measurements

**Endpoint:** `POST /analytics/recist-measurements`

Compute RECIST 1.1 measurements for segmentation mask.

**Request:**

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mask_file` | File | Yes | NIfTI segmentation mask |
| `image_file` | File | No | Source image for spacing |
| `params` | JSON string | No | `{ "is_lymph_node": [false, true, ...] }` |

**Response:**
```json
{
  "measurements": [
    {
      "segment_index": 1,
      "label_name": "Lesion_1",
      "longest_diameter_mm": 32.5,
      "short_axis_mm": 18.2,
      "is_measurable": true,
      "is_lymph_node": false
    }
  ],
  "sum_of_longest_diameters": 52.7
}
```

---

### SUV Computation

**Endpoint:** `POST /suv/compute`

Compute SUV metrics for PET imaging.

**Request:**

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image_file` | File | Yes | PET image (NIfTI or DICOM) |
| `mask_file` | File | Yes | Segmentation mask |
| `params` | JSON string | Yes | SUV parameters (see below) |

**Params JSON:**
```json
{
  "injected_dose_mbq": 370.0,
  "patient_weight_kg": 70.0,
  "scan_time": "2026-01-26T10:30:00",
  "injection_time": "2026-01-26T09:30:00",
  "half_life_seconds": 6586.2,
  "suv_threshold": 2.5
}
```

**Response:**
```json
{
  "metrics": [
    {
      "segment_label": "Tumor",
      "segment_index": 1,
      "suv_max": 12.4,
      "suv_mean": 6.8,
      "suv_peak": 11.2,
      "metabolic_volume_ml": 15.3,
      "total_lesion_glycolysis": 104.0
    }
  ]
}
```

---

### Image Registration

**Endpoint:** `POST /registration/rigid`

Compute 6-DOF rigid registration between two images.

**Request:**

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fixed_image` | File | Yes | Reference image (NIfTI) |
| `moving_image` | File | Yes | Image to register (NIfTI) |

**Response:**
```json
{
  "transform_matrix": [
    [0.998, -0.052, 0.031, 2.5],
    [0.051, 0.998, 0.028, -1.2],
    [-0.032, -0.027, 0.999, 0.8],
    [0, 0, 0, 1]
  ],
  "registration_error_mm": 1.23,
  "iterations": 150
}
```

**Endpoint:** `POST /registration/affine`

Compute 12-DOF affine registration.

**Endpoint:** `POST /registration/resample-mask`

Resample a segmentation mask to target space using a transform.

---

### DICOM-SEG Export/Import

**Endpoint:** `POST /dicomseg/export`

Convert NIfTI segmentation to DICOM-SEG format.

**Request:**

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mask_file` | File | Yes | NIfTI segmentation |
| `source_dicom` | File | No | Source DICOM for metadata |
| `params` | JSON string | No | Segment metadata |

**Response:**
Returns DICOM-SEG file as binary download.

**Endpoint:** `POST /dicomseg/import`

Convert DICOM-SEG to NIfTI format.

---

### Structured Oncology Export

**Endpoint:** `POST /exports/oncology/json`

Export structured oncology measurements with provenance.

**Request:**
```json
{
  "session_id": "sess_123",
  "include_provenance": true,
  "include_radiomics": false
}
```

**Response:**
```json
{
  "version": "1.0.0",
  "export_type": "oncology_measurements",
  "context": {
    "patient_id": "PT001",
    "study_instance_uid": "1.2.3.4",
    "study_date": "2026-01-26"
  },
  "lesions": [...],
  "response_assessment": {
    "target_response": "PR",
    "overall_response": "PR",
    "sld_change_percent": -35.2
  },
  "provenance": {
    "segmentation_model": { "name": "biomedparse", "version": "1.0" },
    "edits": [],
    "reviewer": { "username": "dr_smith", "status": "final" }
  }
}
```

---

### Audit Log

**Endpoint:** `GET /audit/logs`

Query audit log entries (admin only).

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | ISO date filter start |
| `end_date` | string | ISO date filter end |
| `resource_type` | string | Filter by resource type |
| `action` | string | Filter by action type |

**Response:**
```json
{
  "entries": [
    {
      "timestamp": "2026-01-26T10:30:00Z",
      "username": "dr_smith",
      "action": "inference",
      "resource_type": "segmentation",
      "resource_id": "seg_123",
      "details": { "model": "biomedparse", "prompt": "liver tumor" }
    }
  ],
  "total_count": 150,
  "page": 1
}
```

---

### Audit Chain Verification

**Endpoint:** `GET /audit/verify`

Verify the integrity of the audit log hash chain. Each audit record is linked via SHA-256 hashes, making tampering computationally detectable.

**Request:**
```bash
curl http://localhost:8002/audit/verify
```

**Response (Valid Chain):**
```json
{
  "valid": true,
  "records_checked": 142,
  "error": null
}
```

**Response (Broken Chain):**
```json
{
  "valid": false,
  "records_checked": 87,
  "error": "Hash mismatch at record 87: expected abc123..., got def456..."
}
```

**Status Codes:**
- `200 OK` - Chain verification complete, chain is valid
- `409 Conflict` - Chain verification complete, integrity violation detected

**Hash Chain Schema (v1.1.0):**

| Field | Description |
|-------|-------------|
| `schemaVersion` | Schema version string (`"1.1.0"`) |
| `canonicalPayloadHash` | SHA-256 of deterministic JSON payload |
| `prevRecordHash` | `recordHash` of preceding record (`"GENESIS"` for first) |
| `recordHash` | `SHA-256(prevRecordHash + "\n" + canonicalPayloadHash)` |

**Regulatory Compliance:**
- Supports FDA 21 CFR Part 11 audit trail requirements
- Supports IEC 62304 software lifecycle traceability
- Canonical JSON ensures reproducible hashes across systems

---

## Batch Processing API

Batch process multiple images through AI segmentation models with export to multiple formats.

### Start Batch Job

**Endpoint:** `POST /batch/process`

Start a new batch processing job.

**Request:**

Content-Type: `application/json`

```json
{
  "model": "biomedparse",
  "images": [
    {"image_id": "img_001", "path": "/data/ct_001.nii.gz"},
    {"image_id": "img_002", "path": "/data/ct_002.nii.gz"}
  ],
  "prompt_config": {
    "text_prompts": ["liver", "spleen"]
  },
  "export_config": {
    "formats": ["nifti", "coco"]
  },
  "save_to_pacs": false
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model to use: "biomedparse", "medsam", "totalsegmentator" |
| `images` | array | Yes | Array of images with image_id and path |
| `prompt_config` | object | Yes | Segmentation parameters |
| `prompt_config.text_prompts` | array | No | Text prompts for BiomedParse |
| `export_config` | object | No | Export settings |
| `export_config.formats` | array | No | Output formats: "nifti", "dicom-seg", "coco", "yolo", "voc", "png" |
| `save_to_pacs` | boolean | No | Upload results to PACS (default: false) |

**Response:**
```json
{
  "job_id": "batch_abc123",
  "status": "queued",
  "total_images": 2,
  "created_at": "2026-01-26T10:00:00Z"
}
```

---

### Get Batch Job Status

**Endpoint:** `GET /batch/process/{job_id}`

Get the status and results of a batch job.

**Response:**
```json
{
  "job_id": "batch_abc123",
  "status": "running",
  "progress_percent": 50.0,
  "processed_images": 1,
  "total_images": 2,
  "current_image": "img_002",
  "results": [
    {
      "image_id": "img_001",
      "status": "completed",
      "labels": ["liver", "spleen"],
      "thumbnail_url": "/api/batch/batch_abc123/img_001/thumbnail",
      "inference_time_ms": 1250
    }
  ],
  "errors": []
}
```

**Status Values:**
- `queued` - Job is waiting to start
- `running` - Job is actively processing
- `completed` - All images processed
- `failed` - Job failed with errors
- `cancelled` - Job was cancelled

---

### Cancel Batch Job

**Endpoint:** `DELETE /batch/process/{job_id}`

Cancel a running batch job.

**Response:**
```json
{
  "job_id": "batch_abc123",
  "status": "cancelled",
  "processed_images": 1,
  "message": "Job cancelled by user"
}
```

---

### Review Batch Results

**Endpoint:** `POST /batch/process/{job_id}/review`

Accept or reject individual results from a batch job.

**Request:**
```json
{
  "reviews": [
    {"image_id": "img_001", "status": "accepted"},
    {"image_id": "img_002", "status": "rejected", "reason": "Poor segmentation quality"}
  ]
}
```

**Response:**
```json
{
  "job_id": "batch_abc123",
  "accepted_count": 1,
  "rejected_count": 1,
  "pending_count": 0
}
```

---

### Export Batch Results

**Endpoint:** `POST /batch/process/{job_id}/export`

Export accepted results to specified formats.

**Request:**
```json
{
  "formats": ["coco", "yolo"],
  "include_rejected": false,
  "output_dir": "/data/exports"
}
```

**Response:**
```json
{
  "job_id": "batch_abc123",
  "exports": [
    {
      "format": "coco",
      "path": "/data/exports/batch_abc123_coco.json",
      "size_bytes": 24567
    },
    {
      "format": "yolo",
      "path": "/data/exports/batch_abc123_yolo/",
      "file_count": 10
    }
  ]
}
```

---

### Batch WebSocket Progress

**Endpoint:** `WS /batch/ws/{job_id}`

Real-time progress updates via WebSocket.

**Message Format:**
```json
{
  "type": "progress",
  "job_id": "batch_abc123",
  "progress_percent": 75.0,
  "current_image": "img_003",
  "processed": 3,
  "total": 4,
  "eta_seconds": 15
}
```

**Message Types:**
- `progress` - Progress update
- `image_complete` - Single image completed
- `job_complete` - Entire job finished
- `error` - Error occurred

---

## Export Formats

### COCO JSON Format

Standard COCO instance segmentation format for ML training.

```json
{
  "info": {"description": "MedAI Export", "version": "1.0"},
  "images": [
    {"id": 1, "file_name": "ct_001.nii.gz", "width": 512, "height": 512}
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "segmentation": [[x1, y1, x2, y2, ...]],
      "area": 12345,
      "bbox": [x, y, width, height],
      "iscrowd": 0
    }
  ],
  "categories": [
    {"id": 1, "name": "liver", "supercategory": "organ"}
  ]
}
```

### YOLO Format

YOLO object detection format with normalized coordinates.

```
# labels/ct_001.txt
0 0.45 0.52 0.35 0.40
1 0.65 0.48 0.15 0.20
```

Format: `class_id center_x center_y width height` (all normalized 0-1)

### Pascal VOC XML

```xml
<annotation>
  <filename>ct_001.png</filename>
  <size><width>512</width><height>512</height><depth>1</depth></size>
  <object>
    <name>liver</name>
    <bndbox>
      <xmin>120</xmin><ymin>100</ymin>
      <xmax>300</xmax><ymax>280</ymax>
    </bndbox>
  </object>
</annotation>
```

---

## Knowledge Service API (Port 8005)

The Knowledge Service provides RAG (Retrieval-Augmented Generation) capabilities with ChromaDB vector search.

### Health Check

**Endpoint:** `GET /health`

Check Knowledge Service status.

**Response:**
```json
{
  "status": "healthy",
  "chromadb_connected": true,
  "embedding_model_loaded": true,
  "collections": ["medai_guidelines", "medai_templates", "medai_ontology"]
}
```

---

### Query Knowledge Base

**Endpoint:** `POST /knowledge/query`

Search the local knowledge base for guidelines, templates, and ontology terms.

**Request:**
```json
{
  "query": "breast MRI BI-RADS category 4",
  "top_k": 5,
  "filter_type": "guideline",
  "modality": "MR",
  "body_region": "breast"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query text |
| `top_k` | int | No | Number of results (default: 5) |
| `filter_type` | string | No | Filter by type: "guideline", "template", "ontology", "all" |
| `modality` | string | No | Filter by imaging modality |
| `body_region` | string | No | Filter by anatomical region |

**Response:**
```json
{
  "results": [
    {
      "id": "doc_birads_001",
      "content": "BI-RADS 4: Suspicious abnormality. Biopsy should be considered...",
      "metadata": {
        "source_type": "guideline",
        "title": "ACR BI-RADS Atlas",
        "modality": "MR",
        "body_region": "breast",
        "section": "Assessment Categories"
      },
      "score": 0.92
    }
  ],
  "total_found": 12
}
```

---

### List Collections

**Endpoint:** `GET /knowledge/collections`

Get all collections with statistics.

**Response:**
```json
{
  "collections": [
    {
      "name": "medai_guidelines",
      "document_count": 245,
      "metadata": {
        "description": "Clinical guidelines (BI-RADS, ACR, RSNA)",
        "last_updated": "2026-01-26T10:00:00Z"
      }
    },
    {
      "name": "medai_templates",
      "document_count": 89,
      "metadata": {
        "description": "Report templates (RSNA RadReport)",
        "last_updated": "2026-01-26T10:00:00Z"
      }
    }
  ]
}
```

---

### Ingest Document

**Endpoint:** `POST /knowledge/ingest`

Ingest a new document into the knowledge base.

**Request:**

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | PDF, Markdown, or HTML file |
| `params` | JSON string | Yes | Ingestion parameters |

**Params JSON:**
```json
{
  "source_type": "guideline",
  "modality": "CT",
  "body_region": "chest",
  "chunker": "semantic"
}
```

**Response:**
```json
{
  "document_id": "doc_abc123",
  "chunks_created": 24,
  "collection": "medai_guidelines",
  "status": "success"
}
```

---

## Chat Service API (Port 8005)

The Chat Service provides LangGraph-based orchestration for the Ask MedAI chatbot.

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "knowledge_service_connected": true,
  "mcp_tools_available": 11,
  "active_sessions": 5
}
```

---

### Send Chat Message

**Endpoint:** `POST /chat`

Send a message and receive a response with source citations.

**Request:**
```json
{
  "session_id": "sess_abc123",
  "message": "What is the differential diagnosis for a solitary pulmonary nodule?",
  "include_sources": true,
  "stream": false
}
```

**Response:**
```json
{
  "session_id": "sess_abc123",
  "message": "A solitary pulmonary nodule (SPN) has several differential diagnoses...\n\n**Benign causes:**\n- Granuloma (histoplasmosis, TB)\n- Hamartoma\n- Infectious nodule\n\n**Malignant causes:**\n- Primary lung cancer\n- Metastasis\n- Carcinoid tumor\n\nAccording to the Fleischner Society guidelines...",
  "sources": [
    {
      "type": "guideline",
      "title": "Fleischner Society Guidelines for Pulmonary Nodules",
      "authors": ["MacMahon H", "Naidich DP", "Goo JM"],
      "url": null,
      "excerpt": "Nodules ≥8 mm in high-risk patients should undergo CT at 3 months...",
      "relevance_score": 0.94
    },
    {
      "type": "pubmed",
      "title": "Evaluation of the Solitary Pulmonary Nodule",
      "authors": ["Gould MK", "Donington J"],
      "url": "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      "excerpt": "The probability of malignancy increases with nodule size...",
      "relevance_score": 0.87
    }
  ],
  "case_context_used": false
}
```

---

### Stream Chat Response (SSE)

**Endpoint:** `POST /chat/stream`

Stream response via Server-Sent Events.

**Request:** Same as `/chat`

**Response:** SSE stream with events:
```
event: chunk
data: {"content": "A solitary "}

event: chunk
data: {"content": "pulmonary nodule "}

event: sources
data: {"sources": [...]}

event: done
data: {"session_id": "sess_abc123"}
```

---

### Create Chat Session

**Endpoint:** `POST /chat/session/create`

Create a new chat session.

**Response:**
```json
{
  "session_id": "sess_xyz789",
  "created_at": "2026-01-26T10:30:00Z",
  "expires_at": "2026-01-27T10:30:00Z"
}
```

---

### Link Session to Viewer

**Endpoint:** `POST /chat/session/link`

Link a chat session to a viewer session for automatic context injection.

**Request:**
```json
{
  "chat_session_id": "sess_xyz789",
  "viewer_session_id": "viewer_abc123"
}
```

**Response:**
```json
{
  "linked": true,
  "case_context": {
    "modality": "CT",
    "body_region": "chest",
    "segmentations": ["left_lung", "right_lung", "nodule"],
    "is_longitudinal": false
  }
}
```

---

### Get Session History

**Endpoint:** `GET /chat/session/{session_id}`

Get full session history.

**Response:**
```json
{
  "session_id": "sess_xyz789",
  "viewer_session_id": "viewer_abc123",
  "messages": [
    {
      "role": "user",
      "content": "What is the differential for this nodule?",
      "timestamp": "2026-01-26T10:30:00Z",
      "has_context": true
    },
    {
      "role": "assistant",
      "content": "Based on the CT findings...",
      "timestamp": "2026-01-26T10:30:05Z",
      "sources": [...]
    }
  ],
  "created_at": "2026-01-26T10:30:00Z"
}
```

---

### Quick Evidence Lookup

**Endpoint:** `GET /chat/evidence`

Fetch literature for a specific finding without full chat context.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `finding` | string | The finding to search for |
| `modality` | string | Optional modality filter |
| `max_results` | int | Max results (default: 5) |

**Example:**
```bash
curl "http://localhost:8004/chat/evidence?finding=pneumothorax&modality=CT&max_results=5"
```

**Response:**
```json
{
  "sources": [
    {
      "type": "pubmed",
      "title": "Management of Spontaneous Pneumothorax",
      "authors": ["MacDuff A", "Arnold A"],
      "url": "https://pubmed.ncbi.nlm.nih.gov/20819896/",
      "excerpt": "Primary spontaneous pneumothorax occurs without underlying lung disease...",
      "relevance_score": 0.91
    }
  ],
  "query": "pneumothorax CT imaging",
  "total_found": 23
}
```

---

## MCP RAG Tools

The following MCP tools are available for RAG-powered chat orchestration. These are called internally by the LangGraph workflow.

### local_rag_search

Search the local ChromaDB knowledge base.

**Input:**
```json
{
  "query": "breast MRI BI-RADS 4",
  "top_k": 5,
  "filter_type": "guideline",
  "modality": "MR",
  "body_region": "breast"
}
```

**Output:**
```json
{
  "results": [
    {
      "id": "doc_001",
      "content": "BI-RADS 4: Suspicious...",
      "score": 0.92,
      "source_type": "guideline"
    }
  ],
  "total_found": 8
}
```

---

### pubmed_search

Search PubMed for medical literature. PHI is automatically filtered from queries.

**Input:**
```json
{
  "query": "breast cancer MRI screening sensitivity",
  "max_results": 10,
  "date_range_years": 5
}
```

**Output:**
```json
{
  "articles": [
    {
      "pmid": "12345678",
      "title": "MRI Screening for Breast Cancer: A Systematic Review",
      "authors": ["Smith J", "Jones M"],
      "abstract": "Background: MRI has high sensitivity...",
      "journal": "Radiology",
      "pub_date": "2024-03-15",
      "doi": "10.1148/radiol.2024123456",
      "url": "https://pubmed.ncbi.nlm.nih.gov/12345678/"
    }
  ],
  "total_count": 156
}
```

---

### semantic_scholar_search

Search Semantic Scholar Academic Graph API.

**Input:**
```json
{
  "query": "deep learning lung nodule detection",
  "max_results": 10
}
```

**Output:**
```json
{
  "papers": [
    {
      "paper_id": "abc123",
      "title": "Deep Learning for Lung Nodule Detection",
      "authors": ["Wang X", "Chen Y"],
      "abstract": "We present a novel approach...",
      "year": 2024,
      "citation_count": 45,
      "url": "https://www.semanticscholar.org/paper/abc123"
    }
  ],
  "total_count": 89
}
```

---

### case_context

Fetch current case context from a MONAI Label viewer session.

**Input:**
```json
{
  "session_id": "viewer_abc123",
  "include_segmentations": true,
  "include_analytics": true
}
```

**Output:**
```json
{
  "modality": "CT",
  "body_region": "chest",
  "segmentations": [
    {"label": "nodule", "volume_ml": 1.23, "color": "#FF0000"}
  ],
  "volumetrics_summary": {
    "total_segments": 3,
    "largest_volume_ml": 1.23
  },
  "detections": [
    {"label": "nodule", "confidence": 0.92, "bbox": [100, 100, 150, 150]}
  ],
  "is_longitudinal": false
}
```

---

### report_agent

LLM-to-LLM tool for drafting report sections with evidence.

**Input:**
```json
{
  "task": "draft_findings",
  "case_context": {...},
  "guidelines": [...],
  "evidence": [...],
  "report_style": "structured"
}
```

**Output:**
```json
{
  "section_name": "Findings",
  "content": "**Lungs:** A 12mm solid nodule is identified in the right upper lobe...",
  "citations_used": ["pmid:12345678", "pmid:87654321"],
  "guidelines_referenced": ["Fleischner Society 2017"]
}
```

---

### evidence_summarizer

LLM-to-LLM tool for synthesizing evidence from multiple sources.

**Input:**
```json
{
  "question": "What is the management of BI-RADS 4 lesions?",
  "pubmed_articles": [...],
  "local_guidelines": [...],
  "max_length_words": 500
}
```

**Output:**
```json
{
  "summary": "BI-RADS 4 lesions have a 2-95% probability of malignancy and require tissue diagnosis...",
  "key_points": [
    "Biopsy is recommended for all BI-RADS 4 lesions",
    "Subcategories 4A, 4B, 4C stratify risk further",
    "Follow-up depends on biopsy concordance"
  ],
  "evidence_quality": "high",
  "citations": ["ACR BI-RADS Atlas 2013", "pmid:24238962"]
}
```

---

## MCP Annotation Tools

The Model Context Protocol (MCP) tools enable agentic conversational annotation through the chat interface.

### run_segmentation

Execute AI segmentation inference.

**Input:**
```json
{
  "session_id": "sess_123",
  "model": "biomedparse",
  "text_prompt": "liver",
  "point_prompts": [{"x": 256, "y": 256, "z": 40, "label": 1}],
  "propagate_3d": true
}
```

**Output:**
```json
{
  "preview_id": "prev_abc123",
  "labels": [
    {"label_id": 1, "label_name": "liver", "voxel_count": 45000, "volume_ml": 1523.5}
  ],
  "thumbnail_url": "/api/preview/prev_abc123/thumbnail",
  "model_used": "biomedparse",
  "requires_confirmation": true
}
```

### save_annotation

Save confirmed segmentation to file or PACS.

**Input:**
```json
{
  "preview_id": "prev_abc123",
  "format": "nifti",
  "destination": "both",
  "include_metadata": true
}
```

**Destination Values:**
- `local` - Save to local filesystem only
- `pacs` - Upload to PACS as DICOM-SEG
- `both` - Save locally and upload to PACS

**Output:**
```json
{
  "saved_files": [
    {"path": "/data/output/liver_prev_abc123.nii.gz", "format": "nifti", "size_bytes": 24567}
  ],
  "pacs_uid": "1.2.840.10008.5.1.4.1.1.66.4.123456",
  "segmentation_id": "seg_xyz789",
  "success": true
}
```

### edit_annotation

Apply morphological edits to segmentations.

**Input:**
```json
{
  "segmentation_id": "seg_xyz789",
  "operation": "grow",
  "target_label": 1,
  "parameters": {"pixels": 3}
}
```

**Operations:**
- `grow` - Dilate segmentation by N pixels
- `shrink` - Erode segmentation by N pixels
- `smooth` - Apply morphological smoothing
- `fill_holes` - Fill holes in segmentation
- `delete_label` - Remove a specific label
- `merge_labels` - Combine multiple labels

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.4.0 | 2026-02-04 | Added audit hash-chain verification endpoint, updated port documentation |
| 1.3.0 | 2026-01-26 | Added Knowledge Service API, Chat Service API, MCP RAG Tools |
| 1.2.0 | 2026-01-26 | Added Batch Processing API, Export Formats, MCP Annotation Tools |
| 1.1.0 | 2026-01-23 | Added MedGemma detection API, Report Generation API with separated findings |
| 1.0.0 | 2026-01-06 | Initial API release with SAM2/SAM3 support |

---

**Generated with Claude Code**
Last Updated: 2026-02-04
