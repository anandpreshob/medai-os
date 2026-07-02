# Medical Image Annotation Suite - Product Requirements Document

## Executive Summary

The Medical Image Annotation Suite is a comprehensive platform designed for professional medical image annotation workflows. Unlike clinical-focused suites, this platform is purpose-built for:

- **Medical Annotation Startups** - Building training datasets for AI models
- **Research Centers** - Annotating data for medical imaging research
- **Imaging CROs** - Managing multi-site annotation projects for clinical trials

The suite provides CVAT/V7-style annotation capabilities with AI-assisted tools (BiomedParse, SAM), batch processing, multi-format export, and agentic conversational annotation.

---

## Table of Contents

1. [Core Features](#1-core-features)
2. [Module 1: Enhanced Annotation Tools](#2-module-1-enhanced-annotation-tools)
3. [Module 2: Batch Processing & Export System](#3-module-2-batch-processing--export-system)
4. [Module 3: Agentic Conversational Annotation](#4-module-3-agentic-conversational-annotation)
5. [Architecture Overview](#5-architecture-overview)
6. [Implementation Phases](#6-implementation-phases)
7. [Critical Files Reference](#7-critical-files-reference)

---

## 1. Core Features

### 1.1 Annotation Workflow Focus

| Feature | Description |
|---------|-------------|
| **Pure Annotation** | No report generation or clinical decision support - focused solely on creating high-quality labels |
| **PACS Integration** | Save annotations back to same Patient ID for workflow continuity |
| **Multi-Format Export** | NIfTI, DICOM-SEG, COCO JSON, YOLO, Pascal VOC, PNG overlays |
| **Session Persistence** | Save/load annotation sessions for multi-day projects |
| **Batch Processing** | Process hundreds of files through AI models automatically |
| **Agentic Annotation** | Natural language commands for AI-assisted annotation |

### 1.2 Target User Workflows

**Workflow A: Manual Annotation**
```
Load Image → Select Tool (Brush/Polygon/Smart) → Annotate → Review → Export
```

**Workflow B: AI-Assisted Annotation**
```
Load Image → Run BiomedParse → Review AI Results → Edit/Refine → Approve → Export
```

**Workflow C: Batch Processing**
```
Select Files → Configure Model & Prompts → Run Batch → Review Results Grid → Accept/Reject → Export All
```

**Workflow D: Conversational Annotation**
```
Chat: "Segment liver and spleen from this CT" → Review Preview → "Save as NIfTI" → Done
```

---

## 2. Module 1: Enhanced Annotation Tools

### 2.1 New Annotation Tools

| Tool | Description | Shortcut |
|------|-------------|----------|
| **Polygon Tool** | Click-to-add vertices, close to fill | `P` |
| **Polyline Tool** | Open contours with measurements | `L` |
| **Smart Brush** | Click-to-segment with SAM/BiomedParse | `S` |

### 2.2 Editing Capabilities

| Feature | Description | Shortcut |
|---------|-------------|----------|
| **Undo/Redo** | Full history for all annotation operations | `Ctrl+Z` / `Ctrl+Shift+Z` |
| **Copy/Paste** | Copy annotations between slices | `Ctrl+C` / `Ctrl+V` |
| **Slice Interpolation** | Auto-fill annotations between key slices | `I` |
| **Vertex Editing** | Add/remove/move polygon vertices | `N` / `D` |

### 2.3 Keyboard Shortcuts (CVAT-style)

```
Navigation:
  W - Window/Level        Z - Zoom          H - Pan
  ↑/↓ - Prev/Next slice   Home/End - First/Last slice

Annotation:
  B - Brush               E - Eraser        F - Lasso Fill
  P - Polygon             L - Polyline      R - Rectangle
  S - Smart Segment       [ / ] - Brush size

Editing:
  Ctrl+Z - Undo           Ctrl+Y - Redo     Delete - Remove
  Ctrl+C - Copy           Ctrl+V - Paste    I - Interpolate

Segments:
  1-9 - Select segment    V - Toggle visibility
```

### 2.4 New Files to Create

```
medai-viewer/
  packages/core/src/
    stores/
      annotationHistoryStore.ts     # Undo/redo state
      clipboardStore.ts             # Copy/paste state
    utils/
      sliceInterpolation.ts         # Interpolation algorithms

  apps/viewer/src/
    tools/
      PolygonAnnotationTool.ts      # Polygon annotation
      PolylineAnnotationTool.ts     # Polyline annotation
      SmartBrushTool.ts             # AI click-to-segment
    lib/
      keyboardShortcuts.ts          # Keyboard manager
    hooks/
      useKeyboardShortcuts.ts       # React hook
    components/
      annotation-tools/
        InterpolationControls.tsx   # Interpolation UI
        ShortcutHelpModal.tsx       # Shortcut reference
```

---

## 3. Module 2: Batch Processing & Export System

### 3.1 Batch Processing Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  File Selection │ --> │  Model Config   │ --> │    Progress     │
│  (Drag & Drop)  │     │  (BiomedParse)  │     │    Tracking     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        v
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Multi-Format   │ <-- │  Review Grid    │ <-- │    Results      │
│     Export      │     │ (Accept/Reject) │     │   (Thumbnails)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 3.2 Export Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| NIfTI | `.nii.gz` | 3D medical imaging, model training |
| DICOM-SEG | `.dcm` | Clinical PACS integration |
| RT-STRUCT | `.dcm` | Radiation therapy contours |
| COCO JSON | `.json` | Instance segmentation ML |
| YOLO | `.txt` | Object detection training |
| Pascal VOC | `.xml` | Semantic segmentation |
| PNG Overlay | `.png` | Visual review, presentations |
| CSV | `.csv` | Measurements, volumetrics |

### 3.3 Backend API Design

```python
# POST /batch/process - Start batch job
{
  "model": "biomedparse",
  "images": [{"image_id": "...", "path": "..."}],
  "prompt_config": {"text_prompts": ["liver", "spleen"]},
  "export_config": {"formats": ["nifti", "coco"]},
  "save_to_pacs": false
}

# GET /batch/process/{job_id} - Get status
{
  "job_id": "...",
  "status": "running",
  "progress_percent": 45.0,
  "processed_images": 9,
  "total_images": 20,
  "results": [...]
}

# POST /batch/process/{job_id}/review - Accept/reject results
{
  "reviews": [
    {"image_id": "...", "status": "accepted"},
    {"image_id": "...", "status": "rejected"}
  ]
}
```

### 3.4 New Files to Create

```
MedAI-server/monailabel/
  endpoints/
    batch_process.py              # Enhanced batch API
    batch_websocket.py            # Real-time progress
  utils/
    batch/
      job_manager.py              # Job tracking
    exporters/
      coco_exporter.py            # COCO JSON format
      yolo_exporter.py            # YOLO format
      voc_exporter.py             # Pascal VOC XML
      overlay_exporter.py         # PNG overlays

medai-viewer/
  packages/core/src/
    stores/
      batchProcessingStore.ts     # Batch state
    hooks/
      useBatchJobSocket.ts        # WebSocket hook
  apps/viewer/src/components/
    BatchProcessingPanel.tsx      # Main batch UI
    batch/
      BatchFileSelector.tsx       # File selection
      BatchProgressTracker.tsx    # Progress display
      BatchResultsGrid.tsx        # Review interface
      BatchExportSection.tsx      # Export options
```

---

## 4. Module 3: Agentic Conversational Annotation

### 4.1 Natural Language Commands

Users can control annotation workflows through chat:

| User Says | Agent Does |
|-----------|------------|
| "Segment the liver from this CT" | Runs BiomedParse, shows preview |
| "Save as NIfTI" | Exports confirmed segmentation |
| "Run tumor segmentation on all studies" | Starts batch job with progress |
| "Load yesterday's session" | Restores previous annotation state |
| "Remove the spleen label" | Edits existing segmentation |

### 4.2 Confirmation Workflow

```
User: "Segment liver and spleen from this CT and save as NIfTI"

Agent: "I'll segment liver and spleen. Here's my plan:
        1. Run BiomedParse with 'liver[SEP]spleen'
        2. Save each as separate NIfTI files

        [Preview Thumbnail]
        - Liver: 1,523 cm³ (green)
        - Spleen: 187 cm³ (purple)

        [View in Viewer] [Accept] [Edit First] [Cancel]"

User: [Clicks Accept]

Agent: "Saved successfully:
        - liver.nii.gz (234 KB)
        - spleen.nii.gz (89 KB)"
```

### 4.3 New MCP Tools

| Tool | Purpose | Input |
|------|---------|-------|
| `run_segmentation` | Execute AI inference | session_id, model, text_prompt |
| `save_annotation` | Save to format/location | preview_id, format, destination |
| `load_session` | Load previous session | query (e.g., "yesterday") |
| `batch_process` | Run batch job | scope, model, prompt |
| `edit_annotation` | Modify annotations | segmentation_id, operation |

### 4.4 LangGraph Workflow Extension

```python
# New workflow nodes for annotation
workflow.add_node("parse_annotation_intent", ...)
workflow.add_node("validate_annotation_params", ...)
workflow.add_node("execute_segmentation", ...)
workflow.add_node("await_confirmation", ...)
workflow.add_node("execute_save", ...)

# New intents
- segmentation_request: "Segment the liver"
- save_request: "Save as NIfTI"
- batch_request: "Process all studies"
- session_load: "Load yesterday's session"
- edit_request: "Remove the spleen label"
```

### 4.5 New Files to Create

```
MedAI-server/monailabel/
  mcp/tools/
    run_segmentation.py           # AI inference tool
    save_annotation.py            # Save/export tool
    load_session.py               # Session recovery
    batch_process.py              # Batch processing tool
    edit_annotation.py            # Edit operations
  chat/prompts/
    annotation_prompts.py         # Annotation intent prompts
  services/
    preview_storage.py            # Temporary preview cache

medai-viewer/
  apps/viewer/src/components/
    right-panel/components/chat/
      AnnotationActionCard.tsx    # Action plan display
      BatchProgressCard.tsx       # Batch progress in chat
```

---

## 5. Architecture Overview

### 5.1 System Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                        Frontend (medai-viewer)                      │
├──────────────────┬──────────────────┬──────────────────────────────┤
│  Annotation      │   Batch          │   Chat Panel                 │
│  Tools Panel     │   Processing     │   (AskMedAITab)              │
│  - Polygon       │   Panel          │   - Natural language         │
│  - Polyline      │   - File select  │   - Action cards             │
│  - Smart brush   │   - Progress     │   - Confirmations            │
│  - Shortcuts     │   - Review grid  │                              │
└────────┬─────────┴────────┬─────────┴────────────┬─────────────────┘
         │                  │                      │
         │ Cornerstone3D    │ REST API             │ WebSocket/SSE
         │                  │                      │
┌────────┴──────────────────┴──────────────────────┴─────────────────┐
│                        Backend (MedAI-server)                       │
├──────────────────┬──────────────────┬──────────────────────────────┤
│  MONAI Label     │   Batch          │   Chat Orchestrator          │
│  Inference       │   Processing     │   (LangGraph)                │
│  - BiomedParse   │   - Job manager  │   - Intent parsing           │
│  - nnInteractive │   - Exporters    │   - MCP tools                │
│  - SAM3          │   - PACS upload  │   - Confirmation flow        │
└────────┬─────────┴────────┬─────────┴────────────┬─────────────────┘
         │                  │                      │
         └──────────────────┴──────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │        Storage            │
              │  - PACS (DICOMweb)        │
              │  - Local filesystem       │
              │  - IndexedDB (browser)    │
              └───────────────────────────┘
```

### 5.2 Data Flow: Agentic Annotation

```
User Message: "Segment the liver and save as NIfTI"
                    │
                    v
         ┌─────────────────────┐
         │  Intent Classifier  │  -> "segmentation_request"
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Parameter Parser   │  -> {model: "biomedparse",
         └──────────┬──────────┘       prompt: "liver"}
                    v
         ┌─────────────────────┐
         │  run_segmentation   │  -> Execute BiomedParse
         │  MCP Tool           │     Return preview
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Preview Storage    │  -> Store mask temporarily
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Response with      │  -> Show thumbnail, buttons:
         │  Confirmation UI    │     [Accept] [Edit] [Cancel]
         └──────────┬──────────┘
                    v
         User clicks [Accept]
                    │
                    v
         ┌─────────────────────┐
         │  save_annotation    │  -> Export to NIfTI
         │  MCP Tool           │     Return file path
         └──────────┬──────────┘
                    v
         ┌─────────────────────┐
         │  Success Response   │  -> "Saved: liver.nii.gz"
         └─────────────────────┘
```

---

## 6. Implementation Phases

### Phase 1: Core Annotation Tools (Weeks 1-3)

**Module 1 Foundation:**
- [ ] Undo/redo store (`annotationHistoryStore.ts`)
- [ ] Keyboard shortcut manager (`keyboardShortcuts.ts`)
- [ ] Polygon annotation tool (`PolygonAnnotationTool.ts`)
- [ ] Polyline annotation tool (`PolylineAnnotationTool.ts`)
- [ ] Clipboard store for copy/paste (`clipboardStore.ts`)

**Deliverables:**
- Working undo/redo for all annotation operations
- Polygon/polyline tools integrated with toolbar
- Keyboard shortcuts for tool switching

### Phase 2: Slice Interpolation & Smart Tools (Weeks 3-4)

**Module 1 Advanced:**
- [ ] Interpolation algorithms (`sliceInterpolation.ts`)
- [ ] Interpolation UI controls (`InterpolationControls.tsx`)
- [ ] Smart brush tool with SAM/BiomedParse (`SmartBrushTool.ts`)
- [ ] Shortcut help modal (`ShortcutHelpModal.tsx`)

**Deliverables:**
- Morphological interpolation between annotated slices
- Click-to-segment with AI models
- Complete keyboard shortcut reference

### Phase 3: Batch Processing Backend (Weeks 4-5)

**Module 2 Backend:**
- [ ] Enhanced batch API (`batch_process.py`)
- [ ] Job manager with progress tracking (`job_manager.py`)
- [ ] WebSocket for real-time updates (`batch_websocket.py`)
- [ ] BiomedParse text prompt integration

**Deliverables:**
- Start/cancel/status batch jobs via API
- Real-time progress via WebSocket
- Text prompt support for batch BiomedParse

### Phase 4: Export Formats (Weeks 5-6)

**Module 2 Exporters:**
- [ ] COCO JSON exporter (`coco_exporter.py`)
- [ ] YOLO format exporter (`yolo_exporter.py`)
- [ ] Pascal VOC exporter (`voc_exporter.py`)
- [ ] PNG overlay exporter (`overlay_exporter.py`)

**Deliverables:**
- Multi-format export capability
- Batch export of accepted results
- Format-specific metadata handling

### Phase 5: Batch Processing Frontend (Weeks 6-7)

**Module 2 Frontend:**
- [ ] Batch processing store (`batchProcessingStore.ts`)
- [ ] File selector with drag-drop (`BatchFileSelector.tsx`)
- [ ] Progress tracker (`BatchProgressTracker.tsx`)
- [ ] Results review grid (`BatchResultsGrid.tsx`)
- [ ] Export section (`BatchExportSection.tsx`)

**Deliverables:**
- Complete batch processing UI
- Accept/reject results workflow
- Multi-format export selection

### Phase 6: Agentic MCP Tools (Weeks 7-8)

**Module 3 Backend:**
- [ ] `run_segmentation` MCP tool
- [ ] `save_annotation` MCP tool
- [ ] `load_session` MCP tool
- [ ] `batch_process` MCP tool
- [ ] `edit_annotation` MCP tool
- [ ] Preview storage service

**Deliverables:**
- All 5 annotation MCP tools working
- Preview caching system
- Tool execution with validation

### Phase 7: LangGraph Annotation Workflow (Weeks 8-9)

**Module 3 Orchestration:**
- [ ] Extended ChatState with annotation fields
- [ ] New workflow nodes for annotation
- [ ] Intent classification for annotation commands
- [ ] Confirmation flow state machine

**Deliverables:**
- Parse "segment the liver" as segmentation_request
- Route to appropriate MCP tools
- Handle confirmation flow

### Phase 8: Confirmation UI (Weeks 9-10)

**Module 3 Frontend:**
- [ ] `AnnotationActionCard.tsx` component
- [ ] `BatchProgressCard.tsx` component
- [ ] Chat store extensions
- [ ] WebSocket integration for action updates

**Deliverables:**
- Action plan cards in chat
- Accept/Edit/Cancel buttons
- Real-time progress in chat

### Phase 9: Integration & Testing (Weeks 10-11)

**All Modules:**
- [ ] End-to-end integration tests
- [ ] Performance optimization
- [ ] Error handling and recovery
- [ ] Documentation

**Deliverables:**
- Complete test coverage
- Production-ready performance
- User documentation

---

## 7. Critical Files Reference

### Existing Files to Modify

| File | Modifications |
|------|---------------|
| `medai-viewer/apps/viewer/src/lib/cornerstone.ts` | Register new tools |
| `medai-viewer/apps/viewer/src/components/Toolbar.tsx` | Add tool buttons |
| `medai-viewer/packages/core/src/stores/segmentationStore.ts` | History tracking hooks |
| `MedAI-server/monailabel/chat/orchestrator.py` | Add annotation workflow nodes |
| `MedAI-server/monailabel/mcp/server.py` | Register new annotation tools |
| `MedAI-server/monailabel/mcp/schemas/tool_schemas.py` | Add annotation schemas |
| `medai-viewer/packages/core/src/stores/chatStore.ts` | Annotation action state |
| `medai-viewer/apps/viewer/src/components/right-panel/tabs/AskMedAITab.tsx` | Render action cards |

### New Files Summary

**Frontend (25 files):**
- 4 new stores
- 5 new annotation tools
- 3 new hooks
- 10 new components
- 3 new utility modules

**Backend (15 files):**
- 5 new MCP tools
- 4 new exporters
- 3 new endpoints
- 2 new services
- 1 new prompt module

---

## Appendix A: Parallelization Strategy

The implementation is designed for parallel agent execution:

```
Agent 1: Module 1 - Enhanced Annotation Tools
  - Works on: medai-viewer/apps/viewer/src/tools/
  - Works on: medai-viewer/packages/core/src/stores/annotationHistoryStore.ts
  - Works on: medai-viewer/apps/viewer/src/lib/keyboardShortcuts.ts

Agent 2: Module 2 Backend - Batch Processing
  - Works on: MedAI-server/monailabel/endpoints/batch_process.py
  - Works on: MedAI-server/monailabel/utils/batch/
  - Works on: MedAI-server/monailabel/utils/exporters/

Agent 3: Module 2 Frontend - Batch UI
  - Works on: medai-viewer/apps/viewer/src/components/batch/
  - Works on: medai-viewer/packages/core/src/stores/batchProcessingStore.ts

Agent 4: Module 3 - Agentic Annotation
  - Works on: MedAI-server/monailabel/mcp/tools/ (new annotation tools)
  - Works on: MedAI-server/monailabel/chat/orchestrator.py (annotation nodes)
  - Works on: medai-viewer/.../chat/AnnotationActionCard.tsx
```

Each agent works on isolated file sets with minimal merge conflicts.

---

## Appendix B: Verification Plan

### Testing Workflow

1. **Unit Tests:**
   - Each new store has dedicated test file
   - Each MCP tool has input/output validation tests
   - Each exporter has format compliance tests

2. **Integration Tests:**
   - Annotation tool → Store → Persistence roundtrip
   - Chat message → MCP tool → Result → UI update
   - Batch job → Progress updates → Export

3. **E2E Tests (Playwright):**
   - Complete annotation workflow
   - Batch processing with accept/reject
   - Conversational annotation flow

4. **Manual Verification:**
   - Load NIfTI → Annotate → Save → Reload → Verify
   - Batch process 10 files → Review → Export COCO
   - Chat "segment liver" → Accept → Verify saved file
