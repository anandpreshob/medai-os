# Longitudinal Sessioning Implementation Plan

## Implementation Status: ✅ COMPLETE

All 5 parallel work streams have been implemented:

| Stream | Focus Area | Status |
|--------|------------|--------|
| **A** | Data Model & Stores | ✅ Complete |
| **B** | Viewer Layout & Sync | ✅ Complete |
| **C** | Study Browser Integration | ✅ Complete |
| **D** | Backend Longitudinal Agents | ✅ Complete |
| **E** | Suite & Reporting Integration | ✅ Complete |

---

## Overview

Implement **Longitudinal Sessioning** to enable radiologists to compare multiple studies for the same patient across timepoints, view them side-by-side with synchronized navigation, run per-timepoint analytics, and generate longitudinal reports.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (medai-viewer)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │longitudinalStore│  │  analyticsStore │  │     ViewerStore         │  │
│  │  (NEW)          │  │  (MODIFY)       │  │  (existing, reference)  │  │
│  │ - sessions      │  │ - metricsByImage│  │  - images Map           │  │
│  │ - timepoints    │  │ - per-image CRUD│  │  - activeImageId        │  │
│  │ - activeSession │  └─────────────────┘  └─────────────────────────┘  │
│  └─────────────────┘                                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                      UI Components (NEW)                            ││
│  │  LongitudinalViewport │ SyncToggle │ TimePointPanel │ MetricsPanel ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                   Study Browser Integration                         ││
│  │  "Start Longitudinal Session" │ "Add Timepoint" │ Patient Studies  ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (MedAI-server)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │              Longitudinal Report Agents (NEW)                       ││
│  │  BaseLongitudinalAgent │ ChestLongitudinal │ BreastLongitudinal    ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │              Report Endpoint (MODIFY)                               ││
│  │  Extended payload with session.timepoints + delta calculations     ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Parallel Work Streams

This feature can be developed by **5 parallel Claude Code sessions**:

| Stream | Focus Area | Agent Recommendation |
|--------|------------|---------------------|
| **A** | Data Model & Stores | General Claude Code |
| **B** | Viewer Layout & Sync | General Claude Code |
| **C** | Study Browser Integration | General Claude Code |
| **D** | Backend Longitudinal Agents | `monai-label-backend` subagent |
| **E** | Suite & Reporting Integration | General Claude Code |

---

## IMPORTANT: Files Already Created (Stream A - In Progress)

The following files have been created and should be READ before implementing other streams:

### NEW FILES:
- `/medai-viewer/packages/core/src/stores/longitudinalTypes.ts` - Core types
- `/medai-viewer/packages/core/src/stores/longitudinalStore.ts` - Zustand store

### Key Exports to Use:
```typescript
// From longitudinalStore.ts
import {
  useLongitudinalStore,
  useActiveSession,
  useActiveTimepoints,
  useIsLongitudinalActive
} from '@medai/core';

// From longitudinalTypes.ts
import {
  LongitudinalSession,
  LongitudinalTimepoint,
  LongitudinalSyncSettings,
  LongitudinalLayoutMode,
  LongitudinalDelta,
  LongitudinalSegmentDelta,
  ProgressionClassification,
  DEFAULT_SYNC_SETTINGS,
} from '@medai/core';
```

---

## Stream A: Data Model & Stores

**Owner:** Claude Code Session 1
**Status:** COMPLETE

### Tasks

#### A1. Create Longitudinal Types ✅ DONE
**File:** `/medai-viewer/packages/core/src/stores/longitudinalTypes.ts` (NEW)

```typescript
// Core types implemented:
export interface LongitudinalTimepoint {
  id: string;
  label: string;  // "Baseline", "6-month FU", etc.
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  imageId: string;  // References viewerStore.images
  acquisitionDateTime: string;
  order: number;
  notes?: string;
}

export interface LongitudinalSession {
  id: string;
  patientId: string;
  patientName?: string;
  modality: string;
  anatomy: string;
  description?: string;
  timepoints: LongitudinalTimepoint[];
  createdAt: number;
  updatedAt: number;
}
```

