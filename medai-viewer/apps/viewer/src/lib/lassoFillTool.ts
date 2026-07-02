/**
 * Lasso Fill Tool - Draw closed contours to fill/erase segmentation regions
 *
 * This tool allows users to draw a freehand closed contour (lasso) and
 * automatically fills the interior with the active segment's paint value.
 * Works similar to simple2DBrush.ts but uses polygon fill instead of circle paint.
 */

import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { useSegmentationStore } from '@medai/core';

const { cache, utilities: csUtils } = cornerstone3D;

// State for lasso drawing
interface LassoState {
  isDrawing: boolean;
  points: Array<{ canvasX: number; canvasY: number }>;
  startPoint: { canvasX: number; canvasY: number } | null;
  isEraseMode: boolean;
  activeElement: HTMLElement | null;
  svgOverlay: SVGSVGElement | null;
  pathElement: SVGPathElement | null;
}

const lassoState: LassoState = {
  isDrawing: false,
  points: [],
  startPoint: null,
  isEraseMode: false,
  activeElement: null,
  svgOverlay: null,
  pathElement: null,
};

// Configuration
const CLOSE_THRESHOLD = 20; // pixels - distance to start point to close contour
let isLassoModeActive = false;
let currentToolGroupId: string | null = null;

// Track which elements have our handlers installed
const installedElements = new WeakSet<HTMLElement>();

/**
 * Scanline polygon fill algorithm
 * Fills all pixels inside the polygon
 */
function scanlineFill(
  polygon: Array<{ x: number; y: number }>,
  callback: (x: number, y: number) => void
): void {
  if (polygon.length < 3) return;

  // Find bounding box
  let minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY = Math.floor(minY);
  maxY = Math.ceil(maxY);

  // For each scanline
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];

    // Find intersections with all edges
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      // Skip horizontal edges
      if (Math.abs(p1.y - p2.y) < 0.001) continue;

      // Check if scanline intersects this edge
      if ((y >= Math.min(p1.y, p2.y)) && (y < Math.max(p1.y, p2.y))) {
        // Calculate x intersection
        const t = (y - p1.y) / (p2.y - p1.y);
        const x = p1.x + t * (p2.x - p1.x);
        intersections.push(x);
      }
    }

    // Sort intersections
    intersections.sort((a, b) => a - b);

    // Fill between pairs of intersections
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = Math.ceil(intersections[i]);
      const x2 = Math.floor(intersections[i + 1]);
      for (let x = x1; x <= x2; x++) {
        callback(x, y);
      }
    }
  }
}

/**
 * Fill a polygon on the current slice
 * Similar to paintOnSlice in simple2DBrush.ts but fills a polygon
 */
