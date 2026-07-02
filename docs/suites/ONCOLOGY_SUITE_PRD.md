# Oncology Suite PRD

## Overview

The **Oncology Suite** provides AI-assisted tumor analysis, volumetrics, and response assessment for radiologists, oncologists, and clinical researchers.

**Status**: Phase 1 (Active Development)

---

## 1. Target Users

| Persona | Needs |
|---------|-------|
| **Radiologist** | Quick tumor quantification, volumetric reports |
| **Oncologist** | Lesion tracking, treatment response assessment |
| **Clinical Researcher** | Reproducible metrics, trial endpoint generation |
| **CRO Analyst** | Batch processing, standardized outputs |

---

## 2. Use Cases

### 2.1 Single Study Analysis
1. Load CT/MR study
2. Run "Oncology AI" to segment tumors
3. View per-lesion volumes and counts
4. Export metrics (CSV/JSON) for reporting

### 2.2 Longitudinal Comparison
1. Load baseline and follow-up studies
2. Segment tumors in both
3. View volume change (%, absolute)
4. Generate RECIST-like response assessment

### 2.3 Clinical Trial Endpoints
1. Batch process study cohort
2. Extract standardized metrics
3. Export for statistical analysis

---

## 3. Suite Configuration

```typescript
export const ONCOLOGY_SUITE: SuiteConfig = {
  id: 'oncology',
  name: 'Oncology',
  description: 'Tumor analysis, volumetrics, and response assessment',
  icon: 'Target',

  defaultLayout: 'fourUp',

  wlPresets: [
    'ct-soft-tissue',  // W:400 C:40
    'ct-lung',         // W:1500 C:-600
    'ct-liver',        // W:150 C:30
    'ct-bone',         // W:2000 C:300
    'mr-t1',           // W:500 C:250
    'mr-t2',           // W:500 C:250
  ],

  enabledTools: [
    'WindowLevel', 'Zoom', 'Pan', 'Crosshairs',
    'Length', 'RectangleROI', 'EllipticalROI',
    'Brush', 'Eraser', 'Lasso', 'RectFill'
  ],

  monaiTasks: ['tumor_segmentation', 'organ_segmentation'],
  preferredModels: ['TotalSegmentator', 'nnInteractive', 'MedSAM2', 'BiomedParse'],

  metricsPanelId: 'oncology-metrics',
  enabledMetrics: ['volume', 'diameter', 'recist', 'radiomics', 'lesion_count'],

  allowedExports: ['nifti', 'csv', 'json', 'dicom-seg'],

  tabs: [
    { id: 'auto-segmentation', label: 'Auto-Seg', component: 'AutoSegmentationTab' },
    { id: 'smart-edit', label: 'SmartEdit', component: 'SmartEditTab' },
    { id: 'oncology-metrics', label: 'Metrics', component: 'OncologyMetricsTab' },
  ],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'oncology-metrics', component: 'OncologyMetricsPanel', order: 2 },
    { id: 'analytics', component: 'AnalyticsPanel', order: 3 },
  ],

  detectionHints: {
    modalities: ['CT', 'MR', 'PT'],
    bodyParts: ['LIVER', 'LUNG', 'CHEST', 'ABDOMEN', 'PELVIS', 'WHOLE BODY'],
    descriptionKeywords: ['tumor', 'mass', 'lesion', 'oncology', 'cancer', 'metasta'],
    protocolKeywords: ['staging', 'restaging', 'follow-up', 'surveillance'],
  },
};
```

---

## 4. Backend Task Configuration

### 4.1 oncology.yaml

```yaml
suite_id: oncology
suite_type: oncology
display_name: "Oncology Suite"
version: "1.0.0"

tasks:
  brain_tumor:
    task_id: brain_tumor
    display_name: "Brain Tumor"
    description: "Segment brain tumors including gliomas, meningiomas, metastases"
    primary_model: biomedparse
    fallback_model: smartedit
    model_params:
      text_prompt: "brain tumor"
    default_label_name: "GTV_Brain"
    label_color: "#FF6B6B"
    body_regions: ["head", "brain"]

  liver_lesion:
    task_id: liver_lesion
    display_name: "Liver Lesion"
    description: "Segment hepatic lesions, tumors, and metastases"
    primary_model: biomedparse
    fallback_model: totalsegmentator
    model_params:
      text_prompt: "liver tumor"
    default_label_name: "GTV_Liver"
    label_color: "#4ECDC4"
    body_regions: ["abdomen", "liver"]

  lung_nodule:
    task_id: lung_nodule
    display_name: "Lung Nodule"
    description: "Detect and segment pulmonary nodules"
    primary_model: biomedparse
    fallback_model: totalsegmentator
    model_params:
      text_prompt: "lung nodule"
    default_label_name: "GTV_Lung"
    label_color: "#45B7D1"
    body_regions: ["chest", "lung"]

  generic_tumor:
    task_id: generic_tumor
    display_name: "Generic Tumor (Interactive)"
    description: "Interactive segmentation with user prompts for any tumor type"
    primary_model: smartedit
    model_params:
      nninter: "sam3"
    default_label_name: "GTV"
    label_color: "#F39C12"
    body_regions: ["any"]

default_analytics:
  - volumetrics
  - connected_components
  - lesion_count
```

