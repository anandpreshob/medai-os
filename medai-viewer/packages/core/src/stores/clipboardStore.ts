/**
 * Clipboard Store - Copy/Paste Annotations
 *
 * Provides copy/paste functionality for annotations across slices and studies.
 * Supports copying segmentation masks, polygon annotations, and measurement annotations.
 */

import { create } from 'zustand';
import pako from 'pako';

/**
 * Types of content that can be copied
 */
export type ClipboardContentType =
  | 'segmentation_mask'
  | 'polygon_annotation'
  | 'polyline_annotation'
  | 'measurement_annotation'
  | 'roi_annotation';

/**
 * Base interface for clipboard content
 */
export interface ClipboardContentBase {
  /** Unique identifier for this clipboard entry */
  id: string;
  /** Type of content */
  type: ClipboardContentType;
  /** Timestamp when copied */
  copiedAt: number;
  /** Source image/study information */
  sourceInfo: {
    imageId?: string;
    studyInstanceUID?: string;
    seriesInstanceUID?: string;
    sliceIndex?: number;
    orientation?: 'axial' | 'sagittal' | 'coronal';
  };
  /** Human-readable label */
  label?: string;
}

/**
 * Segmentation mask clipboard content
 */
export interface SegmentationMaskContent extends ClipboardContentBase {
  type: 'segmentation_mask';
  /** Compressed mask data */
  compressedData: Uint8Array;
  /** Original data type */
  dataType: 'uint8' | 'uint16';
  /** Dimensions of the mask [width, height] */
  dimensions: [number, number];
  /** Segment index from source */
  segmentIndex: number;
  /** Color of the segment */
  color: string;
  /** Spacing information for scaling */
  spacing?: [number, number];
}

/**
 * Polygon annotation clipboard content
 */
export interface PolygonAnnotationContent extends ClipboardContentBase {
  type: 'polygon_annotation';
  /** Points in world coordinates [[x,y,z], ...] */
  worldPoints: [number, number, number][];
  /** Points in image coordinates [[x,y], ...] for 2D */
  imagePoints?: [number, number][];
  /** Whether the polygon is closed */
  isClosed: boolean;
  /** Fill color */
  fillColor?: string;
  /** Stroke color */
  strokeColor?: string;
  /** Stroke width */
  strokeWidth?: number;
}

/**
 * Polyline annotation clipboard content
 */
export interface PolylineAnnotationContent extends ClipboardContentBase {
  type: 'polyline_annotation';
  /** Points in world coordinates */
  worldPoints: [number, number, number][];
  /** Points in image coordinates */
  imagePoints?: [number, number][];
  /** Stroke color */
  strokeColor?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Whether to show length measurement */
  showMeasurement?: boolean;
  /** Total length in mm */
  lengthMm?: number;
}

/**
 * Measurement annotation clipboard content
 */
export interface MeasurementAnnotationContent extends ClipboardContentBase {
  type: 'measurement_annotation';
  /** Start point in world coordinates */
  startPoint: [number, number, number];
  /** End point in world coordinates */
  endPoint: [number, number, number];
  /** Measured length in mm */
  lengthMm: number;
  /** Measurement unit */
  unit: 'mm' | 'cm' | 'in';
}

/**
 * ROI annotation clipboard content
 */
export interface ROIAnnotationContent extends ClipboardContentBase {
  type: 'roi_annotation';
  /** ROI bounds in world coordinates [minX, minY, minZ, maxX, maxY, maxZ] */
  bounds: [number, number, number, number, number, number];
  /** ROI type */
  roiType: 'rectangle' | 'ellipse' | 'freehand';
  /** Points for freehand ROI */
  points?: [number, number, number][];
  /** Statistics computed from the ROI */
  statistics?: {
    mean?: number;
    stdDev?: number;
    min?: number;
    max?: number;
    area?: number;
    volume?: number;
  };
}

/**
 * Union type of all clipboard content types
 */
export type ClipboardContent =
  | SegmentationMaskContent
  | PolygonAnnotationContent
  | PolylineAnnotationContent
  | MeasurementAnnotationContent
  | ROIAnnotationContent;

/**
 * Paste options for customizing paste behavior
 */
export interface PasteOptions {
  /** Target slice index (for masks) */
  targetSliceIndex?: number;
  /** Target orientation */
  targetOrientation?: 'axial' | 'sagittal' | 'coronal';
  /** Offset to apply to pasted content [x, y, z] */
  offset?: [number, number, number];
  /** Scale factor to apply */
  scale?: number;
  /** Whether to merge with existing content or replace */
  mergeMode?: 'replace' | 'merge' | 'subtract';
  /** Target segment index for segmentation masks */
  targetSegmentIndex?: number;
}

