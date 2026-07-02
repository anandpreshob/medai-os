# Chest X-Ray Suite PRD

## Overview

The **Chest X-Ray Suite** provides AI-powered chest radiograph analysis using MedGemma detection, bounding box visualization, and intelligent report generation with separate Radiologist and AI Findings sections.

**Status**: Phase 1 (Active)

---

## 1. Target Users

| Persona | Needs |
|---------|-------|
| **Radiologist** | Quick abnormality detection, structured reports, AI assistance |
| **Emergency Physician** | Rapid pneumothorax/effusion detection, triage support |
| **Pulmonologist** | Lung pathology identification, follow-up comparison |
| **Resident/Trainee** | Learning support, AI-assisted findings review |

---

## 2. Key Features

### 2.1 MedGemma AI Detection

- **Automatic Abnormality Detection**: AI analyzes chest X-rays for common pathologies
- **Confidence Scoring**: Each finding includes a confidence score (0-100%)
- **Multi-Finding Support**: Detects multiple abnormalities in a single image
- **Real-time Feedback**: Visual indicators during inference

**Detected Conditions**:
- Pneumothorax
- Pleural Effusion
- Consolidation / Pneumonia
- Cardiomegaly
- Pulmonary Edema
- Nodules / Masses
- Atelectasis
- And more...

### 2.2 Bounding Box Visualization

- **AI-Generated Boxes**: MedGemma returns bounding box coordinates for each detection
- **Manual Drawing**: Radiologists can draw additional bounding boxes
- **Visibility Toggle**: Show/hide individual or all detections
- **Color-Coded Confidence**:
  - Green: High confidence (>80%)
  - Yellow: Moderate confidence (50-80%)
  - Red: Low confidence (<50%)
- **Interactive Selection**: Click on boxes to view details
- **Viewport Overlay**: Boxes rendered directly on the X-ray image

### 2.3 Separated Findings Sections

A key feature of this suite is the **clear separation between Radiologist and AI findings**:

| Section | Source | Purpose |
|---------|--------|---------|
| **Radiologist Findings** | Human input via FindingsPanel | Radiologist's own observations and dictation |
| **AI Findings** | MedGemma detection | AI-detected abnormalities with confidence levels |

This separation ensures:
- Clear attribution of findings
- Transparency in AI-assisted diagnosis
- Compliance with clinical documentation standards
- Easy review of AI vs human observations

### 2.4 Intelligent Report Generation

The MedGemma Report Agent generates structured reports with:

**Report Sections**:
1. **Clinical History**: Patient information and indication
2. **Technique**: Imaging technique (PA/lateral, AP portable, etc.)
3. **Comparison**: Prior studies available
4. **Radiologist Findings**: Human observations (separate section)
5. **AI Findings**: AI-detected abnormalities organized by confidence level
6. **Impression**: Summary combining both AI and radiologist findings
7. **Recommendations**: Follow-up and clinical correlation

**Confidence-Based Reporting**:
- **High Confidence (>80%)**: Reported as definite findings
- **Moderate Confidence (50-80%)**: Reported as probable findings
- **Low Confidence (<50%)**: Reported as possible findings for review

---

## 3. Suite Configuration

```typescript
export const CHEST_XRAY_SUITE: SuiteConfig = {
  id: 'chestxray',
  name: 'Chest X-Ray',
  description: 'AI-powered chest X-ray analysis with MedGemma detection',
  icon: 'Stethoscope',

  defaultLayout: 'singleView',

  wlPresets: [
    'xray-default',    // W:2048 C:1024
    'xray-lung',       // W:1500 C:-600
    'xray-bone',       // W:2000 C:300
    'xray-soft-tissue' // W:400 C:40
  ],

  enabledTools: [
    'WindowLevel', 'Zoom', 'Pan',
    'BoundingBox', 'Length', 'Annotation'
  ],

  monaiTasks: ['medgemma_detection'],
  preferredModels: ['MedGemma'],

  metricsPanelId: 'chestxray-metrics',
  enabledMetrics: ['detection_count', 'confidence_summary'],

  allowedExports: ['png', 'json', 'pdf'],

  tabs: [
    { id: 'detection', label: 'Detection', component: 'ChestXrayDetectionTab' },
    { id: 'report', label: 'Report', component: 'ChestXrayReportTab' },
    { id: 'findings', label: 'Findings', component: 'FindingsPanel' },
  ],

  panels: [
    { id: 'detection-results', component: 'DetectionResultsPanel', order: 1 },
    { id: 'ai-findings', component: 'AIFindingsPanel', order: 2 },
  ],

  detectionHints: {
    modalities: ['CR', 'DX', 'XR'],
    bodyParts: ['CHEST'],
    descriptionKeywords: ['chest', 'cxr', 'thorax', 'lung', 'heart'],
    protocolKeywords: ['pa', 'lateral', 'portable', 'ap'],
  },
};
```