---

## 5. UI Components

### 5.1 OncologyMetricsPanel

**Location**: `/apps/viewer/src/components/right-panel/panels/OncologyMetricsPanel.tsx`

**Features**:
- **Volume Summary**: Per-segment total volumes
- **Lesion Table**: Per-lesion ID, volume, centroid
- **RECIST Section**: Longest diameter measurements
- **Comparison View**: Baseline vs follow-up (if available)
- **Export Buttons**: CSV, JSON, clipboard

**UI Mockup**:
```
┌─────────────────────────────────────┐
│ Oncology Metrics                    │
├─────────────────────────────────────┤
│ Volume Summary                      │
│ ┌─────────────────────────────────┐ │
│ │ Tumor_Enhancing    12.4 cm³     │ │
│ │ Tumor_NonEnhancing  5.2 cm³     │ │
│ │ Edema              23.1 cm³     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Lesions (3 total)                   │
│ ┌─────────┬─────────┬────────────┐ │
│ │ ID      │ Volume  │ Location   │ │
│ ├─────────┼─────────┼────────────┤ │
│ │ Lesion_1│ 8.2 cm³ │ R Frontal  │ │
│ │ Lesion_2│ 3.1 cm³ │ L Parietal │ │
│ │ Lesion_3│ 1.1 cm³ │ Cerebellum │ │
│ └─────────┴─────────┴────────────┘ │
│                                     │
│ [Export CSV] [Export JSON] [Copy]   │
└─────────────────────────────────────┘
```

### 5.2 Lesion Comparison View (v1.1)

**Features**:
- Side-by-side baseline/follow-up
- Volume change % per lesion
- New/resolved lesion highlighting
- Response category (CR, PR, SD, PD)

---

## 6. Backend Analytics

### 6.1 Lesion Analysis Endpoint

**Endpoint**: `POST /analytics/lesion_analysis`

**Request**:
```json
{
  "mask_file": "<uploaded NIfTI>",
  "segment_labels": {
    "1": "Tumor_Enhancing",
    "2": "Tumor_NonEnhancing"
  }
}
```

**Response**:
```json
{
  "lesions": [
    {
      "lesion_id": "Tumor_Enhancing_1",
      "label_index": 1,
      "instance_id": 1,
      "label_name": "Tumor_Enhancing",
      "volume_mm3": 8234.5,
      "volume_cm3": 8.23,
      "centroid_ijk": [128, 145, 67],
      "bounding_box": [[110, 130, 55], [146, 160, 79]]
    },
    ...
  ],
  "summary": {
    "total_lesion_count": 3,
    "total_tumor_burden_mm3": 12400.0,
    "total_tumor_burden_cm3": 12.4,
    "largest_lesion_id": "Tumor_Enhancing_1",
    "largest_lesion_volume_cm3": 8.23
  }
}
```

### 6.2 Algorithm

1. For each label in mask:
   - Run connected component analysis (scipy.ndimage.label)
   - Calculate volume per component: `voxel_count * voxel_volume_mm3`
   - Calculate centroid: `np.mean(coords, axis=0)`
   - Calculate bounding box: `min/max(coords)`
2. Aggregate summary statistics
3. Return structured JSON

---

## 7. Model Mapping

| Task | Primary Model | Fallback | Text Prompt |
|------|---------------|----------|-------------|
| Brain Tumor | BiomedParse | SmartEdit | "brain tumor" |
| Liver Lesion | BiomedParse | TotalSegmentator | "liver tumor" |
| Lung Nodule | BiomedParse | TotalSegmentator | "lung nodule" |
| Generic | SmartEdit (SAM3) | - | User prompts |

---

## 8. Export Formats

### 8.1 NIfTI Export
- Label map with consistent label IDs
- Includes affine transformation
- Gzip compressed (.nii.gz)

### 8.2 CSV Export
```csv
patient_id,study_id,structure_name,lesion_id,volume_mm3,volume_cm3,centroid_x,centroid_y,centroid_z
PT001,STUDY001,Tumor_Enhancing,1,8234.5,8.23,128,145,67
PT001,STUDY001,Tumor_Enhancing,2,3100.0,3.10,89,110,45
```

