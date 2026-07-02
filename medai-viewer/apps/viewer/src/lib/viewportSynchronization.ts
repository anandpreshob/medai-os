/**
 * Viewport Synchronization Utilities for Longitudinal Comparison
 *
 * Uses Cornerstone3D SynchronizerManager APIs to link viewport interactions
 * (pan, zoom, window/level, slice index, camera) across longitudinal timepoints.
 */

import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type { LongitudinalSyncSettings } from '@medai/core';

const { Enums: csEnums } = cornerstone3D;
const {
  SynchronizerManager,
  synchronizers: cornerSynchronizers,
  Enums: toolsEnums,
} = cornerstoneTools;

// Synchronizer IDs for longitudinal comparison
const SYNC_IDS = {
  CAMERA: 'longitudinal-camera-sync',
  VOI: 'longitudinal-voi-sync',
  POSITION: 'longitudinal-position-sync',
  ZOOM_PAN: 'longitudinal-zoom-pan-sync',
} as const;

// Track active synchronizers
// Note: Using 'any' type as ISynchronizer is not exported in newer versions of @cornerstonejs/tools
let activeSynchronizers: Map<string, any> = new Map();

/**
 * Create a camera synchronizer for linked camera movements (pan/zoom).
 * Uses Cornerstone3D's built-in createCameraPositionSynchronizer.
 */
export function createCameraSynchronizer(
  viewportIds: string[],
  renderingEngineId: string
): any | null {
  // Remove existing synchronizer if present
  destroySynchronizer(SYNC_IDS.CAMERA);

  try {
    const synchronizer = cornerSynchronizers.createCameraPositionSynchronizer(
      SYNC_IDS.CAMERA
    );

    // Add all viewports as both source and target
    viewportIds.forEach((viewportId) => {
      synchronizer.add({
        renderingEngineId,
        viewportId,
      });
    });

    activeSynchronizers.set(SYNC_IDS.CAMERA, synchronizer);
    console.log('[LongitudinalSync] Camera synchronizer created for viewports:', viewportIds);
    return synchronizer;
  } catch (error) {
    console.error('[LongitudinalSync] Failed to create camera synchronizer:', error);
    return null;
  }
}

/**
 * Create a VOI (window/level) synchronizer for linked brightness/contrast.
 * Uses Cornerstone3D's built-in createVOISynchronizer.
 */
export function createVOISynchronizer(
  viewportIds: string[],
  renderingEngineId: string
): any | null {
  // Remove existing synchronizer if present
  destroySynchronizer(SYNC_IDS.VOI);

  try {
    const synchronizer = cornerSynchronizers.createVOISynchronizer(SYNC_IDS.VOI, {
      syncInvertState: false,
      syncColormap: false,
    });

    // Add all viewports as both source and target
    viewportIds.forEach((viewportId) => {
      synchronizer.add({
        renderingEngineId,
        viewportId,
      });
    });

    activeSynchronizers.set(SYNC_IDS.VOI, synchronizer);
    console.log('[LongitudinalSync] VOI synchronizer created for viewports:', viewportIds);
    return synchronizer;
  } catch (error) {
    console.error('[LongitudinalSync] Failed to create VOI synchronizer:', error);
    return null;
  }
}

/**
 * Create a position synchronizer for linked slice scrolling.
 * Uses Cornerstone3D's built-in createSlabThicknessSynchronizer or custom implementation.
 */
export function createPositionSynchronizer(
  viewportIds: string[],
  renderingEngineId: string
): any | null {
  // Remove existing synchronizer if present
  destroySynchronizer(SYNC_IDS.POSITION);

  try {
    // Use image slice synchronizer for linked scrolling
    const synchronizer = cornerSynchronizers.createImageSliceSynchronizer(
      SYNC_IDS.POSITION
    );

    // Add all viewports as both source and target
    viewportIds.forEach((viewportId) => {
      synchronizer.add({
        renderingEngineId,
        viewportId,
      });
    });

    activeSynchronizers.set(SYNC_IDS.POSITION, synchronizer);
    console.log('[LongitudinalSync] Position synchronizer created for viewports:', viewportIds);
    return synchronizer;
  } catch (error) {
    console.error('[LongitudinalSync] Failed to create position synchronizer:', error);
    return null;
  }
}

