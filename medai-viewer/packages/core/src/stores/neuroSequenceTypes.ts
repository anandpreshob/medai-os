/**
 * Neuro Sequence Types
 *
 * TypeScript types for multi-sequence neuro workflow including:
 * - Sequence definitions (T1, T2, FLAIR, DWI, ADC)
 * - Viewport slot assignments
 * - Fusion/overlay settings
 * - Registration state
 */

// ============================================================================
// MRI Sequence Types
// ============================================================================

/**
 * Standard MRI sequence types for neuroimaging
 */
export type NeuroSequenceType =
  | 'T1'
  | 'T1_GD'     // T1 with gadolinium contrast
  | 'T2'
  | 'T2_STAR'   // T2* (susceptibility)
  | 'FLAIR'
  | 'DWI'
  | 'ADC'
  | 'SWI'       // Susceptibility weighted imaging
  | 'MRA'       // MR Angiography
  | 'OTHER';

/**
 * Sequence metadata
 */
export interface SequenceInfo {
  /** Unique identifier */
  id: string;

  /** Sequence type */
  type: NeuroSequenceType;

  /** Human-readable name */
  displayName: string;

  /** Associated image ID in viewer */
  imageId: string;

  /** Series description from DICOM */
  seriesDescription?: string;

  /** Acquisition date/time */
  acquisitionDateTime?: string;

  /** Image dimensions */
  dimensions?: [number, number, number];

  /** Voxel spacing in mm */
  spacing?: [number, number, number];

  /** Whether this sequence is registered to reference */
  isRegistered: boolean;

  /** Transform matrix if registered (4x4 affine) */
  registrationMatrix?: number[];

  /** Sequence-specific window/level preset */
  wlPreset?: {
    windowWidth: number;
    windowCenter: number;
  };
}

// ============================================================================
// Viewport Slot Types
// ============================================================================

/**
 * Viewport slot identifiers for multi-sequence grid
 */
export type ViewportSlot = 'slot1' | 'slot2' | 'slot3' | 'slot4';

/**
 * Assignment of sequence to viewport slot
 */
export interface SlotAssignment {
  /** Viewport slot identifier */
  slot: ViewportSlot;

  /** Assigned sequence ID (null if empty) */
  sequenceId: string | null;

  /** Whether this slot is the reference for crosshairs */
  isReference: boolean;

  /** View orientation for this slot */
  orientation: 'axial' | 'sagittal' | 'coronal';

  /** Fusion/overlay sequences (if any) */
  overlaySequenceIds?: string[];
}

// ============================================================================
// Fusion Types
// ============================================================================

/**
 * Blend modes for multi-volume fusion
 */
export type FusionBlendMode =
  | 'alpha'      // Simple alpha blending
  | 'additive'   // Additive blending
  | 'difference' // Difference highlighting
  | 'multiply'   // Multiplicative blend
  | 'screen';    // Screen blend

/**
 * Colormap options for overlay sequences
 */
export type OverlayColormap =
  | 'hot'
  | 'cool'
  | 'jet'
  | 'viridis'
  | 'plasma'
  | 'grayscale'
  | 'red'
  | 'green'
  | 'blue'
  | 'yellow';

/**
 * Fusion settings for a viewport
 */
export interface FusionSettings {
  /** Whether fusion is enabled */
  enabled: boolean;

  /** Base sequence ID */
  baseSequenceId: string;

  /** Overlay sequence ID */
  overlaySequenceId: string;

  /** Blend mode */
  blendMode: FusionBlendMode;

  /** Base volume opacity (0-1) */
  baseOpacity: number;

  /** Overlay volume opacity (0-1) */
  overlayOpacity: number;

  /** Colormap for overlay */
  overlayColormap: OverlayColormap;

  /** Threshold for overlay (values below this are transparent) */
  overlayThreshold?: number;
}

// ============================================================================
// Registration Types
// ============================================================================

/**
 * Registration status
 */
export type RegistrationStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed';

/**
 * Registration method
 */
export type RegistrationMethod =
  | 'rigid'       // Translation + rotation only
  | 'affine'      // Full affine (includes scaling/shearing)
  | 'deformable'; // Non-linear (future)

/**
 * Registration result
 */
export interface RegistrationResult {
  /** Source sequence ID */
  sourceSequenceId: string;

  /** Target (reference) sequence ID */
  targetSequenceId: string;

  /** Registration method used */
  method: RegistrationMethod;

  /** 4x4 transformation matrix (row-major) */
  transformMatrix: number[];

  /** Quality metric (e.g., mutual information) */
  qualityScore: number;

  /** Registration timestamp */
  timestamp: number;

  /** Any error message */
  error?: string;
}

/**
 * Registration state for a sequence pair
 */
export interface RegistrationState {
  /** Source sequence ID */
  sourceId: string;

  /** Target sequence ID */
  targetId: string;

  /** Current status */
  status: RegistrationStatus;

  /** Result (if completed) */
  result?: RegistrationResult;

  /** Progress percentage (0-100) */
  progress: number;
}

// ============================================================================
// Synchronization Types
// ============================================================================

/**
 * World coordinate position for cross-viewport sync
 */
