/**
 * Simple 2D Brush - Paints ONLY on the current slice using DOM events.
 * Completely bypasses Cornerstone's built-in brush painting to avoid 3D sphere behavior.
 *
 * Supports two modes:
 * 1. Multi-layer mode: Each segment has its own binary mask volume (enables true overlap)
 * 2. Legacy single-volume mode: All segments share one volume with segment indices
 */

import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { useSegmentationStore } from '@medai/core';

const { cache, utilities: csUtils } = cornerstone3D;

// Track which elements have our handlers installed
const installedElements = new WeakSet<HTMLElement>();

// Current tool state
let currentToolGroupId: string | null = null;
let isPainting = false;

/**
 * Paint a circular region (in world space) on ONE slice only.
 * Uses per-axis voxel radii to ensure the painted region matches the cursor indicator.
 * The brush size is in millimeters (world space), and we paint an ellipse in voxel space
 * that corresponds to a circle in world space, accounting for anisotropic voxel spacing.
 *
 * Supports two modes:
 * 1. Multi-layer mode: Paint binary 1/0 to segment-specific volume (no overlap issues)
 * 2. Legacy mode: Paint segment index to shared volume (may cause overlap issues)
 */
function paintOnSlice(
  viewport: any,
  canvasX: number,
  canvasY: number,
  toolGroupId: string,
  brushSize: number,
  erase: boolean
): void {
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
      // Multi-layer mode: segment has its own volume
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
    // Multi-layer mode: use segment-specific volume, paint binary 1
    volume = segmentVolume;
    segmentationIdForTrigger = segmentCsSegId;
    paintValue = 1; // Binary mask: 1 = present
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

  // Get camera
  const camera = viewport.getCamera();
  const normal = camera.viewPlaneNormal || [0, 0, 1];
  const focal = camera.focalPoint;

  // Which axis? (0=X/sagittal, 1=Y/coronal, 2=Z/axial)
  const abs = normal.map(Math.abs);
  const axis = abs[0] > abs[1] && abs[0] > abs[2] ? 0 : abs[1] > abs[2] ? 1 : 2;

  // Current slice index
  const focalIJK = csUtils.transformWorldToIndex(volume.imageData, focal);
  const slice = Math.round(focalIJK[axis]);

  // Canvas to voxel
  const world = viewport.canvasToWorld([canvasX, canvasY]);
  const ijk = csUtils.transformWorldToIndex(volume.imageData, world);

  // Volume info
  const data = volume.getScalarData();
  const [dimX, dimY, dimZ] = volume.dimensions;
  const spacing = volume.spacing;

  // Calculate per-axis radius in voxels for accurate brush painting
  // This ensures the painted region matches the circular cursor in world space (mm)
  // brushSize is in mm, so we convert to voxels using the spacing for each axis
  // Using ellipse equation to paint a region that appears circular in world space

  let rx: number, ry: number;
  if (axis === 2) {
    // Axial (Z fixed) - paint in X,Y plane
    rx = brushSize / spacing[0];  // X radius in voxels
    ry = brushSize / spacing[1];  // Y radius in voxels
  } else if (axis === 1) {
    // Coronal (Y fixed) - paint in X,Z plane
    rx = brushSize / spacing[0];  // X radius in voxels
    ry = brushSize / spacing[2];  // Z radius in voxels
  } else {
    // Sagittal (X fixed) - paint in Y,Z plane
    rx = brushSize / spacing[1];  // Y radius in voxels
    ry = brushSize / spacing[2];  // Z radius in voxels
  }
  const maxR = Math.ceil(Math.max(rx, ry));

  // Paint using ellipse equation: (d1/r1)^2 + (d2/r2)^2 <= 1
  // This creates an ellipse in voxel space that appears circular in world space
  if (axis === 2) {
    // Axial - Z fixed
    const z = Math.max(0, Math.min(slice, dimZ - 1));
    const cx = ijk[0], cy = ijk[1];
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1) {
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (x >= 0 && x < dimX && y >= 0 && y < dimY) {
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
          }
        }
      }
    }
  } else if (axis === 1) {
    // Coronal - Y fixed, paint in X,Z plane
    const y = Math.max(0, Math.min(slice, dimY - 1));
    const cx = ijk[0], cz = ijk[2];
    for (let dz = -maxR; dz <= maxR; dz++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        if ((dx / rx) ** 2 + (dz / ry) ** 2 <= 1) {
          const x = Math.round(cx + dx);
          const z = Math.round(cz + dz);
          if (x >= 0 && x < dimX && z >= 0 && z < dimZ) {
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
          }
        }
      }
    }
  } else {
    // Sagittal - X fixed, paint in Y,Z plane
    const x = Math.max(0, Math.min(slice, dimX - 1));
    const cy = ijk[1], cz = ijk[2];
    for (let dz = -maxR; dz <= maxR; dz++) {
      for (let dy = -maxR; dy <= maxR; dy++) {
        if ((dy / rx) ** 2 + (dz / ry) ** 2 <= 1) {
          const y = Math.round(cy + dy);
          const z = Math.round(cz + dz);
          if (y >= 0 && y < dimY && z >= 0 && z < dimZ) {
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
          }
        }
      }
    }
  }

  // Update display
  cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    segmentationIdForTrigger
  );
  cornerstone3D.getRenderingEngine('medaiRenderingEngine')?.render();
}

