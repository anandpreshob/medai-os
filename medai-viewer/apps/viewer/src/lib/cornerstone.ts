import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import pako from 'pako';
import type { LoadedImage, ImageMetadata } from '@medai/core';
import ProbeMONAILabelTool, {
  getPointAnnotations,
  clearPointAnnotations,
  setPointMode,
  getPointMode,
} from '../tools/ProbeMONAILabelTool';
import RectangleMONAILabelTool, {
  getBoxAnnotations,
  clearBoxAnnotations,
  setBoxMode,
  getBoxMode,
} from '../tools/RectangleMONAILabelTool';
import FreehandMONAILabelTool, {
  getFreehandAnnotations,
  clearFreehandAnnotations,
  setFreehandMode,
  getFreehandMode,
  setFreehandLassoMode,
  getFreehandLassoMode,
} from '../tools/FreehandMONAILabelTool';
import PolygonAnnotationTool, {
  getPolygonAnnotations,
  clearPolygonAnnotations,
} from '../tools/PolygonAnnotationTool';
import PolylineAnnotationTool, {
  getPolylineAnnotations,
  clearPolylineAnnotations,
} from '../tools/PolylineAnnotationTool';
import SmartBrushTool, {
  getSmartBrushPoints,
  clearSmartBrushPoints,
  setSmartBrushMode,
  getSmartBrushMode,
} from '../tools/SmartBrushTool';
import { installSimple2DBrush } from './simple2DBrush';
import {
  installLassoFillTool,
  activateLassoFillMode,
  setLassoEraseMode,
  isLassoActive,
} from './lassoFillTool';

const {
  RenderingEngine,
  Enums,
  volumeLoader,
  cache,
  setVolumesForViewports,
} = cornerstone3D;

const { segmentation } = cornerstoneTools;

const { ViewportType } = Enums;

let initialized = false;
let initializationPromise: Promise<void> | null = null;
let renderingEngine: cornerstone3D.Types.IRenderingEngine | null = null;

export const RENDERING_ENGINE_ID = 'medaiRenderingEngine';

// Segment colors palette for auto-segmentation
const SEGMENT_COLORS_PALETTE = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
  '#00ffff', '#ff8000', '#8000ff', '#00ff80', '#ff8080',
  '#80ff00', '#0080ff', '#ff0080', '#80ff80', '#8080ff',
];

export interface VolumeInfo {
  volumeId: string;
  volume: any;
}

// Store for our custom volumes
const volumeDataStore = new Map<string, {
  scalarData: Float32Array | Int16Array | Uint8Array | Uint16Array;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: Float32Array;
  metadata: ImageMetadata;
}>();


function getBitsAllocated(dataType: ImageMetadata['dataType']): number {
  switch (dataType) {
    case 'uint8':
    case 'int8':
      return 8;
    case 'uint16':
    case 'int16':
      return 16;
    case 'float32':
      return 32;
    case 'float64':
      return 64;
    default:
      return 16;
  }
}

/**
 * Initialize Cornerstone3D and tools
 * Uses a promise-based lock to prevent race conditions from React StrictMode
 */
