/**
 * LongitudinalViewport2D - 2D Image Comparison View
 *
 * Simpler 2D version for X-ray comparison (CR/DX modalities).
 * Renders 2 or 3 single viewports side-by-side with pan/zoom sync.
 * No slice scrolling since these are single-frame images.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  useViewerStore,
  useLongitudinalStore,
  useActiveTimepoints,
  LongitudinalTimepoint,
  LongitudinalLayoutMode,
} from '@medai/core';
import {
  initCornerstone,
  create2DViewport,
  setup2DToolGroup,
  RENDERING_ENGINE_ID,
} from '../lib/cornerstone';
import {
  setupLongitudinalSynchronizers,
  destroyAllLongitudinalSynchronizers,
} from '../lib/viewportSynchronization';
import { SyncToggle } from './SyncToggle';
import { BoundingBoxOverlay } from './overlays/BoundingBoxOverlay';
import { OrientationMarkerOverlay } from './OrientationMarkerOverlay';
import { ScaleOverlay } from './ScaleOverlay';

interface LongitudinalViewport2DProps {
  layout: LongitudinalLayoutMode;
}

/**
 * Get 2D viewport ID for a timepoint index
 */
function get2DViewportId(timepointIndex: number): string {
  const suffix = timepointIndex === 0 ? 'baseline' : `followup${timepointIndex}`;
  return `view2d-${suffix}`;
}

/**
 * Single 2D viewport panel for one timepoint
 */
