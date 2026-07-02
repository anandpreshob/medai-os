/**
 * SegmentationOverlayService - Manages segmentation overlays in Cornerstone3D viewports
 * Creates labelmap volumes from inference results and displays them as colored overlays.
 */

export interface SegmentLabel {
  index: number;
  name: string;
  color: string;
}

export interface CreateOverlayOptions {
  segmentationId: string;
  volumeId: string;
  labelData: ArrayBuffer;
  labels: SegmentLabel[];
  referenceVolumeId: string;
  toolGroupId: string;
}

export interface OverlayResult {
  segmentationId: string;
  segmentationRepresentationUID: string;
}

// Convert hex color to RGBA array
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
 * Create a segmentation overlay from inference mask data
 * This function interfaces with Cornerstone3D segmentation module
 */
export async function createSegmentationOverlay(
  cornerstoneTools: any,
  cornerstone3D: any,
  options: CreateOverlayOptions
): Promise<OverlayResult> {
  const {
    segmentationId,
    volumeId,
    labelData,
    labels,
    referenceVolumeId,
    toolGroupId,
  } = options;

  const { cache, volumeLoader, Enums } = cornerstone3D;
  const { segmentation } = cornerstoneTools;

  console.log('[SegmentationOverlayService] Creating overlay:', {
    segmentationId,
    volumeId,
    labelDataSize: labelData.byteLength,
    labelCount: labels.length,
    referenceVolumeId,
    toolGroupId,
  });

  // Get reference volume for dimensions
  const referenceVolume = cache.getVolume(referenceVolumeId);
  if (!referenceVolume) {
    throw new Error(`Reference volume not found: ${referenceVolumeId}`);
  }

  const { dimensions, spacing, origin, direction } = referenceVolume;

  // Parse the label data - could be NRRD or raw buffer
  // For now, assume it's raw uint8/uint16 label data
  let scalarData: Uint8Array | Uint16Array;

  // Try to detect if it's NRRD by checking magic bytes
  const headerBytes = new Uint8Array(labelData.slice(0, 4));
  const isNrrd = String.fromCharCode(...headerBytes).startsWith('NRRD');

  if (isNrrd) {
    // Parse NRRD header to find data offset
    scalarData = parseNrrdLabelData(labelData, dimensions);
  } else {
    // Assume raw label data
    const expectedSize = dimensions[0] * dimensions[1] * dimensions[2];
    if (labelData.byteLength === expectedSize) {
      scalarData = new Uint8Array(labelData);
    } else if (labelData.byteLength === expectedSize * 2) {
      scalarData = new Uint16Array(labelData);
    } else {
      console.warn('[SegmentationOverlayService] Unexpected label data size:', labelData.byteLength, 'expected:', expectedSize);
      scalarData = new Uint8Array(labelData);
    }
  }

  console.log('[SegmentationOverlayService] Parsed label data:', {
    type: scalarData.constructor.name,
    length: scalarData.length,
    uniqueValues: [...new Set(Array.from(scalarData.slice(0, 10000)))].sort((a, b) => a - b),
  });

  // Create labelmap volume
  const labelmapVolume = volumeLoader.createLocalVolume(
    {
      scalarData: scalarData,
      metadata: {
        BitsAllocated: scalarData instanceof Uint16Array ? 16 : 8,
        BitsStored: scalarData instanceof Uint16Array ? 16 : 8,
        SamplesPerPixel: 1,
        HighBit: scalarData instanceof Uint16Array ? 15 : 7,
        PixelRepresentation: 0,
        PhotometricInterpretation: 'MONOCHROME2',
        Columns: dimensions[0],
        Rows: dimensions[1],
      },
      dimensions: dimensions,
      spacing: spacing,
      origin: origin,
      direction: direction,
    },
    volumeId,
    false
  );

  console.log('[SegmentationOverlayService] Created labelmap volume:', volumeId);

  // Create color LUT for segments
  const colorLUT: [number, number, number, number][] = new Array(256).fill([0, 0, 0, 0]);

  // Set colors for each label
  labels.forEach((label) => {
    if (label.index >= 0 && label.index < 256) {
      colorLUT[label.index] = hexToRgba(label.color, 180); // 180 alpha for transparency
    }
  });

  // Add segmentation to Cornerstone state
  segmentation.state.addSegmentation({
    segmentationId: segmentationId,
    representation: {
      type: Enums.SegmentationRepresentations?.Labelmap || 'LABELMAP',
      data: {
        volumeId: volumeId,
      },
    },
  });

  console.log('[SegmentationOverlayService] Added segmentation to state:', segmentationId);

  // Add color LUT
  const colorLUTIndex = segmentation.state.getNextColorLUTIndex();
  segmentation.state.addColorLUT(colorLUT, colorLUTIndex);

  // Add segmentation representation to tool group
  const segmentationRepresentationUIDs = await segmentation.addSegmentationRepresentations(
    toolGroupId,
    [
      {
        segmentationId: segmentationId,
        type: Enums.SegmentationRepresentations?.Labelmap || 'LABELMAP',
        options: {
          colorLUTIndex: colorLUTIndex,
        },
      },
    ]
  );

  const segmentationRepresentationUID = segmentationRepresentationUIDs[0];

  console.log('[SegmentationOverlayService] Added representation:', segmentationRepresentationUID);

  return {
    segmentationId,
    segmentationRepresentationUID,
  };
}