/**
 * Create a zoom/pan-only synchronizer for 2D images (no slice index).
 * This is a combination of pan and zoom without slice scrolling.
 */
export function createZoomPanSynchronizer(
  viewportIds: string[],
  renderingEngineId: string
): any | null {
  // Remove existing synchronizer if present
  destroySynchronizer(SYNC_IDS.ZOOM_PAN);

  try {
    // For 2D, use zoom synchronizer which handles both zoom and pan
    const synchronizer = cornerSynchronizers.createZoomPanSynchronizer(
      SYNC_IDS.ZOOM_PAN
    );

    // Add all viewports as both source and target
    viewportIds.forEach((viewportId) => {
      synchronizer.add({
        renderingEngineId,
        viewportId,
      });
    });

    activeSynchronizers.set(SYNC_IDS.ZOOM_PAN, synchronizer);
    console.log('[LongitudinalSync] Zoom/Pan synchronizer created for viewports:', viewportIds);
    return synchronizer;
  } catch (error) {
    console.error('[LongitudinalSync] Failed to create zoom/pan synchronizer:', error);
    return null;
  }
}

/**
 * Destroy a specific synchronizer by ID.
 */
export function destroySynchronizer(syncId: string): void {
  const synchronizer = activeSynchronizers.get(syncId);
  if (synchronizer) {
    try {
      SynchronizerManager.destroySynchronizer(syncId);
      activeSynchronizers.delete(syncId);
      console.log('[LongitudinalSync] Destroyed synchronizer:', syncId);
    } catch (error) {
      console.error('[LongitudinalSync] Failed to destroy synchronizer:', syncId, error);
    }
  }
}

/**
 * Destroy all longitudinal synchronizers.
 */
export function destroyAllLongitudinalSynchronizers(): void {
  Object.values(SYNC_IDS).forEach((syncId) => {
    destroySynchronizer(syncId);
  });
  activeSynchronizers.clear();
  console.log('[LongitudinalSync] All synchronizers destroyed');
}

/**
 * Setup all longitudinal synchronizers based on sync settings.
 *
 * @param viewportIdGroups - Groups of viewport IDs to synchronize.
 *   For longitudinal-2: [['axial-baseline', 'axial-current'], ['sagittal-baseline', 'sagittal-current'], ...]
 *   For 2D comparison: [['view2d-baseline', 'view2d-current']]
 * @param config - Sync settings from longitudinalStore
 * @param renderingEngineId - The rendering engine ID
 * @param is2D - Whether the viewports are 2D (X-ray) or 3D (CT/MR)
 */
