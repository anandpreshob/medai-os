import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SuiteId, SuiteConfig, SuiteMode } from '../suites/types';

/**
 * Default suite configuration for 'auto' mode
 * This serves as a fallback when no specific suite is detected or selected
 */
const AUTO_SUITE_CONFIG: SuiteConfig = {
  id: 'auto',
  name: 'Auto',
  description: 'Automatically detect and configure based on study metadata',
  icon: 'Sparkles',
  defaultLayout: 'fourUp',
  wlPresets: ['ct-soft-tissue', 'ct-lung', 'ct-bone'],
  enabledTools: ['pan', 'zoom', 'windowLevel', 'crosshairs', 'length', 'brush', 'eraser'],
  monaiTasks: ['segmentation'],
  preferredModels: ['totalsegmentator', 'wholeBody_ct_segmentation'],
  metricsPanelId: 'generic-metrics',
  enabledMetrics: ['volume', 'mean', 'std'],
  allowedExports: ['nifti', 'dicom-seg', 'json'],
  tabs: [
    { id: 'segmentation', label: 'Segmentation', component: 'SegmentationTab', icon: 'Layers' },
    { id: 'measurements', label: 'Measurements', component: 'MeasurementsTab', icon: 'Ruler' },
  ],
  panels: [
    { id: 'label-list', component: 'LabelListPanel', order: 1 },
    { id: 'metrics-summary', component: 'MetricsSummaryPanel', order: 2 },
  ],
  detectionHints: {
    modalities: [],
    bodyParts: [],
    descriptionKeywords: [],
    protocolKeywords: [],
  },
};

/**
 * Suite state interface
 *
 * Manages the active clinical suite, detection results, and user preferences.
 */
export interface SuiteState {
  /** Currently active suite identifier */
  activeSuiteId: SuiteId;

  /** Mode of operation - 'auto' detects suite from metadata, 'manual' uses user selection */
  mode: SuiteMode;

  /** Last suite detected by auto-detection (may differ from active if mode is 'manual') */
  lastDetectedSuiteId: SuiteId | null;

  /** Confidence score of the last detection (0-1) */
  detectionConfidence: number;

  /** Criteria that matched during detection */
  detectionCriteria: string[];
}

/**
 * Suite actions interface
 */
export interface SuiteActions {
  /**
   * Set the active suite
   * @param suiteId - The suite to activate
   * @param mode - Optional mode override ('auto' or 'manual'). If setting a specific suite, defaults to 'manual'
   */
  setActiveSuite: (suiteId: SuiteId, mode?: SuiteMode) => void;

  /**
   * Set the operation mode
   * @param mode - 'auto' for automatic detection, 'manual' for user selection
   */
  setMode: (mode: SuiteMode) => void;

  /**
   * Store detection results from auto-detection
   * @param suiteId - The detected suite
   * @param confidence - Detection confidence score (0-1)
   * @param criteria - Array of criteria that matched
   */
  setDetectionResult: (suiteId: SuiteId, confidence: number, criteria: string[]) => void;

  /**
   * Get the configuration for the currently active suite
   * @returns The SuiteConfig for the active suite
   */
  getActiveSuiteConfig: () => SuiteConfig;

  /**
   * Reset store to initial state
   */
  reset: () => void;
}

/** Combined store type */
export type SuiteStore = SuiteState & SuiteActions;

/**
 * Initial state values
 */
const initialState: SuiteState = {
  activeSuiteId: 'auto',
  mode: 'auto',
  lastDetectedSuiteId: null,
  detectionConfidence: 0,
  detectionCriteria: [],
};

/**
 * Suite registry cache - populated dynamically when registry is available
 * This allows the store to work even before the registry is fully initialized
 */
let suitesRegistry: Map<SuiteId, SuiteConfig> | null = null;

/**
 * Register the suites registry with the store
 * This should be called during app initialization
 * @param registry - Map of suite IDs to their configurations
 */
