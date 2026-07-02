import { create } from 'zustand';
import * as PersistenceService from '../services/PersistenceService';
import type { PersistedSegmentation } from '../services/PersistenceService';
import { useAnnotationHistoryStore } from './annotationHistoryStore';

/**
 * Review status for segmentation (draft can be edited, final is locked)
 */
export type SegmentationStatus = 'draft' | 'final';

export interface Segment {
  segmentIndex: number;
  label: string;
  color: string;
  visible: boolean;
  locked: boolean;
  volumeId?: string;                    // Each segment has its own binary mask volume (for multi-layer mode)
  cornerstoneSegmentationId?: string;   // Cornerstone's segmentation ID for this segment (for multi-layer mode)
}

export interface Segmentation {
  id: string;
  label: string;
  referenceVolumeId?: string;  // The image volume these segments relate to (multi-layer mode)
  volumeId?: string;           // Legacy: shared labelmap volume (single-layer mode, deprecated)
  segments: Segment[];
  status: SegmentationStatus;  // Draft segmentations can be edited; Final segmentations are locked
}

export interface SegmentationState {
  // Segmentations
  segmentations: Segmentation[];
  activeSegmentationId: string | null;
  activeSegmentIndex: number | null;

  // Actions
  addSegmentation: (segmentation: Segmentation) => void;
  removeSegmentation: (segmentationId: string) => void;
  setActiveSegmentation: (segmentationId: string) => void;
  addSegment: (segmentationId: string, segment: Segment) => void;
  updateSegment: (segmentationId: string, segmentIndex: number, updates: Partial<Segment>) => void;
  removeSegment: (segmentationId: string, segmentIndex: number) => void;
  setActiveSegmentIndex: (segmentIndex: number | null) => void;
  toggleSegmentVisibility: (segmentationId: string, segmentIndex: number) => void;
  toggleSegmentLock: (segmentationId: string, segmentIndex: number) => void;
  setSegmentationStatus: (segmentationId: string, status: SegmentationStatus) => void;
  getSegmentationStatus: (segmentationId: string) => SegmentationStatus;
  isSegmentationEditable: (segmentationId: string) => boolean;
  getActiveSegmentation: () => Segmentation | undefined;
  getSegmentVolume: (segmentationId: string, segmentIndex: number) => { volumeId: string; cornerstoneSegmentationId: string } | undefined;
  reset: () => void;

  // Persistence actions
  persistSegmentation: (segmentationId: string, imageId: string, labelmapData: PersistedSegmentation['labelmapData']) => Promise<void>;
  deletePersistedSegmentation: (segmentationId: string) => Promise<void>;
  getPersistedSegmentationsByImageId: (imageId: string) => Promise<PersistedSegmentation[]>;

  // History tracking integration (Module 1: Enhanced Annotation Tools)
  pushAnnotationHistory: (
    sliceData: ArrayBuffer | Uint8Array,
    metadata: {
      sliceIndex: number;
      orientation: 'axial' | 'sagittal' | 'coronal';
      dimensions: [number, number];
      actionDescription: string;
    }
  ) => void;
  undoAnnotation: () => void;
  redoAnnotation: () => void;
  canUndoAnnotation: () => boolean;
  canRedoAnnotation: () => boolean;
  clearAnnotationHistory: () => void;
}

const initialState = {
  segmentations: [] as Segmentation[],
  activeSegmentationId: null as string | null,
  activeSegmentIndex: null as number | null,
};

