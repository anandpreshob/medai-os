/**
 * 3D Surface Rendering Utilities
 *
 * Provides functions to render segmentation labels as 3D isosurfaces
 * using marching cubes algorithm and VTK.js actors.
 */

import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
// @ts-ignore - VTK.js doesn't have TypeScript declarations
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
// @ts-ignore - VTK.js doesn't have TypeScript declarations
import vtkPolyDataNormals from '@kitware/vtk.js/Filters/Core/PolyDataNormals';
// @ts-ignore - VTK.js doesn't have TypeScript declarations
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
// @ts-ignore - VTK.js doesn't have TypeScript declarations
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
// @ts-ignore
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
// @ts-ignore
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
// @ts-ignore
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
// @ts-ignore
import vtkLineSource from '@kitware/vtk.js/Filters/Sources/LineSource';
// @ts-ignore
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
// @ts-ignore
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import { useSegmentationStore } from '@medai/core';
import { getRenderingEngine, RENDERING_ENGINE_ID } from './cornerstone';

// VTK.js types (since the library doesn't provide TypeScript declarations)
type VtkActor = ReturnType<typeof vtkActor.newInstance>;
type VtkMapper = ReturnType<typeof vtkMapper.newInstance>;

const { Enums, cache } = cornerstone3D;
const { ViewportType } = Enums;

// Track surface actors by segment volume ID
const surfaceActorMap = new Map<string, string>(); // volumeId -> actorUID

// Debounce timer for surface updates
let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const UPDATE_DEBOUNCE_MS = 300;

// 3D viewport ID
export const VIEWPORT_3D_ID = 'volume3d';

/**
 * Convert hex color to RGBA array
 */
function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return [255, 0, 0, alpha]; // Default red
  }
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    alpha,
  ];
}

/**
 * Create a 3D volume viewport for surface rendering
 */
export async function create3DViewport(
  element: HTMLDivElement,
  volumeId?: string
): Promise<void> {
  console.log('[MedAI] Creating 3D viewport');

  const engine = getRenderingEngine();

  // Disable existing 3D viewport if present
  try {
    engine.disableElement(VIEWPORT_3D_ID);
    console.log('[MedAI] Disabled existing 3D viewport');
  } catch (e) {
    // Viewport doesn't exist yet, that's fine
  }

  // Create VolumeViewport3D
  const viewportInput: cornerstone3D.Types.PublicViewportInput = {
    viewportId: VIEWPORT_3D_ID,
    type: ViewportType.VOLUME_3D,
    element: element,
    defaultOptions: {
      background: [0.1, 0.1, 0.1] as cornerstone3D.Types.Point3,
    },
  };

  try {
    // Use enableElement instead of setViewports to ADD the viewport without destroying existing ones
    engine.enableElement(viewportInput);
    console.log('[MedAI] 3D viewport created successfully');
  } catch (err) {
    console.error('[MedAI] Failed to create 3D viewport:', err);
    throw err;
  }

  // Don't load any volume here - will load first segmentation volume when surfaces are added

  engine.renderViewports([VIEWPORT_3D_ID]);

  // Add orientation axes
  add3DOrientationWidget();

  // Setup 3D interaction tools
  setup3DToolGroup();
}

// Track orientation axes actors
const orientationActorUIDs: string[] = [];

// Store initial camera state for reset
let initialCameraState: cornerstone3D.Types.ICamera | null = null;

/**
 * Create a simple colored line with arrow tip
 */
function createAxisLine(
  start: [number, number, number],
  end: [number, number, number],
  color: [number, number, number]
): { lineActor: any; coneActor: any } {
  // Create line
  const lineSource = vtkLineSource.newInstance();
  lineSource.setPoint1(...start);
  lineSource.setPoint2(...end);

  const lineMapper = vtkMapper.newInstance();
  lineMapper.setInputConnection(lineSource.getOutputPort());

  const lineActor = vtkActor.newInstance();
  lineActor.setMapper(lineMapper);
  lineActor.getProperty().setColor(...color);
  lineActor.getProperty().setLineWidth(3);

  // Create arrow cone at end
  const coneSource = vtkConeSource.newInstance();
  const direction: [number, number, number] = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  ];
  const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);

  coneSource.setCenter(end);
  coneSource.setDirection(...direction);
  coneSource.setHeight(length * 0.2);
  coneSource.setRadius(length * 0.1);
  coneSource.setResolution(8);

  const coneMapper = vtkMapper.newInstance();
  coneMapper.setInputConnection(coneSource.getOutputPort());

  const coneActor = vtkActor.newInstance();
  coneActor.setMapper(coneMapper);
  coneActor.getProperty().setColor(...color);

  return { lineActor, coneActor };
}

/**
 * Add orientation axes to 3D viewport
 * Shows RGB axes for anatomical directions
 */
