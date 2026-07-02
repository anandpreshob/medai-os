import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useViewerStore, useSegmentationStore } from '@medai/core';
import { OrientationMarkerOverlay } from './OrientationMarkerOverlay';
import { ScaleOverlay } from './ScaleOverlay';
import {
  initCornerstone,
  createVolumeFromLoadedImage,
  createMPRViewports,
  setupToolGroup,
  cleanup,
  getViewportScrollInfo,
  scrollViewportToSlice,
  getRenderingEngine,
  cornerstone3D,
  cornerstoneTools,
  invalidateBrushCursor,
  adjustBrushSize,
  BRUSH_SIZE_STEP,
  resizeViewports,
  restoreSegmentationRepresentations,
} from '../lib/cornerstone';
import {
  create3DViewport,
  addAllSegmentSurfaces,
  setup3DClickHandler,
  subscribeToSegmentationChanges,
  clearAllSurfaces,
  is3DViewportReady,
  setup2DTo3DCrosshairSync,
  update3DCrosshairMarker,
  reset3DCamera,
} from '../lib/surface3D';

/**
 * Handle double-click to sync all viewports to the clicked location
 */
function handleViewportDoubleClick(viewportId: string, event: React.MouseEvent) {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) return;

  // Get canvas coordinates from the click event
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // Convert canvas coordinates to world coordinates
  const worldPos = viewport.canvasToWorld([canvasX, canvasY]);

  if (!worldPos) return;

  console.log('[MedAI] Double-click sync to world:', worldPos, 'from viewport:', viewportId);

  // Jump all viewports to this world position
  const viewportIds = ['axial', 'sagittal', 'coronal'];
  viewportIds.forEach((vpId) => {
    if (vpId === viewportId) return; // Skip the clicked viewport

    const vp = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
    if (vp) {
      try {
        cornerstoneTools.utilities.viewport.jumpToWorld(vp, worldPos);
      } catch (e) {
        console.error(`[MedAI] Failed to jump ${vpId}:`, e);
      }
    }
  });

  // Render all viewports
  engine.renderViewports(viewportIds);
}

/**
 * Handle single-click to update 3D crosshair position
 */
function handleViewportClick(viewportId: string, event: React.MouseEvent) {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) return;

  // Get canvas coordinates from the click event
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  // Convert canvas coordinates to world coordinates
  const canvasWorldPos = viewport.canvasToWorld([canvasX, canvasY]);

  if (!canvasWorldPos) return;

  console.log('[MedAI] ========================================');
  console.log('[MedAI] Click Event Details:');
  console.log('[MedAI]   Viewport:', viewportId);
  console.log('[MedAI]   Canvas coords:', `[${canvasX}, ${canvasY}]`);
  console.log('[MedAI]   Canvas→World:', `[${canvasWorldPos[0]}, ${canvasWorldPos[1]}, ${canvasWorldPos[2]}]`);

  // Jump all 2D viewports to the clicked position
  const viewportIds = ['axial', 'sagittal', 'coronal'];
  viewportIds.forEach((vpId) => {
    const vp = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
    if (vp) {
      try {
        cornerstoneTools.utilities.viewport.jumpToWorld(vp, canvasWorldPos);
      } catch (e) {
        console.error(`[MedAI] Failed to jump ${vpId}:`, e);
      }
    }
  });

  // Render all 2D viewports
  engine.renderViewports(viewportIds);

  console.log('[MedAI]   World position to use for crosshair:', `[${canvasWorldPos[0]}, ${canvasWorldPos[1]}, ${canvasWorldPos[2]}]`);
  console.log('[MedAI] ========================================');

  // Update 3D crosshair using the clicked world position directly
  if (is3DViewportReady()) {
    update3DCrosshairMarker(canvasWorldPos);
  }
}

interface ViewportProps {
  imageId: string;
}

