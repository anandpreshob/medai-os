/**
 * Longitudinal Sessioning - Type Definitions
 *
 * Types for managing multi-study comparison sessions where radiologists
 * can view and analyze the same patient's imaging across timepoints.
 */

/**
 * Represents a single imaging timepoint within a longitudinal session.
 * Each timepoint corresponds to a study/series loaded into the viewer.
 */
export interface LongitudinalTimepoint {
  /** Unique identifier for this timepoint */
  id: string;
  /** Display label (e.g., "Baseline", "6-month FU", "12-month FU") */
  label: string;
  /** DICOM Study Instance UID (if from PACS) */
  studyInstanceUID?: string;
  /** DICOM Series Instance UID (if from PACS) */
  seriesInstanceUID?: string;
  /** References viewerStore.images - the loaded image for this timepoint */
  imageId: string;
  /** Acquisition date/time from DICOM or file metadata */
  acquisitionDateTime: string;
  /** Display order (0 = baseline, 1+ = follow-ups) */
  order: number;
  /** Radiologist notes for this timepoint */
  notes?: string;
  /** Segmentation IDs associated with this timepoint */
  segmentationIds?: string[];
  /** Study date in YYYY-MM-DD format for display */
  studyDate?: string;
  /** Study description from DICOM */
  studyDescription?: string;
}

/**
 * A longitudinal session groups multiple timepoints for the same patient.
 * Enables side-by-side comparison and tracking of changes over time.
 */
export interface LongitudinalSession {
  /** Unique session identifier */
  id: string;
  /** Patient ID from DICOM (used to find related studies) */
  patientId: string;
  /** Patient name for display */
  patientName?: string;
  /** Primary imaging modality (CT, MR, CR, etc.) */
  modality: string;
  /** Anatomical region being tracked (e.g., "Chest", "Brain", "Liver") */
  anatomy: string;
  /** User-provided description of the session */
  description?: string;
  /** Ordered list of timepoints (baseline first) */
  timepoints: LongitudinalTimepoint[];
  /** Session creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  updatedAt: number;
  /** Response assessment standard being used */
  responseAssessment?: 'RECIST' | 'BI-RADS' | 'RANO' | 'mRECIST' | 'iRECIST' | 'custom';
  /** Suite ID that initiated this session */
  suiteId?: string;
}

/**
 * Viewport synchronization settings for longitudinal comparison.
 */
export interface LongitudinalSyncSettings {
  /** Sync pan across viewports */
  syncPan: boolean;
  /** Sync zoom level across viewports */
  syncZoom: boolean;
  /** Sync window/level across viewports */
  syncWindowLevel: boolean;
  /** Sync slice index for 3D volumes (linked scrolling) */
  syncSliceIndex: boolean;
  /** Sync camera position/orientation in 3D */
  syncCamera: boolean;
}

/**
 * Default synchronization settings for new longitudinal sessions.
 */
export const DEFAULT_SYNC_SETTINGS: LongitudinalSyncSettings = {
  syncPan: true,
  syncZoom: true,
  syncWindowLevel: true,
  syncSliceIndex: true,
  syncCamera: true,
};

/**
 * Layout modes for longitudinal comparison view.
 */
export type LongitudinalLayoutMode =
  | 'longitudinal-2'  // 2 timepoints side-by-side
  | 'longitudinal-3'  // 3 timepoints side-by-side
  | 'longitudinal-4'  // 2x2 grid for 4 timepoints
  | 'overlay'         // Overlay/fusion view
  | 'slider';         // Image comparison slider

/**
 * Per-timepoint metrics for delta calculations.
 */
export interface TimepointMetrics {
  /** Reference to timepoint */
  timepointId: string;
  /** Volume measurements by segment label */
  volumesBySegment: Record<string, number>;
  /** Max diameter measurements by segment label */
  diametersBySegment: Record<string, number>;
  /** Lesion/instance count by segment label */
  countsBySegment: Record<string, number>;
  /** When these metrics were computed */
  computedAt: number;
}

/**
 * Delta (change) calculations between timepoints.
 */
