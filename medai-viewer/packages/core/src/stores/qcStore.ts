/**
 * QC Store - Quality Control Assessment Store
 *
 * Zustand store for managing image and segmentation quality control:
 * - Motion artifact detection
 * - SNR estimation
 * - Brain coverage assessment
 * - Skull strip quality
 * - Segmentation QC metrics
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

/**
 * QC severity levels
 */
export type QCSeverity = 'excellent' | 'good' | 'warning' | 'critical';

/**
 * QC assessment category
 */
export type QCCategory =
  | 'motion'
  | 'snr'
  | 'coverage'
  | 'skull_strip'
  | 'contrast'
  | 'artifact'
  | 'segmentation';

/**
 * Individual QC finding
 */
export interface QCFinding {
  /** Unique finding ID */
  id: string;

  /** Finding category */
  category: QCCategory;

  /** Severity level */
  severity: QCSeverity;

  /** Short summary */
  summary: string;

  /** Detailed description */
  description: string;

  /** Affected regions (if applicable) */
  affectedRegions?: string[];

  /** Affected slices (if applicable) */
  affectedSlices?: number[];

  /** Numeric score (0-100) */
  score?: number;

  /** Whether this finding has been acknowledged */
  acknowledged: boolean;

  /** Timestamp */
  timestamp: string;
}

/**
 * Image QC assessment result
 */
export interface ImageQCResult {
  /** Image ID */
  imageId: string;

  /** Series description */
  seriesDescription?: string;

  /** Overall QC status */
  overallStatus: QCSeverity;

  /** Overall score (0-100) */
  overallScore: number;

  /** Whether image is usable */
  isUsable: boolean;

  /** Individual findings */
  findings: QCFinding[];

  /** Assessment timestamp */
  assessedAt: string;

  /** Assessment method */
  method: 'automated' | 'manual' | 'hybrid';

  /** Specific metrics */
  metrics: {
    /** Motion score (0-100, lower is worse) */
    motionScore?: number;

    /** SNR estimate */
    snrEstimate?: number;

    /** Coverage percentage */
    coveragePercent?: number;

    /** Contrast quality score */
    contrastScore?: number;
  };
}

/**
 * Segmentation QC assessment result
 */
export interface SegmentationQCResult {
  /** Segmentation ID */
  segmentationId: string;

  /** Image ID */
  imageId: string;

  /** Overall QC status */
  overallStatus: QCSeverity;

  /** Overall score (0-100) */
  overallScore: number;

  /** Individual findings */
  findings: QCFinding[];

  /** Assessment timestamp */
  assessedAt: string;

  /** Specific metrics */
  metrics: {
    /** Number of segments */
    segmentCount?: number;

    /** Boundary smoothness score */
    boundarySmoothnessScore?: number;

    /** Anatomical plausibility score */
    anatomicalPlausibilityScore?: number;

    /** Suspicious regions count */
    suspiciousRegionCount?: number;

    /** Coverage of expected anatomy */
    anatomyCoveragePercent?: number;
  };

  /** Segments with warnings */
  warningSegments: number[];

  /** Segments needing review */
  reviewRequiredSegments: number[];
}

// ============================================================================
// Store State Interface
// ============================================================================

export interface QCState {
  // ========================================
  // Image QC
  // ========================================

  /** Image QC results by image ID */
  imageQcResults: Record<string, ImageQCResult>;

  /** Whether image QC is in progress */
  isAssessingImage: boolean;

  /** Current image being assessed */
  assessingImageId: string | null;

  // ========================================
  // Segmentation QC
  // ========================================

  /** Segmentation QC results by segmentation ID */
  segmentationQcResults: Record<string, SegmentationQCResult>;

  /** Whether segmentation QC is in progress */
  isAssessingSegmentation: boolean;

  /** Current segmentation being assessed */
  assessingSegmentationId: string | null;

  // ========================================
  // Settings
  // ========================================

  /** Auto-run QC on load */
  autoRunImageQc: boolean;

  /** Auto-run segmentation QC */
  autoRunSegmentationQc: boolean;

  /** Severity threshold for warnings */
  warningThreshold: number;

  /** Severity threshold for critical */
  criticalThreshold: number;

  /** Show QC badges in UI */
  showQcBadges: boolean;

  // ========================================
  // Actions - Image QC
  // ========================================

  /**
   * Set image QC result
   */
  setImageQcResult: (imageId: string, result: ImageQCResult) => void;

  /**
   * Get image QC result
   */
  getImageQcResult: (imageId: string) => ImageQCResult | undefined;

  /**
   * Set image assessment in progress
   */
  setAssessingImage: (imageId: string | null) => void;

  /**
   * Clear image QC result
   */
  clearImageQcResult: (imageId: string) => void;

  /**
   * Get images needing review
   */
  getImagesNeedingReview: () => string[];

  // ========================================
  // Actions - Segmentation QC
  // ========================================

  /**
   * Set segmentation QC result
   */
  setSegmentationQcResult: (segmentationId: string, result: SegmentationQCResult) => void;

  /**
   * Get segmentation QC result
   */
  getSegmentationQcResult: (segmentationId: string) => SegmentationQCResult | undefined;