#### A2. Create Longitudinal Store ✅ DONE
**File:** `/medai-viewer/packages/core/src/stores/longitudinalStore.ts` (NEW)

- Zustand store with persist middleware
- State: `sessions: Record<string, LongitudinalSession>`, `activeSessionId`, `activeTimepointIds`
- Actions: `createSession`, `addTimepoint`, `removeTimepoint`, `setActiveSession`, `setActiveTimepoints`
- Hooks: `useActiveSession()`, `useActiveTimepoints()`, `useIsLongitudinalActive()`

#### A3. Add IndexedDB Persistence ✅ DONE
**File:** `/medai-viewer/packages/core/src/services/PersistenceService.ts` (MODIFY)

- Add `LONGITUDINAL_SESSIONS: 'longitudinal_sessions'` to STORES
- Increment `DB_VERSION` to 2
- Add schema in `onupgradeneeded`: keyPath `id`, index `patientId`
- Implement: `saveLongitudinalSession`, `loadAllLongitudinalSessions`, `deleteLongitudinalSession`, `getLongitudinalSessionsByPatient`

#### A4. Enhance Analytics Store for Per-Image Metrics ✅ DONE
**File:** `/medai-viewer/packages/core/src/stores/analyticsStore.ts` (MODIFY)

- Add: `metricsByImageId: Map<string, { volumetrics, radiomics, computedAt }>`
- Add actions: `setMetricsForImage(imageId, ...)`, `getMetricsForImage(imageId)`, `clearMetricsForImage(imageId)`

#### A5. Create Longitudinal Metrics Helper ✅ DONE
**File:** `/medai-viewer/packages/core/src/utils/longitudinalMetrics.ts` (NEW)

```typescript
export function getLongitudinalMetrics(sessionId: string, segmentKey?: string): LongitudinalMetricsResult | null;
export function computeVolumeChange(baseline: number, current: number): { absolute: number; percent: number };
export function classifyProgression(changePercent: number): 'progressive' | 'stable' | 'regressive';
```

#### A6. Update Exports ✅ DONE
**File:** `/medai-viewer/packages/core/src/index.ts` (MODIFY)

- Export new types and store

---

## Stream B: Viewer Layout & Synchronization

**Owner:** Claude Code Session 2
**Status:** COMPLETE

### Dependencies
- **MUST READ FIRST:**
  - `/medai-viewer/packages/core/src/stores/longitudinalStore.ts`
  - `/medai-viewer/packages/core/src/stores/longitudinalTypes.ts`

### Tasks

#### B1. Extend Layout Preset Types
**File:** `/medai-viewer/packages/core/src/suites/types.ts` (MODIFY)

```typescript
export type LayoutPreset =
  | 'fourUp' | 'threePlusOne' | 'big3D' | 'singleView' | 'comparison'
  | 'longitudinal-2'   // NEW
  | 'longitudinal-3';  // NEW
```

#### B2. Create Viewport Synchronization Utilities
**File:** `/medai-viewer/apps/viewer/src/lib/viewportSynchronization.ts` (NEW)

- Use Cornerstone3D `SynchronizerManager` APIs
- Implement: `createCameraSynchronizer`, `createVOISynchronizer`, `createPositionSynchronizer`
- Master function: `setupLongitudinalSynchronizers(viewportIdGroups, config)`

#### B3. Create LongitudinalViewport Component (3D)
**File:** `/medai-viewer/apps/viewer/src/components/LongitudinalViewport.tsx` (NEW)

- Render 2 MPR stacks side-by-side (baseline left, current right)
- Each timepoint gets unique viewportIds: `axial-baseline`, `axial-current`, etc.
- Each timepoint loads its own volumeId
- Integrate synchronizers for linked navigation
- Use `useActiveTimepoints()` hook to get timepoint data

#### B4. Create LongitudinalViewport2D Component
**File:** `/medai-viewer/apps/viewer/src/components/LongitudinalViewport2D.tsx` (NEW)