export async function initCornerstone(): Promise<void> {
  // If already initialized, return immediately
  if (initialized) {
    console.log('[MedAI] Cornerstone3D already initialized');
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    console.log('[MedAI] Waiting for existing initialization to complete...');
    return initializationPromise;
  }

  // Start initialization with a lock
  initializationPromise = doInitialize();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

/**
 * Internal initialization function
 */
async function doInitialize(): Promise<void> {
  console.log('[MedAI] Starting Cornerstone3D initialization...');

  // Check for WebGL support
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    throw new Error('WebGL is not supported in this browser');
  }
  console.log('[MedAI] WebGL support confirmed');

  // Check for SharedArrayBuffer (required for some operations)
  if (typeof SharedArrayBuffer === 'undefined') {
    console.warn('[MedAI] SharedArrayBuffer not available - some features may be limited');
    console.warn('[MedAI] Make sure Cross-Origin headers are set correctly');
  } else {
    console.log('[MedAI] SharedArrayBuffer available');
  }

  try {
    // Initialize Cornerstone3D core
    console.log('[MedAI] Initializing Cornerstone3D core...');
    await cornerstone3D.init();
    console.log('[MedAI] Cornerstone3D core initialized successfully');
  } catch (err) {
    console.error('[MedAI] Failed to initialize Cornerstone3D core:', err);
    throw new Error(`Cornerstone3D core init failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    // Initialize Cornerstone Tools
    console.log('[MedAI] Initializing Cornerstone Tools...');
    await cornerstoneTools.init();
    console.log('[MedAI] Cornerstone Tools initialized successfully');
  } catch (err) {
    console.error('[MedAI] Failed to initialize Cornerstone Tools:', err);
    throw new Error(`Cornerstone Tools init failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    // Add viewport tools
    console.log('[MedAI] Adding viewport tools...');
    cornerstoneTools.addTool(cornerstoneTools.PanTool);
    cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
    cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
    cornerstoneTools.addTool(cornerstoneTools.CrosshairsTool);
    // Add 3D viewport tools
    cornerstoneTools.addTool(cornerstoneTools.TrackballRotateTool);
    console.log('[MedAI] Viewport tools added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add tools:', err);
    throw new Error(`Failed to add tools: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    // Add annotation/measurement tools
    console.log('[MedAI] Adding annotation tools...');
    cornerstoneTools.addTool(cornerstoneTools.LengthTool);
    cornerstoneTools.addTool(cornerstoneTools.RectangleROITool);

    // Phase 1 Essential Tools - Measurement
    cornerstoneTools.addTool(cornerstoneTools.ProbeTool);
    cornerstoneTools.addTool(cornerstoneTools.AngleTool);
    cornerstoneTools.addTool(cornerstoneTools.BidirectionalTool);
    cornerstoneTools.addTool(cornerstoneTools.EllipticalROITool);
    cornerstoneTools.addTool(cornerstoneTools.ArrowAnnotateTool);

    console.log('[MedAI] Annotation tools added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add annotation tools:', err);
    console.warn('[MedAI] Measurement and bounding box tools may not be available');
  }

  try {
    // Add segmentation display tool (REQUIRED for showing segmentation overlays)
    console.log('[MedAI] Adding SegmentationDisplayTool...');
    cornerstoneTools.addTool(cornerstoneTools.SegmentationDisplayTool);
    console.log('[MedAI] SegmentationDisplayTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add SegmentationDisplayTool:', err);
    console.warn('[MedAI] Segmentation overlay display may not work');
  }

  try {
    // Add segmentation editing tools
    console.log('[MedAI] Adding segmentation editing tools...');
    // Add base BrushTool class - required for named instances
    cornerstoneTools.addTool(cornerstoneTools.BrushTool);
    cornerstoneTools.addTool(cornerstoneTools.CircleScissorsTool);
    cornerstoneTools.addTool(cornerstoneTools.RectangleScissorsTool);
    cornerstoneTools.addTool(cornerstoneTools.SphereScissorsTool);
    console.log('[MedAI] Segmentation editing tools added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add segmentation editing tools:', err);
    // Non-fatal - continue without segmentation tools
    console.warn('[MedAI] Segmentation editing will not be available');
  }

  try {
    // Add ProbeMONAILabel tool for SmartEdit point prompts
    console.log('[MedAI] Adding ProbeMONAILabelTool...');
    cornerstoneTools.addTool(ProbeMONAILabelTool);
    console.log('[MedAI] ProbeMONAILabelTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add ProbeMONAILabelTool:', err);
    console.warn('[MedAI] SmartEdit point prompts may not be available');
  }

  try {
    // Add RectangleMONAILabel tool for SmartEdit bounding box prompts
    console.log('[MedAI] Adding RectangleMONAILabelTool...');
    cornerstoneTools.addTool(RectangleMONAILabelTool);
    console.log('[MedAI] RectangleMONAILabelTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add RectangleMONAILabelTool:', err);
    console.warn('[MedAI] SmartEdit bounding box prompts may not be available');
  }

  try {
    // Add FreehandMONAILabel tool for SmartEdit scribble/lasso prompts
    console.log('[MedAI] Adding FreehandMONAILabelTool...');
    cornerstoneTools.addTool(FreehandMONAILabelTool);
    console.log('[MedAI] FreehandMONAILabelTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add FreehandMONAILabelTool:', err);
    console.warn('[MedAI] SmartEdit scribble/lasso prompts may not be available');
  }

  try {
    // Add PolygonAnnotationTool for closed polygon annotations
    console.log('[MedAI] Adding PolygonAnnotationTool...');
    cornerstoneTools.addTool(PolygonAnnotationTool);
    console.log('[MedAI] PolygonAnnotationTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add PolygonAnnotationTool:', err);
    console.warn('[MedAI] Polygon annotations may not be available');
  }

  try {
    // Add PolylineAnnotationTool for open polyline annotations
    console.log('[MedAI] Adding PolylineAnnotationTool...');
    cornerstoneTools.addTool(PolylineAnnotationTool);
    console.log('[MedAI] PolylineAnnotationTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add PolylineAnnotationTool:', err);
    console.warn('[MedAI] Polyline annotations may not be available');
  }

  try {
    // Add SmartBrushTool for AI-assisted click-to-segment
    console.log('[MedAI] Adding SmartBrushTool...');
    cornerstoneTools.addTool(SmartBrushTool);
    console.log('[MedAI] SmartBrushTool added successfully');
  } catch (err) {
    console.error('[MedAI] Failed to add SmartBrushTool:', err);
    console.warn('[MedAI] SmartBrush tool may not be available');
  }

  initialized = true;
  console.log('[MedAI] Cornerstone3D fully initialized and ready');
}

// Named brush tool instances - following OHIF pattern
// These are registered with the tool group, not globally
export const BRUSH_TOOL_NAMES = {
  CircularBrush: 'CircularBrush',
  CircularEraser: 'CircularEraser',
  SphereBrush: 'SphereBrush',
  SphereEraser: 'SphereEraser',
} as const;

export const BRUSH_STRATEGIES = {
  [BRUSH_TOOL_NAMES.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [BRUSH_TOOL_NAMES.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [BRUSH_TOOL_NAMES.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [BRUSH_TOOL_NAMES.SphereEraser]: 'ERASE_INSIDE_SPHERE',
} as const;

/**
 * Get or create the rendering engine
 */
export function getRenderingEngine(): cornerstone3D.Types.IRenderingEngine {
  if (!renderingEngine) {
    renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
  }
  return renderingEngine;
}

/**
 * Convert LoadedImage from ITK-WASM to Cornerstone3D volume
 */
export async function createVolumeFromLoadedImage(
  loadedImage: LoadedImage,
  volumeId?: string
): Promise<VolumeInfo> {
  const { metadata, pixelData, imageId } = loadedImage;
  const vId = volumeId || `localVolume:${imageId}`;

  console.log('[MedAI] Creating volume from loaded image:', {
    imageId,
    volumeId: vId,
    dimensions: [metadata.width, metadata.height, metadata.depth],
    spacing: [metadata.spacingX, metadata.spacingY, metadata.spacingZ],
    origin: [metadata.originX, metadata.originY, metadata.originZ],
    dataType: metadata.dataType,
    pixelDataSize: pixelData.byteLength,
  });

  // Check if volume already exists in cache
  const cachedVolume = cache.getVolume(vId);
  if (cachedVolume) {
    console.log('[MedAI] Using cached volume:', vId);
    return { volumeId: vId, volume: cachedVolume };
  }

  // Create typed array from pixel data
  const TypedArrayConstructor = getTypedArrayConstructor(metadata.dataType);
  const scalarData = new TypedArrayConstructor(pixelData);
  console.log('[MedAI] Created scalar data array:', {
    type: scalarData.constructor.name,
    length: scalarData.length,
    byteLength: scalarData.byteLength,
  });

  // Store volume data for our loader (for reference)
  volumeDataStore.set(vId, {
    scalarData: scalarData as Float32Array | Int16Array | Uint8Array | Uint16Array,
    dimensions: [metadata.width, metadata.height, metadata.depth],
    spacing: [metadata.spacingX, metadata.spacingY, metadata.spacingZ],
    origin: [metadata.originX, metadata.originY, metadata.originZ],
    direction: new Float32Array(metadata.direction),
    metadata,
  });

  try {
    // Use Cornerstone3D's createLocalVolume for proper VTK integration
    console.log('[MedAI] Calling volumeLoader.createLocalVolume...');
    const volume = volumeLoader.createLocalVolume(
      {
        scalarData: scalarData as Float32Array | Int16Array | Uint8Array | Uint16Array,
        metadata: {
          BitsAllocated: getBitsAllocated(metadata.dataType),
          BitsStored: getBitsAllocated(metadata.dataType),
          SamplesPerPixel: 1,
          HighBit: getBitsAllocated(metadata.dataType) - 1,
          PixelRepresentation: (metadata.dataType === 'int8' || metadata.dataType === 'int16') ? 1 : 0,
          PhotometricInterpretation: 'MONOCHROME2',
          Columns: metadata.width,
          Rows: metadata.height,
        } as any,
        dimensions: [metadata.width, metadata.height, metadata.depth] as cornerstone3D.Types.Point3,
        spacing: [metadata.spacingX, metadata.spacingY, metadata.spacingZ] as cornerstone3D.Types.Point3,
        origin: [metadata.originX, metadata.originY, metadata.originZ] as cornerstone3D.Types.Point3,
        direction: new Float32Array(metadata.direction) as unknown as cornerstone3D.Types.Mat3,
      },
      vId,
      false // preventCache = false, so volume gets cached
    );

    console.log('[MedAI] Volume created successfully:', vId);
    return { volumeId: vId, volume };
  } catch (err) {
    console.error('[MedAI] Failed to create volume:', err);
    throw err;
  }
}

/**
 * Get TypedArray constructor based on data type
 */
function getTypedArrayConstructor(
  dataType: ImageMetadata['dataType']
):
  | typeof Uint8Array
  | typeof Int8Array
  | typeof Uint16Array
  | typeof Int16Array
  | typeof Float32Array
  | typeof Float64Array {
  switch (dataType) {
    case 'uint8':
      return Uint8Array;
    case 'int8':
      return Int8Array;
    case 'uint16':
      return Uint16Array;
    case 'int16':
      return Int16Array;
    case 'float32':
      return Float32Array;
    case 'float64':
      return Float64Array;
    default:
      return Float32Array;
  }
}

/**
 * Create MPR viewports for a volume
 */
export async function createMPRViewports(
  elements: {
    axial: HTMLDivElement;
    sagittal: HTMLDivElement;
    coronal: HTMLDivElement;
  },
  volumeId: string
): Promise<void> {
  console.log('[MedAI] Creating MPR viewports for volume:', volumeId);
  console.log('[MedAI] Element sizes:', {
    axial: { width: elements.axial.clientWidth, height: elements.axial.clientHeight },
    sagittal: { width: elements.sagittal.clientWidth, height: elements.sagittal.clientHeight },
    coronal: { width: elements.coronal.clientWidth, height: elements.coronal.clientHeight },
  });

  const engine = getRenderingEngine();
  console.log('[MedAI] Rendering engine ID:', engine.id);

  // Disable any existing viewports
  try {
    engine.disableElement('axial');
    engine.disableElement('sagittal');
    engine.disableElement('coronal');
    console.log('[MedAI] Disabled existing viewports');
  } catch (e) {
    console.log('[MedAI] No existing viewports to disable');
  }

  const viewportInputs: cornerstone3D.Types.PublicViewportInput[] = [
    {
      viewportId: 'axial',
      type: ViewportType.ORTHOGRAPHIC,
      element: elements.axial,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: [0, 0, 0] as cornerstone3D.Types.Point3,
      },
    },
    {
      viewportId: 'sagittal',
      type: ViewportType.ORTHOGRAPHIC,
      element: elements.sagittal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0] as cornerstone3D.Types.Point3,
      },
    },
    {
      viewportId: 'coronal',
      type: ViewportType.ORTHOGRAPHIC,
      element: elements.coronal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [0, 0, 0] as cornerstone3D.Types.Point3,
      },
    },
  ];

  try {
    console.log('[MedAI] Setting viewports...');
    engine.setViewports(viewportInputs);
    console.log('[MedAI] Viewports set successfully');
  } catch (err) {
    console.error('[MedAI] Failed to set viewports:', err);
    throw err;
  }

  try {
    // Set the volume on all viewports
    console.log('[MedAI] Setting volumes for viewports...');
    await setVolumesForViewports(
      engine,
      [{ volumeId }],
      ['axial', 'sagittal', 'coronal']
    );
    console.log('[MedAI] Volumes set successfully');
  } catch (err) {
    console.error('[MedAI] Failed to set volumes for viewports:', err);
    throw err;
  }

  // Calculate and set appropriate window/level for the volume
  try {
    const volume = cache.getVolume(volumeId);
    if (volume) {
      const scalarData = volume.getScalarData();

      // Sort a sample of the data to find percentiles (for performance)
      // For MRI, we want to exclude background zeros and use percentile-based windowing
      const sampleSize = Math.min(10000, scalarData.length);
      const step = Math.max(1, Math.floor(scalarData.length / sampleSize));
      const sample: number[] = [];
      for (let i = 0; i < scalarData.length; i += step) {
        const value = scalarData[i];
        // Exclude zeros (background) for MRI
        if (value > 0) {
          sample.push(value);
        }
      }

      if (sample.length === 0) {
        console.warn('[MedAI] All zero volume, using full range');
        // Fallback to full range
        sample.push(...Array.from(scalarData).slice(0, 1000));
      }

      sample.sort((a, b) => a - b);

      // Use 1st and 99th percentile for better contrast
      const p1Index = Math.floor(sample.length * 0.01);
      const p99Index = Math.floor(sample.length * 0.99);
      let lower = sample[p1Index] || sample[0];
      let upper = sample[p99Index] || sample[sample.length - 1];

      // Ensure we have a valid range (lower < upper)
      // VTK requires non-zero width color range
      if (lower >= upper) {
        const min = sample[0];
        const max = sample[sample.length - 1];
        if (min === max) {
          // All values are the same - use a default range around the value
          lower = min - 1;
          upper = min + 1;
        } else {
          // Use full range if percentiles don't work
          lower = min;
          upper = max;
        }
      }

      console.log('[MedAI] Volume intensity range (1%-99% percentile):', { lower, upper, nonZeroSamples: sample.length });

      // Set VOI range for all viewports
      const viewportIds = ['axial', 'sagittal', 'coronal'];
      for (const viewportId of viewportIds) {
        const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;
        if (viewport) {
          // Get camera position BEFORE any changes
          const cameraBefore = viewport.getCamera();
          console.log(`[MedAI] ${viewportId} camera BEFORE resetCamera:`, {
            position: cameraBefore.position,
            focalPoint: cameraBefore.focalPoint,
            viewUp: cameraBefore.viewUp,
            parallelScale: cameraBefore.parallelScale
          });

          viewport.setProperties({
            voiRange: { lower, upper },
          });

          // Reset camera to properly frame the volume
          // This is crucial for non-DICOM formats that may have different coordinate systems
          console.log(`[MedAI] ${viewportId} calling resetCamera()...`);
          viewport.resetCamera();

          // Get camera position AFTER reset
          const cameraAfter = viewport.getCamera();
          console.log(`[MedAI] ${viewportId} camera AFTER resetCamera:`, {
            position: cameraAfter.position,
            focalPoint: cameraAfter.focalPoint,
            viewUp: cameraAfter.viewUp,
            parallelScale: cameraAfter.parallelScale
          });
        }
      }
      console.log('[MedAI] VOI range set for all viewports');
    }
  } catch (err) {
    console.warn('[MedAI] Failed to set VOI range:', err);
    // Don't fail if VOI setting fails, continue with rendering
  }

  try {
    // Render all viewports
    console.log('[MedAI] Rendering viewports...');
    engine.renderViewports(['axial', 'sagittal', 'coronal']);
    console.log('[MedAI] Viewports rendered successfully');

    // Log final camera state after initial render
    console.log('[MedAI] ========== FINAL CAMERA STATE AFTER INITIAL RENDER ==========');
    const viewportIds = ['axial', 'sagittal', 'coronal'];
    viewportIds.forEach(vpId => {
      const vp = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
      if (vp) {
        const camera = vp.getCamera();
        console.log(`[MedAI] ${vpId} FINAL camera:`, {
          position: camera.position,
          focalPoint: camera.focalPoint,
          viewUp: camera.viewUp,
          parallelScale: camera.parallelScale
        });
      }
    });
    console.log('[MedAI] ========================================');
  } catch (err) {
    console.error('[MedAI] Failed to render viewports:', err);
    throw err;
  }
}

/**
 * Create a 2D viewport for single 2D images (PNG, JPG, X-ray, etc.)
 * Uses a single-slice volume approach for reliable rendering with Cornerstone3D
 */
export async function create2DViewport(
  element: HTMLDivElement,
  loadedImage: LoadedImage,
  viewportId: string = 'main2d'
): Promise<void> {
  const { metadata, pixelData, imageId } = loadedImage;
  console.log('[MedAI] Creating 2D viewport for image:', imageId, 'metadata:', metadata);
  console.log('[MedAI] Element dimensions:', element.clientWidth, 'x', element.clientHeight);
  console.log('[MedAI] Pixel data size:', pixelData.byteLength, 'bytes');

  const engine = getRenderingEngine();

  // Disable any existing viewport with the same ID
  try {
    engine.disableElement(viewportId);
  } catch (e) {
    // Ignore - viewport may not exist
  }
  // Only disable MPR viewports if using the default 'main2d' viewport
  if (viewportId === 'main2d') {
    try {
      engine.disableElement('axial');
      engine.disableElement('sagittal');
      engine.disableElement('coronal');
    } catch (e) {
      // Ignore
    }
  }

  // Create unique volume ID for this 2D image
  // Use 'localVolume:' prefix to match 3D volume ID format
  const vId = `localVolume:${imageId}`;

  // Convert to the appropriate typed array
  const TypedArrayConstructor = getTypedArrayConstructor(metadata.dataType);
  const scalarData = new TypedArrayConstructor(pixelData);

  console.log('[MedAI] 2D scalar data:', {
    type: scalarData.constructor.name,
    length: scalarData.length,
    expected: metadata.width * metadata.height,
  });

  // Create a local volume for this 2D image (treated as single-slice 3D)
  // Use the same pattern as createVolume for 3D images
  const volume = volumeLoader.createLocalVolume(
    {
      scalarData: scalarData as Float32Array | Int16Array | Uint8Array | Uint16Array,
      metadata: {
        BitsAllocated: getBitsAllocated(metadata.dataType),
        BitsStored: getBitsAllocated(metadata.dataType),
        SamplesPerPixel: 1,
        HighBit: getBitsAllocated(metadata.dataType) - 1,
        PixelRepresentation: (metadata.dataType === 'int8' || metadata.dataType === 'int16') ? 1 : 0,
        PhotometricInterpretation: 'MONOCHROME2',
        Columns: metadata.width,
        Rows: metadata.height,
      } as any,
      dimensions: [metadata.width, metadata.height, 1] as cornerstone3D.Types.Point3,
      spacing: [metadata.spacingX, metadata.spacingY, metadata.spacingZ] as cornerstone3D.Types.Point3,
      origin: [metadata.originX, metadata.originY, metadata.originZ] as cornerstone3D.Types.Point3,
      direction: new Float32Array(metadata.direction) as unknown as cornerstone3D.Types.Mat3,
    },
    vId,
    false // preventCache = false, so volume gets cached
  );

  console.log('[MedAI] Created 2D volume:', vId, 'volume object:', volume);

  // Check if volume is in cache (might need to wait for load object promise)
  let cachedVolume = cache.getVolume(vId);
  console.log('[MedAI] Initial cache check:', cachedVolume ? 'YES' : 'NO');

  // Try to get the volume load object and wait for it
  const volumeLoadObject = cache.getVolumeLoadObject(vId);
  if (volumeLoadObject?.promise) {
    console.log('[MedAI] Found volume load object, waiting for promise...');
    try {
      cachedVolume = await volumeLoadObject.promise;
      console.log('[MedAI] Volume promise resolved:', cachedVolume?.volumeId);
    } catch (err) {
      console.error('[MedAI] Volume promise rejected:', err);
    }
  } else {
    console.log('[MedAI] No volume load object found');
  }

  // Store volume data
  volumeDataStore.set(vId, {
    scalarData: scalarData as Float32Array | Int16Array | Uint8Array | Uint16Array,
    dimensions: [metadata.width, metadata.height, 1],
    spacing: [metadata.spacingX, metadata.spacingY, metadata.spacingZ],
    origin: [metadata.originX, metadata.originY, metadata.originZ],
    direction: new Float32Array(metadata.direction),
    metadata,
  });

  // Create a single ORTHOGRAPHIC viewport for 2D image
  const viewportInput: cornerstone3D.Types.PublicViewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: cornerstone3D.Enums.OrientationAxis.AXIAL,
      background: [0, 0, 0] as cornerstone3D.Types.Point3,
    },
  };

  try {
    console.log('[MedAI] Setting 2D viewport...');
    engine.setViewports([viewportInput]);
    console.log('[MedAI] 2D viewport set successfully');
  } catch (err) {
    console.error('[MedAI] Failed to set 2D viewport:', err);
    throw err;
  }

  // Set the volume on the viewport using setVolumesForViewports (same as 3D)
  try {
    console.log('[MedAI] Setting 2D volume on viewport...');
    await setVolumesForViewports(
      engine,
      [{ volumeId: vId }],
      [viewportId]
    );
    console.log('[MedAI] 2D volume set successfully');

    const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

    // Calculate window/level from pixel values
    let minPixel = Number.MAX_VALUE;
    let maxPixel = Number.MIN_VALUE;
    for (let i = 0; i < scalarData.length; i++) {
      if (scalarData[i] < minPixel) minPixel = scalarData[i];
      if (scalarData[i] > maxPixel) maxPixel = scalarData[i];
    }

    // Set VOI to full range
    viewport.setProperties({
      voiRange: { lower: minPixel, upper: maxPixel },
    });

    viewport.resetCamera();
    viewport.render();

    console.log('[MedAI] 2D image rendered with VOI:', { minPixel, maxPixel });
  } catch (err) {
    console.error('[MedAI] Failed to render 2D image:', err);
    throw err;
  }
}

/**
 * Setup tool group for 2D viewports
 * Uses a separate tool group to avoid conflicts with 3D viewport tools
 */
export function setup2DToolGroup(viewportIds: string[]): string {
  const toolGroupId = 'medai2DToolGroup';

  // Destroy existing 3D tool group to avoid conflicts
  const existing3DGroup = cornerstoneTools.ToolGroupManager.getToolGroup('medaiToolGroup');
  if (existing3DGroup) {
    cornerstoneTools.ToolGroupManager.destroyToolGroup('medaiToolGroup');
    console.log('[MedAI] Destroyed 3D tool group');
  }

  // Check if 2D tool group already exists
  let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);

  if (!toolGroup) {
    toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

    if (!toolGroup) {
      throw new Error('Failed to create 2D tool group');
    }

    // Add basic tools for 2D viewing
    toolGroup.addTool(cornerstoneTools.PanTool.toolName);
    toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
    // Don't use WindowLevelTool for stack viewports - use StackScrollMouseWheelTool instead
    toolGroup.addTool(cornerstoneTools.StackScrollMouseWheelTool.toolName);

    // Add annotation/measurement tools
    toolGroup.addTool(cornerstoneTools.LengthTool.toolName);
    toolGroup.addTool(cornerstoneTools.RectangleROITool.toolName);

    // Phase 1 Essential Tools - Measurement
    toolGroup.addTool(cornerstoneTools.ProbeTool.toolName);
    toolGroup.addTool(cornerstoneTools.AngleTool.toolName);
    toolGroup.addTool(cornerstoneTools.BidirectionalTool.toolName);
    toolGroup.addTool(cornerstoneTools.EllipticalROITool.toolName);
    toolGroup.addTool(cornerstoneTools.ArrowAnnotateTool.toolName);

    // Add SegmentationDisplayTool (REQUIRED for showing segmentation overlays)
    toolGroup.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);

    // Add brush tools for 2D segmentation
    toolGroup.addToolInstance(
      BRUSH_TOOL_NAMES.CircularBrush,
      cornerstoneTools.BrushTool.toolName,
      { activeStrategy: BRUSH_STRATEGIES[BRUSH_TOOL_NAMES.CircularBrush] }
    );
    toolGroup.addToolInstance(
      BRUSH_TOOL_NAMES.CircularEraser,
      cornerstoneTools.BrushTool.toolName,
      { activeStrategy: BRUSH_STRATEGIES[BRUSH_TOOL_NAMES.CircularEraser] }
    );

    // Add scissor tools for rectangle/circle fill
    toolGroup.addTool(cornerstoneTools.RectangleScissorsTool.toolName);
    toolGroup.addTool(cornerstoneTools.CircleScissorsTool.toolName);

    // Add SmartEdit tools
    toolGroup.addTool(ProbeMONAILabelTool.toolName);
    toolGroup.addTool(RectangleMONAILabelTool.toolName);
    toolGroup.addTool(FreehandMONAILabelTool.toolName);

    // Add new annotation tools (Module 1: Enhanced Annotation Tools)
    toolGroup.addTool(PolygonAnnotationTool.toolName);
    toolGroup.addTool(PolylineAnnotationTool.toolName);
    toolGroup.addTool(SmartBrushTool.toolName);

    console.log('[MedAI] Enhanced annotation tools registered for 2D: PolygonAnnotation, PolylineAnnotation, SmartBrush');

    // Set tool modes - Pan as primary for 2D images
    toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
    });
    toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary }],
    });

    // Enable SegmentationDisplayTool
    toolGroup.setToolEnabled(cornerstoneTools.SegmentationDisplayTool.toolName);

    console.log('[MedAI] 2D tool group created');
  }

  // Add viewports to tool group
  const engine = getRenderingEngine();
  viewportIds.forEach((viewportId) => {
    toolGroup!.addViewport(viewportId, engine.id);
  });

  return toolGroupId;
}

/**
 * Setup tool group for viewports
 */
export function setupToolGroup(viewportIds: string[]): string {
  const toolGroupId = 'medaiToolGroup';

  // Check if tool group already exists
  let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);

  if (!toolGroup) {
    toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

    if (!toolGroup) {
      throw new Error('Failed to create tool group');
    }

    // Add tools to the group
    toolGroup.addTool(cornerstoneTools.PanTool.toolName);
    toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
    toolGroup.addTool(cornerstoneTools.StackScrollMouseWheelTool.toolName);
    toolGroup.addTool(cornerstoneTools.WindowLevelTool.toolName);

    // Add annotation/measurement tools
    toolGroup.addTool(cornerstoneTools.LengthTool.toolName);
    toolGroup.addTool(cornerstoneTools.RectangleROITool.toolName);

    // Phase 1 Essential Tools - Measurement
    toolGroup.addTool(cornerstoneTools.ProbeTool.toolName);
    toolGroup.addTool(cornerstoneTools.AngleTool.toolName);
    toolGroup.addTool(cornerstoneTools.BidirectionalTool.toolName);
    toolGroup.addTool(cornerstoneTools.EllipticalROITool.toolName);
    toolGroup.addTool(cornerstoneTools.ArrowAnnotateTool.toolName);

    // Add CrosshairsTool for synchronized navigation between viewports
    toolGroup.addTool(cornerstoneTools.CrosshairsTool.toolName, {
      getReferenceLineColor: (viewportId: string) => {
        // Different colors for each viewport orientation
        const colors: Record<string, string> = {
          axial: 'rgb(200, 200, 0)',     // Yellow for axial
          sagittal: 'rgb(0, 200, 200)',  // Cyan for sagittal
          coronal: 'rgb(200, 0, 200)',   // Magenta for coronal
        };
        return colors[viewportId] || 'rgb(255, 255, 255)';
      },
      getReferenceLineControllable: () => true,
      getReferenceLineDraggableRotatable: () => false,
      getReferenceLineSlabThicknessControlsOn: () => false,
    });

    // Add SegmentationDisplayTool (REQUIRED for showing segmentation overlays)
    toolGroup.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);

    // Add named brush tool instances - following OHIF pattern
    // Each instance has its own strategy set at registration time
    // FILL_INSIDE_CIRCLE should paint only on current slice (2D mode)
    toolGroup.addToolInstance(
      BRUSH_TOOL_NAMES.CircularBrush,
      cornerstoneTools.BrushTool.toolName,
      {
        activeStrategy: BRUSH_STRATEGIES[BRUSH_TOOL_NAMES.CircularBrush],
      }
    );
    toolGroup.addToolInstance(
      BRUSH_TOOL_NAMES.CircularEraser,
      cornerstoneTools.BrushTool.toolName,
      {
        activeStrategy: BRUSH_STRATEGIES[BRUSH_TOOL_NAMES.CircularEraser],
      }
    );
    toolGroup.addToolInstance(
      BRUSH_TOOL_NAMES.SphereBrush,
      cornerstoneTools.BrushTool.toolName,
      {
        activeStrategy: BRUSH_STRATEGIES[BRUSH_TOOL_NAMES.SphereBrush],
      }
    );
    toolGroup.addToolInstance(
      BRUSH_TOOL_NAMES.SphereEraser,
      cornerstoneTools.BrushTool.toolName,
      {
        activeStrategy: BRUSH_STRATEGIES[BRUSH_TOOL_NAMES.SphereEraser],
      }
    );

    console.log('[MedAI] Named brush tool instances registered:', Object.keys(BRUSH_TOOL_NAMES));

    // Add scissor tools for rectangle/circle fill
    toolGroup.addTool(cornerstoneTools.RectangleScissorsTool.toolName);
    toolGroup.addTool(cornerstoneTools.CircleScissorsTool.toolName);

    // Install custom 2D brush behavior that respects active segment for erasing
    // This ensures eraser only erases voxels belonging to the active segment
    installSimple2DBrush(toolGroupId);

    // Install lasso fill tool for polygon-based segmentation
    installLassoFillTool(toolGroupId);

    // Add ProbeMONAILabel tool for SmartEdit point prompts
    toolGroup.addTool(ProbeMONAILabelTool.toolName);

    // Add RectangleMONAILabel tool for SmartEdit bounding box prompts
    toolGroup.addTool(RectangleMONAILabelTool.toolName);

    // Add FreehandMONAILabel tool for SmartEdit scribble/lasso prompts
    toolGroup.addTool(FreehandMONAILabelTool.toolName);

    // Add new annotation tools (Module 1: Enhanced Annotation Tools)
    toolGroup.addTool(PolygonAnnotationTool.toolName);
    toolGroup.addTool(PolylineAnnotationTool.toolName);
    toolGroup.addTool(SmartBrushTool.toolName);

    console.log('[MedAI] Enhanced annotation tools registered: PolygonAnnotation, PolylineAnnotation, SmartBrush');

    // Set tool modes
    toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
    });
    toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary }],
    });
    toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary }],
    });
    toolGroup.setToolActive(cornerstoneTools.StackScrollMouseWheelTool.toolName);

    // Enable SegmentationDisplayTool (no bindings needed, just needs to be enabled)
    toolGroup.setToolEnabled(cornerstoneTools.SegmentationDisplayTool.toolName);

    console.log('[MedAI] Tool group created with SegmentationDisplayTool enabled');
  }

  // Add viewports to tool group
  const engine = getRenderingEngine();
  viewportIds.forEach((viewportId) => {
    toolGroup!.addViewport(viewportId, engine.id);
  });

  return toolGroupId;
}

/**
 * Set the active primary tool (the tool bound to left mouse button)
 * This is used for tool switching from the toolbar
 */
export type PrimaryToolName = 'WindowLevel' | 'Pan' | 'Zoom' | 'Crosshairs' | 'Length' | 'RectangleROI' | 'Probe' | 'Angle' | 'Bidirectional' | 'EllipticalROI' | 'ArrowAnnotate';

export function setActivePrimaryTool(toolGroupId: string, toolName: PrimaryToolName): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Map tool names to Cornerstone tool names
  const toolNameMap: Record<PrimaryToolName, string> = {
    WindowLevel: cornerstoneTools.WindowLevelTool.toolName,
    Pan: cornerstoneTools.PanTool.toolName,
    Zoom: cornerstoneTools.ZoomTool.toolName,
    Crosshairs: cornerstoneTools.CrosshairsTool.toolName,
    Length: cornerstoneTools.LengthTool.toolName,
    RectangleROI: cornerstoneTools.RectangleROITool.toolName,
    Probe: cornerstoneTools.ProbeTool.toolName,
    Angle: cornerstoneTools.AngleTool.toolName,
    Bidirectional: cornerstoneTools.BidirectionalTool.toolName,
    EllipticalROI: cornerstoneTools.EllipticalROITool.toolName,
    ArrowAnnotate: cornerstoneTools.ArrowAnnotateTool.toolName,
  };

  // Deactivate all primary tools first (set to passive)
  const allPrimaryTools: PrimaryToolName[] = ['WindowLevel', 'Pan', 'Zoom', 'Crosshairs', 'Length', 'RectangleROI', 'Probe', 'Angle', 'Bidirectional', 'EllipticalROI', 'ArrowAnnotate'];
  allPrimaryTools.forEach((name) => {
    const csToolName = toolNameMap[name];
    if (csToolName) {
      toolGroup.setToolPassive(csToolName);
    }
  });

  // If switching away from crosshairs, remove crosshairs annotations
  if (toolName !== 'Crosshairs') {
    const crosshairsToolName = cornerstoneTools.CrosshairsTool.toolName;
    const annotationManager = cornerstoneTools.annotation.state.getAnnotationManager();
    const allAnnotations = annotationManager.getAllAnnotations();
    const crosshairsAnnotations = allAnnotations.filter(
      (ann: any) => ann.metadata?.toolName === crosshairsToolName
    );
    crosshairsAnnotations.forEach((ann: any) => {
      annotationManager.removeAnnotation(ann.annotationUID);
    });
    if (crosshairsAnnotations.length > 0) {
      console.log('[MedAI] Removed', crosshairsAnnotations.length, 'crosshairs annotations');
    }
  }

  // Activate the selected tool on primary mouse button
  const selectedToolName = toolNameMap[toolName];
  if (selectedToolName) {
    toolGroup.setToolActive(selectedToolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
    });
    console.log('[MedAI] Primary tool set to:', toolName);
  }

  // Re-render viewports
  const engine = getRenderingEngine();
  engine.renderViewports(['axial', 'sagittal', 'coronal']);
}

/**
 * Reset viewport to default view (fit to window, reset camera)
 */
export function resetViewport(viewportId?: string): void {
  const engine = getRenderingEngine();
  const viewportIds = viewportId ? [viewportId] : ['axial', 'sagittal', 'coronal'];

  viewportIds.forEach((vpId) => {
    const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      viewport.resetCamera();
      viewport.render();
    }
  });

  console.log('[MedAI] Reset viewport(s):', viewportIds.join(', '));
}

/**
 * Reset all viewports to their default views
 */
export function resetAllViewports(): void {
  resetViewport();
}

/**
 * Enable crosshairs tool for synchronized navigation
 */
export function enableCrosshairs(toolGroupId: string): void {
  setActivePrimaryTool(toolGroupId, 'Crosshairs');
  console.log('[MedAI] Crosshairs tool enabled');
}

/**
 * Disable crosshairs tool and restore window/level
 */
export function disableCrosshairs(toolGroupId: string): void {
  setActivePrimaryTool(toolGroupId, 'WindowLevel');
  console.log('[MedAI] Crosshairs tool disabled, window/level restored');
}

/**
 * Jump all viewports to a specific world coordinate
 * This synchronizes all MPR views to show the same 3D point
 */
export function jumpToWorldPoint(worldPoint: [number, number, number]): void {
  const engine = getRenderingEngine();
  const viewportIds = ['axial', 'sagittal', 'coronal'];

  viewportIds.forEach((viewportId) => {
    const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      try {
        // Use jumpToWorld to navigate each viewport to the world coordinate
        cornerstoneTools.utilities.viewport.jumpToWorld(viewport, worldPoint);
      } catch (e) {
        console.error(`[MedAI] Failed to jump ${viewportId} to world point:`, e);
      }
    }
  });

  console.log('[MedAI] Jumped all viewports to world point:', worldPoint);
}

/**
 * Clean up Cornerstone resources
 */
export function cleanup(): void {
  if (renderingEngine) {
    renderingEngine.destroy();
    renderingEngine = null;
  }
  cache.purgeCache();
  volumeDataStore.clear();
}

/**
 * Restore segmentation representations after viewports are recreated.
 * This is needed when navigating away and back - the viewports are recreated
 * but the segmentation data still exists in the cache.
 *
 * Uses both Cornerstone state and cached volumes to restore segmentations.
 */
export async function restoreSegmentationRepresentations(toolGroupId: string): Promise<void> {
  console.log('[MedAI] Restoring segmentation representations for tool group:', toolGroupId);

  try {
    // First, check Cornerstone's segmentation state
    const csSegmentations = segmentation.state.getSegmentations();
    console.log('[MedAI] Cornerstone segmentation state:', csSegmentations.map(s => s.segmentationId));

    // Get existing representations for this tool group
    let existingRepresentations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    const existingSegIds = new Set(existingRepresentations?.map(r => r.segmentationId) || []);
    console.log('[MedAI] Existing representations in tool group:', Array.from(existingSegIds));

    // For each segmentation in Cornerstone state, ensure it has a representation
    for (const csSeg of csSegmentations) {
      const segmentationId = csSeg.segmentationId;

      if (existingSegIds.has(segmentationId)) {
        console.log('[MedAI] Segmentation already has representation:', segmentationId);
        continue;
      }

      console.log('[MedAI] Re-adding representation for:', segmentationId);

      // Add representation
      try {
        await segmentation.addSegmentationRepresentations(toolGroupId, [
          {
            segmentationId: segmentationId,
            type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
          },
        ]);
        console.log('[MedAI] Re-added representation for:', segmentationId);
      } catch (err) {
        console.error('[MedAI] Failed to re-add representation:', segmentationId, err);
      }
    }

    // Check if any representations were added
    existingRepresentations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    if (!existingRepresentations || existingRepresentations.length === 0) {
      console.log('[MedAI] No segmentation representations to restore');
      return;
    }

    // Configure segmentation rendering
    segmentation.config.setToolGroupSpecificConfig(toolGroupId, {
      renderInactiveSegmentations: true,
      representations: {
        LABELMAP: {
          renderFill: true,
          renderOutline: true,
          fillAlpha: 0.5,
          outlineWidthActive: 2,
          outlineWidthInactive: 1,
          fillAlphaInactive: 0.3,
        },
      },
    });

    // Trigger render
    cornerstoneTools.utilities.segmentation.triggerSegmentationRender(toolGroupId);

    const engine = getRenderingEngine();
    engine.renderViewports(['axial', 'sagittal', 'coronal']);

    console.log('[MedAI] Segmentation representations restored, count:', existingRepresentations.length);
  } catch (err) {
    console.error('[MedAI] Failed to restore segmentation representations:', err);
  }
}

/**
 * Create an empty segmentation labelmap for manual segmentation
 * This allows users to create segmentations without having to load a label or run inference
 * IMPORTANT: This preserves the current viewport camera state (zoom, pan, window/level)
 */
export async function createEmptySegmentation(
  referenceVolumeId: string,
  segmentationId: string,
  toolGroupId: string,
  options?: { label?: string }
): Promise<{ segmentationId: string; volumeId: string }> {
  console.log('[MedAI] Creating empty segmentation for volume:', referenceVolumeId);

  const engine = getRenderingEngine();
  const viewportIds = ['axial', 'sagittal', 'coronal'];

  // CRITICAL: Save camera state BEFORE any modifications
  const savedCameraStates: Map<string, any> = new Map();
  viewportIds.forEach((vpId) => {
    const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      savedCameraStates.set(vpId, viewport.getCamera());
    }
  });

  // Get reference volume for dimensions
  const referenceVolume = cache.getVolume(referenceVolumeId);
  if (!referenceVolume) {
    throw new Error(`Reference volume not found: ${referenceVolumeId}`);
  }

  const labelmapVolumeId = `labelmap:${segmentationId}`;

  // Create derived labelmap volume (all zeros)
  const labelmapVolume = await volumeLoader.createAndCacheDerivedVolume(
    referenceVolumeId,
    {
      volumeId: labelmapVolumeId,
      targetBuffer: {
        type: 'Uint8Array',
      },
    }
  );

  console.log('[MedAI] Created empty labelmap volume:', labelmapVolumeId);

  // Add segmentation to state
  segmentation.state.addSegmentation({
    segmentationId: segmentationId,
    representation: {
      type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
      data: {
        volumeId: labelmapVolumeId,
      },
    },
  });

  // Create color LUT with default colors for first few segments
  const colorLUT: [number, number, number, number][] = new Array(256).fill(null).map(() => [0, 0, 0, 0] as [number, number, number, number]);
  // Set default colors for segments 1-10
  const defaultColors = [
    [255, 0, 0, 180],     // Red
    [0, 255, 0, 180],     // Green
    [0, 0, 255, 180],     // Blue
    [255, 255, 0, 180],   // Yellow
    [255, 0, 255, 180],   // Magenta
    [0, 255, 255, 180],   // Cyan
    [255, 128, 0, 180],   // Orange
    [128, 0, 255, 180],   // Purple
    [0, 255, 128, 180],   // Mint
    [255, 128, 128, 180], // Light Red
  ];
  defaultColors.forEach((color, idx) => {
    colorLUT[idx + 1] = color as [number, number, number, number];
  });

  const colorLUTIndex = segmentation.state.getNextColorLUTIndex();
  segmentation.state.addColorLUT(colorLUT, colorLUTIndex);

  // Add segmentation representation to tool group
  await segmentation.addSegmentationRepresentations(
    toolGroupId,
    [
      {
        segmentationId: segmentationId,
        type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
        options: {
          colorLUTOrIndex: colorLUTIndex,
        },
      },
    ]
  );

  // Configure segmentation rendering
  segmentation.config.setToolGroupSpecificConfig(toolGroupId, {
    renderInactiveSegmentations: true,
    representations: {
      LABELMAP: {
        renderFill: true,
        renderOutline: true,
        fillAlpha: 0.5,
        outlineWidthActive: 2,
        outlineWidthInactive: 1,
        fillAlphaInactive: 0.3,
      },
    },
  });

  // CRITICAL: Restore camera state AFTER segmentation is created
  // Use setTimeout to ensure restoration happens after any async viewport updates
  // from addSegmentationRepresentations
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      viewportIds.forEach((vpId) => {
        const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
        const savedCamera = savedCameraStates.get(vpId);
        if (viewport && savedCamera) {
          console.log('[MedAI] Restoring camera for viewport:', vpId, savedCamera);
          viewport.setCamera(savedCamera);
        }
      });
      // Render viewports with restored camera
      engine.renderViewports(viewportIds);
      resolve();
    }, 50); // Small delay to let segmentation representation settle
  });

  console.log('[MedAI] Empty segmentation created:', segmentationId);

  return { segmentationId, volumeId: labelmapVolumeId };
}

/**
 * Create a separate volume for a single segment (binary mask).
 * Each segment gets its own Cornerstone segmentation with a binary mask (0/1).
 * This enables true overlap where multiple segments can coexist at the same voxel.
 */
export async function createSegmentVolume(
  referenceVolumeId: string,
  parentSegmentationId: string,
  segmentIndex: number,
  toolGroupId: string,
  color: [number, number, number, number]
): Promise<{ volumeId: string; cornerstoneSegmentationId: string }> {
  console.log('[MedAI] Creating segment volume:', { parentSegmentationId, segmentIndex });

  const engine = getRenderingEngine();
  const viewportIds = ['axial', 'sagittal', 'coronal'];

  // Save camera state before modifications
  const savedCameraStates: Map<string, any> = new Map();
  viewportIds.forEach((vpId) => {
    const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      savedCameraStates.set(vpId, viewport.getCamera());
    }
  });

  // Generate unique IDs for this segment's volume and segmentation
  const volumeId = `labelmap:${parentSegmentationId}:seg${segmentIndex}`;
  const cornerstoneSegmentationId = `cs-seg:${parentSegmentationId}:seg${segmentIndex}`;

  // Create binary mask volume (Uint8Array with only 0 and 1 values)
  await volumeLoader.createAndCacheDerivedVolume(
    referenceVolumeId,
    {
      volumeId: volumeId,
      targetBuffer: {
        type: 'Uint8Array',
      },
    }
  );

  console.log('[MedAI] Created segment volume:', volumeId);

  // Add as Cornerstone segmentation (each segment is its own segmentation)
  segmentation.state.addSegmentation({
    segmentationId: cornerstoneSegmentationId,
    representation: {
      type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
      data: {
        volumeId: volumeId,
      },
    },
  });

  // Create color LUT with just index 1 (binary mask: 0 = off, 1 = on)
  const colorLUT: [number, number, number, number][] = [
    [0, 0, 0, 0],     // Index 0 - background (transparent)
    color,             // Index 1 - segment color
  ];

  const colorLUTIndex = segmentation.state.getNextColorLUTIndex();
  segmentation.state.addColorLUT(colorLUT, colorLUTIndex);

  // Add segmentation representation to tool group
  await segmentation.addSegmentationRepresentations(
    toolGroupId,
    [
      {
        segmentationId: cornerstoneSegmentationId,
        type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
        options: {
          colorLUTOrIndex: colorLUTIndex,
        },
      },
    ]
  );

  // Configure multi-layer rendering
  segmentation.config.setToolGroupSpecificConfig(toolGroupId, {
    renderInactiveSegmentations: true,  // Show ALL segment layers
    representations: {
      LABELMAP: {
        renderFill: true,
        renderOutline: true,
        fillAlpha: 0.4,           // Semi-transparent for overlap visibility
        outlineWidthActive: 2,
        outlineWidthInactive: 1,
        fillAlphaInactive: 0.3,
      },
    },
  });

  // Restore camera state after segmentation is created
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      viewportIds.forEach((vpId) => {
        const viewport = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
        const savedCamera = savedCameraStates.get(vpId);
        if (viewport && savedCamera) {
          viewport.setCamera(savedCamera);
        }
      });
      engine.renderViewports(viewportIds);
      resolve();
    }, 50);
  });

  console.log('[MedAI] Segment volume created:', { volumeId, cornerstoneSegmentationId });

  return { volumeId, cornerstoneSegmentationId };
}

/**
 * Create multi-layer segmentation from label file.
 * Each unique label value gets its own binary mask volume (0/1).
 * This enables true overlap where multiple segments can coexist at the same voxel.
 *
 * @param labelData - Can be raw ArrayBuffer (NIfTI, NRRD) or already-decoded scalar data
 * @param labels - Array of label info with index, name, and color
 * @param referenceVolumeId - The source image volume to derive from
 * @param toolGroupId - Tool group to add representations to
 * @param parentSegmentationId - Parent segmentation ID in the store
 * @param dataType - Optional data type hint ('uint8', 'uint16', 'int16', 'float32')
 * @returns Map of segment index to { volumeId, cornerstoneSegmentationId }
 */
export async function createMultiLayerSegmentationFromResult(
  labelData: ArrayBuffer,
  labels: { index: number; name: string; color: string }[],
  referenceVolumeId: string,
  toolGroupId: string,
  parentSegmentationId: string,
  dataType?: string
): Promise<Map<number, { volumeId: string; cornerstoneSegmentationId: string }>> {
  console.log('[MedAI] Creating multi-layer segmentation:', {
    labelCount: labels.length,
    referenceVolumeId,
    parentSegmentationId,
  });

  // Get reference volume for dimensions
  const referenceVolume = cache.getVolume(referenceVolumeId);
  if (!referenceVolume) {
    throw new Error(`Reference volume not found: ${referenceVolumeId}`);
  }

  const { dimensions } = referenceVolume;
  const expectedSize = dimensions[0] * dimensions[1] * dimensions[2];
  const dimX = dimensions[0];
  const dimY = dimensions[1];
  const dimZ = dimensions[2];

  // Parse label data (reuse existing logic from createSegmentationFromResult)
  let scalarData: Uint8Array | Uint16Array | Int16Array | Float32Array;
  let niftiDimensions: [number, number, number] | null = null;

  // Check if data is gzip compressed or PNG
  const firstBytes = new Uint8Array(labelData.slice(0, 4));
  const isGzip = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b;
  const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4e && firstBytes[3] === 0x47;
  const headerStr = String.fromCharCode(...firstBytes);

  if (isPng) {
    console.log('[MedAI] Multi-layer: Detected PNG mask, parsing...');
    scalarData = await parsePngMaskData(labelData, dimX, dimY);
    console.log('[MedAI] Multi-layer: PNG mask parsed, size:', scalarData.length);
  } else if (isGzip) {
    console.log('[MedAI] Multi-layer: Detected gzip compressed data, decompressing...');
    const niftiResult = await parseGzipNiftiData(labelData, expectedSize);
    scalarData = niftiResult.data;
    niftiDimensions = niftiResult.dimensions;
  } else if (headerStr.startsWith('NRRD')) {
    scalarData = parseNrrdData(labelData, expectedSize);
  } else if (dataType) {
    switch (dataType) {
      case 'uint16':
        scalarData = new Uint16Array(labelData);
        break;
      case 'int16':
        scalarData = new Int16Array(labelData);
        break;
      case 'float32':
        const floatData = new Float32Array(labelData);
        scalarData = new Uint8Array(floatData.length);
        for (let i = 0; i < floatData.length; i++) {
          scalarData[i] = Math.round(floatData[i]);
        }
        break;
      default:
        scalarData = new Uint8Array(labelData);
    }
  } else {
    if (labelData.byteLength === expectedSize * 2) {
      scalarData = new Uint16Array(labelData);
    } else if (labelData.byteLength === expectedSize * 4) {
      const floatData = new Float32Array(labelData);
      scalarData = new Uint8Array(floatData.length);
      for (let i = 0; i < floatData.length; i++) {
        scalarData[i] = Math.round(floatData[i]);
      }
    } else {
      scalarData = new Uint8Array(labelData);
    }
  }

  // Convert to uint values for indexing
  let labelmapData: Uint8Array | Uint16Array;
  if (scalarData instanceof Uint8Array) {
    labelmapData = scalarData;
  } else if (scalarData instanceof Uint16Array) {
    labelmapData = scalarData;
  } else if (scalarData instanceof Int16Array) {
    labelmapData = new Uint16Array(scalarData.length);
    for (let i = 0; i < scalarData.length; i++) {
      labelmapData[i] = Math.max(0, scalarData[i]);
    }
  } else {
    const floatArr = scalarData as Float32Array;
    labelmapData = new Uint8Array(floatArr.length);
    for (let i = 0; i < floatArr.length; i++) {
      labelmapData[i] = Math.round(Math.max(0, Math.min(255, floatArr[i])));
    }
  }

  // Detect if transpose is needed
  const needsTranspose = niftiDimensions !== null &&
    niftiDimensions[0] === dimZ &&
    niftiDimensions[2] === dimX &&
    niftiDimensions[1] === dimY &&
    dimX !== dimZ;

  console.log('[MedAI] Multi-layer label parsing complete:', {
    dataLength: labelmapData.length,
    needsTranspose,
    labelIndices: labels.map(l => l.index),
  });

  // Create result map
  const segmentVolumeMap = new Map<number, { volumeId: string; cornerstoneSegmentationId: string }>();

  // For each label, create a separate segment volume and copy relevant voxels
  for (const label of labels) {
    if (label.index === 0) continue; // Skip background label

    // Parse color
    const rgba = hexToRgba(label.color, 180);

    // Create segment volume
    const { volumeId, cornerstoneSegmentationId } = await createSegmentVolume(
      referenceVolumeId,
      parentSegmentationId,
      label.index,
      toolGroupId,
      rgba
    );

    // Get the segment's volume data
    const segmentVolume = cache.getVolume(volumeId);
    if (!segmentVolume) {
      console.error('[MedAI] Failed to get segment volume:', volumeId);
      continue;
    }

    const segmentData = segmentVolume.getScalarData();

    // Copy voxels belonging to this label (set to 1 in binary mask)
    let voxelCount = 0;
    if (needsTranspose) {
      for (let z = 0; z < dimZ; z++) {
        for (let y = 0; y < dimY; y++) {
          for (let x = 0; x < dimX; x++) {
            const srcIdx = z + y * dimZ + x * dimZ * dimY;
            const dstIdx = x + y * dimX + z * dimX * dimY;
            if (labelmapData[srcIdx] === label.index) {
              segmentData[dstIdx] = 1;
              voxelCount++;
            }
          }
        }
      }
    } else {
      for (let i = 0; i < labelmapData.length; i++) {
        if (labelmapData[i] === label.index) {
          segmentData[i] = 1;
          voxelCount++;
        }
      }
    }

    console.log('[MedAI] Multi-layer: Copied', voxelCount, 'voxels for label', label.index, label.name);

    // Mark volume as modified
    if (segmentVolume.imageData) {
      segmentVolume.imageData.modified();
    }

    // Trigger segmentation update
    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(cornerstoneSegmentationId);

    segmentVolumeMap.set(label.index, { volumeId, cornerstoneSegmentationId });
  }

  // Render all viewports
  getRenderingEngine()?.render();

  console.log('[MedAI] Multi-layer segmentation created:', segmentVolumeMap.size, 'segment volumes');

  return segmentVolumeMap;
}

/**
 * Get current brush size for the tool group
 */
export function getBrushSize(toolGroupId: string): number {
  try {
    const size = cornerstoneTools.utilities.segmentation.getBrushSizeForToolGroup(toolGroupId) as number | undefined;
    return typeof size === 'number' ? size : 15; // Default to 15 if not set
  } catch (e) {
    console.warn('[MedAI] Could not get brush size:', e);
    return 15;
  }
}

/**
 * Set brush size for the tool group
 */
export function setBrushSize(toolGroupId: string, size: number): void {
  try {
    cornerstoneTools.utilities.segmentation.setBrushSizeForToolGroup(toolGroupId, size);
    console.log('[MedAI] Brush size set to:', size);
  } catch (e) {
    console.error('[MedAI] Could not set brush size:', e);
  }
}

// Custom event name for brush size changes
export const BRUSH_SIZE_CHANGED_EVENT = 'medai:brushSizeChanged';

// Brush size constraints
export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 50;
export const BRUSH_SIZE_STEP = 1;

/**
 * Adjust brush size by a delta amount (for scroll wheel)
 * Emits a custom event so UI can stay in sync
 */
export function adjustBrushSize(toolGroupId: string, delta: number): number {
  const currentSize = getBrushSize(toolGroupId);
  const newSize = Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, currentSize + delta));

  if (newSize !== currentSize) {
    setBrushSize(toolGroupId, newSize);

    // Dispatch custom event for UI synchronization
    window.dispatchEvent(new CustomEvent(BRUSH_SIZE_CHANGED_EVENT, {
      detail: { toolGroupId, size: newSize }
    }));
  }

  return newSize;
}

/**
 * Invalidate brush cursor to clear the brush preview circle
 * This is used when mouse leaves a viewport to prevent the cursor from "sticking"
 */
export function invalidateBrushCursor(toolGroupId: string): void {
  try {
    const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) {
      return;
    }

    // Invalidate cursor for all named brush tool instances
    const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                        BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];

    brushTools.forEach(toolName => {
      if (toolGroup.hasTool(toolName)) {
        const toolInstance = toolGroup.getToolInstance(toolName) as any;
        if (toolInstance && typeof toolInstance.invalidateBrushCursor === 'function') {
          toolInstance.invalidateBrushCursor();
        }
        // Also clear hover data if available (used by brush tool for cursor rendering)
        if (toolInstance && '_hoverData' in toolInstance) {
          toolInstance._hoverData = undefined;
        }
      }
    });

    // Trigger a re-render of all viewports to clear the old cursor
    const engine = getRenderingEngine();
    engine.renderViewports(['axial', 'sagittal', 'coronal']);
  } catch (e) {
    // Silently fail - this is not critical functionality
    console.debug('[MedAI] Could not invalidate brush cursor:', e);
  }
}

/**
 * Set the active segmentation in Cornerstone3D for all viewports
 * This determines which segmentation brush/tools will operate on
 */
export function setActiveSegmentationInCornerstone(segmentationId: string, toolGroupId: string = 'medaiToolGroup'): void {
  try {
    // Get all segmentation representations for this tool group
    const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    console.log('[MedAI] setActiveSegmentationInCornerstone - looking for segmentationId:', segmentationId);
    console.log('[MedAI] Available representations:', representations?.map((r: any) => ({
      segmentationId: r.segmentationId,
      segmentationRepresentationUID: r.segmentationRepresentationUID,
    })));

    if (!representations || representations.length === 0) {
      console.warn('[MedAI] No segmentation representations found for tool group:', toolGroupId);
      return;
    }

    // Find the representation that matches the segmentation ID
    const targetRep = representations.find((r: any) => r.segmentationId === segmentationId);

    if (!targetRep) {
      console.warn('[MedAI] No representation found for segmentation:', segmentationId);
      return;
    }

    const repUID = targetRep.segmentationRepresentationUID;
    console.log('[MedAI] Found representation UID:', repUID, 'for segmentation:', segmentationId);

    // Set the active segmentation representation using the correct UID
    segmentation.activeSegmentation.setActiveSegmentationRepresentation(
      toolGroupId,
      repUID
    );

    console.log('[MedAI] Active segmentation set in Cornerstone:', segmentationId, '(rep UID:', repUID, ')');
  } catch (e) {
    console.error('[MedAI] Failed to set active segmentation:', e);
  }
}

/**
 * Set the active segment index for a segmentation
 * This determines which segment the brush tool will paint with
 */
export function setActiveSegmentIndex(segmentationId: string, segmentIndex: number, toolGroupId: string = 'medaiToolGroup'): void {
  try {
    console.log('[MedAI:setActiveSegmentIndex] CALLED with segmentationId:', segmentationId, 'segmentIndex:', segmentIndex);

    // Verify the segmentation exists
    const seg = segmentation.state.getSegmentation(segmentationId);
    if (!seg) {
      console.error('[MedAI:setActiveSegmentIndex] Segmentation NOT FOUND:', segmentationId);
      return;
    }
    console.log('[MedAI:setActiveSegmentIndex] Segmentation found:', seg.segmentationId);

    // Get current active segment index before change
    const currentActiveIndex = segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
    console.log('[MedAI:setActiveSegmentIndex] Current active segment index:', currentActiveIndex);

    // Set the new active segment index
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, segmentIndex);

    // Verify the change
    const newActiveIndex = segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
    console.log('[MedAI:setActiveSegmentIndex] New active segment index after set:', newActiveIndex);

    if (newActiveIndex !== segmentIndex) {
      console.error('[MedAI:setActiveSegmentIndex] MISMATCH! Expected:', segmentIndex, 'Got:', newActiveIndex);
    }

    // CRITICAL: Invalidate brush cursor to update the color for all named brush instances
    const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
    if (toolGroup) {
      // Try both CircularBrush and CircularEraser since either could be active
      [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser].forEach(toolName => {
        if (toolGroup.hasTool(toolName)) {
          const toolInstance = toolGroup.getToolInstance(toolName) as any;
          if (toolInstance && typeof toolInstance.invalidateBrushCursor === 'function') {
            toolInstance.invalidateBrushCursor();
          }
        }
      });
    }

    console.log('[MedAI:setActiveSegmentIndex] SUCCESS - Active segment index set to:', segmentIndex, 'for segmentation:', segmentationId);
  } catch (e) {
    console.error('[MedAI:setActiveSegmentIndex] FAILED:', e);
  }
}

/**
 * Activate brush tool for segmentation editing
 * Uses CircularBrush named instance with FILL_INSIDE_CIRCLE strategy for 2D slice-only painting
 * @param toolGroupId - The tool group ID
 * @param segmentIndex - The segment index to paint with (default 1)
 * @param segmentationId - Optional segmentation ID to use. If not provided, uses active segmentation from Cornerstone state.
 */
export function activateBrushTool(toolGroupId: string, segmentIndex: number = 1, segmentationId?: string): void {
  console.log('[MedAI:activateBrushTool] CALLED with toolGroupId:', toolGroupId, 'segmentIndex:', segmentIndex, 'segmentationId:', segmentationId);

  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI:activateBrushTool] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate lasso fill mode if it was active
  activateLassoFillMode(false);

  // Deactivate SmartEdit prompt tools that might be active
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Deactivate other brush tools that might be active
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate WindowLevel on primary mouse button
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);

  // Activate CircularBrush - the named instance with FILL_INSIDE_CIRCLE strategy
  toolGroup.setToolActive(BRUSH_TOOL_NAMES.CircularBrush, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  // Determine which segmentation to use:
  // 1. Use provided segmentationId if given
  // 2. Otherwise, try to get active segmentation representation from Cornerstone
  // 3. Fall back to first segmentation if nothing else available
  let targetSegmentationId = segmentationId;
  console.log('[MedAI:activateBrushTool] Provided segmentationId:', segmentationId);

  if (!targetSegmentationId) {
    // Try to get the active segmentation representation
    try {
      const activeRep = segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
      console.log('[MedAI:activateBrushTool] activeRep from Cornerstone:', activeRep);
      if (activeRep) {
        targetSegmentationId = activeRep.segmentationId;
        console.log('[MedAI:activateBrushTool] Using active segmentation from Cornerstone:', targetSegmentationId);
      }
    } catch (e) {
      console.log('[MedAI:activateBrushTool] Could not get active segmentation:', e);
    }
  }

  if (!targetSegmentationId) {
    // Fall back to first segmentation
    const segmentations = segmentation.state.getSegmentations();
    console.log('[MedAI:activateBrushTool] All segmentations:', segmentations.map(s => s.segmentationId));
    if (segmentations.length > 0) {
      targetSegmentationId = segmentations[0].segmentationId;
      console.log('[MedAI:activateBrushTool] FALLING BACK to first segmentation:', targetSegmentationId);
    }
  }

  // Set the active segment index for the target segmentation
  if (targetSegmentationId) {
    console.log('[MedAI:activateBrushTool] Setting active segment index to', segmentIndex, 'for segmentation:', targetSegmentationId);
    segmentation.segmentIndex.setActiveSegmentIndex(targetSegmentationId, segmentIndex);

    // Verify it was set correctly
    const verifyIndex = segmentation.segmentIndex.getActiveSegmentIndex(targetSegmentationId);
    console.log('[MedAI:activateBrushTool] Verified active segment index:', verifyIndex);

    console.log('[MedAI:activateBrushTool] SUCCESS - CircularBrush activated, segmentation:', targetSegmentationId, 'segment index:', segmentIndex);
  } else {
    console.warn('[MedAI:activateBrushTool] No segmentation available for brush tool');
  }

  // Invalidate brush cursor to update color
  const toolInstance = toolGroup.getToolInstance(BRUSH_TOOL_NAMES.CircularBrush) as any;
  if (toolInstance && typeof toolInstance.invalidateBrushCursor === 'function') {
    toolInstance.invalidateBrushCursor();
  }
}

/**
 * Activate eraser mode
 * Uses CircularEraser named instance with ERASE_INSIDE_CIRCLE strategy for 2D slice-only erasing
 * IMPORTANT: The eraser should ONLY erase voxels belonging to the active segment
 *
 * @param segmentIndex - The segment index to erase (only this segment will be affected)
 * @param segmentationId - Optional segmentation ID to target
 */
export function activateEraserTool(toolGroupId: string, segmentIndex: number = 1, segmentationId?: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  console.log('[MedAI:activateEraserTool] Called with segmentIndex:', segmentIndex, 'segmentationId:', segmentationId);

  // Deactivate lasso fill mode if it was active
  activateLassoFillMode(false);

  // Deactivate SmartEdit prompt tools that might be active
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Deactivate other brush tools that might be active
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate WindowLevel on primary mouse button
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);

  // Activate CircularEraser - the named instance with ERASE_INSIDE_CIRCLE strategy
  toolGroup.setToolActive(BRUSH_TOOL_NAMES.CircularEraser, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  // CRITICAL: Set the active segment index so eraser ONLY erases voxels of that segment
  // Find the target segmentation
  let targetSegmentationId = segmentationId;
  if (!targetSegmentationId) {
    // Try to find active segmentation representation
    const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    if (representations && representations.length > 0) {
      // Find the active representation
      const activeRepUID = segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
      if (activeRepUID) {
        const activeRep = representations.find((r: any) => r.segmentationRepresentationUID === activeRepUID);
        if (activeRep) {
          targetSegmentationId = activeRep.segmentationId;
        }
      }
      // Fallback to first segmentation
      if (!targetSegmentationId) {
        targetSegmentationId = representations[0].segmentationId;
      }
    }
  }

  if (targetSegmentationId) {
    console.log('[MedAI:activateEraserTool] Setting active segment index to', segmentIndex, 'for segmentation:', targetSegmentationId);
    segmentation.segmentIndex.setActiveSegmentIndex(targetSegmentationId, segmentIndex);

    // Verify it was set correctly
    const verifyIndex = segmentation.segmentIndex.getActiveSegmentIndex(targetSegmentationId);
    console.log('[MedAI:activateEraserTool] Verified active segment index:', verifyIndex);
  } else {
    console.warn('[MedAI:activateEraserTool] No segmentation available for eraser tool');
  }

  // Invalidate brush cursor
  const toolInstance = toolGroup.getToolInstance(BRUSH_TOOL_NAMES.CircularEraser) as any;
  if (toolInstance && typeof toolInstance.invalidateBrushCursor === 'function') {
    toolInstance.invalidateBrushCursor();
  }

  console.log('[MedAI] CircularEraser activated (2D mode) for segment index:', segmentIndex);
}

/**
 * Deactivate segmentation tools and restore default tools
 */
export function deactivateSegmentationTools(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate all brush tool instances
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate lasso fill mode
  activateLassoFillMode(false);

  // Re-activate WindowLevel tool
  toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] Segmentation tools deactivated, default tools restored');
}

/**
 * Activate lasso fill tool for manual segmentation
 * Allows drawing closed contours that fill with the active segment
 */
export function activateLassoFillTool(toolGroupId: string, segmentIndex: number = 1, segmentationId?: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  console.log('[MedAI:activateLassoFillTool] Called with segmentIndex:', segmentIndex);

  // Deactivate SmartEdit prompt tools
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Deactivate brush tools
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate WindowLevel
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);

  // Install/update lasso tool handlers for current tool group
  installLassoFillTool(toolGroupId);

  // Activate lasso fill mode (not erase)
  activateLassoFillMode(true);
  setLassoEraseMode(false);

  // Set active segment for the fill operation
  let targetSegmentationId = segmentationId;
  if (!targetSegmentationId) {
    try {
      const activeRep = segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
      if (activeRep) {
        targetSegmentationId = activeRep.segmentationId;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (targetSegmentationId) {
    segmentation.segmentIndex.setActiveSegmentIndex(targetSegmentationId, segmentIndex);
  }

  console.log('[MedAI:activateLassoFillTool] Lasso fill activated');
}

/**
 * Activate lasso eraser tool for manual segmentation
 * Allows drawing closed contours that erase the active segment
 */
export function activateLassoEraserTool(toolGroupId: string, segmentIndex: number = 1, segmentationId?: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  console.log('[MedAI:activateLassoEraserTool] Called with segmentIndex:', segmentIndex);

  // Deactivate SmartEdit prompt tools
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Deactivate brush tools
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate WindowLevel
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);

  // Install/update lasso tool handlers for current tool group
  installLassoFillTool(toolGroupId);

  // Activate lasso fill mode in erase mode
  activateLassoFillMode(true);
  setLassoEraseMode(true);

  // Set active segment for the erase operation
  let targetSegmentationId = segmentationId;
  if (!targetSegmentationId) {
    try {
      const activeRep = segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
      if (activeRep) {
        targetSegmentationId = activeRep.segmentationId;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (targetSegmentationId) {
    segmentation.segmentIndex.setActiveSegmentIndex(targetSegmentationId, segmentIndex);
  }

  console.log('[MedAI:activateLassoEraserTool] Lasso eraser activated');
}

/**
 * Activate rectangle fill tool for filling rectangular regions in segmentation
 * @param toolGroupId - The tool group ID
 * @param segmentIndex - The segment index to fill with (default 1)
 * @param segmentationId - Optional segmentation ID to use
 */
export function activateRectangleFillTool(toolGroupId: string, segmentIndex: number = 1, segmentationId?: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  console.log('[MedAI:activateRectangleFillTool] Called with segmentIndex:', segmentIndex);

  // Deactivate SmartEdit prompt tools
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Deactivate brush tools
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate WindowLevel and other primary tools
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.LengthTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.RectangleROITool.toolName);

  // Deactivate lasso mode
  activateLassoFillMode(false);

  // Set active segment for the fill operation
  let targetSegmentationId = segmentationId;
  if (!targetSegmentationId) {
    try {
      const activeRep = segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
      if (activeRep) {
        targetSegmentationId = activeRep.segmentationId;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (targetSegmentationId) {
    segmentation.segmentIndex.setActiveSegmentIndex(targetSegmentationId, segmentIndex);
  }

  // Activate RectangleScissorsTool for filled rectangle
  toolGroup.setToolActive(cornerstoneTools.RectangleScissorsTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI:activateRectangleFillTool] Rectangle fill tool activated');
}

/**
 * Activate rectangle outline tool for drawing bounding boxes without filling
 * @param toolGroupId - The tool group ID
 * @param segmentIndex - The segment index (for color reference)
 * @param segmentationId - Optional segmentation ID
 */
export function activateRectangleOutlineTool(toolGroupId: string, segmentIndex: number = 1, segmentationId?: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  console.log('[MedAI:activateRectangleOutlineTool] Called with segmentIndex:', segmentIndex);

  // Deactivate brush tools
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Deactivate WindowLevel and other primary tools
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.LengthTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.RectangleROITool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.RectangleScissorsTool.toolName);

  // Deactivate lasso mode
  activateLassoFillMode(false);

  // Deactivate other SmartEdit tools
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Set active segment for color reference
  let targetSegmentationId = segmentationId;
  if (!targetSegmentationId) {
    try {
      const activeRep = segmentation.activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
      if (activeRep) {
        targetSegmentationId = activeRep.segmentationId;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (targetSegmentationId) {
    segmentation.segmentIndex.setActiveSegmentIndex(targetSegmentationId, segmentIndex);
  }

  // Activate RectangleMONAILabelTool for bounding box outline
  toolGroup.setToolActive(RectangleMONAILabelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI:activateRectangleOutlineTool] Rectangle outline tool activated');
}

/**
 * Check if lasso tool is currently active
 */
export { isLassoActive };

/**
 * Set segment visibility in the segmentation
 */
export function setSegmentVisibility(
  toolGroupId: string,
  segmentationId: string,
  segmentIndex: number,
  visible: boolean
): void {
  try {
    // Get the segmentation representation UID for this segmentation
    const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    const rep = representations?.find((r: any) => r.segmentationId === segmentationId);

    if (!rep) {
      console.error('[MedAI] Segmentation representation not found:', segmentationId);
      return;
    }

    // Use Cornerstone's segmentation API to set visibility
    segmentation.config.visibility.setSegmentVisibility(
      toolGroupId,
      rep.segmentationRepresentationUID,
      segmentIndex,
      visible
    );

    // Re-render viewports
    cornerstone3D.getRenderingEngine('medaiRenderingEngine')?.render();

    console.log('[MedAI] Segment visibility set:', { segmentationId, segmentIndex, visible });
  } catch (e) {
    console.error('[MedAI] Failed to set segment visibility:', e);
  }
}

/**
 * Set brush tool radius
 */
export function setBrushRadius(radius: number): void {
  cornerstoneTools.utilities.segmentation.setBrushSizeForToolGroup('medaiToolGroup', radius);
  console.log('[MedAI] Brush radius set to:', radius);
}

/**
 * Create segmentation overlay from inference result or label file
 * @param labelData - Can be raw ArrayBuffer (NRRD response) or already-decoded scalar data
 * @param dataType - Optional data type hint ('uint8', 'uint16', 'int16', 'float32')
 */
export async function createSegmentationFromResult(
  segmentationId: string,
  labelmapVolumeId: string,
  labelData: ArrayBuffer,
  labels: { index: number; name: string; color: string }[],
  referenceVolumeId: string,
  toolGroupId: string,
  dataType?: string
): Promise<{ segmentationRepresentationUID: string }> {
  console.log('[MedAI] Creating segmentation overlay:', {
    segmentationId,
    labelmapVolumeId,
    labelDataSize: labelData.byteLength,
    labelCount: labels.length,
    referenceVolumeId,
    toolGroupId,
    dataType,
  });

  // Get reference volume for dimensions
  const referenceVolume = cache.getVolume(referenceVolumeId);
  if (!referenceVolume) {
    throw new Error(`Reference volume not found: ${referenceVolumeId}`);
  }

  const { dimensions, spacing, origin, direction } = referenceVolume;
  const expectedSize = dimensions[0] * dimensions[1] * dimensions[2];

  // Determine scalar data type and create appropriate typed array
  let scalarData: Uint8Array | Uint16Array | Int16Array | Float32Array;

  // Check if data is gzip compressed (magic bytes 0x1f 0x8b)
  const firstBytes = new Uint8Array(labelData.slice(0, 8));
  const isGzip = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b;
  const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4e && firstBytes[3] === 0x47;
  const headerStr = String.fromCharCode(...firstBytes.slice(0, 4));

  // Track NIfTI dimensions if available (for transpose detection)
  let niftiDimensions: [number, number, number] | null = null;

  if (isPng) {
    // PNG image mask (from 2D BiomedParse inference)
    console.log('[MedAI] Detected PNG mask, parsing...');
    scalarData = await parsePngMaskData(labelData, dimensions[0], dimensions[1]);
    console.log('[MedAI] PNG mask parsed, size:', scalarData.length);
  } else if (isGzip) {
    // Gzip compressed data (likely NIfTI from MONAI Label server)
    console.log('[MedAI] Detected gzip compressed data, decompressing...');
    const niftiResult = await parseGzipNiftiData(labelData, expectedSize);
    scalarData = niftiResult.data;
    niftiDimensions = niftiResult.dimensions;
    console.log('[MedAI] NIfTI mask dimensions:', niftiDimensions, 'Reference volume dimensions:', dimensions);
  } else if (headerStr.startsWith('NRRD')) {
    // Parse NRRD format from server response
    scalarData = parseNrrdData(labelData, expectedSize);
  } else if (dataType) {
    // Use provided dataType (from label loader)
    switch (dataType) {
      case 'uint16':
        scalarData = new Uint16Array(labelData);
        break;
      case 'int16':
        scalarData = new Int16Array(labelData);
        break;
      case 'float32':
        // Convert float to uint8 for labelmap (label values are typically integers stored as float)
        const floatData = new Float32Array(labelData);
        scalarData = new Uint8Array(floatData.length);
        for (let i = 0; i < floatData.length; i++) {
          scalarData[i] = Math.round(floatData[i]);
        }
        break;
      default:
        scalarData = new Uint8Array(labelData);
    }
  } else {
    // Guess based on byte size
    if (labelData.byteLength === expectedSize * 2) {
      scalarData = new Uint16Array(labelData);
    } else if (labelData.byteLength === expectedSize * 4) {
      // Could be float32 or int32 - try float first then convert to uint8
      const floatData = new Float32Array(labelData);
      scalarData = new Uint8Array(floatData.length);
      for (let i = 0; i < floatData.length; i++) {
        scalarData[i] = Math.round(floatData[i]);
      }
    } else {
      scalarData = new Uint8Array(labelData);
    }
  }

  // Count non-zero voxels for logging
  let totalNonZero = 0;
  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] !== 0) totalNonZero++;
  }

  console.log('[MedAI] Label data parsed:', {
    type: scalarData.constructor.name,
    length: scalarData.length,
    totalNonZero,
  });

  // For labelmaps, we need Uint8Array or Uint16Array
  // Convert if necessary
  let labelmapData: Uint8Array | Uint16Array;
  if (scalarData instanceof Uint8Array) {
    labelmapData = scalarData;
  } else if (scalarData instanceof Uint16Array) {
    labelmapData = scalarData;
  } else if (scalarData instanceof Int16Array) {
    // Convert int16 to uint16 (assuming label values are positive)
    labelmapData = new Uint16Array(scalarData.length);
    for (let i = 0; i < scalarData.length; i++) {
      labelmapData[i] = Math.max(0, scalarData[i]);
    }
  } else {
    // Float32Array - convert to uint8
    const floatArr = scalarData as Float32Array;
    labelmapData = new Uint8Array(floatArr.length);
    for (let i = 0; i < floatArr.length; i++) {
      labelmapData[i] = Math.round(Math.max(0, Math.min(255, floatArr[i])));
    }
  }

  // Create labelmap volume using Cornerstone3D's volumeLoader
  console.log('[MedAI] Creating labelmap volume with dimensions:', dimensions, 'and data length:', labelmapData.length);

  let labelmapVolume;
  try {
    // Use createAndCacheDerivedVolume instead - this properly creates a derived volume
    // from the reference, then we copy our label data into it
    labelmapVolume = await volumeLoader.createAndCacheDerivedVolume(
      referenceVolumeId,
      {
        volumeId: labelmapVolumeId,
        targetBuffer: {
          type: labelmapData instanceof Uint16Array ? 'Uint16Array' : 'Uint8Array',
        },
      }
    );

    console.log('[MedAI] createAndCacheDerivedVolume returned:', labelmapVolume ? 'volume object' : 'null/undefined');

    // Now copy our label data into the derived volume
    if (labelmapVolume) {
      const volScalarData = labelmapVolume.getScalarData();
      console.log('[MedAI] Volume scalar data before copy:', {
        type: volScalarData.constructor.name,
        length: volScalarData.length,
        ourDataType: labelmapData.constructor.name,
        ourDataLength: labelmapData.length,
      });

      // Copy the data - handle both same-size and dimension mismatch cases
      const dimX = dimensions[0];
      const dimY = dimensions[1];
      const dimZ = dimensions[2];

      if (volScalarData.length === labelmapData.length) {
        // Detect if transpose is needed by comparing NIfTI dimensions with reference volume
        // Transpose is needed when NIfTI has X and Z swapped relative to reference volume
        // e.g., NIfTI [Z, Y, X] vs reference [X, Y, Z]
        const needsTranspose = niftiDimensions !== null &&
          niftiDimensions[0] === dimZ &&
          niftiDimensions[2] === dimX &&
          niftiDimensions[1] === dimY &&
          dimX !== dimZ; // Only transpose if X and Z are different (otherwise no change needed)

        if (needsTranspose) {
          console.log('[MedAI] Transposing mask data - X/Z axes swapped between NIfTI and reference volume');
          console.log('[MedAI] NIfTI dims:', niftiDimensions, 'Reference dims:', [dimX, dimY, dimZ]);

          for (let z = 0; z < dimZ; z++) {
            for (let y = 0; y < dimY; y++) {
              for (let x = 0; x < dimX; x++) {
                // Map from server's coordinate system to ours
                // Server has X and Z swapped relative to us
                const srcIdx = z + y * dimZ + x * dimZ * dimY;
                const dstIdx = x + y * dimX + z * dimX * dimY;
                volScalarData[dstIdx] = labelmapData[srcIdx];
              }
            }
          }
        } else {
          // Direct copy - dimensions match
          console.log('[MedAI] Direct copy - no transpose needed');
          for (let i = 0; i < labelmapData.length; i++) {
            volScalarData[i] = labelmapData[i];
          }
        }
        // Verify the copy - scan the ENTIRE array since labels might be in middle/end
        let postCopyNonZero = 0;
        let firstNonZeroIdx = -1;
        for (let i = 0; i < volScalarData.length; i++) {
          if (volScalarData[i] !== 0) {
            postCopyNonZero++;
            if (firstNonZeroIdx === -1) firstNonZeroIdx = i;
          }
        }
        console.log('[MedAI] After copying data to volume:', {
          volumeExists: true,
          scalarDataLength: volScalarData.length,
          totalNonZero: postCopyNonZero,
          firstNonZeroIdx,
          transposed: needsTranspose,
        });

        // Mark the volume's imageData as modified so Cornerstone knows to render
        if (labelmapVolume.imageData) {
          labelmapVolume.imageData.modified();
          console.log('[MedAI] Marked imageData as modified');
        }
      } else {
        // DIMENSION MISMATCH: Server returned mask for a different image
        // This usually happens when the server has a stale session cached from a previous image
        console.error('[MedAI] Size mismatch! Server returned mask for different image dimensions.');
        console.error('[MedAI] Expected volume size:', volScalarData.length, `(${dimX}x${dimY}x${dimZ})`);
        console.error('[MedAI] Received mask size:', labelmapData.length, niftiDimensions ? `(${niftiDimensions.join('x')})` : '');
        console.error('[MedAI] Try disconnecting and reconnecting to the server to reset the session.');
        throw new Error(`Dimension mismatch: Server returned mask for different image. Expected ${dimX}x${dimY}x${dimZ}, got ${niftiDimensions?.join('x') || 'unknown'}. Please disconnect and reconnect to reset the session.`);
      }

      // Verify it's in cache
      const cachedVolume = cache.getVolume(labelmapVolumeId);
      console.log('[MedAI] Volume in cache check:', !!cachedVolume);
    } else {
      console.warn('[MedAI] WARNING: Volume creation returned null/undefined!', labelmapVolumeId);
    }
  } catch (volErr) {
    console.error('[MedAI] Error creating labelmap volume:', volErr);
    throw volErr;
  }

  // Create color LUT for segments
  const colorLUT: [number, number, number, number][] = new Array(256).fill(null).map(() => [0, 0, 0, 0] as [number, number, number, number]);

  labels.forEach((label) => {
    if (label.index >= 0 && label.index < 256) {
      const rgba = hexToRgba(label.color, 180);
      colorLUT[label.index] = rgba;
      console.log('[MedAI] Set color for label index', label.index, ':', rgba, 'from hex:', label.color);
    }
  });

  console.log('[MedAI] Color LUT - label indices with colors:', labels.map(l => l.index));

  // Add segmentation to state
  segmentation.state.addSegmentation({
    segmentationId: segmentationId,
    representation: {
      type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
      data: {
        volumeId: labelmapVolumeId,
      },
    },
  });

  console.log('[MedAI] Added segmentation to state:', segmentationId);

  // Add color LUT
  const colorLUTIndex = segmentation.state.getNextColorLUTIndex();
  segmentation.state.addColorLUT(colorLUT, colorLUTIndex);

  // Add segmentation representation to tool group
  const segmentationRepresentationUIDs = await segmentation.addSegmentationRepresentations(
    toolGroupId,
    [
      {
        segmentationId: segmentationId,
        type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
        options: {
          colorLUTOrIndex: colorLUTIndex,
        },
      },
    ]
  );

  const segmentationRepresentationUID = segmentationRepresentationUIDs[0];
  console.log('[MedAI] Added representation:', segmentationRepresentationUID);

  // Configure segmentation rendering
  segmentation.config.setToolGroupSpecificConfig(toolGroupId, {
    renderInactiveSegmentations: true,
    representations: {
      LABELMAP: {
        renderFill: true,
        renderOutline: true,
        fillAlpha: 0.5,
        outlineWidthActive: 2,
        outlineWidthInactive: 1,
        fillAlphaInactive: 0.3,
      },
    },
  });

  // Trigger segmentation render for this tool group
  console.log('[MedAI] Triggering segmentation render for tool group:', toolGroupId);
  cornerstoneTools.utilities.segmentation.triggerSegmentationRender(toolGroupId);

  // Render viewports to show overlay
  const engine = getRenderingEngine();
  engine.renderViewports(['axial', 'sagittal', 'coronal']);

  console.log('[MedAI] Segmentation overlay complete:', {
    segmentationId,
    segmentationRepresentationUID,
    labels: labels.map(l => ({ index: l.index, name: l.name })),
  });

  return { segmentationRepresentationUID };
}

/**
 * Update an existing segmentation's labelmap data with new inference results
 * Used for interactive segmentation where prompts accumulate (positive adds, negative removes)
 *
 * @param isSubtractive - If true (negative prompts present), clear voxels where mask=0.
 *                        If false (only positive prompts), purely additive - never clear.
 */
export async function updateSegmentationFromResult(
  segmentationId: string,
  labelmapVolumeId: string,
  labelData: ArrayBuffer,
  referenceVolumeId: string,
  toolGroupId: string,
  activeSegmentIndex?: number,  // Optional: which segment index to write SmartEdit results to
  isSubtractive: boolean = false, // Whether to subtract (clear) when mask=0
  isMultiLayer: boolean = false  // Multi-layer mode: binary mask (0/1) instead of segment index
): Promise<void> {
  console.log('[MedAI] Updating existing segmentation:', {
    segmentationId,
    labelmapVolumeId,
    labelDataSize: labelData.byteLength,
    referenceVolumeId,
    activeSegmentIndex,
    isSubtractive,
    isMultiLayer,
  });

  // Get the existing labelmap volume
  const labelmapVolume = cache.getVolume(labelmapVolumeId);
  if (!labelmapVolume) {
    throw new Error(`Labelmap volume not found: ${labelmapVolumeId}`);
  }

  // Get reference volume for dimensions
  const referenceVolume = cache.getVolume(referenceVolumeId);
  if (!referenceVolume) {
    throw new Error(`Reference volume not found: ${referenceVolumeId}`);
  }

  const { dimensions } = referenceVolume;
  const expectedSize = dimensions[0] * dimensions[1] * dimensions[2];

  // Parse the new label data
  let scalarData: Uint8Array | Uint16Array;
  let niftiDimensions: [number, number, number] | null = null;

  const firstBytes = new Uint8Array(labelData.slice(0, 4));
  const isGzip = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b;
  // PNG signature: 0x89 0x50 0x4E 0x47 (‰PNG)
  const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4e && firstBytes[3] === 0x47;

  if (isGzip) {
    console.log('[MedAI] Detected gzip compressed data, decompressing...');
    const niftiResult = await parseGzipNiftiData(labelData, expectedSize);
    scalarData = niftiResult.data;
    niftiDimensions = niftiResult.dimensions;
    console.log('[MedAI] NIfTI mask dimensions:', niftiDimensions, 'Reference volume dimensions:', dimensions);
  } else if (isPng) {
    // Parse PNG mask (returned by 2D SAM3 inference)
    console.log('[MedAI] Detected PNG mask in update, parsing...');
    scalarData = await parsePngMaskData(labelData, dimensions[0], dimensions[1]);
    console.log('[MedAI] PNG mask parsed in update, size:', scalarData.length);
  } else {
    // Assume raw data
    if (labelData.byteLength === expectedSize * 2) {
      scalarData = new Uint16Array(labelData);
    } else {
      scalarData = new Uint8Array(labelData);
    }
  }

  // scalarData is already Uint8Array | Uint16Array, use it directly as labelmapData
  const labelmapData = scalarData;

  // Count non-zero voxels in source data
  let srcNonZero = 0;
  for (let i = 0; i < labelmapData.length; i++) {
    if (labelmapData[i] !== 0) srcNonZero++;
  }
  console.log('[MedAI] Source labelmapData stats:', {
    length: labelmapData.length,
    nonZeroVoxels: srcNonZero,
    type: labelmapData.constructor.name,
  });

  // Get the volume's scalar data and update it
  const volScalarData = labelmapVolume.getScalarData();

  if (volScalarData.length === labelmapData.length) {
    const dimX = dimensions[0];
    const dimY = dimensions[1];
    const dimZ = dimensions[2];

    // Detect if transpose is needed
    const needsTranspose = niftiDimensions !== null &&
      niftiDimensions[0] === dimZ &&
      niftiDimensions[2] === dimX &&
      niftiDimensions[1] === dimY &&
      dimX !== dimZ;

    // IMPORTANT: MERGE instead of REPLACE
    // Only write SmartEdit results where:
    // 1. SmartEdit wants to mark it (srcValue !== 0)
    // 2. AND existing value is empty (0) OR already belongs to target segment
    // This prevents SmartEdit from overwriting OTHER segments (like brush strokes on segment 2)
    const targetSegmentIndex = activeSegmentIndex ?? 1;
    const writeValue = isMultiLayer ? 1 : targetSegmentIndex; // Multi-layer uses binary 1
    console.log('[MedAI] MERGE mode - writing SmartEdit results:', { targetSegmentIndex, writeValue, isMultiLayer });

    let newVoxelsWritten = 0;
    let updatedOwnVoxels = 0;
    let preservedOtherSegments = 0;
    let clearedVoxels = 0;

    // MERGE LOGIC:
    // - Positive prompts only (isSubtractive=false): ADDITIVE - only add, never clear
    // - Negative prompts present (isSubtractive=true): Can clear where mask=0 AND it's our segment
    // - Multi-layer mode: segment has its own volume, so no need to check other segments
    // - Legacy mode: Other segments are NEVER overwritten

    if (needsTranspose) {
      console.log('[MedAI] Transposing mask data for update (mode:', isSubtractive ? 'SUBTRACTIVE' : 'ADDITIVE', ', multiLayer:', isMultiLayer, ')');
      for (let z = 0; z < dimZ; z++) {
        for (let y = 0; y < dimY; y++) {
          for (let x = 0; x < dimX; x++) {
            const srcIdx = z + y * dimZ + x * dimZ * dimY;
            const dstIdx = x + y * dimX + z * dimX * dimY;
            const srcValue = labelmapData[srcIdx];
            const existingValue = volScalarData[dstIdx];

            if (srcValue !== 0) {
              // SmartEdit wants to mark this voxel
              if (isMultiLayer) {
                // Multi-layer mode: just write 1, no need to check other segments
                if (existingValue === 0) {
                  newVoxelsWritten++;
                } else {
                  updatedOwnVoxels++;
                }
                volScalarData[dstIdx] = 1;
              } else {
                // Legacy mode: check existing value
                if (existingValue === 0) {
                  volScalarData[dstIdx] = writeValue;
                  newVoxelsWritten++;
                } else if (existingValue === targetSegmentIndex) {
                  updatedOwnVoxels++;
                } else {
                  preservedOtherSegments++;
                }
              }
            } else if (isSubtractive) {
              // SUBTRACTIVE mode: clear voxels where mask=0
              if (isMultiLayer) {
                // Multi-layer: just clear (set to 0)
                if (existingValue !== 0) {
                  volScalarData[dstIdx] = 0;
                  clearedVoxels++;
                }
              } else if (existingValue === targetSegmentIndex) {
                // Legacy: only clear if it's our segment
                volScalarData[dstIdx] = 0;
                clearedVoxels++;
              }
            }
          }
        }
      }
    } else {
      console.log('[MedAI] Direct merge for update (mode:', isSubtractive ? 'SUBTRACTIVE' : 'ADDITIVE', ', multiLayer:', isMultiLayer, ')');
      for (let i = 0; i < labelmapData.length; i++) {
        const srcValue = labelmapData[i];
        const existingValue = volScalarData[i];

        if (srcValue !== 0) {
          // SmartEdit wants to mark this voxel
          if (isMultiLayer) {
            // Multi-layer mode: just write 1, no need to check other segments
            if (existingValue === 0) {
              newVoxelsWritten++;
            } else {
              updatedOwnVoxels++;
            }
            volScalarData[i] = 1;
          } else {
            // Legacy mode: check existing value
            if (existingValue === 0) {
              volScalarData[i] = writeValue;
              newVoxelsWritten++;
            } else if (existingValue === targetSegmentIndex) {
              updatedOwnVoxels++;
            } else {
              preservedOtherSegments++;
            }
          }
        } else if (isSubtractive) {
          // SUBTRACTIVE mode: clear voxels where mask=0
          if (isMultiLayer) {
            // Multi-layer: just clear (set to 0)
            if (existingValue !== 0) {
              volScalarData[i] = 0;
              clearedVoxels++;
            }
          } else if (existingValue === targetSegmentIndex) {
            // Legacy: only clear if it's our segment
            volScalarData[i] = 0;
            clearedVoxels++;
          }
        }
      }
    }

    console.log('[MedAI] MERGE stats:', {
      mode: isSubtractive ? 'SUBTRACTIVE' : 'ADDITIVE',
      isMultiLayer,
      newVoxelsWritten,
      updatedOwnVoxels,
      preservedOtherSegments,
      clearedVoxels,
      targetSegmentIndex,
      writeValue,
    });

    // Count non-zero voxels
    let nonZeroCount = 0;
    for (let i = 0; i < volScalarData.length; i++) {
      if (volScalarData[i] !== 0) nonZeroCount++;
    }
    console.log('[MedAI] Updated segmentation, non-zero voxels:', nonZeroCount);

    // CRITICAL: Mark the volume's imageData as modified so Cornerstone knows to re-render
    // Without this, the GPU texture won't be updated with the new data
    if (labelmapVolume.imageData) {
      labelmapVolume.imageData.modified();
      console.log('[MedAI] Marked imageData as modified');
    }

    // Also mark the voxel manager if it exists (for newer Cornerstone3D versions)
    if ((labelmapVolume as any).voxelManager) {
      (labelmapVolume as any).voxelManager.modified();
      console.log('[MedAI] Marked voxelManager as modified');
    }
  } else {
    console.error('[MedAI] Size mismatch during update! Volume:', volScalarData.length, 'Label:', labelmapData.length);
  }

  // CRITICAL: Trigger segmentation data modified event - this is what actually updates the display
  // This is different from just triggering a render - it tells Cornerstone's segmentation
  // system that the underlying labelmap data has changed
  console.log('[MedAI] Triggering segmentation data modified for:', segmentationId);
  cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    segmentationId
  );

  // Also trigger a render to ensure viewports update
  const engine = getRenderingEngine();
  engine.renderViewports(['axial', 'sagittal', 'coronal']);

  console.log('[MedAI] Segmentation update complete');
}

/**
 * Decompress gzip data using DecompressionStream API
 */
async function decompressGzip(data: ArrayBuffer): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const blob = new Blob([data]);
      const stream = blob.stream().pipeThrough(ds);
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    } catch (e) {
      console.error('[MedAI] DecompressionStream failed:', e);
      throw new Error('Gzip decompression failed');
    }
  }
  throw new Error('Gzip decompression not available (DecompressionStream not supported)');
}

/**
 * Parse gzip-compressed NIfTI format data (from MONAI Label server)
 * NIfTI-1 header is 348 bytes, followed by pixel data
 */
interface NiftiParseResult {
  data: Uint8Array | Uint16Array;
  dimensions: [number, number, number];
}

/**
 * Parse PNG mask data (from 2D BiomedParse inference)
 * Returns grayscale pixel values as label indices
 */
async function parsePngMaskData(buffer: ArrayBuffer, width: number, height: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // Create blob URL from buffer
    const blob = new Blob([buffer], { type: 'image/png' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      // Create canvas to extract pixel data
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to create canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      // Extract grayscale values (R channel = label index)
      // For 2D images, we need a single slice (width x height x 1)
      const maskData = new Uint8Array(width * height);

      // PNG might be different size than reference volume - resize if needed
      if (img.width === width && img.height === height) {
        for (let i = 0; i < width * height; i++) {
          maskData[i] = data[i * 4]; // R channel contains label index
        }
      } else {
        // Simple nearest-neighbor resize
        console.log(`[MedAI] PNG mask size ${img.width}x${img.height} differs from reference ${width}x${height}, resizing...`);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcX = Math.floor(x * img.width / width);
            const srcY = Math.floor(y * img.height / height);
            const srcIdx = (srcY * img.width + srcX) * 4;
            maskData[y * width + x] = data[srcIdx];
          }
        }
      }

      URL.revokeObjectURL(url);
      resolve(maskData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load PNG mask image'));
    };

    img.src = url;
  });
}

async function parseGzipNiftiData(buffer: ArrayBuffer, expectedSize: number): Promise<NiftiParseResult> {
  // Decompress the gzip data
  const decompressed = await decompressGzip(buffer);
  console.log('[MedAI] Decompressed NIfTI data size:', decompressed.length, 'bytes');

  // NIfTI-1 header is 348 bytes
  const NIFTI_HEADER_SIZE = 348;

  // Verify we have enough data for header
  if (decompressed.length < NIFTI_HEADER_SIZE) {
    throw new Error(`Invalid NIfTI data: too small (${decompressed.length} bytes)`);
  }

  // Parse NIfTI header to get data type
  const view = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);

  // sizeof_hdr should be 348 for NIfTI-1
  const sizeof_hdr = view.getInt32(0, true);
  if (sizeof_hdr !== 348) {
    console.warn('[MedAI] NIfTI sizeof_hdr is', sizeof_hdr, 'expected 348');
  }

  // Read dimensions
  const dim1 = view.getInt16(42, true);
  const dim2 = view.getInt16(44, true);
  const dim3 = view.getInt16(46, true);
  console.log('[MedAI] NIfTI dimensions:', dim1, 'x', dim2, 'x', dim3);

  // Read data type code (offset 70)
  const datatype = view.getInt16(70, true);
  const bitpix = view.getInt16(72, true);
  console.log('[MedAI] NIfTI datatype:', datatype, 'bitpix:', bitpix);

  // Extract pixel data (after header)
  const pixelData = decompressed.slice(NIFTI_HEADER_SIZE);
  console.log('[MedAI] NIfTI pixel data size:', pixelData.length, 'bytes');

  const niftiDims: [number, number, number] = [dim1, dim2, dim3];

  // NIfTI data type codes:
  // 2 = uint8, 4 = int16, 8 = int32, 16 = float32, 512 = uint16
  switch (datatype) {
    case 512: // uint16
      return {
        data: new Uint16Array(pixelData.buffer, pixelData.byteOffset, Math.min(expectedSize, pixelData.length / 2)),
        dimensions: niftiDims
      };
    case 4: // int16 - convert to uint16 for labelmap
      const int16Data = new Int16Array(pixelData.buffer, pixelData.byteOffset, Math.min(expectedSize, pixelData.length / 2));
      const uint16Data = new Uint16Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        uint16Data[i] = Math.max(0, int16Data[i]);
      }
      return { data: uint16Data, dimensions: niftiDims };
    case 2: // uint8
    default:
      return {
        data: new Uint8Array(pixelData.buffer, pixelData.byteOffset, Math.min(expectedSize, pixelData.length)),
        dimensions: niftiDims
      };
  }
}

/**
 * Parse NRRD format data
 */
function parseNrrdData(buffer: ArrayBuffer, expectedSize: number): Uint8Array | Uint16Array {
  const uint8View = new Uint8Array(buffer);
  const text = new TextDecoder('utf-8').decode(uint8View.slice(0, 2000));

  // Find end of header (empty line)
  let dataOffset = 0;
  let dataType = 'uint8';

  const lines = text.split('\n');
  let byteCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    byteCount += line.length + 1;

    if (line.trim() === '') {
      dataOffset = byteCount;
      break;
    }

    if (line.toLowerCase().startsWith('type:')) {
      const typeStr = line.split(':')[1].trim().toLowerCase();
      if (typeStr.includes('uint16') || typeStr.includes('unsigned short')) {
        dataType = 'uint16';
      }
    }
  }

  const dataBuffer = buffer.slice(dataOffset);

  if (dataType === 'uint16') {
    return new Uint16Array(dataBuffer.slice(0, expectedSize * 2));
  }

  return new Uint8Array(dataBuffer.slice(0, expectedSize));
}

/**
 * Convert hex color to RGBA
 */
function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return [255, 0, 0, alpha];
  }
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    alpha,
  ];
}

/**
 * Remove segmentation overlay
 */
export function removeSegmentation(toolGroupId: string, segmentationId: string): void {
  const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
  const rep = representations?.find((r: any) => r.segmentationId === segmentationId);

  if (rep) {
    segmentation.state.removeSegmentationRepresentation(toolGroupId, rep.segmentationRepresentationUID);
  }

  segmentation.state.removeSegmentation(segmentationId);
  console.log('[MedAI] Removed segmentation:', segmentationId);
}

/**
 * Merge new labelmap data into an existing segmentation
 * For each voxel: if newData has a non-zero value, it overwrites the existing value
 * This allows combining segmentations by label index
 */
export function mergeLabelmapData(
  targetSegmentationId: string,
  newLabelDataBuffer: ArrayBuffer,
  dataType?: string
): boolean {
  const seg = segmentation.state.getSegmentation(targetSegmentationId);
  if (!seg) {
    console.error('[MedAI] Target segmentation not found:', targetSegmentationId);
    return false;
  }

  const labelmapData = seg.representationData?.LABELMAP;
  if (!labelmapData) {
    console.error('[MedAI] No labelmap data found for segmentation:', targetSegmentationId);
    return false;
  }

  const volumeId = 'volumeId' in labelmapData ? labelmapData.volumeId : undefined;
  if (!volumeId) {
    console.error('[MedAI] No volumeId found for segmentation:', targetSegmentationId);
    return false;
  }

  const volume = cache.getVolume(volumeId);
  if (!volume) {
    console.error('[MedAI] Volume not found:', volumeId);
    return false;
  }

  // Convert ArrayBuffer to typed array based on data type
  let newLabelData: Uint8Array | Int16Array | Uint16Array | Float32Array;
  const dt = dataType?.toLowerCase() || 'uint8';
  if (dt.includes('int16') && !dt.includes('uint')) {
    newLabelData = new Int16Array(newLabelDataBuffer);
  } else if (dt.includes('uint16')) {
    newLabelData = new Uint16Array(newLabelDataBuffer);
  } else if (dt.includes('float32') || dt.includes('float')) {
    newLabelData = new Float32Array(newLabelDataBuffer);
  } else {
    // Default to uint8
    newLabelData = new Uint8Array(newLabelDataBuffer);
  }

  const existingData = volume.getScalarData();

  if (existingData.length !== newLabelData.length) {
    console.error('[MedAI] Labelmap size mismatch:', existingData.length, 'vs', newLabelData.length);
    return false;
  }

  // Merge: new non-zero values overwrite existing values
  for (let i = 0; i < newLabelData.length; i++) {
    if (newLabelData[i] !== 0) {
      existingData[i] = newLabelData[i];
    }
  }

  // Trigger update
  segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(targetSegmentationId);
  cornerstone3D.getRenderingEngine('medaiRenderingEngine')?.render();

  console.log('[MedAI] Merged labelmap data into segmentation:', targetSegmentationId);
  return true;
}

/**
 * Add inference result to an existing segmentation by remapping label indices.
 * This allows multiple auto-seg calls to accumulate segments in the same segmentation.
 *
 * @param targetSegmentationId - The existing segmentation ID
 * @param newLabelDataBuffer - Raw label data from inference
 * @param incomingLabels - Labels from the inference result
 * @param existingMaxIndex - The current max segment index in the segmentation
 * @param toolGroupId - Tool group ID for color updates
 * @returns Array of new segment info with remapped indices
 */
export async function addInferenceResultToSegmentation(
  targetSegmentationId: string,
  newLabelDataBuffer: ArrayBuffer,
  incomingLabels: { index: number; name: string; color: string }[],
  existingMaxIndex: number,
  toolGroupId: string
): Promise<{ index: number; name: string; color: string }[]> {
  console.log('[MedAI] Adding inference result to existing segmentation:', targetSegmentationId);
  console.log('[MedAI] Existing max index:', existingMaxIndex, 'Incoming labels:', incomingLabels);

  const seg = segmentation.state.getSegmentation(targetSegmentationId);
  if (!seg) {
    throw new Error(`Target segmentation not found: ${targetSegmentationId}`);
  }

  const labelmapData = seg.representationData?.LABELMAP;
  if (!labelmapData) {
    throw new Error(`No labelmap data found for segmentation: ${targetSegmentationId}`);
  }

  const volumeId = 'volumeId' in labelmapData ? labelmapData.volumeId : undefined;
  if (!volumeId) {
    throw new Error(`No volumeId found for segmentation: ${targetSegmentationId}`);
  }

  const volume = cache.getVolume(volumeId);
  if (!volume) {
    throw new Error(`Volume not found: ${volumeId}`);
  }

  // Parse incoming label data - handle gzip compressed NIfTI
  const firstBytes = new Uint8Array(newLabelDataBuffer.slice(0, 8));
  const isGzip = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b;

  let newLabelData: Uint8Array | Uint16Array;
  const existingData = volume.getScalarData();
  const expectedSize = existingData.length;

  if (isGzip) {
    // Decompress NIfTI
    const niftiResult = await parseGzipNiftiData(newLabelDataBuffer, expectedSize);
    newLabelData = niftiResult.data instanceof Uint8Array ? niftiResult.data : new Uint8Array(niftiResult.data);
  } else {
    // Assume raw uint8
    newLabelData = new Uint8Array(newLabelDataBuffer);
  }

  if (existingData.length !== newLabelData.length) {
    throw new Error(`Labelmap size mismatch: ${existingData.length} vs ${newLabelData.length}`);
  }

  // Build label remapping: old index -> new index
  // New indices start from existingMaxIndex + 1
  const labelRemap = new Map<number, number>();
  const remappedLabels: { index: number; name: string; color: string }[] = [];

  incomingLabels.forEach((label, i) => {
    const newIndex = existingMaxIndex + 1 + i;
    labelRemap.set(label.index, newIndex);
    // Use palette color based on new index to ensure unique colors
    const paletteColor = SEGMENT_COLORS_PALETTE[(newIndex - 1) % SEGMENT_COLORS_PALETTE.length];
    remappedLabels.push({
      index: newIndex,
      name: label.name,
      color: paletteColor,
    });
  });

  console.log('[MedAI] Label remap:', Object.fromEntries(labelRemap));

  // Merge with remapped indices: only add non-zero values, remap to new indices
  for (let i = 0; i < newLabelData.length; i++) {
    const oldValue = newLabelData[i];
    if (oldValue !== 0) {
      const newValue = labelRemap.get(oldValue);
      if (newValue !== undefined) {
        existingData[i] = newValue;
      }
    }
  }

  // Update color LUT with new colors
  const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
  const rep = representations?.find((r: { segmentationId: string }) => r.segmentationId === targetSegmentationId);

  if (rep) {
    remappedLabels.forEach((label) => {
      const rgba = hexToRgba(label.color, 180);
      try {
        segmentation.config.color.setColorForSegmentIndex(
          toolGroupId,
          rep.segmentationRepresentationUID,
          label.index,
          rgba
        );
      } catch (e) {
        console.warn('[MedAI] Failed to set color for segment index:', label.index, e);
      }
    });
  }

  // Trigger update
  segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(targetSegmentationId);
  cornerstone3D.getRenderingEngine('medaiRenderingEngine')?.render();

  console.log('[MedAI] Added inference result with remapped labels:', remappedLabels);
  return remappedLabels;
}

/**
 * Merge new labelmap data into a multi-layer segmentation.
 * For each label in the incoming data, adds voxels to the corresponding segment's binary mask.
 * Creates new segment volumes for labels that don't have existing volumes.
 *
 * @param parentSegmentationId - The segmentation ID in the store
 * @param newLabelDataBuffer - Raw label data to merge
 * @param labels - Array of label info with index, name, and color
 * @param existingSegments - Array of existing segments with their volume info
 * @param referenceVolumeId - Reference image volume ID
 * @param toolGroupId - Tool group ID
 * @param dataType - Optional data type hint
 * @returns Map of segment index to { volumeId, cornerstoneSegmentationId } for new segments
 */
export async function mergeMultiLayerLabelmapData(
  parentSegmentationId: string,
  newLabelDataBuffer: ArrayBuffer,
  labels: { index: number; name: string; color: string }[],
  existingSegments: { segmentIndex: number; volumeId?: string; cornerstoneSegmentationId?: string }[],
  referenceVolumeId: string,
  toolGroupId: string,
  dataType?: string
): Promise<Map<number, { volumeId: string; cornerstoneSegmentationId: string }>> {
  console.log('[MedAI] Merging multi-layer labelmap data');

  // Get reference volume for dimensions
  const referenceVolume = cache.getVolume(referenceVolumeId);
  if (!referenceVolume) {
    throw new Error(`Reference volume not found: ${referenceVolumeId}`);
  }

  const { dimensions } = referenceVolume;
  const expectedSize = dimensions[0] * dimensions[1] * dimensions[2];
  const dimX = dimensions[0];
  const dimY = dimensions[1];
  const dimZ = dimensions[2];

  // Parse incoming label data
  let newLabelData: Uint8Array | Int16Array | Uint16Array | Float32Array;
  let niftiDimensions: [number, number, number] | null = null;

  // Check for compression or PNG
  const firstBytes = new Uint8Array(newLabelDataBuffer.slice(0, 4));
  const isGzip = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b;
  const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4e && firstBytes[3] === 0x47;
  const headerStr = String.fromCharCode(...firstBytes);

  if (isPng) {
    console.log('[MedAI] mergeMultiLayer: Detected PNG mask, parsing...');
    newLabelData = await parsePngMaskData(newLabelDataBuffer, dimX, dimY);
    console.log('[MedAI] mergeMultiLayer: PNG mask parsed, size:', newLabelData.length);
  } else if (isGzip) {
    const niftiResult = await parseGzipNiftiData(newLabelDataBuffer, expectedSize);
    newLabelData = niftiResult.data;
    niftiDimensions = niftiResult.dimensions;
  } else if (headerStr.startsWith('NRRD')) {
    newLabelData = parseNrrdData(newLabelDataBuffer, expectedSize);
  } else {
    const dt = dataType?.toLowerCase() || 'uint8';
    if (dt.includes('int16') && !dt.includes('uint')) {
      newLabelData = new Int16Array(newLabelDataBuffer);
    } else if (dt.includes('uint16')) {
      newLabelData = new Uint16Array(newLabelDataBuffer);
    } else if (dt.includes('float32') || dt.includes('float')) {
      newLabelData = new Float32Array(newLabelDataBuffer);
    } else {
      newLabelData = new Uint8Array(newLabelDataBuffer);
    }
  }

  // Detect if transpose is needed
  const needsTranspose = niftiDimensions !== null &&
    niftiDimensions[0] === dimZ &&
    niftiDimensions[2] === dimX &&
    niftiDimensions[1] === dimY &&
    dimX !== dimZ;

  // Result map for newly created segment volumes
  const newSegmentVolumeMap = new Map<number, { volumeId: string; cornerstoneSegmentationId: string }>();

  // Process each label
  for (const label of labels) {
    if (label.index === 0) continue;

    // Find existing segment info
    const existingSegment = existingSegments.find(s => s.segmentIndex === label.index);
    let volumeId: string | undefined = existingSegment?.volumeId;
    let cornerstoneSegmentationId: string | undefined = existingSegment?.cornerstoneSegmentationId;

    // If segment doesn't have its own volume, create one
    if (!volumeId || !cornerstoneSegmentationId) {
      const rgba = hexToRgba(label.color, 180);
      const newVolumeInfo = await createSegmentVolume(
        referenceVolumeId,
        parentSegmentationId,
        label.index,
        toolGroupId,
        rgba
      );
      volumeId = newVolumeInfo.volumeId;
      cornerstoneSegmentationId = newVolumeInfo.cornerstoneSegmentationId;
      newSegmentVolumeMap.set(label.index, newVolumeInfo);
    }

    // Get segment's volume and add voxels
    const segmentVolume = cache.getVolume(volumeId);
    if (!segmentVolume) {
      console.error('[MedAI] Merge: Failed to get segment volume:', volumeId);
      continue;
    }

    const segmentData = segmentVolume.getScalarData();
    let voxelCount = 0;

    if (needsTranspose) {
      for (let z = 0; z < dimZ; z++) {
        for (let y = 0; y < dimY; y++) {
          for (let x = 0; x < dimX; x++) {
            const srcIdx = z + y * dimZ + x * dimZ * dimY;
            const dstIdx = x + y * dimX + z * dimX * dimY;
            if (newLabelData[srcIdx] === label.index) {
              segmentData[dstIdx] = 1; // Add to mask (OR operation for merge)
              voxelCount++;
            }
          }
        }
      }
    } else {
      for (let i = 0; i < newLabelData.length; i++) {
        if (newLabelData[i] === label.index) {
          segmentData[i] = 1;
          voxelCount++;
        }
      }
    }

    console.log('[MedAI] Merge: Added', voxelCount, 'voxels to label', label.index);

    // Mark volume as modified
    if (segmentVolume.imageData) {
      segmentVolume.imageData.modified();
    }

    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(cornerstoneSegmentationId);
  }

  getRenderingEngine()?.render();
  console.log('[MedAI] Multi-layer merge complete:', newSegmentVolumeMap.size, 'new segment volumes');

  return newSegmentVolumeMap;
}

/**
 * Get labelmap data from a segmentation for export
 */
export function getLabelmapDataForExport(segmentationId: string): {
  scalarData: Uint8Array | Uint16Array | Float32Array;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
} | null {
  const seg = segmentation.state.getSegmentation(segmentationId);
  if (!seg) {
    console.error('[MedAI] Segmentation not found:', segmentationId);
    return null;
  }

  // Access the labelmap representation data
  const labelmapData = seg.representationData?.LABELMAP;
  if (!labelmapData) {
    console.error('[MedAI] No labelmap data found for segmentation:', segmentationId);
    return null;
  }

  // Check if it has volumeId (volume-based labelmap)
  const volumeId = 'volumeId' in labelmapData ? labelmapData.volumeId : undefined;
  if (!volumeId) {
    console.error('[MedAI] No labelmap volume found for segmentation:', segmentationId);
    return null;
  }

  const volume = cache.getVolume(volumeId);
  if (!volume) {
    console.error('[MedAI] Volume not found:', volumeId);
    return null;
  }

  const scalarData = volume.getScalarData();
  const { dimensions, spacing, origin, direction } = volume;

  return {
    scalarData: scalarData as Uint8Array | Uint16Array | Float32Array,
    dimensions: dimensions as [number, number, number],
    spacing: spacing as [number, number, number],
    origin: origin as [number, number, number],
    direction: Array.from(direction as Float32Array),
  };
}

/**
 * Convert volume data to gzip-compressed NIfTI format
 */
function volumeToNiftiGzip(
  scalarData: ArrayLike<number>,
  dimensions: [number, number, number],
  spacing: [number, number, number],
  origin: [number, number, number],
  direction: number[],
  dtype: 'uint8' | 'uint16' | 'int16' | 'float32' = 'uint16'
): ArrayBuffer {
  const [dimX, dimY, dimZ] = dimensions;
  const totalVoxels = dimX * dimY * dimZ;

  // NIfTI-1 header (348 bytes) + extension (4 bytes minimum) = 352 bytes before data
  const headerSize = 348;
  const extensionSize = 4; // Minimum extension section
  const voxOffset = headerSize + extensionSize; // 352 bytes
  const header = new ArrayBuffer(headerSize);
  const headerView = new DataView(header);

  // sizeof_hdr (must be 348)
  headerView.setInt32(0, 348, true);

  // dim[8] - starts at offset 40
  headerView.setInt16(40, 4, true);  // ndim = 4 (for 3D + time)
  headerView.setInt16(42, dimX, true);  // dim[1] = X
  headerView.setInt16(44, dimY, true);  // dim[2] = Y
  headerView.setInt16(46, dimZ, true);  // dim[3] = Z
  headerView.setInt16(48, 1, true);     // dim[4] = 1 (time/4th dim)
  headerView.setInt16(50, 1, true);     // dim[5] = 1
  headerView.setInt16(52, 1, true);     // dim[6] = 1
  headerView.setInt16(54, 1, true);     // dim[7] = 1

  // datatype and bitpix at offset 70 and 72
  let dataTypeCode: number;
  let bitpix: number;
  switch (dtype) {
    case 'uint8':
      dataTypeCode = 2; // DT_UINT8
      bitpix = 8;
      break;
    case 'int16':
      dataTypeCode = 4; // DT_INT16
      bitpix = 16;
      break;
    case 'uint16':
      dataTypeCode = 512; // DT_UINT16
      bitpix = 16;
      break;
    case 'float32':
      dataTypeCode = 16; // DT_FLOAT32
      bitpix = 32;
      break;
    default:
      dataTypeCode = 512;
      bitpix = 16;
  }
  headerView.setInt16(70, dataTypeCode, true);
  headerView.setInt16(72, bitpix, true);

  // pixdim[8] - voxel spacing at offset 76 (float32)
  headerView.setFloat32(76, 1, true);  // pixdim[0] = qfac (1 or -1)
  headerView.setFloat32(80, spacing[0], true);  // pixdim[1] = x spacing
  headerView.setFloat32(84, spacing[1], true);  // pixdim[2] = y spacing
  headerView.setFloat32(88, spacing[2], true);  // pixdim[3] = z spacing

  // vox_offset at offset 108 - where data starts (must be >= 352 for single file)
  headerView.setFloat32(108, voxOffset, true);

  // scl_slope and scl_inter at offset 112 and 116
  headerView.setFloat32(112, 1.0, true);  // slope
  headerView.setFloat32(116, 0.0, true);  // intercept

  // xyzt_units at offset 123 - mm and sec
  headerView.setUint8(123, 2 | (8 << 3)); // NIFTI_UNITS_MM | NIFTI_UNITS_SEC

  // qform_code and sform_code at 252 and 254
  headerView.setInt16(252, 1, true);  // qform = SCANNER_ANAT
  headerView.setInt16(254, 1, true);  // sform = SCANNER_ANAT

  // srow_x, srow_y, srow_z - affine matrix at offsets 280, 296, 312
  // Using direction matrix and spacing
  headerView.setFloat32(280, direction[0] * spacing[0], true);
  headerView.setFloat32(284, direction[1] * spacing[0], true);
  headerView.setFloat32(288, direction[2] * spacing[0], true);
  headerView.setFloat32(292, origin[0], true);

  headerView.setFloat32(296, direction[3] * spacing[1], true);
  headerView.setFloat32(300, direction[4] * spacing[1], true);
  headerView.setFloat32(304, direction[5] * spacing[1], true);
  headerView.setFloat32(308, origin[1], true);

  headerView.setFloat32(312, direction[6] * spacing[2], true);
  headerView.setFloat32(316, direction[7] * spacing[2], true);
  headerView.setFloat32(320, direction[8] * spacing[2], true);
  headerView.setFloat32(324, origin[2], true);

  // magic at offset 344 - "n+1\0" for NIfTI-1 single file
  headerView.setUint8(344, 0x6E); // 'n'
  headerView.setUint8(345, 0x2B); // '+'
  headerView.setUint8(346, 0x31); // '1'
  headerView.setUint8(347, 0x00); // null terminator

  // Create data array
  let dataArray: ArrayBuffer;
  const bytesPerVoxel = bitpix / 8;
  const dataSize = totalVoxels * bytesPerVoxel;

  if (dtype === 'uint8') {
    const data = new Uint8Array(dataSize);
    for (let i = 0; i < totalVoxels; i++) {
      data[i] = Math.max(0, Math.min(255, Math.round(scalarData[i])));
    }
    dataArray = data.buffer;
  } else if (dtype === 'uint16') {
    const data = new Uint16Array(totalVoxels);
    for (let i = 0; i < totalVoxels; i++) {
      data[i] = Math.max(0, Math.min(65535, Math.round(scalarData[i])));
    }
    dataArray = data.buffer;
  } else if (dtype === 'int16') {
    const data = new Int16Array(totalVoxels);
    for (let i = 0; i < totalVoxels; i++) {
      data[i] = Math.max(-32768, Math.min(32767, Math.round(scalarData[i])));
    }
    dataArray = data.buffer;
  } else {
    const data = new Float32Array(totalVoxels);
    for (let i = 0; i < totalVoxels; i++) {
      data[i] = scalarData[i];
    }
    dataArray = data.buffer;
  }

  // Combine header, extension, and data
  // Extension section: 4 bytes of zeros (no extensions)
  const extension = new Uint8Array(extensionSize); // All zeros = no extensions
  const niftiData = new Uint8Array(voxOffset + dataSize);
  niftiData.set(new Uint8Array(header), 0);
  niftiData.set(extension, headerSize);
  niftiData.set(new Uint8Array(dataArray), voxOffset);

  // Gzip compress the NIfTI data using imported pako
  try {
    const compressed = pako.gzip(niftiData);
    // Copy to ensure we get a proper ArrayBuffer (not SharedArrayBuffer)
    const result = new ArrayBuffer(compressed.byteLength);
    new Uint8Array(result).set(compressed);
    console.log('[MedAI] NIfTI data compressed:', niftiData.byteLength, '->', compressed.byteLength, 'bytes');
    return result;
  } catch (e) {
    console.error('[MedAI] pako gzip compression failed:', e);
    // Fallback to uncompressed
    const result = new ArrayBuffer(niftiData.byteLength);
    new Uint8Array(result).set(niftiData);
    return result;
  }
}

/**
 * Get combined labelmap data from a segmentation for analytics.
 * Handles both legacy single-volume and multi-layer segmentations.
 * Returns NIfTI-formatted data ready for server upload.
 */
export function getCombinedLabelmapForAnalytics(
  segmentationId: string,
  segments: Array<{ segmentIndex: number; volumeId?: string; cornerstoneSegmentationId?: string }>
): {
  niftiData: ArrayBuffer;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
} | null {
  // First, try to get the legacy single-volume labelmap
  const legacyData = getLabelmapDataForExport(segmentationId);

  if (legacyData) {
    // Legacy mode: single volume contains all segments
    const niftiData = volumeToNiftiGzip(
      legacyData.scalarData,
      legacyData.dimensions,
      legacyData.spacing,
      legacyData.origin,
      legacyData.direction,
      'uint16'
    );
    return {
      niftiData,
      dimensions: legacyData.dimensions,
      spacing: legacyData.spacing,
      origin: legacyData.origin,
      direction: legacyData.direction,
    };
  }

  // Multi-layer mode: combine separate segment volumes
  // Find a segment with volume data to get dimensions
  let referenceVolume: ReturnType<typeof cache.getVolume> | undefined;
  for (const seg of segments) {
    if (seg.volumeId) {
      referenceVolume = cache.getVolume(seg.volumeId);
      if (referenceVolume) break;
    }
  }

  if (!referenceVolume) {
    console.error('[MedAI] No volume data found for multi-layer segmentation');
    return null;
  }

  const { dimensions, spacing, origin, direction } = referenceVolume;
  const totalVoxels = dimensions[0] * dimensions[1] * dimensions[2];

  // Create combined labelmap
  const combinedMask = new Uint16Array(totalVoxels);

  for (const seg of segments) {
    if (seg.volumeId) {
      const segVolume = cache.getVolume(seg.volumeId);
      if (segVolume) {
        const segData = segVolume.getScalarData();
        for (let i = 0; i < totalVoxels; i++) {
          // Multi-layer uses binary masks (value 1 = segment present)
          if (segData[i] > 0) {
            combinedMask[i] = seg.segmentIndex;
          }
        }
      }
    }
  }

  const niftiData = volumeToNiftiGzip(
    combinedMask,
    dimensions as [number, number, number],
    spacing as [number, number, number],
    origin as [number, number, number],
    Array.from(direction as Float32Array),
    'uint16'
  );

  return {
    niftiData,
    dimensions: dimensions as [number, number, number],
    spacing: spacing as [number, number, number],
    origin: origin as [number, number, number],
    direction: Array.from(direction as Float32Array),
  };
}

/**
 * Get source image volume data for analytics (radiomics).
 * Returns NIfTI-formatted data ready for server upload.
 */
export function getImageVolumeForAnalytics(imageId: string): {
  niftiData: ArrayBuffer;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
} | null {
  const volumeId = `localVolume:${imageId}`;
  const volume = cache.getVolume(volumeId);

  if (!volume) {
    console.error('[MedAI] Image volume not found:', volumeId);
    return null;
  }

  const scalarData = volume.getScalarData();
  const { dimensions, spacing, origin, direction } = volume;

  // Determine data type based on scalar data type
  let dtype: 'int16' | 'float32' = 'int16';
  if (scalarData instanceof Float32Array) {
    dtype = 'float32';
  }

  const niftiData = volumeToNiftiGzip(
    scalarData,
    dimensions as [number, number, number],
    spacing as [number, number, number],
    origin as [number, number, number],
    Array.from(direction as Float32Array),
    dtype
  );

  return {
    niftiData,
    dimensions: dimensions as [number, number, number],
    spacing: spacing as [number, number, number],
    origin: origin as [number, number, number],
    direction: Array.from(direction as Float32Array),
  };
}

/**
 * Get viewport scroll info (current slice index and total slices)
 * Uses Cornerstone's built-in utilities for accurate slice tracking
 */
export function getViewportScrollInfo(viewportId: string): { currentIndex: number; totalSlices: number } | null {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    return null;
  }

  try {
    // Get the volume ID from the viewport's actors
    const actorUIDs = viewport.getActors();
    if (actorUIDs.length > 0) {
      const volumeId = actorUIDs[0].uid;

      // Use Cornerstone core utilities for accurate scroll info
      // This is what the scroll tools use internally
      const scrollInfo = cornerstone3D.utilities.getVolumeViewportScrollInfo(viewport, volumeId);

      if (scrollInfo && scrollInfo.numScrollSteps > 0) {
        return {
          currentIndex: scrollInfo.currentStepIndex,
          totalSlices: scrollInfo.numScrollSteps,
        };
      }
    }

    // Fallback to manual calculation if the utility fails
    const imageData = viewport.getImageData();
    if (!imageData) return null;

    const { dimensions } = imageData;
    const camera = viewport.getCamera();
    const viewPlaneNormal = camera.viewPlaneNormal;

    if (!viewPlaneNormal) {
      return { currentIndex: 0, totalSlices: dimensions[2] };
    }

    // Determine which dimension based on view plane normal
    let totalSlices = dimensions[2]; // Default to axial (Z)
    let axisIndex = 2;
    if (Math.abs(viewPlaneNormal[0]) > 0.5) {
      totalSlices = dimensions[0]; // Sagittal (X)
      axisIndex = 0;
    } else if (Math.abs(viewPlaneNormal[1]) > 0.5) {
      totalSlices = dimensions[1]; // Coronal (Y)
      axisIndex = 1;
    }

    // Get current slice index from the viewport's scroll position
    const { spacing, origin } = imageData;
    const focalPoint = camera.focalPoint;

    if (!focalPoint || !spacing || !origin) {
      return { currentIndex: Math.floor(totalSlices / 2), totalSlices };
    }

    // Calculate slice index based on focal point position along the axis
    const currentSlice = Math.round(
      (focalPoint[axisIndex] - origin[axisIndex]) / spacing[axisIndex]
    );

    return {
      currentIndex: Math.max(0, Math.min(totalSlices - 1, currentSlice)),
      totalSlices,
    };
  } catch (e) {
    console.error('[MedAI] Failed to get scroll info:', e);
    return null;
  }
}

/**
 * Scroll viewport to a specific slice index
 */
export function scrollViewportToSlice(viewportId: string, sliceIndex: number): void {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) {
    console.error('[MedAI] Viewport not found:', viewportId);
    return;
  }

  try {
    // Use scroll utility to change slice
    cornerstoneTools.utilities.viewport.jumpToSlice(viewport.element, {
      imageIndex: sliceIndex,
    });
    // The viewport.render() is not needed as jumpToSlice triggers render
  } catch (e) {
    console.error('[MedAI] Failed to scroll viewport:', e);
  }
}

/**
 * Get volume data range for windowing
 */
export function getVolumeDataRange(volumeId: string): { min: number; max: number } | null {
  const volume = cache.getVolume(volumeId);
  if (!volume) return null;

  const scalarData = volume.getScalarData();
  let min = Infinity;
  let max = -Infinity;

  // Sample for performance
  const step = Math.max(1, Math.floor(scalarData.length / 100000));
  for (let i = 0; i < scalarData.length; i += step) {
    const val = scalarData[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }

  return { min, max };
}

/**
 * Set window/level for viewports
 */
export function setWindowLevel(viewportIds: string[], windowWidth: number, windowCenter: number): void {
  const engine = getRenderingEngine();

  viewportIds.forEach((viewportId) => {
    const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;
    if (viewport) {
      const actorEntry = viewport.getDefaultActor();
      if (actorEntry?.actor) {
        const volumeActor = actorEntry.actor as cornerstone3D.Types.VolumeActor;
        const property = volumeActor.getProperty();
        const cfun = property.getRGBTransferFunction(0);
        if (cfun) {
          const lower = windowCenter - windowWidth / 2;
          const upper = windowCenter + windowWidth / 2;
          cfun.setMappingRange(lower, upper);
        }
      }
      viewport.render();
    }
  });
}

/**
 * Get current window/level values
 */
export function getWindowLevel(viewportId: string): { windowWidth: number; windowCenter: number } | null {
  const engine = getRenderingEngine();
  const viewport = engine.getViewport(viewportId) as cornerstone3D.Types.IVolumeViewport;

  if (!viewport) return null;

  const actorEntry = viewport.getDefaultActor();
  if (!actorEntry?.actor) return null;

  const volumeActor = actorEntry.actor as cornerstone3D.Types.VolumeActor;
  const property = volumeActor.getProperty();
  const cfun = property.getRGBTransferFunction(0);

  if (!cfun) return null;

  const range = cfun.getMappingRange();
  const windowWidth = range[1] - range[0];
  const windowCenter = (range[0] + range[1]) / 2;

  return { windowWidth, windowCenter };
}

/**
 * Activate ProbeMONAILabel tool for SmartEdit point prompts
 * @param isPositive - Whether to add positive (include) or negative (exclude) points
 */
export function activateProbeMonaiLabelTool(toolGroupId: string, isPositive: boolean = true): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Set point mode (positive/negative)
  setPointMode(isPositive);

  // Deactivate other primary tools (both for 2D and 3D viewports)
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.PanTool.toolName);

  // Deactivate brush tools if active
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Activate ProbeMONAILabel tool
  toolGroup.setToolActive(ProbeMONAILabelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] ProbeMONAILabel tool activated, isPositive:', isPositive);
}

/**
 * Deactivate ProbeMONAILabel tool and restore default tools
 */
export function deactivateProbeMonaiLabelTool(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate ProbeMONAILabel tool
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);

  // Re-activate WindowLevel tool
  toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] ProbeMONAILabel tool deactivated, default tools restored');
}

/**
 * Get all point annotations from ProbeMONAILabel tool
 * Returns world coordinates and isPositive flag for each point
 */
export function getProbeMonaiLabelPoints(element: HTMLDivElement): Array<{
  worldPoint: [number, number, number];
  isPositive: boolean;
  annotationUID: string;
}> {
  const annotations = getPointAnnotations(element);

  return annotations.map((ann: any) => ({
    worldPoint: ann.data.handles.points[0] as [number, number, number],
    isPositive: ann.data.isPositive !== false,
    annotationUID: ann.annotationUID,
  }));
}

/**
 * Clear all ProbeMONAILabel annotations
 */
export function clearProbeMonaiLabelPoints(): void {
  clearPointAnnotations();

  // Re-render viewports
  const engine = getRenderingEngine();
  engine.renderViewports(['axial', 'sagittal', 'coronal']);

  console.log('[MedAI] Cleared all ProbeMONAILabel annotations');
}

/**
 * Convert world coordinates to IJK (voxel) coordinates for a volume
 */
export function worldToIJK(volumeId: string, worldPoint: [number, number, number]): [number, number, number] | null {
  const volume = cache.getVolume(volumeId);
  if (!volume) {
    console.error('[MedAI] Volume not found:', volumeId);
    return null;
  }

  const imageData = volume.imageData;
  if (!imageData) {
    console.error('[MedAI] No image data for volume:', volumeId);
    return null;
  }

  // Use VTK's worldToIndex transformation
  const ijk = imageData.worldToIndex(worldPoint);

  // Round to nearest integer voxel indices
  return [
    Math.round(ijk[0]),
    Math.round(ijk[1]),
    Math.round(ijk[2]),
  ];
}

/**
 * Activate RectangleMONAILabel tool for SmartEdit bounding box prompts
 * @param isPositive - Whether to add positive (include) or negative (exclude) boxes
 */
export function activateRectangleMonaiLabelTool(toolGroupId: string, isPositive: boolean = true): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Set box mode (positive/negative)
  setBoxMode(isPositive);

  // Deactivate other primary tools (both for 2D and 3D viewports)
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.PanTool.toolName);
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Deactivate brush tools if active
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Activate RectangleMONAILabel tool
  toolGroup.setToolActive(RectangleMONAILabelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] RectangleMONAILabel tool activated, isPositive:', isPositive);
}

/**
 * Deactivate RectangleMONAILabel tool and restore default tools
 */
export function deactivateRectangleMonaiLabelTool(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate RectangleMONAILabel tool
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);

  // Re-activate WindowLevel tool
  toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] RectangleMONAILabel tool deactivated, default tools restored');
}

/**
 * Get all rectangle annotations from RectangleMONAILabel tool
 * Returns world coordinates of bounding box corners
 * Only returns completed annotations (not currently being drawn)
 */
export function getRectangleMonaiLabelBoxes(element: HTMLDivElement): Array<{
  worldPoints: [number, number, number][];
  isPositive: boolean;
  annotationUID: string;
  highlighted: boolean;
}> {
  const annotations = getBoxAnnotations(element);

  return annotations.map((ann: any) => ({
    worldPoints: ann.data.handles.points as [number, number, number][],
    isPositive: ann.data.isPositive !== false,
    annotationUID: ann.annotationUID,
    highlighted: ann.highlighted === true, // true when being drawn/edited
  }));
}

/**
 * Clear all RectangleMONAILabel annotations
 */
export function clearRectangleMonaiLabelBoxes(): void {
  clearBoxAnnotations();

  // Re-render viewports
  const engine = getRenderingEngine();
  engine.renderViewports(['axial', 'sagittal', 'coronal']);

  console.log('[MedAI] Cleared all RectangleMONAILabel annotations');
}

/**
 * Activate FreehandMONAILabel tool for SmartEdit scribble/lasso prompts
 * @param isPositive - Whether to add positive (include) or negative (exclude) strokes
 * @param isLasso - Whether to use lasso (closed) or scribble (open) mode
 */
export function activateFreehandMonaiLabelTool(toolGroupId: string, isPositive: boolean = true, isLasso: boolean = false): void {
  console.log('[MedAI] activateFreehandMonaiLabelTool called:', { toolGroupId, isPositive, isLasso });
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Check if tool is in the group
  const hasTool = toolGroup.hasTool(FreehandMONAILabelTool.toolName);
  console.log('[MedAI] Tool group has FreehandMONAILabel:', hasTool);

  // Set modes
  setFreehandMode(isPositive);
  setFreehandLassoMode(isLasso);
  console.log('[MedAI] Modes set: isPositive=', isPositive, 'isLasso=', isLasso);

  // Deactivate other primary tools (both for 2D and 3D viewports)
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.PanTool.toolName);
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);

  // Deactivate brush tools if active
  const brushTools = [BRUSH_TOOL_NAMES.CircularBrush, BRUSH_TOOL_NAMES.CircularEraser,
                      BRUSH_TOOL_NAMES.SphereBrush, BRUSH_TOOL_NAMES.SphereEraser];
  brushTools.forEach(toolName => {
    if (toolGroup.hasTool(toolName)) {
      toolGroup.setToolPassive(toolName);
    }
  });

  // Activate FreehandMONAILabel tool
  toolGroup.setToolActive(FreehandMONAILabelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] FreehandMONAILabel tool activated, isPositive:', isPositive, 'isLasso:', isLasso);
}

/**
 * Deactivate FreehandMONAILabel tool and restore default tools
 */
export function deactivateFreehandMonaiLabelTool(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate FreehandMONAILabel tool
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Re-activate WindowLevel tool
  toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] FreehandMONAILabel tool deactivated, default tools restored');
}

/**
 * Get all freehand annotations from FreehandMONAILabel tool
 * Returns polyline points for scribbles and lassos
 */
export function getFreehandMonaiLabelAnnotations(element: HTMLDivElement): Array<{
  worldPoints: [number, number, number][];
  isPositive: boolean;
  isLasso: boolean;
  annotationUID: string;
}> {
  const annotations = getFreehandAnnotations(element);

  return annotations.map((ann: any) => {
    // Get polyline points from different possible locations
    let points: [number, number, number][] = [];
    if (ann.data.contour?.polyline) {
      points = ann.data.contour.polyline;
    } else if (ann.data.polyline) {
      points = ann.data.polyline;
    } else if (ann.data.handles?.points) {
      points = ann.data.handles.points;
    }

    return {
      worldPoints: points,
      isPositive: ann.data.isPositive !== false,
      isLasso: ann.data.isLasso === true,
      annotationUID: ann.annotationUID,
    };
  });
}

/**
 * Clear all FreehandMONAILabel annotations
 */
export function clearFreehandMonaiLabelAnnotations(): void {
  clearFreehandAnnotations();

  // Re-render viewports
  const engine = getRenderingEngine();
  engine.renderViewports(['axial', 'sagittal', 'coronal']);

  console.log('[MedAI] Cleared all FreehandMONAILabel annotations');
}

/**
 * Clear all SmartEdit annotations (points, boxes, and freehand)
 */
export function clearAllSmartEditAnnotations(): void {
  clearPointAnnotations();
  clearBoxAnnotations();
  clearFreehandAnnotations();

  // Re-render viewports (both 2D and 3D)
  try {
    const engine = getRenderingEngine();
    // Try both 3D viewports and 2D viewport
    const viewportIds = ['axial', 'sagittal', 'coronal', 'main2d'];
    const existingViewports = viewportIds.filter(id => engine.getViewport(id));
    if (existingViewports.length > 0) {
      engine.renderViewports(existingViewports);
    }
  } catch (e) {
    console.warn('[MedAI] Error rendering viewports after clearing annotations:', e);
  }

  console.log('[MedAI] Cleared all SmartEdit annotations');
}

/**
 * Deactivate all SmartEdit tools
 */
export function deactivateAllSmartEditTools(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate all SmartEdit tools
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);

  // Re-activate WindowLevel tool
  toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] All SmartEdit tools deactivated');
}

/**
 * Resize all viewports when container size changes
 * This must be called whenever the viewport container dimensions change
 * (e.g., window resize, sidebar toggle, etc.)
 */
export function resizeViewports(): void {
  try {
    const engine = getRenderingEngine();
    if (!engine) {
      console.warn('[MedAI] No rendering engine available for resize');
      return;
    }

    console.log('[MedAI] ========== RESIZE TRIGGERED ==========');

    // Check what viewports exist in the engine
    const allViewports = engine.getViewports();
    console.log('[MedAI] Available viewports in engine:', allViewports ? allViewports.map((vp: any) => vp.id) : 'none');

    // Check viewport element dimensions and log camera state BEFORE resize
    const viewportIds = ['axial', 'sagittal', 'coronal'];
    viewportIds.forEach(vpId => {
      const vp = engine.getViewport(vpId);
      if (vp && vp.element) {
        console.log(`[MedAI] ${vpId} element dimensions:`, {
          width: vp.element.clientWidth,
          height: vp.element.clientHeight
        });
      }
    });

    viewportIds.forEach(vpId => {
      const vp = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
      console.log(`[MedAI] Attempting to get viewport '${vpId}':`, vp ? 'found' : 'NOT FOUND');
      if (vp) {
        const camera = vp.getCamera();
        console.log(`[MedAI] ${vpId} camera BEFORE resize:`, {
          position: camera.position,
          focalPoint: camera.focalPoint,
          parallelScale: camera.parallelScale
        });
      } else {
        console.error(`[MedAI] CRITICAL: Viewport '${vpId}' does not exist during resize!`);
      }
    });

    // Resize the rendering engine which updates all viewports
    // The first param (immediate) forces synchronous resize
    // The second param (keepCamera) preserves camera state
    console.log('[MedAI] Calling engine.resize(true, true)...');
    engine.resize(true, true);

    // Log camera state AFTER resize
    viewportIds.forEach(vpId => {
      const vp = engine.getViewport(vpId) as cornerstone3D.Types.IVolumeViewport;
      if (vp) {
        const camera = vp.getCamera();
        console.log(`[MedAI] ${vpId} camera AFTER resize:`, {
          position: camera.position,
          focalPoint: camera.focalPoint,
          parallelScale: camera.parallelScale
        });
      }
    });

    // Re-render all viewports after resize
    const allViewportIds = ['axial', 'sagittal', 'coronal', 'main2d'];
    const existingViewports = allViewportIds.filter(id => engine.getViewport(id));
    if (existingViewports.length > 0) {
      console.log('[MedAI] Re-rendering viewports:', existingViewports);
      engine.renderViewports(existingViewports);
    }

    console.log('[MedAI] Viewports resized - complete');
  } catch (e) {
    console.warn('[MedAI] Error resizing viewports:', e);
  }
}

export { cornerstone3D, cornerstoneTools, segmentation };

// Export new annotation tools (Module 1: Enhanced Annotation Tools)
export {
  PolygonAnnotationTool,
  getPolygonAnnotations,
  clearPolygonAnnotations,
};

export {
  PolylineAnnotationTool,
  getPolylineAnnotations,
  clearPolylineAnnotations,
};

export {
  SmartBrushTool,
  getSmartBrushPoints,
  clearSmartBrushPoints,
  setSmartBrushMode,
  getSmartBrushMode,
};

/**
 * Activate PolygonAnnotationTool for closed polygon drawing
 */
export function activatePolygonTool(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate other tools
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);
  toolGroup.setToolPassive(PolylineAnnotationTool.toolName);
  toolGroup.setToolPassive(SmartBrushTool.toolName);

  // Activate polygon tool
  toolGroup.setToolActive(PolygonAnnotationTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] PolygonAnnotationTool activated');
}

/**
 * Activate PolylineAnnotationTool for open path drawing
 */
export function activatePolylineTool(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Deactivate other tools
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);
  toolGroup.setToolPassive(PolygonAnnotationTool.toolName);
  toolGroup.setToolPassive(SmartBrushTool.toolName);

  // Activate polyline tool
  toolGroup.setToolActive(PolylineAnnotationTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] PolylineAnnotationTool activated');
}

/**
 * Activate SmartBrushTool for AI click-to-segment
 */
export function activateSmartBrushTool(toolGroupId: string, isPositive: boolean = true): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  // Set mode before activating
  setSmartBrushMode(isPositive);

  // Deactivate other tools
  toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);
  toolGroup.setToolPassive(ProbeMONAILabelTool.toolName);
  toolGroup.setToolPassive(RectangleMONAILabelTool.toolName);
  toolGroup.setToolPassive(FreehandMONAILabelTool.toolName);
  toolGroup.setToolPassive(PolygonAnnotationTool.toolName);
  toolGroup.setToolPassive(PolylineAnnotationTool.toolName);

  // Activate smart brush tool
  toolGroup.setToolActive(SmartBrushTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] SmartBrushTool activated, isPositive:', isPositive);
}

/**
 * Deactivate all enhanced annotation tools
 */
export function deactivateEnhancedAnnotationTools(toolGroupId: string): void {
  const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.error('[MedAI] Tool group not found:', toolGroupId);
    return;
  }

  toolGroup.setToolPassive(PolygonAnnotationTool.toolName);
  toolGroup.setToolPassive(PolylineAnnotationTool.toolName);
  toolGroup.setToolPassive(SmartBrushTool.toolName);

  // Re-activate WindowLevel tool
  toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
    bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
  });

  console.log('[MedAI] Enhanced annotation tools deactivated');
}

/**
 * Diagnostic function to check Cornerstone3D initialization status
 * Call this from browser console: window.diagnoseCornerstone()
 */
(window as any).diagnoseCornerstone = async function () {
  console.log('=== Cornerstone3D Diagnostics ===');

  // Check WebGL
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  console.log('WebGL available:', !!gl);
  if (gl) {
    console.log('WebGL version:', gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1');
    console.log('Renderer:', gl.getParameter(gl.RENDERER));
    console.log('Vendor:', gl.getParameter(gl.VENDOR));
  }

  // Check SharedArrayBuffer
  console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');

  // Check COOP/COEP headers
  console.log('Cross-origin isolated:', (window as any).crossOriginIsolated ?? 'unknown');

  // Check initialization status
  console.log('Cornerstone initialized:', initialized);

  // Try to initialize if not already
  if (!initialized) {
    console.log('Attempting initialization...');
    try {
      await initCornerstone();
      console.log('Initialization successful!');
    } catch (err) {
      console.error('Initialization failed:', err);
    }
  }

  console.log('=================================');
};

/**
 * Delete all currently selected annotations
 * @returns The number of annotations that were deleted
 */
export function deleteSelectedAnnotations(): number {
  const selectedUIDs = cornerstoneTools.annotation.selection.getAnnotationsSelected();
  selectedUIDs.forEach((uid: string) => {
    cornerstoneTools.annotation.state.getAnnotationManager().removeAnnotation(uid);
  });
  return selectedUIDs.length;
}