### 8.3 JSON Export
```json
{
  "patient_id": "PT001",
  "study_id": "STUDY001",
  "analysis_timestamp": "2025-01-15T10:30:00Z",
  "lesions": [...],
  "summary": {...}
}
```

---

## 9. Auto-Detection Rules

The Oncology Suite is auto-detected when:

1. **Modality** is CT, MR, or PT (PET)
2. **Body Part** includes LIVER, LUNG, CHEST, ABDOMEN, PELVIS
3. **Description** contains: tumor, mass, lesion, oncology, cancer, metasta
4. **Protocol** contains: staging, restaging, follow-up

**Confidence Scoring**:
- Modality match: +3
- Body part match: +2
- Description keyword: +4
- Protocol keyword: +2

Threshold: >= 0.3 confidence

---

## 10. Implementation Streams (Phase 2)

The following streams can be implemented independently by separate agents. Each stream has all details needed for implementation.

---

## Stream A: Full RECIST 1.1 Workflow

### Objective
Implement auditable RECIST 1.1 response assessment with proper target lesion selection, SLD computation, and lymph node handling.

### Files to Create

| File | Purpose |
|------|---------|
| `/medai-viewer/packages/core/src/stores/recistTypes.ts` | Type definitions for RECIST lesions, assessments |
| `/medai-viewer/packages/core/src/stores/recistStore.ts` | Zustand store for RECIST session management |
| `/medai-viewer/packages/core/src/utils/recistMetrics.ts` | SLD computation, response classification |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/RECISTTargetSelectionPanel.tsx` | Target lesion selection UI |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/RECISTNonTargetPanel.tsx` | Non-target tracking UI |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/RECISTAssessmentTable.tsx` | RECIST response table |

### Files to Modify

| File | Changes |
|------|---------|
| `/medai-viewer/packages/core/src/index.ts` | Export RECIST modules |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/OncologyMetricsPanel.tsx` | Add RECIST mode toggle |
| `/MedAI-server/monailabel/endpoints/analytics.py` | Add `/recist-measurements` endpoint |

### Type Definitions (recistTypes.ts)

```typescript
export type RECISTLesionType = 'target' | 'non_target' | 'new';
export type NonTargetStatus = 'present' | 'absent' | 'unequivocal_progression';
export type AnatomicalRegion = 'lung' | 'liver' | 'lymph_node' | 'adrenal' | 'bone' | 'brain' | 'soft_tissue' | 'other';

export interface RECISTLesion {
  id: string;
  segmentIndex: number;
  segmentLabel: string;
  type: RECISTLesionType;
  anatomicalRegion: AnatomicalRegion;
  isLymphNode: boolean;

  // Baseline measurements
  baselineLongestDiameterMm: number;
  baselineShortAxisMm?: number;  // For lymph nodes
  baselineTimepointId: string;

  // Current measurements
  currentLongestDiameterMm?: number;
  currentShortAxisMm?: number;
  currentTimepointId?: string;

  // Non-target specific
  nonTargetStatus?: NonTargetStatus;

  createdAt: number;
  updatedAt: number;
}

export interface RECISTAssessment {
  timepointId: string;

  // Target lesion metrics
  targetLesions: RECISTLesion[];
  sumOfLongestDiameters: number;
  sldChangeFromBaseline: number;  // Percentage
  sldChangeFromNadir: number;

  // Non-target assessment
  nonTargetLesions: RECISTLesion[];
  nonTargetOverallStatus: NonTargetStatus | 'not_evaluable';

  // New lesions
  newLesions: RECISTLesion[];
  hasNewLesions: boolean;

  // Overall response
  targetResponse: ProgressionClassification;
  overallResponse: ProgressionClassification;

  computedAt: number;
}

export interface RECISTSession {
  sessionId: string;
  lesions: RECISTLesion[];
  assessments: Record<string, RECISTAssessment>;
  nadirSLD: number;
  nadirTimepointId: string;
  validationErrors: string[];
  createdAt: number;
  updatedAt: number;
}

export const RECIST_1_1_CONSTRAINTS = {
  MAX_TARGET_LESIONS_TOTAL: 10,
  MAX_TARGET_LESIONS_PER_ORGAN: 5,
  MIN_MEASURABLE_LESION_MM: 10,
  MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM: 15,
  LYMPH_NODE_NORMAL_THRESHOLD_MM: 10,
  CR_LYMPH_NODE_SHORT_AXIS_THRESHOLD_MM: 10,
  PR_THRESHOLD_PERCENT: -30,
  PD_THRESHOLD_PERCENT: 20,
  PD_MINIMUM_ABSOLUTE_INCREASE_MM: 5,
} as const;
```

