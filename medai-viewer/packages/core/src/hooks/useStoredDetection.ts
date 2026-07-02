/**
 * useStoredDetection Types & Utilities
 *
 * Type definitions and utility functions for loading stored AI detection results.
 * The actual React hook implementation should be in the viewer app since core
 * doesn't have React as a dependency.
 */

import { useDetectionStore } from '../stores/detectionStore';
import { autoDetectionService, AutoDetectionService, type StoredDetectionResult } from '../services/AutoDetectionService';

export interface UseStoredDetectionOptions {
  /** Orthanc instance ID to load detections for */
  instanceId: string | null;
  /** Whether to automatically load detections on mount */
  autoLoad?: boolean;
  /** Whether to skip loading if detections already exist in store */
  skipIfExists?: boolean;
}

export interface UseStoredDetectionResult {
  /** Whether loading is in progress */
  isLoading: boolean;
  /** The stored detection result (if found) */
  storedDetection: StoredDetectionResult | null;
  /** Error message if loading failed */
  error: string | null;
  /** Whether stored detections were found */
  hasStoredDetection: boolean;
  /** Manually reload stored detections */
  reload: () => Promise<void>;
}

/**
 * Load stored detection for a single instance (non-React utility)
 *
 * @param instanceId - Orthanc instance ID
 * @param skipIfExists - Skip if detections already in store
 * @returns Stored detection result or null
 */
export async function loadStoredDetectionForInstance(
  instanceId: string,
  skipIfExists = true
): Promise<StoredDetectionResult | null> {
  const { setDetections, getDetectionsForImage } = useDetectionStore.getState();

  // Check if we should skip (detections already exist)
  if (skipIfExists) {
    const existingDetections = getDetectionsForImage(instanceId);
    if (existingDetections.length > 0) {
      console.log('[loadStoredDetection] Skipping: detections already in store');
      return null;
    }
  }

  try {
    // Check for stored detection
    const stored = await autoDetectionService.getStoredDetection(instanceId);

    if (stored?.status === 'success' && stored.detections.length > 0) {
      // Convert to Detection[] and add to store
      const detections = AutoDetectionService.toDetections(stored);
      setDetections(instanceId, detections, stored.description, stored.processingTimeMs);

      console.log(
        `[loadStoredDetection] Loaded ${detections.length} stored detections for instance ${instanceId}`
      );
    }

    return stored;
  } catch (err) {
    console.error('[loadStoredDetection] Error loading stored detections:', err);
    return null;
  }
}

/**
 * Preload stored detections for multiple instances
 *
 * Useful for preloading detections when browsing a study
 * to avoid delays when switching between images.
 *
 * @param instanceIds - Array of Orthanc instance IDs to preload
 */
export async function preloadStoredDetections(instanceIds: string[]): Promise<void> {
  const { setDetections } = useDetectionStore.getState();

  await Promise.all(
    instanceIds.map(async (instanceId) => {
      try {
        const stored = await autoDetectionService.getStoredDetection(instanceId);

        if (stored?.status === 'success' && stored.detections.length > 0) {
          const detections = AutoDetectionService.toDetections(stored);
          setDetections(instanceId, detections, stored.description, stored.processingTimeMs);
        }
      } catch (err) {
        console.warn(`[preloadStoredDetections] Failed to load for ${instanceId}:`, err);
      }
    })
  );
}
