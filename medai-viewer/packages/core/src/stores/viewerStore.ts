import { create } from 'zustand';
import { LoadedImage } from '../loaders/types';
import * as PersistenceService from '../services/PersistenceService';
import { WL_PRESETS } from '../suites/types';

/**
 * PACS Series information
 */
export interface PacsSeries {
  seriesInstanceUID: string;
  seriesNumber: number;
  seriesDescription: string;
  modality: string;
  instanceCount: number;
  imageIds: string[]; // References to images in the images Map
}

/**
 * PACS Study information - represents the DICOM hierarchy
 */
export interface PacsStudyInfo {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  series: PacsSeries[];
}

export interface ViewerState {
  // Loaded images
  images: Map<string, LoadedImage>;
  activeImageId: string | null;

  // PACS study info (for proper DICOM hierarchy display)
  pacsStudy: PacsStudyInfo | null;
  activeSeriesUID: string | null;

  // Loading state
  isLoading: boolean;
  loadingProgress: number;
  loadingError: string | null;

  // Viewport state
  windowWidth: number;
  windowCenter: number;
  activePresetId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  sliceIndex: number;

  // Overlay visibility
  showOrientationMarker: boolean;
  showScaleOverlay: boolean;

  // Actions
  addImage: (image: LoadedImage) => void;
  removeImage: (imageId: string) => void;
  setActiveImage: (imageId: string | null) => void;
  setPacsStudy: (study: PacsStudyInfo | null) => void;
  setActiveSeries: (seriesUID: string | null) => void;
  addImageToSeries: (seriesUID: string, imageId: string) => void;
  setLoading: (isLoading: boolean, progress?: number) => void;
  setLoadingError: (error: string | null) => void;
  setWindowLevel: (width: number, center: number) => void;
  applyPreset: (presetId: string) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setSliceIndex: (index: number) => void;
  setShowOrientationMarker: (show: boolean) => void;
  setShowScaleOverlay: (show: boolean) => void;
  reset: () => void;

  // Persistence actions
  persistImage: (image: LoadedImage) => Promise<void>;
  deletePersistedImage: (imageId: string) => Promise<void>;
  restorePersistedImages: () => Promise<void>;
  initPersistence: () => Promise<boolean>;
  saveSessionState: (activeSegmentationId: string | null) => Promise<void>;
  clearLocalImages: () => Promise<void>;
  clearAllPersistedData: () => Promise<void>;
}

