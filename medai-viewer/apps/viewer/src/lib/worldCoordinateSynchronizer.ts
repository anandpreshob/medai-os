/**
 * worldCoordinateSynchronizer - Cross-resolution viewport synchronization
 *
 * Synchronizes multiple Cornerstone3D viewports using world coordinates
 * rather than pixel coordinates, allowing different resolution sequences
 * (T1, T2, FLAIR, DWI) to stay aligned during navigation.
 */

import type { Types as CornerstoneTypes } from '@cornerstonejs/core';

export interface SyncState {
  enabled: boolean;
  worldPosition: CornerstoneTypes.Point3 | null;
  worldFocalPoint: CornerstoneTypes.Point3 | null;
  camera: Partial<CornerstoneTypes.ICamera> | null;
}

export interface ViewportSyncConfig {
  viewportId: string;
  renderingEngineId: string;
  syncPosition: boolean;
  syncZoom: boolean;
  syncWindowLevel: boolean;
}

type SyncCallback = (state: SyncState, sourceViewportId: string) => void;

/**
 * Creates a world coordinate synchronizer for multi-sequence neuro workflows.
 *
 * Unlike pixel-based synchronization, this uses world coordinates (mm) so that
 * different resolution sequences stay aligned at the same anatomical location.
 */
export function createWorldPositionSynchronizer() {
  const viewports = new Map<string, ViewportSyncConfig>();
  const callbacks = new Map<string, SyncCallback>();
  let currentState: SyncState = {
    enabled: true,
    worldPosition: null,
    worldFocalPoint: null,
    camera: null,
  };
  let isUpdating = false;

  /**
   * Register a viewport for synchronization
   */
  function registerViewport(config: ViewportSyncConfig): void {
    viewports.set(config.viewportId, config);
  }

  /**
   * Unregister a viewport
   */
  function unregisterViewport(viewportId: string): void {
    viewports.delete(viewportId);
    callbacks.delete(viewportId);
  }

  /**
   * Subscribe to sync updates for a specific viewport
   */
  function subscribe(viewportId: string, callback: SyncCallback): () => void {
    callbacks.set(viewportId, callback);
    return () => callbacks.delete(viewportId);
  }

  /**
   * Called when a viewport's camera changes. Propagates to other viewports.
   */
  function handleCameraModified(
    sourceViewportId: string,
    camera: CornerstoneTypes.ICamera,
    worldFocalPoint: CornerstoneTypes.Point3
  ): void {
    if (!currentState.enabled || isUpdating) return;

    const sourceConfig = viewports.get(sourceViewportId);
    if (!sourceConfig) return;

    // Update current state
    currentState = {
      ...currentState,
      worldFocalPoint,
      worldPosition: worldFocalPoint, // For slice navigation
      camera: {
        position: camera.position,
        focalPoint: camera.focalPoint,
        viewUp: camera.viewUp,
        parallelScale: camera.parallelScale,
      },
    };

    // Propagate to other viewports
    isUpdating = true;
    try {
      viewports.forEach((config, viewportId) => {
        if (viewportId === sourceViewportId) return;

        const callback = callbacks.get(viewportId);
        if (callback) {
          callback(currentState, sourceViewportId);
        }
      });
    } finally {
      isUpdating = false;
    }
  }

  /**
   * Jump all synchronized viewports to a world position
   */
  function jumpToWorldPosition(worldPos: CornerstoneTypes.Point3): void {
    if (!currentState.enabled) return;

    currentState = {
      ...currentState,
      worldPosition: worldPos,
      worldFocalPoint: worldPos,
    };

    isUpdating = true;
    try {
      callbacks.forEach((callback, viewportId) => {
        callback(currentState, 'external');
      });
    } finally {
      isUpdating = false;
    }
  }

  /**
   * Enable or disable synchronization
   */
  function setEnabled(enabled: boolean): void {
    currentState = { ...currentState, enabled };
  }

  /**
   * Get current sync state
   */
  function getState(): SyncState {
    return currentState;
  }

  /**
   * Reset synchronizer state
   */
  function reset(): void {
    currentState = {
      enabled: true,
      worldPosition: null,
      worldFocalPoint: null,
      camera: null,
    };
    isUpdating = false;
  }

  /**
   * Destroy the synchronizer
   */
  function destroy(): void {
    viewports.clear();
    callbacks.clear();
    reset();
  }

  return {
    registerViewport,
    unregisterViewport,
    subscribe,
    handleCameraModified,
    jumpToWorldPosition,
    setEnabled,
    getState,
    reset,
    destroy,
  };
}

/**
 * Utility to convert canvas coordinates to world coordinates
 */
export function canvasToWorld(
  viewport: CornerstoneTypes.IViewport,
  canvasPos: CornerstoneTypes.Point2
): CornerstoneTypes.Point3 | null {
  try {
    return viewport.canvasToWorld(canvasPos);
  } catch {
    return null;
  }
}

/**
 * Utility to convert world coordinates to canvas coordinates
 */
export function worldToCanvas(
  viewport: CornerstoneTypes.IViewport,
  worldPos: CornerstoneTypes.Point3
): CornerstoneTypes.Point2 | null {
  try {
    return viewport.worldToCanvas(worldPos);
  } catch {
    return null;
  }
}

/**
 * Calculate the slice index from world position for a stack viewport
 */
export function worldToSliceIndex(
  viewport: CornerstoneTypes.IStackViewport,
  worldPos: CornerstoneTypes.Point3
): number | null {
  try {
    // Get the image IDs and their positions
    const imageIds = viewport.getImageIds();
    if (!imageIds || imageIds.length === 0) return null;

    // For stack viewports, find the closest slice
    const camera = viewport.getCamera();
    const viewPlaneNormal = camera.viewPlaneNormal;
    if (!viewPlaneNormal) return null;

    // Project world position onto view plane normal axis
    const projectedPosition =
      worldPos[0] * viewPlaneNormal[0] +
      worldPos[1] * viewPlaneNormal[1] +
      worldPos[2] * viewPlaneNormal[2];

    // Find closest slice (simplified - in practice would use image position metadata)
    return Math.round(
      ((projectedPosition - (-100)) / 200) * (imageIds.length - 1)
    );
  } catch {
    return null;
  }
}

/**
 * Apply synchronized camera state to a viewport
 */
export function applySyncState(
  viewport: CornerstoneTypes.IViewport,
  state: SyncState,
  options: { syncPosition?: boolean; syncZoom?: boolean } = {}
): void {
  const { syncPosition = true, syncZoom = true } = options;

  if (!state.worldFocalPoint) return;

  try {
    // For stack viewports, jump to the appropriate slice
    if ('setImageIdIndex' in viewport) {
      const stackViewport = viewport as CornerstoneTypes.IStackViewport;
      const sliceIndex = worldToSliceIndex(stackViewport, state.worldFocalPoint);
      if (sliceIndex !== null) {
        const currentIndex = stackViewport.getCurrentImageIdIndex();
        if (currentIndex !== sliceIndex) {
          stackViewport.setImageIdIndex(sliceIndex);
        }
      }
    }

    // Apply camera changes if available
    if (state.camera && syncZoom) {
      const currentCamera = viewport.getCamera();
      viewport.setCamera({
        ...currentCamera,
        parallelScale: state.camera.parallelScale,
      });
    }

    viewport.render();
  } catch (error) {
    console.warn('Failed to apply sync state:', error);
  }
}

export type WorldPositionSynchronizer = ReturnType<typeof createWorldPositionSynchronizer>;
