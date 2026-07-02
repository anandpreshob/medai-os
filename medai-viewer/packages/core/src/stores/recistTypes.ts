/**
 * RECIST 1.1 Type Definitions
 *
 * Type definitions for Response Evaluation Criteria in Solid Tumors (RECIST) 1.1
 * implementation supporting auditable tumor response assessment.
 *
 * @see https://recist.eortc.org/recist-1-1-2/
 */

// =============================================================================
// Lesion Classification Types
// =============================================================================

/**
 * Classification of lesions according to RECIST 1.1 criteria.
 * - target: Measurable lesions selected for tracking (max 5/organ, 10 total)
 * - non_target: All other disease sites not selected as target lesions
 * - new: Lesions appearing after baseline assessment
 */
export type RECISTLesionType = 'target' | 'non_target' | 'new';

/**
 * Status assessment for non-target lesions.
 * - present: Non-target disease still present
 * - absent: Complete disappearance of non-target disease
 * - unequivocal_progression: Unambiguous progression of non-target disease
 */
export type NonTargetStatus = 'present' | 'absent' | 'unequivocal_progression';

/**
 * Overall response classification per RECIST 1.1.
 * - CR: Complete Response - All target lesions disappeared
 * - PR: Partial Response - >= 30% decrease in SLD from baseline
 * - SD: Stable Disease - Neither PR nor PD criteria met
 * - PD: Progressive Disease - >= 20% increase in SLD from nadir AND >= 5mm absolute increase, OR new lesions
 * - NE: Not Evaluable - Cannot be assessed
 */
export type RECISTOverallResponse = 'CR' | 'PR' | 'SD' | 'PD' | 'NE';

// =============================================================================
// RECIST Constraints
// =============================================================================

/**
 * RECIST 1.1 measurement constraints and thresholds.
 */
export const RECIST_CONSTRAINTS = {
  /** Maximum number of target lesions across all organs */
  MAX_TARGET_LESIONS_TOTAL: 10,
  /** Maximum number of target lesions per organ */
  MAX_TARGET_LESIONS_PER_ORGAN: 5,
  /** Minimum longest diameter for a measurable lesion (mm) */
  MIN_MEASURABLE_LESION_MM: 10,
  /** Minimum short axis for a measurable lymph node (mm) */
  MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM: 15,
  /** Short axis threshold below which lymph node is considered normal (mm) */
  LYMPH_NODE_NORMAL_THRESHOLD_MM: 10,
  /** Threshold for Partial Response (>= 30% decrease from baseline) */
  PR_THRESHOLD_PERCENT: -30,
  /** Threshold for Progressive Disease (>= 20% increase from nadir) */
  PD_THRESHOLD_PERCENT: 20,
  /** Minimum absolute increase required for PD (mm) */
  PD_MINIMUM_ABSOLUTE_INCREASE_MM: 5,
} as const;

// =============================================================================
// Lesion Interfaces
// =============================================================================

/**
 * Represents a lesion tracked under RECIST 1.1 criteria.
 */
export interface RECISTLesion {
  /** Unique identifier for this lesion */
  id: string;
  /** Reference to the segment index in the segmentation */
  segmentIndex: number;
  /** Classification of the lesion */
  type: RECISTLesionType;
  /** Anatomical region/organ where the lesion is located */
  anatomicalRegion: string;
  /** Whether this lesion is a lymph node (affects measurement method) */
  isLymphNode: boolean;
  /** Longest diameter at baseline in mm (for non-lymph node target lesions) */
  baselineLongestDiameterMm: number;
  /** Short axis at baseline in mm (required for lymph nodes) */
  baselineShortAxisMm?: number;
  /** Current longest diameter in mm (for follow-up assessments) */
  currentLongestDiameterMm?: number;
  /** Current short axis in mm (for lymph nodes in follow-up) */
  currentShortAxisMm?: number;
  /** Status for non-target lesions */
  nonTargetStatus?: NonTargetStatus;
  /** User-provided label/description */
  label?: string;
  /** Timestamp when this lesion was added */
  createdAt: number;
  /** Timestamp of last measurement update */
  updatedAt: number;
  /** Notes/comments about this lesion */
  notes?: string;
  /** Whether this lesion is marked as "too small to measure" */
  tooSmallToMeasure?: boolean;
}

/**
 * Measurement data for a single timepoint.
 */
export interface RECISTMeasurement {
  /** Reference to the lesion */
  lesionId: string;
  /** Timepoint/study identifier */
  timepointId: string;
  /** Measurement date */
  measurementDate: string;
  /** Longest diameter in mm */
  longestDiameterMm: number;
  /** Short axis in mm (for lymph nodes) */
  shortAxisMm?: number;
  /** Status for non-target lesions */
  nonTargetStatus?: NonTargetStatus;
  /** Whether marked as "too small to measure" */
  tooSmallToMeasure?: boolean;
  /** Notes */
  notes?: string;
}

// =============================================================================
// Assessment Interfaces
// =============================================================================

/**
 * Target lesion response summary.
 */
export interface TargetLesionResponse {
  /** All target lesions */
  lesions: RECISTLesion[];
  /** Sum of longest diameters (SLD) at baseline in mm */
  baselineSLD: number;
  /** Current SLD in mm */
  currentSLD: number;
  /** Nadir (minimum) SLD achieved during treatment in mm */
  nadirSLD: number;
  /** Timepoint ID when nadir was recorded */
  nadirTimepointId?: string;
  /** Percentage change from baseline */
  changeFromBaselinePercent: number;
  /** Percentage change from nadir */
  changeFromNadirPercent: number;
  /** Absolute change from nadir in mm */
  absoluteChangeFromNadirMm: number;
  /** Target lesion response */
  response: 'CR' | 'PR' | 'SD' | 'PD' | 'NE';
}