function Timepoint2DPanel({
  timepoint,
  timepointIndex,
  viewportRef,
  isLoading,
  isReady,
  label,
  viewportDimensions,
  showOrientationMarker,
  showScaleOverlay,
}: {
  timepoint: LongitudinalTimepoint;
  timepointIndex: number;
  viewportRef: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
  isReady: boolean;
  label: string;
  viewportDimensions: { width: number; height: number };
  showOrientationMarker: boolean;
  showScaleOverlay: boolean;
}) {
  const { images } = useViewerStore();
  const viewportId = get2DViewportId(timepointIndex);
  const image = images.get(timepoint.imageId);
  const metadata = image?.metadata;

  return (
    <div className="flex flex-col h-full">
      {/* Timepoint header */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-secondary/80 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {timepoint.studyDate && (
            <span className="text-xs text-text-muted">{timepoint.studyDate}</span>
          )}
          {metadata?.modality && (
            <span className="text-xs bg-accent-primary/30 px-1.5 py-0.5 rounded">
              {metadata.modality}
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted">
          {timepointIndex === 0 ? 'Baseline' : `Follow-up ${timepointIndex}`}
        </div>
      </div>

      {/* 2D Viewport */}
      <div className="flex-1 bg-black rounded-lg relative overflow-hidden m-1">
        <div
          ref={viewportRef}
          className="w-full h-full"
          style={{ minHeight: '300px' }}
          data-viewport-id={viewportId}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Orientation and Scale Overlays */}
        <OrientationMarkerOverlay
          viewportId={viewportId}
          viewportType="axial"
          visible={showOrientationMarker}
        />
        <ScaleOverlay
          viewportId={viewportId}
          visible={showScaleOverlay}
        />

        {/* Bounding box overlay for AI detections */}
        {isReady && viewportDimensions.width > 0 && metadata && (
          <BoundingBoxOverlay
            imageId={timepoint.imageId}
            imageWidth={metadata.width}
            imageHeight={metadata.height}
            viewportWidth={viewportDimensions.width}
            viewportHeight={viewportDimensions.height}
          />
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-text-muted">
              <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm">Loading...</p>
            </div>
          </div>
        )}

        {/* Image info overlay */}
        {metadata && (
          <div className="absolute bottom-2 left-2 text-white text-xs space-y-1 bg-black/50 px-2 py-1 rounded">
            <p>
              {metadata.width} x {metadata.height}
            </p>
            {metadata.format && (
              <p className="text-text-muted">{metadata.format.toUpperCase()}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function LongitudinalViewport2D({ layout }: LongitudinalViewport2DProps) {
  const timepoints = useActiveTimepoints();
  const { images, showOrientationMarker, showScaleOverlay } = useViewerStore();
  const { syncSettings, syncEnabled } = useLongitudinalStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [readyStates, setReadyStates] = useState<Record<string, boolean>>({});
  const [viewportDimensions, setViewportDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [error, setError] = useState<string | null>(null);

  // Create refs for each timepoint's viewport
  const tp0Ref = useRef<HTMLDivElement>(null);
  const tp1Ref = useRef<HTMLDivElement>(null);
  const tp2Ref = useRef<HTMLDivElement>(null);
  const refs = [tp0Ref, tp1Ref, tp2Ref];

  // Determine number of timepoints to display
  const maxTimepoints = layout === 'longitudinal-3' ? 3 : 2;
  const displayedTimepoints = timepoints.slice(0, maxTimepoints);

  // Initialize Cornerstone3D
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await initCornerstone();
        if (mounted) {
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('[LongitudinalViewport2D] Failed to initialize Cornerstone3D:', err);
        if (mounted) {
          setError('Failed to initialize rendering engine');
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Setup viewports for each timepoint
  useEffect(() => {
    if (!isInitialized || displayedTimepoints.length === 0) {
      return;
    }

    let mounted = true;

    async function setupTimepoints() {
      for (let i = 0; i < displayedTimepoints.length; i++) {
        const timepoint = displayedTimepoints[i];
        const viewportRef = refs[i];
        const viewportId = get2DViewportId(i);

        if (!viewportRef.current) {
          console.warn('[LongitudinalViewport2D] Viewport ref not ready for timepoint', i);
          continue;
        }

        // Get the image for this timepoint
        const image = images.get(timepoint.imageId);
        if (!image) {
          console.warn('[LongitudinalViewport2D] Image not found for timepoint', timepoint.imageId);
          continue;
        }

        setLoadingStates((prev) => ({ ...prev, [timepoint.id]: true }));

        try {
          // Create 2D viewport with unique ID for this timepoint
          await create2DViewport(viewportRef.current, image, viewportId);

          if (!mounted) return;

          // Setup tool group for this viewport
          // Note: setup2DToolGroup uses a shared 'medai2DToolGroup' - all viewports are added to it
          setup2DToolGroup([viewportId]);

          // Update dimensions for overlay positioning
          setViewportDimensions((prev) => ({
            ...prev,
            [timepoint.id]: {
              width: viewportRef.current?.offsetWidth || 0,
              height: viewportRef.current?.offsetHeight || 0,
            },
          }));

          setLoadingStates((prev) => ({ ...prev, [timepoint.id]: false }));
          setReadyStates((prev) => ({ ...prev, [timepoint.id]: true }));

          console.log('[LongitudinalViewport2D] Setup complete for timepoint', i, timepoint.label);
        } catch (err) {
          console.error('[LongitudinalViewport2D] Failed to setup timepoint', i, err);
          if (mounted) {
            setLoadingStates((prev) => ({ ...prev, [timepoint.id]: false }));
          }
        }
      }

      // Setup synchronizers after all viewports are ready
      if (mounted && syncEnabled) {
        setupSynchronizers();
      }
    }

    setupTimepoints();

    return () => {
      mounted = false;
      destroyAllLongitudinalSynchronizers();
    };
  }, [isInitialized, displayedTimepoints, images]);

  // Setup synchronizers when sync settings change
  const setupSynchronizers = useCallback(() => {
    if (!syncEnabled || displayedTimepoints.length < 2) {
      destroyAllLongitudinalSynchronizers();
      return;
    }

    // For 2D, all viewports sync together (no orientation groups)
    const viewportIds = displayedTimepoints.map((_, i) => get2DViewportId(i));

    setupLongitudinalSynchronizers(
      [viewportIds], // Single group for 2D
      syncSettings,
      RENDERING_ENGINE_ID,
      true // 2D mode
    );
  }, [syncEnabled, syncSettings, displayedTimepoints]);

  // Update synchronizers when sync settings or enabled state changes
  useEffect(() => {
    const allReady = displayedTimepoints.every((tp) => readyStates[tp.id]);
    if (allReady && displayedTimepoints.length >= 2) {
      setupSynchronizers();
    }
  }, [syncEnabled, syncSettings, readyStates, setupSynchronizers]);

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      const newDimensions: Record<string, { width: number; height: number }> = {};
      displayedTimepoints.forEach((tp, i) => {
        const ref = refs[i];
        if (ref.current) {
          newDimensions[tp.id] = {
            width: ref.current.offsetWidth,
            height: ref.current.offsetHeight,
          };
        }
      });
      setViewportDimensions(newDimensions);
    };

    // Debounced resize handler
    let resizeTimeout: NodeJS.Timeout | null = null;
    const debouncedResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(updateDimensions, 100);
    };

    window.addEventListener('resize', debouncedResize);

    // ResizeObserver for container changes
    const resizeObserver = new ResizeObserver(debouncedResize);
    refs.forEach((ref) => {
      if (ref.current) {
        resizeObserver.observe(ref.current);
      }
    });

    return () => {
      window.removeEventListener('resize', debouncedResize);
      resizeObserver.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [displayedTimepoints]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyAllLongitudinalSynchronizers();
    };
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        <div className="text-center">
          <p className="text-lg mb-2 font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (displayedTimepoints.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        <div className="text-center">
          <p className="text-lg mb-2">No Timepoints Selected</p>
          <p className="text-sm">Select at least 2 timepoints to compare.</p>
        </div>
      </div>
    );
  }

  if (displayedTimepoints.length === 1) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        <div className="text-center">
          <p className="text-lg mb-2">Single Timepoint</p>
          <p className="text-sm">Add another timepoint for comparison.</p>
        </div>
      </div>
    );
  }

  // Grid columns based on layout
  const gridCols = layout === 'longitudinal-3' ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="h-full flex flex-col">
      {/* Sync controls header */}
      <div className="flex items-center justify-between px-4 py-2 bg-background-secondary/50 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">
            Comparing {displayedTimepoints.length} X-ray images
          </span>
          <span className="text-xs text-text-muted">
            Research use only - Not for primary diagnostic use
          </span>
        </div>
        <SyncToggle />
      </div>

      {/* Timepoint comparison grid */}
      <div className={`flex-1 grid ${gridCols} gap-2 p-2`}>
        {displayedTimepoints.map((timepoint, index) => (
          <Timepoint2DPanel
            key={timepoint.id}
            timepoint={timepoint}
            timepointIndex={index}
            viewportRef={refs[index]}
            isLoading={loadingStates[timepoint.id] || !isInitialized}
            isReady={readyStates[timepoint.id] || false}
            label={timepoint.label}
            viewportDimensions={viewportDimensions[timepoint.id] || { width: 0, height: 0 }}
            showOrientationMarker={showOrientationMarker}
            showScaleOverlay={showScaleOverlay}
          />
        ))}
      </div>
    </div>
  );
}
