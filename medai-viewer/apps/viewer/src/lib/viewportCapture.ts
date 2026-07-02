/**
 * Viewport Capture Utilities
 * Functions for capturing viewport images and creating mosaic views for report generation.
 */

import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { getRenderingEngine } from './cornerstone';
import { VolumetricsResult, SegmentVolumetrics } from '@medai/core';

/**
 * Capture a single viewport as a data URL
 *
 * @param viewportId - ID of the viewport to capture
 * @returns Base64 PNG data URL of the viewport
 */
export function captureViewport(viewportId: string): string | null {
  try {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(viewportId);

    if (!viewport) {
      console.warn(`[ViewportCapture] Viewport not found: ${viewportId}`);
      return null;
    }

    // Get the canvas element from the viewport
    const canvas = viewport.canvas;
    if (!canvas) {
      console.warn(`[ViewportCapture] No canvas found for viewport: ${viewportId}`);
      return null;
    }

    // Capture as PNG data URL
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error(`[ViewportCapture] Failed to capture viewport ${viewportId}:`, err);
    return null;
  }
}

/**
 * Get the centroid of a segmentation from volumetrics data
 *
 * @param volumetrics - Volumetrics result containing segment data
 * @param segmentIndex - Optional specific segment index (defaults to first segment)
 * @returns World coordinates of centroid [x, y, z] or null if not found
 */
export function getSegmentationCentroid(
  volumetrics: VolumetricsResult,
  segmentIndex?: number
): [number, number, number] | null {
  const segments = volumetrics.volumetrics.segments;

  if (segments.length === 0) {
    console.warn('[ViewportCapture] No segments found in volumetrics');
    return null;
  }

  // Find the target segment
  let segment: SegmentVolumetrics | undefined;
  if (segmentIndex !== undefined) {
    segment = segments.find((s) => s.segment_index === segmentIndex);
  } else {
    // Use the largest segment by default
    segment = segments.reduce((largest, current) =>
      current.total_voxel_count > largest.total_voxel_count ? current : largest
    );
  }

  if (!segment || segment.instances.length === 0) {
    console.warn('[ViewportCapture] No instances found in segment');
    return null;
  }

  // Get centroid from the largest instance
  const largestInstance = segment.instances.reduce((largest, current) =>
    current.voxel_count > largest.voxel_count ? current : largest
  );

  // Return IJK centroid (will need to be converted to world coords)
  return largestInstance.centroid_ijk as [number, number, number];
}

/**
 * Convert IJK (voxel) coordinates to world coordinates
 *
 * @param volumeId - ID of the volume
 * @param ijkCoords - IJK coordinates [i, j, k]
 * @returns World coordinates [x, y, z]
 */
export function ijkToWorld(
  volumeId: string,
  ijkCoords: [number, number, number]
): cornerstone3D.Types.Point3 | null {
  try {
    const volume = cornerstone3D.cache.getVolume(volumeId);
    if (!volume) {
      console.warn(`[ViewportCapture] Volume not found: ${volumeId}`);
      return null;
    }

    // Get volume properties
    const { imageData } = volume;
    if (!imageData) {
      console.warn('[ViewportCapture] No imageData in volume');
      return null;
    }

    // Convert IJK to world using imageData
    const worldCoords = imageData.indexToWorld(ijkCoords);
    return worldCoords as cornerstone3D.Types.Point3;
  } catch (err) {
    console.error('[ViewportCapture] Failed to convert IJK to world:', err);
    return null;
  }
}

/**
 * Jump all viewports to a specific world position
 *
 * @param worldPosition - World coordinates to jump to
 */
export function jumpViewportsToPosition(worldPosition: cornerstone3D.Types.Point3): void {
  try {
    const engine = getRenderingEngine();
    const viewportIds = ['axial', 'sagittal', 'coronal'];

    viewportIds.forEach((vpId) => {
      const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
      if (viewport) {
        cornerstoneTools.utilities.viewport.jumpToWorld(viewport, worldPosition);
      }
    });

    // Render all viewports
    engine.renderViewports(viewportIds);

    // Small delay to ensure rendering is complete
    return new Promise<void>((resolve) => setTimeout(resolve, 100)) as unknown as void;
  } catch (err) {
    console.error('[ViewportCapture] Failed to jump viewports:', err);
  }
}

/**
 * Capture a single 2D viewport
 *
 * @returns Base64 PNG data URL of the 2D viewport
 */
export async function capture2DViewport(): Promise<string | null> {
  try {
    const viewportImage = captureViewport('main2d');

    if (!viewportImage) {
      console.warn('[ViewportCapture] Failed to capture 2D viewport');
      return null;
    }

    return viewportImage;
  } catch (err) {
    console.error('[ViewportCapture] Failed to capture 2D viewport:', err);
    return null;
  }
}