export function add3DOrientationWidget(): void {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    console.error('[MedAI] 3D viewport not found for orientation axes');
    return;
  }

  try {
    // Remove any existing orientation axes
    orientationActorUIDs.forEach(uid => {
      try {
        viewport.removeActors([uid]);
      } catch (e) {
        // Actor may not exist
      }
    });
    orientationActorUIDs.length = 0;

    // Get camera to position axes relative to the scene
    const camera = viewport.getCamera();
    const bounds = viewport.getBounds?.();

    // Calculate axis length based on scene bounds
    let axisLength = 50;
    if (bounds && bounds.length === 6) {
      const xRange = bounds[1] - bounds[0];
      const yRange = bounds[3] - bounds[2];
      const zRange = bounds[5] - bounds[4];
      axisLength = Math.max(xRange, yRange, zRange) * 0.15;
    }

    console.log('[MedAI] Creating orientation axes with length:', axisLength);

    // Position axes at origin
    const origin: [number, number, number] = [0, 0, 0];

    // Create X axis (Right - Red)
    const xAxis = createAxisLine(
      origin,
      [axisLength, 0, 0],
      [1, 0, 0]
    );

    // Create Y axis (Anterior - Green)
    const yAxis = createAxisLine(
      origin,
      [0, axisLength, 0],
      [0, 1, 0]
    );

    // Create Z axis (Superior - Blue)
    const zAxis = createAxisLine(
      origin,
      [0, 0, axisLength],
      [0, 0, 1]
    );

    // Add all axes to viewport
    const axes = [
      { actor: xAxis.lineActor, name: 'x-line' },
      { actor: xAxis.coneActor, name: 'x-cone' },
      { actor: yAxis.lineActor, name: 'y-line' },
      { actor: yAxis.coneActor, name: 'y-cone' },
      { actor: zAxis.lineActor, name: 'z-line' },
      { actor: zAxis.coneActor, name: 'z-cone' },
    ];

    axes.forEach(({ actor, name }) => {
      const uid = `orientation-axis-${name}-${Date.now()}`;
      viewport.addActor({ uid, actor });
      orientationActorUIDs.push(uid);
    });

    console.log('[MedAI] ✓ Orientation axes added to 3D viewport (R=Red, A=Green, S=Blue)');
    viewport.render();
  } catch (err) {
    console.error('[MedAI] Error setting up orientation axes:', err);
  }
}

/**
 * Setup 3D viewport interaction tools (rotation, pan, zoom)
 */
export function setup3DToolGroup(): void {
  const toolGroupId = 'medai3DToolGroup';

  // Check if tool group already exists
  let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);

  if (!toolGroup) {
    console.log('[MedAI] Creating 3D tool group');
    toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

    if (!toolGroup) {
      console.error('[MedAI] Failed to create 3D tool group');
      return;
    }

    // Add 3D interaction tools
    toolGroup.addTool(cornerstoneTools.TrackballRotateTool.toolName);
    toolGroup.addTool(cornerstoneTools.PanTool.toolName);
    toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);

    // Set active tools
    toolGroup.setToolActive(cornerstoneTools.TrackballRotateTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }], // Left click
    });
    toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary }], // Middle click
    });
    toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary }], // Right click
    });

    console.log('[MedAI] 3D tool group created with rotation, pan, and zoom tools');
  }

  // Add the 3D viewport to the tool group
  try {
    toolGroup.addViewport(VIEWPORT_3D_ID, RENDERING_ENGINE_ID);
    console.log('[MedAI] 3D viewport added to tool group');
  } catch (err) {
    console.error('[MedAI] Failed to add 3D viewport to tool group:', err);
  }
}

/**
 * Create a 3D surface mesh from a multi-label labelmap volume for a specific label index.
 * This is used for single-layer mode where all segments share one volume with different label values.
 */
