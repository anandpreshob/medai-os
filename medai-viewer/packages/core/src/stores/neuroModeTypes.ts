/**
 * Neuro Mode Types
 *
 * TypeScript types for disease-specific neurology workflow modes:
 * - MS Protocol (Multiple Sclerosis)
 * - Dementia Assessment
 * - Stroke Evaluation
 * - General Neuro
 */

// ============================================================================
// Mode Types
// ============================================================================

/**
 * Neurology workflow mode identifiers
 */
export type NeuroMode =
  | 'general'       // General neuroimaging
  | 'ms_protocol'   // Multiple Sclerosis protocol
  | 'dementia'      // Dementia assessment
  | 'stroke';       // Stroke evaluation

/**
 * Mode configuration
 */
export interface NeuroModeConfig {
  /** Mode identifier */
  id: NeuroMode;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Icon name (Lucide) */
  icon: string;

  /** Preferred segmentation tasks */
  preferredTasks: string[];

  /** Preferred layout */
  preferredLayout: string;

  /** Emphasized brain regions */
  emphasizedRegions: string[];

  /** Metrics to display */
  metrics: string[];

  /** Export template */
  exportTemplate?: string;
}

/**
 * Mode configurations
 */
export const NEURO_MODE_CONFIGS: Record<NeuroMode, NeuroModeConfig> = {
  general: {
    id: 'general',
    name: 'General Neuro',
    description: 'General neuroimaging workflow',
    icon: 'Brain',
    preferredTasks: ['brain_parcellation', 'interactive_neuro'],
    preferredLayout: 'fourUp',
    emphasizedRegions: [],
    metrics: ['volume', 'lesion_count', 'brain_volumetrics'],
  },
  ms_protocol: {
    id: 'ms_protocol',
    name: 'MS Protocol',
    description: 'Multiple Sclerosis lesion tracking and analysis',
    icon: 'Activity',
    preferredTasks: ['ms_lesion', 'brain_parcellation'],
    preferredLayout: 'sequence-2x2',
    emphasizedRegions: ['white_matter', 'periventricular', 'juxtacortical', 'infratentorial'],
    metrics: [
      'lesion_count',
      'total_lesion_volume',
      'new_lesion_count',
      'enlarging_lesion_count',
      'lesion_load_percent',
      'periventricular_count',
      'juxtacortical_count',
      'infratentorial_count',
    ],
    exportTemplate: 'ms_trial_table',
  },
  dementia: {
    id: 'dementia',
    name: 'Dementia',
    description: 'Dementia and atrophy assessment',
    icon: 'TrendingDown',
    preferredTasks: ['brain_parcellation'],
    preferredLayout: 'fourUp',
    emphasizedRegions: ['hippocampus', 'temporal_lobe', 'ventricles', 'whole_brain'],
    metrics: [
      'hippocampal_volume',
      'hippocampal_asymmetry',
      'ventricular_volume',
      'whole_brain_volume',
      'brain_parenchymal_fraction',
      'atrophy_rate',
    ],
    exportTemplate: 'dementia_report',
  },
  stroke: {
    id: 'stroke',
    name: 'Stroke',
    description: 'Acute and chronic stroke assessment',
    icon: 'AlertTriangle',
    preferredTasks: ['stroke_lesion'],
    preferredLayout: 'dwi-adc-compare',
    emphasizedRegions: ['dwi_lesion', 'adc_lesion', 'penumbra'],
    metrics: ['core_volume', 'penumbra_volume', 'dwi_adc_mismatch', 'aspects_score'],
    exportTemplate: 'stroke_report',
  },
};

// ============================================================================
// ICV Normalization Types
// ============================================================================

/**
 * Intracranial Volume (ICV) data
 */
export interface ICVData {
  /** ICV in mL */
  volumeMl: number;

  /** Method used to estimate ICV */
  method: 'segmentation' | 'atlas_scaling' | 'manual';

  /** Confidence/quality score (0-1) */
  confidence?: number;

  /** Timestamp when computed */
  computedAt: string;
}

/**
 * ICV-normalized volume
 */
export interface NormalizedVolume {
  /** Raw volume in mL */
  rawVolumeMl: number;

  /** Normalized volume (per 1000 mL ICV) */
  normalizedVolume: number;

  /** ICV used for normalization */
  icvMl: number;

  /** Percent of ICV */
  percentOfIcv: number;
}

// ============================================================================
// Asymmetry Index Types
// ============================================================================

/**
 * Asymmetry interpretation
 */