/**
 * Capture a 2D viewport with SVG overlay (bounding boxes)
 * Composites the canvas and SVG overlay into a single image
 *
 * @returns Base64 PNG data URL with overlay
 */
export async function capture2DViewportWithOverlay(): Promise<string | null> {
  try {
    // Find the viewport container by looking for the parent that contains both canvas and SVG overlay
    // The Viewport2D structure is: div.relative > [canvas-container, BoundingBoxOverlay(svg)]
    const svgOverlay = document.querySelector('svg.absolute.inset-0') as SVGSVGElement;
    const viewportContainer = svgOverlay?.parentElement;

    if (!viewportContainer) {
      console.warn('[ViewportCapture] Viewport container not found (no SVG overlay), falling back to basic capture');
      return capture2DViewport();
    }

    // Get the cornerstone canvas - it's inside a child div of the container
    const cornerstoneCanvas = viewportContainer.querySelector('canvas');
    if (!cornerstoneCanvas) {
      console.warn('[ViewportCapture] Cornerstone canvas not found');
      return capture2DViewport();
    }

    // Create output canvas with same dimensions as cornerstone canvas
    const outputCanvas = document.createElement('canvas');
    const width = cornerstoneCanvas.width;
    const height = cornerstoneCanvas.height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    const ctx = outputCanvas.getContext('2d');
    if (!ctx) {
      console.error('[ViewportCapture] Failed to get canvas context');
      return capture2DViewport();
    }

    // Draw the cornerstone canvas first
    ctx.drawImage(cornerstoneCanvas, 0, 0);

    // If there's an SVG overlay, render it on top
    if (svgOverlay) {
      try {
        // Clone the SVG to avoid modifying the original
        const svgClone = svgOverlay.cloneNode(true) as SVGSVGElement;

        // Set explicit dimensions on the SVG
        svgClone.setAttribute('width', String(width));
        svgClone.setAttribute('height', String(height));

        // Add xmlns attribute for proper serialization
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        // Serialize the SVG to a string
        const svgString = new XMLSerializer().serializeToString(svgClone);

        // Create a data URL from the SVG
        const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

        // Load the SVG as an image
        const svgImage = new Image();
        await new Promise<void>((resolve) => {
          svgImage.onload = () => resolve();
          svgImage.onerror = (err) => {
            console.warn('[ViewportCapture] Failed to load SVG as image:', err);
            resolve(); // Continue without SVG overlay
          };
          svgImage.src = svgDataUrl;
        });

        // Draw the SVG image on top of the canvas
        if (svgImage.complete && svgImage.naturalWidth > 0) {
          ctx.drawImage(svgImage, 0, 0, width, height);
        }
      } catch (svgErr) {
        console.warn('[ViewportCapture] Failed to render SVG overlay:', svgErr);
        // Continue without SVG overlay
      }
    }

    return outputCanvas.toDataURL('image/png');
  } catch (err) {
    console.error('[ViewportCapture] Failed to capture 2D viewport with overlay:', err);
    return capture2DViewport();
  }
}

/**
 * Capture all three MPR views and combine into a mosaic image
 *
 * @returns Base64 PNG data URL of the 2x2 mosaic (axial, sagittal, coronal, + info panel)
 */
export async function captureMPRMosaic(): Promise<string | null> {
  try {
    // Capture all three viewports
    const axialImage = captureViewport('axial');
    const sagittalImage = captureViewport('sagittal');
    const coronalImage = captureViewport('coronal');

    if (!axialImage || !sagittalImage || !coronalImage) {
      console.warn('[ViewportCapture] Failed to capture one or more viewports');
      // Fall back to 2D viewport capture
      return capture2DViewport();
    }

    // Create mosaic canvas
    return await createMosaicFromDataUrls([axialImage, sagittalImage, coronalImage]);
  } catch (err) {
    console.error('[ViewportCapture] Failed to capture MPR mosaic:', err);
    return null;
  }
}

/**
 * Jump to segmentation centroid and capture mosaic
 *
 * @param volumetrics - Volumetrics result containing centroid data
 * @param volumeId - ID of the volume for coordinate conversion
 * @returns Base64 PNG data URL of the mosaic at centroid location
 */
export async function captureCentroidMosaic(
  volumetrics: VolumetricsResult,
  volumeId: string
): Promise<string | null> {
  try {
    // Get centroid in IJK coordinates
    const ijkCentroid = getSegmentationCentroid(volumetrics);
    if (!ijkCentroid) {
      console.warn('[ViewportCapture] Could not determine centroid');
      // Fall back to current viewport positions
      return captureMPRMosaic();
    }

    // Convert to world coordinates
    const worldCentroid = ijkToWorld(volumeId, ijkCentroid);
    if (!worldCentroid) {
      console.warn('[ViewportCapture] Could not convert centroid to world coordinates');
      return captureMPRMosaic();
    }

    console.log('[ViewportCapture] Jumping to centroid:', {
      ijk: ijkCentroid,
      world: worldCentroid,
    });

    // Jump all viewports to centroid
    jumpViewportsToPosition(worldCentroid);

    // Wait for viewports to update
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Capture the mosaic
    return captureMPRMosaic();
  } catch (err) {
    console.error('[ViewportCapture] Failed to capture centroid mosaic:', err);
    return null;
  }
}