### Store Interface (recistStore.ts)

```typescript
export interface RECISTState {
  recistSessions: Record<string, RECISTSession>;
  selectedLesionId: string | null;

  // Session management
  createRECISTSession: (sessionId: string) => void;
  deleteRECISTSession: (sessionId: string) => void;

  // Lesion management
  addTargetLesion: (sessionId: string, lesion: Omit<RECISTLesion, 'id' | 'type'>) => string | null;
  addNonTargetLesion: (sessionId: string, lesion: Omit<RECISTLesion, 'id' | 'type'>) => string;
  addNewLesion: (sessionId: string, lesion: Omit<RECISTLesion, 'id' | 'type'>) => string;
  removeLesion: (sessionId: string, lesionId: string) => void;
  updateLesionMeasurement: (sessionId: string, lesionId: string, timepointId: string, measurements: { longestDiameterMm: number; shortAxisMm?: number }) => void;

  // Non-target status
  setNonTargetStatus: (sessionId: string, lesionId: string, status: NonTargetStatus) => void;

  // Assessment
  computeAssessment: (sessionId: string, timepointId: string) => RECISTAssessment;

  // Validation
  validateConstraints: (sessionId: string) => string[];
  canAddTargetLesion: (sessionId: string, anatomicalRegion: AnatomicalRegion) => boolean;
}
```

### Metrics Functions (recistMetrics.ts)

```typescript
// Compute Sum of Longest Diameters (lymph nodes use short axis)
export function computeSLD(lesions: RECISTLesion[]): number;

// Compute SLD change from baseline
export function computeSLDChangeFromBaseline(currentSLD: number, baselineSLD: number): number;

// Compute SLD change from nadir (lowest point)
export function computeSLDChangeFromNadir(currentSLD: number, nadirSLD: number): number;

// Classify target lesion response per RECIST 1.1
export function classifyTargetResponse(
  sldChangeFromBaseline: number,
  sldChangeFromNadir: number,
  absoluteIncreaseMm: number,
  allLesionsDisappeared: boolean
): ProgressionClassification;

// Classify non-target lesion response
export function classifyNonTargetResponse(statuses: NonTargetStatus[]): NonTargetStatus | 'not_evaluable';

// Compute overall response combining target, non-target, and new lesions
export function computeOverallResponse(
  targetResponse: ProgressionClassification,
  nonTargetStatus: NonTargetStatus | 'not_evaluable',
  hasNewLesions: boolean
): ProgressionClassification;

// Check if lesion is measurable per RECIST 1.1
export function isLesionMeasurable(longestDiameterMm: number, isLymphNode: boolean, shortAxisMm?: number): boolean;

// Get effective diameter for SLD (non-lymph nodes: longest, lymph nodes: short axis)
export function getEffectiveDiameter(lesion: RECISTLesion): number;
```

### Backend Endpoint (analytics.py)

Add `/recist-measurements` endpoint:

```python
@router.post("/recist-measurements")
async def recist_measurements_endpoint(
    background_tasks: BackgroundTasks,
    mask_file: UploadFile = File(...),
    params: str = Form("{}")
):
    """
    Compute RECIST 1.1 measurements for segmentation mask.

    Returns for each segment:
    - longest_diameter_mm: Longest axis in axial plane
    - short_axis_mm: Perpendicular to longest axis
    - is_measurable: Whether meets RECIST criteria
    """
```

### Implementation Steps

1. Create `recistTypes.ts` with all type definitions
2. Create `recistMetrics.ts` with SLD and classification functions
3. Create `recistStore.ts` with Zustand store (persist to localStorage)
4. Add `/recist-measurements` endpoint to backend
5. Create `RECISTTargetSelectionPanel.tsx` - checkbox UI for marking targets
6. Create `RECISTNonTargetPanel.tsx` - status dropdowns for non-targets
7. Create `RECISTAssessmentTable.tsx` - tabular display with export
8. Modify `OncologyMetricsPanel.tsx` - add RECIST mode toggle
9. Export new modules from `@medai/core`

### Verification

1. Create longitudinal session with 2 CT studies
2. Select 3 target lesions across 2 organs
3. Add 2 non-target lesions
4. Verify SLD calculation uses short axis for lymph nodes
5. Verify constraint validation (max 5/organ, max 10 total)
6. Export RECIST table as CSV

---

## Stream B: Lesion Correspondence Across Timepoints

### Objective
Implement intelligent lesion matching between timepoints using centroid proximity, size similarity, and optional registration.

### Files to Create