export async function createSurfaceFromLabelmap(
  labelmapVolumeId: string,
  labelIndex: number,
  color: [number, number, number, number]
): Promise<{ actor: VtkActor; uid: string } | null> {
  console.log('[MedAI] Creating surface from labelmap:', labelmapVolumeId, 'label:', labelIndex);

  // Get labelmap volume from cache
  const labelmapVolume = cache.getVolume(labelmapVolumeId);
  if (!labelmapVolume) {
    console.error('[MedAI] Labelmap volume not found:', labelmapVolumeId);
    return null;
  }

  // Get VTK image data from the volume
  const vtkImageData = labelmapVolume.imageData;
  if (!vtkImageData) {
    console.error('[MedAI] Volume has no imageData:', labelmapVolumeId);
    return null;
  }

  // Get scalar data and check if this label exists
  const scalarData = labelmapVolume.getScalarData();
  let hasLabel = false;
  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] === labelIndex) {
      hasLabel = true;
      break;
    }
  }

  if (!hasLabel) {
    console.log('[MedAI] Label', labelIndex, 'not found in labelmap, skipping surface generation');
    return null;
  }

  try {
    // Create a binary mask for this specific label
    // We need to create a new vtkImageData with the binary mask
    const dimensions = vtkImageData.getDimensions();
    const spacing = vtkImageData.getSpacing();
    const origin = vtkImageData.getOrigin();
    const direction = vtkImageData.getDirection();

    // Create binary mask: 1 where label matches, 0 elsewhere
    const binaryMask = new Float32Array(scalarData.length);
    for (let i = 0; i < scalarData.length; i++) {
      binaryMask[i] = scalarData[i] === labelIndex ? 1.0 : 0.0;
    }

    // Create a new vtkImageData with the binary mask
    // Import vtkImageData dynamically
    // @ts-ignore - VTK.js doesn't have complete TypeScript declarations
    const vtkImageDataClass = await import('@kitware/vtk.js/Common/DataModel/ImageData');
    // @ts-ignore
    const vtkDataArrayClass = await import('@kitware/vtk.js/Common/Core/DataArray');

    // @ts-ignore
    const binaryImageData = vtkImageDataClass.default.newInstance();
    binaryImageData.setDimensions(dimensions);
    binaryImageData.setSpacing(spacing);
    binaryImageData.setOrigin(origin);
    binaryImageData.setDirection(direction);

    // Create scalar data array
    // @ts-ignore
    const vtkDataArray = vtkDataArrayClass.default.newInstance({
      numberOfComponents: 1,
      values: binaryMask,
    });
    binaryImageData.getPointData().setScalars(vtkDataArray);

    console.log('[MedAI] Binary mask created for label:', labelIndex);

    // Create marching cubes filter
    const marchingCubes = vtkImageMarchingCubes.newInstance({
      contourValue: 0.5, // Binary mask: threshold between 0 and 1
      computeNormals: true,
      mergePoints: true,
    });

    marchingCubes.setInputData(binaryImageData);
    marchingCubes.update();

    // Get output polydata (mesh)
    let polyData = marchingCubes.getOutputData(0);

    if (!polyData || polyData.getNumberOfPoints() === 0) {
      console.log('[MedAI] Marching cubes produced no surface for label:', labelIndex);
      return null;
    }

    console.log('[MedAI] Surface generated with', polyData.getNumberOfPoints(), 'points for label:', labelIndex);

    // Transform vertices to proper world space
    const points = polyData.getPoints();
    if (points && points.getNumberOfPoints() > 0) {
      const numPoints = points.getNumberOfPoints();
      for (let i = 0; i < numPoints; i++) {
        const pt = points.getPoint(i);
        const indexPt: [number, number, number] = [
          (pt[0] - origin[0]) / spacing[0],
          (pt[1] - origin[1]) / spacing[1],
          (pt[2] - origin[2]) / spacing[2]
        ];
        const worldPt = vtkImageData.indexToWorld(indexPt);
        points.setPoint(i, worldPt[0], worldPt[1], worldPt[2]);
      }

      points.modified();
      polyData.modified();

      // Recompute normals after transforming vertices
      const normalsFilter = vtkPolyDataNormals.newInstance({
        computePointNormals: true,
        computeCellNormals: false,
        consistency: true,
        autoOrientNormals: true,
        splitting: false,
      });

      normalsFilter.setInputData(polyData);
      normalsFilter.update();
      polyData = normalsFilter.getOutputData();
    }

    // Create mapper and actor
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    // Set color from segment's color (normalize to 0-1 range)
    const normalizedColor: [number, number, number] = [
      color[0] / 255,
      color[1] / 255,
      color[2] / 255,
    ];
    actor.getProperty().setColor(...normalizedColor);
    actor.getProperty().setOpacity(color[3] / 255);

    // Enable smooth shading and disable backface culling
    actor.getProperty().setInterpolationToPhong();
    actor.getProperty().setAmbient(0.3);
    actor.getProperty().setDiffuse(0.7);
    actor.getProperty().setSpecular(0.2);
    actor.getProperty().setSpecularPower(15);
    actor.getProperty().setBackfaceCulling(false);
    actor.getProperty().setFrontfaceCulling(false);

    // Generate unique ID
    const uid = `surface-${labelmapVolumeId}-label${labelIndex}-${Date.now()}`;

    return { actor, uid };
  } catch (err) {
    console.error('[MedAI] Failed to create surface from labelmap:', err);
    return null;
  }
}

/**
 * Create a 3D surface mesh from a segment binary mask volume using marching cubes
 */
