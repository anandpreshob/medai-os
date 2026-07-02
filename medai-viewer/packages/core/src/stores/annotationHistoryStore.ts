/**
 * Annotation History Store - Undo/Redo State Management
 *
 * Provides slice-level snapshots with pako compression for efficient
 * undo/redo of annotation changes. Tracks changes per slice and supports
 * compressed storage of labelmap data.
 */

import { create } from 'zustand';
import pako from 'pako';

/**
 * A single snapshot of annotation data for a specific slice
 */
export interface SliceSnapshot {
  /** Unique identifier for this snapshot */
  id: string;
  /** Slice index in the volume */
  sliceIndex: number;
  /** Viewport orientation (axial, sagittal, coronal) */
  orientation: 'axial' | 'sagittal' | 'coronal';
  /** Segmentation ID this snapshot belongs to */
  segmentationId: string;
  /** Segment index within the segmentation */
  segmentIndex: number;
  /** Compressed labelmap data using pako (Uint8Array after compression) */
  compressedData: Uint8Array;
  /** Original data type for decompression */
  originalDataType: 'uint8' | 'uint16' | 'float32';
  /** Dimensions of the slice [width, height] */
  dimensions: [number, number];
  /** Timestamp of when this snapshot was created */
  timestamp: number;
  /** Human-readable description of the action */
  actionDescription: string;
}

/**
 * History entry that may contain multiple slice changes
 */
export interface HistoryEntry {
  /** Unique identifier for this history entry */
  id: string;
  /** Snapshots of all slices that were modified */
  sliceSnapshots: SliceSnapshot[];
  /** Timestamp of when this entry was created */
  timestamp: number;
  /** Description of the action (e.g., "Brush stroke", "Eraser", "Fill") */
  actionDescription: string;
}

/**
 * Configuration for the history store
 */
export interface HistoryConfig {
  /** Maximum number of history entries to keep */
  maxHistorySize: number;
  /** Whether to compress snapshots (recommended for large volumes) */
  enableCompression: boolean;
  /** Minimum time between snapshots in ms (debounce rapid changes) */
  debounceMs: number;
}

export interface AnnotationHistoryState {
  /** Stack of past states for undo */
  undoStack: HistoryEntry[];
  /** Stack of future states for redo */
  redoStack: HistoryEntry[];
  /** Current configuration */
  config: HistoryConfig;
  /** Whether history tracking is enabled */
  isEnabled: boolean;
  /** Timestamp of last snapshot (for debouncing) */
  lastSnapshotTime: number;

  // Actions
  /**
   * Push a new snapshot to the history
   * @param sliceData - Raw slice data to snapshot
   * @param metadata - Metadata about the snapshot
   */
  push: (
    sliceData: ArrayBuffer | TypedArray,
    metadata: {
      sliceIndex: number;
      orientation: 'axial' | 'sagittal' | 'coronal';
      segmentationId: string;
      segmentIndex: number;
      dimensions: [number, number];
      dataType: 'uint8' | 'uint16' | 'float32';
      actionDescription: string;
    }
  ) => void;

  /**
   * Push multiple slice snapshots as a single history entry
   */
  pushBatch: (
    snapshots: Array<{
      sliceData: ArrayBuffer | TypedArray;
      sliceIndex: number;
      orientation: 'axial' | 'sagittal' | 'coronal';
      segmentationId: string;
      segmentIndex: number;
      dimensions: [number, number];
      dataType: 'uint8' | 'uint16' | 'float32';
    }>,
    actionDescription: string
  ) => void;

  /**
   * Undo the last action
   * @returns The history entry that was undone, or undefined if nothing to undo
   */
  undo: () => HistoryEntry | undefined;

  /**
   * Redo the last undone action
   * @returns The history entry that was redone, or undefined if nothing to redo
   */
  redo: () => HistoryEntry | undefined;

  /**
   * Check if undo is available
   */
  canUndo: () => boolean;

  /**
   * Check if redo is available
   */
  canRedo: () => boolean;

  /**
   * Clear all history
   */
  clear: () => void;

  /**
   * Clear history for a specific segmentation
   */
  clearForSegmentation: (segmentationId: string) => void;

  /**
   * Update configuration
   */
  setConfig: (config: Partial<HistoryConfig>) => void;

  /**
   * Enable/disable history tracking
   */
  setEnabled: (enabled: boolean) => void;

  /**
   * Get the number of undo steps available
   */
  getUndoCount: () => number;

  /**
   * Get the number of redo steps available
   */
  getRedoCount: () => number;

  /**
   * Decompress a snapshot's data
   */
  decompressSnapshot: (snapshot: SliceSnapshot) => TypedArray;

  /**
   * Reset to initial state
   */
  reset: () => void;
}

type TypedArray = Uint8Array | Uint16Array | Float32Array;

const DEFAULT_CONFIG: HistoryConfig = {
  maxHistorySize: 50,
  enableCompression: true,
  debounceMs: 100,
};

const initialState = {
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
  config: DEFAULT_CONFIG,
  isEnabled: true,
  lastSnapshotTime: 0,
};

/**
 * Generate a unique ID for history entries
 */
