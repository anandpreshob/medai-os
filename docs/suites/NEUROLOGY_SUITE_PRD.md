# Neurology Suite PRD

## Overview

The **Neurology Suite** provides comprehensive brain analysis capabilities including multi-sequence viewing, disease-specific workflows (MS, Dementia, Stroke), ICV-normalized volumetrics, lesion tracking, and longitudinal analysis for neuroradiologists, neurologists, and neurological researchers.

**Status**: Phase 2 (Implemented)

---

## 1. Target Users

| Persona | Needs |
|---------|-------|
| **Neuroradiologist** | Brain structure volumes, lesion quantification, multi-sequence comparison |
| **Neurologist** | MS lesion load, dementia assessment, stroke evaluation |
| **MS Specialist** | Longitudinal lesion tracking, McDonald criteria assessment |
| **Dementia Specialist** | Hippocampal volumetrics, atrophy rates, asymmetry analysis |
| **Stroke Team** | DWI/ADC comparison, core volume measurement |
| **Researcher** | Standardized brain parcellation, cohort analysis, trial-grade exports |

---

## 2. Use Cases

### 2.1 Multi-Sequence Neuro Workflow
1. Load brain MRI study with multiple sequences (T1, T2, FLAIR, DWI, ADC)
2. System auto-detects sequence types from DICOM metadata
3. Assign sequences to 2×2 or 1×4 viewport grid
4. Navigate with world-coordinate synchronization across resolutions
5. Apply fusion/overlay for multi-modal viewing

### 2.2 MS Protocol Workflow
1. Select "MS Protocol" mode from NeuroModeSelector
2. Load FLAIR and T1 sequences
3. Run MS lesion segmentation
4. System classifies lesions by location (periventricular, juxtacortical, infratentorial)
5. Check McDonald 2017 DIS criteria
6. Track new/enlarging/resolved lesions vs. prior study
7. Export MS trial table (CSV)

### 2.3 Dementia Assessment
1. Select "Dementia" mode
2. Run brain parcellation
3. View hippocampal volumes with L/R asymmetry
4. Calculate brain parenchymal fraction
5. Compare with prior for atrophy rate calculation
6. Export dementia report

### 2.4 Stroke Evaluation
1. Select "Stroke" mode
2. Load DWI and ADC sequences
3. Click "Compare DWI/ADC" for side-by-side layout
4. Run stroke lesion segmentation
5. View infarct core volume with threshold reference
6. Export stroke report

### 2.5 Longitudinal Neuro Analysis
1. Load baseline and follow-up studies
2. System performs lesion correspondence matching
3. View top changes panel (new, enlarging, resolved)
4. Calculate annualized atrophy rates
5. Compare regional volume changes

---

## 3. Disease-Specific Modes

### 3.1 General Neuro Mode
- Default mode for general brain imaging
- All panels visible
- Tasks: brain_parcellation, brain_tumor

### 3.2 MS Protocol Mode
- Emphasizes FLAIR sequence
- Preferred layout: sequence-2x2
- Tasks: ms_lesion, brain_parcellation
- Panels: MSProtocolPanel, LesionLocationBreakdown
- Features: McDonald criteria, lesion location classification

### 3.3 Dementia Mode
- Emphasizes hippocampus and temporal regions
- Tasks: brain_parcellation
- Panels: DementiaPanel, AsymmetryIndicesPanel
- Features: ICV normalization, atrophy rates, BPF

### 3.4 Stroke Mode
- Emphasizes DWI/ADC sequences
- Preferred layout: dwi-adc-compare
- Tasks: stroke_lesion
- Panels: StrokePanel
- Features: Core volume, threshold reference

---

## 4. Suite Configuration

