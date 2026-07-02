/**
 * Batch Processing Store - Zustand store for batch image processing workflow
 *
 * Manages state for batch segmentation including:
 * - Batch job tracking (id, status, files, results)
 * - Selected files for batch processing
 * - Export settings and format options
 * - Per-result accept/reject status
 */

import { create } from 'zustand';

/**
 * Supported export formats for batch results
 */
export type BatchExportFormat = 'coco' | 'yolo' | 'voc' | 'png_masks' | 'dicom_seg' | 'nifti';

/**
 * Status of a batch job
 */
export type BatchJobStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Review status for individual results
 */
export type BatchResultStatus = 'pending' | 'accepted' | 'rejected';

/**
 * File metadata for batch selection
 */
export interface BatchFile {
  id: string;
  name: string;
  path?: string;
  imageId?: string;
  modality?: string;
  date?: string;
  patientId?: string;
  studyDescription?: string;
  thumbnailUrl?: string;
  size?: number;
}

/**
 * Individual result from batch processing
 */
export interface BatchResult {
  id: string;
  fileId: string;
  fileName: string;
  status: BatchResultStatus;
  thumbnailUrl?: string;
  segmentationId?: string;
  maskUrl?: string;
  labels?: Array<{ name: string; color: string; count?: number }>;
  processingTime?: number;
  error?: string;
  confidence?: number;
}

/**
 * Batch job with all associated data
 */
export interface BatchJob {
  id: string;
  status: BatchJobStatus;
  model: string;
  prompt?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  files: BatchFile[];
  results: BatchResult[];
  progress: number;
  currentFileIndex: number;
  currentFileName?: string;
  error?: string;
  estimatedTimeRemaining?: number;
}

/**
 * Export settings for batch results
 */
export interface BatchExportSettings {
  format: BatchExportFormat;
  includeOnlyAccepted: boolean;
  trainValSplit?: number; // 0-1, percentage for training
  colorCoding?: boolean;
  outputDirectory?: string;
  destination: 'download' | 'pacs' | 'cloud';
}

/**
 * Batch processing store state and actions
 */
export interface BatchProcessingState {
  // Current job
  currentJob: BatchJob | null;
  jobHistory: BatchJob[];

  // File selection
  availableFiles: BatchFile[];
  selectedFileIds: Set<string>;

  // Export settings
  exportSettings: BatchExportSettings;
  isExporting: boolean;
  exportProgress: number;
  exportError: string | null;

  // UI state
  activeTab: 'select' | 'processing' | 'review' | 'export';
  filterStatus: BatchResultStatus | 'all';

  // Actions - Job Management
  createJob: (model: string, prompt?: string) => string;
  startJob: (jobId: string) => void;
  cancelJob: (jobId: string) => void;
  updateJobProgress: (jobId: string, progress: number, currentFileIndex: number, currentFileName?: string) => void;
  updateJobStatus: (jobId: string, status: BatchJobStatus, error?: string) => void;
  setEstimatedTime: (jobId: string, seconds: number) => void;
  completeJob: (jobId: string) => void;

  // Actions - Results Management
  addResult: (jobId: string, result: BatchResult) => void;
  acceptResult: (resultId: string) => void;
  rejectResult: (resultId: string) => void;
  acceptAllResults: () => void;
  rejectAllResults: () => void;
  setResultStatus: (resultId: string, status: BatchResultStatus) => void;

