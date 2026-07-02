/**
 * Lesion Correspondence Types
 *
 * Type definitions for lesion matching and correspondence tracking
 * across longitudinal timepoints.
 */

/**
 * Represents a single lesion instance at a specific timepoint.
 */
export interface LesionInstance {
  /** Timepoint ID from longitudinal session */
  timepointId: string;
  /** Segment index within the segmentation */
  segmentIndex: number;
  /** Centroid position in world coordinates (mm) [x, y, z] */
  centroidWorld: [number, number, number];
  /** Volume in cubic millimeters */
  volumeMm3: number;
  /** User-facing label (e.g., "Liver Lesion 1") */
  label: string;
  /** Longest axis diameter in mm */
  longestAxisMm?: number;
  /** Bounding box in world coordinates [[min], [max]] */
  boundingBoxWorld?: [[number, number, number], [number, number, number]];
  /** Image ID for this timepoint */
  imageId?: string;
  /** Segmentation ID containing this lesion */
  segmentationId?: string;
}

/**
 * Represents a correspondence/match between lesions across timepoints.
 * A correspondence tracks the "same" lesion as it evolves over time.
 */
export interface LesionCorrespondence {
  /** Unique correspondence ID */
  id: string;
  /** Canonical/display label for this lesion across all timepoints */
  canonicalLabel: string;
  /** Map of timepoint ID to lesion instance at that timepoint */
  instances: Map<string, LesionInstance>;
  /** Overall match confidence (0-1, weighted average) */
  matchConfidence: number;
  /** Primary method used for matching */
  matchMethod: LesionMatchMethod;
  /** Current verification status */
  status: LesionCorrespondenceStatus;
  /** Optional notes from radiologist */
  notes?: string;
  /** When correspondence was created */
  createdAt: number;
  /** When correspondence was last modified */
  updatedAt: number;
}

/**
 * Method used to establish lesion correspondence.
 */
export type LesionMatchMethod =
  | 'label'         // Exact label match (highest priority)
  | 'centroid'      // Centroid proximity in world coordinates
  | 'registration'  // Image registration-based alignment
  | 'manual';       // User-specified correspondence

/**
 * Verification status of a correspondence.
 */
export type LesionCorrespondenceStatus =
  | 'confirmed'   // Radiologist verified
  | 'pending'     // Awaiting review
  | 'rejected';   // Marked as incorrect match

/**
 * Configuration for lesion matching algorithms.
 */
export const MATCH_CONFIG = {
  /** Maximum distance (mm) for centroid-based matching */
  centroidProximityThresholdMm: 30,
  /** Minimum volume ratio for size similarity (0-1) */
  sizeSimilarityThreshold: 0.5,
  /** Confidence threshold for auto-confirmation */
  highConfidenceThreshold: 0.85,
  /** Weight for centroid proximity in combined score */
  centroidWeight: 0.6,
  /** Weight for size similarity in combined score */
  sizeWeight: 0.3,
  /** Weight for label match in combined score */
  labelWeight: 0.1,
  /** Maximum lesions to match per timepoint (performance limit) */
  maxLesionsPerTimepoint: 100,
} as const;

/**
 * Result of a single pairwise lesion match.
 */
export interface LesionMatchCandidate {
  /** Source lesion (typically from baseline) */
  sourceInstance: LesionInstance;
  /** Target lesion (typically from follow-up) */
  targetInstance: LesionInstance;
  /** Euclidean distance between centroids (mm) */
  centroidDistanceMm: number;
  /** Volume similarity score (0-1) */
  sizeSimilarity: number;
  /** Label match indicator */
  labelMatch: boolean;
  /** Combined confidence score (0-1) */
  confidence: number;
  /** Method that produced highest confidence */
  bestMethod: LesionMatchMethod;
}

/**
 * Input for lesion matching algorithm.
 */
export interface LesionMatchingInput {
  /** Session ID for context */
  sessionId: string;
  /** Baseline timepoint ID */
  baselineTimepointId: string;
  /** Follow-up timepoint IDs (in chronological order) */
  followUpTimepointIds: string[];
  /** All lesion instances grouped by timepoint */
  instancesByTimepoint: Map<string, LesionInstance[]>;
  /** Optional transformation matrices from registration */
  transformations?: Map<string, number[][]>;
}

/**
 * Output from lesion matching algorithm.
 */