export async function createSurfaceFromSegment(
  segmentVolumeId: string,
  color: [number, number, number, number]
): Promise<{ actor: VtkActor; uid: string } | null> {
  console.log('[MedAI] Creating surface from segment:', segmentVolumeId);

  // Get segment volume from cache
  const segmentVolume = cache.getVolume(segmentVolumeId);
  if (!segmentVolume) {
    console.error('[MedAI] Segment volume not found:', segmentVolumeId);
    return null;
  }

  // Get VTK image data from the volume
  const vtkImageData = segmentVolume.imageData;
  if (!vtkImageData) {
    console.error('[MedAI] Volume has no imageData:', segmentVolumeId);
    return null;
  }

  // Check what spacing/origin the vtkImageData has
  console.log('[MedAI] vtkImageData spacing:', vtkImageData.getSpacing());
  console.log('[MedAI] vtkImageData origin:', vtkImageData.getOrigin());
  console.log('[MedAI] vtkImageData direction:', vtkImageData.getDirection());

  // Check if there's any data to render (non-zero voxels)
  const scalarData = segmentVolume.getScalarData();
  let hasData = false;
  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] > 0) {
      hasData = true;
      break;
    }
  }

  if (!hasData) {
    console.log('[MedAI] Segment volume is empty, skipping surface generation');
    return null;
  }

  try {
    // Create marching cubes filter
    const marchingCubes = vtkImageMarchingCubes.newInstance({
      contourValue: 0.5, // Binary mask: threshold between 0 and 1
      computeNormals: true,
      mergePoints: true,
    });

    marchingCubes.setInputData(vtkImageData);
    marchingCubes.update();

    // Get output polydata (mesh)
    let polyData = marchingCubes.getOutputData(0);

    if (!polyData || polyData.getNumberOfPoints() === 0) {
      console.log('[MedAI] Marching cubes produced no surface');
      return null;
    }

    console.log('[MedAI] Surface generated with', polyData.getNumberOfPoints(), 'points');

    // Transform vertices to proper world space
    // Marching cubes outputs vertices in "origin + spacing * index" space
    // but doesn't apply the direction matrix. We need to apply it manually.
    const points = polyData.getPoints();
    if (points && points.getNumberOfPoints() > 0) {
      const firstPointBefore = points.getPoint(0);
      console.log('[MedAI] First vertex BEFORE transform:', firstPointBefore);

      // Use vtkImageData's indexToWorld method which properly applies direction
      const numPoints = points.getNumberOfPoints();
      for (let i = 0; i < numPoints; i++) {
        // Marching cubes vertices are in physical space (origin + spacing * index)
        // We need to convert back to index space, then to proper world space
        const spacing = vtkImageData.getSpacing();
        const origin = vtkImageData.getOrigin();
        const pt = points.getPoint(i);

        // Convert from physical space back to index space
        const indexPt: [number, number, number] = [
          (pt[0] - origin[0]) / spacing[0],
          (pt[1] - origin[1]) / spacing[1],
          (pt[2] - origin[2]) / spacing[2]
        ];

        // Now convert to world space using proper transformation
        const worldPt = vtkImageData.indexToWorld(indexPt);
        points.setPoint(i, worldPt[0], worldPt[1], worldPt[2]);
      }

      points.modified();
      polyData.modified();

      const firstPointAfter = points.getPoint(0);
      console.log('[MedAI] First vertex AFTER transform:', firstPointAfter);

      // Recompute normals after transforming vertices
      const normalsFilter = vtkPolyDataNormals.newInstance({
        computePointNormals: true,
        computeCellNormals: false,
        consistency: true,
        autoOrientNormals: true,
        splitting: false,
      });

      normalsFilter.setInputData(polyData);
      normalsFilter.update();
      polyData = normalsFilter.getOutputData();

      console.log('[MedAI] Normals recomputed after vertex transformation');
    }

    // Create mapper and actor
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    console.log('[MedAI] Surface vertices transformed to world space');

    // Set color from segment's color (normalize to 0-1 range)
    const normalizedColor: [number, number, number] = [
      color[0] / 255,
      color[1] / 255,
      color[2] / 255,
    ];
    actor.getProperty().setColor(...normalizedColor);
    actor.getProperty().setOpacity(color[3] / 255);

    // Enable smooth shading and disable backface culling
    actor.getProperty().setInterpolationToPhong();
    actor.getProperty().setAmbient(0.3);
    actor.getProperty().setDiffuse(0.7);
    actor.getProperty().setSpecular(0.2);
    actor.getProperty().setSpecularPower(15);
    actor.getProperty().setBackfaceCulling(false); // Show both sides
    actor.getProperty().setFrontfaceCulling(false);

    console.log('[MedAI] Surface rendering properties set (backface culling disabled)');

    // Generate unique ID
    const uid = `surface-${segmentVolumeId}-${Date.now()}`;

    return { actor, uid };
  } catch (err) {
    console.error('[MedAI] Failed to create surface:', err);
    return null;
  }
}

/**
 * Add a surface actor to the 3D viewport
 */
export function addSurfaceActorToViewport(
  actor: any,
  uid: string
): boolean {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    console.error('[MedAI] 3D viewport not found');
    return false;
  }

  try {
    viewport.addActor({ uid, actor });
    viewport.render(); // Force immediate render
    console.log('[MedAI] Added surface actor and rendered:', uid);
    return true;
  } catch (err) {
    console.error('[MedAI] Failed to add surface actor:', err);
    return false;
  }
}

/**
 * Remove a surface actor from the 3D viewport
 */