export type AsymmetryInterpretation =
  | 'normal'      // |AI| < 5%
  | 'mild'        // |AI| 5-10%
  | 'significant' // |AI| > 10%
  | 'severe';     // |AI| > 20%

/**
 * Asymmetry index result
 */
export interface AsymmetryIndex {
  /** Region name */
  region: string;

  /** Left hemisphere volume (mL) */
  leftVolumeMl: number;

  /** Right hemisphere volume (mL) */
  rightVolumeMl: number;

  /** Asymmetry index percentage (positive = left larger) */
  asymmetryPercent: number;

  /** Interpretation */
  interpretation: AsymmetryInterpretation;

  /** Dominant hemisphere */
  dominantSide: 'left' | 'right' | 'symmetric';
}

/**
 * Calculate asymmetry index
 */
export function calculateAsymmetryIndex(leftVol: number, rightVol: number): number {
  const mean = (leftVol + rightVol) / 2;
  if (mean === 0) return 0;
  return ((leftVol - rightVol) / mean) * 100;
}

/**
 * Interpret asymmetry index
 */
export function interpretAsymmetry(asymmetryPercent: number): AsymmetryInterpretation {
  const absAI = Math.abs(asymmetryPercent);
  if (absAI < 5) return 'normal';
  if (absAI < 10) return 'mild';
  if (absAI < 20) return 'significant';
  return 'severe';
}

// ============================================================================
// Lesion Classification Types
// ============================================================================

/**
 * MS-style lesion location classification
 */
export type MSLesionLocation =
  | 'periventricular'    // Within 3mm of lateral ventricles
  | 'juxtacortical'      // Within 3mm of cortical gray matter
  | 'infratentorial'     // Brainstem, cerebellum
  | 'deep_white_matter'  // All other white matter
  | 'cortical'           // Within cortex
  | 'spinal_cord';       // Spinal cord lesions

/**
 * Vascular lesion classification
 */
export type VascularLesionLocation =
  | 'deep_gray'          // Basal ganglia, thalamus
  | 'subcortical'        // Subcortical white matter
  | 'periventricular'    // Periventricular
  | 'brainstem'          // Brainstem
  | 'cerebellum';        // Cerebellum

/**
 * Lesion with location classification
 */
export interface ClassifiedLesion {
  /** Lesion ID (segment index) */
  id: number;

  /** Lesion label */
  label: string;

  /** Volume in mL */
  volumeMl: number;

  /** Centroid coordinates [x, y, z] */
  centroid: [number, number, number];

  /** MS-style classification */
  msLocation?: MSLesionLocation;

  /** Vascular-style classification */
  vascularLocation?: VascularLesionLocation;

  /** Distance to nearest ventricle (mm) */
  distanceToVentricle?: number;

  /** Distance to nearest cortex (mm) */
  distanceToCortex?: number;
}

// ============================================================================
// Regional Grouping Types
// ============================================================================

/**
 * Brain region group for organized display
 */
export type BrainRegionGroup =
  | 'frontal'
  | 'temporal'
  | 'parietal'
  | 'occipital'
  | 'subcortical'
  | 'cerebellum'
  | 'brainstem'
  | 'ventricles'
  | 'white_matter'
  | 'other';

/**
 * Region with grouping
 */
export interface GroupedRegion {
  /** Region name */
  name: string;

  /** Parent group */
  group: BrainRegionGroup;

  /** Hemisphere (if applicable) */
  hemisphere?: 'left' | 'right' | 'bilateral';

  /** Volume in mL */
  volumeMl: number;

  /** ICV-normalized volume */
  normalizedVolume?: number;

  /** Segment index */
  segmentIndex: number;

  /** Color for visualization */
  color?: string;
}

/**
 * Region grouping configuration
 */