export interface LesionMatchingResult {
  /** All established correspondences */
  correspondences: LesionCorrespondence[];
  /** Unmatched lesions by timepoint (potentially new or resolved) */
  unmatchedByTimepoint: Map<string, LesionInstance[]>;
  /** New lesions (present in follow-up but not baseline) */
  newLesions: LesionInstance[];
  /** Resolved lesions (present in baseline but not follow-up) */
  resolvedLesions: LesionInstance[];
  /** Overall matching statistics */
  statistics: LesionMatchingStatistics;
}

/**
 * Statistics from the matching process.
 */
export interface LesionMatchingStatistics {
  /** Total lesions at baseline */
  baselineLesionCount: number;
  /** Total lesions at latest follow-up */
  latestFollowUpLesionCount: number;
  /** Number of matched correspondences */
  matchedCount: number;
  /** Number of new lesions detected */
  newLesionCount: number;
  /** Number of resolved lesions */
  resolvedLesionCount: number;
  /** Average match confidence across all correspondences */
  averageConfidence: number;
  /** Count by match method */
  countByMethod: Record<LesionMatchMethod, number>;
  /** Count by status */
  countByStatus: Record<LesionCorrespondenceStatus, number>;
}

/**
 * Registration request for image alignment.
 */
export interface RegistrationRequest {
  /** Fixed/reference image (typically baseline) */
  fixedImageId: string;
  /** Moving image to be registered */
  movingImageId: string;
  /** Type of registration */
  registrationType: 'rigid' | 'affine' | 'deformable';
  /** Initial transform (optional) */
  initialTransform?: number[][];
}

/**
 * Registration result from server.
 */
export interface RegistrationResult {
  /** Success indicator */
  success: boolean;
  /** 4x4 transformation matrix (column-major) */
  transformMatrix: number[][];
  /** Inverse transformation matrix */
  inverseTransformMatrix: number[][];
  /** Registration quality metrics */
  metrics: {
    /** Mutual information score */
    mutualInformation?: number;
    /** Mean squared error */
    mse?: number;
    /** Normalized cross correlation */
    ncc?: number;
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Request to propagate/resample segmentation mask.
 */
export interface SegmentationPropagationRequest {
  /** Source mask image ID */
  sourceMaskId: string;
  /** Source reference image ID */
  sourceImageId: string;
  /** Target reference image ID */
  targetImageId: string;
  /** Transformation to apply */
  transformMatrix: number[][];
  /** Interpolation method */
  interpolation: 'nearest' | 'linear';
}

/**
 * Result of segmentation propagation.
 */
export interface SegmentationPropagationResult {
  /** Success indicator */
  success: boolean;
  /** Propagated mask data (NIfTI bytes) */
  maskData?: ArrayBuffer;
  /** Metadata about propagated segments */
  segments?: {
    index: number;
    label: string;
    volumeMm3: number;
  }[];
  /** Error message if failed */
  error?: string;
}

/**
 * Serializable version of LesionCorrespondence for persistence.
 * Converts Map to array of entries.
 */
export interface SerializedLesionCorrespondence {
  id: string;
  canonicalLabel: string;
  instances: [string, LesionInstance][];
  matchConfidence: number;
  matchMethod: LesionMatchMethod;
  status: LesionCorrespondenceStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Generate a unique correspondence ID.
 */
export function generateCorrespondenceId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Serialize a LesionCorrespondence for JSON storage.
 */
export function serializeCorrespondence(
  correspondence: LesionCorrespondence
): SerializedLesionCorrespondence {
  return {
    ...correspondence,
    instances: Array.from(correspondence.instances.entries()),
  };
}

/**
 * Deserialize a LesionCorrespondence from JSON storage.
 */
export function deserializeCorrespondence(
  serialized: SerializedLesionCorrespondence
): LesionCorrespondence {
  return {
    ...serialized,
    instances: new Map(serialized.instances),
  };
}

/**
 * Get display color for correspondence status.
 */
export function getStatusColor(status: LesionCorrespondenceStatus): string {
  switch (status) {
    case 'confirmed':
      return '#22c55e'; // Green
    case 'pending':
      return '#eab308'; // Yellow
    case 'rejected':
      return '#ef4444'; // Red
    default:
      return '#6b7280'; // Gray
  }
}

/**
 * Get display label for correspondence status.
 */
export function getStatusLabel(status: LesionCorrespondenceStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending Review';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Unknown';
  }
}

/**
 * Get display label for match method.
 */
export function getMatchMethodLabel(method: LesionMatchMethod): string {
  switch (method) {
    case 'label':
      return 'Label Match';
    case 'centroid':
      return 'Centroid Proximity';
    case 'registration':
      return 'Image Registration';
    case 'manual':
      return 'Manual Assignment';
    default:
      return 'Unknown';
  }
}