export function removeSurfaceActorFromViewport(uid: string): boolean {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    return false;
  }

  try {
    viewport.removeActors([uid]);
    console.log('[MedAI] Removed surface actor:', uid);
    return true;
  } catch (err) {
    console.error('[MedAI] Failed to remove surface actor:', err);
    return false;
  }
}

/**
 * Add surfaces for all visible segments
 * Handles both multi-layer mode (segment.volumeId) and single-layer mode (segmentation.volumeId)
 */
export async function addAllSegmentSurfaces(): Promise<void> {
  console.log('[MedAI] Adding all segment surfaces');

  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    console.warn('[MedAI] 3D viewport not ready');
    return;
  }

  // Clear existing surfaces
  clearAllSurfaces();

  // Get all segmentations from store
  const state = useSegmentationStore.getState();

  console.log('[MedAI] Processing', state.segmentations.length, 'segmentations');

  let surfaceCount = 0;

  for (const segmentation of state.segmentations) {
    console.log('[MedAI] Processing segmentation:', segmentation.id,
      'volumeId:', segmentation.volumeId,
      'segments:', segmentation.segments.length);

    // Determine rendering mode:
    // Multi-layer mode: segments have individual volumeId (binary masks)
    // Single-layer mode: segmentation has shared volumeId (multi-label labelmap)
    const hasMultiLayerSegments = segmentation.segments.some(s => s.volumeId);
    const sharedVolumeId = segmentation.volumeId;

    for (const segment of segmentation.segments) {
      if (!segment.visible) {
        console.log('[MedAI] Segment', segment.segmentIndex, 'not visible, skipping');
        continue;
      }

      const color = hexToRgba(segment.color, 180);
      let result = null;

      if (segment.volumeId) {
        // Multi-layer mode: segment has its own binary mask volume
        console.log('[MedAI] Multi-layer mode: creating surface from segment volume:', segment.volumeId);
        result = await createSurfaceFromSegment(segment.volumeId, color);
      } else if (sharedVolumeId) {
        // Single-layer mode: extract this label from shared labelmap volume
        console.log('[MedAI] Single-layer mode: creating surface from labelmap:', sharedVolumeId, 'label:', segment.segmentIndex);
        result = await createSurfaceFromLabelmap(sharedVolumeId, segment.segmentIndex, color);
      } else {
        console.log('[MedAI] Segment', segment.segmentIndex, 'has no volumeId and segmentation has no shared volumeId, skipping');
        continue;
      }

      if (result) {
        if (addSurfaceActorToViewport(result.actor, result.uid)) {
          // Use a composite key for tracking: either segment volumeId or segmentation volumeId + label index
          const trackingKey = segment.volumeId || `${sharedVolumeId}-label${segment.segmentIndex}`;
          surfaceActorMap.set(trackingKey, result.uid);
          surfaceCount++;
        }
      }
    }
  }

  console.log('[MedAI] Created', surfaceCount, 'surfaces');

  // Render the viewport
  viewport.render();

  // Reset camera to fit all surfaces (use default zoom)
  if (surfaceCount > 0) {
    viewport.resetCamera();
    viewport.render();

    // Save this as the initial camera state for the reset button
    // Only save if we haven't saved one yet (first time surfaces are added)
    if (!initialCameraState) {
      saveInitial3DCameraState();
    }
  }
}

/**
 * Clear all surface actors from the 3D viewport
 */
export function clearAllSurfaces(): void {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    return;
  }

  // Remove all tracked actors
  const actorUIDs = Array.from(surfaceActorMap.values());
  if (actorUIDs.length > 0) {
    try {
      viewport.removeActors(actorUIDs);
      console.log('[MedAI] Cleared', actorUIDs.length, 'surface actors');
    } catch (err) {
      console.error('[MedAI] Failed to clear surface actors:', err);
    }
  }

  surfaceActorMap.clear();

  // Clear the saved initial camera state so it gets recalculated for new content
  initialCameraState = null;
}

/**
 * Update a single segment's surface
 */
export async function updateSegmentSurface(
  segmentVolumeId: string,
  color: [number, number, number, number],
  visible: boolean
): Promise<void> {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    return;
  }

  // Remove old actor if exists
  const oldActorUID = surfaceActorMap.get(segmentVolumeId);
  if (oldActorUID) {
    removeSurfaceActorFromViewport(oldActorUID);
    surfaceActorMap.delete(segmentVolumeId);
  }

  // If not visible, don't create new surface
  if (!visible) {
    viewport.render();
    return;
  }

  // Create new surface
  const result = await createSurfaceFromSegment(segmentVolumeId, color);

  if (result) {
    if (addSurfaceActorToViewport(result.actor, result.uid)) {
      surfaceActorMap.set(segmentVolumeId, result.uid);
    }
  }

  viewport.render();
}

/**
 * Sync MPR viewports to a world position (for click-to-crosshair)
 */