```typescript
export const NEUROLOGY_SUITE: SuiteConfig = {
  id: 'neurology',
  name: 'Neurology',
  description: 'Brain lesion analysis, MS tracking, and neuroimaging workflows',
  icon: 'Brain',

  defaultLayout: 'fourUp',
  additionalLayouts: ['sequence-2x2', 'sequence-1x4', 'fusion-main', 'dwi-adc-compare'],

  wlPresets: ['ct-brain', 'ct-stroke', 'mr-t1', 'mr-t2', 'mr-flair', 'mr-dwi'],

  enabledTools: [
    'WindowLevel', 'Zoom', 'Pan', 'Crosshairs', 'Length',
    'EllipticalROI', 'Brush', 'Eraser', 'Lasso', 'RectFill', 'ProbMap'
  ],

  monaiTasks: [
    'brain_parcellation', 'brain_tumor', 'ms_lesion',
    'stroke_lesion', 'white_matter_hyperintensity'
  ],
  preferredModels: ['BiomedParse', 'nnInteractive', 'SynthSeg'],

  modes: [
    { id: 'general', name: 'General Neuro', preferredTasks: ['brain_parcellation', 'brain_tumor'] },
    { id: 'ms_protocol', name: 'MS Protocol', preferredTasks: ['ms_lesion', 'brain_parcellation'] },
    { id: 'dementia', name: 'Dementia', preferredTasks: ['brain_parcellation'] },
    { id: 'stroke', name: 'Stroke', preferredTasks: ['stroke_lesion'] },
  ],

  enabledMetrics: [
    'volume', 'lesion_count', 'lesion_load', 'brain_volumetrics',
    'atrophy_index', 'laterality', 'icv_normalized', 'asymmetry_index', 'lesion_location'
  ],

  allowedExports: ['nifti', 'csv', 'json', 'dicom-seg', 'ms-trial-table'],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'neuro-mode-selector', component: 'NeuroModeSelector', order: 2 },
    { id: 'neuro-metrics', component: 'NeurologyMetricsPanel', order: 3 },
    { id: 'icv-normalization', component: 'ICVNormalizationBanner', order: 4 },
    { id: 'asymmetry-indices', component: 'AsymmetryIndicesPanel', order: 5 },
    { id: 'regional-grouping', component: 'RegionalGroupingPanel', order: 6 },
    { id: 'lesion-location', component: 'LesionLocationBreakdown', order: 7 },
    { id: 'ms-protocol', component: 'MSProtocolPanel', order: 8, showForModes: ['ms_protocol'] },
    { id: 'dementia', component: 'DementiaPanel', order: 9, showForModes: ['dementia'] },
    { id: 'stroke', component: 'StrokePanel', order: 10, showForModes: ['stroke'] },
    { id: 'top-changes', component: 'TopChangesPanel', order: 11 },
    { id: 'lesion-tracking', component: 'LesionTrackingPanel', order: 12 },
    { id: 'qc', component: 'NeuroQCPanel', order: 13 },
    { id: 'sequence-selector', component: 'SequenceSelectorPanel', order: 14 },
    { id: 'fusion-controls', component: 'FusionControlsPanel', order: 15 },
  ],

  supportsLongitudinal: true,
  longitudinalConfig: {
    maxTimepoints: 4,
    trackableMetrics: ['volume', 'lesion_count', 'lesion_load', 'brain_volumetrics', 'atrophy_index'],
    enableLesionTracking: true,
  },
};
```

---

## 5. Analytics & Metrics

### 5.1 ICV Normalization
Normalize regional volumes to intracranial volume for cross-subject comparison.

```
normalized_volume = (volume_ml / icv_ml) * 1000
```
- Display as "X per 1000 mL ICV"
- Toggle between raw and normalized views

### 5.2 Asymmetry Index
Calculate left-right asymmetry for paired structures.

```
AI = ((L - R) / ((L + R) / 2)) * 100
```
- Interpretation thresholds:
  - Normal: |AI| < 5%
  - Mild: 5% ≤ |AI| < 10%
  - Significant: 10% ≤ |AI| < 15%
  - Severe: |AI| ≥ 15%