export interface LongitudinalDelta {
  /** Baseline timepoint ID */
  baselineTimepointId: string;
  /** Current/comparison timepoint ID */
  currentTimepointId: string;
  /** Per-segment changes */
  segments: LongitudinalSegmentDelta[];
  /** Summary statistics */
  summary: {
    /** Total volume change across all segments */
    totalVolumeChangePercent: number;
    /** Progression classification based on response criteria */
    classification: ProgressionClassification;
    /** Sum of longest diameters (for RECIST) */
    sumOfDiametersChange?: number;
    /** New lesion count */
    newLesionCount?: number;
    /** Resolved lesion count */
    resolvedLesionCount?: number;
  };
}

/**
 * Per-segment delta calculations.
 */
export interface LongitudinalSegmentDelta {
  /** Segment label (e.g., "Tumor", "Lesion 1") */
  segmentLabel: string;
  /** Baseline volume in cm³ */
  baselineVolumeCm3: number;
  /** Current volume in cm³ */
  currentVolumeCm3: number;
  /** Absolute volume change in cm³ */
  absoluteChangeCm3: number;
  /** Percentage change from baseline */
  percentChange: number;
  /** Progression classification for this segment */
  classification: ProgressionClassification;
  /** Baseline longest diameter in mm */
  baselineDiameterMm?: number;
  /** Current longest diameter in mm */
  currentDiameterMm?: number;
  /** Diameter change percentage */
  diameterChangePercent?: number;
}

/**
 * Progression classification based on imaging response criteria.
 */
export type ProgressionClassification =
  | 'complete_response'   // CR: Complete disappearance
  | 'partial_response'    // PR: Significant decrease (≥30% for RECIST)
  | 'stable_disease'      // SD: Neither sufficient shrinkage nor increase
  | 'progressive_disease' // PD: Significant increase (≥20% for RECIST) or new lesions
  | 'not_evaluable';      // NE: Cannot be assessed

/**
 * Result of getLongitudinalMetrics() helper.
 */
export interface LongitudinalMetricsResult {
  /** Session being analyzed */
  sessionId: string;
  /** All timepoint metrics */
  timepointMetrics: TimepointMetrics[];
  /** Delta calculations between baseline and each follow-up */
  deltas: LongitudinalDelta[];
  /** Whether metrics are complete for all timepoints */
  isComplete: boolean;
  /** Error message if metrics could not be computed */
  error?: string;
}

/**
 * RECIST 1.1 thresholds for progression classification.
 * @see https://recist.eortc.org/
 */
export const RECIST_THRESHOLDS = {
  /** Partial Response: ≥30% decrease in sum of diameters */
  PARTIAL_RESPONSE: -30,
  /** Progressive Disease: ≥20% increase in sum of diameters */
  PROGRESSIVE_DISEASE: 20,
  /** Minimum absolute increase for PD (5mm) */
  MINIMUM_ABSOLUTE_INCREASE_MM: 5,
} as const;

/**
 * BI-RADS response assessment thresholds.
 */
export const BI_RADS_THRESHOLDS = {
  /** Complete Response: No residual enhancement */
  COMPLETE_RESPONSE: -100,
  /** Partial Response: ≥30% decrease in longest diameter */
  PARTIAL_RESPONSE: -30,
  /** Progressive Disease: ≥20% increase in longest diameter */
  PROGRESSIVE_DISEASE: 20,
} as const;

/**
 * Generate a unique timepoint ID.
 */
export function generateTimepointId(): string {
  return `tp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return `ls-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get display label for progression classification.
 */
export function getProgressionLabel(classification: ProgressionClassification): string {
  const labels: Record<ProgressionClassification, string> = {
    complete_response: 'Complete Response (CR)',
    partial_response: 'Partial Response (PR)',
    stable_disease: 'Stable Disease (SD)',
    progressive_disease: 'Progressive Disease (PD)',
    not_evaluable: 'Not Evaluable (NE)',
  };
  return labels[classification];
}

/**
 * Get color for progression classification display.
 */
export function getProgressionColor(classification: ProgressionClassification): string {
  const colors: Record<ProgressionClassification, string> = {
    complete_response: '#22c55e',   // Green
    partial_response: '#3b82f6',    // Blue
    stable_disease: '#eab308',      // Yellow
    progressive_disease: '#ef4444', // Red
    not_evaluable: '#6b7280',       // Gray
  };
  return colors[classification];
}
