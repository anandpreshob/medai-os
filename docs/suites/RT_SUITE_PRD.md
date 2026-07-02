# Radiation Therapy (RT) Suite PRD

## Overview

The **RT Suite** provides AI-assisted structure contouring and RTSTRUCT import/export for radiation oncologists, dosimetrists, and RT planning teams.

**Status**: Phase 1 (Active Development)

---

## 1. Target Users

| Persona | Needs |
|---------|-------|
| **Radiation Oncologist** | Fast GTV/CTV/PTV delineation, structure review |
| **Dosimetrist** | OAR auto-contouring, RTSTRUCT to TPS |
| **Medical Physicist** | Contour QA, structure consistency |
| **Clinical Researcher** | Standardized contouring for trials |

---

## 2. Use Cases

### 2.1 Auto-Contouring OARs
1. Load CT simulation scan
2. Run "RT Auto-Seg" for body region (H&N, thorax, etc.)
3. Review auto-contoured OARs
4. Refine with SmartEdit/brush tools
5. Export RTSTRUCT to TPS

### 2.2 Import & Edit Existing RTSTRUCT
1. Load CT with existing RTSTRUCT from TPS
2. Import RTSTRUCT as editable segments
3. Refine contours using AI tools
4. Export updated RTSTRUCT back to TPS

### 2.3 Target Volume Delineation
1. Load CT with diagnostic imaging
2. Manually/interactively contour GTV
3. Expand to CTV/PTV (future: auto-expansion)
4. Export with OARs as complete structure set

---

## 3. Suite Configuration

```typescript
export const RT_SUITE: SuiteConfig = {
  id: 'rt',
  name: 'Radiation Therapy',
  description: 'RT structure contouring and RTSTRUCT export',
  icon: 'Radiation',

  defaultLayout: 'threePlusOne',  // 3 MPR + smaller 3D

  wlPresets: [
    'ct-soft-tissue',  // W:400 C:40
    'ct-lung',         // W:1500 C:-600
    'ct-bone',         // W:2000 C:300
    'ct-brain',        // W:80 C:40
  ],

  enabledTools: [
    'WindowLevel', 'Zoom', 'Pan', 'Crosshairs',
    'Brush', 'Eraser', 'Lasso', 'RectFill', 'RectOutline',
    'Contour', 'Interpolation'
  ],

  monaiTasks: ['organ_at_risk', 'gtv_ctv'],
  preferredModels: ['TotalSegmentator', 'nnInteractive'],

  metricsPanelId: 'rt-structures',
  enabledMetrics: ['volume', 'structure_volumes'],

  allowedExports: ['rtstruct', 'nifti', 'mesh', 'csv'],

  tabs: [
    { id: 'auto-segmentation', label: 'Auto-Seg', component: 'AutoSegmentationTab' },
    { id: 'smart-edit', label: 'SmartEdit', component: 'SmartEditTab' },
    { id: 'rt-structures', label: 'RT Struct', component: 'RTStructuresTab' },
  ],

  panels: [
    { id: 'segments', component: 'SegmentsPanel', order: 1 },
    { id: 'rt-structures', component: 'RTStructuresPanel', order: 2 },
  ],

  detectionHints: {
    modalities: ['CT', 'RTPLAN', 'RTDOSE', 'RTSTRUCT'],
    bodyParts: ['HEAD', 'BRAIN', 'CHEST', 'PELVIS', 'ABDOMEN'],
    descriptionKeywords: ['rt', 'radiation', 'planning', 'therapy', 'contour', 'oar'],
    protocolKeywords: ['treatment', 'plan', 'simulation', 'rt sim'],
  },
};
```

---

## 4. Backend Task Configuration

### 4.1 radiotherapy.yaml

