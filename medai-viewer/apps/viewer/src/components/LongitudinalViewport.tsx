/**
 * LongitudinalViewport - 3D MPR Comparison View
 *
 * Renders 2 or 3 MPR stacks side-by-side for longitudinal timepoint comparison.
 * Each timepoint gets unique viewportIds and loads its own volume.
 * Integrates synchronizers for linked navigation across timepoints.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  useViewerStore,
  useLongitudinalStore,
  useActiveTimepoints,
  LongitudinalTimepoint,
  LongitudinalLayoutMode,
} from '@medai/core';
import { OrientationMarkerOverlay } from './OrientationMarkerOverlay';
import { ScaleOverlay } from './ScaleOverlay';
import {
  initCornerstone,
  createVolumeFromLoadedImage,
  getRenderingEngine,
  cornerstone3D,
  setupToolGroup,
  RENDERING_ENGINE_ID,
} from '../lib/cornerstone';
import {
  setupLongitudinalSynchronizers,
  destroyAllLongitudinalSynchronizers,
} from '../lib/viewportSynchronization';
import { SyncToggle } from './SyncToggle';

interface LongitudinalViewportProps {
  layout: LongitudinalLayoutMode;
}

interface TimepointViewportRefs {
  timepointId: string;
  axial: React.RefObject<HTMLDivElement>;
  sagittal: React.RefObject<HTMLDivElement>;
  coronal: React.RefObject<HTMLDivElement>;
}

/**
 * Get viewport IDs for a timepoint index
 */
function getViewportIds(timepointIndex: number): {
  axial: string;
  sagittal: string;
  coronal: string;
} {
  const suffix = timepointIndex === 0 ? 'baseline' : `followup${timepointIndex}`;
  return {
    axial: `axial-${suffix}`,
    sagittal: `sagittal-${suffix}`,
    coronal: `coronal-${suffix}`,
  };
}

/**
 * Single MPR viewport panel for one timepoint
 */
