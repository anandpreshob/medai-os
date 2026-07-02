/**
 * MedAI Suites - Type Definitions
 *
 * Suites are domain-specific workflow bundles that configure
 * the viewer UI, tools, models, and analytics for clinical verticals.
 */

import type { FeatureId } from '../features/types';

/**
 * Suite identifiers for all supported clinical domains
 */
export type SuiteId =
  | 'auto'
  | 'oncology'
  | 'rt'
  | 'neurology'
  | 'cardiology'
  | 'surgical'
  | 'chestxray'
  | 'annotation';

/**
 * Viewport layout presets
 */
export type LayoutPreset =
  | 'fourUp' // 2x2 grid: Axial, Sagittal, Coronal, 3D
  | 'threePlusOne' // 3 MPR views + smaller 3D
  | 'big3D' // Large 3D + 1-2 MPR views
  | 'singleView' // Single viewport (2D images)
  | 'comparison' // Side-by-side comparison
  | 'longitudinal-2' // 2 timepoints side-by-side (longitudinal comparison)
  | 'longitudinal-3'; // 3 timepoints side-by-side (longitudinal comparison)

/**
 * Supported export formats
 */
export type ExportFormat =
  | 'nifti'
  | 'csv'
  | 'json'
  | 'rtstruct'
  | 'mesh'
  | 'dicom-seg'
  | 'stl'
  | 'obj'
  | 'glb'
  | 'ply'
  | 'png';

/**
 * Window/Level preset definition
 */
export interface WLPreset {
  id: string;
  name: string;
  windowWidth: number;
  windowCenter: number;
}

/**
 * Tab configuration for RightPanel
 */
export interface SuiteTabConfig {
  id: string;
  label: string;
  component: string; // Component name for dynamic loading
  icon?: string; // Lucide icon name
  /** Features that must be enabled for this tab to appear (overrides component-based defaults) */
  requiredFeatures?: FeatureId[];
}

/**
 * Panel configuration for RightPanel
 */
export interface SuitePanelConfig {
  id: string;
  component: string; // Component name for dynamic loading
  order: number; // Display order (lower = higher)
  props?: Record<string, unknown>; // Additional props
  /** Features that must be enabled for this panel to appear (overrides component-based defaults) */
  requiredFeatures?: FeatureId[];
  /** Only show this panel when one of these suite modes is active */
  showForModes?: string[];
}

/**
 * Disease/workflow-specific mode within a suite (e.g. neurology MS protocol)
 */
export interface SuiteModeConfig {
  id: string;
  name: string;
  /** MONAI task names preferred in this mode */
  preferredTasks: string[];
  /** Layout identifier (a LayoutPreset or suite-specific additional layout) */
  defaultLayout: string;
  /** Anatomical regions to emphasize in metrics/overlays */
  emphasizedRegions?: string[];
}

/**
 * Detection hints for auto-detecting suite from DICOM metadata
 */
export interface SuiteDetectionHints {
  /** DICOM modalities that suggest this suite (e.g., 'CT', 'MR', 'RTSTRUCT') */
  modalities: string[];
  /** Body parts examined (e.g., 'LIVER', 'BRAIN', 'CHEST') */
  bodyParts: string[];
  /** Keywords to search for in series/study description */
  descriptionKeywords: string[];
  /** Keywords to search for in protocol name */
  protocolKeywords: string[];
}

/**
 * Longitudinal configuration for a suite
 */
export interface SuiteLongitudinalConfig {
  /** Default layout when longitudinal session is active */
  defaultLongitudinalLayout: LayoutPreset;
  /** Maximum number of timepoints supported in comparison view */
  maxTimepoints: number;
  /** Metrics to track across timepoints */
  trackableMetrics: string[];
  /** Enable RECIST-like response assessment */
  enableResponseAssessment?: boolean;
  /** Enable lesion tracking across timepoints */
  enableLesionTracking?: boolean;
}

/**
 * Main Suite Configuration
 *
 * Defines all aspects of a clinical workflow suite including
 * UI configuration, model preferences, and export options.
 */
export interface SuiteConfig {
  /** Unique suite identifier */
  id: SuiteId;
  /** Display name */
  name: string;
  /** Brief description */
  description: string;
  /** Lucide icon name */
  icon: string;
  /** Features that must be enabled for this suite to be available at all */
  requiredFeatures?: FeatureId[];
  /** Disease/workflow-specific modes within this suite */
  modes?: SuiteModeConfig[];

  // === Layout & Tools ===

  /** Default viewport layout when suite is activated */
  defaultLayout: LayoutPreset;
  /** Extra suite-specific layout identifiers (e.g. neuro multi-sequence grids) */
  additionalLayouts?: string[];
  /** Window/level preset IDs to show (references WL_PRESETS) */
  wlPresets: string[];
  /** Tool IDs to enable in toolbar */
  enabledTools: string[];

