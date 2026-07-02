# Data Flow Architecture

## Overview

This document describes the end-to-end data flow through the MedAI platform, from image upload to report generation.

## High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MedAI Data Flow                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ Upload  │───►│  Load   │───►│ Display │───►│   AI    │───►│ Report  │  │
│  │         │    │         │    │         │    │         │    │         │  │
│  │ DICOM   │    │ Decode  │    │ Render  │    │ Segment │    │ Generate│  │
│  │ NIfTI   │    │ Parse   │    │ 2D/3D   │    │ Detect  │    │ Triage  │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│       │              │              │              │              │        │
│       ▼              ▼              ▼              ▼              ▼        │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ File    │    │ Viewer  │    │Cornerst.│    │ Backend │    │ LLM     │  │
│  │ System  │    │ Store   │    │ Cache   │    │ GPU     │    │ Cloud   │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Workflow 1: Image Loading

### Local File Upload

```
User drops file
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend (medai-viewer)                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. File Input                                                           │
│     └── Drag & drop or file picker                                       │
│                                                                          │
│  2. Format Detection                                                     │
│     └── @medai/itk-loader/formatDetection.ts                            │
│     └── Checks magic bytes, extension                                    │
│                                                                          │
│  3. Loader Selection                                                     │
│     └── LoaderRegistry.getLoaderForFile(file)                           │
│     └── Returns: NiftiLoader | DicomLoader | etc.                       │
│                                                                          │
│  4. Image Loading                                                        │
│     └── loader.load(file)                                               │
│     └── ITK-WASM decoding (WebAssembly)                                 │
│     └── Returns: LoadedImage { pixelData, dimensions, spacing, ... }    │
│                                                                          │
│  5. Store Update                                                         │
│     └── useViewerStore.addImage(loadedImage)                            │
│     └── Triggers re-render                                               │
│                                                                          │
│  6. Cornerstone Rendering                                                │
│     └── createVolumeFromLoadedImage()                                   │
│     └── viewport.setVolume(volumeId)                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### PACS Study Loading

```
User selects study from browser
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Study Selection                                                      │
│     └── StudyBrowserPage onClick                                        │
│     └── navigate('/viewer?studyUID=1.2.3.4.5')                          │
│                                                                          │
│  2. Series Retrieval                                                     │
│     └── DICOMWebClient.searchForSeries(studyUID)                        │
│     └── GET /dicom-web/studies/{studyUID}/series                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Orthanc PACS                                                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  3. QIDO-RS Query                                                        │
│     └── Returns series metadata JSON                                     │
│                                                                          │
│  4. WADO-RS Retrieve                                                     │
│     └── GET /dicom-web/studies/.../series/.../instances                 │
│     └── Returns DICOM instances                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  5. DICOM Streaming                                                      │
│     └── cornerstoneStreamingImageVolumeLoader                           │
│     └── Progressive loading with progress indicator                      │
│                                                                          │
│  6. Volume Rendering                                                     │
│     └── Same as local file flow                                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Workflow 2: AI Segmentation

### Auto-Segmentation Flow