/**
 * Non-target lesion response summary.
 */
export interface NonTargetLesionResponse {
  /** All non-target lesions */
  lesions: RECISTLesion[];
  /** Overall non-target status */
  overallStatus: NonTargetStatus;
  /** Non-target response */
  response: 'CR' | 'Non-CR/Non-PD' | 'PD' | 'NE';
}

/**
 * Complete RECIST 1.1 assessment for a timepoint.
 */
export interface RECISTAssessment {
  /** Assessment identifier */
  id: string;
  /** Session/study identifier */
  sessionId: string;
  /** Timepoint identifier */
  timepointId: string;
  /** Assessment date */
  assessmentDate: string;
  /** All target lesions with current measurements */
  targetLesions: RECISTLesion[];
  /** Sum of longest diameters for target lesions */
  sumOfLongestDiameters: number;
  /** Baseline SLD for reference */
  baselineSLD: number;
  /** Nadir SLD (minimum achieved) */
  nadirSLD: number;
  /** SLD change from baseline as percentage */
  sldChangeFromBaseline: number;
  /** SLD change from nadir as percentage */
  sldChangeFromNadir: number;
  /** Absolute SLD change from nadir in mm */
  absoluteSldChangeFromNadir: number;
  /** Target lesion response classification */
  targetResponse: TargetLesionResponse['response'];
  /** Non-target lesions */
  nonTargetLesions: RECISTLesion[];
  /** Overall non-target status */
  nonTargetOverallStatus: NonTargetStatus;
  /** Non-target response classification */
  nonTargetResponse: NonTargetLesionResponse['response'];
  /** New lesions detected since baseline */
  newLesions: RECISTLesion[];
  /** Whether new lesions are present */
  hasNewLesions: boolean;
  /** Final overall response */
  overallResponse: RECISTOverallResponse;
  /** Whether this is the baseline assessment */
  isBaseline: boolean;
  /** Timestamp of assessment */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Reviewer/assessor notes */
  notes?: string;
  /** Whether assessment is confirmed/locked */
  isConfirmed: boolean;
  /** Reviewer name/ID */
  reviewedBy?: string;
}

// =============================================================================
// Session Interface
// =============================================================================

/**
 * RECIST tracking session for a patient.
 */
export interface RECISTSession {
  /** Session identifier */
  id: string;
  /** Patient ID */
  patientId: string;
  /** Patient name for display */
  patientName?: string;
  /** Disease/indication being tracked */
  indication?: string;
  /** Protocol/study name */
  protocolName?: string;
  /** All assessments in chronological order */
  assessments: RECISTAssessment[];
  /** Baseline assessment ID */
  baselineAssessmentId?: string;
  /** Current/latest assessment ID */
  currentAssessmentId?: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Session notes */
  notes?: string;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation result for lesion constraints.
 */
export interface RECISTValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors */
  errors: RECISTValidationError[];
  /** Validation warnings (non-blocking) */
  warnings: RECISTValidationWarning[];
}

/**
 * Validation error.
 */
export interface RECISTValidationError {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Related lesion ID if applicable */
  lesionId?: string;
  /** Related field name */
  field?: string;
}

/**
 * Validation warning (non-blocking).
 */
export interface RECISTValidationWarning {
  /** Warning code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Related lesion ID if applicable */
  lesionId?: string;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Anatomical regions for lesion classification.
 */
export const ANATOMICAL_REGIONS = [
  'Lung',
  'Liver',
  'Lymph Node - Cervical',
  'Lymph Node - Axillary',
  'Lymph Node - Mediastinal',
  'Lymph Node - Retroperitoneal',
  'Lymph Node - Inguinal',
  'Lymph Node - Other',
  'Bone',
  'Brain',
  'Adrenal',
  'Kidney',
  'Pancreas',
  'Spleen',
  'Peritoneum',
  'Soft Tissue',
  'Breast',
  'Skin',
  'Other',
] as const;

export type AnatomicalRegion = typeof ANATOMICAL_REGIONS[number];

/**
 * Check if an anatomical region is a lymph node.
 */
export function isLymphNodeRegion(region: string): boolean {
  return region.toLowerCase().startsWith('lymph node');
}

/**
 * Generate a unique lesion ID.
 */
export function generateLesionId(): string {
  return `recist-lesion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique assessment ID.
 */
export function generateAssessmentId(): string {
  return `recist-assessment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique session ID.
 */
export function generateRECISTSessionId(): string {
  return `recist-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get display label for overall response.
 */
export function getResponseLabel(response: RECISTOverallResponse): string {
  const labels: Record<RECISTOverallResponse, string> = {
    CR: 'Complete Response',
    PR: 'Partial Response',
    SD: 'Stable Disease',
    PD: 'Progressive Disease',
    NE: 'Not Evaluable',
  };
  return labels[response];
}

/**
 * Get color for response display.
 */
export function getResponseColor(response: RECISTOverallResponse): string {
  const colors: Record<RECISTOverallResponse, string> = {
    CR: '#22c55e', // Green
    PR: '#3b82f6', // Blue
    SD: '#eab308', // Yellow
    PD: '#ef4444', // Red
    NE: '#6b7280', // Gray
  };
  return colors[response];
}

/**
 * Get Tailwind color classes for response.
 */
export function getResponseColorClass(response: RECISTOverallResponse): {
  text: string;
  bg: string;
  border: string;
} {
  const classes: Record<RECISTOverallResponse, { text: string; bg: string; border: string }> = {
    CR: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    PR: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    SD: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    PD: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    NE: { text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
  };
  return classes[response];
}