function fillLassoOnSlice(
  viewport: any,
  canvasPoints: Array<{ canvasX: number; canvasY: number }>,
  toolGroupId: string,
  erase: boolean
): void {
  if (canvasPoints.length < 3) return;

  // Get the segmentation store state
  const segStore = useSegmentationStore.getState();
  const activeSegmentationId = segStore.activeSegmentationId;
  const activeSegmentIndex = segStore.activeSegmentIndex;

  // Check if we're in multi-layer mode (segment has its own volume)
  let isMultiLayerMode = false;
  let segmentVolume: any = null;
  let segmentCsSegId: string | null = null;

  if (activeSegmentationId && activeSegmentIndex) {
    const segmentVolumeInfo = segStore.getSegmentVolume(activeSegmentationId, activeSegmentIndex);
    if (segmentVolumeInfo) {
      segmentVolume = cache.getVolume(segmentVolumeInfo.volumeId);
      segmentCsSegId = segmentVolumeInfo.cornerstoneSegmentationId;
      if (segmentVolume) {
        isMultiLayerMode = true;
      }
    }
  }

  // Fall back to legacy mode if not multi-layer
  let volume: any;
  let segmentationIdForTrigger: string;
  let paintValue: number;

  if (isMultiLayerMode && segmentVolume && segmentCsSegId) {
    volume = segmentVolume;
    segmentationIdForTrigger = segmentCsSegId;
    paintValue = 1; // Binary mask
  } else {
    // Legacy mode: use shared volume from Cornerstone's active segmentation
    const segRep = cornerstoneTools.segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!segRep) return;

    const seg = cornerstoneTools.segmentation.state.getSegmentation(segRep.segmentationId);
    if (!seg) return;

    const labelmap = seg.representationData?.LABELMAP as any;
    if (!labelmap?.volumeId) return;

    volume = cache.getVolume(labelmap.volumeId);
    if (!volume) return;

    segmentationIdForTrigger = segRep.segmentationId;
    paintValue = cornerstoneTools.segmentation.segmentIndex.getActiveSegmentIndex(segRep.segmentationId) || 1;
  }

  // Get camera to determine viewing axis
  const camera = viewport.getCamera();
  const normal = camera.viewPlaneNormal || [0, 0, 1];
  const focal = camera.focalPoint;

  // Determine axis (0=X/sagittal, 1=Y/coronal, 2=Z/axial)
  const abs = normal.map(Math.abs);
  const axis = abs[0] > abs[1] && abs[0] > abs[2] ? 0 : abs[1] > abs[2] ? 1 : 2;

  // Current slice index
  const focalIJK = csUtils.transformWorldToIndex(volume.imageData, focal);
  const slice = Math.round(focalIJK[axis]);

  // Volume info
  const data = volume.getScalarData();
  const [dimX, dimY, dimZ] = volume.dimensions;

  // Convert canvas points to voxel coordinates
  const voxelPoints = canvasPoints.map((p) => {
    const world = viewport.canvasToWorld([p.canvasX, p.canvasY]);
    const ijk = csUtils.transformWorldToIndex(volume.imageData, world);
    return { x: ijk[0], y: ijk[1], z: ijk[2] };
  });

  // Project points to 2D based on viewing axis
  let polygon2D: Array<{ x: number; y: number }>;
  if (axis === 2) {
    // Axial - use X, Y
    polygon2D = voxelPoints.map((p) => ({ x: p.x, y: p.y }));
  } else if (axis === 1) {
    // Coronal - use X, Z
    polygon2D = voxelPoints.map((p) => ({ x: p.x, y: p.z }));
  } else {
    // Sagittal - use Y, Z
    polygon2D = voxelPoints.map((p) => ({ x: p.y, y: p.z }));
  }

  // Fill the polygon
  scanlineFill(polygon2D, (u, v) => {
    let x: number, y: number, z: number;

    if (axis === 2) {
      x = Math.round(u);
      y = Math.round(v);
      z = Math.max(0, Math.min(slice, dimZ - 1));
    } else if (axis === 1) {
      x = Math.round(u);
      y = Math.max(0, Math.min(slice, dimY - 1));
      z = Math.round(v);
    } else {
      x = Math.max(0, Math.min(slice, dimX - 1));
      y = Math.round(u);
      z = Math.round(v);
    }

    // Bounds check
    if (x < 0 || x >= dimX || y < 0 || y >= dimY || z < 0 || z >= dimZ) {
      return;
    }

    const idx = z * dimX * dimY + y * dimX + x;

    if (erase) {
      if (isMultiLayerMode) {
        data[idx] = 0;
      } else {
        if (data[idx] === paintValue) {
          data[idx] = 0;
        }
      }
    } else {
      data[idx] = paintValue;
    }
  });

  // Trigger segmentation update
  cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    segmentationIdForTrigger
  );
  cornerstone3D.getRenderingEngine('medaiRenderingEngine')?.render();
}

/**
 * Create SVG overlay for visual feedback during lasso drawing
 */
function createLassoOverlay(container: HTMLElement): void {
  if (lassoState.svgOverlay) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;';

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', lassoState.isEraseMode ? '#ff4444' : '#44ff44');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-dasharray', '5,5');

  // Start point indicator
  const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  startCircle.setAttribute('id', 'lasso-start');
  startCircle.setAttribute('r', '8');
  startCircle.setAttribute('fill', 'none');
  startCircle.setAttribute('stroke', lassoState.isEraseMode ? '#ff4444' : '#44ff44');
  startCircle.setAttribute('stroke-width', '2');
  startCircle.style.display = 'none';

  svg.appendChild(path);
  svg.appendChild(startCircle);
  container.appendChild(svg);

  lassoState.svgOverlay = svg;
  lassoState.pathElement = path;
}

/**
 * Update the SVG path to show current lasso contour with closing line preview
 */
function updateLassoPath(): void {
  if (!lassoState.pathElement || lassoState.points.length < 2) return;

  const points = lassoState.points;
  let d = `M ${points[0].canvasX},${points[0].canvasY}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].canvasX},${points[i].canvasY}`;
  }
  // Add Z to close the path - shows preview of the auto-close line back to start
  d += ' Z';
  lassoState.pathElement.setAttribute('d', d);

  // Update start circle position
  const startCircle = lassoState.svgOverlay?.querySelector('#lasso-start') as SVGElement | null;
  if (startCircle && lassoState.startPoint) {
    startCircle.setAttribute('cx', String(lassoState.startPoint.canvasX));
    startCircle.setAttribute('cy', String(lassoState.startPoint.canvasY));
    startCircle.style.display = 'block';
  }
}

/**
 * Remove the SVG overlay
 */
function removeLassoOverlay(): void {
  if (lassoState.svgOverlay) {
    lassoState.svgOverlay.remove();
    lassoState.svgOverlay = null;
    lassoState.pathElement = null;
  }
}

/**
 * Cancel the current lasso operation
 */
function cancelLasso(): void {
  lassoState.isDrawing = false;
  lassoState.points = [];
  lassoState.startPoint = null;
  removeLassoOverlay();
}

/**
 * Complete the lasso and fill the region
 */
