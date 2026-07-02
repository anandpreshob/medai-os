/**
 * Session Artifact Schema - Complete session export/import schema
 *
 * Defines the structure for exporting and importing complete session artifacts
 * including segmentations, measurements, provenance, and longitudinal data.
 */

import type {
  OncologyExportSchema,
  OncologyLesion,
  SegmentationProvenance,
  ReviewStatus,
} from './oncologyExportSchema';

// ============================================================================
// Segmentation Artifact Types
// ============================================================================

/**
 * Serialized segment data
 */
export interface SerializedSegment {
  /** Segment index (1-based) */
  segmentIndex: number;

  /** Segment label */
  label: string;

  /** Display color (hex) */
  color: string;

  /** Visibility state */
  visible: boolean;

  /** Lock state */
  locked: boolean;

  /** Associated volume ID */
  volumeId?: string;
}

/**
 * Serialized labelmap data
 */
export interface SerializedLabelmap {
  /** Base64-encoded compressed labelmap data */
  data: string;

  /** Data encoding format */
  encoding: 'base64-gzip' | 'base64-raw';

  /** Data type of the labelmap */
  dtype: 'uint8' | 'uint16' | 'int16';

  /** Dimensions [x, y, z] */
  dimensions: [number, number, number];

  /** Voxel spacing [x, y, z] in mm */
  spacing: [number, number, number];

  /** Origin [x, y, z] */
  origin: [number, number, number];

  /** Direction matrix (9 elements, row-major) */
  direction: number[];
}

/**
 * Complete segmentation artifact
 */
export interface SegmentationArtifact {
  /** Segmentation ID */
  id: string;

  /** Segmentation label */
  label: string;

  /** Review status */
  status: ReviewStatus;

  /** Reference image ID (for matching on import) */
  referenceImageId: string;

  /** Reference image SeriesInstanceUID (for DICOM matching) */
  referenceSeriesUID?: string;

  /** All segments in this segmentation */
  segments: SerializedSegment[];

  /** Serialized labelmap data */
  labelmap: SerializedLabelmap;

  /** Provenance information */
  provenance: SegmentationProvenance;

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  modifiedAt: string;
}

// ============================================================================
// Detection Artifact Types
// ============================================================================

/**
 * Detection bounding box
 */
export interface DetectionBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  zIndex?: number;
}

/**
 * Serialized detection
 */
export interface SerializedDetection {
  /** Detection ID */
  id: string;

  /** Detection label */
  label: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Bounding box */
  box: DetectionBox;

  /** Detection source ('ai' | 'manual') */
  source: 'ai' | 'manual';

  /** Model that produced this detection */
  modelName?: string;
}

// ============================================================================
// Findings Artifact Types
// ============================================================================

/**
 * Serialized findings
 */
export interface SerializedFindings {
  /** Image ID these findings relate to */
  imageId: string;

  /** Radiologist observations (free text) */
  radiologistObservations?: string;

  /** AI findings (structured) */
  aiFindings?: string;

  /** Clinical context */
  clinicalContext?: string;

  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Timepoint Artifact Types
// ============================================================================

/**
 * Single timepoint in a longitudinal session
 */
export interface TimepointArtifact {
  /** Timepoint ID */
  id: string;

  /** Order in session */
  order: number;

  /** Timepoint label (e.g., 'Baseline', 'Week 12') */
  label: string;

  /** Study date (YYYYMMDD) */
  studyDate?: string;

  /** Image ID */
  imageId: string;

  /** Study Instance UID */
  studyUID?: string;

  /** Series Instance UID */
  seriesUID?: string;

  /** Associated segmentation IDs */
  segmentationIds: string[];

  /** Notes */
  notes?: string;
}

// ============================================================================
// Longitudinal Session Artifact Types
// ============================================================================

/**
 * Complete longitudinal session artifact
 */
export interface LongitudinalSessionArtifact {
  /** Session ID */
  id: string;

  /** Patient ID */
  patientId: string;

  /** Patient name */
  patientName?: string;

  /** Modality */
  modality: string;

  /** Anatomy being tracked */
  anatomy: string;

  /** Session description */
  description?: string;

  /** Response assessment protocol (e.g., 'RECIST1.1', 'iRECIST') */
  responseAssessment?: string;

  /** Suite ID if associated with a clinical suite */
  suiteId?: string;

