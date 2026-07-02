/**
 * LabelLoaderService - Handles loading segmentation label files
 * Supports NIfTI (.nii, .nii.gz) and NRRD (.nrrd) label formats
 */

import { LoaderRegistry } from '../loaders/LoaderRegistry';
import type { LoadedImage } from '../loaders/types';

export interface LoadedLabel {
  labelId: string;
  fileName: string;
  labelData: ArrayBuffer;
  metadata: {
    width: number;
    height: number;
    depth: number;
    dataType: string;
    uniqueLabels: number[];
  };
}

// Default colors for label indices
const DEFAULT_LABEL_COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
  '#ff8000', '#8000ff', '#0080ff', '#ff0080', '#80ff00', '#00ff80',
  '#ff4040', '#40ff40', '#4040ff', '#ffff40', '#ff40ff', '#40ffff',
];

/**
 * Load a label file and extract unique label values
 */
export async function loadLabelFile(file: File): Promise<LoadedLabel> {
  console.log('[LabelLoaderService] Loading label file:', file.name);

  // Use the existing loader registry to parse the file
  const image = await LoaderRegistry.loadFile(file);

  // Extract unique label values from the data
  const uniqueLabels = extractUniqueLabels(image.pixelData, image.metadata.dataType);

  console.log('[LabelLoaderService] Loaded label:', {
    fileName: file.name,
    dimensions: [image.metadata.width, image.metadata.height, image.metadata.depth],
    dataType: image.metadata.dataType,
    uniqueLabels,
  });

  return {
    labelId: `label-${Date.now()}`,
    fileName: file.name,
    labelData: image.pixelData,
    metadata: {
      width: image.metadata.width,
      height: image.metadata.height,
      depth: image.metadata.depth,
      dataType: image.metadata.dataType,
      uniqueLabels,
    },
  };
}

/**
 * Extract unique non-zero label values from the data
 */
function extractUniqueLabels(data: ArrayBuffer, dataType: string): number[] {
  let typedArray: Uint8Array | Int8Array | Uint16Array | Int16Array | Float32Array;

  switch (dataType) {
    case 'uint8':
      typedArray = new Uint8Array(data);
      break;
    case 'int8':
      typedArray = new Int8Array(data);
      break;
    case 'uint16':
      typedArray = new Uint16Array(data);
      break;
    case 'int16':
      typedArray = new Int16Array(data);
      break;
    case 'float32':
      typedArray = new Float32Array(data);
      break;
    default:
      typedArray = new Uint8Array(data);
  }

  // Sample the data to find unique values (full scan can be slow for large volumes)
  const uniqueSet = new Set<number>();
  const step = Math.max(1, Math.floor(typedArray.length / 100000)); // Sample ~100k values max

  for (let i = 0; i < typedArray.length; i += step) {
    const value = Math.round(typedArray[i]);
    if (value !== 0) {
      uniqueSet.add(value);
    }
  }

  // Also check corners and center to catch any missed labels
  const checkIndices = [
    0,
    typedArray.length - 1,
    Math.floor(typedArray.length / 2),
    Math.floor(typedArray.length / 4),
    Math.floor(typedArray.length * 3 / 4),
  ];

  for (const idx of checkIndices) {
    if (idx < typedArray.length) {
      const value = Math.round(typedArray[idx]);
      if (value !== 0) {
        uniqueSet.add(value);
      }
    }
  }

  return Array.from(uniqueSet).sort((a, b) => a - b);
}

/**
 * Generate label info with names and colors for each unique label
 */
export function generateLabelInfo(
  uniqueLabels: number[],
  labelNames?: Record<number, string>
): { index: number; name: string; color: string }[] {
  return uniqueLabels.map((index, i) => ({
    index,
    name: labelNames?.[index] || `Segment ${index}`,
    color: DEFAULT_LABEL_COLORS[(index - 1) % DEFAULT_LABEL_COLORS.length],
  }));
}

/**
 * Validate that label dimensions match image dimensions
 */
export function validateLabelDimensions(
  labelMetadata: LoadedLabel['metadata'],
  imageMetadata: { width: number; height: number; depth: number }
): boolean {
  return (
    labelMetadata.width === imageMetadata.width &&
    labelMetadata.height === imageMetadata.height &&
    labelMetadata.depth === imageMetadata.depth
  );
}

export default {
  loadLabelFile,
  generateLabelInfo,
  validateLabelDimensions,
};
