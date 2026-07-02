import React from 'react';
import {
  useViewerStore,
  useLongitudinalStore,
  useActiveTimepoints,
  useIsLongitudinalActive,
} from '@medai/core';
import { FileDropZone } from './FileDropZone';
import { Viewport } from './Viewport';
import { Viewport2D } from './Viewport2D';
import { LongitudinalViewport } from './LongitudinalViewport';
import { LongitudinalViewport2D } from './LongitudinalViewport2D';
import { ChatPanel } from './ChatPanel';
import { isFeatureEnabled } from '@medai/core';

export function ViewportArea() {
  const { activeImageId, isLoading, loadingError, images } = useViewerStore();
  const { layoutMode } = useLongitudinalStore();
  const isLongitudinalActive = useIsLongitudinalActive();
  const timepoints = useActiveTimepoints();

  // Determine if active image is 2D or 3D
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;
  const is2D = activeImage?.metadata.dimensionality === '2D';

  // For longitudinal mode, check if all timepoints are 2D
  const isLongitudinal2D = isLongitudinalActive && timepoints.length > 0 && timepoints.every((tp) => {
    const img = images.get(tp.imageId);
    return img?.metadata.dimensionality === '2D';
  });

  // Check if we should render longitudinal layout
  const shouldRenderLongitudinal = isLongitudinalActive &&
    (layoutMode === 'longitudinal-2' || layoutMode === 'longitudinal-3') &&
    timepoints.length >= 2;

  return (
    <main className="flex-1 flex flex-col bg-background-primary overflow-hidden">
      {/* Viewport container */}
      <div className="flex-1 p-4 relative overflow-hidden">
        {/* Subtle vignette effect */}
        <div className="absolute inset-0 pointer-events-none vignette" />

        {isLoading && (
          <div className="h-full flex items-center justify-center relative z-10">
            <div className="text-center animate-fade-in">
              <div className="relative mx-auto mb-4">
                <div className="w-12 h-12 border-2 border-accent-primary/20 rounded-full" />
                <div className="absolute inset-0 w-12 h-12 border-2 border-accent-primary border-t-transparent rounded-full animate-spin-smooth" />
              </div>
              <p className="text-text-secondary">Loading image...</p>
            </div>
          </div>
        )}

        {loadingError && (
          <div className="h-full flex items-center justify-center relative z-10">
            <div className="text-center animate-fade-in">
              <p className="text-accent-error mb-2 font-medium">Failed to load image</p>
              <p className="text-text-muted text-sm">{loadingError}</p>
            </div>
          </div>
        )}

        {!isLoading && !loadingError && !activeImageId && !shouldRenderLongitudinal && (
          <div className="h-full flex items-center justify-center relative z-10">
            <div className="max-w-md w-full animate-page-reveal">
              <FileDropZone />
            </div>
          </div>
        )}

        {/* Longitudinal comparison view */}
        {!isLoading && !loadingError && shouldRenderLongitudinal && (
          <div className="h-full relative z-10">
            {isLongitudinal2D ? (
              <LongitudinalViewport2D layout={layoutMode} />
            ) : (
              <LongitudinalViewport layout={layoutMode} />
            )}
          </div>
        )}

        {/* Standard single-image view (only when not in longitudinal mode) */}
        {!isLoading && !loadingError && activeImageId && !shouldRenderLongitudinal && (
          <div className="h-full relative z-10">
            {is2D
              ? <Viewport2D imageId={activeImageId} />
              : <Viewport imageId={activeImageId} />
            }
          </div>
        )}
      </div>

      {/* Bottom Chat Panel - Ask MedAI (only when the chat feature is enabled) */}
      {isFeatureEnabled('chat') && <ChatPanel />}
    </main>
  );
}
