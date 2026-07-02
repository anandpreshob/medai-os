'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';

interface ScaleOverlayProps {
  viewportId: string;
  renderingEngineId?: string;
  visible: boolean;
}

/**
 * Displays a dynamic scale ruler that updates based on viewport zoom level.
 * The ruler length adjusts to show nice round values (1mm, 2mm, 5mm, 10mm, 20mm, 50mm, etc.)
 */
export function ScaleOverlay({
  viewportId,
  renderingEngineId = 'myRenderingEngine',
  visible,
}: ScaleOverlayProps) {
  const [scaleInfo, setScaleInfo] = useState<{ lengthMm: number; lengthPx: number } | null>(null);

  const calculateScale = useCallback(() => {
    try {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport(viewportId);
      if (!viewport) return;

      // Get the camera properties
      const camera = viewport.getCamera();
      if (!camera || !camera.parallelScale) return;

      // parallelScale is half the viewport height in world coordinates (mm)
      const parallelScale = camera.parallelScale;

      // Get viewport element dimensions
      const element = viewport.element;
      if (!element) return;

      const viewportHeight = element.clientHeight;

      // Calculate mm per pixel
      const mmPerPixel = (parallelScale * 2) / viewportHeight;

      // Target ruler length in pixels (around 100px)
      const targetPx = 100;
      const rawMm = targetPx * mmPerPixel;

      // Round to nice values: 1, 2, 5, 10, 20, 50, 100, 200, 500...
      const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
      let niceMm = niceValues[0];
      for (const val of niceValues) {
        if (val <= rawMm * 1.5) {
          niceMm = val;
        } else {
          break;
        }
      }

      // Calculate actual pixel length for the nice mm value
      const nicePx = niceMm / mmPerPixel;

      setScaleInfo({ lengthMm: niceMm, lengthPx: nicePx });
    } catch (error) {
      // Silently handle errors when viewport isn't ready
    }
  }, [viewportId, renderingEngineId]);

  useEffect(() => {
    if (!visible) return;

    // Calculate initial scale
    calculateScale();

    // Listen for camera changes
    const handleCameraModified = (event: any) => {
      if (event.detail?.viewportId === viewportId) {
        calculateScale();
      }
    };

    // Use cornerstone events
    const element = document.querySelector(`[data-viewport-id="${viewportId}"]`);
    if (element) {
      element.addEventListener('CORNERSTONE_CAMERA_MODIFIED', handleCameraModified);
    }

    // Also set up interval as fallback
    const interval = setInterval(calculateScale, 500);

    return () => {
      if (element) {
        element.removeEventListener('CORNERSTONE_CAMERA_MODIFIED', handleCameraModified);
      }
      clearInterval(interval);
    };
  }, [visible, viewportId, calculateScale]);

  if (!visible || !scaleInfo) return null;

  return (
    <div
      className="absolute bottom-4 right-4 pointer-events-none z-10"
      data-scale-overlay={viewportId}
    >
      <div className="flex flex-col items-end gap-0.5">
        {/* Scale bar */}
        <div
          className="h-1 bg-white/90 shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          style={{ width: `${Math.max(20, Math.min(200, scaleInfo.lengthPx))}px` }}
        />
        {/* End caps */}
        <div
          className="flex justify-between"
          style={{ width: `${Math.max(20, Math.min(200, scaleInfo.lengthPx))}px` }}
        >
          <div className="w-0.5 h-2 bg-white/90 -mt-1.5" />
          <div className="w-0.5 h-2 bg-white/90 -mt-1.5" />
        </div>
        {/* Label */}
        <span className="text-xs font-medium text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] -mt-0.5">
          {scaleInfo.lengthMm >= 10
            ? `${scaleInfo.lengthMm} mm`
            : `${scaleInfo.lengthMm} mm`}
        </span>
      </div>
    </div>
  );
}

export default ScaleOverlay;