export interface ClipboardState {
  /** Current clipboard content */
  content: ClipboardContent | null;
  /** History of copied items (limited) */
  history: ClipboardContent[];
  /** Maximum history size */
  maxHistorySize: number;

  // Actions
  /**
   * Copy segmentation mask to clipboard
   */
  copySegmentationMask: (
    maskData: ArrayBuffer | Uint8Array | Uint16Array,
    metadata: {
      dimensions: [number, number];
      dataType: 'uint8' | 'uint16';
      segmentIndex: number;
      color: string;
      sliceIndex: number;
      orientation: 'axial' | 'sagittal' | 'coronal';
      imageId?: string;
      spacing?: [number, number];
      label?: string;
    }
  ) => void;

  /**
   * Copy polygon annotation to clipboard
   */
  copyPolygonAnnotation: (
    points: [number, number, number][],
    metadata: {
      isClosed: boolean;
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
      sliceIndex?: number;
      orientation?: 'axial' | 'sagittal' | 'coronal';
      imageId?: string;
      label?: string;
    }
  ) => void;

  /**
   * Copy polyline annotation to clipboard
   */
  copyPolylineAnnotation: (
    points: [number, number, number][],
    metadata: {
      strokeColor?: string;
      strokeWidth?: number;
      showMeasurement?: boolean;
      lengthMm?: number;
      sliceIndex?: number;
      orientation?: 'axial' | 'sagittal' | 'coronal';
      imageId?: string;
      label?: string;
    }
  ) => void;

  /**
   * Copy measurement annotation to clipboard
   */
  copyMeasurement: (
    startPoint: [number, number, number],
    endPoint: [number, number, number],
    lengthMm: number,
    metadata?: {
      unit?: 'mm' | 'cm' | 'in';
      imageId?: string;
      sliceIndex?: number;
      label?: string;
    }
  ) => void;

  /**
   * Copy ROI annotation to clipboard
   */
  copyROI: (
    bounds: [number, number, number, number, number, number],
    metadata: {
      roiType: 'rectangle' | 'ellipse' | 'freehand';
      points?: [number, number, number][];
      statistics?: ROIAnnotationContent['statistics'];
      imageId?: string;
      sliceIndex?: number;
      label?: string;
    }
  ) => void;

  /**
   * Get current clipboard content
   */
  getContent: () => ClipboardContent | null;

  /**
   * Check if clipboard has content
   */
  hasContent: () => boolean;

  /**
   * Check if clipboard has specific content type
   */
  hasContentType: (type: ClipboardContentType) => boolean;

  /**
   * Get clipboard content if it matches the specified type
   */
  getContentOfType: <T extends ClipboardContent>(type: ClipboardContentType) => T | null;

  /**
   * Decompress segmentation mask data
   */
  decompressMaskData: (content: SegmentationMaskContent) => Uint8Array | Uint16Array;

  /**
   * Clear clipboard
   */
  clear: () => void;

  /**
   * Clear clipboard history
   */
  clearHistory: () => void;

  /**
   * Get clipboard history
   */
  getHistory: () => ClipboardContent[];

  /**
   * Restore content from history
   */
  restoreFromHistory: (id: string) => boolean;

  /**
   * Set maximum history size
   */
  setMaxHistorySize: (size: number) => void;

  /**
   * Reset store to initial state
   */
  reset: () => void;
}

const initialState = {
  content: null as ClipboardContent | null,
  history: [] as ClipboardContent[],
  maxHistorySize: 10,
};

/**
 * Generate a unique ID for clipboard entries
 */
function generateId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compress data using pako
 */
function compressData(data: ArrayBuffer | Uint8Array | Uint16Array): Uint8Array {
  const uint8View = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : data instanceof Uint16Array
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : data;
  return pako.deflate(uint8View);
}

/**
 * Decompress data using pako
 */