export function syncMPRViewportsToWorld(
  worldPos: cornerstone3D.Types.Point3
): void {
  const engine = getRenderingEngine();
  const viewportIds = ['axial', 'sagittal', 'coronal'];

  viewportIds.forEach((vpId) => {
    const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      try {
        cornerstoneTools.utilities.viewport.jumpToWorld(viewport, worldPos);
      } catch (e) {
        console.error(`[MedAI] Failed to jump ${vpId}:`, e);
      }
    }
  });

  engine.renderViewports(viewportIds);
}

/**
 * Setup click handler for 3D viewport to sync crosshairs
 */
export function setup3DClickHandler(element: HTMLDivElement): () => void {
  const handleClick = (event: MouseEvent) => {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

    if (!viewport) {
      return;
    }

    // Get canvas coordinates
    const rect = element.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    try {
      // Convert canvas to world coordinates
      const worldPos = viewport.canvasToWorld([canvasX, canvasY]);

      if (worldPos) {
        console.log('[MedAI] 3D click at world position:', worldPos);
        syncMPRViewportsToWorld(worldPos);
      }
    } catch (err) {
      // Click may not have hit a surface
      console.log('[MedAI] 3D click did not hit surface');
    }
  };

  element.addEventListener('click', handleClick);

  // Return cleanup function
  return () => {
    element.removeEventListener('click', handleClick);
  };
}

/**
 * Debounced surface update - used when segmentation data changes
 */
function debouncedUpdateSurfaces(): void {
  if (updateDebounceTimer) {
    clearTimeout(updateDebounceTimer);
  }

  updateDebounceTimer = setTimeout(() => {
    addAllSegmentSurfaces();
  }, UPDATE_DEBOUNCE_MS);
}

/**
 * Subscribe to segmentation changes to update surfaces
 */
export function subscribeToSegmentationChanges(): () => void {
  const eventTarget = cornerstone3D.eventTarget;

  const handleSegmentationModified = () => {
    console.log('[MedAI] Segmentation data modified, scheduling surface update');
    debouncedUpdateSurfaces();
  };

  // Listen for segmentation data modified events
  eventTarget.addEventListener(
    cornerstoneTools.Enums.Events.SEGMENTATION_DATA_MODIFIED,
    handleSegmentationModified
  );

  // Also subscribe to the Zustand store for visibility changes
  const unsubscribeStore = useSegmentationStore.subscribe((state, prevState) => {
    // Check if segmentations changed
    if (state.segmentations !== prevState.segmentations) {
      console.log('[MedAI] Segmentation store changed, updating surfaces');
      debouncedUpdateSurfaces();
    }
  });

  // Return cleanup function
  return () => {
    eventTarget.removeEventListener(
      cornerstoneTools.Enums.Events.SEGMENTATION_DATA_MODIFIED,
      handleSegmentationModified
    );
    unsubscribeStore();

    if (updateDebounceTimer) {
      clearTimeout(updateDebounceTimer);
    }
  };
}

/**
 * Check if the 3D viewport is ready
 */
export function is3DViewportReady(): boolean {
  try {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(VIEWPORT_3D_ID);
    return !!viewport;
  } catch {
    return false;
  }
}

/**
 * Render the 3D viewport
 */
export function render3DViewport(): void {
  try {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      viewport.render();
    }
  } catch (err) {
    console.error('[MedAI] Failed to render 3D viewport:', err);
  }
}

/**
 * Reset the 3D camera to fit all content
 */
/**
 * Save the current camera state as the initial state for reset
 */
export function saveInitial3DCameraState(): void {
  try {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      initialCameraState = { ...viewport.getCamera() };
      console.log('[MedAI] Saved initial 3D camera state');
    }
  } catch (err) {
    console.error('[MedAI] Failed to save initial camera state:', err);
  }
}

/**
 * Reset 3D camera to the initial saved state
 */
export function reset3DCamera(): void {
  try {
    const engine = getRenderingEngine();
    const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      if (initialCameraState) {
        // Restore the saved initial camera state
        viewport.setCamera(initialCameraState);
        console.log('[MedAI] Restored camera to initial state');
      } else {
        // Fallback: reset to fit all objects
        viewport.resetCamera();
        console.log('[MedAI] No saved state, using default reset');
      }
      viewport.render();
    }
  } catch (err) {
    console.error('[MedAI] Failed to reset 3D camera:', err);
  }
}

// Track crosshair line actors
const crosshairLineUIDs: string[] = [];

/**
 * Create or update 3D crosshair lines at a world position
 * Shows slice plane intersections like ITK-SNAP
 */