const initialState = {
  images: new Map<string, LoadedImage>(),
  activeImageId: null,
  pacsStudy: null as PacsStudyInfo | null,
  activeSeriesUID: null as string | null,
  isLoading: false,
  loadingProgress: 0,
  loadingError: null,
  windowWidth: 400,
  windowCenter: 40,
  activePresetId: 'ct-soft-tissue' as string | null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  sliceIndex: 0,
  showOrientationMarker: true,
  showScaleOverlay: false,
};

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...initialState,

  addImage: (image) =>
    set((state) => {
      const newImages = new Map(state.images);
      newImages.set(image.imageId, image);
      return {
        images: newImages,
        activeImageId: state.activeImageId || image.imageId,
      };
    }),

  removeImage: (imageId) =>
    set((state) => {
      const newImages = new Map(state.images);
      newImages.delete(imageId);
      return {
        images: newImages,
        activeImageId: state.activeImageId === imageId ? null : state.activeImageId,
      };
    }),

  setActiveImage: (imageId) => set({ activeImageId: imageId }),

  setPacsStudy: (study) => set({ pacsStudy: study }),

  setActiveSeries: (seriesUID) => set({ activeSeriesUID: seriesUID }),

  addImageToSeries: (seriesUID, imageId) =>
    set((state) => {
      if (!state.pacsStudy) return state;
      const updatedSeries = state.pacsStudy.series.map((s) => {
        if (s.seriesInstanceUID === seriesUID) {
          return { ...s, imageIds: [...s.imageIds, imageId] };
        }
        return s;
      });
      return {
        pacsStudy: { ...state.pacsStudy, series: updatedSeries },
      };
    }),

  setLoading: (isLoading, progress = 0) =>
    set({ isLoading, loadingProgress: progress }),

  setLoadingError: (error) => set({ loadingError: error, isLoading: false }),

  setWindowLevel: (width, center) =>
    set({ windowWidth: width, windowCenter: center, activePresetId: null }),

  applyPreset: (presetId) => {
    const preset = WL_PRESETS[presetId];
    if (preset) {
      set({
        windowWidth: preset.windowWidth,
        windowCenter: preset.windowCenter,
        activePresetId: presetId,
      });
    }
  },

  setZoom: (zoom) => set({ zoom }),

  setPan: (x, y) => set({ pan: { x, y } }),

  setSliceIndex: (index) => set({ sliceIndex: index }),

  setShowOrientationMarker: (show) => set({ showOrientationMarker: show }),

  setShowScaleOverlay: (show) => set({ showScaleOverlay: show }),

  reset: () => set(initialState),

  // Persistence actions
  initPersistence: async () => {
    try {
      const initialized = await PersistenceService.initPersistence();
      console.log('[ViewerStore] Persistence initialized:', initialized);
      return initialized;
    } catch (err) {
      console.error('[ViewerStore] Failed to initialize persistence:', err);
      return false;
    }
  },

  persistImage: async (image: LoadedImage) => {
    try {
      await PersistenceService.saveImage(image);
      console.log('[ViewerStore] Image persisted:', image.imageId);
    } catch (err) {
      console.error('[ViewerStore] Failed to persist image:', err);
    }
  },

  deletePersistedImage: async (imageId: string) => {
    try {
      await PersistenceService.deleteImage(imageId);
      console.log('[ViewerStore] Persisted image deleted:', imageId);
    } catch (err) {
      console.error('[ViewerStore] Failed to delete persisted image:', err);
    }
  },

  restorePersistedImages: async () => {
    try {
      console.log('[ViewerStore] Restoring persisted images...');
      const imageIds = await PersistenceService.getAllImageIds();
      console.log('[ViewerStore] Found persisted image IDs:', imageIds);

      if (imageIds.length === 0) {
        console.log('[ViewerStore] No persisted images to restore');
        return;
      }

      set({ isLoading: true, loadingProgress: 0 });

      const restoredImages = new Map<string, LoadedImage>();
      let firstImageId: string | null = null;

      for (let i = 0; i < imageIds.length; i++) {
        const imageId = imageIds[i];
        const image = await PersistenceService.loadImage(imageId);
        if (image) {
          restoredImages.set(imageId, image);
          if (!firstImageId) firstImageId = imageId;
          console.log('[ViewerStore] Restored image:', imageId);
        }
        set({ loadingProgress: ((i + 1) / imageIds.length) * 100 });
      }

      // Also load session to get the last active image
      const session = await PersistenceService.loadSession();
      const activeImageId = session?.activeImageId && restoredImages.has(session.activeImageId)
        ? session.activeImageId
        : firstImageId;

      set({
        images: restoredImages,
        activeImageId,
        isLoading: false,
        loadingProgress: 100,
      });

      console.log('[ViewerStore] Restored', restoredImages.size, 'images, active:', activeImageId);
    } catch (err) {
      console.error('[ViewerStore] Failed to restore persisted images:', err);
      set({ isLoading: false, loadingError: 'Failed to restore persisted images' });
    }
  },

  saveSessionState: async (activeSegmentationId: string | null) => {
    try {
      const state = get();
      await PersistenceService.saveSession({
        activeImageId: state.activeImageId,
        activeSegmentationId,
      });
      console.log('[ViewerStore] Session state saved');
    } catch (err) {
      console.error('[ViewerStore] Failed to save session state:', err);
    }
  },

  clearLocalImages: async () => {
    try {
      const state = get();
      const newImages = new Map<string, LoadedImage>();

      // Keep only PACS images (images with IDs starting with "pacs:")
      for (const [imageId, image] of state.images) {
        if (imageId.startsWith('pacs:')) {
          newImages.set(imageId, image);
        } else {
          // Delete local image from IndexedDB
          await PersistenceService.deleteImage(imageId);
          console.log('[ViewerStore] Deleted local image:', imageId);
        }
      }

      // Update active image if current one was removed
      const newActiveImageId = state.activeImageId && newImages.has(state.activeImageId)
        ? state.activeImageId
        : null;

      set({
        images: newImages,
        activeImageId: newActiveImageId,
      });

      console.log('[ViewerStore] Cleared local images, kept', newImages.size, 'PACS images');
    } catch (err) {
      console.error('[ViewerStore] Failed to clear local images:', err);
    }
  },

  clearAllPersistedData: async () => {
    try {
      await PersistenceService.clearAllData();
      set({
        images: new Map(),
        activeImageId: null,
        pacsStudy: null,
        activeSeriesUID: null,
      });
      console.log('[ViewerStore] Cleared all persisted data');
    } catch (err) {
      console.error('[ViewerStore] Failed to clear all persisted data:', err);
    }
  },
}));