  // Actions - File Selection
  setAvailableFiles: (files: BatchFile[]) => void;
  addAvailableFile: (file: BatchFile) => void;
  selectFile: (fileId: string) => void;
  deselectFile: (fileId: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;
  toggleFileSelection: (fileId: string) => void;

  // Actions - Export
  setExportSettings: (settings: Partial<BatchExportSettings>) => void;
  startExport: () => void;
  updateExportProgress: (progress: number) => void;
  completeExport: () => void;
  setExportError: (error: string | null) => void;

  // Actions - UI
  setActiveTab: (tab: 'select' | 'processing' | 'review' | 'export') => void;
  setFilterStatus: (status: BatchResultStatus | 'all') => void;

  // Selectors
  getSelectedFiles: () => BatchFile[];
  getFilteredResults: () => BatchResult[];
  getAcceptedResults: () => BatchResult[];
  getRejectedResults: () => BatchResult[];
  getPendingResults: () => BatchResult[];
  getResultStats: () => { total: number; accepted: number; rejected: number; pending: number };

  // Reset
  reset: () => void;
  clearCurrentJob: () => void;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const defaultExportSettings: BatchExportSettings = {
  format: 'coco',
  includeOnlyAccepted: true,
  trainValSplit: 0.8,
  colorCoding: true,
  destination: 'download',
};

const initialState = {
  currentJob: null as BatchJob | null,
  jobHistory: [] as BatchJob[],
  availableFiles: [] as BatchFile[],
  selectedFileIds: new Set<string>(),
  exportSettings: defaultExportSettings,
  isExporting: false,
  exportProgress: 0,
  exportError: null as string | null,
  activeTab: 'select' as const,
  filterStatus: 'all' as const,
};

export const useBatchProcessingStore = create<BatchProcessingState>((set, get) => ({
  ...initialState,

  // Job Management
  createJob: (model, prompt) => {
    const state = get();
    const selectedFiles = state.getSelectedFiles();

    if (selectedFiles.length === 0) {
      console.warn('[BatchProcessingStore] Cannot create job with no files selected');
      return '';
    }

    const jobId = generateId();
    const job: BatchJob = {
      id: jobId,
      status: 'pending',
      model,
      prompt,
      createdAt: new Date(),
      files: selectedFiles,
      results: [],
      progress: 0,
      currentFileIndex: 0,
    };

    set({
      currentJob: job,
      activeTab: 'processing',
    });

    console.log('[BatchProcessingStore] Created job:', jobId, 'with', selectedFiles.length, 'files');
    return jobId;
  },

  startJob: (jobId) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      return {
        currentJob: {
          ...state.currentJob,
          status: 'processing',
          startedAt: new Date(),
        },
      };
    });
    console.log('[BatchProcessingStore] Started job:', jobId);
  },

  cancelJob: (jobId) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      const cancelledJob = {
        ...state.currentJob,
        status: 'cancelled' as BatchJobStatus,
        completedAt: new Date(),
      };
      return {
        currentJob: cancelledJob,
        jobHistory: [cancelledJob, ...state.jobHistory],
      };
    });
    console.log('[BatchProcessingStore] Cancelled job:', jobId);
  },

  updateJobProgress: (jobId, progress, currentFileIndex, currentFileName) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      return {
        currentJob: {
          ...state.currentJob,
          progress,
          currentFileIndex,
          currentFileName,
        },
      };
    });
  },

  updateJobStatus: (jobId, status, error) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      return {
        currentJob: {
          ...state.currentJob,
          status,
          error,
        },
      };
    });
  },

  setEstimatedTime: (jobId, seconds) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      return {
        currentJob: {
          ...state.currentJob,
          estimatedTimeRemaining: seconds,
        },
      };
    });
  },

  completeJob: (jobId) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      const completedJob = {
        ...state.currentJob,
        status: 'completed' as BatchJobStatus,
        completedAt: new Date(),
        progress: 100,
      };
      return {
        currentJob: completedJob,
        jobHistory: [completedJob, ...state.jobHistory],
        activeTab: 'review',
      };
    });
    console.log('[BatchProcessingStore] Completed job:', jobId);
  },

  // Results Management
  addResult: (jobId, result) => {
    set((state) => {
      if (!state.currentJob || state.currentJob.id !== jobId) return state;
      return {
        currentJob: {
          ...state.currentJob,
          results: [...state.currentJob.results, result],
        },
      };
    });
  },

  acceptResult: (resultId) => {
    set((state) => {
      if (!state.currentJob) return state;
      return {
        currentJob: {
          ...state.currentJob,
          results: state.currentJob.results.map((r) =>
            r.id === resultId ? { ...r, status: 'accepted' as BatchResultStatus } : r
          ),
        },
      };
    });
  },

  rejectResult: (resultId) => {
    set((state) => {
      if (!state.currentJob) return state;
      return {
        currentJob: {
          ...state.currentJob,
          results: state.currentJob.results.map((r) =>
            r.id === resultId ? { ...r, status: 'rejected' as BatchResultStatus } : r
          ),
        },
      };
    });
  },

  acceptAllResults: () => {
    set((state) => {
      if (!state.currentJob) return state;
      return {
        currentJob: {
          ...state.currentJob,
          results: state.currentJob.results.map((r) => ({
            ...r,
            status: 'accepted' as BatchResultStatus,
          })),
        },
      };
    });
  },

  rejectAllResults: () => {
    set((state) => {
      if (!state.currentJob) return state;
      return {
        currentJob: {
          ...state.currentJob,
          results: state.currentJob.results.map((r) => ({
            ...r,
            status: 'rejected' as BatchResultStatus,
          })),
        },
      };
    });
  },

  setResultStatus: (resultId, status) => {
    set((state) => {
      if (!state.currentJob) return state;
      return {
        currentJob: {
          ...state.currentJob,
          results: state.currentJob.results.map((r) =>
            r.id === resultId ? { ...r, status } : r
          ),
        },
      };
    });
  },

  // File Selection
  setAvailableFiles: (files) => {
    set({ availableFiles: files });
  },

  addAvailableFile: (file) => {
    set((state) => ({
      availableFiles: [...state.availableFiles, file],
    }));
  },

  selectFile: (fileId) => {
    set((state) => {
      const newSelection = new Set(state.selectedFileIds);
      newSelection.add(fileId);
      return { selectedFileIds: newSelection };
    });
  },

  deselectFile: (fileId) => {
    set((state) => {
      const newSelection = new Set(state.selectedFileIds);
      newSelection.delete(fileId);
      return { selectedFileIds: newSelection };
    });
  },

  selectAllFiles: () => {
    set((state) => ({
      selectedFileIds: new Set(state.availableFiles.map((f) => f.id)),
    }));
  },

  deselectAllFiles: () => {
    set({ selectedFileIds: new Set() });
  },

  toggleFileSelection: (fileId) => {
    set((state) => {
      const newSelection = new Set(state.selectedFileIds);
      if (newSelection.has(fileId)) {
        newSelection.delete(fileId);
      } else {
        newSelection.add(fileId);
      }
      return { selectedFileIds: newSelection };
    });
  },

  // Export
  setExportSettings: (settings) => {
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...settings },
    }));
  },

  startExport: () => {
    set({
      isExporting: true,
      exportProgress: 0,
      exportError: null,
    });
    console.log('[BatchProcessingStore] Started export');
  },

  updateExportProgress: (progress) => {
    set({ exportProgress: progress });
  },

  completeExport: () => {
    set({
      isExporting: false,
      exportProgress: 100,
    });
    console.log('[BatchProcessingStore] Export completed');
  },

  setExportError: (error) => {
    set({
      isExporting: false,
      exportError: error,
    });
  },

  // UI
  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  setFilterStatus: (status) => {
    set({ filterStatus: status });
  },

  // Selectors
  getSelectedFiles: () => {
    const state = get();
    return state.availableFiles.filter((f) => state.selectedFileIds.has(f.id));
  },

  getFilteredResults: () => {
    const state = get();
    if (!state.currentJob) return [];
    if (state.filterStatus === 'all') return state.currentJob.results;
    return state.currentJob.results.filter((r) => r.status === state.filterStatus);
  },

  getAcceptedResults: () => {
    const state = get();
    if (!state.currentJob) return [];
    return state.currentJob.results.filter((r) => r.status === 'accepted');
  },

  getRejectedResults: () => {
    const state = get();
    if (!state.currentJob) return [];
    return state.currentJob.results.filter((r) => r.status === 'rejected');
  },

  getPendingResults: () => {
    const state = get();
    if (!state.currentJob) return [];
    return state.currentJob.results.filter((r) => r.status === 'pending');
  },

  getResultStats: () => {
    const state = get();
    if (!state.currentJob) return { total: 0, accepted: 0, rejected: 0, pending: 0 };
    const results = state.currentJob.results;
    return {
      total: results.length,
      accepted: results.filter((r) => r.status === 'accepted').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      pending: results.filter((r) => r.status === 'pending').length,
    };
  },

  // Reset
  reset: () => {
    set(initialState);
    console.log('[BatchProcessingStore] Store reset');
  },

  clearCurrentJob: () => {
    set({
      currentJob: null,
      selectedFileIds: new Set(),
      activeTab: 'select',
      filterStatus: 'all',
    });
  },
}));

export default useBatchProcessingStore;
