/**
 * Analytics Service for Volumetrics, Radiomics, and SUV Computation
 * Handles communication with MedAI server for computing volumetric measurements,
 * radiomics features, and SUV metrics from segmentation masks.
 */

import { VolumetricsResult, RadiomicsResult, SUVResult } from '../stores/analyticsStore';
import { compressGzip } from './LabelExportService';
import { isFeatureEnabled } from '../features/registry';

/**
 * Check if data is already gzipped by looking for gzip magic bytes (0x1f 0x8b)
 */
function isGzipped(data: ArrayBuffer): boolean {
  const view = new Uint8Array(data);
  return view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b;
}

/**
 * Ensure data is gzipped - only compress if not already gzipped
 */
async function ensureGzipped(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (isGzipped(data)) {
    return data;
  }
  return compressGzip(data);
}

export interface AnalyticsParams {
  segmentLabels: Record<string, string>;
  spacing?: [number, number, number];
}

export interface RadiomicsSettings {
  binWidth?: number;
  resampledPixelSpacing?: number[] | null;
}

/**
 * Parameters for SUV computation
 */
export interface SUVComputationParams {
  /** Segment labels mapping index to name */
  segmentLabels: Record<string, string>;
  /** Patient body weight in kg (required) */
  patientWeightKg: number;
  /** Injected dose in Bq (required) */
  injectedDoseBq: number;
  /** Normalization method: 'bw' (body weight), 'lbm' (lean body mass), 'bsa' (body surface area) */
  normalizationMethod?: 'bw' | 'lbm' | 'bsa';
  /** SUV threshold for metabolic volume (default: 2.5) */
  suvThreshold?: number;
  /** Radionuclide half-life in seconds (default: F-18 = 6586.2s) */
  halfLifeSeconds?: number;
  /** Injection time string (HHMMSS or HH:MM:SS) */
  injectionTime?: string;
  /** Scan time string (HHMMSS or HH:MM:SS) */
  scanTime?: string;
  /** Whether image is already decay corrected */
  decayCorrected?: boolean;
  /** DICOM rescale slope */
  rescaleSlope?: number;
  /** DICOM rescale intercept */
  rescaleIntercept?: number;
  /** Patient height in cm (for LBM/BSA) */
  patientHeightCm?: number;
  /** Patient sex (for LBM) */
  patientSex?: 'M' | 'F';
}

export class AnalyticsService {
  private serverUrl: string;

  constructor(serverUrl: string) {
    // Normalize URL by removing trailing slash
    this.serverUrl = serverUrl.replace(/\/$/, '');
  }

  private assertEnabled(): void {
    if (!isFeatureEnabled('analytics')) {
      throw new Error('Analytics feature is disabled (enable via VITE_FEATURES=analytics)');
    }
  }