export const useSegmentationStore = create<SegmentationState>((set, get) => ({
  ...initialState,

  addSegmentation: (segmentation: Segmentation) => {
    // Ensure new segmentations have a status (default to draft)
    const segWithStatus = {
      ...segmentation,
      status: segmentation.status || 'draft',
    };
    set((state) => ({
      segmentations: [...state.segmentations, segWithStatus],
      activeSegmentationId: state.activeSegmentationId || segmentation.id,
    }));
  },

  removeSegmentation: (segmentationId: string) => {
    set((state) => {
      const newSegmentations = state.segmentations.filter((s) => s.id !== segmentationId);
      return {
        segmentations: newSegmentations,
        activeSegmentationId:
          state.activeSegmentationId === segmentationId
            ? newSegmentations.length > 0
              ? newSegmentations[0].id
              : null
            : state.activeSegmentationId,
      };
    });
  },

  setActiveSegmentation: (segmentationId: string) => {
    set({ activeSegmentationId: segmentationId });
  },

  addSegment: (segmentationId: string, segment: Segment) => {
    set((state) => {
      const segmentations = state.segmentations.map((seg) => {
        if (seg.id === segmentationId) {
          return {
            ...seg,
            segments: [...seg.segments, segment],
          };
        }
        return seg;
      });

      // Set active segment index if this is the first segment
      const currentSeg = segmentations.find((s) => s.id === segmentationId);
      const activeSegmentIndex =
        state.activeSegmentIndex === null && currentSeg?.segments.length === 1
          ? segment.segmentIndex
          : state.activeSegmentIndex;

      return { segmentations, activeSegmentIndex };
    });
  },

  updateSegment: (segmentationId: string, segmentIndex: number, updates: Partial<Segment>) => {
    set((state) => ({
      segmentations: state.segmentations.map((seg) => {
        if (seg.id === segmentationId) {
          return {
            ...seg,
            segments: seg.segments.map((s) =>
              s.segmentIndex === segmentIndex ? { ...s, ...updates } : s
            ),
          };
        }
        return seg;
      }),
    }));
  },

  removeSegment: (segmentationId: string, segmentIndex: number) => {
    set((state) => {
      const segmentations = state.segmentations.map((seg) => {
        if (seg.id === segmentationId) {
          return {
            ...seg,
            segments: seg.segments.filter((s) => s.segmentIndex !== segmentIndex),
          };
        }
        return seg;
      });

      // Clear active segment index if removed segment was active
      const activeSegmentIndex =
        state.activeSegmentIndex === segmentIndex ? null : state.activeSegmentIndex;

      return { segmentations, activeSegmentIndex };
    });
  },

  setActiveSegmentIndex: (segmentIndex: number | null) => {
    set({ activeSegmentIndex: segmentIndex });
  },

  toggleSegmentVisibility: (segmentationId: string, segmentIndex: number) => {
    set((state) => ({
      segmentations: state.segmentations.map((seg) => {
        if (seg.id === segmentationId) {
          return {
            ...seg,
            segments: seg.segments.map((s) =>
              s.segmentIndex === segmentIndex ? { ...s, visible: !s.visible } : s
            ),
          };
        }
        return seg;
      }),
    }));
  },

  toggleSegmentLock: (segmentationId: string, segmentIndex: number) => {
    set((state) => ({
      segmentations: state.segmentations.map((seg) => {
        if (seg.id === segmentationId) {
          return {
            ...seg,
            segments: seg.segments.map((s) =>
              s.segmentIndex === segmentIndex ? { ...s, locked: !s.locked } : s
            ),
          };
        }
        return seg;
      }),
    }));
  },

  setSegmentationStatus: (segmentationId: string, status: SegmentationStatus) => {
    set((state) => ({
      segmentations: state.segmentations.map((seg) => {
        if (seg.id === segmentationId) {
          return { ...seg, status };
        }
        return seg;
      }),
    }));
    console.log('[SegmentationStore] Status updated:', segmentationId, status);
  },

  getSegmentationStatus: (segmentationId: string) => {
    const state = get();
    const segmentation = state.segmentations.find((s) => s.id === segmentationId);
    return segmentation?.status || 'draft';
  },

  isSegmentationEditable: (segmentationId: string) => {
    const state = get();
    const segmentation = state.segmentations.find((s) => s.id === segmentationId);
    // Draft segmentations are editable; Final segmentations are locked
    return segmentation?.status !== 'final';
  },

  getActiveSegmentation: () => {
    const state = get();
    return state.segmentations.find((s) => s.id === state.activeSegmentationId);
  },

  getSegmentVolume: (segmentationId: string, segmentIndex: number) => {
    const state = get();
    const segmentation = state.segmentations.find((s) => s.id === segmentationId);
    if (!segmentation) return undefined;
    const segment = segmentation.segments.find((s) => s.segmentIndex === segmentIndex);
    if (!segment || !segment.volumeId || !segment.cornerstoneSegmentationId) return undefined;
    return {
      volumeId: segment.volumeId,
      cornerstoneSegmentationId: segment.cornerstoneSegmentationId,
    };
  },

  reset: () => {
    set(initialState);
  },

  // Persistence actions
  persistSegmentation: async (segmentationId: string, imageId: string, labelmapData: PersistedSegmentation['labelmapData']) => {
    const state = get();
    const segmentation = state.segmentations.find(s => s.id === segmentationId);
    if (!segmentation) {
      console.error('[SegmentationStore] Cannot persist: segmentation not found:', segmentationId);
      return;
    }

    try {
      const persistedSegmentation: PersistedSegmentation = {
        id: segmentation.id,
        imageId,
        label: segmentation.label,
        segments: segmentation.segments.map(seg => ({
          segmentIndex: seg.segmentIndex,
          label: seg.label,
          color: seg.color,
          visible: seg.visible,
          locked: seg.locked,
        })),
        labelmapData,
        timestamp: Date.now(),
      };

      await PersistenceService.saveSegmentation(persistedSegmentation);
      console.log('[SegmentationStore] Segmentation persisted:', segmentationId);
    } catch (err) {
      console.error('[SegmentationStore] Failed to persist segmentation:', err);
    }
  },

  deletePersistedSegmentation: async (segmentationId: string) => {
    try {
      await PersistenceService.deleteSegmentation(segmentationId);
      console.log('[SegmentationStore] Persisted segmentation deleted:', segmentationId);
    } catch (err) {
      console.error('[SegmentationStore] Failed to delete persisted segmentation:', err);
    }
  },

  getPersistedSegmentationsByImageId: async (imageId: string) => {
    try {
      return await PersistenceService.getSegmentationsByImageId(imageId);
    } catch (err) {
      console.error('[SegmentationStore] Failed to get persisted segmentations:', err);
      return [];
    }
  },

  // History tracking integration (Module 1: Enhanced Annotation Tools)
  pushAnnotationHistory: (sliceData, metadata) => {
    const state = get();
    const { activeSegmentationId, activeSegmentIndex } = state;

    if (!activeSegmentationId || activeSegmentIndex === null) {
      console.warn('[SegmentationStore] Cannot push history: no active segmentation/segment');
      return;
    }

    const historyStore = useAnnotationHistoryStore.getState();
    historyStore.push(sliceData, {
      ...metadata,
      segmentationId: activeSegmentationId,
      segmentIndex: activeSegmentIndex,
      dataType: 'uint8',
    });
  },

  undoAnnotation: () => {
    const historyStore = useAnnotationHistoryStore.getState();
    const entry = historyStore.undo();

    if (entry) {
      console.log('[SegmentationStore] Undo annotation:', entry.actionDescription);
      // The actual restoration of mask data needs to be handled by the caller
      // since it requires access to Cornerstone3D segmentation API
      // Emit event for Cornerstone integration
      window.dispatchEvent(new CustomEvent('annotation:undo', { detail: entry }));
    }
  },

  redoAnnotation: () => {
    const historyStore = useAnnotationHistoryStore.getState();
    const entry = historyStore.redo();

    if (entry) {
      console.log('[SegmentationStore] Redo annotation:', entry.actionDescription);
      // Emit event for Cornerstone integration
      window.dispatchEvent(new CustomEvent('annotation:redo', { detail: entry }));
    }
  },

  canUndoAnnotation: () => {
    const historyStore = useAnnotationHistoryStore.getState();
    return historyStore.canUndo();
  },

  canRedoAnnotation: () => {
    const historyStore = useAnnotationHistoryStore.getState();
    return historyStore.canRedo();
  },

  clearAnnotationHistory: () => {
    const historyStore = useAnnotationHistoryStore.getState();
    historyStore.clear();
    console.log('[SegmentationStore] Annotation history cleared');
  },
}));

export default useSegmentationStore;
