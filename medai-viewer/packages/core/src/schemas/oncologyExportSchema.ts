/**
 * Oncology Export Schema - Structured JSON schema for trial-grade exports
 *
 * Defines the complete data structure for exporting oncology measurements,
 * segmentations, and provenance tracking for clinical trial workflows.
 */

// ============================================================================
// Edit Tracking Types
// ============================================================================

/**
 * Types of edits that can be performed on segmentation masks
 */
export type EditType =
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'threshold'
  | 'smart_edit'
  | 'box_prompt'
  | 'scribble_prompt'
  | 'lasso_prompt'
  | 'point_prompt'
  | 'merge'
  | 'split'
  | 'delete'
  | 'rename'
  | 'visibility_toggle'
  | 'lock_toggle'
  | 'color_change';

/**
 * Record of a single edit operation
 */
export interface EditRecord {
  /** Unique identifier for this edit */
  id: string;

  /** Type of edit operation */
  editType: EditType;

  /** ISO timestamp when edit occurred */
  timestamp: string;

  /** Username of editor (if authenticated) */
  username?: string;

  /** Segment(s) affected by this edit */
  affectedSegments: number[];

  /** Optional description of the edit */
  description?: string;

  /** Edit-specific parameters (e.g., brush size, threshold value) */
  parameters?: Record<string, unknown>;

  /** Previous state hash for undo capability */
  previousStateHash?: string;
}

// ============================================================================
// Model Provenance Types
// ============================================================================

/**
 * Information about the AI model used for inference
 */
export interface ModelProvenance {
  /** Model name (e.g., 'nninteractive', 'totalsegmentator') */
  name: string;

  /** Model version */
  version: string;

  /** Parameters used for this inference */
  parameters: Record<string, unknown>;

  /** ISO timestamp when inference was performed */
  timestamp: string;

  /** Optional model checkpoint identifier */
  checkpointId?: string;

  /** Training dataset reference */
  trainingDataset?: string;
}

// ============================================================================
// Reviewer Types
// ============================================================================

/**
 * Segmentation review status
 */
export type ReviewStatus = 'draft' | 'final';

/**
 * Information about the reviewer
 */
export interface ReviewerInfo {
  /** Reviewer username */
  username: string;

  /** Review status */
  status: ReviewStatus;

  /** ISO timestamp of review action */
  timestamp: string;

  /** Optional reviewer notes */
  notes?: string;

  /** Digital signature hash (for audit purposes) */
  signatureHash?: string;
}

// ============================================================================
// Provenance Types
// ============================================================================

/**
 * Complete provenance tracking for segmentation
 */
export interface SegmentationProvenance {
  /** Model information for automated segmentation */
  segmentationModel: ModelProvenance;

  /** All manual edits performed on the segmentation */
  edits: EditRecord[];

  /** Optional reviewer information */
  reviewer?: ReviewerInfo;
}

// ============================================================================
// Lesion Measurement Types
// ============================================================================

/**
 * Measurement source type
 */
export type MeasurementSource = 'manual' | 'ai_auto' | 'ai_assisted';

/**
 * Volumetric measurements for a single lesion
 */
export interface LesionVolumetrics {
  /** Volume in cubic millimeters */
  volumeMm3: number;

  /** Volume in cubic centimeters */
  volumeCm3: number;

  /** Longest axis diameter in mm (for RECIST) */
  longestAxisMm: number;

  /** Short axis diameter in mm (for lymph nodes) */
  shortAxisMm?: number;

  /** Axial plane max diameter */
  axialDiameterMm: number;

  /** Bounding box dimensions [x, y, z] in mm */
  dimensionsMm: [number, number, number];

  /** 3D centroid position in image coordinates */
  centroidIjk: [number, number, number];

  /** Voxel count */
  voxelCount: number;
}

/**
 * Single oncology lesion with measurements
 */
export interface OncologyLesion {
  /** Unique lesion identifier */
  id: string;

  /** Lesion label (e.g., 'Target Lesion 1', 'Liver Met 2') */
  label: string;

  /** Segment index in the labelmap */
  segmentIndex: number;

  /** Display color */
  color: string;

  /** Lesion category for RECIST assessment */
  category: 'target' | 'non_target' | 'new' | 'non_measurable';