/**
 * Check if the active tool is a brush or eraser
 */
function getActiveBrushInfo(toolGroupId: string): { isBrush: boolean; isEraser: boolean; brushSize: number } {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) return { isBrush: false, isEraser: false, brushSize: 25 };

  // Check which tool is active (Primary binding)
  const brushTool = toolGroup.getToolInstance('CircularBrush') as any;
  const eraserTool = toolGroup.getToolInstance('CircularEraser') as any;

  const isBrush = brushTool?.mode === 'Active';
  const isEraser = eraserTool?.mode === 'Active';
  const brushSize = (isBrush ? brushTool?.configuration?.brushSize : eraserTool?.configuration?.brushSize) || 25;

  return { isBrush, isEraser, brushSize };
}

/**
 * Create or update an SVG cursor overlay that shows the brush/eraser circle.
 * This provides visual feedback during both hover and drag.
 */
const CURSOR_OVERLAY_ATTR = 'data-brush-cursor';

function updateCursorOverlay(element: HTMLElement, e: MouseEvent, brushSize: number, isEraser: boolean): void {
  let svg = element.querySelector(`[${CURSOR_OVERLAY_ATTR}]`) as SVGSVGElement | null;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute(CURSOR_OVERLAY_ATTR, '');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke-width', '1.5');
    svg.appendChild(circle);
    element.style.position = 'relative';
    element.appendChild(svg);
  }

  const circle = svg.querySelector('circle')!;
  const rect = element.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  // Convert brushSize (mm) to canvas pixels using the viewport's zoom/scale
  const ee = cornerstone3D.getEnabledElement(element);
  let radiusPx = brushSize; // fallback
  if (ee?.viewport) {
    const camera = ee.viewport.getCamera();
    const parallelScale = camera.parallelScale;
    const viewportHeight = rect.height;
    if (parallelScale && viewportHeight) {
      // parallelScale = half the world height visible. Full height in mm = 2 * parallelScale
      // pixelsPerMm = viewportHeight / (2 * parallelScale)
      const pixelsPerMm = viewportHeight / (2 * parallelScale);
      radiusPx = brushSize * pixelsPerMm;
    }
  }

  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(Math.max(radiusPx, 2)));
  circle.setAttribute('stroke', isEraser ? '#ff4444' : '#44ff44');

  svg.style.display = '';
}

function removeCursorOverlay(element: HTMLElement): void {
  const svg = element.querySelector(`[${CURSOR_OVERLAY_ATTR}]`);
  if (svg) svg.style.display = 'none';
}

/**
 * Handle mouse down on viewport
 */
function handleMouseDown(e: MouseEvent): void {
  // Only handle left click
  if (e.button !== 0) return;

  if (!currentToolGroupId) return;

  const { isBrush, isEraser, brushSize } = getActiveBrushInfo(currentToolGroupId);
  if (!isBrush && !isEraser) return;

  const element = e.currentTarget as HTMLDivElement;
  const ee = cornerstone3D.getEnabledElement(element);
  if (!ee) return;

  // Get canvas coordinates
  const rect = element.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  // Start painting
  isPainting = true;

  // Update cursor overlay position at click point
  updateCursorOverlay(element, e, brushSize, isEraser);

  paintOnSlice(ee.viewport, canvasX, canvasY, currentToolGroupId, brushSize, isEraser);

  // Prevent Cornerstone from also handling this
  e.stopPropagation();
}