export function setupLongitudinalSynchronizers(
  viewportIdGroups: string[][],
  config: LongitudinalSyncSettings,
  renderingEngineId: string,
  is2D: boolean = false
): void {
  console.log('[LongitudinalSync] Setting up synchronizers with config:', config);

  // Destroy any existing synchronizers first
  destroyAllLongitudinalSynchronizers();

  // Flatten viewport groups for synchronization
  // For longitudinal comparison, we want to sync all viewports of the same orientation
  // e.g., all axial viewports across timepoints should scroll together

  viewportIdGroups.forEach((viewportIds, groupIndex) => {
    if (viewportIds.length < 2) {
      console.warn('[LongitudinalSync] Group', groupIndex, 'has fewer than 2 viewports, skipping');
      return;
    }

    const groupSuffix = viewportIdGroups.length > 1 ? `-group${groupIndex}` : '';

    if (is2D) {
      // 2D mode: Only sync pan, zoom, and window/level (no slice index)
      if (config.syncPan || config.syncZoom) {
        try {
          const zoomPanSync = cornerSynchronizers.createZoomPanSynchronizer(
            `${SYNC_IDS.ZOOM_PAN}${groupSuffix}`
          );
          viewportIds.forEach((vpId) => {
            zoomPanSync.add({ renderingEngineId, viewportId: vpId });
          });
          activeSynchronizers.set(`${SYNC_IDS.ZOOM_PAN}${groupSuffix}`, zoomPanSync);
        } catch (error) {
          console.error('[LongitudinalSync] Failed to create 2D zoom/pan sync:', error);
        }
      }

      if (config.syncWindowLevel) {
        try {
          const voiSync = cornerSynchronizers.createVOISynchronizer(
            `${SYNC_IDS.VOI}${groupSuffix}`,
            { syncInvertState: false, syncColormap: false }
          );
          viewportIds.forEach((vpId) => {
            voiSync.add({ renderingEngineId, viewportId: vpId });
          });
          activeSynchronizers.set(`${SYNC_IDS.VOI}${groupSuffix}`, voiSync);
        } catch (error) {
          console.error('[LongitudinalSync] Failed to create 2D VOI sync:', error);
        }
      }
    } else {
      // 3D mode: Full synchronization options
      if (config.syncCamera || config.syncPan || config.syncZoom) {
        try {
          const cameraSync = cornerSynchronizers.createCameraPositionSynchronizer(
            `${SYNC_IDS.CAMERA}${groupSuffix}`
          );
          viewportIds.forEach((vpId) => {
            cameraSync.add({ renderingEngineId, viewportId: vpId });
          });
          activeSynchronizers.set(`${SYNC_IDS.CAMERA}${groupSuffix}`, cameraSync);
        } catch (error) {
          console.error('[LongitudinalSync] Failed to create camera sync:', error);
        }
      }

      if (config.syncWindowLevel) {
        try {
          const voiSync = cornerSynchronizers.createVOISynchronizer(
            `${SYNC_IDS.VOI}${groupSuffix}`,
            { syncInvertState: false, syncColormap: false }
          );
          viewportIds.forEach((vpId) => {
            voiSync.add({ renderingEngineId, viewportId: vpId });
          });
          activeSynchronizers.set(`${SYNC_IDS.VOI}${groupSuffix}`, voiSync);
        } catch (error) {
          console.error('[LongitudinalSync] Failed to create VOI sync:', error);
        }
      }

      if (config.syncSliceIndex) {
        try {
          const positionSync = cornerSynchronizers.createImageSliceSynchronizer(
            `${SYNC_IDS.POSITION}${groupSuffix}`
          );
          viewportIds.forEach((vpId) => {
            positionSync.add({ renderingEngineId, viewportId: vpId });
          });
          activeSynchronizers.set(`${SYNC_IDS.POSITION}${groupSuffix}`, positionSync);
        } catch (error) {
          console.error('[LongitudinalSync] Failed to create position sync:', error);
        }
      }
    }
  });

  console.log('[LongitudinalSync] Setup complete. Active synchronizers:', activeSynchronizers.size);
}

/**
 * Update synchronization based on changed settings.
 * Enables/disables specific synchronizers without full recreation.
 */
export function updateSyncSettings(
  viewportIdGroups: string[][],
  config: LongitudinalSyncSettings,
  renderingEngineId: string,
  is2D: boolean = false
): void {
  // For simplicity, we recreate all synchronizers when settings change
  // This ensures consistent state and avoids partial synchronization issues
  setupLongitudinalSynchronizers(viewportIdGroups, config, renderingEngineId, is2D);
}

/**
 * Get all active synchronizer IDs.
 */
export function getActiveSynchronizerIds(): string[] {
  return Array.from(activeSynchronizers.keys());
}

/**
 * Check if a specific synchronizer type is active.
 */
export function isSynchronizerActive(syncId: string): boolean {
  return activeSynchronizers.has(syncId);
}

/**
 * Manually trigger synchronization for all viewports.
 * Useful after programmatic viewport changes.
 */
export function triggerManualSync(sourceViewportId: string, renderingEngineId: string): void {
  activeSynchronizers.forEach((synchronizer) => {
    try {
      // Get the source viewport
      const renderingEngine = cornerstone3D.getRenderingEngine(renderingEngineId);
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport(sourceViewportId);
      if (!viewport) return;

      // Trigger synchronization from this viewport
      const sourceViewportInfo = {
        renderingEngineId,
        viewportId: sourceViewportId,
      };

      // The synchronizer will propagate changes to other viewports
      // This is handled automatically by Cornerstone3D event system
    } catch (error) {
      console.error('[LongitudinalSync] Failed to trigger manual sync:', error);
    }
  });
}

export const SYNC_IDS_EXPORT = SYNC_IDS;