  // === MONAI Label Integration ===

  /** MONAI Label task names for this suite */
  monaiTasks: string[];
  /** Preferred models in order of preference */
  preferredModels: string[];

  // === Analytics & Export ===

  /** ID of the metrics panel to render */
  metricsPanelId: string;
  /** Enabled metric types */
  enabledMetrics: string[];
  /** Allowed export formats */
  allowedExports: ExportFormat[];

  // === RightPanel Configuration ===

  /** Tabs to show in RightPanel tab nav */
  tabs: SuiteTabConfig[];
  /** Panels to render in RightPanel */
  panels: SuitePanelConfig[];

  // === Auto-detection ===

  /** Hints for auto-detecting this suite from study metadata */
  detectionHints: SuiteDetectionHints;

  // === Longitudinal Support ===

  /** Whether this suite supports longitudinal comparison workflows */
  supportsLongitudinal?: boolean;
  /** Longitudinal-specific configuration (required if supportsLongitudinal is true) */
  longitudinalConfig?: SuiteLongitudinalConfig;
}

/**
 * Result of suite auto-detection
 */
export interface SuiteDetectionResult {
  /** Detected suite ID */
  suiteId: SuiteId;
  /** Confidence score (0-1) */
  confidence: number;
  /** Criteria that matched */
  matchedCriteria: string[];
}

/**
 * Study metadata used for suite detection
 */
export interface StudyMetadata {
  modality?: string;
  bodyPartExamined?: string;
  seriesDescription?: string;
  studyDescription?: string;
  protocolName?: string;
}

/**
 * Suite mode - auto-detect or manually selected
 */
export type SuiteMode = 'auto' | 'manual';

/**
 * Standard Window/Level presets
 */
export const WL_PRESETS: Record<string, WLPreset> = {
  'ct-soft-tissue': {
    id: 'ct-soft-tissue',
    name: 'Soft Tissue',
    windowWidth: 400,
    windowCenter: 40,
  },
  'ct-lung': {
    id: 'ct-lung',
    name: 'Lung',
    windowWidth: 1500,
    windowCenter: -600,
  },
  'ct-liver': {
    id: 'ct-liver',
    name: 'Liver',
    windowWidth: 150,
    windowCenter: 30,
  },
  'ct-bone': {
    id: 'ct-bone',
    name: 'Bone',
    windowWidth: 2000,
    windowCenter: 300,
  },
  'ct-brain': {
    id: 'ct-brain',
    name: 'Brain',
    windowWidth: 80,
    windowCenter: 40,
  },
  'ct-angio': {
    id: 'ct-angio',
    name: 'Angio',
    windowWidth: 600,
    windowCenter: 300,
  },
  'mr-t1': {
    id: 'mr-t1',
    name: 'MR T1',
    windowWidth: 500,
    windowCenter: 250,
  },
  'mr-t2': {
    id: 'mr-t2',
    name: 'MR T2',
    windowWidth: 500,
    windowCenter: 250,
  },
  'mr-flair': {
    id: 'mr-flair',
    name: 'MR FLAIR',
    windowWidth: 500,
    windowCenter: 250,
  },
  // Chest X-ray presets
  'xray-default': {
    id: 'xray-default',
    name: 'X-Ray Default',
    windowWidth: 2048,
    windowCenter: 1024,
  },
  'xray-lung': {
    id: 'xray-lung',
    name: 'X-Ray Lung',
    windowWidth: 3000,
    windowCenter: 500,
  },
  'xray-mediastinum': {
    id: 'xray-mediastinum',
    name: 'X-Ray Mediastinum',
    windowWidth: 500,
    windowCenter: 50,
  },
  'xray-bone': {
    id: 'xray-bone',
    name: 'X-Ray Bone',
    windowWidth: 2500,
    windowCenter: 480,
  },
};

/**
 * Standard RT Structure colors (DICOM RT convention)
 */
export const RT_STRUCTURE_COLORS: Record<string, string> = {
  GTV: '#FF0000', // Red
  CTV: '#FF6600', // Orange
  PTV: '#FFCC00', // Yellow
  Brain: '#FF69B4', // Pink
  Brainstem: '#9370DB', // Purple
  SpinalCord: '#4169E1', // Blue
  Lung_L: '#00CED1', // Cyan
  Lung_R: '#00CED1', // Cyan
  Heart: '#FF00FF', // Magenta
  Liver: '#8B4513', // Brown
  Kidney_L: '#228B22', // Green
  Kidney_R: '#228B22', // Green
  Bladder: '#FFD700', // Gold
  Rectum: '#FF7F50', // Coral
  Prostate: '#DDA0DD', // Plum
  Femur_L: '#D2691E', // Chocolate
  Femur_R: '#D2691E', // Chocolate
};
