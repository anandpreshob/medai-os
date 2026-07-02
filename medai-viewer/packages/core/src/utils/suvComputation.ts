/**
 * SUV (Standardized Uptake Value) Computation Utilities for PET Imaging
 *
 * SUV is a semi-quantitative measure of radiotracer uptake in PET imaging.
 * This module provides utilities for computing SUV metrics from PET images.
 *
 * SUV Formula: SUV = (Tissue Activity [Bq/ml]) / (Injected Dose [Bq] / Body Weight [g])
 *
 * Required DICOM tags:
 * - RadiopharmaceuticalStartTime (0018,1072) or RadiopharmaceuticalStartDateTime
 * - RadionuclideTotalDose (0018,1074) - Injected dose in Bq
 * - PatientWeight (0010,1030) - Body weight in kg
 * - DecayCorrection (0054,1102) - Whether decay correction was applied
 * - AcquisitionTime or SeriesTime - Time of image acquisition
 * - RescaleSlope and RescaleIntercept for converting to activity
 */

// ============================================================================
// Types
// ============================================================================

/**
 * DICOM PET metadata required for SUV calculation
 */
export interface PETDicomMetadata {
  // Patient info
  patientWeight?: number; // kg
  patientHeight?: number; // cm (for lean body mass calculation)
  patientSex?: 'M' | 'F' | 'O';

  // Radiopharmaceutical info
  radiopharmaceuticalStartTime?: string; // HH:MM:SS or datetime
  radiopharmaceuticalStartDateTime?: string; // Full datetime
  radionuclideTotalDose?: number; // Bq
  radionuclideHalfLife?: number; // seconds (F-18 = 6586.2s = 109.77 min)
  radionuclideCode?: string; // e.g., "C-111A1" for F-18

  // Image timing
  acquisitionTime?: string;
  acquisitionDateTime?: string;
  seriesTime?: string;
  seriesDate?: string;

  // Decay correction
  decayCorrection?: 'NONE' | 'START' | 'ADMIN';

  // Rescale parameters (for converting stored values to activity)
  rescaleSlope?: number;
  rescaleIntercept?: number;
  units?: string; // BQML, CNTS, etc.

  // Pixel spacing for volume calculations
  pixelSpacing?: [number, number]; // mm
  sliceThickness?: number; // mm
}

/**
 * SUV normalization methods
 */
export type SUVNormalizationMethod = 'bw' | 'lbm' | 'bsa';

/**
 * SUV metrics for a single lesion/segment
 */
export interface SUVMetrics {
  /** Label of the segment/lesion */
  segmentLabel: string;
  /** Segment index in the mask */
  segmentIndex: number;
  /** Maximum SUV value in the lesion */
  suvMax: number;
  /** Mean SUV value in the lesion */
  suvMean: number;
  /** SUV in 1cm^3 sphere around the max voxel */
  suvPeak: number;
  /** Metabolic tumor volume (MTV) - volume where SUV > threshold in cm^3 */
  metabolicVolume: number;
  /** Total Lesion Glycolysis (TLG) = SUVmean x Metabolic Volume */
  totalLesionGlycolysis: number;
  /** Minimum SUV in lesion */
  suvMin: number;
  /** Standard deviation of SUV values */
  suvStd: number;
  /** Total voxel count in the segment */
  voxelCount: number;
  /** Total volume in cm^3 */
  volumeCm3: number;
  /** Location of max SUV voxel [i, j, k] */
  maxLocation?: [number, number, number];
}

/**
 * Complete SUV computation result
 */
export interface SUVComputationResult {
  /** SUV metrics per segment */
  segments: SUVMetrics[];
  /** Computation metadata */
  metadata: {
    normalizationMethod: SUVNormalizationMethod;
    suvThreshold: number;
    patientWeight: number;
    injectedDose: number;
    decayFactor: number;
    decayCorrected: boolean;
    computationTime: number;
    sphereRadiusMm: number; // For SUVpeak calculation (typically ~6.2mm for 1cm^3)
  };
  /** Any errors or warnings */
  warnings?: string[];
}

/**
 * Parameters for SUV estimation (frontend computation)
 */