  /** Anatomical location */
  location?: string;

  /** Volumetric measurements */
  volumetrics: LesionVolumetrics;

  /** How measurements were obtained */
  measurementSource: MeasurementSource;

  /** Confidence score if AI-measured (0-1) */
  confidence?: number;

  /** Per-lesion notes */
  notes?: string;

  /** Linked lesion IDs from previous timepoints */
  linkedLesionIds?: string[];
}

// ============================================================================
// Response Assessment Types
// ============================================================================

/**
 * RECIST 1.1 response category
 */
export type RECISTResponse =
  | 'complete_response'
  | 'partial_response'
  | 'stable_disease'
  | 'progressive_disease'
  | 'not_evaluable';

/**
 * Response assessment results
 */
export interface ResponseAssessment {
  /** RECIST 1.1 classification */
  recistClassification: RECISTResponse;

  /** Sum of longest diameters for target lesions (mm) */
  sumLongestDiameterMm: number;

  /** Percentage change from baseline */
  percentChangeFromBaseline?: number;

  /** Percentage change from nadir */
  percentChangeFromNadir?: number;

  /** Total tumor burden volume (cm3) */
  totalTumorBurdenCm3: number;

  /** Number of new lesions */
  newLesionCount: number;

  /** Assessment notes */
  notes?: string;

  /** ISO timestamp of assessment */
  assessmentTimestamp: string;
}

// ============================================================================
// Export Context Types
// ============================================================================

/**
 * Study context for the export
 */
export interface ExportContext {
  /** Patient identifier */
  patientId: string;

  /** Study Instance UID */
  studyUID: string;

  /** Series Instance UID */
  seriesUID?: string;

  /** Imaging modality */
  modality: string;

  /** Body part examined */
  bodyPart: string;

  /** Study date (YYYYMMDD format) */
  studyDate?: string;

  /** Study description */
  studyDescription?: string;

  /** Timepoint label (e.g., 'Baseline', 'Week 12') */
  timepointLabel?: string;
}

// ============================================================================
// Main Export Schema
// ============================================================================

/**
 * Complete oncology export schema for trial-grade data export
 */
export interface OncologyExportSchema {
  /** Schema version for compatibility tracking */
  version: '1.0.0';

  /** ISO timestamp when export was generated */
  exportTimestamp: string;

  /** Export context (patient, study, modality) */
  context: ExportContext;

  /** All lesions with measurements */
  lesions: OncologyLesion[];

  /** Optional response assessment */
  responseAssessment?: ResponseAssessment;

  /** Complete provenance tracking */
  provenance: SegmentationProvenance;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty OncologyExportSchema with defaults
 */
export function createEmptyExportSchema(context: ExportContext): OncologyExportSchema {
  return {
    version: '1.0.0',
    exportTimestamp: new Date().toISOString(),
    context,
    lesions: [],
    provenance: {
      segmentationModel: {
        name: 'unknown',
        version: '0.0.0',
        parameters: {},
        timestamp: new Date().toISOString(),
      },
      edits: [],
    },
  };
}

/**
 * Create an EditRecord
 */
export function createEditRecord(
  editType: EditType,
  affectedSegments: number[],
  username?: string,
  parameters?: Record<string, unknown>
): EditRecord {
  return {
    id: `edit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    editType,
    timestamp: new Date().toISOString(),
    username,
    affectedSegments,
    parameters,
  };
}

/**
 * Calculate RECIST response based on percentage change
 */
export function calculateRECISTResponse(
  percentChangeFromBaseline: number,
  percentChangeFromNadir: number,
  hasNewLesions: boolean
): RECISTResponse {
  // Progressive disease: new lesions or >= 20% increase from nadir
  if (hasNewLesions || percentChangeFromNadir >= 20) {
    return 'progressive_disease';
  }

  // Complete response: complete disappearance
  if (percentChangeFromBaseline <= -100) {
    return 'complete_response';
  }

  // Partial response: >= 30% decrease from baseline
  if (percentChangeFromBaseline <= -30) {
    return 'partial_response';
  }

  // Stable disease: neither PR nor PD
  return 'stable_disease';
}

export default OncologyExportSchema;