export const REGION_GROUP_CONFIG: Record<string, { group: BrainRegionGroup; hemisphere?: 'left' | 'right' }> = {
  // Frontal
  'frontal_lobe_left': { group: 'frontal', hemisphere: 'left' },
  'frontal_lobe_right': { group: 'frontal', hemisphere: 'right' },
  'prefrontal_left': { group: 'frontal', hemisphere: 'left' },
  'prefrontal_right': { group: 'frontal', hemisphere: 'right' },

  // Temporal
  'temporal_lobe_left': { group: 'temporal', hemisphere: 'left' },
  'temporal_lobe_right': { group: 'temporal', hemisphere: 'right' },
  'hippocampus_left': { group: 'temporal', hemisphere: 'left' },
  'hippocampus_right': { group: 'temporal', hemisphere: 'right' },
  'amygdala_left': { group: 'temporal', hemisphere: 'left' },
  'amygdala_right': { group: 'temporal', hemisphere: 'right' },

  // Parietal
  'parietal_lobe_left': { group: 'parietal', hemisphere: 'left' },
  'parietal_lobe_right': { group: 'parietal', hemisphere: 'right' },

  // Occipital
  'occipital_lobe_left': { group: 'occipital', hemisphere: 'left' },
  'occipital_lobe_right': { group: 'occipital', hemisphere: 'right' },

  // Subcortical
  'thalamus_left': { group: 'subcortical', hemisphere: 'left' },
  'thalamus_right': { group: 'subcortical', hemisphere: 'right' },
  'caudate_left': { group: 'subcortical', hemisphere: 'left' },
  'caudate_right': { group: 'subcortical', hemisphere: 'right' },
  'putamen_left': { group: 'subcortical', hemisphere: 'left' },
  'putamen_right': { group: 'subcortical', hemisphere: 'right' },
  'globus_pallidus_left': { group: 'subcortical', hemisphere: 'left' },
  'globus_pallidus_right': { group: 'subcortical', hemisphere: 'right' },

  // Cerebellum
  'cerebellum_left': { group: 'cerebellum', hemisphere: 'left' },
  'cerebellum_right': { group: 'cerebellum', hemisphere: 'right' },
  'cerebellar_vermis': { group: 'cerebellum' },

  // Brainstem
  'brainstem': { group: 'brainstem' },
  'midbrain': { group: 'brainstem' },
  'pons': { group: 'brainstem' },
  'medulla': { group: 'brainstem' },

  // Ventricles
  'lateral_ventricle_left': { group: 'ventricles', hemisphere: 'left' },
  'lateral_ventricle_right': { group: 'ventricles', hemisphere: 'right' },
  'third_ventricle': { group: 'ventricles' },
  'fourth_ventricle': { group: 'ventricles' },

  // White Matter
  'white_matter_left': { group: 'white_matter', hemisphere: 'left' },
  'white_matter_right': { group: 'white_matter', hemisphere: 'right' },
  'corpus_callosum': { group: 'white_matter' },
};

/**
 * Get group display name
 */
export function getGroupDisplayName(group: BrainRegionGroup): string {
  const names: Record<BrainRegionGroup, string> = {
    frontal: 'Frontal Lobe',
    temporal: 'Temporal Lobe',
    parietal: 'Parietal Lobe',
    occipital: 'Occipital Lobe',
    subcortical: 'Subcortical Structures',
    cerebellum: 'Cerebellum',
    brainstem: 'Brainstem',
    ventricles: 'Ventricles',
    white_matter: 'White Matter',
    other: 'Other',
  };
  return names[group];
}

// ============================================================================
// Atrophy Analysis Types
// ============================================================================

/**
 * Atrophy rate interpretation
 */
export type AtrophyInterpretation =
  | 'normal_aging'        // Within expected range for age
  | 'accelerated'         // Faster than normal
  | 'pathological';       // Consistent with disease

/**
 * Atrophy analysis result
 */
export interface AtrophyAnalysis {
  /** Region name */
  region: string;

  /** Baseline volume (mL) */
  baselineVolumeMl: number;

  /** Current volume (mL) */
  currentVolumeMl: number;

  /** Interval in days */
  intervalDays: number;

  /** Percent change */
  percentChange: number;

  /** Annualized atrophy rate (%/year) */
  annualizedRate: number;

  /** Interpretation */
  interpretation: AtrophyInterpretation;
}

/**
 * Reference atrophy rates by region and age group
 */
export const ATROPHY_REFERENCE_RATES: Record<string, { normal: [number, number]; pathological: number }> = {
  whole_brain_20_60: { normal: [0.2, 0.5], pathological: 1.0 },
  whole_brain_60_plus: { normal: [0.5, 1.0], pathological: 1.5 },
  hippocampus_normal: { normal: [0.5, 1.5], pathological: 3.0 },
  hippocampus_ad: { normal: [3.0, 6.0], pathological: 6.0 },
};

/**
 * Calculate annualized atrophy rate
 */
export function calculateAnnualAtrophyRate(
  baselineVolume: number,
  currentVolume: number,
  intervalDays: number
): number {
  if (baselineVolume === 0 || intervalDays === 0) return 0;
  const percentChange = ((baselineVolume - currentVolume) / baselineVolume) * 100;
  return percentChange * (365 / intervalDays);
}