  /**
   * Compute volumetric measurements for segmentation mask.
   * Returns volume and instance count for each segment using connected components analysis.
   *
   * @param maskData - Segmentation mask as ArrayBuffer (NIfTI format)
   * @param params - Parameters including segment labels and optional spacing override
   * @returns VolumetricsResult with per-segment volumes and instances
   */
  async computeVolumetrics(
    maskData: ArrayBuffer,
    params: AnalyticsParams
  ): Promise<VolumetricsResult> {
    this.assertEnabled();
    const formData = new FormData();

    // Ensure mask data is gzipped (may already be gzipped from volumeToNiftiGzip)
    const compressedMask = await ensureGzipped(maskData);
    const maskBlob = new Blob([compressedMask], { type: 'application/gzip' });
    formData.append('mask_file', maskBlob, 'mask.nii.gz');

    // Add params
    formData.append('params', JSON.stringify({
      segment_labels: params.segmentLabels,
      spacing: params.spacing,
    }));

    const response = await fetch(`${this.serverUrl}/analytics/volumetrics`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Volumetrics computation failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Compute pyradiomics features for segmentation.
   * Extracts ~120 radiomics features including First Order, Shape, GLCM, GLRLM, GLSZM, NGTDM, GLDM.
   *
   * @param imageData - Source image as ArrayBuffer (NIfTI format)
   * @param maskData - Segmentation mask as ArrayBuffer (NIfTI format)
   * @param params - Parameters including segment labels
   * @param settings - Optional pyradiomics settings
   * @returns RadiomicsResult with features organized by class
   */
  async computeRadiomics(
    imageData: ArrayBuffer,
    maskData: ArrayBuffer,
    params: AnalyticsParams,
    settings?: RadiomicsSettings
  ): Promise<RadiomicsResult> {
    this.assertEnabled();
    const formData = new FormData();

    // Ensure image and mask data are gzipped (may already be gzipped from volumeToNiftiGzip)
    const [compressedImage, compressedMask] = await Promise.all([
      ensureGzipped(imageData),
      ensureGzipped(maskData),
    ]);

    const imageBlob = new Blob([compressedImage], { type: 'application/gzip' });
    formData.append('image_file', imageBlob, 'image.nii.gz');

    const maskBlob = new Blob([compressedMask], { type: 'application/gzip' });
    formData.append('mask_file', maskBlob, 'mask.nii.gz');

    // Add params
    formData.append('params', JSON.stringify({
      segment_labels: params.segmentLabels,
      feature_classes: ['all'],
      settings: settings,
    }));

    const response = await fetch(`${this.serverUrl}/analytics/radiomics`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Radiomics computation failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Compute SUV (Standardized Uptake Value) metrics for PET imaging.
   * Returns per-segment SUV metrics including SUVmax, SUVmean, SUVpeak, MTV, and TLG.
   *
   * @param petImageData - PET image as ArrayBuffer (NIfTI format)
   * @param maskData - Segmentation mask as ArrayBuffer (NIfTI format)
   * @param params - SUV computation parameters
   * @returns SUVResult with per-segment SUV metrics
   */
  async computeSUV(
    petImageData: ArrayBuffer,
    maskData: ArrayBuffer,
    params: SUVComputationParams
  ): Promise<SUVResult> {
    this.assertEnabled();
    const formData = new FormData();

    // Ensure PET image and mask data are gzipped
    const [compressedPET, compressedMask] = await Promise.all([
      ensureGzipped(petImageData),
      ensureGzipped(maskData),
    ]);

    const petBlob = new Blob([compressedPET], { type: 'application/gzip' });
    formData.append('pet_file', petBlob, 'pet.nii.gz');

    const maskBlob = new Blob([compressedMask], { type: 'application/gzip' });
    formData.append('mask_file', maskBlob, 'mask.nii.gz');

    // Build params object
    const apiParams: Record<string, unknown> = {
      segment_labels: params.segmentLabels,
      patient_weight_kg: params.patientWeightKg,
      injected_dose_bq: params.injectedDoseBq,
    };

    // Add optional params
    if (params.normalizationMethod) {
      apiParams.normalization_method = params.normalizationMethod;
    }
    if (params.suvThreshold !== undefined) {
      apiParams.suv_threshold = params.suvThreshold;
    }
    if (params.halfLifeSeconds !== undefined) {
      apiParams.half_life_seconds = params.halfLifeSeconds;
    }
    if (params.injectionTime) {
      apiParams.injection_time = params.injectionTime;
    }
    if (params.scanTime) {
      apiParams.scan_time = params.scanTime;
    }
    if (params.decayCorrected !== undefined) {
      apiParams.decay_corrected = params.decayCorrected;
    }
    if (params.rescaleSlope !== undefined) {
      apiParams.rescale_slope = params.rescaleSlope;
    }
    if (params.rescaleIntercept !== undefined) {
      apiParams.rescale_intercept = params.rescaleIntercept;
    }
    if (params.patientHeightCm !== undefined) {
      apiParams.patient_height_cm = params.patientHeightCm;
    }
    if (params.patientSex) {
      apiParams.patient_sex = params.patientSex;
    }

    formData.append('params', JSON.stringify(apiParams));

    const response = await fetch(`${this.serverUrl}/suv/compute`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SUV computation failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get SUV computation information and defaults.
   * Useful for displaying available options to the user.
   */
  async getSUVInfo(): Promise<{
    description: string;
    supported_normalization_methods: Record<string, string>;
    defaults: Record<string, number | string>;
    metrics_computed: string[];
    required_params: string[];
    optional_params: string[];
  }> {
    const response = await fetch(`${this.serverUrl}/suv/info`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get SUV info: ${response.status} - ${errorText}`);
    }

    return response.json();
  }
}
