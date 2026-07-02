# Frontend Architecture

## Overview

The medai-viewer is a React-based medical imaging application built as a monorepo with shared packages. It provides 2D/3D visualization, AI-assisted segmentation, and clinical workflow support.

## Monorepo Structure

```
medai-viewer/
├── apps/
│   └── viewer/                 # Main React application
│
├── packages/
│   ├── core/                   # @medai/core - Business logic
│   ├── ui/                     # @medai/ui - UI components
│   └── itk-loader/             # @medai/itk-loader - Image format loaders
│
├── turbo.json                  # Turborepo build config
├── pnpm-workspace.yaml         # pnpm workspace config
└── package.json                # Root package
```

### Build System

- **Turborepo**: Parallel builds with caching
- **pnpm**: Efficient dependency management with workspaces
- **Vite**: Fast ES module bundling with HMR

```bash
# Development
pnpm dev                        # Starts all packages + viewer

# Build
pnpm build                      # Builds packages → app

# Package dependency graph
@medai/viewer
  ├── @medai/core
  │     └── @medai/itk-loader
  └── @medai/ui
```

## Package Architecture

### @medai/core - Business Logic Layer

**Purpose**: Encapsulates all state management, services, and business logic.

```
packages/core/src/
├── index.ts                    # Package exports
│
├── loaders/                    # Image loader system
│   ├── LoaderRegistry.ts       # Plugin registration
│   └── types.ts                # LoadedImage, ImageLoader interfaces
│
├── services/                   # API clients and business services
│   ├── MonaiLabelClient.ts     # MONAI Label API client
│   ├── InferenceService.ts     # Orchestrates AI inference
│   ├── DICOMWebClient.ts       # DICOMweb API client
│   ├── LabelLoaderService.ts   # Load segmentation masks
│   ├── LabelExportService.ts   # Export segmentations
│   ├── PersistenceService.ts   # IndexedDB operations
│   ├── AnalyticsService.ts     # Volumetrics, radiomics
│   ├── ReportGenerationService.ts
│   ├── TriageService.ts
│   └── SessionManager.ts       # Inference session tracking
│
├── stores/                     # Zustand state stores
│   ├── viewerStore.ts          # Image display state
│   ├── segmentationStore.ts    # Segmentation layers
│   ├── findingsStore.ts        # Clinical findings
│   ├── monaiStore.ts           # Server connection
│   ├── suiteStore.ts           # Clinical suite config
│   ├── studyBrowserStore.ts    # PACS studies
│   ├── reportStore.ts          # Generated reports
│   ├── detectionStore.ts       # AI detections
│   ├── triageStore.ts          # Triage priority
│   └── analyticsStore.ts       # Metrics data
│
├── suites/                     # Clinical suite configurations
│   ├── registry.ts             # Suite registration
│   ├── types.ts                # Suite interfaces
│   ├── oncology.ts             # Oncology workflow
│   ├── cardiology.ts           # Cardiology workflow
│   ├── neurology.ts            # Neurology workflow
│   └── ...
│
└── utils/                      # Utility functions
```

### @medai/ui - UI Component Library

**Purpose**: Reusable, styled UI primitives with no business logic.

```
packages/ui/src/
├── index.ts                    # Package exports
│
├── components/
│   ├── Button/                 # Button variants
│   ├── Panel/                  # Collapsible panels
│   ├── Skeleton/               # Loading placeholders
│   ├── Spinner/                # Loading spinner
│   └── Toast/                  # Notifications
│
├── providers/
│   └── ThemeProvider.tsx       # Dark mode support
│
├── themes/
│   └── default.ts              # Tailwind theme tokens
│
└── utils/
    └── cn.ts                   # className merging (clsx + tailwind-merge)
```

### @medai/itk-loader - Medical Image Loaders

**Purpose**: Load and decode various medical image formats using ITK-WASM.

```
packages/itk-loader/src/
├── index.ts                    # Package exports
│
├── NiftiLoader.ts              # NIfTI format (.nii, .nii.gz)
├── DicomLoader.ts              # DICOM format (.dcm)
├── NrrdLoader.ts               # NRRD format
├── MhaLoader.ts                # MetaImage format
├── TiffLoader.ts               # TIFF (microscopy)
├── StandardImageLoader.ts      # PNG, JPG, etc.
│
└── utils/
    ├── formatDetection.ts      # Auto-detect file format
    └── coordinateTransforms.ts # World/voxel transforms
```

## Application Structure