function generateId(): string {
  return `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compress data using pako
 */
function compressData(data: ArrayBuffer | TypedArray): Uint8Array {
  const uint8View = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return pako.deflate(uint8View);
}

/**
 * Decompress data using pako
 */
function decompressData(
  compressed: Uint8Array,
  dataType: 'uint8' | 'uint16' | 'float32'
): TypedArray {
  const decompressed = pako.inflate(compressed);

  switch (dataType) {
    case 'uint8':
      return decompressed;
    case 'uint16':
      return new Uint16Array(
        decompressed.buffer,
        decompressed.byteOffset,
        decompressed.byteLength / 2
      );
    case 'float32':
      return new Float32Array(
        decompressed.buffer,
        decompressed.byteOffset,
        decompressed.byteLength / 4
      );
    default:
      return decompressed;
  }
}

export const useAnnotationHistoryStore = create<AnnotationHistoryState>((set, get) => ({
  ...initialState,

  push: (sliceData, metadata) => {
    const state = get();

    if (!state.isEnabled) {
      return;
    }

    // Debounce rapid changes
    const now = Date.now();
    if (now - state.lastSnapshotTime < state.config.debounceMs) {
      return;
    }

    const compressedData = state.config.enableCompression
      ? compressData(sliceData)
      : sliceData instanceof ArrayBuffer
        ? new Uint8Array(sliceData)
        : new Uint8Array(sliceData.buffer, sliceData.byteOffset, sliceData.byteLength);

    const snapshot: SliceSnapshot = {
      id: generateId(),
      sliceIndex: metadata.sliceIndex,
      orientation: metadata.orientation,
      segmentationId: metadata.segmentationId,
      segmentIndex: metadata.segmentIndex,
      compressedData: compressedData as Uint8Array,
      originalDataType: metadata.dataType,
      dimensions: metadata.dimensions,
      timestamp: now,
      actionDescription: metadata.actionDescription,
    };

    const entry: HistoryEntry = {
      id: generateId(),
      sliceSnapshots: [snapshot],
      timestamp: now,
      actionDescription: metadata.actionDescription,
    };

    set((s) => {
      // Trim undo stack if needed
      let newUndoStack = [...s.undoStack, entry];
      if (newUndoStack.length > s.config.maxHistorySize) {
        newUndoStack = newUndoStack.slice(-s.config.maxHistorySize);
      }

      return {
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new action
        lastSnapshotTime: now,
      };
    });

    console.log(
      '[AnnotationHistory] Pushed snapshot:',
      metadata.actionDescription,
      'Undo stack size:',
      get().undoStack.length
    );
  },

  pushBatch: (snapshots, actionDescription) => {
    const state = get();

    if (!state.isEnabled || snapshots.length === 0) {
      return;
    }

    const now = Date.now();

    const sliceSnapshots: SliceSnapshot[] = snapshots.map((s) => {
      const compressedData = state.config.enableCompression
        ? compressData(s.sliceData)
        : s.sliceData instanceof ArrayBuffer
          ? new Uint8Array(s.sliceData)
          : new Uint8Array(s.sliceData.buffer, s.sliceData.byteOffset, s.sliceData.byteLength);

      return {
        id: generateId(),
        sliceIndex: s.sliceIndex,
        orientation: s.orientation,
        segmentationId: s.segmentationId,
        segmentIndex: s.segmentIndex,
        compressedData: compressedData as Uint8Array,
        originalDataType: s.dataType,
        dimensions: s.dimensions,
        timestamp: now,
        actionDescription,
      };
    });

    const entry: HistoryEntry = {
      id: generateId(),
      sliceSnapshots,
      timestamp: now,
      actionDescription,
    };

    set((s) => {
      let newUndoStack = [...s.undoStack, entry];
      if (newUndoStack.length > s.config.maxHistorySize) {
        newUndoStack = newUndoStack.slice(-s.config.maxHistorySize);
      }

      return {
        undoStack: newUndoStack,
        redoStack: [],
        lastSnapshotTime: now,
      };
    });

    console.log(
      '[AnnotationHistory] Pushed batch:',
      actionDescription,
      'Slices:',
      snapshots.length
    );
  },

  undo: () => {
    const state = get();

    if (state.undoStack.length === 0) {
      console.log('[AnnotationHistory] Nothing to undo');
      return undefined;
    }

    const entry = state.undoStack[state.undoStack.length - 1];

    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, entry],
    }));

    console.log('[AnnotationHistory] Undo:', entry.actionDescription);
    return entry;
  },

  redo: () => {
    const state = get();

    if (state.redoStack.length === 0) {
      console.log('[AnnotationHistory] Nothing to redo');
      return undefined;
    }

    const entry = state.redoStack[state.redoStack.length - 1];

    set((s) => ({
      undoStack: [...s.undoStack, entry],
      redoStack: s.redoStack.slice(0, -1),
    }));

    console.log('[AnnotationHistory] Redo:', entry.actionDescription);
    return entry;
  },

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,

  clear: () => {
    set({
      undoStack: [],
      redoStack: [],
    });
    console.log('[AnnotationHistory] History cleared');
  },

  clearForSegmentation: (segmentationId: string) => {
    set((s) => ({
      undoStack: s.undoStack.filter(
        (entry) => !entry.sliceSnapshots.some((snap) => snap.segmentationId === segmentationId)
      ),
      redoStack: s.redoStack.filter(
        (entry) => !entry.sliceSnapshots.some((snap) => snap.segmentationId === segmentationId)
      ),
    }));
    console.log('[AnnotationHistory] Cleared history for segmentation:', segmentationId);
  },

  setConfig: (config: Partial<HistoryConfig>) => {
    set((s) => ({
      config: { ...s.config, ...config },
    }));
  },

  setEnabled: (enabled: boolean) => {
    set({ isEnabled: enabled });
    console.log('[AnnotationHistory] History tracking:', enabled ? 'enabled' : 'disabled');
  },

  getUndoCount: () => get().undoStack.length,

  getRedoCount: () => get().redoStack.length,

  decompressSnapshot: (snapshot: SliceSnapshot): TypedArray => {
    return decompressData(snapshot.compressedData, snapshot.originalDataType);
  },

  reset: () => {
    set(initialState);
    console.log('[AnnotationHistory] Store reset');
  },
}));

export default useAnnotationHistoryStore;