### 5.3 Lesion Location Classification (MS-Style)
Classify lesions by anatomical location:
- **Periventricular**: Within 3mm of lateral ventricles
- **Juxtacortical**: Within 3mm of cortical gray matter
- **Infratentorial**: Brainstem or cerebellum
- **Deep white matter**: Other WM locations
- **Cortical**: Within cortical gray matter
- **Spinal cord**: Spinal cord lesions

### 5.4 Atrophy Rate
Calculate annualized atrophy from longitudinal data.

```
rate = ((baseline - current) / baseline) * 100 * (365 / interval_days)
```
- Reference ranges:
  - Normal aging (20-60): 0.2-0.5%/year
  - Normal aging (60+): 0.5-1.0%/year
  - AD hippocampus: 3-6%/year

### 5.5 Regional Grouping
Group parcellation results by anatomical region:
- Frontal, Temporal, Parietal, Occipital lobes
- Subcortical structures
- Cerebellum, Brainstem
- Ventricles
- White matter

---

## 6. Multi-Sequence Workflow

### 6.1 Sequence Detection
Auto-detect MRI sequence type from DICOM metadata:
- T1: "T1", "MPRAGE", "MP-RAGE", "BRAVO"
- T2: "T2", "TSE", "FSE"
- FLAIR: "FLAIR", "DARK_FLUID"
- DWI: "DWI", "DIFFUSION", "EP2D"
- ADC: "ADC", "APPARENT_DIFFUSION"

### 6.2 Layout Presets
- **sequence-2x2**: 2×2 grid for T1/T2/FLAIR/DWI
- **sequence-1x4**: 1×4 row for sequence comparison
- **fusion-main**: Large fused view + sequence strip
- **dwi-adc-compare**: Side-by-side DWI/ADC

### 6.3 World Coordinate Synchronization
- Navigate using world coordinates (mm) not pixel coordinates
- Supports different resolutions across sequences
- Synchronized crosshairs across viewports

### 6.4 Fusion/Overlay
- Per-volume opacity control
- Colormap selection (grayscale, hot, cool, jet, viridis)
- Blend modes: alpha, additive, MIP

---

## 7. Quality Control

### 7.1 Image QC
- **Motion score**: Edge variance across slices (0-100)
- **SNR estimate**: Brain/background ratio
- **Coverage**: Boundary detection for truncation
- **Skull strip quality**: Residual skull, over-stripping

### 7.2 Segmentation QC
- Volume outliers
- Topology errors
- Boundary smoothness
- Partial volume effects

### 7.3 QC Severity Levels
- **Pass**: All checks passed
- **Warning**: Minor issues, review recommended
- **Critical**: Significant issues, manual review required

---

## 8. Backend API Endpoints

### 8.1 Neuro Analytics
```
POST /api/v1/analytics/neuro-metrics
POST /api/v1/analytics/lesion-classification
POST /api/v1/analytics/icv-normalization
POST /api/v1/analytics/asymmetry-indices
```

### 8.2 Neuro QC
```
POST /api/v1/neuro-qc/assess-image
POST /api/v1/neuro-qc/assess-segmentation
```

### 8.3 Neuro Longitudinal
```
POST /api/v1/analytics/neuro-longitudinal
POST /api/v1/analytics/atrophy-rate
POST /api/v1/analytics/top-changes
```

---

## 9. Export Schema

### 9.1 Neurology Export JSON
```typescript
interface NeurologyExportSchema {
  version: '1.0.0';
  exportedAt: string;
  context: {
    patientId?: string;
    studyInstanceUID: string;
    seriesInstanceUID: string;
    modality: string;
    studyDate?: string;
    institutionName?: string;
    clinicalIndication?: string;
    neuroMode: 'general' | 'ms_protocol' | 'dementia' | 'stroke';
  };
  qc: {
    image: ImageQCData;
    segmentation: SegmentQCData[];
    overallStatus: 'pass' | 'warning' | 'critical';
  };
  brainVolumetrics: {
    totalIntracranialVolume: number;
    brainParenchymaVolume: number;
    grayMatterVolume?: number;
    whiteMatterVolume?: number;
    ventricularVolume?: number;
    cerebellumVolume?: number;
    brainstemVolume?: number;
    brainParenchymalFraction?: number;
    hemisphereVolumes?: { left: number; right: number };
  };
  lesionMetrics: {
    lesionCount: number;
    totalLesionVolume: number;
    lesionLoadPercent?: number;
    lesions: LesionData[];
    msLesionCounts?: MSLesionLocationCounts;
    mcDonaldDISMet?: boolean;
  };
  asymmetryIndices?: AsymmetryIndex[];
  regionalVolumes?: Record<string, RegionVolumeData>;
  atrophyAnalysis?: AtrophyData;
  provenance: ProvenanceData;
}
```