```
apps/viewer/src/
├── main.tsx                    # React entry point
├── App.tsx                     # Root component with routing
│
├── pages/                      # Route components
│   ├── ViewerPage.tsx          # Main viewer
│   ├── StudyBrowserPage.tsx    # PACS browser
│   ├── ReportPage.tsx          # Report generation
│   └── UploadPage.tsx          # File upload
│
├── layouts/
│   └── MainLayout.tsx          # App shell
│
├── components/
│   ├── TopBar.tsx              # Header with study info
│   ├── Toolbar.tsx             # Tool buttons
│   ├── LeftPanel.tsx           # Image list, settings
│   ├── RightPanel/             # AI tools, segmentation
│   │   ├── RightPanel.tsx
│   │   ├── tabs/               # Tab content
│   │   │   ├── AutoSegmentationTab.tsx
│   │   │   ├── SmartEditTab.tsx
│   │   │   └── CheXagentTab.tsx
│   │   └── panels/             # Domain panels
│   │       ├── OncologyMetricsPanel.tsx
│   │       └── CardiacMetricsPanel.tsx
│   ├── Viewport.tsx            # 3D volume viewport
│   ├── Viewport2D.tsx          # 2D image viewport
│   ├── StatusBar.tsx           # Bottom status
│   └── ...
│
├── hooks/                      # Custom React hooks
│   ├── useSuiteAutoDetection.ts
│   └── useSuiteEffects.ts
│
├── lib/                        # Integration libraries
│   └── cornerstone.ts          # Cornerstone3D setup
│
├── tools/                      # Custom Cornerstone tools
│   ├── FreehandMONAILabelTool.ts
│   └── ...
│
└── styles/
    └── globals.css             # Tailwind imports
```

## State Management

### Zustand Store Pattern

Each domain has its own store with state and actions:

```typescript
// Example: viewerStore.ts
interface ViewerState {
  images: Map<string, LoadedImage>;
  activeImageId: string | null;
  windowLevel: { window: number; level: number };
  zoom: number;
  pan: { x: number; y: number };
  sliceIndex: number;
}

interface ViewerActions {
  addImage: (image: LoadedImage) => void;
  setActiveImage: (id: string) => void;
  setWindowLevel: (window: number, level: number) => void;
  // ...
}

export const useViewerStore = create<ViewerState & ViewerActions>((set) => ({
  // Initial state
  images: new Map(),
  activeImageId: null,

  // Actions
  addImage: (image) => set((state) => ({
    images: new Map(state.images).set(image.id, image)
  })),
  // ...
}));
```

### Store Organization

| Store | Purpose | Key State |
|-------|---------|-----------|
| `viewerStore` | Image display | images, activeImageId, windowLevel, zoom, sliceIndex |
| `segmentationStore` | Segmentation layers | segmentations[], activeSegmentationId, visibility |
| `monaiStore` | Server connection | serverUrl, models[], connectionStatus |
| `suiteStore` | Clinical suite | activeSuiteId, suiteConfig, layout |
| `findingsStore` | Clinical findings | findings[], activeFilterId |
| `studyBrowserStore` | PACS studies | pacStudies[], localStudies[], filters |
| `reportStore` | Generated reports | reportContent, status |
| `detectionStore` | AI detections | detections[], confidenceThreshold |
| `triageStore` | Triage priority | priorityLevel, urgencyScore |

### Store Persistence

Selected stores persist to IndexedDB:

```typescript
// viewerStore with persistence
export const useViewerStore = create(
  persist(
    (set) => ({ /* state and actions */ }),
    {
      name: 'viewer-store',
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        recentFiles: state.recentFiles,
        // Don't persist large image data
      }),
    }
  )
);
```

## Component Organization

### Layout Hierarchy

```
MainLayout (h-screen flex flex-col)
├── TopBar (h-14)
│   ├── Logo
│   ├── StudyInfo
│   └── UserMenu
├── Toolbar (h-12)
│   ├── ToolButtons (Window, Pan, Zoom, etc.)
│   ├── WindowPresetMenu
│   └── SuiteSelector
├── Main Content (flex-1 flex)
│   ├── LeftPanel (w-72)
│   │   ├── ImageList
│   │   └── Settings
│   ├── ViewportArea (flex-1)
│   │   ├── Viewport (3D) or Viewport2D
│   │   └── BoundingBoxOverlay
│   └── RightPanel (w-80)
│       ├── TabNavigation
│       └── TabContent
│           ├── AutoSegmentationTab
│           ├── SmartEditTab
│           └── Domain Panels
└── StatusBar (h-6)
```

### RightPanel Tab System

Dynamic tabs based on active clinical suite:

```typescript
// Suite configuration determines available tabs
const oncologySuite = {
  id: 'oncology',
  rightPanelTabs: [
    { id: 'auto-seg', label: 'Auto-Seg', component: AutoSegmentationTab },
    { id: 'smart-edit', label: 'SmartEdit', component: SmartEditTab },
    { id: 'metrics', label: 'Metrics', component: OncologyMetricsPanel },
  ],
};
```

## Routing

### React Router v7 Configuration

```typescript
// App.tsx
<Routes>
  <Route path="/" element={<StudyBrowserPage />} />
  <Route path="/upload" element={<UploadPage />} />
  <Route path="/viewer" element={<ViewerPage />} />
  <Route path="/report" element={<ReportPage />} />
</Routes>
```

### Navigation Patterns

```typescript
// Navigate with state (local study)
navigate('/viewer', { state: { localStudyId: 'abc123' } });

// Navigate with query params (PACS study)
navigate('/viewer?studyUID=1.2.3.4.5');

// Navigate to report page
navigate('/report', {
  state: {
    volumetrics,
    radiomics,
    mosaicImage
  }
});
```

