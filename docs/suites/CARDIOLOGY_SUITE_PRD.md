# Cardiology Suite PRD

## Overview

The **Cardiology Suite** provides cardiac structure segmentation, ventricular volume analysis, and ejection fraction calculation for cardiac imagers and cardiologists.

**Status**: Phase 3 (Planned)

---

## 1. Target Users

| Persona | Needs |
|---------|-------|
| **Cardiac Imager** | LV/RV volumes, wall motion analysis |
| **Cardiologist** | EF calculation, cardiac function assessment |
| **Researcher** | Reproducible cardiac metrics, cohort analysis |

---

## 2. Use Cases

### 2.1 Cardiac CT Analysis
1. Load cardiac CT
2. Segment LV cavity, myocardium, aorta
3. Calculate chamber volumes
4. Export metrics

### 2.2 Cine MRI Analysis
1. Load cine MRI (4D)
2. Navigate through cardiac phases with time slider
3. Segment LV at end-diastole and end-systole
4. Calculate EDV, ESV, EF

### 2.3 Strain Analysis (Future)
1. Load tagged MRI or feature tracking data
2. Calculate myocardial strain
3. Display strain maps

---

## 3. Suite Configuration (Planned)

```typescript
export const CARDIOLOGY_SUITE: SuiteConfig = {
  id: 'cardiology',
  name: 'Cardiology',
  description: 'Cardiac volumes and ejection fraction',
  icon: 'Heart',

  defaultLayout: 'fourUp',  // With time slider for cine

  wlPresets: [
    'ct-soft-tissue',
    'ct-cardiac',
    'mr-cardiac',
  ],

  enabledTools: [
    'WindowLevel', 'Zoom', 'Pan', 'Crosshairs',
    'Brush', 'Eraser', 'Lasso',
    'TimeSlider'  // Special tool for cine
  ],

  monaiTasks: ['cardiac_segmentation', 'lv_segmentation'],
  preferredModels: ['TotalSegmentator', 'nnInteractive'],

  metricsPanelId: 'cardio-metrics',
  enabledMetrics: ['volume', 'edv', 'esv', 'ef', 'mass'],

  allowedExports: ['nifti', 'csv', 'json'],

  tabs: [
    { id: 'auto-segmentation', label: 'Auto-Seg', component: 'AutoSegmentationTab' },
    { id: 'smart-edit', label: 'SmartEdit', component: 'SmartEditTab' },
    { id: 'cardio-metrics', label: 'Metrics', component: 'CardioMetricsTab' },
  ],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'cardio-metrics', component: 'CardioMetricsPanel', order: 2 },
  ],

  detectionHints: {
    modalities: ['CT', 'MR'],
    bodyParts: ['HEART', 'CHEST'],
    descriptionKeywords: ['cardiac', 'heart', 'cine', 'lv', 'ventricle'],
    protocolKeywords: ['cardiac mri', 'cta', 'function'],
  },
};
```

---

## 4. Planned Features

### 4.1 Time Dimension Handling (Cine)
- Frame slider under primary viewport
- Frame index display
- Synchronized segmentation overlays per frame
- Auto-detect ED and ES phases

### 4.2 Cardiac Metrics
- **CT**:
  - LV volume
  - Myocardial volume/mass
  - Aortic dimensions

- **Cine MRI**:
  - EDV (End-Diastolic Volume)
  - ESV (End-Systolic Volume)
  - SV (Stroke Volume) = EDV - ESV
  - EF% = (EDV - ESV) / EDV × 100
  - LV mass

### 4.3 CardioMetricsPanel
- Phase selector (ED, ES)
- Volume display per phase
- EF calculation display
- Historical comparison (if available)

### 4.4 4D Segmentation
- Segment at key frames (ED, ES)
- Propagate to intermediate frames
- Allow per-frame refinement

---

## 5. Technical Challenges

### 5.1 4D Volume Handling
- Cornerstone3D supports 4D volumes
- Need to handle segmentation per timepoint
- Memory management for large 4D datasets

### 5.2 Phase Detection
- Auto-detect ED (max volume) and ES (min volume)
- May need ECG gating information from DICOM

### 5.3 Model Availability
- TotalSegmentator has basic cardiac structures (CT)
- May need specialized cardiac MRI models

---

## 6. Model Mapping (Planned)

| Task | Primary Model | Modality |
|------|---------------|----------|
| Cardiac CT | TotalSegmentator | CT |
| Cine MRI LV | Specialized model | MR |
| Myocardium | Specialized model | MR |

---

## 7. Implementation Timeline

**Phase 3** (after Phase 2 complete):
- Week 1: Time slider implementation
- Week 2: Frame-based segmentation handling
- Week 3: CardioMetricsPanel development
- Week 4: EF calculation and validation

---

## 8. Dependencies

- 4D volume support in Cornerstone3D
- Cardiac-specific segmentation model (or use TotalSegmentator for CT)
- DICOM cine MRI parsing

---

## 9. Related Documents

- [Main Suites PRD](./SUITES_PRD.md)
- [Oncology Suite PRD](./ONCOLOGY_SUITE_PRD.md)
- [RT Suite PRD](./RT_SUITE_PRD.md)
- [Neurology Suite PRD](./NEUROLOGY_SUITE_PRD.md)