  /**
   * Set segmentation assessment in progress
   */
  setAssessingSegmentation: (segmentationId: string | null) => void;

  /**
   * Clear segmentation QC result
   */
  clearSegmentationQcResult: (segmentationId: string) => void;

  /**
   * Get segments needing review
   */
  getSegmentsNeedingReview: (segmentationId: string) => number[];

  // ========================================
  // Actions - Findings
  // ========================================

  /**
   * Acknowledge a finding
   */
  acknowledgeFinding: (
    type: 'image' | 'segmentation',
    entityId: string,
    findingId: string
  ) => void;

  /**
   * Add manual finding
   */
  addManualFinding: (
    type: 'image' | 'segmentation',
    entityId: string,
    finding: Omit<QCFinding, 'id' | 'timestamp'>
  ) => void;

  /**
   * Remove finding
   */
  removeFinding: (
    type: 'image' | 'segmentation',
    entityId: string,
    findingId: string
  ) => void;

  // ========================================
  // Actions - Settings
  // ========================================

  /**
   * Toggle auto image QC
   */
  toggleAutoImageQc: (enabled?: boolean) => void;

  /**
   * Toggle auto segmentation QC
   */
  toggleAutoSegmentationQc: (enabled?: boolean) => void;

  /**
   * Set warning threshold
   */
  setWarningThreshold: (threshold: number) => void;

  /**
   * Set critical threshold
   */
  setCriticalThreshold: (threshold: number) => void;

  /**
   * Toggle QC badges
   */
  toggleQcBadges: (show?: boolean) => void;

  // ========================================
  // Actions - Utilities
  // ========================================

  /**
   * Get overall QC summary
   */
  getQcSummary: () => {
    imageCount: number;
    segmentationCount: number;
    warningCount: number;
    criticalCount: number;
    needsReview: boolean;
  };

  /**
   * Clear all QC results
   */
  clearAllResults: () => void;