  /** All timepoints */
  timepoints: TimepointArtifact[];

  /** Created timestamp */
  createdAt: string;

  /** Last updated timestamp */
  updatedAt: string;
}

// ============================================================================
// Complete Session Artifact Schema
// ============================================================================

/**
 * Complete session artifact for export/import
 */
export interface SessionArtifactSchema {
  /** Schema version */
  version: '1.0.0';

  /** Artifact type identifier */
  artifactType: 'medai-session-artifact';

  /** ISO timestamp of export */
  exportTimestamp: string;

  /** Export source information */
  exportSource: {
    application: 'MedAI-Viewer';
    applicationVersion: string;
    hostname?: string;
    username?: string;
  };

  // ========================================
  // Core Artifacts
  // ========================================

  /** All segmentations in the session */
  segmentations: SegmentationArtifact[];

  /** All detections in the session */
  detections: Record<string, SerializedDetection[]>;

  /** Findings per image */
  findings: SerializedFindings[];

  // ========================================
  // Oncology-Specific Artifacts
  // ========================================

  /** Oncology measurements (if oncology suite) */
  oncologyMeasurements?: OncologyExportSchema;

  /** Lesion tracking across timepoints */
  lesionTracking?: {
    /** Map of lesion ID to linked lesion IDs across timepoints */
    linkages: Record<string, string[]>;

    /** Change metrics per lesion */
    changeMetrics: Record<
      string,
      {
        percentVolumeChange?: number;
        percentDiameterChange?: number;
        status: 'new' | 'resolved' | 'increased' | 'decreased' | 'stable';
      }
    >;
  };

  // ========================================
  // Longitudinal Session
  // ========================================

  /** Longitudinal session if multi-timepoint */
  longitudinalSession?: LongitudinalSessionArtifact;

  // ========================================
  // Metadata
  // ========================================

  /** Custom metadata key-value pairs */
  metadata?: Record<string, unknown>;

  /** Checksum for integrity verification */
  checksum?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty session artifact schema
 */
export function createEmptySessionArtifact(
  applicationVersion: string = '1.0.0'
): SessionArtifactSchema {
  return {
    version: '1.0.0',
    artifactType: 'medai-session-artifact',
    exportTimestamp: new Date().toISOString(),
    exportSource: {
      application: 'MedAI-Viewer',
      applicationVersion,
    },
    segmentations: [],
    detections: {},
    findings: [],
  };
}

/**
 * Validate a session artifact schema
 */
export function validateSessionArtifact(artifact: unknown): artifact is SessionArtifactSchema {
  if (!artifact || typeof artifact !== 'object') {
    return false;
  }

  const obj = artifact as Record<string, unknown>;

  // Check required fields
  if (obj.version !== '1.0.0') {
    console.warn('[SessionArtifact] Invalid version:', obj.version);
    return false;
  }

  if (obj.artifactType !== 'medai-session-artifact') {
    console.warn('[SessionArtifact] Invalid artifact type:', obj.artifactType);
    return false;
  }

  if (typeof obj.exportTimestamp !== 'string') {
    console.warn('[SessionArtifact] Missing export timestamp');
    return false;
  }

  if (!Array.isArray(obj.segmentations)) {
    console.warn('[SessionArtifact] Invalid segmentations field');
    return false;
  }

  return true;
}

/**
 * Calculate checksum for artifact integrity
 */
export async function calculateArtifactChecksum(artifact: SessionArtifactSchema): Promise<string> {
  // Create a copy without the checksum field
  const { checksum, ...artifactWithoutChecksum } = artifact;

  // Serialize deterministically
  const serialized = JSON.stringify(artifactWithoutChecksum, Object.keys(artifactWithoutChecksum).sort());

  // Calculate SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Verify artifact integrity
 */
export async function verifyArtifactIntegrity(artifact: SessionArtifactSchema): Promise<boolean> {
  if (!artifact.checksum) {
    console.warn('[SessionArtifact] No checksum present, cannot verify integrity');
    return true; // No checksum means no verification
  }

  const calculatedChecksum = await calculateArtifactChecksum(artifact);
  const isValid = calculatedChecksum === artifact.checksum;

  if (!isValid) {
    console.error('[SessionArtifact] Checksum mismatch! Expected:', artifact.checksum, 'Got:', calculatedChecksum);
  }

  return isValid;
}

export default SessionArtifactSchema;
