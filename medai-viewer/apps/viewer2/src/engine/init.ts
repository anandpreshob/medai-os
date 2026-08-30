import {
  init as csInit,
  cache,
  imageLoader,
  volumeLoader,
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
  setConfiguration,
  getConfiguration,
} from '@cornerstonejs/core';
import {
  init as csToolsInit,
  addTool,
  StackScrollTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  CrosshairsTool,
  TrackballRotateTool,
  LengthTool,
  AngleTool,
  CobbAngleTool,
  BidirectionalTool,
  EllipticalROITool,
  CircleROITool,
  RectangleROITool,
  ProbeTool,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  OrientationMarkerTool,
  ScaleOverlayTool,
  ReferenceLinesTool,
  PlanarFreehandContourSegmentationTool,
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import { cornerstoneNiftiImageLoader, init as niftiInit } from '@cornerstonejs/nifti-volume-loader';
import { installSuvProvider } from './suv';

/** Every tool the Tier 1 viewer uses; registered globally once. */
export const ALL_TOOLS = [
  StackScrollTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  CrosshairsTool,
  TrackballRotateTool,
  LengthTool,
  AngleTool,
  CobbAngleTool,
  BidirectionalTool,
  EllipticalROITool,
  CircleROITool,
  RectangleROITool,
  ProbeTool,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  OrientationMarkerTool,
  ScaleOverlayTool,
  ReferenceLinesTool,
  PlanarFreehandContourSegmentationTool,
];

let done: Promise<void> | undefined;

/**
 * Initialise Cornerstone3D core, tools, and the DICOM / NIfTI loaders exactly once.
 * Safe to call from any component; later callers await the same promise.
 */
export function initEngine(): Promise<void> {
  return (done ??= (async () => {
    csInit();
    // Series with irregular slice spacing are shown as stacks, not resampled volumes (see displaySets.ts).
    setConfiguration({ ...getConfiguration(), rendering: { ...getConfiguration().rendering, strictZSpacingForVolumeViewport: true } });
    csToolsInit();
    dicomImageLoaderInit({
      maxWebWorkers: Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2)),
    });
    niftiInit();
    installSuvProvider();
    imageLoader.registerImageLoader('nifti', cornerstoneNiftiImageLoader as Parameters<typeof imageLoader.registerImageLoader>[1]);
    type VolumeLoaderFn = Parameters<typeof volumeLoader.registerVolumeLoader>[1];
    const streaming = cornerstoneStreamingImageVolumeLoader as unknown as VolumeLoaderFn;
    const dynamic = cornerstoneStreamingDynamicImageVolumeLoader as unknown as VolumeLoaderFn;
    volumeLoader.registerUnknownVolumeLoader(streaming);
    volumeLoader.registerVolumeLoader('cornerstoneStreamingImageVolume', streaming);
    volumeLoader.registerVolumeLoader('cornerstoneStreamingDynamicImageVolume', dynamic);
    // Volumes built with createLocalVolume() reference per-slice images that already sit in the cache.
    imageLoader.registerImageLoader('local', ((imageId: string) => {
      const image = cache.getImage(imageId);
      return { promise: image ? Promise.resolve(image) : Promise.reject(new Error(`No cached image for ${imageId}`)) };
    }) as Parameters<typeof imageLoader.registerImageLoader>[1]);
    ALL_TOOLS.forEach((t) => addTool(t));
  })());
}
