import { create } from 'zustand';

// ============================================================================
// Per-Image Metrics (for Longitudinal Sessions)
// ============================================================================

/**
 * Metrics stored for a specific image (used in longitudinal comparisons).
 */
export interface ImageMetrics {
  imageId: string;
  volumetrics: VolumetricsResult | null;
  radiomics: RadiomicsResult | null;
  suvMetrics: SUVResult | null;
  computedAt: number;
}

// ============================================================================
// SUV (PET Metrics) Types
// ============================================================================

/**
 * SUV metrics for a single segment/lesion
 */
export interface SegmentSUVMetrics {
  segment_index: number;
  segment_label: string;
  suv_max: number;
  suv_mean: number;
  suv_peak: number;
  suv_min: number;
  suv_std: number;
  metabolic_volume_cm3: number;
  total_lesion_glycolysis: number;
  voxel_count: number;
  volume_cm3: number;
  max_location_ijk?: [number, number, number];
  max_location_mm?: [number, number, number];
}

/**
 * SUV computation result
 */
export interface SUVResult {
  segments: SegmentSUVMetrics[];
  metadata: {
    normalization_method: string;
    suv_threshold: number;
    patient_weight_kg: number;
    injected_dose_bq: number;
    decay_factor: number;
    decay_corrected: boolean;
    half_life_seconds: number;
    sphere_radius_mm: number;
    computation_time_seconds: number;
    image_dimensions: [number, number, number];
    voxel_spacing_mm: [number, number, number];
    voxel_volume_mm3: number;
  };
  warnings?: string[];
}

// ============================================================================
// Volumetrics types
// ============================================================================
export interface InstanceInfo {
  instance_id: number;
  voxel_count: number;
  volume_mm3: number;
  volume_cm3: number;
  centroid_ijk: [number, number, number];
  bounding_box: [[number, number, number], [number, number, number]];
  dimensions_mm?: [number, number, number];
  longest_axis_mm?: number;
  max_diameter_mm?: number;
}

export interface SegmentVolumetrics {
  segment_index: number;
  label: string;
  total_voxel_count: number;
  total_volume_mm3: number;
  total_volume_cm3: number;
  dimensions_mm?: [number, number, number];
  longest_axis_mm?: number;
  max_diameter_mm?: number;
  instance_count: number;
  instances: InstanceInfo[];
}

export interface VolumetricsResult {
  volumetrics: {
    segments: SegmentVolumetrics[];
  };
  metadata: {
    image_dimensions: [number, number, number];
    voxel_spacing_mm: [number, number, number];
    voxel_volume_mm3: number;
    total_mask_voxels: number;
  };
}

// Radiomics types
export interface RadiomicsFeatures {
  firstorder?: Record<string, number>;
  shape?: Record<string, number>;
  glcm?: Record<string, number>;
  glrlm?: Record<string, number>;
  glszm?: Record<string, number>;
  ngtdm?: Record<string, number>;
  gldm?: Record<string, number>;
}

export interface SegmentRadiomics {
  segment_index: number;
  label: string;
  features: RadiomicsFeatures;
  error?: string;
}

export interface RadiomicsResult {
  segments: SegmentRadiomics[];
  metadata: {
    pyradiomics_version: string;
    feature_count: number;
    computation_time_seconds: number;
  };
}

// Store state
export interface AnalyticsState {
  // Results (current/active image)
  volumetricsResult: VolumetricsResult | null;
  radiomicsResult: RadiomicsResult | null;
  suvResult: SUVResult | null;

  // Per-image metrics (for longitudinal sessions)
  metricsByImageId: Map<string, ImageMetrics>;

  // Loading states
  isComputingVolumetrics: boolean;
  isComputingRadiomics: boolean;
  isComputingSUV: boolean;

  // Error states
  volumetricsError: string | null;
  radiomicsError: string | null;
  suvError: string | null;

  // Modal visibility
  isModalOpen: boolean;
  activeTab: 'volumetrics' | 'radiomics' | 'suv';