function TimepointMPRPanel({
  timepoint,
  timepointIndex,
  refs,
  isLoading,
  isReady,
  label,
  showOrientationMarker,
  showScaleOverlay,
}: {
  timepoint: LongitudinalTimepoint;
  timepointIndex: number;
  refs: {
    axial: React.RefObject<HTMLDivElement>;
    sagittal: React.RefObject<HTMLDivElement>;
    coronal: React.RefObject<HTMLDivElement>;
  };
  isLoading: boolean;
  isReady: boolean;
  label: string;
  showOrientationMarker: boolean;
  showScaleOverlay: boolean;
}) {
  const viewportIds = getViewportIds(timepointIndex);

  return (
    <div className="flex flex-col h-full">
      {/* Timepoint header */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-secondary/80 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {timepoint.studyDate && (
            <span className="text-xs text-text-muted">{timepoint.studyDate}</span>
          )}
        </div>
        <div className="text-xs text-text-muted">
          {timepointIndex === 0 ? 'Baseline' : `Follow-up ${timepointIndex}`}
        </div>
      </div>

      {/* 3-up MPR grid */}
      <div className="flex-1 grid grid-cols-1 grid-rows-3 gap-1 p-1">
        {/* Axial */}
        <div className="bg-black rounded relative overflow-hidden">
          <div className="absolute top-1 left-1 text-white text-xs bg-black/50 px-1 py-0.5 rounded z-10">
            Axial
          </div>
          <div
            ref={refs.axial}
            className="w-full h-full"
            style={{ minHeight: '100px' }}
            data-viewport-id={viewportIds.axial}
            onContextMenu={(e) => e.preventDefault()}
          />
          <OrientationMarkerOverlay
            viewportId={viewportIds.axial}
            viewportType="axial"
            visible={showOrientationMarker}
          />
          <ScaleOverlay
            viewportId={viewportIds.axial}
            visible={showScaleOverlay}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {/* Sagittal */}
        <div className="bg-black rounded relative overflow-hidden">
          <div className="absolute top-1 left-1 text-white text-xs bg-black/50 px-1 py-0.5 rounded z-10">
            Sagittal
          </div>
          <div
            ref={refs.sagittal}
            className="w-full h-full"
            style={{ minHeight: '100px' }}
            data-viewport-id={viewportIds.sagittal}
            onContextMenu={(e) => e.preventDefault()}
          />
          <OrientationMarkerOverlay
            viewportId={viewportIds.sagittal}
            viewportType="sagittal"
            visible={showOrientationMarker}
          />
          <ScaleOverlay
            viewportId={viewportIds.sagittal}
            visible={showScaleOverlay}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {/* Coronal */}
        <div className="bg-black rounded relative overflow-hidden">
          <div className="absolute top-1 left-1 text-white text-xs bg-black/50 px-1 py-0.5 rounded z-10">
            Coronal
          </div>
          <div
            ref={refs.coronal}
            className="w-full h-full"
            style={{ minHeight: '100px' }}
            data-viewport-id={viewportIds.coronal}
            onContextMenu={(e) => e.preventDefault()}
          />
          <OrientationMarkerOverlay
            viewportId={viewportIds.coronal}
            viewportType="coronal"
            visible={showOrientationMarker}
          />
          <ScaleOverlay
            viewportId={viewportIds.coronal}
            visible={showScaleOverlay}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LongitudinalViewport({ layout }: LongitudinalViewportProps) {
  const timepoints = useActiveTimepoints();
  const { images, showOrientationMarker, showScaleOverlay } = useViewerStore();
  const { syncSettings, syncEnabled } = useLongitudinalStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [readyStates, setReadyStates] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Create refs for each timepoint's viewports
  const viewportRefs = useRef<TimepointViewportRefs[]>([]);

  // Determine number of timepoints to display
  const maxTimepoints = layout === 'longitudinal-3' ? 3 : 2;
  const displayedTimepoints = timepoints.slice(0, maxTimepoints);

  // Initialize refs for each timepoint
  useEffect(() => {
    viewportRefs.current = displayedTimepoints.map((tp) => ({
      timepointId: tp.id,
      axial: React.createRef<HTMLDivElement>(),
      sagittal: React.createRef<HTMLDivElement>(),
      coronal: React.createRef<HTMLDivElement>(),
    }));
  }, [displayedTimepoints.length]);

  // Create refs individually since we can't use hooks in a loop
  const tp0AxialRef = useRef<HTMLDivElement>(null);
  const tp0SagittalRef = useRef<HTMLDivElement>(null);
  const tp0CoronalRef = useRef<HTMLDivElement>(null);
  const tp1AxialRef = useRef<HTMLDivElement>(null);
  const tp1SagittalRef = useRef<HTMLDivElement>(null);
  const tp1CoronalRef = useRef<HTMLDivElement>(null);
  const tp2AxialRef = useRef<HTMLDivElement>(null);
  const tp2SagittalRef = useRef<HTMLDivElement>(null);
  const tp2CoronalRef = useRef<HTMLDivElement>(null);

  const refSets = [
    { axial: tp0AxialRef, sagittal: tp0SagittalRef, coronal: tp0CoronalRef },
    { axial: tp1AxialRef, sagittal: tp1SagittalRef, coronal: tp1CoronalRef },
    { axial: tp2AxialRef, sagittal: tp2SagittalRef, coronal: tp2CoronalRef },
  ];

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
        console.error('[LongitudinalViewport] Failed to initialize Cornerstone3D:', err);
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
      const renderingEngine = getRenderingEngine();
      if (!renderingEngine) {
        console.error('[LongitudinalViewport] No rendering engine available');
        return;
      }

      for (let i = 0; i < displayedTimepoints.length; i++) {
        const timepoint = displayedTimepoints[i];
        const refs = refSets[i];
        const viewportIds = getViewportIds(i);

        if (!refs.axial.current || !refs.sagittal.current || !refs.coronal.current) {
          console.warn('[LongitudinalViewport] Viewport refs not ready for timepoint', i);
          continue;
        }

        // Get the image for this timepoint
        const image = images.get(timepoint.imageId);
        if (!image) {
          console.warn('[LongitudinalViewport] Image not found for timepoint', timepoint.imageId);
          continue;
        }

        setLoadingStates((prev) => ({ ...prev, [timepoint.id]: true }));

        try {
          // Create volume from loaded image
          const { volumeId } = await createVolumeFromLoadedImage(image);

          if (!mounted) return;

          // Create viewports for this timepoint
          const viewportInputArray = [
            {
              viewportId: viewportIds.axial,
              type: cornerstone3D.Enums.ViewportType.ORTHOGRAPHIC,
              element: refs.axial.current,
              defaultOptions: {
                orientation: cornerstone3D.Enums.OrientationAxis.AXIAL,
                background: [0, 0, 0] as [number, number, number],
              },
            },
            {
              viewportId: viewportIds.sagittal,
              type: cornerstone3D.Enums.ViewportType.ORTHOGRAPHIC,
              element: refs.sagittal.current,
              defaultOptions: {
                orientation: cornerstone3D.Enums.OrientationAxis.SAGITTAL,
                background: [0, 0, 0] as [number, number, number],
              },
            },
            {
              viewportId: viewportIds.coronal,
              type: cornerstone3D.Enums.ViewportType.ORTHOGRAPHIC,
              element: refs.coronal.current,
              defaultOptions: {
                orientation: cornerstone3D.Enums.OrientationAxis.CORONAL,
                background: [0, 0, 0] as [number, number, number],
              },
            },
          ];

          renderingEngine.setViewports(viewportInputArray);

          // Set the volume on all viewports for this timepoint
          await cornerstone3D.setVolumesForViewports(
            renderingEngine,
            [{ volumeId }],
            [viewportIds.axial, viewportIds.sagittal, viewportIds.coronal]
          );

          // Setup tool group for this timepoint's viewports
          // Note: setupToolGroup uses a shared 'medaiToolGroup' - all viewports are added to it
          setupToolGroup([viewportIds.axial, viewportIds.sagittal, viewportIds.coronal]);

          // Render the viewports
          renderingEngine.renderViewports([viewportIds.axial, viewportIds.sagittal, viewportIds.coronal]);

          setLoadingStates((prev) => ({ ...prev, [timepoint.id]: false }));
          setReadyStates((prev) => ({ ...prev, [timepoint.id]: true }));

          console.log('[LongitudinalViewport] Setup complete for timepoint', i, timepoint.label);
        } catch (err) {
          console.error('[LongitudinalViewport] Failed to setup timepoint', i, err);
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

    // Group viewports by orientation for synchronization
    // e.g., all axial viewports should sync together
    const axialGroup: string[] = [];
    const sagittalGroup: string[] = [];
    const coronalGroup: string[] = [];

    displayedTimepoints.forEach((_, i) => {
      const ids = getViewportIds(i);
      axialGroup.push(ids.axial);
      sagittalGroup.push(ids.sagittal);
      coronalGroup.push(ids.coronal);
    });

    const viewportGroups = [axialGroup, sagittalGroup, coronalGroup];

    setupLongitudinalSynchronizers(
      viewportGroups,
      syncSettings,
      RENDERING_ENGINE_ID,
      false // 3D mode
    );
  }, [syncEnabled, syncSettings, displayedTimepoints]);

  // Update synchronizers when sync settings or enabled state changes
  useEffect(() => {
    const allReady = displayedTimepoints.every((tp) => readyStates[tp.id]);
    if (allReady && displayedTimepoints.length >= 2) {
      setupSynchronizers();
    }
  }, [syncEnabled, syncSettings, readyStates, setupSynchronizers]);

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
            Comparing {displayedTimepoints.length} timepoints
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
          <TimepointMPRPanel
            key={timepoint.id}
            timepoint={timepoint}
            timepointIndex={index}
            refs={refSets[index]}
            isLoading={loadingStates[timepoint.id] || !isInitialized}
            isReady={readyStates[timepoint.id] || false}
            label={timepoint.label}
            showOrientationMarker={showOrientationMarker}
            showScaleOverlay={showScaleOverlay}
          />
        ))}
      </div>
    </div>
  );
}