| File | Purpose |
|------|---------|
| `/medai-viewer/packages/core/src/stores/lesionCorrespondenceTypes.ts` | Matching types |
| `/medai-viewer/packages/core/src/stores/lesionCorrespondenceStore.ts` | Correspondence state |
| `/medai-viewer/packages/core/src/utils/lesionMatchingAlgorithm.ts` | Matching algorithm |
| `/medai-viewer/packages/core/src/services/RegistrationService.ts` | Frontend registration client |
| `/medai-viewer/packages/core/src/services/SegmentationPropagationService.ts` | Propagate baseline to follow-up |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/LesionCorrespondencePanel.tsx` | Match confirmation UI |
| `/MedAI-server/monailabel/endpoints/registration.py` | Rigid/affine registration endpoint |
| `/MedAI-server/monailabel/utils/registration.py` | SimpleITK registration |

### Files to Modify

| File | Changes |
|------|---------|
| `/medai-viewer/packages/core/src/utils/longitudinalMetrics.ts` | Use correspondences for deltas |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/LongitudinalMetricsPanel.tsx` | Show match confidence |
| `/medai-viewer/packages/core/src/index.ts` | Export new modules |

### Type Definitions (lesionCorrespondenceTypes.ts)

```typescript
export interface LesionInstance {
  timepointId: string;
  segmentIndex: number;
  segmentLabel: string;
  centroidIJK: [number, number, number];
  centroidWorld: [number, number, number];  // In mm
  volumeCm3: number;
  boundingBox: [[number, number, number], [number, number, number]];
}

export interface LesionCorrespondence {
  id: string;
  canonicalLabel: string;  // User-assigned name
  instances: Map<string, LesionInstance>;  // timepointId -> instance
  matchConfidence: number;  // 0-1
  matchMethod: 'label' | 'centroid' | 'registration' | 'manual';
  status: 'confirmed' | 'pending' | 'rejected';
}

export interface UnmatchedLesion {
  timepointId: string;
  instance: LesionInstance;
  classification: 'new' | 'resolved' | 'uncertain';
}

export interface LesionMatchingConfig {
  centroidProximityThresholdMm: number;  // Default: 30
  sizeSimilarityThreshold: number;       // Default: 0.5
  useRegisteredSpace: boolean;
  autoConfirmHighConfidence: boolean;
  highConfidenceThreshold: number;       // Default: 0.85
}

export const DEFAULT_MATCHING_CONFIG: LesionMatchingConfig = {
  centroidProximityThresholdMm: 30,
  sizeSimilarityThreshold: 0.5,
  useRegisteredSpace: false,
  autoConfirmHighConfidence: true,
  highConfidenceThreshold: 0.85,
};
```

### Store Interface (lesionCorrespondenceStore.ts)

```typescript
export interface LesionCorrespondenceState {
  correspondencesBySession: Map<string, LesionCorrespondence[]>;
  unmatchedBySession: Map<string, UnmatchedLesion[]>;
  registrationBySessionPair: Map<string, RegistrationResult>;
  matchingConfig: LesionMatchingConfig;
  isComputingRegistration: boolean;

  // Matching
  computeCorrespondences: (sessionId: string) => void;
  confirmMatch: (correspondenceId: string) => void;
  rejectMatch: (correspondenceId: string) => void;
  createManualMatch: (instances: LesionInstance[]) => void;

  // Registration
  computeRegistration: (sessionId: string, baselineId: string, followupId: string) => Promise<void>;

  // Config
  setMatchingConfig: (config: Partial<LesionMatchingConfig>) => void;
}
```

### Matching Algorithm (lesionMatchingAlgorithm.ts)

```typescript
export interface MatchingResult {
  matches: Array<{
    baseline: LesionInstance;
    followup: LesionInstance;
    confidence: number;
    method: 'label' | 'centroid' | 'registration';
  }>;
  unmatchedBaseline: LesionInstance[];
  unmatchedFollowup: LesionInstance[];
}

// Main matching function
export function computeLesionMatches(
  baselineInstances: LesionInstance[],
  followupInstances: LesionInstance[],
  config: LesionMatchingConfig,
  registrationTransform?: number[][]
): MatchingResult;

// Scoring functions
export function computeCentroidProximityScore(a: LesionInstance, b: LesionInstance, transform?: number[][]): number;
export function computeSizeSimilarityScore(a: LesionInstance, b: LesionInstance): number;
export function computeCombinedMatchScore(proximityScore: number, sizeScore: number, labelMatch: boolean): number;
```