/**
 * Create a mosaic image from multiple data URLs
 *
 * @param dataUrls - Array of data URL strings (images to combine)
 * @param labels - Optional labels for each image
 * @returns Base64 PNG data URL of the combined mosaic
 */
export async function createMosaicFromDataUrls(
  dataUrls: string[],
  labels?: string[]
): Promise<string | null> {
  return new Promise((resolve) => {
    // Load all images
    const images: HTMLImageElement[] = [];
    let loadedCount = 0;

    const defaultLabels = ['Axial', 'Sagittal', 'Coronal'];
    const imageLabels = labels || defaultLabels;

    dataUrls.forEach((dataUrl, index) => {
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        loadedCount++;

        if (loadedCount === dataUrls.length) {
          // All images loaded, create mosaic
          const mosaic = createMosaic(images, imageLabels);
          resolve(mosaic);
        }
      };
      img.onerror = () => {
        console.error(`[ViewportCapture] Failed to load image ${index}`);
        loadedCount++;
        if (loadedCount === dataUrls.length) {
          resolve(null);
        }
      };
      img.src = dataUrl;
    });
  });
}

/**
 * Create a 2x2 mosaic canvas from images
 */
function createMosaic(images: HTMLImageElement[], labels: string[]): string | null {
  if (images.length < 3) {
    console.error('[ViewportCapture] Need at least 3 images for mosaic');
    return null;
  }

  // Determine mosaic size based on first image
  const cellWidth = images[0].width;
  const cellHeight = images[0].height;

  // Create 2x2 canvas (3 images + info panel)
  const canvas = document.createElement('canvas');
  canvas.width = cellWidth * 2;
  canvas.height = cellHeight * 2;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[ViewportCapture] Failed to get canvas context');
    return null;
  }

  // Fill background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw images in 2x2 grid
  // Top-left: Axial
  ctx.drawImage(images[0], 0, 0, cellWidth, cellHeight);
  // Top-right: Sagittal
  ctx.drawImage(images[1], cellWidth, 0, cellWidth, cellHeight);
  // Bottom-left: Coronal
  ctx.drawImage(images[2], 0, cellHeight, cellWidth, cellHeight);

  // Bottom-right: Info panel (or leave black if no 4th image)
  if (images.length > 3) {
    ctx.drawImage(images[3], cellWidth, cellHeight, cellWidth, cellHeight);
  }

  // Draw labels
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px Arial';
  ctx.textBaseline = 'top';

  // Label backgrounds for better visibility
  const labelPadding = 8;
  const labelHeight = 24;

  labels.forEach((label, index) => {
    const x = (index % 2) * cellWidth + labelPadding;
    const y = Math.floor(index / 2) * cellHeight + labelPadding;

    // Draw label background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x - 4, y - 2, textWidth + 12, labelHeight);

    // Draw label text
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, x, y);
  });

  // Add timestamp in bottom-right
  const timestamp = new Date().toLocaleString();
  ctx.font = '12px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'right';
  ctx.fillText(`Captured: ${timestamp}`, canvas.width - 10, canvas.height - 10);

  return canvas.toDataURL('image/png');
}

/**
 * Capture a viewport with specific window/level settings
 *
 * @param viewportId - ID of the viewport
 * @param windowWidth - Window width for display
 * @param windowCenter - Window center for display
 * @returns Base64 PNG data URL
 */
export async function captureViewportWithWindowLevel(
  viewportId: string,
  windowWidth?: number,
  windowCenter?: number
): Promise<string | null> {
  try {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

    if (!viewport) {
      return null;
    }

    // Store original properties if we need to change them
    const originalVoiRange = viewport.getProperties().voiRange;

    // Apply custom window/level if specified
    if (windowWidth !== undefined && windowCenter !== undefined) {
      const lower = windowCenter - windowWidth / 2;
      const upper = windowCenter + windowWidth / 2;
      viewport.setProperties({
        voiRange: { lower, upper },
      });
      viewport.render();

      // Wait for render
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Capture the viewport
    const dataUrl = captureViewport(viewportId);

    // Restore original window/level
    if (windowWidth !== undefined && windowCenter !== undefined && originalVoiRange) {
      viewport.setProperties({ voiRange: originalVoiRange });
      viewport.render();
    }

    return dataUrl;
  } catch (err) {
    console.error(`[ViewportCapture] Failed to capture viewport with W/L:`, err);
    return null;
  }
}