export function update3DCrosshairMarker(worldPos: cornerstone3D.Types.Point3): void {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) return;

  // Remove old crosshair lines
  crosshairLineUIDs.forEach(uid => {
    try {
      viewport.removeActors([uid]);
    } catch (e) {
      // Actor may not exist
    }
  });
  crosshairLineUIDs.length = 0;

  // Calculate line length based on volume bounds
  let lineLength = 100;
  try {
    const volumes = cache.getVolumes();
    if (volumes && volumes.length > 0) {
      const volume = volumes[0];
      if (volume?.dimensions) {
        const dims = volume.dimensions;
        const spacing = volume.spacing || [1, 1, 1];
        const maxExtent = Math.max(
          dims[0] * spacing[0],
          dims[1] * spacing[1],
          dims[2] * spacing[2]
        );
        lineLength = maxExtent * 0.6; // Lines extend 60% of max dimension
      }
    }
  } catch (e) {
    console.warn('[MedAI] Could not determine volume dimensions for crosshair');
  }

  console.log('[MedAI] ========================================');
  console.log('[MedAI] Creating crosshair at position: [' + worldPos[0] + ', ' + worldPos[1] + ', ' + worldPos[2] + ']');
  console.log('[MedAI] Line length:', lineLength);
  console.log('[MedAI] X-line from: [' + (worldPos[0] - lineLength / 2) + ', ' + worldPos[1] + ', ' + worldPos[2] + '] to: [' + (worldPos[0] + lineLength / 2) + ', ' + worldPos[1] + ', ' + worldPos[2] + ']');
  console.log('[MedAI] Y-line from: [' + worldPos[0] + ', ' + (worldPos[1] - lineLength / 2) + ', ' + worldPos[2] + '] to: [' + worldPos[0] + ', ' + (worldPos[1] + lineLength / 2) + ', ' + worldPos[2] + ']');
  console.log('[MedAI] Z-line from: [' + worldPos[0] + ', ' + worldPos[1] + ', ' + (worldPos[2] - lineLength / 2) + '] to: [' + worldPos[0] + ', ' + worldPos[1] + ', ' + (worldPos[2] + lineLength / 2) + ']');

  // Get volume info for debugging
  try {
    const volumes = cache.getVolumes();
    if (volumes && volumes.length > 0) {
      const volume = volumes[0];
      const dims = volume.dimensions;
      const spacing = volume.spacing;
      const origin = (volume as any).origin || [0, 0, 0];
      console.log('[MedAI] Volume dimensions: [' + dims[0] + ', ' + dims[1] + ', ' + dims[2] + ']');
      console.log('[MedAI] Volume spacing: [' + spacing[0] + ', ' + spacing[1] + ', ' + spacing[2] + ']');
      console.log('[MedAI] Volume origin: [' + origin[0] + ', ' + origin[1] + ', ' + origin[2] + ']');
      console.log('[MedAI] Volume bounds: [' +
        origin[0] + ' to ' + (origin[0] + dims[0] * spacing[0]) + ', ' +
        origin[1] + ' to ' + (origin[1] + dims[1] * spacing[1]) + ', ' +
        origin[2] + ' to ' + (origin[2] + dims[2] * spacing[2]) + ']');
    }
  } catch (e) {
    console.error('[MedAI] Error getting volume info:', e);
  }
  console.log('[MedAI] ========================================');

  // Create three perpendicular lines intersecting at worldPos
  // Like ITK-SNAP: show the three orthogonal slice planes

  // Line 1: Along X axis (Sagittal/Coronal intersection) - Yellow/Red
  const xLine = vtkLineSource.newInstance();
  xLine.setPoint1(worldPos[0] - lineLength / 2, worldPos[1], worldPos[2]);
  xLine.setPoint2(worldPos[0] + lineLength / 2, worldPos[1], worldPos[2]);

  const xMapper = vtkMapper.newInstance();
  xMapper.setInputConnection(xLine.getOutputPort());

  const xActor = vtkActor.newInstance();
  xActor.setMapper(xMapper);
  xActor.getProperty().setColor(1.0, 1.0, 0.0); // Yellow (axial plane color)
  xActor.getProperty().setLineWidth(4); // Thicker lines
  xActor.getProperty().setAmbient(1.0);
  xActor.getProperty().setDiffuse(0.0);
  xActor.getProperty().setSpecular(0.0);

  // Line 2: Along Y axis (Axial/Coronal intersection) - Cyan/Green
  const yLine = vtkLineSource.newInstance();
  yLine.setPoint1(worldPos[0], worldPos[1] - lineLength / 2, worldPos[2]);
  yLine.setPoint2(worldPos[0], worldPos[1] + lineLength / 2, worldPos[2]);

  const yMapper = vtkMapper.newInstance();
  yMapper.setInputConnection(yLine.getOutputPort());

  const yActor = vtkActor.newInstance();
  yActor.setMapper(yMapper);
  yActor.getProperty().setColor(0.0, 1.0, 1.0); // Cyan (sagittal plane color)
  yActor.getProperty().setLineWidth(4); // Thicker lines
  yActor.getProperty().setAmbient(1.0);
  yActor.getProperty().setDiffuse(0.0);
  yActor.getProperty().setSpecular(0.0);

  // Line 3: Along Z axis (Axial/Sagittal intersection) - Magenta/Blue
  const zLine = vtkLineSource.newInstance();
  zLine.setPoint1(worldPos[0], worldPos[1], worldPos[2] - lineLength / 2);
  zLine.setPoint2(worldPos[0], worldPos[1], worldPos[2] + lineLength / 2);

  const zMapper = vtkMapper.newInstance();
  zMapper.setInputConnection(zLine.getOutputPort());

  const zActor = vtkActor.newInstance();
  zActor.setMapper(zMapper);
  zActor.getProperty().setColor(1.0, 0.0, 1.0); // Magenta (coronal plane color)
  zActor.getProperty().setLineWidth(4); // Thicker lines
  zActor.getProperty().setAmbient(1.0);
  zActor.getProperty().setDiffuse(0.0);
  zActor.getProperty().setSpecular(0.0);

  // Add all three lines to viewport
  const lines = [
    { actor: xActor, name: 'x-crosshair' },
    { actor: yActor, name: 'y-crosshair' },
    { actor: zActor, name: 'z-crosshair' },
  ];

  lines.forEach(({ actor, name }) => {
    const uid = `crosshair-line-${name}-${Date.now()}`;
    viewport.addActor({ uid, actor });
    crosshairLineUIDs.push(uid);
  });

  // Update camera focal point to crosshair BUT keep camera distance
  // This makes rotation happen around the crosshair while keeping everything in view
  const camera = viewport.getCamera();
  const oldFocal = camera.focalPoint;
  const oldPos = camera.position;

  if (!oldFocal || !oldPos) {
    console.warn('[MedAI] Camera focal point or position not defined');
    return;
  }

  // Calculate camera offset from focal point
  const offset = [
    oldPos[0] - oldFocal[0],
    oldPos[1] - oldFocal[1],
    oldPos[2] - oldFocal[2]
  ];

  // Move camera to maintain same offset from new focal point
  const newPos: [number, number, number] = [
    worldPos[0] + offset[0],
    worldPos[1] + offset[1],
    worldPos[2] + offset[2]
  ];

  console.log('[MedAI] Updating camera to look at crosshair');
  console.log('[MedAI]   Old focal:', oldFocal, 'New focal:', worldPos);
  console.log('[MedAI]   Old pos:', oldPos, 'New pos:', newPos);

  viewport.setCamera({
    ...camera,
    focalPoint: [worldPos[0], worldPos[1], worldPos[2]],
    position: newPos
  });

  console.log('[MedAI] ✓ Crosshair lines added and camera updated');
  viewport.render();
}

