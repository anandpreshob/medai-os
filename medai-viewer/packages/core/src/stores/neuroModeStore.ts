/**
 * Neuro Mode Store
 *
 * Zustand store for managing neurology workflow modes including:
 * - Mode selection (MS Protocol, Dementia, Stroke, General)
 * - ICV normalization settings
 * - Asymmetry index tracking
 * - Regional grouping preferences
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  NeuroMode,
  NeuroModeConfig,
  NEURO_MODE_CONFIGS,
  ICVData,
  NormalizedVolume,
  AsymmetryIndex,
  AsymmetryInterpretation,
  ClassifiedLesion,
  MSLesionLocation,
  GroupedRegion,
  BrainRegionGroup,
  AtrophyAnalysis,
  calculateAsymmetryIndex,
  interpretAsymmetry,
  calculateAnnualAtrophyRate,
  ATROPHY_REFERENCE_RATES,
} from './neuroModeTypes';

// ============================================================================
// Store State Interface
// ============================================================================

export interface NeuroModeState {
  // ========================================
  // Mode Selection
  // ========================================

  /** Current active mode */
  activeMode: NeuroMode;

  /** Mode configuration */
  modeConfig: NeuroModeConfig;

  // ========================================
  // ICV Normalization
  // ========================================

  /** ICV data (if computed) */
  icvData: ICVData | null;

  /** Whether to show normalized volumes */
  showNormalizedVolumes: boolean;

  /** Auto-compute ICV when brain parcellation runs */
  autoComputeIcv: boolean;

  // ========================================
  // Asymmetry Analysis
  // ========================================

  /** Computed asymmetry indices by region */
  asymmetryIndices: AsymmetryIndex[];

  /** Threshold for highlighting asymmetry */
  asymmetryHighlightThreshold: number;

  // ========================================
  // Lesion Classification
  // ========================================

  /** Classified lesions */
  classifiedLesions: ClassifiedLesion[];

  /** MS lesion counts by location */
  msLesionCounts: Record<MSLesionLocation, number>;

  /** Enable lesion classification */
  enableLesionClassification: boolean;

  // ========================================
  // Regional Grouping
  // ========================================

  /** Grouped regions for display */
  groupedRegions: Record<BrainRegionGroup, GroupedRegion[]>;

  /** Expanded groups in UI */
  expandedGroups: BrainRegionGroup[];

  // ========================================
  // Atrophy Analysis
  // ========================================

  /** Atrophy analyses by region */
  atrophyAnalyses: AtrophyAnalysis[];

  /** Patient age (for reference ranges) */
  patientAge: number | null;

  // ========================================
  // UI Preferences
  // ========================================

  /** Show volume chart */
  showVolumeChart: boolean;

  /** Volume unit preference */
  volumeUnit: 'ml' | 'cm3' | 'mm3';

  /** Sort order for regions */
  regionSortOrder: 'alphabetical' | 'volume' | 'group';

  // ========================================
  // Actions - Mode Selection
  // ========================================

  /**
   * Set active mode
   */
  setMode: (mode: NeuroMode) => void;

  /**
   * Get mode configuration
   */
  getModeConfig: (mode?: NeuroMode) => NeuroModeConfig;

  // ========================================
  // Actions - ICV
  // ========================================

  /**
   * Set ICV data
   */
  setIcvData: (icv: ICVData) => void;

  /**
   * Clear ICV data
   */
  clearIcvData: () => void;

  /**
   * Toggle normalized volume display
   */
  toggleNormalizedVolumes: (show?: boolean) => void;

  /**
   * Normalize a volume to ICV
   */
  normalizeToIcv: (volumeMl: number) => NormalizedVolume | null;

  /**
   * Normalize multiple volumes
   */
  normalizeVolumes: (volumes: { label: string; volumeMl: number }[]) => NormalizedVolume[];

  // ========================================
  // Actions - Asymmetry
  // ========================================

  /**
   * Compute asymmetry indices from paired volumes
   */
  computeAsymmetryIndices: (
    pairedVolumes: { region: string; leftMl: number; rightMl: number }[]
  ) => void;

  /**
   * Clear asymmetry indices
   */
  clearAsymmetryIndices: () => void;

  /**
   * Set asymmetry highlight threshold
   */
  setAsymmetryThreshold: (threshold: number) => void;

  /**
   * Get significant asymmetries (above threshold)
   */
  getSignificantAsymmetries: () => AsymmetryIndex[];

  // ========================================
  // Actions - Lesion Classification
  // ========================================

  /**
   * Set classified lesions
   */
  setClassifiedLesions: (lesions: ClassifiedLesion[]) => void;

  /**
   * Clear classified lesions
   */
  clearClassifiedLesions: () => void;

  /**
   * Update lesion counts by location
   */
  updateMsLesionCounts: () => void;

  /**
   * Toggle lesion classification
   */
  toggleLesionClassification: (enabled?: boolean) => void;

  /**
   * Get lesions by location
   */
  getLesionsByLocation: (location: MSLesionLocation) => ClassifiedLesion[];

  // ========================================
  // Actions - Regional Grouping
  // ========================================

  /**
   * Set grouped regions
   */
  setGroupedRegions: (regions: GroupedRegion[]) => void;

  /**
   * Clear grouped regions
   */
  clearGroupedRegions: () => void;

  /**
   * Toggle group expansion
   */
  toggleGroupExpansion: (group: BrainRegionGroup) => void;

  /**
   * Expand all groups
   */
  expandAllGroups: () => void;

  /**
   * Collapse all groups
   */
  collapseAllGroups: () => void;

  /**
   * Get total volume for a group
   */
  getGroupTotalVolume: (group: BrainRegionGroup) => number;

  // ========================================
  // Actions - Atrophy
  // ========================================

  /**
   * Compute atrophy from baseline and current volumes
   */
  computeAtrophy: (
    comparisons: {
      region: string;
      baselineMl: number;
      currentMl: number;
      intervalDays: number;
    }[]
  ) => void;

  /**
   * Set patient age
   */
  setPatientAge: (age: number | null) => void;

  /**
   * Clear atrophy analyses
   */
  clearAtrophyAnalyses: () => void;

  /**
   * Get pathological atrophy regions
   */
  getPathologicalAtrophy: () => AtrophyAnalysis[];

  // ========================================
  // Actions - UI Preferences
  // ========================================

  /**
   * Toggle volume chart
   */
  toggleVolumeChart: (show?: boolean) => void;

  /**
   * Set volume unit
   */
  setVolumeUnit: (unit: 'ml' | 'cm3' | 'mm3') => void;

  /**
   * Set region sort order
   */
  setRegionSortOrder: (order: 'alphabetical' | 'volume' | 'group') => void;

  // ========================================
  // Actions - Utilities
  // ========================================

  /**
   * Reset to initial state
   */
  reset: () => void;

  /**
   * Export mode-specific report data
   */
  exportReportData: () => Record<string, unknown>;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState = {
  activeMode: 'general' as NeuroMode,
  modeConfig: NEURO_MODE_CONFIGS.general,
  icvData: null as ICVData | null,
  showNormalizedVolumes: true,
  autoComputeIcv: true,
  asymmetryIndices: [] as AsymmetryIndex[],
  asymmetryHighlightThreshold: 10, // 10% threshold
  classifiedLesions: [] as ClassifiedLesion[],
  msLesionCounts: {
    periventricular: 0,
    juxtacortical: 0,
    infratentorial: 0,
    deep_white_matter: 0,
    cortical: 0,
    spinal_cord: 0,
  } as Record<MSLesionLocation, number>,
  enableLesionClassification: true,
  groupedRegions: {} as Record<BrainRegionGroup, GroupedRegion[]>,
  expandedGroups: ['subcortical', 'ventricles'] as BrainRegionGroup[],
  atrophyAnalyses: [] as AtrophyAnalysis[],
  patientAge: null as number | null,
  showVolumeChart: true,
  volumeUnit: 'ml' as 'ml' | 'cm3' | 'mm3',
  regionSortOrder: 'group' as 'alphabetical' | 'volume' | 'group',
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useNeuroModeStore = create<NeuroModeState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================
      // Mode Selection
      // ========================================

      setMode: (mode) => {
        const config = NEURO_MODE_CONFIGS[mode];
        set({
          activeMode: mode,
          modeConfig: config,
        });
        console.log('[NeuroModeStore] Set mode:', mode);
      },

      getModeConfig: (mode) => {
        return NEURO_MODE_CONFIGS[mode || get().activeMode];
      },

      // ========================================
      // ICV Actions
      // ========================================

      setIcvData: (icv) => {
        set({ icvData: icv });
        console.log('[NeuroModeStore] Set ICV:', icv.volumeMl, 'mL');
      },

      clearIcvData: () => {
        set({ icvData: null });
      },

      toggleNormalizedVolumes: (show) => {
        set((state) => ({
          showNormalizedVolumes: show !== undefined ? show : !state.showNormalizedVolumes,
        }));
      },

      normalizeToIcv: (volumeMl) => {
        const icv = get().icvData;
        if (!icv) return null;

        return {
          rawVolumeMl: volumeMl,
          normalizedVolume: (volumeMl / icv.volumeMl) * 1000, // Per 1000 mL ICV
          icvMl: icv.volumeMl,
          percentOfIcv: (volumeMl / icv.volumeMl) * 100,
        };
      },

      normalizeVolumes: (volumes) => {
        const icv = get().icvData;
        if (!icv) return [];

        return volumes.map(({ volumeMl }) => ({
          rawVolumeMl: volumeMl,
          normalizedVolume: (volumeMl / icv.volumeMl) * 1000,
          icvMl: icv.volumeMl,
          percentOfIcv: (volumeMl / icv.volumeMl) * 100,
        }));
      },

      // ========================================
      // Asymmetry Actions
      // ========================================

      computeAsymmetryIndices: (pairedVolumes) => {
        const indices: AsymmetryIndex[] = pairedVolumes.map(({ region, leftMl, rightMl }) => {
          const asymmetryPercent = calculateAsymmetryIndex(leftMl, rightMl);
          const interpretation = interpretAsymmetry(asymmetryPercent);

          return {
            region,
            leftVolumeMl: leftMl,
            rightVolumeMl: rightMl,
            asymmetryPercent,
            interpretation,
            dominantSide:
              Math.abs(asymmetryPercent) < 5
                ? 'symmetric'
                : asymmetryPercent > 0
                ? 'left'
                : 'right',
          };
        });

        set({ asymmetryIndices: indices });
        console.log('[NeuroModeStore] Computed asymmetry indices:', indices.length);
      },

      clearAsymmetryIndices: () => {
        set({ asymmetryIndices: [] });
      },

      setAsymmetryThreshold: (threshold) => {
        set({ asymmetryHighlightThreshold: threshold });
      },

      getSignificantAsymmetries: () => {
        const { asymmetryIndices, asymmetryHighlightThreshold } = get();
        return asymmetryIndices.filter(
          (ai) => Math.abs(ai.asymmetryPercent) >= asymmetryHighlightThreshold
        );
      },

      // ========================================
      // Lesion Classification Actions
      // ========================================

      setClassifiedLesions: (lesions) => {
        set({ classifiedLesions: lesions });
        get().updateMsLesionCounts();
        console.log('[NeuroModeStore] Set classified lesions:', lesions.length);
      },

      clearClassifiedLesions: () => {
        set({
          classifiedLesions: [],
          msLesionCounts: {
            periventricular: 0,
            juxtacortical: 0,
            infratentorial: 0,
            deep_white_matter: 0,
            cortical: 0,
            spinal_cord: 0,
          },
        });
      },

      updateMsLesionCounts: () => {
        const lesions = get().classifiedLesions;
        const counts: Record<MSLesionLocation, number> = {
          periventricular: 0,
          juxtacortical: 0,
          infratentorial: 0,
          deep_white_matter: 0,
          cortical: 0,
          spinal_cord: 0,
        };

        lesions.forEach((lesion) => {
          if (lesion.msLocation) {
            counts[lesion.msLocation]++;
          }
        });

        set({ msLesionCounts: counts });
      },

      toggleLesionClassification: (enabled) => {
        set((state) => ({
          enableLesionClassification:
            enabled !== undefined ? enabled : !state.enableLesionClassification,
        }));
      },

      getLesionsByLocation: (location) => {
        return get().classifiedLesions.filter((l) => l.msLocation === location);
      },

      // ========================================
      // Regional Grouping Actions
      // ========================================

      setGroupedRegions: (regions) => {
        const grouped: Record<BrainRegionGroup, GroupedRegion[]> = {
          frontal: [],
          temporal: [],
          parietal: [],
          occipital: [],
          subcortical: [],
          cerebellum: [],
          brainstem: [],
          ventricles: [],
          white_matter: [],
          other: [],
        };

        regions.forEach((region) => {
          grouped[region.group].push(region);
        });

        set({ groupedRegions: grouped });
        console.log('[NeuroModeStore] Set grouped regions');
      },

      clearGroupedRegions: () => {
        set({
          groupedRegions: {
            frontal: [],
            temporal: [],
            parietal: [],
            occipital: [],
            subcortical: [],
            cerebellum: [],
            brainstem: [],
            ventricles: [],
            white_matter: [],
            other: [],
          },
        });
      },

      toggleGroupExpansion: (group) => {
        set((state) => {
          const expanded = state.expandedGroups.includes(group)
            ? state.expandedGroups.filter((g) => g !== group)
            : [...state.expandedGroups, group];
          return { expandedGroups: expanded };
        });
      },

      expandAllGroups: () => {
        const allGroups: BrainRegionGroup[] = [
          'frontal',
          'temporal',
          'parietal',
          'occipital',
          'subcortical',
          'cerebellum',
          'brainstem',
          'ventricles',
          'white_matter',
          'other',
        ];
        set({ expandedGroups: allGroups });
      },

      collapseAllGroups: () => {
        set({ expandedGroups: [] });
      },

      getGroupTotalVolume: (group) => {
        const regions = get().groupedRegions[group] || [];
        return regions.reduce((sum, r) => sum + r.volumeMl, 0);
      },

      // ========================================
      // Atrophy Actions
      // ========================================

      computeAtrophy: (comparisons) => {
        const patientAge = get().patientAge;

        const analyses: AtrophyAnalysis[] = comparisons.map(
          ({ region, baselineMl, currentMl, intervalDays }) => {
            const percentChange = ((baselineMl - currentMl) / baselineMl) * 100;
            const annualizedRate = calculateAnnualAtrophyRate(baselineMl, currentMl, intervalDays);

            // Determine interpretation based on reference ranges
            let interpretation: AtrophyAnalysis['interpretation'] = 'normal_aging';

            // Use age-appropriate reference if available
            const ageGroup = patientAge && patientAge >= 60 ? '60_plus' : '20_60';
            const refKey = region.includes('hippocampus')
              ? 'hippocampus_normal'
              : `whole_brain_${ageGroup}`;
            const ref = ATROPHY_REFERENCE_RATES[refKey];

            if (ref) {
              if (annualizedRate >= ref.pathological) {
                interpretation = 'pathological';
              } else if (annualizedRate > ref.normal[1]) {
                interpretation = 'accelerated';
              }
            }

            return {
              region,
              baselineVolumeMl: baselineMl,
              currentVolumeMl: currentMl,
              intervalDays,
              percentChange,
              annualizedRate,
              interpretation,
            };
          }
        );

        set({ atrophyAnalyses: analyses });
        console.log('[NeuroModeStore] Computed atrophy analyses:', analyses.length);
      },

      setPatientAge: (age) => {
        set({ patientAge: age });
      },

      clearAtrophyAnalyses: () => {
        set({ atrophyAnalyses: [] });
      },

      getPathologicalAtrophy: () => {
        return get().atrophyAnalyses.filter((a) => a.interpretation === 'pathological');
      },

      // ========================================
      // UI Preferences Actions
      // ========================================

      toggleVolumeChart: (show) => {
        set((state) => ({
          showVolumeChart: show !== undefined ? show : !state.showVolumeChart,
        }));
      },

      setVolumeUnit: (unit) => {
        set({ volumeUnit: unit });
      },

      setRegionSortOrder: (order) => {
        set({ regionSortOrder: order });
      },

      // ========================================
      // Utility Actions
      // ========================================

      reset: () => {
        set(initialState);
        console.log('[NeuroModeStore] Reset to initial state');
      },

      exportReportData: () => {
        const state = get();

        return {
          mode: state.activeMode,
          icv: state.icvData,
          asymmetryIndices: state.asymmetryIndices,
          lesionCounts: state.msLesionCounts,
          classifiedLesions: state.classifiedLesions,
          atrophyAnalyses: state.atrophyAnalyses,
          patientAge: state.patientAge,
          exportedAt: new Date().toISOString(),
        };
      },
    }),
    {
      name: 'medai-neuro-mode',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeMode: state.activeMode,
        showNormalizedVolumes: state.showNormalizedVolumes,
        autoComputeIcv: state.autoComputeIcv,
        asymmetryHighlightThreshold: state.asymmetryHighlightThreshold,
        enableLesionClassification: state.enableLesionClassification,
        showVolumeChart: state.showVolumeChart,
        volumeUnit: state.volumeUnit,
        regionSortOrder: state.regionSortOrder,
        expandedGroups: state.expandedGroups,
      }),
    }
  )
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Get current mode config
 */
export function useActiveNeuroMode(): NeuroModeConfig {
  return useNeuroModeStore((state) => state.modeConfig);
}

/**
 * Get ICV data
 */
export function useIcvData(): ICVData | null {
  return useNeuroModeStore((state) => state.icvData);
}

/**
 * Get asymmetry indices
 */
export function useAsymmetryIndices(): AsymmetryIndex[] {
  return useNeuroModeStore((state) => state.asymmetryIndices);
}

/**
 * Get MS lesion counts
 */
export function useMsLesionCounts(): Record<MSLesionLocation, number> {
  return useNeuroModeStore((state) => state.msLesionCounts);
}

/**
 * Check if in MS mode
 */
export function useIsMsMode(): boolean {
  return useNeuroModeStore((state) => state.activeMode === 'ms_protocol');
}

/**
 * Check if in dementia mode
 */
export function useIsDementiaMode(): boolean {
  return useNeuroModeStore((state) => state.activeMode === 'dementia');
}

/**
 * Check if in stroke mode
 */
export function useIsStrokeMode(): boolean {
  return useNeuroModeStore((state) => state.activeMode === 'stroke');
}

export default useNeuroModeStore;