export function registerSuitesRegistry(registry: Map<SuiteId, SuiteConfig>): void {
  suitesRegistry = registry;
}

/**
 * Get a suite configuration by ID
 * Falls back to AUTO_SUITE_CONFIG if registry is not available or suite not found
 * @param suiteId - The suite ID to look up
 */
function getSuiteConfig(suiteId: SuiteId): SuiteConfig {
  if (suiteId === 'auto') {
    return AUTO_SUITE_CONFIG;
  }

  if (suitesRegistry) {
    const config = suitesRegistry.get(suiteId);
    if (config) {
      return config;
    }
  }

  // Fallback to auto config if suite not found
  console.warn(`Suite '${suiteId}' not found in registry, falling back to auto config`);
  return AUTO_SUITE_CONFIG;
}

/**
 * Zustand store for MedAI Suites state management
 *
 * Manages clinical workflow suites including:
 * - Active suite selection (auto or manual)
 * - Suite detection results from DICOM metadata analysis
 * - User preferences for suite mode
 *
 * Only the mode preference is persisted to localStorage.
 * Detection state is transient and recomputed on each study load.
 *
 * @example
 * ```typescript
 * import { useSuiteStore } from '@medai/core/stores/suiteStore';
 *
 * function SuiteSelector() {
 *   const { activeSuiteId, mode, setActiveSuite, setMode } = useSuiteStore();
 *
 *   return (
 *     <select
 *       value={activeSuiteId}
 *       onChange={(e) => setActiveSuite(e.target.value as SuiteId)}
 *     >
 *       <option value="auto">Auto-detect</option>
 *       <option value="oncology">Oncology</option>
 *       <option value="neurology">Neurology</option>
 *     </select>
 *   );
 * }
 * ```
 */
export const useSuiteStore = create<SuiteStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveSuite: (suiteId: SuiteId, mode?: SuiteMode) => {
        // If setting to a specific suite (not 'auto'), default to manual mode
        const newMode = mode ?? (suiteId === 'auto' ? 'auto' : 'manual');

        set({
          activeSuiteId: suiteId,
          mode: newMode,
        });
      },

      setMode: (mode: SuiteMode) => {
        const state = get();

        if (mode === 'auto' && state.lastDetectedSuiteId) {
          // When switching to auto mode, use the last detected suite
          set({
            mode,
            activeSuiteId: state.lastDetectedSuiteId,
          });
        } else if (mode === 'auto') {
          // No detection available, use 'auto' suite
          set({
            mode,
            activeSuiteId: 'auto',
          });
        } else {
          // Manual mode - keep current suite
          set({ mode });
        }
      },

      setDetectionResult: (suiteId: SuiteId, confidence: number, criteria: string[]) => {
        const state = get();

        // Clamp confidence to 0-1 range
        const clampedConfidence = Math.max(0, Math.min(1, confidence));

        const updates: Partial<SuiteState> = {
          lastDetectedSuiteId: suiteId,
          detectionConfidence: clampedConfidence,
          detectionCriteria: criteria,
        };

        // Update the active suite if:
        // 1. Mode is 'auto' (normal auto-detection behavior), OR
        // 2. Active suite is still 'auto' (default state - user hasn't explicitly chosen a suite)
        // This ensures detection works even if mode got stuck as 'manual' without an explicit selection
        if (state.mode === 'auto' || state.activeSuiteId === 'auto') {
          updates.activeSuiteId = suiteId;
          // Also reset mode to 'auto' if we're applying detection results
          if (state.mode !== 'auto') {
            updates.mode = 'auto';
          }
        }

        set(updates);
      },

      getActiveSuiteConfig: () => {
        const state = get();
        return getSuiteConfig(state.activeSuiteId);
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'medai-suite-preferences',
      // Only persist mode preference, not detection state
      partialize: (state) => ({
        mode: state.mode,
      }),
    }
  )
);

export default useSuiteStore;