**Algorithm Details:**
1. Label-first: Exact label match = primary match candidate
2. Centroid proximity: Euclidean distance in world coords, normalize to 0-1
3. Size similarity: `1 - abs(v1-v2)/max(v1,v2)`
4. Combined: `0.4 * proximity + 0.3 * size + 0.3 * labelBonus`
5. Hungarian algorithm for optimal global assignment
6. Accept matches above 0.5 confidence

### Backend Registration (registration.py)

```python
router = APIRouter(prefix="/registration", tags=["Registration"])

@router.post("/rigid")
async def compute_rigid_registration(
    fixed_image: UploadFile = File(...),
    moving_image: UploadFile = File(...)
):
    """Compute 6-DOF rigid registration using SimpleITK."""

@router.post("/affine")
async def compute_affine_registration(
    fixed_image: UploadFile = File(...),
    moving_image: UploadFile = File(...)
):
    """Compute 12-DOF affine registration."""

@router.post("/resample-mask")
async def resample_mask(
    mask_file: UploadFile = File(...),
    target_image: UploadFile = File(...),
    transform_matrix: str = Form(...)
):
    """Resample segmentation mask to target space."""
```

### Implementation Steps

1. Create `lesionCorrespondenceTypes.ts` with all types
2. Create `lesionMatchingAlgorithm.ts` with matching logic
3. Create `lesionCorrespondenceStore.ts` with Zustand store
4. Create backend `/registration` endpoints using SimpleITK
5. Create `RegistrationService.ts` frontend client
6. Create `LesionCorrespondencePanel.tsx` with:
   - Match list with confidence scores
   - Confirm/Reject buttons
   - Manual match drag-drop
   - Unmatched lesion sections
7. Create `SegmentationPropagationService.ts` for "propagate baseline"
8. Update `longitudinalMetrics.ts` to use correspondences
9. Update `LongitudinalMetricsPanel.tsx` to show match info

### Verification

1. Create session with baseline and follow-up CT
2. Segment 3 lesions in baseline, 4 in follow-up
3. Run auto-matching, verify confidence scores
4. Confirm high-confidence matches
5. Manually link an ambiguous match
6. Propagate baseline segmentation to follow-up
7. Verify delta calculations use correspondences

---

## Stream C: Trial-Grade Exports & Collaboration

### Objective
Add DICOM-SEG export, structured oncology measurements, provenance tracking, draft/final locking, and audit logging.

### Files to Create

| File | Purpose |
|------|---------|
| `/medai-viewer/packages/core/src/schemas/oncologyExportSchema.ts` | Structured JSON schema |
| `/medai-viewer/packages/core/src/schemas/sessionArtifactSchema.ts` | Session export schema |
| `/medai-viewer/packages/core/src/stores/provenanceStore.ts` | Edit/inference tracking |
| `/medai-viewer/packages/core/src/services/DICOMSegExportService.ts` | DICOM-SEG frontend |
| `/medai-viewer/packages/core/src/services/OncologyExportService.ts` | Structured export |
| `/medai-viewer/packages/core/src/services/SessionExportService.ts` | Session artifact |
| `/medai-viewer/packages/core/src/services/AuditService.ts` | Audit logging |
| `/MedAI-server/monailabel/endpoints/dicomseg.py` | DICOM-SEG import/export |
| `/MedAI-server/monailabel/endpoints/exports.py` | Structured oncology export |
| `/MedAI-server/monailabel/endpoints/audit.py` | Audit log endpoints |
| `/MedAI-server/monailabel/services/audit_log.py` | Audit log service |

### Files to Modify

| File | Changes |
|------|---------|
| `/medai-viewer/packages/core/src/stores/segmentationStore.ts` | Add `status: 'draft' \| 'final'` |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/SegmentsPanel.tsx` | DICOM-SEG export, finalize button |
| `/medai-viewer/apps/viewer/src/components/right-panel/tabs/LongitudinalReportTab.tsx` | Session export/import |

### Oncology Export Schema (oncologyExportSchema.ts)

```typescript
export interface OncologyExportSchema {
  version: "1.0.0";
  exportTimestamp: string;
  exportType: "oncology_measurements";

  context: {
    patientId: string;
    patientName?: string;
    studyInstanceUID: string;
    studyDate: string;
    seriesInstanceUID: string;
    modality: string;
    bodyPartExamined?: string;
  };

  lesions: OncologyLesion[];
  responseAssessment?: ResponseAssessment;
  provenance: ProvenanceInfo;
  sessionId?: string;
}

export interface OncologyLesion {
  lesionId: string;
  segmentLabel: string;
  segmentIndex: number;

  measurements: {
    volumeMm3: number;
    volumeCm3: number;
    longestAxisMm: number;
    shortAxisMm?: number;
    maxDiameterMm: number;
  };