/**
 * Handle mouse move (drag) on viewport
 */
function handleMouseMove(e: MouseEvent): void {
  if (!currentToolGroupId) return;

  const { isBrush, isEraser, brushSize } = getActiveBrushInfo(currentToolGroupId);
  if (!isBrush && !isEraser) return;

  const element = e.currentTarget as HTMLDivElement;

  // Update the SVG cursor overlay position on every move (painting or hovering)
  updateCursorOverlay(element, e, brushSize, isEraser);

  if (!isPainting) return;

  // Only paint if mouse button is still down
  if (!(e.buttons & 1)) {
    isPainting = false;
    return;
  }

  const ee = cornerstone3D.getEnabledElement(element);
  if (!ee) return;

  // Get canvas coordinates
  const rect = element.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  paintOnSlice(ee.viewport, canvasX, canvasY, currentToolGroupId, brushSize, isEraser);

  // Prevent Cornerstone's native drag from also processing this
  e.stopPropagation();
}

/**
 * Handle mouse up
 */
function handleMouseUp(): void {
  isPainting = false;
}

/**
 * Handle mouse leave (stop painting if we leave the viewport)
 */
function handleMouseLeave(e: MouseEvent): void {
  isPainting = false;
  const element = e.currentTarget as HTMLElement;
  if (element) removeCursorOverlay(element);
}

/**
 * Install simple 2D brush on viewport elements
 * This uses DOM events directly, bypassing Cornerstone's brush tool painting
 * while still allowing the brush tool to show cursors etc.
 */
export function installSimple2DBrush(toolGroupId: string): void {
  currentToolGroupId = toolGroupId;

  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) return;

  // Disable the actual painting behavior of brush tools by replacing their callbacks
  ['CircularBrush', 'CircularEraser'].forEach((toolName) => {
    if (!toolGroup.hasTool(toolName)) return;

    const tool = toolGroup.getToolInstance(toolName) as any;
    if (!tool) return;

    // Skip if already modified
    if (tool._simple2DModified) return;
    tool._simple2DModified = true;

    // Suppress all Cornerstone brush callbacks and cursor rendering.
    // Our DOM capture-phase handlers handle painting, and the SVG overlay handles the cursor.
    tool.preMouseDownCallback = function () { return false; };
    tool.mouseDragCallback = function () {};
    tool.mouseUpCallback = function () {};
    // Suppress hover cursor rendering by Cornerstone
    tool.mouseMoveCallback = function () {};
    // Suppress the canvas-drawn brush cursor circle
    const originalRenderAnnotation = tool.renderAnnotation?.bind(tool);
    tool.renderAnnotation = function () { return; };

    console.log(`[Simple2D] Modified ${toolName} to disable built-in painting`);
  });

  // Install DOM event handlers on all viewport elements
  const engine = cornerstone3D.getRenderingEngine('medaiRenderingEngine');
  if (!engine) {
    console.warn('[Simple2D] Rendering engine not ready, will retry');
    setTimeout(() => installSimple2DBrush(toolGroupId), 500);
    return;
  }

  const viewportIds = ['axial', 'sagittal', 'coronal'];
  viewportIds.forEach((vpId) => {
    const viewport = engine.getViewport(vpId);
    if (!viewport?.element) return;

    const element = viewport.element;

    // Skip if already installed on this element
    if (installedElements.has(element)) return;
    installedElements.add(element);

    // Use capture phase to intercept before Cornerstone
    element.addEventListener('mousedown', handleMouseDown, { capture: true });
    element.addEventListener('mousemove', handleMouseMove, { capture: true });
    element.addEventListener('mouseup', handleMouseUp, { capture: true });
    element.addEventListener('mouseleave', handleMouseLeave, { capture: true });

    console.log(`[Simple2D] Installed DOM handlers on ${vpId}`);
  });

  console.log('[Simple2D] Ready - brush paints on current slice only via DOM events');
}