  /**
   * Reset to initial state
   */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState = {
  imageQcResults: {} as Record<string, ImageQCResult>,
  isAssessingImage: false,
  assessingImageId: null as string | null,
  segmentationQcResults: {} as Record<string, SegmentationQCResult>,
  isAssessingSegmentation: false,
  assessingSegmentationId: null as string | null,
  autoRunImageQc: true,
  autoRunSegmentationQc: true,
  warningThreshold: 70,
  criticalThreshold: 40,
  showQcBadges: true,
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateFindingId(): string {
  return `qc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function calculateOverallStatus(score: number, warningThreshold: number, criticalThreshold: number): QCSeverity {
  if (score >= 90) return 'excellent';
  if (score >= warningThreshold) return 'good';
  if (score >= criticalThreshold) return 'warning';
  return 'critical';
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useQCStore = create<QCState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================
      // Image QC Actions
      // ========================================

      setImageQcResult: (imageId, result) => {
        set((state) => ({
          imageQcResults: {
            ...state.imageQcResults,
            [imageId]: result,
          },
          isAssessingImage: false,
          assessingImageId: null,
        }));
        console.log('[QCStore] Set image QC result:', imageId, result.overallStatus);
      },

      getImageQcResult: (imageId) => {
        return get().imageQcResults[imageId];
      },

      setAssessingImage: (imageId) => {
        set({
          isAssessingImage: imageId !== null,
          assessingImageId: imageId,
        });
      },

      clearImageQcResult: (imageId) => {
        set((state) => {
          const { [imageId]: removed, ...rest } = state.imageQcResults;
          return { imageQcResults: rest };
        });
      },

      getImagesNeedingReview: () => {
        const { imageQcResults, warningThreshold } = get();
        return Object.entries(imageQcResults)
          .filter(([_, result]) => result.overallScore < warningThreshold)
          .map(([id]) => id);
      },

      // ========================================
      // Segmentation QC Actions
      // ========================================

      setSegmentationQcResult: (segmentationId, result) => {
        set((state) => ({
          segmentationQcResults: {
            ...state.segmentationQcResults,
            [segmentationId]: result,
          },
          isAssessingSegmentation: false,
          assessingSegmentationId: null,
        }));
        console.log('[QCStore] Set segmentation QC result:', segmentationId, result.overallStatus);
      },

      getSegmentationQcResult: (segmentationId) => {
        return get().segmentationQcResults[segmentationId];
      },

      setAssessingSegmentation: (segmentationId) => {
        set({
          isAssessingSegmentation: segmentationId !== null,
          assessingSegmentationId: segmentationId,
        });
      },

      clearSegmentationQcResult: (segmentationId) => {
        set((state) => {
          const { [segmentationId]: removed, ...rest } = state.segmentationQcResults;
          return { segmentationQcResults: rest };
        });
      },

      getSegmentsNeedingReview: (segmentationId) => {
        const result = get().segmentationQcResults[segmentationId];
        return result?.reviewRequiredSegments || [];
      },

      // ========================================
      // Finding Actions
      // ========================================

      acknowledgeFinding: (type, entityId, findingId) => {
        set((state) => {
          if (type === 'image') {
            const result = state.imageQcResults[entityId];
            if (!result) return state;

            return {
              imageQcResults: {
                ...state.imageQcResults,
                [entityId]: {
                  ...result,
                  findings: result.findings.map((f) =>
                    f.id === findingId ? { ...f, acknowledged: true } : f
                  ),
                },
              },
            };
          } else {
            const result = state.segmentationQcResults[entityId];
            if (!result) return state;

            return {
              segmentationQcResults: {
                ...state.segmentationQcResults,
                [entityId]: {
                  ...result,
                  findings: result.findings.map((f) =>
                    f.id === findingId ? { ...f, acknowledged: true } : f
                  ),
                },
              },
            };
          }
        });
      },

      addManualFinding: (type, entityId, finding) => {
        const newFinding: QCFinding = {
          ...finding,
          id: generateFindingId(),
          timestamp: new Date().toISOString(),
        };

        set((state) => {
          if (type === 'image') {
            const result = state.imageQcResults[entityId];
            if (!result) return state;

            return {
              imageQcResults: {
                ...state.imageQcResults,
                [entityId]: {
                  ...result,
                  findings: [...result.findings, newFinding],
                },
              },
            };
          } else {
            const result = state.segmentationQcResults[entityId];
            if (!result) return state;

            return {
              segmentationQcResults: {
                ...state.segmentationQcResults,
                [entityId]: {
                  ...result,
                  findings: [...result.findings, newFinding],
                },
              },
            };
          }
        });

        console.log('[QCStore] Added manual finding:', type, entityId, finding.summary);
      },

      removeFinding: (type, entityId, findingId) => {
        set((state) => {
          if (type === 'image') {
            const result = state.imageQcResults[entityId];
            if (!result) return state;

            return {
              imageQcResults: {
                ...state.imageQcResults,
                [entityId]: {
                  ...result,
                  findings: result.findings.filter((f) => f.id !== findingId),
                },
              },
            };
          } else {
            const result = state.segmentationQcResults[entityId];
            if (!result) return state;

            return {
              segmentationQcResults: {
                ...state.segmentationQcResults,
                [entityId]: {
                  ...result,
                  findings: result.findings.filter((f) => f.id !== findingId),
                },
              },
            };
          }
        });
      },

      // ========================================
      // Settings Actions
      // ========================================

      toggleAutoImageQc: (enabled) => {
        set((state) => ({
          autoRunImageQc: enabled !== undefined ? enabled : !state.autoRunImageQc,
        }));
      },

      toggleAutoSegmentationQc: (enabled) => {
        set((state) => ({
          autoRunSegmentationQc: enabled !== undefined ? enabled : !state.autoRunSegmentationQc,
        }));
      },

      setWarningThreshold: (threshold) => {
        set({ warningThreshold: threshold });
      },

      setCriticalThreshold: (threshold) => {
        set({ criticalThreshold: threshold });
      },

      toggleQcBadges: (show) => {
        set((state) => ({
          showQcBadges: show !== undefined ? show : !state.showQcBadges,
        }));
      },

      // ========================================
      // Utility Actions
      // ========================================

      getQcSummary: () => {
        const state = get();
        const imageResults = Object.values(state.imageQcResults);
        const segResults = Object.values(state.segmentationQcResults);

        let warningCount = 0;
        let criticalCount = 0;

        [...imageResults, ...segResults].forEach((result) => {
          if (result.overallStatus === 'warning') warningCount++;
          if (result.overallStatus === 'critical') criticalCount++;
        });

        return {
          imageCount: imageResults.length,
          segmentationCount: segResults.length,
          warningCount,
          criticalCount,
          needsReview: criticalCount > 0 || warningCount > 0,
        };
      },

      clearAllResults: () => {
        set({
          imageQcResults: {},
          segmentationQcResults: {},
        });
        console.log('[QCStore] Cleared all QC results');
      },

      reset: () => {
        set(initialState);
        console.log('[QCStore] Reset to initial state');
      },
    }),
    {
      name: 'medai-qc',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        autoRunImageQc: state.autoRunImageQc,
        autoRunSegmentationQc: state.autoRunSegmentationQc,
        warningThreshold: state.warningThreshold,
        criticalThreshold: state.criticalThreshold,
        showQcBadges: state.showQcBadges,
      }),
    }
  )
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Get QC badge severity for an image
 */
export function useImageQcSeverity(imageId: string | null): QCSeverity | null {
  return useQCStore((state) =>
    imageId ? state.imageQcResults[imageId]?.overallStatus ?? null : null
  );
}

/**
 * Get QC badge severity for a segmentation
 */
export function useSegmentationQcSeverity(segmentationId: string | null): QCSeverity | null {
  return useQCStore((state) =>
    segmentationId ? state.segmentationQcResults[segmentationId]?.overallStatus ?? null : null
  );
}

/**
 * Check if QC badges should be shown
 */
export function useShowQcBadges(): boolean {
  return useQCStore((state) => state.showQcBadges);
}

/**
 * Get QC summary
 */
export function useQcSummary() {
  return useQCStore((state) => state.getQcSummary());
}

export default useQCStore;
