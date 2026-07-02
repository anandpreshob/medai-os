import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useViewerStore, useDetectionStore } from '@medai/core';
import { OrientationMarkerOverlay } from './OrientationMarkerOverlay';
import { ScaleOverlay } from './ScaleOverlay';
import {
  initCornerstone,
  create2DViewport,
  setup2DToolGroup,
  cleanup,
  getRenderingEngine,
  cornerstone3D,
  invalidateBrushCursor,
  adjustBrushSize,
  BRUSH_SIZE_STEP,
  resizeViewports,
} from '../lib/cornerstone';
import { BoundingBoxOverlay } from './overlays/BoundingBoxOverlay';

interface Viewport2DProps {
  imageId: string;
}

/**
 * Viewport2D - Single viewport for 2D images (PNG, JPG, X-ray, etc.)
 *
 * Unlike the 3D Viewport with 4 MPR views, this displays a single
 * full-size view of the 2D image with support for:
 * - Pan, zoom, window/level
 * - Brush and lasso segmentation tools
 * - Segmentation overlay
 */
export function Viewport2D({ imageId }: Viewport2DProps) {
  const { images, showOrientationMarker, showScaleOverlay } = useViewerStore();
  const { isDrawingMode } = useDetectionStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [viewportDimensions, setViewportDimensions] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);

  const image = images.get(imageId);

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

  // Create viewport when image changes
  useEffect(() => {
    if (!isInitialized || !image) {
      return;
    }

    // Capture image reference to avoid TypeScript narrowing issues
    const currentImage = image;

    let mounted = true;

    async function setupViewport() {
      if (!viewportRef.current) {
        return;
      }

      setIsLoading(true);
      setError(null);
      setViewportReady(false);

      try {
        // Create 2D viewport from loaded image
        await create2DViewport(viewportRef.current, currentImage);

        if (!mounted) return;

        // Setup tools for 2D viewport
        setup2DToolGroup(['main2d']);

        setIsLoading(false);
        setViewportReady(true);
      } catch (err) {
        console.error('Failed to setup 2D viewport:', err);
        if (mounted) {
          setError('Failed to render image');
          setIsLoading(false);
        }
      }
    }

    setupViewport();

    return () => {
      mounted = false;
    };
  }, [isInitialized, image, imageId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Handle Ctrl+scroll to adjust brush/eraser size
  const handleWheel = useCallback((e: WheelEvent) => {
    // Only handle when Ctrl (or Cmd on Mac) is pressed
    if (!e.ctrlKey && !e.metaKey) return;

    // Prevent default zoom behavior
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Scroll up = increase size, scroll down = decrease size
    const delta = e.deltaY < 0 ? BRUSH_SIZE_STEP : -BRUSH_SIZE_STEP;
    adjustBrushSize('medai2DToolGroup', delta);
  }, []);

  // Attach wheel event listeners to viewport element
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    }

    return () => {
      if (viewportRef.current) {
        viewportRef.current.removeEventListener('wheel', handleWheel, { capture: true });
      }
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
        resizeViewports();
        // Update viewport dimensions for bounding box overlay
        if (viewportRef.current) {
          setViewportDimensions({
            width: viewportRef.current.offsetWidth,
            height: viewportRef.current.offsetHeight,
          });
        }
      }, 100);
    };

    // Initial dimensions
    if (viewportRef.current) {
      setViewportDimensions({
        width: viewportRef.current.offsetWidth,
        height: viewportRef.current.offsetHeight,
      });
    }

    // Window resize handler
    window.addEventListener('resize', debouncedResize);

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(debouncedResize);
    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
    }

    return () => {
      window.removeEventListener('resize', debouncedResize);
      resizeObserver.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [viewportReady]);

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
            Image: {metadata.width} x {metadata.height}
          </p>
          <p className="text-xs text-text-muted mt-2">
            Check browser console (F12) for detailed logs
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full bg-black rounded-lg relative overflow-hidden"
      style={{ cursor: isDrawingMode ? 'crosshair' : undefined }}
    >
      {/* Viewport label */}
      <div className="absolute top-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded z-10 flex items-center gap-2">
        <span>2D View</span>
        {metadata.modality && (
          <span className="bg-accent-primary/30 px-1 rounded">{metadata.modality}</span>
        )}
        {isDrawingMode && (
          <span className="bg-purple-500/50 px-2 py-0.5 rounded animate-pulse">Drawing</span>
        )}
      </div>

      {/* Main viewport */}
      <div
        ref={viewportRef}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
        data-viewport-id="main2d"
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={() => invalidateBrushCursor('medai2DToolGroup')}
      />

      {/* Orientation and Scale Overlays */}
      <OrientationMarkerOverlay
        viewportId="main2d"
        viewportType="axial"
        visible={showOrientationMarker}
      />
      <ScaleOverlay
        viewportId="main2d"
        visible={showScaleOverlay}
      />

      {/* Bounding box overlay for AI detections */}
      {viewportReady && viewportDimensions.width > 0 && (
        <BoundingBoxOverlay
          imageId={imageId}
          imageWidth={metadata.width}
          imageHeight={metadata.height}
          viewportWidth={viewportDimensions.width}
          viewportHeight={viewportDimensions.height}
        />
      )}

      {/* Loading overlay */}
      {(isLoading || !isInitialized) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-text-muted">
            <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm">
              {!isInitialized ? 'Initializing...' : 'Loading...'}
            </p>
          </div>
        </div>
      )}

      {/* Image info */}
      <div className="absolute bottom-2 left-2 text-white text-xs space-y-1 bg-black/50 px-2 py-1 rounded">
        <p>
          {metadata.width} x {metadata.height}
          {metadata.depth > 1 && ` x ${metadata.depth}`}
        </p>
        <p>
          {metadata.spacingX.toFixed(2)} x {metadata.spacingY.toFixed(2)} mm/px
        </p>
        {metadata.format && (
          <p className="text-text-muted">{metadata.format.toUpperCase()}</p>
        )}
      </div>
    </div>
  );
}