### 9.2 MS Trial Table CSV
Export lesion data in clinical trial format with columns:
- LesionID, Location, Volume_mL, Timepoint, Change_Type

---

## 10. Implementation Files

### Frontend (medai-viewer)
```
packages/core/src/stores/
├── neuroSequenceTypes.ts      # Multi-sequence type definitions
├── neuroSequenceStore.ts      # Multi-sequence state management
├── neuroModeTypes.ts          # Mode and metrics type definitions
├── neuroModeStore.ts          # Mode state management
├── qcStore.ts                 # QC state management

packages/core/src/schemas/
├── neurologyExportSchema.ts   # Export JSON schema

apps/viewer/src/components/right-panel/panels/neuro/
├── NeuroModeSelector.tsx      # Mode toggle UI
├── ICVNormalizationBanner.tsx # ICV display and settings
├── AsymmetryIndicesPanel.tsx  # L/R comparison visualization
├── RegionalGroupingPanel.tsx  # Volumes grouped by region
├── LesionLocationBreakdown.tsx # MS lesion location display
├── MSProtocolPanel.tsx        # MS workflow panel
├── DementiaPanel.tsx          # Dementia assessment panel
├── StrokePanel.tsx            # Stroke evaluation panel
├── TopChangesPanel.tsx        # Longitudinal changes highlight
├── NeuroQCPanel.tsx           # QC display widget
├── SequenceSelectorPanel.tsx  # Sequence to slot assignment
├── FusionControlsPanel.tsx    # Fusion/overlay controls

apps/viewer/src/components/neuro/
├── MultiSequenceViewport.tsx  # 2×2/1×4 grid viewport

apps/viewer/src/lib/
├── worldCoordinateSynchronizer.ts # Cross-resolution sync
├── fusionController.ts            # Multi-volume fusion
```

### Backend (MedAI-server)
```
monailabel/endpoints/
├── neuro_analytics.py         # Metrics computation endpoints
├── neuro_qc.py                # QC assessment endpoints
├── neuro_longitudinal.py      # Longitudinal analysis endpoints
```

---

## 11. Auto-Detection Rules

Detect Neurology Suite when:
- **Modality**: MR, CT
- **Body Part**: HEAD, BRAIN, NECK
- **Description keywords**: brain, neuro, stroke, ms, flair, dwi, adc, glioma, meningioma
- **Protocol keywords**: brain, head, neuro, dwi, flair, stroke, epilepsy

---

## 12. Model Mapping

| Task | Primary Model | Fallback |
|------|---------------|----------|
| Brain Parcellation | TotalSegmentator | BiomedParse |
| Brain Tumor | BiomedParse | SmartEdit |
| MS Lesions | BiomedParse | SmartEdit |
| Stroke Lesion | BiomedParse | SmartEdit |
| WMH | BiomedParse | SmartEdit |
| Interactive | SmartEdit (SAM3) | - |

---

## 13. Related Documents

- [Main Suites PRD](./SUITES_PRD.md)
- [Oncology Suite PRD](./ONCOLOGY_SUITE_PRD.md)
- [RT Suite PRD](./RT_SUITE_PRD.md)
- [Longitudinal Sessioning PRD](../med_ai_longitudinal_sessioning_prd.md)