  // Actions - Current image
  setVolumetricsResult: (result: VolumetricsResult | null) => void;
  setRadiomicsResult: (result: RadiomicsResult | null) => void;
  setSUVResult: (result: SUVResult | null) => void;
  setComputingVolumetrics: (isComputing: boolean) => void;
  setComputingRadiomics: (isComputing: boolean) => void;
  setComputingSUV: (isComputing: boolean) => void;
  setVolumetricsError: (error: string | null) => void;
  setRadiomicsError: (error: string | null) => void;
  setSUVError: (error: string | null) => void;
  openModal: (tab?: 'volumetrics' | 'radiomics' | 'suv') => void;
  closeModal: () => void;
  setActiveTab: (tab: 'volumetrics' | 'radiomics' | 'suv') => void;
  reset: () => void;

  // Actions - Per-image metrics (for longitudinal)
  setMetricsForImage: (
    imageId: string,
    volumetrics: VolumetricsResult | null,
    radiomics: RadiomicsResult | null,
    suvMetrics?: SUVResult | null
  ) => void;
  getMetricsForImage: (imageId: string) => ImageMetrics | undefined;
  clearMetricsForImage: (imageId: string) => void;
  clearAllImageMetrics: () => void;
}

const initialState = {
  volumetricsResult: null as VolumetricsResult | null,
  radiomicsResult: null as RadiomicsResult | null,
  suvResult: null as SUVResult | null,
  metricsByImageId: new Map<string, ImageMetrics>(),
  isComputingVolumetrics: false,
  isComputingRadiomics: false,
  isComputingSUV: false,
  volumetricsError: null as string | null,
  radiomicsError: null as string | null,
  suvError: null as string | null,
  isModalOpen: false,
  activeTab: 'volumetrics' as 'volumetrics' | 'radiomics' | 'suv',
};

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  ...initialState,

  // ========================================================================
  // Current Image Actions
  // ========================================================================

  setVolumetricsResult: (result) => set({ volumetricsResult: result, volumetricsError: null }),

  setRadiomicsResult: (result) => set({ radiomicsResult: result, radiomicsError: null }),

  setSUVResult: (result) => set({ suvResult: result, suvError: null }),

  setComputingVolumetrics: (isComputing) => set({ isComputingVolumetrics: isComputing }),

  setComputingRadiomics: (isComputing) => set({ isComputingRadiomics: isComputing }),

  setComputingSUV: (isComputing) => set({ isComputingSUV: isComputing }),

  setVolumetricsError: (error) => set({ volumetricsError: error, isComputingVolumetrics: false }),

  setRadiomicsError: (error) => set({ radiomicsError: error, isComputingRadiomics: false }),

  setSUVError: (error) => set({ suvError: error, isComputingSUV: false }),

  openModal: (tab = 'volumetrics') => set({ isModalOpen: true, activeTab: tab }),

  closeModal: () => set({ isModalOpen: false }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  reset: () => set({
    ...initialState,
    metricsByImageId: new Map<string, ImageMetrics>(),
  }),

  // ========================================================================
  // Per-Image Metrics Actions (for Longitudinal Sessions)
  // ========================================================================

  setMetricsForImage: (imageId, volumetrics, radiomics, suvMetrics = null) => {
    set((state) => {
      const newMap = new Map(state.metricsByImageId);
      newMap.set(imageId, {
        imageId,
        volumetrics,
        radiomics,
        suvMetrics,
        computedAt: Date.now(),
      });
      console.log('[AnalyticsStore] Set metrics for image:', imageId);
      return { metricsByImageId: newMap };
    });
  },

  getMetricsForImage: (imageId) => {
    return get().metricsByImageId.get(imageId);
  },

  clearMetricsForImage: (imageId) => {
    set((state) => {
      const newMap = new Map(state.metricsByImageId);
      newMap.delete(imageId);
      console.log('[AnalyticsStore] Cleared metrics for image:', imageId);
      return { metricsByImageId: newMap };
    });
  },

  clearAllImageMetrics: () => {
    set({ metricsByImageId: new Map<string, ImageMetrics>() });
    console.log('[AnalyticsStore] Cleared all image metrics');
  },
}));