- Simpler 2D version for X-ray comparison
- Two single viewports side-by-side
- Pan/zoom sync only (no slice index)
- Use `useLongitudinalStore` for sync settings

#### B5. Create SyncToggle Component
**File:** `/medai-viewer/apps/viewer/src/components/SyncToggle.tsx` (NEW)

- Toggle button for sync on/off
- Options: sync pan, zoom, window/level, slice index
- Uses `useLongitudinalStore().syncSettings` and `setSyncSettings()`
- Persists preference to store

#### B6. Update ViewportArea for Layout Routing
**File:** `/medai-viewer/apps/viewer/src/components/ViewportArea.tsx` (MODIFY)

```typescript
// Add routing logic:
import { useLongitudinalStore, useActiveTimepoints, useIsLongitudinalActive } from '@medai/core';

// Inside component:
const { layoutMode } = useLongitudinalStore();
const isLongitudinalActive = useIsLongitudinalActive();
const timepoints = useActiveTimepoints();

if (isLongitudinalActive && (layoutMode === 'longitudinal-2' || layoutMode === 'longitudinal-3')) {
  return is2D
    ? <LongitudinalViewport2D timepoints={timepoints} layout={layoutMode} />
    : <LongitudinalViewport timepoints={timepoints} layout={layoutMode} />;
}
```

#### B7. Add Layout Mode Switcher to Toolbar
**File:** `/medai-viewer/apps/viewer/src/components/Toolbar.tsx` (MODIFY)

- Add dropdown/buttons for layout mode selection
- When switching to longitudinal, prompt to select baseline/current images
- Use `useLongitudinalStore().setLayoutMode()`

---

## Stream C: Study Browser Integration

**Owner:** Claude Code Session 3
**Status:** COMPLETE

### Dependencies
- **MUST READ FIRST:**
  - `/medai-viewer/packages/core/src/stores/longitudinalStore.ts`
  - `/medai-viewer/packages/core/src/stores/longitudinalTypes.ts`

### Tasks

#### C1. Add "Start Longitudinal Session" Action
**File:** `/medai-viewer/apps/viewer/src/pages/StudyBrowserPage.tsx` (MODIFY)

- Add button/menu item: "Start Longitudinal Session"
- Visible when study has valid PatientID
- On click:
  ```typescript
  const sessionId = useLongitudinalStore.getState().createSession({
    patientId: study.patientId,
    patientName: study.patientName,
    modality: study.modality,
    anatomy: detectAnatomy(study),
  });
  // Add current study as first timepoint
  useLongitudinalStore.getState().addTimepoint(sessionId, {
    label: 'Baseline',
    imageId: loadedImageId,
    acquisitionDateTime: study.studyDate,
    studyInstanceUID: study.studyInstanceUID,
  });
  // Navigate to viewer
  navigate('/viewer');
  ```

#### C2. Create Patient Studies Panel
**File:** `/medai-viewer/apps/viewer/src/components/left-panel/PatientStudiesPanel.tsx` (NEW)

- Query PACS for all studies with same PatientID
- Filter by modality/anatomy
- Display as timeline or list
- Allow selection to "Add as Timepoint"
- Show which studies are already in the session

#### C3. Add "Add Timepoint" Action
**File:** `/medai-viewer/apps/viewer/src/components/left-panel/PatientStudiesPanel.tsx`

- Select prior study → load volume → add as timepoint
- Auto-label: "Baseline", "Follow-up 1", or use StudyDate
- Use `useLongitudinalStore().addTimepoint()`

#### C4. Create TimePointPanel Component
**File:** `/medai-viewer/apps/viewer/src/components/left-panel/TimePointPanel.tsx` (NEW)

- Show current session's timepoints
- Drag-and-drop reordering (use `reorderTimepoints()`)
- Click to activate timepoint (use `setActiveTimepoints()`)
- Delete timepoint option
- Display: label, date, thumbnail

#### C5. Update Left Panel to Include New Panels
**File:** `/medai-viewer/apps/viewer/src/components/LeftPanel.tsx` (MODIFY)