export interface SUVEstimationParams {
  /** SUV normalization method (default: 'bw' for body weight) */
  normalizationMethod?: SUVNormalizationMethod;
  /** Threshold for metabolic volume calculation (default: 2.5) */
  suvThreshold?: number;
  /** Segment labels mapping index to name */
  segmentLabels?: Record<string, string>;
  /** Custom patient weight override (kg) */
  patientWeightOverride?: number;
  /** Custom injected dose override (Bq) */
  injectedDoseOverride?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** F-18 half-life in seconds (109.77 minutes) */
export const F18_HALF_LIFE_SECONDS = 6586.2;

/** Default SUV threshold for metabolic volume */
export const DEFAULT_SUV_THRESHOLD = 2.5;

/** Sphere radius for SUVpeak (1 cm^3 sphere has radius ~6.2mm) */
export const SUV_PEAK_SPHERE_RADIUS_MM = 6.2035; // (3/(4*pi))^(1/3) * 10

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse DICOM time string to seconds since midnight
 * Supports formats: HHMMSS, HHMMSS.ffffff, HH:MM:SS
 */
export function parseDicomTime(timeStr: string): number {
  if (!timeStr) return 0;

  // Remove any leading/trailing whitespace
  timeStr = timeStr.trim();

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeStr.includes(':')) {
    // Format: HH:MM:SS or HH:MM:SS.ffffff
    const parts = timeStr.split(':');
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
    seconds = parseFloat(parts[2]) || 0;
  } else {
    // Format: HHMMSS or HHMMSS.ffffff
    hours = parseInt(timeStr.substring(0, 2), 10) || 0;
    minutes = parseInt(timeStr.substring(2, 4), 10) || 0;
    seconds = parseFloat(timeStr.substring(4)) || 0;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Calculate decay factor from injection time to scan time
 * DecayFactor = e^(-lambda * t) where lambda = ln(2) / halfLife
 */
export function calculateDecayFactor(
  injectionTimeSeconds: number,
  scanTimeSeconds: number,
  halfLifeSeconds: number
): number {
  // Handle case where scan is on next day
  let elapsedSeconds = scanTimeSeconds - injectionTimeSeconds;
  if (elapsedSeconds < 0) {
    elapsedSeconds += 86400; // Add 24 hours
  }

  const lambda = Math.LN2 / halfLifeSeconds;
  return Math.exp(-lambda * elapsedSeconds);
}

/**
 * Calculate lean body mass using James formula
 * LBM (kg) for males: 1.1 * weight - 128 * (weight/height)^2
 * LBM (kg) for females: 1.07 * weight - 148 * (weight/height)^2
 */
export function calculateLeanBodyMass(
  weightKg: number,
  heightCm: number,
  sex: 'M' | 'F' | 'O'
): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  if (sex === 'M') {
    return 1.1 * weightKg - 128 * Math.pow(weightKg / heightCm, 2);
  } else {
    return 1.07 * weightKg - 148 * Math.pow(weightKg / heightCm, 2);
  }
}

/**
 * Calculate body surface area using Du Bois formula
 * BSA (m^2) = 0.007184 * weight^0.425 * height^0.725
 */
export function calculateBodySurfaceArea(
  weightKg: number,
  heightCm: number
): number {
  return 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
}

/**
 * Get normalization factor based on method
 * Returns the factor to divide injected dose by (in grams for bw, kg for lbm, m^2 for bsa)
 */
export function getNormalizationFactor(
  method: SUVNormalizationMethod,
  weightKg: number,
  heightCm?: number,
  sex?: 'M' | 'F' | 'O'
): number {
  switch (method) {
    case 'bw':
      // Body weight in grams
      return weightKg * 1000;
    case 'lbm':
      // Lean body mass in kg
      if (!heightCm || !sex) {
        console.warn('[SUV] LBM calculation requires height and sex, falling back to body weight');
        return weightKg * 1000;
      }
      return calculateLeanBodyMass(weightKg, heightCm, sex) * 1000;
    case 'bsa':
      // Body surface area in m^2
      if (!heightCm) {
        console.warn('[SUV] BSA calculation requires height, falling back to body weight');
        return weightKg * 1000;
      }
      return calculateBodySurfaceArea(weightKg, heightCm);
    default:
      return weightKg * 1000;
  }
}

/**
 * Convert raw pixel values to activity concentration (Bq/ml)
 */
export function pixelToActivity(
  pixelValue: number,
  rescaleSlope: number = 1,
  rescaleIntercept: number = 0
): number {
  return pixelValue * rescaleSlope + rescaleIntercept;
}

/**
 * Calculate SUV from activity concentration
 * SUV = Activity (Bq/ml) / (Injected Dose (Bq) / Normalization Factor)
 */
export function calculateSUV(
  activityBqMl: number,
  injectedDoseBq: number,
  normalizationFactor: number,
  decayFactor: number = 1
): number {
  if (injectedDoseBq <= 0 || normalizationFactor <= 0) {
    return 0;
  }
  // Correct for decay if not already decay-corrected
  const correctedDose = injectedDoseBq * decayFactor;
  return activityBqMl / (correctedDose / normalizationFactor);
}

/**
 * Check if an image is PET modality
 */
export function isPETModality(modality?: string): boolean {
  if (!modality) return false;
  const normalized = modality.toUpperCase().trim();
  return normalized === 'PT' || normalized === 'PET';
}

/**
 * DICOM tag value structure (simplified)
 */
interface DicomTagValue {
  Value?: unknown[];
}

/**
 * Helper to safely extract value from DICOM tag
 */
function getTagValue<T>(dicomTags: Record<string, unknown>, tagId: string, index: number = 0): T | undefined {
  const tag = dicomTags[tagId] as DicomTagValue | undefined;
  if (!tag?.Value || !Array.isArray(tag.Value)) return undefined;
  return tag.Value[index] as T | undefined;
}

/**
 * Helper to safely extract array value from DICOM tag
 */
function getTagArrayValue<T>(dicomTags: Record<string, unknown>, tagId: string): T | undefined {
  const tag = dicomTags[tagId] as DicomTagValue | undefined;
  if (!tag?.Value || !Array.isArray(tag.Value)) return undefined;
  return tag.Value as T;
}

/**
 * Extract PET metadata from generic DICOM metadata object
 */
export function extractPETMetadata(dicomTags: Record<string, unknown>): PETDicomMetadata {
  return {
    patientWeight: getTagValue<number>(dicomTags, '00101030'),
    patientHeight: getTagValue<number>(dicomTags, '00101020'),
    patientSex: getTagValue<'M' | 'F' | 'O'>(dicomTags, '00100040'),
    radiopharmaceuticalStartTime: getTagValue<string>(dicomTags, '00181072'),
    radiopharmaceuticalStartDateTime: getTagValue<string>(dicomTags, '00181078'),
    radionuclideTotalDose: getTagValue<number>(dicomTags, '00181074'),
    radionuclideHalfLife: getTagValue<number>(dicomTags, '00181075'),
    acquisitionTime: getTagValue<string>(dicomTags, '00080032'),
    acquisitionDateTime: getTagValue<string>(dicomTags, '0008002A'),
    seriesTime: getTagValue<string>(dicomTags, '00080031'),
    seriesDate: getTagValue<string>(dicomTags, '00080021'),
    decayCorrection: getTagValue<'NONE' | 'START' | 'ADMIN'>(dicomTags, '00541102'),
    rescaleSlope: getTagValue<number>(dicomTags, '00281053'),
    rescaleIntercept: getTagValue<number>(dicomTags, '00281052'),
    units: getTagValue<string>(dicomTags, '00541001'),
    pixelSpacing: getTagArrayValue<[number, number]>(dicomTags, '00280030'),
    sliceThickness: getTagValue<number>(dicomTags, '00180050'),
  };
}

/**
 * Validate PET metadata for SUV computation
 */
export function validatePETMetadata(
  metadata: PETDicomMetadata,
  params?: SUVEstimationParams
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  const weight = params?.patientWeightOverride ?? metadata.patientWeight;
  if (!weight || weight <= 0) {
    errors.push('Patient weight is required for SUV calculation');
  }

  const dose = params?.injectedDoseOverride ?? metadata.radionuclideTotalDose;
  if (!dose || dose <= 0) {
    errors.push('Injected dose (RadionuclideTotalDose) is required for SUV calculation');
  }

  // Check timing info
  const hasInjectionTime = metadata.radiopharmaceuticalStartTime || metadata.radiopharmaceuticalStartDateTime;
  const hasScanTime = metadata.acquisitionTime || metadata.acquisitionDateTime || metadata.seriesTime;

  if (!hasInjectionTime) {
    warnings.push('Radiopharmaceutical start time not found - decay correction may be inaccurate');
  }

  if (!hasScanTime) {
    warnings.push('Acquisition time not found - decay correction may be inaccurate');
  }

  // Check decay correction
  if (metadata.decayCorrection === 'NONE') {
    warnings.push('Image is not decay-corrected - manual decay correction will be applied');
  }

  // Check for LBM/BSA requirements if needed
  if (params?.normalizationMethod === 'lbm' && !metadata.patientHeight) {
    warnings.push('Patient height not found - falling back to body weight normalization');
  }

  if (params?.normalizationMethod === 'bsa' && !metadata.patientHeight) {
    warnings.push('Patient height not found - falling back to body weight normalization');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Frontend SUV Estimation (for display before server computation)
// ============================================================================

/**
 * Estimate SUV statistics from pixel data (frontend approximation)
 * This provides quick estimates before full server-side computation
 */
export function estimateSUVFromPixelData(
  pixelData: Float32Array | Uint16Array | Int16Array,
  maskData: Uint8Array | Uint16Array,
  segmentIndex: number,
  petMetadata: PETDicomMetadata,
  params?: SUVEstimationParams
): Partial<SUVMetrics> | null {
  const weight = params?.patientWeightOverride ?? petMetadata.patientWeight;
  const dose = params?.injectedDoseOverride ?? petMetadata.radionuclideTotalDose;

  if (!weight || !dose) {
    return null;
  }

  // Get normalization factor
  const normMethod = params?.normalizationMethod ?? 'bw';
  const normFactor = getNormalizationFactor(
    normMethod,
    weight,
    petMetadata.patientHeight,
    petMetadata.patientSex
  );

  // Calculate decay factor
  let decayFactor = 1;
  const injectionTime = petMetadata.radiopharmaceuticalStartTime || petMetadata.radiopharmaceuticalStartDateTime;
  const scanTime = petMetadata.acquisitionTime || petMetadata.acquisitionDateTime || petMetadata.seriesTime;
  const halfLife = petMetadata.radionuclideHalfLife ?? F18_HALF_LIFE_SECONDS;

  if (injectionTime && scanTime && petMetadata.decayCorrection !== 'START') {
    const injSec = parseDicomTime(injectionTime);
    const scanSec = parseDicomTime(scanTime);
    decayFactor = calculateDecayFactor(injSec, scanSec, halfLife);
  }

  // Get rescale parameters
  const slope = petMetadata.rescaleSlope ?? 1;
  const intercept = petMetadata.rescaleIntercept ?? 0;

  // Collect SUV values for the segment
  const suvValues: number[] = [];
  let maxSuv = -Infinity;
  let minSuv = Infinity;
  let sumSuv = 0;

  for (let i = 0; i < maskData.length; i++) {
    if (maskData[i] === segmentIndex) {
      const activity = pixelToActivity(pixelData[i], slope, intercept);
      const suv = calculateSUV(activity, dose, normFactor, decayFactor);

      suvValues.push(suv);
      sumSuv += suv;
      if (suv > maxSuv) maxSuv = suv;
      if (suv < minSuv) minSuv = suv;
    }
  }

  if (suvValues.length === 0) {
    return null;
  }

  const suvMean = sumSuv / suvValues.length;

  // Calculate standard deviation
  let sumSquaredDiff = 0;
  for (const suv of suvValues) {
    sumSquaredDiff += Math.pow(suv - suvMean, 2);
  }
  const suvStd = Math.sqrt(sumSquaredDiff / suvValues.length);

  return {
    suvMax: maxSuv,
    suvMean,
    suvMin: minSuv,
    suvStd,
    voxelCount: suvValues.length,
  };
}

/**
 * Format SUV value for display
 */
export function formatSUV(value: number, decimals: number = 2): string {
  if (!isFinite(value)) return 'N/A';
  return value.toFixed(decimals);
}

/**
 * Format metabolic volume for display
 */
export function formatMetabolicVolume(volumeCm3: number): string {
  if (volumeCm3 < 0.1) {
    return `${(volumeCm3 * 1000).toFixed(1)} mm\u00B3`;
  }
  return `${volumeCm3.toFixed(2)} cm\u00B3`;
}

/**
 * Format TLG for display
 */
export function formatTLG(tlg: number): string {
  if (tlg < 1) {
    return tlg.toFixed(3);
  }
  if (tlg < 100) {
    return tlg.toFixed(2);
  }
  return tlg.toFixed(1);
}

/**
 * Get SUV interpretation/classification
 */
export function classifySUV(suvMax: number): {
  level: 'low' | 'moderate' | 'high' | 'very-high';
  description: string;
} {
  if (suvMax < 2.5) {
    return { level: 'low', description: 'Below metabolic threshold' };
  }
  if (suvMax < 5) {
    return { level: 'moderate', description: 'Mildly increased uptake' };
  }
  if (suvMax < 10) {
    return { level: 'high', description: 'Significantly increased uptake' };
  }
  return { level: 'very-high', description: 'Intensely increased uptake' };
}
