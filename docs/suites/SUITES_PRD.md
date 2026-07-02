# MedAI Suites - Main PRD

## Executive Summary

**Suites** transform MedAI from a generic AI imaging platform into domain-specific clinical/research solutions. Each suite bundles models, layouts, analytics, and exports tailored to specific clinical verticals.

| Suite | Target Users | Primary Use Cases |
|-------|--------------|-------------------|
| **Chest X-Ray** | Radiologists, ER Physicians | MedGemma detection, bounding boxes, structured reports |
| **Oncology** | Radiologists, Oncologists | Tumor volumetrics, lesion tracking, trial endpoints |
| **Radiation Therapy** | Rad Oncs, Dosimetrists | OAR contouring, RTSTRUCT import/export |
| **Neurology** | Neuroradiologists, Neurologists | Multi-sequence viewing, MS/Dementia/Stroke workflows, ICV normalization |
| **Cardiology** | Cardiac Imagers | LV/RV volumes, EF calculation |
| **Surgical** | Surgeons | 3D models, FLR, mesh export |

---

## 1. Vision & Goals

### 1.1 Why Suites?

**Without Suites**: MedAI = "A powerful general-purpose imaging AI workbench" - forces users to figure out which models, metrics, and exports they need.

**With Suites**: MedAI = "Ready-made, domain-specific AI solutions" - users select their specialty and get an optimized workflow.

### 1.2 Phase 1 Goals
1. Implement core **SuiteConfig** system
2. Build **Suite Selector UI** with auto-detection
3. Deliver **Oncology Suite** and **RT Suite** with RTSTRUCT support

