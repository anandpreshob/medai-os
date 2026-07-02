import { useEffect, useRef } from 'react';
import { useSuiteStore, useViewerStore, WL_PRESETS } from '@medai/core';

/**
 * useSuiteEffects - Applies suite configuration effects when the active suite changes.
 *
 * This hook watches for changes to the active suite and applies side effects
 * when a suite is activated. It serves as a central coordinator for suite-driven
 * UI and behavior changes.
 *
 * Current effects:
 * - Logs suite change information to console for debugging
 * - Optionally applies the default W/L preset from the suite configuration
 *
 * Future effects may include:
 * - Updating toolbar visibility based on enabledTools
 * - Switching viewport layouts based on defaultLayout
 * - Initializing suite-specific analytics tracking
 *
 * @param options - Configuration options for the hook
 * @param options.applyDefaultWL - Whether to apply the suite's default W/L preset (default: false)
 *
 * @example
 * ```tsx
 * function App() {
 *   // Just log suite changes, don't auto-apply W/L
 *   useSuiteEffects();
 *
 *   return <Viewer />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function App() {
 *   // Apply default W/L preset when suite changes
 *   useSuiteEffects({ applyDefaultWL: true });
 *
 *   return <Viewer />;
 * }
 * ```
 */
export function useSuiteEffects(options: { applyDefaultWL?: boolean } = {}) {
  const { applyDefaultWL = false } = options;

  // Get suite store state and actions
  const activeSuiteId = useSuiteStore((state) => state.activeSuiteId);
  const getActiveSuiteConfig = useSuiteStore((state) => state.getActiveSuiteConfig);

  // Get viewer store action for setting window/level
  const setWindowLevel = useViewerStore((state) => state.setWindowLevel);

  // Track the previous suite ID to detect actual changes
  const prevSuiteIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip effect on initial mount or if suite hasn't actually changed
    if (prevSuiteIdRef.current === activeSuiteId) {
      return;
    }

    // Update the previous suite ID reference
    const previousSuiteId = prevSuiteIdRef.current;
    prevSuiteIdRef.current = activeSuiteId;

    // Skip 'auto' suite - it's the default state before detection
    if (activeSuiteId === 'auto') {
      console.log('[useSuiteEffects] Suite mode set to auto-detect');
      return;
    }

    // Get the suite configuration
    const suiteConfig = getActiveSuiteConfig();

    // Log suite change information
    console.log('[useSuiteEffects] Suite changed:', {
      from: previousSuiteId ?? 'none',
      to: activeSuiteId,
      suiteName: suiteConfig.name,
      defaultLayout: suiteConfig.defaultLayout,
      wlPresets: suiteConfig.wlPresets,
      enabledTools: suiteConfig.enabledTools,
      monaiTasks: suiteConfig.monaiTasks,
    });

    // Optionally apply the default W/L preset from the suite config
    if (applyDefaultWL && suiteConfig.wlPresets.length > 0) {
      const defaultPresetId = suiteConfig.wlPresets[0];
      const preset = WL_PRESETS[defaultPresetId];

      if (preset) {
        console.log('[useSuiteEffects] Applying default W/L preset:', {
          presetId: defaultPresetId,
          presetName: preset.name,
          windowWidth: preset.windowWidth,
          windowCenter: preset.windowCenter,
        });
        setWindowLevel(preset.windowWidth, preset.windowCenter);
      } else {
        console.warn(
          `[useSuiteEffects] W/L preset '${defaultPresetId}' not found in WL_PRESETS`
        );
      }
    }
  }, [activeSuiteId, getActiveSuiteConfig, applyDefaultWL, setWindowLevel]);
}

export default useSuiteEffects;
