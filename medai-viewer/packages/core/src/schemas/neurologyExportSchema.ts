/**
 * Neurology Export Schema
 *
 * JSON schema and TypeScript types for neurology suite data exports.
 * Supports MS protocol, dementia, and stroke workflow exports.
 */

// ============================================================================
// Version
// ============================================================================

export const NEUROLOGY_EXPORT_VERSION = '1.0.0';

// ============================================================================
// Context Types
// ============================================================================

/**
 * Export context information
 */
export interface NeurologyExportContext {
  /** Schema version */
  version: typeof NEUROLOGY_EXPORT_VERSION;

  /** Patient identifier (may be anonymized) */
  patientId?: string;

  /** Study UID */
  studyUid?: string;

  /** Series descriptions included */
  seriesDescriptions?: string[];

  /** Primary modality */
  modality: 'MR' | 'CT';

  /** Clinical indication (if provided) */
  clinicalIndication?: string;

  /** Export timestamp */
  exportedAt: string;

  /** Exporting user */
  exportedBy?: string;

  /** Suite version */
  suiteVersion?: string;
}

// ============================================================================
// QC Types
// ============================================================================

/**
 * Image QC data for export
 */
export interface ImageQCExport {
  /** QC status */
  status: 'excellent' | 'good' | 'warning' | 'critical';

  /** Overall score (0-100) */
  score: number;

  /** Motion artifact score */
  motionScore?: number;

  /** SNR estimate */
  snrEstimate?: number;

  /** Coverage assessment */
  coveragePercent?: number;

  /** Skull strip quality */
  skullStripScore?: number;

  /** QC findings */
  findings: string[];

  /** Assessment method */
  method: 'automated' | 'manual' | 'hybrid';
}

/**
 * Segmentation QC data for export
 */
export interface SegmentationQCExport {
  /** Segment index */
  segmentIndex: number;

  /** Label */
  label: string;

  /** QC status */
  status: 'passed' | 'warning' | 'failed';

  /** Issues found */
  issues?: string[];

  /** Manual review performed */
  manuallyReviewed: boolean;
}

// ============================================================================
// Volumetric Types
// ============================================================================

/**
 * Brain volumetrics for export
 */
export interface BrainVolumetricsExport {
  /** Total intracranial volume (mL) */
  totalIntracranialVolume?: number;

  /** Brain parenchyma volume (mL) */
  brainParenchymaVolume?: number;

  /** Brain parenchymal fraction (%) */
  brainParenchymalFraction?: number;

  /** Gray matter volume (mL) */
  grayMatterVolume?: number;

  /** White matter volume (mL) */
  whiteMatterVolume?: number;

  /** CSF volume (mL) */
  csfVolume?: number;

  /** Ventricular volume (mL) */
  ventricularVolume?: number;

  /** Regional volumes */
  regionalVolumes?: RegionalVolumeExport[];
}

/**
 * Regional volume with normalization
 */
export interface RegionalVolumeExport {
  /** Region name */
  region: string;

  /** Brain region group */
  group: string;

  /** Hemisphere */
  hemisphere?: 'left' | 'right' | 'bilateral';

  /** Raw volume (mL) */
  volumeMl: number;

  /** ICV-normalized volume (per 1000 mL ICV) */
  normalizedVolume?: number;

  /** Percent of ICV */
  percentOfIcv?: number;

  /** Segment index */
  segmentIndex: number;
}

/**
 * Asymmetry index export
 */
export interface AsymmetryIndexExport {
  /** Region name (without L/R suffix) */
  region: string;

  /** Left hemisphere volume (mL) */
  leftVolumeMl: number;

  /** Right hemisphere volume (mL) */
  rightVolumeMl: number;

  /** Asymmetry index (%) */
  asymmetryPercent: number;

  /** Interpretation */
  interpretation: 'normal' | 'mild' | 'significant' | 'severe';
}

// ============================================================================
// Lesion Types
// ============================================================================

/**
 * Lesion metrics summary
 */
export interface LesionMetricsExport {
  /** Total lesion count */
  lesionCount: number;