export interface WorldPosition {
  /** X coordinate in world space (mm) */
  x: number;

  /** Y coordinate in world space (mm) */
  y: number;

  /** Z coordinate in world space (mm) */
  z: number;
}

/**
 * Synchronization state
 */
export interface SyncState {
  /** Whether viewports are synchronized */
  enabled: boolean;

  /** Current synchronized world position */
  worldPosition: WorldPosition | null;

  /** Reference viewport slot */
  referenceSlot: ViewportSlot;

  /** Whether to sync window/level */
  syncWindowLevel: boolean;

  /** Whether to sync zoom */
  syncZoom: boolean;
}

// ============================================================================
// Layout Types
// ============================================================================

/**
 * Multi-sequence layout presets
 */
export type NeuroLayoutPreset =
  | 'sequence-2x2'      // 4 sequences in 2x2 grid
  | 'sequence-1x4'      // 4 sequences in horizontal strip
  | 'fusion-main'       // Large fusion view + 3 sequence strips
  | 'dwi-adc-compare';  // Side-by-side DWI and ADC

/**
 * Layout configuration
 */
export interface NeuroLayoutConfig {
  /** Layout preset */
  preset: NeuroLayoutPreset;

  /** Number of slots */
  slotCount: number;

  /** Grid columns */
  columns: number;

  /** Grid rows */
  rows: number;

  /** Slot sizes (relative, should sum to 1 per row) */
  slotSizes?: number[];
}

/**
 * Preset configurations
 */
export const NEURO_LAYOUT_CONFIGS: Record<NeuroLayoutPreset, NeuroLayoutConfig> = {
  'sequence-2x2': {
    preset: 'sequence-2x2',
    slotCount: 4,
    columns: 2,
    rows: 2,
    slotSizes: [0.5, 0.5, 0.5, 0.5],
  },
  'sequence-1x4': {
    preset: 'sequence-1x4',
    slotCount: 4,
    columns: 4,
    rows: 1,
    slotSizes: [0.25, 0.25, 0.25, 0.25],
  },
  'fusion-main': {
    preset: 'fusion-main',
    slotCount: 4,
    columns: 2,
    rows: 2,
    slotSizes: [0.7, 0.3, 0.33, 0.33],
  },
  'dwi-adc-compare': {
    preset: 'dwi-adc-compare',
    slotCount: 2,
    columns: 2,
    rows: 1,
    slotSizes: [0.5, 0.5],
  },
};

// ============================================================================
// Sequence Detection Helpers
// ============================================================================

/**
 * Keywords for automatic sequence type detection from series description
 */
export const SEQUENCE_DETECTION_KEYWORDS: Record<NeuroSequenceType, string[]> = {
  T1: ['t1', 'mprage', 'spgr', 'bravo', 'mp-rage'],
  T1_GD: ['t1+', 't1 gd', 'post-contrast', 'post gad', 'enhanced', 'ce-t1'],
  T2: ['t2', 'tse', 'fse'],
  T2_STAR: ['t2*', 't2star', 'gre', 'gradient echo'],
  FLAIR: ['flair', 'dark-fluid', 'dark fluid'],
  DWI: ['dwi', 'diffusion', 'diff', 'b=1000', 'b1000'],
  ADC: ['adc', 'apparent diffusion'],
  SWI: ['swi', 'susceptibility'],
  MRA: ['mra', 'tof', 'time of flight', 'angio'],
  OTHER: [],
};

/**
 * Detect sequence type from series description
 */
export function detectSequenceType(seriesDescription: string): NeuroSequenceType {
  const lower = seriesDescription.toLowerCase();

  for (const [type, keywords] of Object.entries(SEQUENCE_DETECTION_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return type as NeuroSequenceType;
    }
  }

  return 'OTHER';
}

/**
 * Get display name for sequence type
 */
export function getSequenceDisplayName(type: NeuroSequenceType): string {
  const names: Record<NeuroSequenceType, string> = {
    T1: 'T1-Weighted',
    T1_GD: 'T1 + Contrast',
    T2: 'T2-Weighted',
    T2_STAR: 'T2*',
    FLAIR: 'FLAIR',
    DWI: 'DWI',
    ADC: 'ADC',
    SWI: 'SWI',
    MRA: 'MR Angiography',
    OTHER: 'Other',
  };
  return names[type];
}

/**
 * Default window/level presets for each sequence type
 */
export const SEQUENCE_WL_PRESETS: Record<NeuroSequenceType, { windowWidth: number; windowCenter: number }> = {
  T1: { windowWidth: 500, windowCenter: 250 },
  T1_GD: { windowWidth: 500, windowCenter: 250 },
  T2: { windowWidth: 500, windowCenter: 250 },
  T2_STAR: { windowWidth: 400, windowCenter: 200 },
  FLAIR: { windowWidth: 600, windowCenter: 300 },
  DWI: { windowWidth: 400, windowCenter: 200 },
  ADC: { windowWidth: 1500, windowCenter: 750 },
  SWI: { windowWidth: 300, windowCenter: 150 },
  MRA: { windowWidth: 800, windowCenter: 400 },
  OTHER: { windowWidth: 500, windowCenter: 250 },
};
