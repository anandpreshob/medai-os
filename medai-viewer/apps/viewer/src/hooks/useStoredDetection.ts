/**
 * useStoredDetection Hook
 *
 * React hook to automatically load stored AI detection results when viewing an image.
 * Fetches pre-computed detections from Orthanc attachments and populates
 * the detection store.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  useDetectionStore,
  autoDetectionService,
  AutoDetectionService,
  isFeatureEnabled,
  type StoredDetectionResult,
  type UseStoredDetectionOptions,
  type UseStoredDetectionResult,
} from '@medai/core';

/**
 * Hook to load stored AI detections for a DICOM instance
 *
 * When an instance ID is provided, this hook automatically checks
 * Orthanc for stored detection results and loads them into the
 * detection store for display.
 *
 * @example
 * ```tsx
 * const { isLoading, hasStoredDetection, error } = useStoredDetection({
 *   instanceId: currentInstance?.id,
 *   autoLoad: true,
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (hasStoredDetection) return <DetectionOverlay />;
 * ```
 */
export function useStoredDetection({
  instanceId,
  autoLoad = true,
  skipIfExists = true,
}: UseStoredDetectionOptions): UseStoredDetectionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [storedDetection, setStoredDetection] = useState<StoredDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setDetections, getDetectionsForImage } = useDetectionStore();

  const loadStoredDetection = useCallback(async () => {
    if (!instanceId || !isFeatureEnabled('chestxray')) {
      return;
    }

    // Check if we should skip (detections already exist)
    if (skipIfExists) {
      const existingDetections = getDetectionsForImage(instanceId);
      if (existingDetections.length > 0) {
        console.log('[useStoredDetection] Skipping: detections already in store');
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check for stored detection
      const stored = await autoDetectionService.getStoredDetection(instanceId);

      if (stored) {
        setStoredDetection(stored);

        if (stored.status === 'success' && stored.detections.length > 0) {
          // Convert to Detection[] and add to store
          const detections = AutoDetectionService.toDetections(stored);
          setDetections(instanceId, detections, stored.description, stored.processingTimeMs);

          console.log(
            `[useStoredDetection] Loaded ${detections.length} stored detections for instance ${instanceId}`
          );
        } else if (stored.status === 'error') {
          console.log('[useStoredDetection] Stored detection has error status:', stored.error);
        }
      } else {
        console.log('[useStoredDetection] No stored detections found');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load detections';
      setError(message);
      console.error('[useStoredDetection] Error loading stored detections:', err);
    } finally {
      setIsLoading(false);
    }
  }, [instanceId, skipIfExists, getDetectionsForImage, setDetections]);

  // Auto-load on mount or when instanceId changes
  useEffect(() => {
    if (autoLoad && instanceId) {
      loadStoredDetection();
    }
  }, [autoLoad, instanceId, loadStoredDetection]);

  // Reset state when instanceId changes
  useEffect(() => {
    if (!instanceId) {
      setStoredDetection(null);
      setError(null);
    }
  }, [instanceId]);

  return {
    isLoading,
    storedDetection,
    error,
    hasStoredDetection: storedDetection !== null,
    reload: loadStoredDetection,
  };
}