/**
 * Parse NRRD format to extract raw label data
 */
function parseNrrdLabelData(
  buffer: ArrayBuffer,
  expectedDimensions: [number, number, number]
): Uint8Array | Uint16Array {
  const uint8View = new Uint8Array(buffer);
  const text = new TextDecoder('utf-8').decode(uint8View);

  // Find end of header (empty line)
  let dataOffset = 0;
  const lines = text.split('\n');
  let byteCount = 0;
  let dataType = 'uint8';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    byteCount += lines[i].length + 1; // +1 for newline

    if (line === '') {
      dataOffset = byteCount;
      break;
    }

    // Parse type info
    if (line.startsWith('type:')) {
      const typeStr = line.split(':')[1].trim().toLowerCase();
      if (typeStr.includes('uint16') || typeStr.includes('unsigned short')) {
        dataType = 'uint16';
      } else if (typeStr.includes('int16') || typeStr.includes('short')) {
        dataType = 'int16';
      }
    }
  }

  const expectedSize = expectedDimensions[0] * expectedDimensions[1] * expectedDimensions[2];
  const dataBuffer = buffer.slice(dataOffset);

  if (dataType === 'uint16' || dataType === 'int16') {
    return new Uint16Array(dataBuffer.slice(0, expectedSize * 2));
  }

  return new Uint8Array(dataBuffer.slice(0, expectedSize));
}

/**
 * Remove a segmentation overlay
 */
export function removeSegmentationOverlay(
  cornerstoneTools: any,
  toolGroupId: string,
  segmentationId: string
): void {
  const { segmentation } = cornerstoneTools;

  // Find and remove representation
  const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
  const rep = representations?.find(
    (r: any) => r.segmentationId === segmentationId
  );

  if (rep) {
    segmentation.state.removeSegmentationRepresentation(
      toolGroupId,
      rep.segmentationRepresentationUID
    );
  }

  // Remove segmentation
  segmentation.state.removeSegmentation(segmentationId);

  console.log('[SegmentationOverlayService] Removed overlay:', segmentationId);
}

/**
 * Update segment visibility
 */
export function setSegmentVisibility(
  cornerstoneTools: any,
  segmentationId: string,
  segmentIndex: number,
  visible: boolean
): void {
  const { segmentation } = cornerstoneTools;

  const toolGroupIds = segmentation.state.getToolGroupIdsWithSegmentation(segmentationId);

  toolGroupIds.forEach((toolGroupId: string) => {
    const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    const rep = representations?.find(
      (r: any) => r.segmentationId === segmentationId
    );

    if (rep) {
      segmentation.config.visibility.setSegmentVisibility(
        toolGroupId,
        rep.segmentationRepresentationUID,
        segmentIndex,
        visible
      );
    }
  });
}

/**
 * Update segment color
 */
export function setSegmentColor(
  cornerstoneTools: any,
  segmentationId: string,
  segmentIndex: number,
  color: string
): void {
  const { segmentation } = cornerstoneTools;

  const rgba = hexToRgba(color, 180);

  const toolGroupIds = segmentation.state.getToolGroupIdsWithSegmentation(segmentationId);

  toolGroupIds.forEach((toolGroupId: string) => {
    const representations = segmentation.state.getSegmentationRepresentations(toolGroupId);
    const rep = representations?.find(
      (r: any) => r.segmentationId === segmentationId
    );

    if (rep) {
      segmentation.config.color.setSegmentColor(
        toolGroupId,
        rep.segmentationRepresentationUID,
        segmentIndex,
        rgba
      );
    }
  });
}

export default {
  createSegmentationOverlay,
  removeSegmentationOverlay,
  setSegmentVisibility,
  setSegmentColor,
};