```yaml
suite_id: radiotherapy
suite_type: radiotherapy
display_name: "Radiotherapy Planning Suite"
version: "1.0.0"

tasks:
  gtv:
    task_id: gtv
    display_name: "GTV (Gross Tumor Volume)"
    description: "Define gross tumor volume - typically manual or AI-assisted"
    primary_model: smartedit
    model_params:
      nninter: "sam3"
    default_label_name: "GTV"
    label_color: "#FF0000"
    body_regions: ["any"]

  ctv:
    task_id: ctv
    display_name: "CTV (Clinical Target Volume)"
    description: "Clinical target volume - derived from GTV"
    primary_model: smartedit
    default_label_name: "CTV"
    label_color: "#FF6600"
    body_regions: ["any"]

  ptv:
    task_id: ptv
    display_name: "PTV (Planning Target Volume)"
    description: "Planning target volume - derived from CTV"
    primary_model: smartedit
    default_label_name: "PTV"
    label_color: "#FFCC00"
    body_regions: ["any"]

  oar_head_neck:
    task_id: oar_head_neck
    display_name: "Head & Neck OARs"
    description: "Auto-segment head/neck organs at risk"
    primary_model: totalsegmentator
    model_params:
      modality: "ct"
      roi_subset:
        - brain
        - spinal_cord
        - esophagus
        - trachea
        - thyroid_gland
    default_label_name: "OAR"
    body_regions: ["head", "neck"]

  oar_thorax:
    task_id: oar_thorax
    display_name: "Thoracic OARs"
    description: "Auto-segment thoracic organs at risk"
    primary_model: totalsegmentator
    model_params:
      roi_subset:
        - lung_upper_lobe_left
        - lung_lower_lobe_left
        - lung_upper_lobe_right
        - lung_middle_lobe_right
        - lung_lower_lobe_right
        - heart_myocardium
        - heart_atrium_left
        - heart_ventricle_left
        - esophagus
        - spinal_cord
        - aorta
    default_label_name: "OAR"
    body_regions: ["chest", "thorax"]

  oar_abdomen:
    task_id: oar_abdomen
    display_name: "Abdominal OARs"
    description: "Auto-segment abdominal organs at risk"
    primary_model: totalsegmentator
    model_params:
      roi_subset:
        - liver
        - spleen
        - kidney_left
        - kidney_right
        - stomach
        - small_bowel
        - colon
        - pancreas
        - spinal_cord
    default_label_name: "OAR"
    body_regions: ["abdomen"]

  oar_pelvis:
    task_id: oar_pelvis
    display_name: "Pelvic OARs"
    description: "Auto-segment pelvic organs at risk"
    primary_model: totalsegmentator
    model_params:
      roi_subset:
        - urinary_bladder
        - prostate
        - femur_left
        - femur_right
        - hip_left
        - hip_right
        - colon
        - small_bowel
    default_label_name: "OAR"
    body_regions: ["pelvis"]

structure_naming:
  convention: "TG-263"
  mappings:
    brain: "Brain"
    spinal_cord: "SpinalCord"
    esophagus: "Esophagus"
    heart_myocardium: "Heart"
    liver: "Liver"
    kidney_left: "Kidney_L"
    kidney_right: "Kidney_R"
    lung_upper_lobe_left: "Lung_L"
    lung_upper_lobe_right: "Lung_R"
    femur_left: "Femur_L"
    femur_right: "Femur_R"
    urinary_bladder: "Bladder"

default_analytics:
  - volumetrics
  - structure_volumes
```

---

## 5. RTSTRUCT Implementation

### 5.1 Architecture: Backend-Heavy Hybrid

| Component | Location | Technology |
|-----------|----------|------------|
| RTSTRUCT parsing | Backend | pydicom, rt-utils |
| Contour → Labelmap | Backend | NumPy, skimage.draw |
| Labelmap → Contour | Backend | skimage.measure, shapely |
| UID generation | Backend | pydicom.uid |
| Contour rendering | Frontend | Cornerstone3D |
| User interaction | Frontend | Existing tools |

### 5.2 Import Flow

```
PACS (Orthanc)
     │
     │ WADO-RS fetch RTSTRUCT
     ▼
Backend: rtstruct_parser.py
     │
     │ 1. Parse ROI sequences
     │ 2. Extract contour points (LPS)
     │ 3. Match to CT slices by z-position
     │ 4. Fill polygons per slice
     │ 5. Create 3D binary masks
     │
     ▼
Backend → Frontend: JSON + NIfTI
     │
     │ Per-ROI:
     │   - roi_name, roi_type, color
     │   - labelmap file path
     │
     ▼
Frontend: Load as segments
     │
     │ Create multi-layer segmentation
     │ Display in RT Structures panel
```

### 5.3 Export Flow

```
Frontend: Segments + metadata
     │
     │ - Segment names, colors
     │ - CT SeriesInstanceUID
     │ - TG-263 name mapping
     │
     ▼
Backend: labelmap_to_contour.py
     │
     │ 1. Load labelmap volumes
     │ 2. Extract contours (marching squares)
     │ 3. Transform IJK → LPS
     │ 4. Simplify contours (shapely)
     │
     ▼
Backend: rtstruct_builder.py
     │
     │ 1. Generate DICOM UIDs
     │ 2. Build StructureSetROISequence
     │ 3. Build ROIContourSequence
     │ 4. Build RTROIObservationsSequence
     │ 5. Link to CT SOPInstanceUIDs
     │
     ▼
Backend → PACS: STOW-RS
     │
     │ Upload RTSTRUCT DICOM
```