### 1.3 Future Phases
- Phase 2: ✅ Neurology Suite (Implemented) + Surgical Planning Suite
- Phase 3: Cardiology Suite with 4D cine support
- Phase 4: Agentic orchestration with LLM-based routing

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (React)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  TopBar: [Logo] [Nav]                    [SuiteSelector ▼] [Theme] [Settings]│
│  Toolbar: [Tools filtered by active suite]                                   │
│  ┌──────────┬────────────────────────────┬──────────────────────────────────┐│
│  │LeftPanel │     ViewportArea           │         RightPanel               ││
│  │(Studies) │ (Layout from suite config) │ [Auto-Seg|SmartEdit|SuiteMetrics]││
│  │          │                            │ [Suite-specific panels]          ││
│  └──────────┴────────────────────────────┴──────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend (FastAPI + MONAI Label)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Suite Layer: [SuiteRegistry] [ModelResolver] [TG-263 Naming]               │
│  Endpoints:   [/suites/*] [/infer/*] [/analytics/*] [/rtstruct/*]           │
│  Models:      [BiomedParse] [TotalSegmentator] [nnInteractive] [SAM3]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 SuiteConfig Schema

Every suite is defined by a `SuiteConfig` that specifies its behavior:

```typescript
export interface SuiteConfig {
  id: SuiteId;
  name: string;
  description: string;
  icon: string;

  // Layout & Tools
  defaultLayout: 'fourUp' | 'threePlusOne' | 'big3D' | 'singleView';
  wlPresets: string[];
  enabledTools: string[];

  // MONAI Label Integration
  monaiTasks: string[];
  preferredModels: string[];

  // Analytics & Export
  metricsPanelId: string;
  enabledMetrics: string[];
  allowedExports: ExportFormat[];

  // RightPanel Configuration
  tabs: SuiteTabConfig[];
  panels: SuitePanelConfig[];

  // Auto-detection from DICOM metadata
  detectionHints: {
    modalities: string[];
    bodyParts: string[];
    descriptionKeywords: string[];
    protocolKeywords: string[];
  };
}
```

### 2.3 Suite Selection Flow

```
Study Load → useSuiteAutoDetection → inferSuiteFromStudy → suiteStore
                                                              │
                                    if mode === 'auto' ───────┤
                                                              ▼
                                                  UI Components Update
                                                              │
                              ┌────────────────┬──────────────┴──────────────┐
                              ▼                ▼                              ▼
                       SuiteSelector     RightPanel                      Toolbar
                       (shows suite)   (renders panels)              (filters tools)
```

---

## 3. Common Components

### 3.1 Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SuiteSelector` | `/apps/viewer/src/components/SuiteSelector.tsx` | Dropdown to select/override suite |
| `suiteStore` | `/packages/core/src/stores/suiteStore.ts` | Zustand store for suite state |
| `inferSuiteFromStudy` | `/packages/core/src/suites/inferSuiteFromStudy.ts` | Auto-detect suite from DICOM |
| `useSuiteAutoDetection` | `/apps/viewer/src/hooks/useSuiteAutoDetection.ts` | Hook to run detection on study load |
| `useSuiteEffects` | `/apps/viewer/src/hooks/useSuiteEffects.ts` | Apply suite config (W/L, tools) |

### 3.2 Backend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SuiteRegistry` | `/apps/radiology/lib/suites/registry.py` | Load suite configs from YAML |
| `ModelResolver` | `/apps/radiology/lib/suites/model_resolver.py` | Map suite tasks to models |
| `/suites/*` endpoints | `/monailabel/endpoints/suites.py` | Suite API |

### 3.3 Suite Auto-Detection Algorithm

Scoring system for auto-detection:

| Criterion | Weight | Example |
|-----------|--------|---------|
| Modality match | +3 | CT, MR, RTSTRUCT |
| Body part match | +2 | LIVER, BRAIN, CHEST |
| Description keyword | +4 | "tumor", "rt planning" |
| Protocol keyword | +2 | "staging", "simulation" |

**Special cases**:
- `CR`, `DX` (X-ray) modalities with CHEST body part → Chest X-Ray Suite
- `RTPLAN`, `RTDOSE`, `RTSTRUCT` modalities → RT Suite (confidence 1.0)
- PT (PET) modality → Oncology Suite

---

## 4. Suite Registry

### 4.1 Available Suites

| Suite ID | Status | Details |
|----------|--------|---------|
| `chestxray` | ✅ Implemented | [Chest X-Ray Suite PRD](./CHEST_XRAY_SUITE_PRD.md) |
| `oncology` | ✅ Implemented | [Oncology Suite PRD](./ONCOLOGY_SUITE_PRD.md) |
| `rt` | ✅ Implemented | [RT Suite PRD](./RT_SUITE_PRD.md) |
| `neurology` | ✅ Implemented | [Neurology Suite PRD](./NEUROLOGY_SUITE_PRD.md) |
| `cardiology` | Phase 3 | [Cardiology Suite PRD](./CARDIOLOGY_SUITE_PRD.md) |
| `surgical` | Phase 2 | [Surgical Suite PRD](./SURGICAL_SUITE_PRD.md) |

### 4.2 Backend Suite Configs

Suite configurations stored as YAML in `/MedAI-server/apps/radiology/configs/suites/`:

```
configs/suites/
├── chestxray.yaml      # MedGemma detection
├── oncology.yaml
├── radiotherapy.yaml
├── neurology.yaml      # Phase 2
├── cardiology.yaml     # Phase 3
└── surgical.yaml       # Phase 2
```

---

## 5. API Endpoints

### 5.1 Suite Endpoints (`/suites/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/suites/` | GET | List all available suites |
| `/suites/{suite_id}` | GET | Get suite details with tasks |
| `/suites/{suite_id}/infer/{task_id}` | POST | Run suite-specific inference |

### 5.2 Analytics Endpoints (Extended)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics/volumetrics` | POST | Standard volumetrics |
| `/analytics/lesion_analysis` | POST | Oncology lesion metrics |
| `/analytics/suite/{suite_id}/{task_id}/volumetrics` | POST | Suite-aware volumetrics |

### 5.3 RTSTRUCT Endpoints (`/rtstruct/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rtstruct/series/{study_uid}` | GET | List RTSTRUCT series |
| `/rtstruct/import` | POST | Import RTSTRUCT to labelmaps |
| `/rtstruct/export` | POST | Export labelmaps to RTSTRUCT |

---

## 6. Implementation Phases

### Phase 1: Core Framework + Oncology + RT (6 weeks)

| Week | Deliverables |
|------|--------------|
| 1-2 | SuiteConfig types, suiteStore, auto-detection, SuiteSelector UI |
| 2-3 | Oncology Suite panels, lesion analysis backend |
| 3-5 | RT Suite panels, RTSTRUCT import/export |
| 5-6 | Integration testing, bug fixes |

### Phase 2: Neurology + Surgical (4 weeks)

| Week | Deliverables |
|------|--------------|
| 1-2 | ✅ Neurology Suite: multi-sequence workflow, MS/Dementia/Stroke modes, ICV normalization, asymmetry indices, QC |
| 2-4 | Surgical Suite: big3D layout, mesh export, FLR |

### Phase 3: Cardiology (4 weeks)

| Week | Deliverables |
|------|--------------|
| 1-2 | 4D cine time slider, frame handling |
| 2-4 | LV segmentation, EDV/ESV/EF metrics |

---

## 7. Testing Strategy

### Unit Tests
- Suite type validation
- Auto-detection with various DICOM metadata
- Model resolution logic

### Integration Tests
- Suite selection on study load
- Model resolution for each suite task
- API endpoint responses

### E2E Tests (Playwright)
- Load CT → auto-detect Oncology
- Load RTSTRUCT → auto-detect RT
- Manual suite switch → UI updates
- Full workflow for each suite

---

## 8. Related Documents

- [Chest X-Ray Suite PRD](./CHEST_XRAY_SUITE_PRD.md)
- [Oncology Suite PRD](./ONCOLOGY_SUITE_PRD.md)
- [RT Suite PRD](./RT_SUITE_PRD.md)
- [Neurology Suite PRD](./NEUROLOGY_SUITE_PRD.md)
- [Cardiology Suite PRD](./CARDIOLOGY_SUITE_PRD.md)
- [Surgical Suite PRD](./SURGICAL_SUITE_PRD.md)