## Image Loader System

### Loader Registry Pattern

```typescript
// Registration
LoaderRegistry.register(new NiftiLoader());
LoaderRegistry.register(new DicomLoader());
LoaderRegistry.register(new StandardImageLoader());

// Usage
const loader = LoaderRegistry.getLoaderForFile(file);
const loadedImage = await loader.load(file);
```

### LoadedImage Interface

```typescript
interface LoadedImage {
  id: string;
  name: string;
  modality: string;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
  pixelData: TypedArray;
  metadata: {
    patientId?: string;
    studyDate?: string;
    seriesDescription?: string;
    // ...
  };
}
```

## Cornerstone3D Integration

### Initialization

```typescript
// lib/cornerstone.ts
export async function initCornerstone() {
  await cornerstoneWADOImageLoader.init();
  await cornerstoneDICOMImageLoader.init();

  cornerstoneTools.init();

  // Register tools
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  // ...
}
```

### Viewport Types

- **VolumeViewport**: 3D MPR rendering (axial, sagittal, coronal)
- **StackViewport**: 2D stack scrolling
- **Viewport2D**: Custom 2D for single images (PNG, JPG)

### Segmentation Rendering

```typescript
// Add segmentation to viewport
const segmentationRepresentationUIDs = await segmentation.addRepresentations(
  toolGroupId,
  [
    {
      segmentationId,
      type: Representations.Labelmap,
    },
  ]
);
```

## Clinical Suite System

### Suite Configuration Interface

```typescript
interface SuiteConfig {
  id: string;
  name: string;
  description: string;

  // Tool configuration
  enabledTools: string[];
  defaultTool: string;
  windowPresets: WindowPreset[];

  // AI configuration
  defaultModels: {
    autoSegmentation?: string;
    interactive?: string;
  };

  // UI configuration
  rightPanelTabs: TabConfig[];
  metricsPanel?: React.ComponentType;

  // Export options
  exportFormats: ExportFormat[];

  // Auto-detection hints
  autoDetect: {
    modalities: string[];
    bodyPart?: string;
    keywords?: string[];
  };
}
```

### Available Suites

| Suite | Modalities | Key Features |
|-------|------------|--------------|
| Oncology | CT, MR, PT | RECIST, tumor volumetrics |
| Cardiology | CT, MR, US | Cardiac measurements, EF |
| Neurology | MR, CT | Brain volumetrics, lesion tracking |
| Chest X-ray | CR, DX | CheXagent detection |
| Mammography | MG | BI-RADS, breast density |
| General | All | Default workflow |

### Suite Auto-Detection

```typescript
function autoDetectSuite(metadata: ImageMetadata): string | null {
  const { modality, bodyPart, studyDescription } = metadata;

  for (const suite of SuiteRegistry.getAll()) {
    if (suite.autoDetect.modalities.includes(modality)) {
      if (suite.autoDetect.bodyPart &&
          bodyPart?.toLowerCase().includes(suite.autoDetect.bodyPart)) {
        return suite.id;
      }
    }
  }

  return 'general';
}
```

## Service Layer

### MonaiLabelClient

```typescript
class MonaiLabelClient {
  async getInfo(): Promise<ServerInfo>;

  async infer(
    model: string,
    image: ArrayBuffer | Blob,
    params?: InferParams
  ): Promise<InferResult>;

  async createSession(image: ArrayBuffer): Promise<SessionInfo>;

  async generateReport(request: ReportRequest): Promise<ReportResponse>;

  async triageStudies(studies: Study[]): Promise<TriageResult>;
}
```

### InferenceService

Orchestrates the full inference workflow:

```typescript
class InferenceService {
  async runAutoSegmentation(
    imageId: string,
    model: string,
    params?: Record<string, any>
  ): Promise<SegmentationResult> {
    // 1. Check/create session
    // 2. Prepare image data
    // 3. Call MonaiLabelClient.infer()
    // 4. Process result
    // 5. Create segmentation layer
    // 6. Update segmentationStore
  }
}
```

## Performance Optimizations

### Code Splitting

```typescript
// Lazy load heavy components
const ReportPage = lazy(() => import('./pages/ReportPage'));
const Viewport3D = lazy(() => import('./components/Viewport'));
```

### Image Caching

- **IndexedDB**: Persist loaded images locally
- **Session Cache**: Cache inference results per session
- **Cornerstone Cache**: Built-in image/volume caching

### Selective Re-renders

Zustand's selector pattern prevents unnecessary re-renders:

```typescript
// Only re-renders when activeImageId changes
const activeImageId = useViewerStore((state) => state.activeImageId);

// Not this - causes re-render on any state change
const store = useViewerStore();
```

## Testing Strategy

### Unit Tests
- Store logic with Zustand testing utilities
- Service mocking with MSW

### Component Tests
- React Testing Library for UI components
- Storybook for visual testing

### E2E Tests
- Playwright for full workflow testing
- Visual regression with Chromatic

---

**Related Documents**:
- [Project Architecture](./PROJECT_ARCHITECTURE.md)
- [Data Flow](./DATA_FLOW.md)
