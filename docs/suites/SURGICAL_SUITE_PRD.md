# Surgical Planning Suite PRD

## Overview

The **Surgical Planning Suite** provides 3D pre-operative visualization, organ/vessel/tumor delineation, and exportable mesh models for surgeons and surgical planners.

**Status**: Phase 2 (Planned)

---

## 1. Target Users

| Persona | Needs |
|---------|-------|
| **Surgeon** | 3D tumor/vessel visualization, pre-op planning |
| **Surgical Planner** | Organ volumes, FLR calculation |
| **Interventional Radiologist** | Vessel mapping, approach planning |
| **3D Lab Technician** | Mesh export for printing/VR |

---

## 2. Use Cases

### 2.1 Liver Surgery Planning
1. Load CT with contrast
2. Segment liver, hepatic veins, portal veins, tumors
3. Calculate total liver volume
4. Define resection territory
5. Calculate FLR (Future Liver Remnant)
6. Export 3D models for review/printing

### 2.2 Kidney Surgery Planning
1. Load CT with contrast
2. Segment kidney, renal vessels, tumor
3. Visualize tumor-vessel relationships
4. Export 3D models

### 2.3 General 3D Visualization
1. Load any CT/MR
2. Segment organs, vessels, pathology
3. Generate 3D surface models
4. Export for VR/AR or 3D printing

---

## 3. Suite Configuration (Planned)

```typescript
export const SURGICAL_SUITE: SuiteConfig = {
  id: 'surgical',
  name: 'Surgical Planning',
  description: '3D pre-op planning and mesh export',
  icon: 'Scissors',

  defaultLayout: 'big3D',  // Large 3D + 1-2 MPRs

  wlPresets: [
    'ct-soft-tissue',
    'ct-liver',
    'ct-angio',
    'ct-bone',
  ],

  enabledTools: [
    'WindowLevel', 'Zoom', 'Pan', 'Crosshairs',
    'Brush', 'Eraser', 'Lasso',
    'Sculpt3D'  // 3D editing tool
  ],

  monaiTasks: ['multi_organ', 'vessel_segmentation'],
  preferredModels: ['TotalSegmentator', 'nnInteractive'],

  metricsPanelId: 'surgical-metrics',
  enabledMetrics: ['volume', 'flr', 'vessel_distance'],

  allowedExports: ['nifti', 'stl', 'obj', 'glb', 'csv'],

  tabs: [
    { id: 'auto-segmentation', label: 'Auto-Seg', component: 'AutoSegmentationTab' },
    { id: 'smart-edit', label: 'SmartEdit', component: 'SmartEditTab' },
    { id: 'surgical-metrics', label: 'Planning', component: 'SurgicalPlanningTab' },
  ],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'surgical-metrics', component: 'SurgicalMetricsPanel', order: 2 },
    { id: 'mesh-export', component: 'MeshExportPanel', order: 3 },
  ],

  detectionHints: {
    modalities: ['CT', 'MR'],
    bodyParts: ['LIVER', 'KIDNEY', 'ABDOMEN'],
    descriptionKeywords: ['surgical', 'pre-op', 'planning', 'resection', 'hepatectomy'],
    protocolKeywords: ['liver protocol', 'triphasic', 'angio'],
  },
};
```

---

## 4. Planned Features

### 4.1 Big 3D Layout
- Large 3D viewport (2/3 of screen)
- 1-2 smaller MPR viewports
- Organ/tumor/vessel surfaces rendered together
- Click-to-crosshair synchronization

### 4.2 Multi-Structure Segmentation
- Liver parenchyma
- Portal veins
- Hepatic veins
- IVC
- Tumors/lesions
- Other organs as needed

### 4.3 FLR Calculation (Liver)
- Total liver volume (TLV)
- Define resection territory (manual or semi-auto)
- FLR = TLV - Resection Volume
- FLR% = FLR / TLV × 100
- Display in SurgicalMetricsPanel

### 4.4 Mesh Export
- Multi-select structures
- Export formats:
  - STL (for 3D printing)
  - OBJ (for visualization software)
  - GLB/GLTF (for web/VR)
- Mesh simplification options
- Color preservation

### 4.5 3D Interaction
- Rotate, zoom, pan 3D model
- Toggle structure visibility
- Transparency control
- Click structure → highlight in MPR

---

## 5. UI Components (Planned)

### 5.1 SurgicalMetricsPanel

```
┌─────────────────────────────────────┐
│ Surgical Planning                   │
├─────────────────────────────────────┤
│ Volume Summary                      │
│ ┌─────────────────────────────────┐ │
│ │ Liver (total)     1,450 cm³    │ │
│ │ Tumor              45 cm³      │ │
│ │ Portal Vein        12 cm³      │ │
│ │ Hepatic Vein        8 cm³      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ FLR Calculation                     │
│ ┌─────────────────────────────────┐ │
│ │ Total Liver:     1,450 cm³     │ │
│ │ Resection:         520 cm³     │ │
│ │ FLR:               930 cm³     │ │
│ │ FLR%:              64.1%       │ │
│ │ Status: ✓ Adequate (>30%)      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Mark Resection] [Calculate FLR]    │
└─────────────────────────────────────┘
```

### 5.2 MeshExportPanel

```
┌─────────────────────────────────────┐
│ 3D Export                           │
├─────────────────────────────────────┤
│ Select structures to export:        │
│ ☑ Liver                            │
│ ☑ Tumor                            │
│ ☑ Portal Vein                      │
│ ☐ Hepatic Vein                     │
│                                     │
│ Format: [STL ▼]                     │
│ Quality: [High ▼]                   │
│                                     │
│ [Export Selected]                   │
└─────────────────────────────────────┘
```

---

## 6. Model Mapping (Planned)

| Task | Primary Model | Structures |
|------|---------------|------------|
| Liver Multi-label | TotalSegmentator | Liver, spleen, kidneys |
| Vessel Segmentation | Specialized model | Portal, hepatic, IVC |
| Tumor | BiomedParse | Liver lesions |

---

## 7. Technical Challenges

### 7.1 Mesh Generation
- Already implemented: Marching cubes in Cornerstone3D
- Need: Mesh decimation for smaller files
- Need: Multi-structure export workflow

### 7.2 Resection Planning
- Interactive 3D plane/volume definition
- Or 2D painting approach propagated to 3D
- Volume calculation of resection territory

### 7.3 Vessel Segmentation
- TotalSegmentator has basic vessels
- May need specialized vessel segmentation model
- Vessel tree visualization

---

## 8. Implementation Timeline

**Phase 2** (after Phase 1 complete):
- Week 1: Big 3D layout implementation
- Week 2: SurgicalMetricsPanel development
- Week 3: MeshExportPanel and export workflow
- Week 4: FLR calculation feature

---

## 9. Dependencies

- 3D surface rendering (already implemented)
- Mesh export library (potentially add to backend)
- Multi-structure segmentation model

---

## 10. Related Documents

- [Main Suites PRD](./SUITES_PRD.md)
- [Oncology Suite PRD](./ONCOLOGY_SUITE_PRD.md)
- [RT Suite PRD](./RT_SUITE_PRD.md)
- [Neurology Suite PRD](./NEUROLOGY_SUITE_PRD.md)
- [Cardiology Suite PRD](./CARDIOLOGY_SUITE_PRD.md)