```
User clicks "Run Segmentation"
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Prepare Request                                                      │
│     └── Get active image from viewerStore                               │
│     └── Compress to gzip (pako)                                         │
│     └── Get model params from UI                                        │
│                                                                          │
│  2. Call Inference Service                                               │
│     └── InferenceService.runAutoSegmentation(imageId, model, params)    │
│                                                                          │
│  3. Send to Backend                                                      │
│     └── MonaiLabelClient.infer(model, imageData, params)                │
│     └── POST /monai/infer/{model}                                       │
│     └── Content-Type: multipart/form-data                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ nginx Gateway (8002)                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  4. Route Request                                                        │
│     └── /monai/infer/biomedparse → inference:8001                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Inference Service (8001)                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  5. Parse Request                                                        │
│     └── Extract file and params                                         │
│     └── Save to temp directory                                          │
│                                                                          │
│  6. Load Model                                                           │
│     └── Get InferTask from app_instance                                 │
│     └── Lazy load model weights if needed                               │
│                                                                          │
│  7. Pre-processing                                                       │
│     └── LoadImage → EnsureChannelFirst → Orientation → Spacing          │
│     └── Normalize intensity                                              │
│                                                                          │
│  8. GPU Inference                                                        │
│     └── model.forward(input_tensor)                                     │
│     └── CUDA acceleration                                               │
│                                                                          │
│  9. Post-processing                                                      │
│     └── Activation → Threshold → LargestComponent                       │
│     └── Restore to original space                                        │
│                                                                          │
│  10. Build Response                                                      │
│      └── Part 1: JSON metadata (labels, timings)                        │
│      └── Part 2: NIfTI mask (binary/multi-label)                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  11. Parse Response                                                      │
│      └── Extract JSON and NIfTI from multipart                          │
│      └── Decompress gzip                                                │
│                                                                          │
│  12. Create Segmentation                                                 │
│      └── createMultiLayerSegmentationFromResult()                       │
│      └── Register with Cornerstone segmentation module                  │
│                                                                          │
│  13. Update Store                                                        │
│      └── useSegmentationStore.addSegmentation(seg)                      │
│      └── Triggers overlay rendering                                      │
│                                                                          │
│  14. Render Overlay                                                      │
│      └── Cornerstone labelmap representation                            │
│      └── Color-coded segments                                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Interactive Segmentation Flow (SAM3)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Session-Based Interactive Flow                                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Phase 1: Session Initialization                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ POST /monai/infer/segmentation                                     │  │
│  │ { "params": { "nninter": "init" } }                                │  │
│  │                                                                    │  │
│  │ Server: Load image, extract features, cache in memory              │  │
│  │ Response: { "session_id": "abc123" }                               │  │
│  │                                                                    │  │
│  │ Time: ~500ms (one-time per image)                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Phase 2: Interactive Refinement (repeated)                              │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ User clicks on viewport                                            │  │
│  │     │                                                              │  │
│  │     ▼                                                              │  │
│  │ Convert screen coords to voxel coords                              │  │
│  │     │                                                              │  │
│  │     ▼                                                              │  │
│  │ POST /monai/infer/segmentation                                     │  │
│  │ {                                                                  │  │
│  │   "params": {                                                      │  │
│  │     "nninter": "sam3",                                             │  │
│  │     "pos_points": [[256, 256, 40]],                                │  │
│  │     "neg_points": []                                               │  │
│  │   }                                                                │  │
│  │ }                                                                  │  │
│  │                                                                    │  │
│  │ Server: Apply prompts to cached features                           │  │
│  │ Response: Updated segmentation mask                                │  │
│  │                                                                    │  │
│  │ Time: ~100ms (fast iteration)                                      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Phase 3: Session Cleanup                                                │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ POST /monai/infer/segmentation                                     │  │
│  │ { "params": { "nninter": "reset" } }                               │  │
│  │                                                                    │  │
│  │ Server: Free cached features, release GPU memory                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Workflow 3: Report Generation

```
User clicks "Generate Report"
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Capture Viewport Mosaic                                              │
│     └── Take screenshots of axial, sagittal, coronal views             │
│     └── Combine into single mosaic image                                │
│     └── Encode as base64 PNG                                            │
│                                                                          │
│  2. Gather Analytics Data                                                │
│     └── Volumetrics from analyticsStore                                 │
│     └── Radiomics features if computed                                  │
│     └── Patient info from DICOM metadata                                │
│                                                                          │
│  3. Get Radiologist Findings                                             │
│     └── Text from findings input field                                  │
│                                                                          │
│  4. Select Agent                                                         │
│     └── Based on modality/suite (breast, chestxray, etc.)              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ POST /monai/report/generate                                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  {                                                                       │
│    "mosaic_image": "data:image/png;base64,...",                         │
│    "findings": "Suspicious mass in upper outer quadrant...",            │
│    "volumetrics": { "segments": [...] },                                │
│    "radiomics": { "segments": [...] },                                  │
│    "modality": "MR",                                                    │
│    "agent_type": "breast",                                              │
│    "patient_info": { "patientId": "MRN123", ... }                       │
│  }                                                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ nginx Gateway → LLM Service (8003)                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  5. Route to LLM Service                                                 │
│     └── /monai/report/* → llm:8003                                      │
│                                                                          │
│  6. Get Agent                                                            │
│     └── get_agent("breast") → BreastAnalysisAgent                       │
│                                                                          │
│  7. Build Prompts                                                        │
│     └── System prompt with BI-RADS guidelines                           │
│     └── User prompt with findings, volumetrics, radiomics               │
│                                                                          │
│  8. Call LLM                                                             │
│     └── Gemini API with vision                                          │
│     └── Send mosaic image + text prompt                                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Gemini API (Cloud)                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  9. Vision + Text Processing                                             │
│     └── Analyze mosaic image                                            │
│     └── Generate structured report                                      │
│                                                                          │
│  Response:                                                               │
│  ```                                                                     │
│  ## CLINICAL HISTORY                                                     │
│  52-year-old female with palpable mass...                               │
│                                                                          │
│  ## TECHNIQUE                                                            │
│  Bilateral breast MRI with and without contrast...                      │
│                                                                          │
│  ## FINDINGS                                                             │
│  In the right breast at the 2 o'clock position...                       │
│                                                                          │
│  ## IMPRESSION                                                           │
│  BI-RADS 4B - Suspicious finding...                                     │
│  ```                                                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LLM Service (8003)                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  10. Parse Response                                                      │
│      └── Extract sections (clinicalHistory, findings, etc.)             │
│      └── Structure as JSON                                               │
│                                                                          │
│  Response:                                                               │
│  {                                                                       │
│    "success": true,                                                      │
│    "report": {                                                           │
│      "id": "uuid",                                                       │
│      "generatedAt": "2026-01-22T...",                                   │
│      "sections": {                                                       │
│        "clinicalHistory": "...",                                         │
│        "findings": "...",                                                │
│        "impression": "..."                                               │
│      }                                                                   │
│    }                                                                     │
│  }                                                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  11. Update Report Store                                                 │
│      └── useReportStore.setReport(response.report)                      │
│                                                                          │
│  12. Navigate to Report Page                                             │
│      └── navigate('/report')                                            │
│                                                                          │
│  13. Render Report Editor                                                │
│      └── Editable sections                                              │
│      └── "AI Draft" watermark                                           │
│      └── Export options (PDF, copy)                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Storage

### Frontend Storage

| Storage | Purpose | Data |
|---------|---------|------|
| Memory (Zustand) | Active session state | Images, segmentations, UI state |
| IndexedDB | Persistence | Recent files, cached images |
| Cornerstone Cache | Image/volume caching | Decoded pixel data |

### Backend Storage

| Storage | Purpose | Data |
|---------|---------|------|
| Memory | Session cache | Inference features |
| Temp files | Request processing | Uploaded images |
| Volume mounts | Persistent storage | Checkpoints, predictions |

### PACS Storage

| Storage | Purpose | Data |
|---------|---------|------|
| Orthanc DB | DICOM storage | Studies, series, instances |
| Orthanc Attachments | Metadata | Study-level data |

## Data Formats

### Image Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| NIfTI | .nii, .nii.gz | 3D volumes, segmentation masks |
| DICOM | .dcm | Clinical images from PACS |
| NRRD | .nrrd | 3D volumes (alternative) |
| PNG/JPG | .png, .jpg | 2D images (X-ray) |

### Transfer Formats

| Format | Direction | Content |
|--------|-----------|---------|
| multipart/form-data | Request | Image + params |
| multipart/related | Response | JSON + NIfTI |
| application/json | Both | Metadata, reports |
| gzip | Both | Compressed payloads |

### Serialization

```typescript
// Frontend: Compress before send
const compressed = pako.gzip(imageData);

// Backend: Decompress on receive
import gzip
data = gzip.decompress(request.file.read())
```

## Error Handling

### Frontend Error Flow

```
API Error
    │
    ▼
┌─────────────────┐
│ Catch in service│
│ layer           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Retry if        │────►│ Show toast      │
│ recoverable     │     │ notification    │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Log to console  │
│ (dev mode)      │
└─────────────────┘
```

### Backend Error Flow

```
Exception
    │
    ▼
┌─────────────────┐
│ Log with        │
│ traceback       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return HTTP     │
│ error response  │
│ 400/500         │
└─────────────────┘
```

---

**Related Documents**:
- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md)
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)
- [AI Services](./AI_SERVICES.md)