### 5.4 Backend Files

```
MedAI-server/monailabel/utils/rt/
├── __init__.py
├── rtstruct_parser.py      # Parse RTSTRUCT → ROI data
├── contour_to_labelmap.py  # Polygon fill algorithm
├── labelmap_to_contour.py  # Marching squares extraction
├── rtstruct_builder.py     # Build DICOM RTSTRUCT
├── tg263_mapping.py        # TG-263 naming conventions
└── uid_generator.py        # DICOM UID generation
```

### 5.5 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /rtstruct/series/{study_uid}` | GET | List RTSTRUCT series in study |
| `POST /rtstruct/import` | POST | Import RTSTRUCT, return labelmaps |
| `POST /rtstruct/export` | POST | Export labelmaps to RTSTRUCT |

**Import Request**:
```json
{
  "rtstruct_instance_uid": "1.2.3.4.5",
  "ct_series_uid": "1.2.3.4.6"
}
```

**Import Response**:
```json
{
  "structures": [
    {
      "roi_number": 1,
      "roi_name": "GTV",
      "roi_type": "GTV",
      "color": "#FF0000",
      "labelmap_path": "/tmp/rtstruct_import_123/GTV.nii.gz",
      "volume_cm3": 45.2
    },
    ...
  ]
}
```

**Export Request**:
```json
{
  "segments": [
    {
      "segment_id": "seg_1",
      "name": "GTV",
      "tg263_name": "GTV",
      "roi_type": "GTV",
      "color": "#FF0000"
    },
    ...
  ],
  "ct_series_uid": "1.2.3.4.6",
  "send_to_pacs": true,
  "pacs_url": "http://orthanc:8042"
}
```

---

## 6. TG-263 Naming Convention

### 6.1 Standard Structure Names

```python
TG263_STRUCTURES = {
    # Target Volumes
    "GTV": ["GTV", "GTV_p", "GTV_n", "GTV_pln"],
    "CTV": ["CTV", "CTV_p", "CTV_n", "CTV_pln"],
    "PTV": ["PTV", "PTV_p", "PTV_n", "PTV_pln"],
    "ITV": ["ITV"],

    # Central Nervous System
    "Brain": ["Brain", "Brain_PRV"],
    "BrainStem": ["Brainstem", "Brainstem_PRV"],
    "SpinalCord": ["SpinalCord", "SpinalCord_PRV"],
    "OpticChiasm": ["OpticChiasm", "OpticChiasm_PRV"],
    "OpticNrv_L": ["OpticNrv_L"],
    "OpticNrv_R": ["OpticNrv_R"],

    # Thorax
    "Lung_L": ["Lung_L"],
    "Lung_R": ["Lung_R"],
    "Lungs": ["Lungs"],
    "Heart": ["Heart"],
    "Esophagus": ["Esophagus"],
    "Trachea": ["Trachea"],

    # Abdomen
    "Liver": ["Liver"],
    "Spleen": ["Spleen"],
    "Kidney_L": ["Kidney_L"],
    "Kidney_R": ["Kidney_R"],
    "Stomach": ["Stomach"],
    "SmallBowel": ["SmallBowel", "Bowel_Small"],
    "Colon": ["Colon", "LargeBowel"],

    # Pelvis
    "Bladder": ["Bladder"],
    "Rectum": ["Rectum"],
    "Prostate": ["Prostate"],
    "Femur_L": ["Femur_L", "FemoralHead_L"],
    "Femur_R": ["Femur_R", "FemoralHead_R"],
}
```

### 6.2 Validation

- On export, validate structure names against TG-263 list
- Warn user if non-standard names detected
- Offer auto-mapping suggestions

---

## 7. UI Components

### 7.1 RTStructuresPanel

**Location**: `/apps/viewer/src/components/right-panel/panels/RTStructuresPanel.tsx`

**Features**:
- **Structure List**: Grouped by type (Targets, OARs)
- **Visibility Toggles**: Show/hide individual structures
- **Color Indicators**: RT-standard colors
- **Lock Toggle**: Prevent accidental edits
- **Import Button**: Load RTSTRUCT from PACS
- **Export Button**: Save to RTSTRUCT