---

## 4. Backend Components

### 4.1 MedGemma Detection Service

**Endpoint**: `POST /monai/medgemma/detect`

**Request**:
```json
{
  "image": "<base64 encoded image>",
  "image_id": "patient_13_cxr",
  "return_boxes": true
}
```

**Response**:
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
      "label": "Pleural Effusion",
      "confidence": 0.78,
      "x_min": 0.10,
      "y_min": 0.60,
      "x_max": 0.35,
      "y_max": 0.90,
      "source": "ai"
    }
  ],
  "description": "AI-generated findings summary...",
  "processing_time_ms": 1250
}
```

### 4.2 MedGemma Report Agent

**Location**: `/MedAI-server/monailabel/agents/medgemma_agent.py`

The MedGemma Report Agent follows these guidelines:

1. **Markdown Formatting**: Uses markdown for better readability
2. **Separated Sections**: Keeps Radiologist Findings and AI Findings distinct
3. **Confidence Integration**: Organizes AI findings by confidence level
4. **Clinical Standards**: Uses standard radiology terminology
5. **Transparency**: Notes AI-assisted findings for compliance

### 4.3 LLM Client Parsing

**Location**: `/MedAI-server/monailabel/llm/llm_client.py`

The LLM client parses report sections including:
- `RADIOLOGIST FINDINGS` / `RADIOLOGIST'S FINDINGS` → `findings`
- `AI FINDINGS` / `AI-GENERATED FINDINGS` / `AI ANALYSIS` / `MEDGEMMA FINDINGS` → `aiFindings`

---

## 5. UI Components

### 5.1 ChestXrayDetectionTab

**Location**: `/medai-viewer/apps/viewer/src/components/right-panel/tabs/ChestXrayDetectionTab.tsx`

**Features**:
- MedGemma service status indicator
- "Run Detection" button with loading state
- Detection results list with:
  - Finding label
  - Confidence percentage with color coding
  - Visibility toggle per detection
  - Click to highlight on viewport
- "Hide All" / "Show All" toggle
- Manual bounding box drawing tools

### 5.2 ChestXrayReportTab

**Location**: `/medai-viewer/apps/viewer/src/components/right-panel/tabs/ChestXrayReportTab.tsx`

**Features**:
- "Draft Report" button in TopBar
- Report generation workflow
- Section preview and editing
- Integration with FindingsPanel observations

### 5.3 ReportEditor (Updated)

**Location**: `/medai-viewer/apps/viewer/src/components/report/ReportEditor.tsx`

**Report Sections Display**:
```typescript
const SECTION_CONFIG = [
  { key: 'clinicalHistory', title: 'Clinical History' },
  { key: 'technique', title: 'Technique' },
  { key: 'comparison', title: 'Comparison' },
  { key: 'findings', title: 'Radiologist Findings' },  // Human observations
  { key: 'aiFindings', title: 'AI Findings' },         // MedGemma detections
  { key: 'impression', title: 'Impression' },
  { key: 'recommendations', title: 'Recommendations' },
];
```

---

## 6. Data Flow

### 6.1 Detection Workflow

```
1. Load Chest X-Ray Image
              ↓
2. Auto-detect Chest X-Ray Suite (via useSuiteAutoDetection)
              ↓
3. Click "Run Detection" in Detection Tab
              ↓
4. Send image to MedGemma service (/monai/medgemma/detect)
              ↓
5. Receive detections with bounding boxes
              ↓
6. Store in detectionStore
              ↓
7. Render bounding boxes on viewport overlay
              ↓
8. Display results in Detection Tab
```

### 6.2 Report Generation Workflow