- Add `PatientStudiesPanel` and `TimePointPanel` when longitudinal session is active
- Use `useIsLongitudinalActive()` to conditionally render

---

## Stream D: Backend Longitudinal Report Agents

**Owner:** Claude Code Session 4
**Recommended Subagent:** `monai-label-backend`
**Status:** COMPLETE

### Dependencies
- Review frontend types in `/medai-viewer/packages/core/src/stores/longitudinalTypes.ts` for:
  - `LongitudinalDelta`
  - `LongitudinalSegmentDelta`
  - `ProgressionClassification`

### Tasks

#### D1. Create Base Longitudinal Agent ✅ DONE
**File:** `/MedAI-server/monailabel/agents/longitudinal_base_agent.py` (NEW)

```python
from .base_agent import BaseReportAgent

class BaseLongitudinalReportAgent(BaseReportAgent):
    """Base class for longitudinal report generation."""

    def format_longitudinal_metrics(self, delta: Dict) -> str:
        """Format delta calculations: % change, progression flags."""
        pass

    def format_timepoints(self, timepoints: List[Dict]) -> str:
        """Format timepoint info: label, date, detection/segmentation counts."""
        pass

    def build_longitudinal_prompt(
        self,
        findings: str,
        timepoints: List[Dict],
        delta: Dict,
        **kwargs
    ) -> str:
        """Build prompt with longitudinal context."""
        pass
```

#### D2. Create Chest Longitudinal Agent ✅ DONE
**File:** `/MedAI-server/monailabel/agents/chest_longitudinal_agent.py` (NEW)

- AGENT_TYPE = "chest_longitudinal"
- System prompt for comparative chest imaging
- Sections: Clinical History, Technique, Comparison, Baseline Findings, Current Findings, Interval Changes, Impression, Recommendations

#### D3. Create Breast Longitudinal Agent ✅ DONE
**File:** `/MedAI-server/monailabel/agents/breast_longitudinal_agent.py` (NEW)

- AGENT_TYPE = "breast_longitudinal"
- BI-RADS response assessment integration
- Focus on lesion volume change and treatment response

#### D4. Create Abdomen Longitudinal Agent ✅ DONE
**File:** `/MedAI-server/monailabel/agents/abdomen_longitudinal_agent.py` (NEW)

- AGENT_TYPE = "abdomen_longitudinal"
- Liver/kidney lesion tracking
- RECIST criteria integration

#### D5. Extend Report Endpoint ✅ DONE
**File:** `/MedAI-server/monailabel/endpoints/report.py` (MODIFY)

```python
class LongitudinalTimepoint(BaseModel):
    """Timepoint data for longitudinal reports."""
    id: str
    label: str
    studyDate: str
    imageBase64: str
    detections: Optional[List[Detection]] = None
    metrics: Optional[Dict[str, Any]] = None

class LongitudinalPayload(BaseModel):
    """Longitudinal session data."""
    sessionId: str
    timepoints: List[LongitudinalTimepoint]
    delta: Optional[Dict[str, Any]] = None

class ReportGenerationRequest(BaseModel):
    # ... existing fields ...
    longitudinal: Optional[LongitudinalPayload] = None  # NEW
```

- Auto-select longitudinal agent when `longitudinal` payload present

#### D6. Update Agent Registry ✅ DONE
**File:** `/MedAI-server/monailabel/agents/__init__.py` (MODIFY)

- Import and register new longitudinal agents
- Update `get_agent()` function to return longitudinal agents

---

## Stream E: Suite & Reporting Integration

**Owner:** Claude Code Session 5
**Status:** COMPLETE

### Dependencies
- **MUST READ FIRST:**
  - `/medai-viewer/packages/core/src/stores/longitudinalStore.ts`
  - `/medai-viewer/packages/core/src/stores/longitudinalTypes.ts`
  - `/medai-viewer/packages/core/src/suites/registry.ts`

### Tasks

#### E1. Add Longitudinal Config to Suite Types ✅ DONE
**File:** `/medai-viewer/packages/core/src/suites/types.ts` (MODIFY)