  /** Total lesion volume (mL) */
  totalLesionVolume: number;

  /** Lesion load percent (of brain volume) */
  lesionLoadPercent?: number;

  /** Individual lesion data */
  lesions: LesionExport[];

  /** Counts by MS location (if applicable) */
  msLocationCounts?: {
    periventricular: number;
    juxtacortical: number;
    infratentorial: number;
    deepWhiteMatter: number;
  };
}

/**
 * Individual lesion export
 */
export interface LesionExport {
  /** Lesion ID/index */
  id: number;

  /** Label */
  label: string;

  /** Volume (mL) */
  volumeMl: number;

  /** Volume (mm³) */
  volumeMm3: number;

  /** Centroid coordinates [x, y, z] */
  centroid: [number, number, number];

  /** MS location classification */
  msLocation?: 'periventricular' | 'juxtacortical' | 'infratentorial' | 'deep_white_matter';

  /** Distance to ventricle (mm) */
  distanceToVentricleMm?: number;

  /** Distance to cortex (mm) */
  distanceToCortexMm?: number;

  /** Longitudinal status (if applicable) */
  longitudinalStatus?: 'new' | 'stable' | 'enlarging' | 'shrinking' | 'resolved';

  /** Volume change percent (if longitudinal) */
  volumeChangePercent?: number;
}

// ============================================================================
// Atrophy Types
// ============================================================================

/**
 * Atrophy analysis export
 */
export interface AtrophyAnalysisExport {
  /** Baseline study date */
  baselineDate?: string;

  /** Current study date */
  currentDate?: string;

  /** Interval in days */
  intervalDays: number;

  /** Whole brain atrophy rate (%/year) */
  wholeBrainAtrophyRate?: number;

  /** Regional atrophy data */
  regionalAtrophy: RegionalAtrophyExport[];
}

/**
 * Regional atrophy export
 */
export interface RegionalAtrophyExport {
  /** Region name */
  region: string;

  /** Baseline volume (mL) */
  baselineVolumeMl: number;

  /** Current volume (mL) */
  currentVolumeMl: number;

  /** Percent change */
  percentChange: number;

  /** Annualized rate (%/year) */
  annualizedRatePercent: number;

  /** Interpretation */
  interpretation: 'normal_aging' | 'accelerated' | 'pathological';
}

// ============================================================================
// Provenance Types
// ============================================================================

/**
 * Model provenance for segmentation
 */
export interface ModelProvenanceExport {
  /** Model name */
  name: string;

  /** Model version */
  version: string;

  /** Model parameters used */
  parameters?: Record<string, unknown>;

  /** Inference timestamp */
  timestamp: string;

  /** Inference duration (ms) */
  durationMs?: number;
}

/**
 * Edit record for provenance
 */
export interface EditRecordExport {
  /** Edit type */
  editType: 'brush' | 'eraser' | 'lasso' | 'smart_edit' | 'threshold' | 'merge' | 'split' | 'delete';

  /** Timestamp */
  timestamp: string;

  /** User who made the edit */
  username?: string;

  /** Affected segment indices */
  affectedSegments: number[];

  /** Description */
  description?: string;
}

/**
 * Reviewer information
 */
export interface ReviewerExport {
  /** Reviewer username */
  username: string;

  /** Review status */
  status: 'draft' | 'final';

  /** Review timestamp */
  timestamp: string;

  /** Review notes */
  notes?: string;
}

/**
 * Full provenance export
 */
export interface ProvenanceExport {
  /** Segmentation model info */
  segmentationModel: ModelProvenanceExport;

  /** Edit history */
  edits: EditRecordExport[];

  /** Reviewer info */
  reviewer?: ReviewerExport;

  /** QC assessment info */
  qcAssessment?: {
    status: string;
    score: number;
    assessedAt: string;
    assessedBy?: string;
  };
}

// ============================================================================
// Main Export Schema
// ============================================================================

/**
 * Complete neurology export schema
 */