```
1. Radiologist enters observations in Findings Panel
              ↓
2. Click "Draft Report" in TopBar
              ↓
3. Navigate to Report Page
              ↓
4. Collect data:
   - Radiologist observations (from findingsStore)
   - AI detections (from detectionStore)
   - Viewport capture with overlays
              ↓
5. Send to MedGemma Report Agent
              ↓
6. Agent generates structured report with:
   - Separate Radiologist Findings section
   - Separate AI Findings section
   - Combined Impression
              ↓
7. Display in ReportEditor for review/edit
              ↓
8. Export final report
```

---

## 7. Stores & State Management

### 7.1 Detection Store

**Location**: `/medai-viewer/packages/core/src/stores/detectionStore.ts`

```typescript
interface Detection {
  id: string;
  imageId: string;
  label: string;
  confidence: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  source: 'ai' | 'manual';
  visible: boolean;
}

interface DetectionStore {
  detections: Map<string, Detection[]>;
  addDetection: (imageId: string, detection: Detection) => void;
  toggleVisibility: (imageId: string, detectionId: string) => void;
  toggleAllVisibility: (imageId: string, visible: boolean) => void;
  clearDetections: (imageId: string) => void;
}
```

### 7.2 Findings Store (Extended)

**Location**: `/medai-viewer/packages/core/src/stores/findingsStore.ts`

The findings store tracks both radiologist observations and AI findings:

```typescript
interface ImageFindings {
  imageId: string;
  radiologistNotes: string;  // Human observations
  aiReport: string;          // AI-generated findings
  detectionSummary: string[]; // List of AI detections
  // ... other fields
}
```

### 7.3 Report Store (Extended)

**Location**: `/medai-viewer/packages/core/src/stores/reportStore.ts`

```typescript
interface ReportSections {
  clinicalHistory: string;
  technique: string;
  comparison: string;
  findings: string;     // Radiologist findings
  aiFindings: string;   // AI findings (NEW)
  impression: string;
  recommendations: string;
}
```

---

## 8. Auto-Detection Rules

The Chest X-Ray Suite is auto-detected when:

1. **Modality** is CR (Computed Radiography), DX (Digital X-ray), or XR
2. **Body Part** is CHEST
3. **Description** contains: chest, cxr, thorax, lung, heart
4. **Protocol** contains: pa, lateral, portable, ap

**Confidence Scoring**:
- Modality match (CR/DX): +3
- Body part CHEST: +2
- Description keyword: +4
- Protocol keyword: +2

Threshold: >= 0.3 confidence

---

## 9. E2E Testing

### 9.1 Test File

**Location**: `/medai-viewer/apps/viewer/e2e/chestxray-detection-workflow.spec.ts`

### 9.2 Test Coverage

The E2E test covers:
1. Navigate to Study Browser
2. Load patient with chest X-ray (e.g., patient_13)
3. Connect to MONAI Label server
4. Verify Chest X-Ray Suite auto-detection
5. Run MedGemma AI detection
6. Verify bounding boxes appear on viewport
7. Verify detection results in panel
8. Test visibility toggle functionality
9. Click "Draft Report" button
10. Verify report page navigation
11. Check for Generate Report functionality

### 9.3 Running Tests

```bash
cd medai-viewer/apps/viewer
npx playwright test chestxray-detection-workflow.spec.ts
```

---

## 10. API Endpoints

### 10.1 MedGemma Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/monai/medgemma/health` | GET | Check service health |
| `/monai/medgemma/info` | GET | Get service information |
| `/monai/medgemma/detect` | POST | Run detection on image |

### 10.2 Report Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/report/generate` | POST | Generate report with agent |
| `/report/agents` | GET | List available report agents |

---

## 11. Implementation Checklist

### Completed
- [x] MedGemma detection service integration
- [x] Bounding box visualization on viewport
- [x] Manual bounding box drawing
- [x] Detection results panel
- [x] Visibility toggle per detection
- [x] Separate Radiologist/AI Findings sections
- [x] MedGemma Report Agent
- [x] ReportEditor with aiFindings section
- [x] Suite auto-detection for chest X-rays
- [x] E2E test for complete workflow
- [x] Draft Report button in TopBar

### Future Enhancements
- [ ] Comparison with prior chest X-rays
- [ ] Trend analysis for serial imaging
- [ ] CAD integration for nodule detection
- [ ] DICOM SR export for structured reporting
- [ ] Voice dictation integration in report workflow

---

## 12. Related Documents

- [Main Suites PRD](./SUITES_PRD.md)
- [API Reference](../API_REFERENCE.md)
- [MedAI Viewer PRD](../MEDAI_VIEWER_PRD.md)