  location: {
    centroidIJK: [number, number, number];
    centroidRAS?: [number, number, number];
    boundingBox: [[number, number, number], [number, number, number]];
    anatomicalRegion?: string;
  };

  instanceCount: number;

  matchedTo?: {
    timepointId: string;
    lesionId: string;
    matchConfidence: number;
  };
}

export interface ProvenanceInfo {
  segmentationModel: {
    name: string;
    version: string;
    parameters: Record<string, unknown>;
    inferenceTimestamp: string;
  };

  edits: EditRecord[];

  reviewer?: {
    username: string;
    reviewTimestamp: string;
    status: 'draft' | 'final';
  };

  softwareInfo: {
    applicationName: "MedAI";
    applicationVersion: string;
    exportTimestamp: string;
  };
}

export interface EditRecord {
  timestamp: string;
  username: string;
  action: 'create' | 'modify' | 'delete' | 'merge' | 'split';
  target: { type: 'segment' | 'lesion' | 'measurement'; id: string };
  tool?: string;
}
```

### Provenance Store (provenanceStore.ts)

```typescript
export interface ProvenanceState {
  provenanceBySegmentationId: Map<string, SegmentationProvenance>;
  editHistory: EditRecord[];

  recordInference: (segmentationId: string, modelInfo: ModelInfo) => void;
  recordEdit: (edit: EditRecord) => void;
  setReviewer: (segmentationId: string, reviewer: ReviewerInfo) => void;
  getProvenance: (segmentationId: string) => SegmentationProvenance | undefined;
  exportProvenance: (segmentationId: string) => ProvenanceInfo;
}

export interface SegmentationProvenance {
  segmentationId: string;
  modelInfo: {
    name: string;
    version: string;
    parameters: Record<string, unknown>;
    inferenceTimestamp: string;
  };
  edits: EditRecord[];
  status: 'draft' | 'final';
  reviewer?: { username: string; timestamp: string };
  createdAt: number;
  updatedAt: number;
}
```

### Session Artifact Schema (sessionArtifactSchema.ts)

```typescript
export interface SessionArtifact {
  version: "1.0.0";
  exportedAt: string;

  session: {
    id: string;
    type: 'longitudinal' | 'single_study';
    patientId: string;
    description?: string;
  };

  timepoints?: LongitudinalTimepoint[];
  segmentations: SerializedSegmentation[];

  measurements: {
    volumetrics: Record<string, VolumetricsResult>;
    radiomics?: Record<string, RadiomicsResult>;
  };

  provenance: Record<string, ProvenanceInfo>;
  responseAssessment?: ResponseAssessment;
}

export interface SerializedSegmentation {
  id: string;
  label: string;
  imageId: string;
  status: 'draft' | 'final';
  segments: Segment[];
  labelmapDataBase64: string;  // Compressed labelmap
  dimensions: [number, number, number];
}
```

### Backend Endpoints

**dicomseg.py:**
```python
@router.post("/export")
async def export_dicom_seg(mask_file: UploadFile, params: str):
    """Convert NIfTI labelmap to DICOM-SEG."""
    # Leverage existing nifti_to_dicom_seg() from convert.py

@router.post("/import")
async def import_dicom_seg(dicom_seg_file: UploadFile):
    """Convert DICOM-SEG to NIfTI labelmap."""
    # Leverage existing dicom_seg_to_itk_image() from convert.py
```

**audit.py:**
```python
@router.get("/logs")
async def get_audit_logs(start_date: str = None, resource_type: str = None):
    """Query audit log entries (admin only)."""

@router.post("/log")
async def create_audit_entry(entry: AuditEntry):
    """Create audit log entry."""
```

### Implementation Steps

1. Create `provenanceStore.ts` - track inference and edits
2. Modify `segmentationStore.ts` - add status field and finalize action
3. Create `oncologyExportSchema.ts` and `sessionArtifactSchema.ts`
4. Create backend `/dicomseg` endpoints leveraging `convert.py`
5. Create backend `/exports/oncology/json` and `/exports/oncology/csv`
6. Create backend audit log service and endpoints
7. Create frontend `DICOMSegExportService.ts`
8. Create frontend `OncologyExportService.ts`
9. Create frontend `SessionExportService.ts`
10. Create frontend `AuditService.ts`
11. Modify `SegmentsPanel.tsx` - add export dropdown, finalize button
12. Modify `LongitudinalReportTab.tsx` - add session export/import
13. Hook provenance recording into inference and edit flows

### Verification

1. Run inference, verify provenance recorded
2. Make segmentation edits, verify edit history
3. Finalize segmentation, verify cannot edit
4. Export as DICOM-SEG, reimport, verify fidelity
5. Export structured JSON, verify schema compliance
6. Export session artifact, reimport in new session
7. Query audit log as admin

---

## Stream D: PET/SUV Metrics

### Objective
Add SUV (Standardized Uptake Value) computation for PET imaging with per-lesion metrics.

### Files to Create

| File | Purpose |
|------|---------|
| `/medai-viewer/packages/core/src/utils/suvComputation.ts` | SUV calculation utilities |
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/PETMetricsPanel.tsx` | SUV display panel |
| `/MedAI-server/monailabel/endpoints/suv.py` | SUV computation endpoint |