```typescript
export interface SuiteConfig {
  // ... existing fields
  supportsLongitudinal?: boolean;
  longitudinalConfig?: {
    minTimepoints: number;
    maxTimepoints: number;
    comparisonModes: ('side-by-side' | 'overlay' | 'slider')[];
    metricsToTrack: string[];
    responseAssessment?: 'RECIST' | 'BI-RADS' | 'RANO' | 'custom';
  };
}
```

#### E2. Update Suite Registry ✅ DONE
**File:** `/medai-viewer/packages/core/src/suites/registry.ts` (MODIFY)

- Add `supportsLongitudinal: true` to Chest X-ray, Oncology, Neurology suites
- Configure `longitudinalConfig` for each

#### E3. Modify ChestXrayDetectionTab for Per-Timepoint Display ✅ DONE
**File:** `/medai-viewer/apps/viewer/src/components/right-panel/tabs/ChestXrayDetectionTab.tsx` (MODIFY)

- Detect longitudinal session with `useIsLongitudinalActive()`
- Show timepoint label above detections
- Run AI detection separately per timepoint

#### E4. Create LongitudinalMetricsPanel ✅ DONE
**File:** `/medai-viewer/apps/viewer/src/components/right-panel/panels/LongitudinalMetricsPanel.tsx` (NEW)

- Display delta calculations (volume change %, progression)
- Call `getLongitudinalMetrics()` helper (from Stream A)
- Visual indicators: arrows, color-coded change
- Use `getProgressionColor()` and `getProgressionLabel()` from types

#### E5. Extend Report Payload ✅ DONE
**File:** `/medai-viewer/packages/core/src/services/ReportGenerationService.ts` (MODIFY)

```typescript
export interface LongitudinalReportPayload {
  sessionId: string;
  timepoints: Array<{
    id: string;
    label: string;
    studyDate: string;
    imageBase64: string;
    detections: ReportDetection[];
    metrics: { volumeCc: number; ... };
  }>;
  delta: {
    segments: LongitudinalSegmentDelta[];
    summary: { ... };
  };
}

export interface ReportGenerationRequest {
  // ... existing fields
  longitudinal?: LongitudinalReportPayload;
}
```

#### E6. Update ReportPage for Longitudinal Reports ✅ DONE
**File:** `/medai-viewer/apps/viewer/src/pages/ReportPage.tsx` (MODIFY)

- Detect longitudinal session
- Show "Generate Longitudinal Report" option
- Display timepoint preview before generation
- Bundle per-timepoint data into request

#### E7. Add Longitudinal Report Tab ✅ DONE
**File:** `/medai-viewer/apps/viewer/src/components/right-panel/tabs/LongitudinalReportTab.tsx` (NEW)

- Collect findings per timepoint
- Preview delta calculations
- Trigger longitudinal report generation

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Parallel Work:**
- Stream A: Tasks A1-A4 (Types, Store, Persistence, Analytics refactor)
- Stream D: Tasks D1-D2 (Base agent, Chest agent)

**Dependencies:** None

### Phase 2: Core UI (Week 2)
**Parallel Work:**
- Stream B: Tasks B1-B5 (Layout types, Sync utils, Viewport components)
- Stream C: Tasks C1-C3 (Study Browser integration)
- Stream D: Tasks D3-D4 (Breast/Abdomen agents)

**Dependencies:** Phase 1 stores must be complete

### Phase 3: Integration (Week 3)
**Parallel Work:**
- Stream A: Tasks A5-A6 (Metrics helper, Exports)
- Stream B: Tasks B6-B7 (ViewportArea routing, Toolbar)
- Stream C: Tasks C4-C5 (TimePoint panel, Left panel)
- Stream D: Tasks D5-D6 (Endpoint, Registry)
- Stream E: Tasks E1-E4 (Suite config, Detection tabs, Metrics panel)

**Dependencies:** Phase 2 UI components

### Phase 4: Reporting (Week 4)
**Parallel Work:**
- Stream E: Tasks E5-E7 (Report payload, ReportPage, Tab)