// Scroll slider component for each viewport
function ScrollSlider({
  viewportId,
  isReady,
}: {
  viewportId: string;
  isReady: boolean;
}) {
  const [currentSlice, setCurrentSlice] = useState(0);
  const [totalSlices, setTotalSlices] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Update current slice from viewport
  useEffect(() => {
    if (!isReady) return;

    const updateSlice = () => {
      const info = getViewportScrollInfo(viewportId);
      if (info) {
        setCurrentSlice(info.currentIndex);
        setTotalSlices(info.totalSlices);
      }
    };

    // Initial update with delay to ensure viewport is ready
    const initTimer = setTimeout(updateSlice, 100);

    // Listen for camera changes
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(viewportId);
    if (viewport) {
      viewport.element.addEventListener(cornerstone3D.Enums.Events.CAMERA_MODIFIED, updateSlice);
      return () => {
        clearTimeout(initTimer);
        viewport.element.removeEventListener(cornerstone3D.Enums.Events.CAMERA_MODIFIED, updateSlice);
      };
    }

    return () => clearTimeout(initTimer);
  }, [viewportId, isReady]);

  const handleSliderChange = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!sliderRef.current || totalSlices === 0) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const percentage = Math.max(0, Math.min(1, y / rect.height));
      const newSlice = Math.round(percentage * (totalSlices - 1));

      setCurrentSlice(newSlice);
      scrollViewportToSlice(viewportId, newSlice);
    },
    [viewportId, totalSlices]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      handleSliderChange(e);
    },
    [handleSliderChange]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleSliderChange(e);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleSliderChange]);

  if (!isReady || totalSlices === 0) return null;

  const thumbPosition = totalSlices > 1 ? (currentSlice / (totalSlices - 1)) * 100 : 0;

  return (
    <div
      ref={sliderRef}
      className="absolute right-1 top-8 bottom-8 w-3 bg-black/30 rounded cursor-pointer z-20"
      onMouseDown={handleMouseDown}
      title={`Slice ${currentSlice + 1} / ${totalSlices}`}
    >
      {/* Track */}
      <div className="absolute inset-0 rounded bg-gray-700/50" />
      {/* Thumb */}
      <div
        className="absolute left-0 right-0 h-4 bg-accent-primary rounded shadow-lg"
        style={{
          top: `calc(${thumbPosition}% - 8px)`,
        }}
      />
      {/* Slice indicator */}
      <div
        className="absolute -left-10 text-white text-xs bg-black/70 px-1 rounded whitespace-nowrap"
        style={{
          top: `calc(${thumbPosition}% - 8px)`,
        }}
      >
        {currentSlice + 1}
      </div>
    </div>
  );
}

// View types for layout management
type ViewType = 'axial' | 'sagittal' | 'coronal' | '3d';