export interface NeurologyExportSchema {
  /** Schema version */
  version: typeof NEUROLOGY_EXPORT_VERSION;

  /** Export context */
  context: NeurologyExportContext;

  /** Image QC data */
  qc?: {
    image?: ImageQCExport;
    segmentation?: SegmentationQCExport[];
  };

  /** Brain volumetrics */
  brainVolumetrics?: BrainVolumetricsExport;

  /** Asymmetry indices */
  asymmetryIndices?: AsymmetryIndexExport[];

  /** Lesion metrics */
  lesionMetrics?: LesionMetricsExport;

  /** Atrophy analysis (if longitudinal) */
  atrophyAnalysis?: AtrophyAnalysisExport;

  /** Provenance information */
  provenance?: ProvenanceExport;

  /** Mode-specific data */
  modeSpecific?: {
    /** Active mode */
    mode: 'general' | 'ms_protocol' | 'dementia' | 'stroke';

    /** MS-specific data */
    ms?: {
      lesionCountByLocation: Record<string, number>;
      totalLesionLoad: number;
      newLesionCount?: number;
      enlargingLesionCount?: number;
    };

    /** Dementia-specific data */
    dementia?: {
      hippocampalVolumes: { left: number; right: number };
      hippocampalAsymmetry: number;
      ventricularVolume: number;
      wholeBrainVolume: number;
      atrophyRate?: number;
    };

    /** Stroke-specific data */
    stroke?: {
      coreVolume: number;
      penumbraVolume?: number;
      mismatchRatio?: number;
      aspectsScore?: number;
    };
  };
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Create empty export schema with context
 */
export function createNeurologyExport(
  context: Partial<NeurologyExportContext>
): NeurologyExportSchema {
  return {
    version: NEUROLOGY_EXPORT_VERSION,
    context: {
      version: NEUROLOGY_EXPORT_VERSION,
      modality: context.modality || 'MR',
      exportedAt: new Date().toISOString(),
      ...context,
    },
  };
}

/**
 * Validate export schema
 */
export function validateNeurologyExport(data: unknown): data is NeurologyExportSchema {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (obj.version !== NEUROLOGY_EXPORT_VERSION) {
    console.warn(`Export schema version mismatch: expected ${NEUROLOGY_EXPORT_VERSION}, got ${obj.version}`);
  }

  return (
    typeof obj.version === 'string' &&
    typeof obj.context === 'object' &&
    obj.context !== null
  );
}

/**
 * Export to CSV format for MS trial table
 */
export function exportMSTrialTableCSV(schema: NeurologyExportSchema): string {
  const lesions = schema.lesionMetrics?.lesions || [];

  const headers = [
    'Lesion_ID',
    'Label',
    'Volume_mL',
    'Volume_mm3',
    'Location',
    'Distance_to_Ventricle_mm',
    'Status',
    'Volume_Change_Percent',
  ];

  const rows = lesions.map((lesion) => [
    lesion.id,
    lesion.label,
    lesion.volumeMl.toFixed(4),
    lesion.volumeMm3.toFixed(2),
    lesion.msLocation || 'unknown',
    lesion.distanceToVentricleMm?.toFixed(2) || '',
    lesion.longitudinalStatus || 'baseline',
    lesion.volumeChangePercent?.toFixed(1) || '',
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  // Add summary
  const summary = [
    '',
    `Total Lesion Count,${schema.lesionMetrics?.lesionCount || 0}`,
    `Total Lesion Volume (mL),${schema.lesionMetrics?.totalLesionVolume?.toFixed(4) || 0}`,
    `Periventricular Count,${schema.lesionMetrics?.msLocationCounts?.periventricular || 0}`,
    `Juxtacortical Count,${schema.lesionMetrics?.msLocationCounts?.juxtacortical || 0}`,
    `Infratentorial Count,${schema.lesionMetrics?.msLocationCounts?.infratentorial || 0}`,
    `Deep White Matter Count,${schema.lesionMetrics?.msLocationCounts?.deepWhiteMatter || 0}`,
  ];

  return csv + '\n' + summary.join('\n');
}