**Dependencies:** Backend agents ready (Stream D)

---

## Critical Files Reference

| File | Change Type | Stream | Status |
|------|-------------|--------|--------|
| `/packages/core/src/stores/longitudinalTypes.ts` | NEW | A | ✅ |
| `/packages/core/src/stores/longitudinalStore.ts` | NEW | A | ✅ |
| `/packages/core/src/services/PersistenceService.ts` | MODIFY | A | ✅ |
| `/packages/core/src/stores/analyticsStore.ts` | MODIFY | A | ✅ |
| `/packages/core/src/utils/longitudinalMetrics.ts` | NEW | A | ✅ |
| `/packages/core/src/suites/types.ts` | MODIFY | B, E | ✅ |
| `/apps/viewer/src/lib/viewportSynchronization.ts` | NEW | B | ✅ |
| `/apps/viewer/src/components/LongitudinalViewport.tsx` | NEW | B | ✅ |
| `/apps/viewer/src/components/LongitudinalViewport2D.tsx` | NEW | B | ✅ |
| `/apps/viewer/src/components/ViewportArea.tsx` | MODIFY | B | ✅ |
| `/apps/viewer/src/pages/StudyBrowserPage.tsx` | MODIFY | C | ✅ |
| `/apps/viewer/src/components/left-panel/PatientStudiesPanel.tsx` | NEW | C | ✅ |
| `/apps/viewer/src/components/left-panel/TimePointPanel.tsx` | NEW | C | ✅ |
| `/MedAI-server/monailabel/agents/longitudinal_base_agent.py` | NEW | D | ✅ |
| `/MedAI-server/monailabel/agents/chest_longitudinal_agent.py` | NEW | D | ✅ |
| `/MedAI-server/monailabel/agents/breast_longitudinal_agent.py` | NEW | D | ✅ |
| `/MedAI-server/monailabel/agents/abdomen_longitudinal_agent.py` | NEW | D | ✅ |
| `/MedAI-server/monailabel/endpoints/report.py` | MODIFY | D | ✅ |
| `/packages/core/src/suites/registry.ts` | MODIFY | E | ✅ |
| `/apps/viewer/src/components/right-panel/tabs/ChestXrayDetectionTab.tsx` | MODIFY | E | ✅ |
| `/packages/core/src/services/ReportGenerationService.ts` | MODIFY | E | ✅ |
| `/apps/viewer/src/pages/ReportPage.tsx` | MODIFY | E | ✅ |
| `/apps/viewer/src/components/right-panel/panels/LongitudinalMetricsPanel.tsx` | NEW | E | ✅ |
| `/apps/viewer/src/components/right-panel/tabs/LongitudinalReportTab.tsx` | NEW | E | ✅ |

---

## How to Use This Plan

### For Each Stream Owner:

1. **Read your stream's dependencies first** (files marked as NEW ✅ are already created)
2. **Check the task list** for your stream
3. **Implement tasks in order** (they have dependencies within the stream)
4. **Use the provided code snippets** as starting points

### Key Hooks and Functions (from Stream A):

```typescript
// Check if longitudinal mode is active
const isActive = useIsLongitudinalActive();

// Get the active session
const session = useActiveSession();

// Get active timepoints data
const timepoints = useActiveTimepoints();

// Full store access
const {
  createSession,
  addTimepoint,
  setActiveTimepoints,
  syncSettings,
  layoutMode,
  setLayoutMode
} = useLongitudinalStore();
```

---

## Verification Plan

### Unit Tests
- `longitudinalStore.test.ts`: CRUD operations, persistence restore
- `longitudinalMetrics.test.ts`: Delta calculations, progression classification

### Integration Tests
- Create session from study browser → viewer loads with session
- Add timepoint → both viewports render correctly
- Generate longitudinal report → correct payload sent to backend

### E2E Tests (use `medai-ui-automation`)
1. Load baseline study → Start longitudinal session
2. Add prior study as timepoint
3. Toggle sync → verify pan/zoom sync works
4. Generate longitudinal report → verify report content