function completeLasso(): void {
  if (!currentToolGroupId || lassoState.points.length < 3) {
    cancelLasso();
    return;
  }

  const element = lassoState.activeElement;
  if (!element) {
    cancelLasso();
    return;
  }

  const ee = cornerstone3D.getEnabledElement(element as HTMLDivElement);
  if (!ee) {
    cancelLasso();
    return;
  }

  // Fill the lasso region
  fillLassoOnSlice(ee.viewport, lassoState.points, currentToolGroupId, lassoState.isEraseMode);

  // Clear the lasso
  cancelLasso();
}

/**
 * Handle mouse down - start lasso drawing
 */
function handleLassoMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return; // Only left click
  if (!isLassoModeActive) return;

  const element = e.currentTarget as HTMLDivElement;
  const ee = cornerstone3D.getEnabledElement(element);
  if (!ee) return;

  const rect = element.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  lassoState.isDrawing = true;
  lassoState.points = [{ canvasX, canvasY }];
  lassoState.startPoint = { canvasX, canvasY };
  lassoState.activeElement = element;

  // Create overlay
  createLassoOverlay(element);

  e.preventDefault();
  e.stopPropagation();
}

/**
 * Handle mouse move - collect lasso points
 */
function handleLassoMouseMove(e: MouseEvent): void {
  if (!lassoState.isDrawing || !isLassoModeActive) return;

  const element = e.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  // Add point (with some distance threshold to avoid too many points)
  const lastPoint = lassoState.points[lassoState.points.length - 1];
  const dist = Math.sqrt(
    Math.pow(canvasX - lastPoint.canvasX, 2) +
    Math.pow(canvasY - lastPoint.canvasY, 2)
  );

  if (dist > 3) { // Minimum distance between points
    lassoState.points.push({ canvasX, canvasY });
    updateLassoPath();
  }

  e.preventDefault();
  e.stopPropagation();
}

/**
 * Handle mouse up - automatically close and fill the lasso
 */
function handleLassoMouseUp(e: MouseEvent): void {
  if (!lassoState.isDrawing || !isLassoModeActive) return;

  if (lassoState.points.length >= 3) {
    // Automatically close the contour and fill
    completeLasso();
  } else {
    // Not enough points to form a polygon
    cancelLasso();
  }

  e.preventDefault();
  e.stopPropagation();
}

/**
 * Handle key down - ESC to cancel
 */
function handleLassoKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && lassoState.isDrawing) {
    cancelLasso();
    e.preventDefault();
  }
}

/**
 * Handle mouse leave - cancel lasso
 */
function handleLassoMouseLeave(): void {
  if (lassoState.isDrawing) {
    cancelLasso();
  }
}

/**
 * Install lasso tool event handlers on viewport elements
 */
export function installLassoFillTool(toolGroupId: string): void {
  currentToolGroupId = toolGroupId;

  const engine = cornerstone3D.getRenderingEngine('medaiRenderingEngine');
  if (!engine) {
    console.warn('[LassoFill] Rendering engine not ready, will retry');
    setTimeout(() => installLassoFillTool(toolGroupId), 500);
    return;
  }

  // Install on all viewport elements (both 3D MPR and 2D)
  const viewportIds = ['axial', 'sagittal', 'coronal', 'main2d'];
  viewportIds.forEach((vpId) => {
    const viewport = engine.getViewport(vpId);
    if (!viewport?.element) return;

    const element = viewport.element;

    if (installedElements.has(element)) return;
    installedElements.add(element);

    element.addEventListener('mousedown', handleLassoMouseDown, { capture: true });
    element.addEventListener('mousemove', handleLassoMouseMove, { capture: true });
    element.addEventListener('mouseup', handleLassoMouseUp, { capture: true });
    element.addEventListener('mouseleave', handleLassoMouseLeave, { capture: true });

    console.log(`[LassoFill] Installed handlers on ${vpId}`);
  });

  // Global keydown handler for ESC
  document.addEventListener('keydown', handleLassoKeyDown);

  console.log('[LassoFill] Ready');
}

/**
 * Activate lasso fill mode
 */
export function activateLassoFillMode(isActive: boolean): void {
  isLassoModeActive = isActive;
  if (!isActive) {
    cancelLasso();
  }
  console.log('[LassoFill] Mode:', isActive ? 'active' : 'inactive');
}

/**
 * Set lasso erase mode
 */
export function setLassoEraseMode(isErase: boolean): void {
  lassoState.isEraseMode = isErase;
  // Update overlay color if exists
  if (lassoState.pathElement) {
    lassoState.pathElement.setAttribute('stroke', isErase ? '#ff4444' : '#44ff44');
  }
}

/**
 * Check if lasso mode is active
 */
export function isLassoActive(): boolean {
  return isLassoModeActive;
}

/**
 * Check if currently drawing a lasso
 */
export function isLassoDrawing(): boolean {
  return lassoState.isDrawing;
}