/**
 * Remove 3D crosshair lines
 */
export function remove3DCrosshairMarker(): void {
  if (crosshairLineUIDs.length === 0) return;

  const engine = getRenderingEngine();
  const viewport = engine.getViewport(VIEWPORT_3D_ID);
  if (!viewport) return;

  try {
    viewport.removeActors(crosshairLineUIDs);
    viewport.render();
    crosshairLineUIDs.length = 0;
  } catch (e) {
    console.error('[MedAI] Failed to remove crosshair lines:', e);
  }
}

/**
 * Get current crosshair position from 2D viewports
 * Since 3D viewport uses the same CT volume as 2D viewports, coordinates match directly
 */
function getCrosshairWorldPosition(): cornerstone3D.Types.Point3 | null {
  const engine = getRenderingEngine();
  const axialViewport = engine.getViewport('axial') as cornerstone3D.Types.IVolumeViewport;

  if (!axialViewport) return null;

  // Get camera focal point from 2D viewport
  const camera = axialViewport.getCamera();
  return camera.focalPoint as cornerstone3D.Types.Point3;
}

/**
 * Setup listener for 2D viewport changes to update 3D crosshair
 * Returns cleanup function
 */
export function setup2DTo3DCrosshairSync(): () => void {
  const engine = getRenderingEngine();
  const eventTarget = cornerstone3D.eventTarget;
  const viewportIds = ['axial', 'sagittal', 'coronal'];

  const handleCameraModified = (evt: any) => {
    if (!is3DViewportReady()) return;

    const viewportId = evt.detail?.viewportId;
    if (!viewportIds.includes(viewportId)) return;

    const worldPos = getCrosshairWorldPosition();
    if (worldPos) {
      update3DCrosshairMarker(worldPos);
    }
  };

  eventTarget.addEventListener(
    cornerstone3D.Enums.Events.CAMERA_MODIFIED,
    handleCameraModified
  );

  console.log('[MedAI] Setup 2D→3D crosshair synchronization');

  // Create initial crosshair marker at current position
  const initialPos = getCrosshairWorldPosition();
  if (initialPos) {
    console.log('[MedAI] Creating initial crosshair marker');
    update3DCrosshairMarker(initialPos);
  }

  return () => {
    eventTarget.removeEventListener(
      cornerstone3D.Enums.Events.CAMERA_MODIFIED,
      handleCameraModified
    );
    remove3DCrosshairMarker();
  };
}