**UI Mockup**:
```
┌─────────────────────────────────────┐
│ RT Structures              [Import] │
├─────────────────────────────────────┤
│ ▼ Target Volumes                    │
│   ┌─────────────────────────────┐   │
│   │ ● GTV            👁 🔒      │   │
│   │ ● CTV            👁 🔓      │   │
│   │ ● PTV            👁 🔓      │   │
│   └─────────────────────────────┘   │
│                                     │
│ ▼ Organs at Risk                    │
│   ┌─────────────────────────────┐   │
│   │ ● Brain          👁 🔓      │   │
│   │ ● Brainstem      👁 🔓      │   │
│   │ ● SpinalCord     👁 🔓      │   │
│   │ ● Lung_L         👁 🔓      │   │
│   │ ● Lung_R         👁 🔓      │   │
│   │ ● Heart          👁 🔓      │   │
│   └─────────────────────────────┘   │
│                                     │
│ [Export RTSTRUCT]                   │
└─────────────────────────────────────┘
```

### 7.2 RT Structure Colors

| Structure Type | Default Color |
|----------------|---------------|
| GTV | Red (#FF0000) |
| CTV | Orange (#FF6600) |
| PTV | Yellow (#FFCC00) |
| Brain | Pink (#FF69B4) |
| Brainstem | Purple (#9370DB) |
| SpinalCord | Blue (#4169E1) |
| Lungs | Cyan (#00CED1) |
| Heart | Magenta (#FF00FF) |
| Liver | Brown (#8B4513) |
| Kidneys | Green (#228B22) |
| Bladder | Gold (#FFD700) |
| Rectum | Coral (#FF7F50) |

---

## 8. Auto-Detection Rules

The RT Suite is auto-detected when:

1. **Modality** is RTPLAN, RTDOSE, or RTSTRUCT → Confidence 1.0
2. **Modality** is CT AND:
   - Description contains: rt, radiation, planning, therapy, contour, oar
   - Protocol contains: treatment, plan, simulation, rt sim

---

## 9. Coordinate Transformations

### 9.1 LPS to IJK (Import)

```python
def lps_to_ijk(lps_point: np.ndarray, ct_info: CTSeriesInfo) -> np.ndarray:
    """Transform DICOM LPS coordinates to image IJK indices."""
    # 1. Subtract origin
    offset = lps_point - ct_info.origin

    # 2. Apply inverse direction matrix
    inv_direction = np.linalg.inv(ct_info.direction.reshape(3, 3))
    rotated = inv_direction @ offset

    # 3. Divide by spacing
    ijk = rotated / np.array(ct_info.spacing)

    return np.round(ijk).astype(int)
```

### 9.2 IJK to LPS (Export)

```python
def ijk_to_lps(ijk_point: np.ndarray, ct_info: CTSeriesInfo) -> np.ndarray:
    """Transform image IJK indices to DICOM LPS coordinates."""
    # 1. Multiply by spacing
    scaled = ijk_point * np.array(ct_info.spacing)

    # 2. Apply direction matrix
    direction = ct_info.direction.reshape(3, 3)
    rotated = direction @ scaled

    # 3. Add origin
    lps = rotated + ct_info.origin

    return lps
```

---

## 10. Implementation Checklist

### Phase 1C (Core RTSTRUCT)
- [ ] Create RTStructuresPanel component
- [ ] Implement rtstruct_parser.py
- [ ] Implement contour_to_labelmap.py
- [ ] Implement labelmap_to_contour.py
- [ ] Implement rtstruct_builder.py
- [ ] Create /rtstruct/* API endpoints
- [ ] Create RTStructService.ts (frontend)
- [ ] Create RTStructExportService.ts
- [ ] Implement TG-263 validation
- [ ] Test import from Orthanc
- [ ] Test export to Orthanc
- [ ] Test round-trip (import → edit → export)

### Phase 1D (Enhancements)
- [ ] Add contour QA metrics (Dice vs reference)
- [ ] Add structure set comparison
- [ ] Add margin expansion tools
- [ ] Add interpolation between slices

---

## 11. Dependencies

### Backend
```
# Add to requirements.txt
rt-utils>=1.2.7
```

### Frontend
```json
// Add to package.json
"@cornerstonejs/adapters": "^1.86.0"
```

---

## 12. Testing

### Unit Tests
- Coordinate transformation accuracy
- Polygon fill correctness
- Contour extraction from known shapes
- TG-263 name validation

### Integration Tests
- Full import workflow from Orthanc
- Full export workflow to Orthanc
- Round-trip consistency

### E2E Tests
- Load CT with RTSTRUCT → auto-detect RT Suite
- Import RTSTRUCT → view structures → edit → export
- Create new structures → apply TG-263 names → export