export function Viewport({ imageId }: ViewportProps) {
  const { images, showOrientationMarker, showScaleOverlay } = useViewerStore();
  const { segmentations } = useSegmentationStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [is3DReady, setIs3DReady] = useState(false);
  const [isGeneratingSurfaces, setIsGeneratingSurfaces] = useState(false);
  const [focusedView, setFocusedView] = useState<ViewType | null>(null);

  const axialRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const view3dRef = useRef<HTMLDivElement>(null);
  const has3DViewportInitialized = useRef(false);
  const initializedVolumeId = useRef<string | null>(null);

  const image = images.get(imageId);

  // Handle focus view toggle - clicking on focused view returns to grid
  const handleFocusView = useCallback((view: ViewType) => {
    setFocusedView((current) => (current === view ? null : view));
    // Trigger resize after layout change
    setTimeout(() => {
      resizeViewports();
    }, 50);
  }, []);

  // Initialize Cornerstone3D on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await initCornerstone();
        if (mounted) {
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize Cornerstone3D:', err);
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Failed to initialize rendering engine: ${errorMessage}`);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Create volume and setup viewports when image changes
  useEffect(() => {
    if (!isInitialized || !image) {
      return;
    }

    // Capture image reference to avoid TypeScript narrowing issues
    const currentImage = image;

    let mounted = true;

    async function setupViewports() {
      if (
        !axialRef.current ||
        !sagittalRef.current ||
        !coronalRef.current
      ) {
        return;
      }

      setIsLoading(true);
      setError(null);
      setViewportReady(false);

      try {
        // Create volume from loaded image
        const { volumeId: newVolumeId } = await createVolumeFromLoadedImage(currentImage);

        if (!mounted) return;

        setVolumeId(newVolumeId);

        // Create MPR viewports
        await createMPRViewports(
          {
            axial: axialRef.current,
            sagittal: sagittalRef.current,
            coronal: coronalRef.current,
          },
          newVolumeId
        );

        // Setup tools
        setupToolGroup(['axial', 'sagittal', 'coronal']);

        // Restore segmentation representations if any exist
        // This handles the case where user navigated away and came back
        await restoreSegmentationRepresentations('medaiToolGroup');

        setIsLoading(false);
        setViewportReady(true);
      } catch (err) {
        console.error('Failed to setup viewports:', err);
        if (mounted) {
          setError('Failed to render volume');
          setIsLoading(false);
        }
      }
    }

    setupViewports();

    return () => {
      mounted = false;
    };
  }, [isInitialized, image, imageId]);

  // NOTE: We intentionally do NOT call cleanup() on unmount here.
  // The user may navigate away (e.g., to /report) and come back, expecting
  // the image and segmentation to still be loaded. Cleanup should only happen
  // when explicitly loading a new image or resetting the viewer.

  // Handle Ctrl+scroll to adjust brush/eraser size
  const handleWheel = useCallback((e: WheelEvent) => {
    // Only handle when Ctrl (or Cmd on Mac) is pressed
    if (!e.ctrlKey && !e.metaKey) return;

    // Prevent default zoom behavior and slice scrolling
    e.preventDefault();
    e.stopPropagation();
    // Stop Cornerstone's StackScrollMouseWheelTool from receiving this event
    e.stopImmediatePropagation();

    // Scroll up = increase size, scroll down = decrease size
    const delta = e.deltaY < 0 ? BRUSH_SIZE_STEP : -BRUSH_SIZE_STEP;
    adjustBrushSize('medaiToolGroup', delta);
  }, []);

  // Attach wheel event listeners to viewport elements
  useEffect(() => {
    const refs = [axialRef, sagittalRef, coronalRef];

    refs.forEach((ref) => {
      if (ref.current) {
        // Use capture phase and passive: false to intercept before Cornerstone
        ref.current.addEventListener('wheel', handleWheel, { capture: true, passive: false });
      }
    });

    return () => {
      refs.forEach((ref) => {
        if (ref.current) {
          ref.current.removeEventListener('wheel', handleWheel, { capture: true });
        }
      });
    };
  }, [handleWheel]);

  // Handle viewport resize when container or window size changes
  useEffect(() => {
    if (!viewportReady) return;

    // Debounce the resize handler to avoid too many calls
    let resizeTimeout: NodeJS.Timeout | null = null;
    const debouncedResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        // Only resize if viewports have valid dimensions
        // Check if any viewport has non-zero dimensions
        const hasValidDimensions = [axialRef, sagittalRef, coronalRef].some((ref) => {
          return ref.current && ref.current.clientWidth > 0 && ref.current.clientHeight > 0;
        });

        if (hasValidDimensions) {
          resizeViewports();
        } else {
          console.warn('[MedAI] Skipping resize - viewports have zero dimensions');
        }
      }, 100);
    };

    // Window resize handler
    window.addEventListener('resize', debouncedResize);

    // ResizeObserver for container size changes (e.g., sidebar toggle)
    const resizeObserver = new ResizeObserver(debouncedResize);

    // Observe all viewport containers
    [axialRef, sagittalRef, coronalRef].forEach((ref) => {
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
  }, [viewportReady]);

  // Setup 3D viewport when MPR viewports are ready
  // NOTE: We use a ref to track initialization to prevent cleanup from running
  // on every re-render. This is critical - clearAllSurfaces() should only run
  // on true component unmount, not when dependencies change.
  useEffect(() => {
    if (!viewportReady || !view3dRef.current || !volumeId) {
      return;
    }

    // Skip if already initialized with the same volume (prevents re-running on re-renders)
    // But if volumeId changed (new image loaded), we need to re-initialize
    if (has3DViewportInitialized.current && initializedVolumeId.current === volumeId) {
      console.log('[MedAI] 3D viewport already initialized for this volume, skipping setup');
      return;
    }

    // If switching to a different volume, clear the old surfaces first
    if (has3DViewportInitialized.current && initializedVolumeId.current !== volumeId) {
      console.log('[MedAI] Volume changed, clearing old 3D surfaces');
      clearAllSurfaces();
      has3DViewportInitialized.current = false;
      setIs3DReady(false);
    }

    let mounted = true;
    let clickCleanup: (() => void) | undefined;

    async function setup3DView() {
      if (!view3dRef.current || !mounted) return;

      try {
        console.log('[MedAI] Setting up 3D viewport');
        await create3DViewport(view3dRef.current, volumeId ?? undefined);

        if (!mounted) return;

        has3DViewportInitialized.current = true;
        initializedVolumeId.current = volumeId;

        // Disabled: clicking 3D should NOT move 2D slices
        // clickCleanup = setup3DClickHandler(view3dRef.current);

        setIs3DReady(true);
        console.log('[MedAI] 3D viewport ready');

        // If there are existing segmentations, generate surfaces
        const state = useSegmentationStore.getState();
        if (state.segmentations.length > 0) {
          setIsGeneratingSurfaces(true);
          await addAllSegmentSurfaces();
          if (mounted) {
            setIsGeneratingSurfaces(false);
          }
        }
      } catch (err) {
        console.error('[MedAI] Failed to setup 3D viewport:', err);
        if (mounted) {
          setIs3DReady(false);
          has3DViewportInitialized.current = false;
          initializedVolumeId.current = null;
        }
      }
    }

    setup3DView();

    // Cleanup function - only runs on true unmount
    return () => {
      mounted = false;
      if (clickCleanup) {
        clickCleanup();
      }
      // Only clear surfaces if we actually initialized
      if (has3DViewportInitialized.current) {
        clearAllSurfaces();
        has3DViewportInitialized.current = false;
        initializedVolumeId.current = null;
        setIs3DReady(false);
      }
    };
  }, [viewportReady, volumeId]);

  // Setup 2D to 3D crosshair synchronization with slice plane intersection lines
  useEffect(() => {
    if (!is3DReady || !viewportReady) {
      return;
    }

    console.log('[MedAI] Setting up 2D→3D crosshair sync');
    const cleanup = setup2DTo3DCrosshairSync();

    return () => {
      cleanup();
    };
  }, [is3DReady, viewportReady]);

  // Subscribe to segmentation changes to update 3D surfaces
  useEffect(() => {
    if (!is3DReady) {
      return;
    }

    // Subscribe to segmentation data changes (brush tool, etc.)
    const unsubscribe = subscribeToSegmentationChanges();

    return () => {
      unsubscribe();
    };
  }, [is3DReady]);

  // Update 3D surfaces when segmentations change in the store
  useEffect(() => {
    if (!is3DReady || !is3DViewportReady()) {
      return;
    }

    // Don't trigger on initial mount
    if (segmentations.length === 0) {
      clearAllSurfaces();
      return;
    }

    setIsGeneratingSurfaces(true);
    addAllSegmentSurfaces().finally(() => {
      setIsGeneratingSurfaces(false);
    });
  }, [is3DReady, segmentations]);

  if (!image) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Image not found
      </div>
    );
  }

  const { metadata } = image;

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 p-4">
        <div className="text-center max-w-lg">
          <p className="text-lg mb-2 font-semibold">Error</p>
          <p className="text-sm mb-4 break-words">{error}</p>
          <p className="text-xs text-text-muted">
            Image: {metadata.width} x {metadata.height} x {metadata.depth}
          </p>
          <p className="text-xs text-text-muted mt-2">
            Check browser console (F12) for detailed logs
          </p>
        </div>
      </div>
    );
  }

  // Helper to render a viewport with its label and controls
  const renderViewport = (
    viewType: ViewType,
    ref: React.RefObject<HTMLDivElement>,
    label: string,
    isFocused: boolean,
    isSmall: boolean
  ) => {
    const isViewport3D = viewType === '3d';
    const viewportId = viewType === '3d' ? 'view3d' : viewType;

    return (
      <div className={`bg-black rounded-lg relative overflow-hidden h-full ${isSmall ? 'min-h-[120px]' : ''}`}>
        {/* Clickable Label */}
        <button
          onClick={() => handleFocusView(viewType)}
          className={`absolute top-2 left-2 text-white text-xs px-2 py-1 rounded z-10 transition-colors cursor-pointer ${
            isFocused
              ? 'bg-accent-primary hover:bg-accent-primary/80'
              : 'bg-black/50 hover:bg-black/70'
          }`}
          title={isFocused ? 'Click to return to grid view' : `Click to focus ${label}`}
        >
          {label}
          {isFocused && <span className="ml-1">×</span>}
        </button>

        {/* Reset Camera Button (3D only) */}
        {isViewport3D && (
          <button
            onClick={() => reset3DCamera()}
            className="absolute top-2 right-2 text-white text-xs bg-black/50 hover:bg-black/70 px-3 py-1 rounded z-10 transition-colors"
            title="Reset camera view"
          >
            Reset View
          </button>
        )}

        {/* Viewport Canvas */}
        <div
          ref={ref}
          className="w-full h-full"
          style={{ minHeight: isSmall ? '100px' : '200px' }}
          data-viewport-id={viewportId}
          onClick={!isViewport3D ? (e) => handleViewportClick(viewType, e) : undefined}
          onDoubleClick={!isViewport3D ? (e) => handleViewportDoubleClick(viewType, e) : undefined}
          onContextMenu={(e) => e.preventDefault()}
          onMouseLeave={!isViewport3D ? () => invalidateBrushCursor('medaiToolGroup') : undefined}
        />

        {/* Orientation and Scale Overlays (2D viewports only) */}
        {!isViewport3D && (
          <>
            <OrientationMarkerOverlay
              viewportId={viewportId}
              viewportType={viewType as 'axial' | 'sagittal' | 'coronal'}
              visible={showOrientationMarker}
            />
            <ScaleOverlay
              viewportId={viewportId}
              visible={showScaleOverlay}
            />
          </>
        )}

        {/* Scroll Slider (2D viewports only) */}
        {!isViewport3D && (
          <ScrollSlider
            viewportId={viewType}
            isReady={viewportReady}
          />
        )}

        {/* Loading Overlay */}
        {(isLoading || !isInitialized || (isViewport3D && isGeneratingSurfaces)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-text-muted">
              <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full mx-auto mb-2" />
              {!isSmall && (
                <p className="text-sm">
                  {isViewport3D && isGeneratingSurfaces
                    ? 'Generating 3D...'
                    : !isInitialized
                    ? 'Initializing...'
                    : 'Loading...'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Image dimensions (Axial view only, when not small) */}
        {viewType === 'axial' && !isSmall && (
          <div className="absolute bottom-2 left-2 text-white text-xs space-y-1 bg-black/50 px-2 py-1 rounded">
            <p>
              {metadata.width} x {metadata.height} x {metadata.depth}
            </p>
            <p>
              {metadata.spacingX.toFixed(2)} x {metadata.spacingY.toFixed(2)} x{' '}
              {metadata.spacingZ.toFixed(2)} mm
            </p>
          </div>
        )}

        {/* 3D hint when no segmentations */}
        {isViewport3D && is3DReady && !isGeneratingSurfaces && segmentations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-text-muted text-sm text-center px-4">
              {isSmall ? 'No segmentation' : 'Load a segmentation label\nto view 3D surface'}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Compute CSS for the grid layout based on focus state
  // IMPORTANT: All 4 viewports must stay as direct children of ONE container
  // to preserve WebGL contexts (React unmounts elements when they change parents)
  const gridStyle: React.CSSProperties = focusedView
    ? {
        display: 'grid',
        gridTemplateAreas: `"main main main" "thumb0 thumb1 thumb2"`,
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '3fr 1fr',
        gap: '8px',
        height: '100%',
      }
    : {
        display: 'grid',
        gridTemplateAreas: `"v0 v1" "v2 v3"`,
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: '8px',
        height: '100%',
      };

  // Map viewport type to grid area name
  const getArea = (vt: ViewType): string => {
    const order: ViewType[] = ['axial', 'sagittal', 'coronal', '3d'];
    const idx = order.indexOf(vt);
    if (!focusedView) return `v${idx}`;
    if (vt === focusedView) return 'main';
    const thumbIdx = order.filter(v => v !== focusedView).indexOf(vt);
    return `thumb${thumbIdx}`;
  };

  // Single container with all 4 viewports as direct children (preserves WebGL contexts)
  return (
    <div className="h-full" style={gridStyle}>
      <div style={{ gridArea: getArea('axial'), height: '100%' }}>
        {renderViewport('axial', axialRef, 'Axial', focusedView === 'axial', !!focusedView && focusedView !== 'axial')}
      </div>
      <div style={{ gridArea: getArea('sagittal'), height: '100%' }}>
        {renderViewport('sagittal', sagittalRef, 'Sagittal', focusedView === 'sagittal', !!focusedView && focusedView !== 'sagittal')}
      </div>
      <div style={{ gridArea: getArea('coronal'), height: '100%' }}>
        {renderViewport('coronal', coronalRef, 'Coronal', focusedView === 'coronal', !!focusedView && focusedView !== 'coronal')}
      </div>
      <div style={{ gridArea: getArea('3d'), height: '100%' }}>
        {renderViewport('3d', view3dRef, '3D Surface', focusedView === '3d', !!focusedView && focusedView !== '3d')}
      </div>
    </div>
  );
}
