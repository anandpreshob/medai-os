'use client';

import React from 'react';

interface OrientationMarkerOverlayProps {
  viewportId: string;
  viewportType?: 'axial' | 'sagittal' | 'coronal' | 'volume';
  visible: boolean;
}

/**
 * Displays anatomical orientation markers on viewport edges.
 * Shows appropriate labels based on viewport plane:
 * - Axial: L/R (left/right), A/P (anterior/posterior)
 * - Sagittal: A/P (left/right edge), H/F (head/feet, top/bottom)
 * - Coronal: L/R (left/right), H/F (head/feet, top/bottom)
 */
export function OrientationMarkerOverlay({
  viewportId,
  viewportType = 'axial',
  visible,
}: OrientationMarkerOverlayProps) {
  if (!visible) return null;

  // Define orientation labels based on viewport type
  const getLabels = () => {
    switch (viewportType) {
      case 'axial':
        return { top: 'A', bottom: 'P', left: 'R', right: 'L' };
      case 'sagittal':
        return { top: 'H', bottom: 'F', left: 'A', right: 'P' };
      case 'coronal':
        return { top: 'H', bottom: 'F', left: 'R', right: 'L' };
      case 'volume':
      default:
        return { top: '', bottom: '', left: '', right: '' };
    }
  };

  const labels = getLabels();

  const labelStyle = 'absolute text-xs font-bold text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] select-none pointer-events-none';

  return (
    <div className="absolute inset-0 pointer-events-none z-10" data-viewport-overlay={viewportId}>
      {/* Top label */}
      {labels.top && (
        <div className={`${labelStyle} top-2 left-1/2 -translate-x-1/2`}>
          {labels.top}
        </div>
      )}
      {/* Bottom label */}
      {labels.bottom && (
        <div className={`${labelStyle} bottom-2 left-1/2 -translate-x-1/2`}>
          {labels.bottom}
        </div>
      )}
      {/* Left label */}
      {labels.left && (
        <div className={`${labelStyle} left-2 top-1/2 -translate-y-1/2`}>
          {labels.left}
        </div>
      )}
      {/* Right label */}
      {labels.right && (
        <div className={`${labelStyle} right-2 top-1/2 -translate-y-1/2`}>
          {labels.right}
        </div>
      )}
    </div>
  );
}

export default OrientationMarkerOverlay;