function decompressData(compressed: Uint8Array, dataType: 'uint8' | 'uint16'): Uint8Array | Uint16Array {
  const decompressed = pako.inflate(compressed);

  if (dataType === 'uint16') {
    return new Uint16Array(
      decompressed.buffer,
      decompressed.byteOffset,
      decompressed.byteLength / 2
    );
  }

  return decompressed;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  ...initialState,

  copySegmentationMask: (maskData, metadata) => {
    const compressedData = compressData(maskData);

    const content: SegmentationMaskContent = {
      id: generateId(),
      type: 'segmentation_mask',
      copiedAt: Date.now(),
      sourceInfo: {
        imageId: metadata.imageId,
        sliceIndex: metadata.sliceIndex,
        orientation: metadata.orientation,
      },
      compressedData,
      dataType: metadata.dataType,
      dimensions: metadata.dimensions,
      segmentIndex: metadata.segmentIndex,
      color: metadata.color,
      spacing: metadata.spacing,
      label: metadata.label,
    };

    set((s) => {
      const newHistory = [content, ...s.history].slice(0, s.maxHistorySize);
      return {
        content,
        history: newHistory,
      };
    });

    console.log('[Clipboard] Copied segmentation mask:', metadata.dimensions);
  },

  copyPolygonAnnotation: (points, metadata) => {
    const content: PolygonAnnotationContent = {
      id: generateId(),
      type: 'polygon_annotation',
      copiedAt: Date.now(),
      sourceInfo: {
        imageId: metadata.imageId,
        sliceIndex: metadata.sliceIndex,
        orientation: metadata.orientation,
      },
      worldPoints: points,
      isClosed: metadata.isClosed,
      fillColor: metadata.fillColor,
      strokeColor: metadata.strokeColor,
      strokeWidth: metadata.strokeWidth,
      label: metadata.label,
    };

    set((s) => {
      const newHistory = [content, ...s.history].slice(0, s.maxHistorySize);
      return {
        content,
        history: newHistory,
      };
    });

    console.log('[Clipboard] Copied polygon annotation:', points.length, 'points');
  },

  copyPolylineAnnotation: (points, metadata) => {
    const content: PolylineAnnotationContent = {
      id: generateId(),
      type: 'polyline_annotation',
      copiedAt: Date.now(),
      sourceInfo: {
        imageId: metadata.imageId,
        sliceIndex: metadata.sliceIndex,
        orientation: metadata.orientation,
      },
      worldPoints: points,
      strokeColor: metadata.strokeColor,
      strokeWidth: metadata.strokeWidth,
      showMeasurement: metadata.showMeasurement,
      lengthMm: metadata.lengthMm,
      label: metadata.label,
    };

    set((s) => {
      const newHistory = [content, ...s.history].slice(0, s.maxHistorySize);
      return {
        content,
        history: newHistory,
      };
    });

    console.log('[Clipboard] Copied polyline annotation:', points.length, 'points');
  },

  copyMeasurement: (startPoint, endPoint, lengthMm, metadata = {}) => {
    const content: MeasurementAnnotationContent = {
      id: generateId(),
      type: 'measurement_annotation',
      copiedAt: Date.now(),
      sourceInfo: {
        imageId: metadata.imageId,
        sliceIndex: metadata.sliceIndex,
      },
      startPoint,
      endPoint,
      lengthMm,
      unit: metadata.unit || 'mm',
      label: metadata.label,
    };

    set((s) => {
      const newHistory = [content, ...s.history].slice(0, s.maxHistorySize);
      return {
        content,
        history: newHistory,
      };
    });

    console.log('[Clipboard] Copied measurement:', lengthMm, 'mm');
  },

  copyROI: (bounds, metadata) => {
    const content: ROIAnnotationContent = {
      id: generateId(),
      type: 'roi_annotation',
      copiedAt: Date.now(),
      sourceInfo: {
        imageId: metadata.imageId,
        sliceIndex: metadata.sliceIndex,
      },
      bounds,
      roiType: metadata.roiType,
      points: metadata.points,
      statistics: metadata.statistics,
      label: metadata.label,
    };

    set((s) => {
      const newHistory = [content, ...s.history].slice(0, s.maxHistorySize);
      return {
        content,
        history: newHistory,
      };
    });

    console.log('[Clipboard] Copied ROI:', metadata.roiType);
  },

  getContent: () => get().content,

  hasContent: () => get().content !== null,

  hasContentType: (type: ClipboardContentType) => {
    const content = get().content;
    return content !== null && content.type === type;
  },

  getContentOfType: <T extends ClipboardContent>(type: ClipboardContentType): T | null => {
    const content = get().content;
    if (content && content.type === type) {
      return content as T;
    }
    return null;
  },

  decompressMaskData: (content: SegmentationMaskContent) => {
    return decompressData(content.compressedData, content.dataType);
  },

  clear: () => {
    set({ content: null });
    console.log('[Clipboard] Cleared');
  },

  clearHistory: () => {
    set({ history: [] });
    console.log('[Clipboard] History cleared');
  },

  getHistory: () => get().history,

  restoreFromHistory: (id: string) => {
    const state = get();
    const item = state.history.find((h) => h.id === id);

    if (item) {
      set({ content: item });
      console.log('[Clipboard] Restored from history:', id);
      return true;
    }

    return false;
  },

  setMaxHistorySize: (size: number) => {
    set((s) => ({
      maxHistorySize: size,
      history: s.history.slice(0, size),
    }));
  },

  reset: () => {
    set(initialState);
    console.log('[Clipboard] Store reset');
  },
}));

export default useClipboardStore;