### Files to Modify

| File | Changes |
|------|---------|
| `/medai-viewer/apps/viewer/src/components/right-panel/panels/OncologyMetricsPanel.tsx` | Show SUV when PT modality |
| `/medai-viewer/packages/core/src/stores/analyticsStore.ts` | Store SUV results |

### SUV Types (suvComputation.ts)

```typescript
export interface SUVMetrics {
  segmentLabel: string;
  segmentIndex: number;
  suvMax: number;           // Maximum SUV in lesion
  suvMean: number;          // Mean SUV in lesion
  suvPeak: number;          // SUV in 1cm³ sphere around max
  metabolicVolume: number;  // Volume above threshold (mL)
  totalLesionGlycolysis: number;  // SUVmean × volume
}

export interface SUVComputationParams {
  injectedDose: number;     // MBq (from DICOM RadionuclideTotalDose)
  patientWeight: number;    // kg (from DICOM PatientWeight)
  scanTime: string;         // From DICOM AcquisitionTime
  injectionTime: string;    // From DICOM RadiopharmaceuticalStartTime
  halfLife: number;         // seconds (F-18: 6586.2)
  suvThreshold?: number;    // For metabolic volume (default: 2.5)
}

// SUVbw formula:
// SUV = (tissue_activity_Bq/mL) / (injected_dose_Bq / body_weight_g)
// With decay correction for time between injection and scan

export function computeSUVbw(
  pixelValue: number,
  rescaleSlope: number,
  rescaleIntercept: number,
  params: SUVComputationParams
): number;

export function computeLesionSUVMetrics(
  imageData: Float32Array,
  maskData: Uint8Array,
  segmentIndex: number,
  spacing: [number, number, number],
  rescaleParams: { slope: number; intercept: number },
  suvParams: SUVComputationParams
): SUVMetrics;
```

### Backend Endpoint (suv.py)

```python
@router.post("/compute")
async def compute_suv_metrics(
    image_file: UploadFile = File(...),
    mask_file: UploadFile = File(...),
    params: str = Form("{}")  # SUVComputationParams as JSON
):
    """
    Compute SUV metrics for each segment in mask.

    Params should include:
    - injected_dose_mbq
    - patient_weight_kg
    - scan_time (ISO)
    - injection_time (ISO)
    - half_life_seconds (default: 6586.2 for F-18)

    Returns SUVMetrics per segment.
    """
```

### Required DICOM Tags

Extract from PET series:
- `(0010,1030)` PatientWeight
- `(0054,0016)` Radiopharmaceutical Information Sequence
  - `(0018,1072)` RadiopharmaceuticalStartTime
  - `(0018,1074)` RadionuclideTotalDose
  - `(0018,1075)` RadionuclideHalfLife
- `(0008,0031)` SeriesTime or `(0008,0032)` AcquisitionTime
- `(0028,1052)` RescaleIntercept
- `(0028,1053)` RescaleSlope
- `(0028,1054)` RescaleType (should be "BQML")

### Implementation Steps

1. Create `suvComputation.ts` with SUV formulas
2. Create `/suv/compute` backend endpoint
3. Create `PETMetricsPanel.tsx` UI component
4. Update `analyticsStore.ts` to store SUV results
5. Update `OncologyMetricsPanel.tsx` to show SUV tab when PT modality
6. Extract DICOM PET tags in frontend for params
7. Add longitudinal SUV change tracking

### Verification

1. Load PET-CT study with FDG-PET
2. Segment a lesion
3. Compute SUV metrics
4. Verify SUVmax against clinical reference
5. Create longitudinal session with 2 PET studies
6. Verify SUV change tracking

---

## 11. Testing

### Unit Tests
- Lesion analysis with known volumes
- Connected component counting
- RECIST SLD computation
- SUV calculations
- Export format validation

### Integration Tests
- Full brain tumor workflow
- Full liver lesion workflow
- Model fallback behavior
- Lesion correspondence matching
- DICOM-SEG round-trip

### E2E Tests
- Load CT chest → auto-detect Oncology
- Run segmentation → view metrics → export
- Longitudinal RECIST workflow
- PET SUV workflow
