import { create } from 'zustand';
import { VolumetricsResult, RadiomicsResult } from './analyticsStore';
import type { LongitudinalReportPayload } from '../services/ReportGenerationService';

/**
 * Generated report sections following standard radiology report format
 */
export interface ReportSections {
  clinicalHistory: string;
  technique: string;
  comparison: string;
  findings: string;  // Radiologist's findings/observations
  aiFindings: string;  // AI-generated findings (from MedGemma detections)
  impression: string;
  recommendations: string;
}

/**
 * Complete generated report including metadata
 */
export interface GeneratedReport {
  id: string;
  generatedAt: string;
  agentType: string;
  sections: ReportSections;
  rawResponse?: string;
}

/**
 * Detection result (bounding box) for reports - can be AI or manually drawn
 */
export interface ReportDetection {
  label: string;
  confidence: number;
  x_min?: number;
  y_min?: number;
  x_max?: number;
  y_max?: number;
  /** Source of the detection: 'ai' for AI-generated, 'manual' for user-drawn */
  source?: 'ai' | 'manual';
}

/**
 * Collected data for report generation
 */
export interface CollectedReportData {
  mosaicImage: string | null;  // Base64 PNG
  overlaidImage: string | null;  // Base64 PNG with detection overlays
  volumetrics: VolumetricsResult | null;
  radiomics: RadiomicsResult | null;
  findings: string;  // Radiologist observations
  modality: string;
  patientInfo?: {
    patientId?: string;
    patientName?: string;
    studyDate?: string;
    studyDescription?: string;
  };
  clinicalContext?: string;  // Patient history, indication
  detections?: ReportDetection[];  // AI detections from MedGemma
  selectedDetectionIds?: string[];  // IDs of detections to include in report
  longitudinal?: LongitudinalReportPayload;  // Longitudinal comparison data
}

/**
 * Report store state
 */
export interface ReportState {
  // Current report
  currentReport: GeneratedReport | null;

  // Generation state
  isGenerating: boolean;
  generationError: string | null;
  generationProgress: number;

  // Collected data for generation
  collectedData: CollectedReportData;

  // Edited sections (user modifications)
  editedSections: Partial<ReportSections>;

  // Report history
  reportHistory: GeneratedReport[];

  // Actions
  setCollectedData: (data: Partial<CollectedReportData>) => void;
  setMosaicImage: (image: string | null) => void;
  setOverlaidImage: (image: string | null) => void;
  setDetections: (detections: ReportDetection[]) => void;
  setSelectedDetectionIds: (ids: string[]) => void;
  toggleDetectionSelection: (id: string) => void;
  updateCollectedFindings: (findings: string) => void;
  setCurrentReport: (report: GeneratedReport | null) => void;
  setGenerating: (isGenerating: boolean, progress?: number) => void;
  setGenerationError: (error: string | null) => void;
  updateEditedSection: (section: keyof ReportSections, content: string) => void;
  clearEditedSections: () => void;
  addToHistory: (report: GeneratedReport) => void;
  getEffectiveReport: () => ReportSections | null;
  getSelectedDetections: () => ReportDetection[];
  reset: () => void;
  resetCollectedData: () => void;
}

const initialCollectedData: CollectedReportData = {
  mosaicImage: null,
  overlaidImage: null,
  volumetrics: null,
  radiomics: null,
  findings: '',
  modality: 'Unknown',
  patientInfo: undefined,
  clinicalContext: undefined,
  detections: undefined,
  selectedDetectionIds: undefined,
  longitudinal: undefined,
};

const initialState = {
  currentReport: null as GeneratedReport | null,
  isGenerating: false,
  generationError: null as string | null,
  generationProgress: 0,
  collectedData: initialCollectedData,
  editedSections: {} as Partial<ReportSections>,
  reportHistory: [] as GeneratedReport[],
};

export const useReportStore = create<ReportState>((set, get) => ({
  ...initialState,

  setCollectedData: (data) =>
    set((state) => ({
      collectedData: { ...state.collectedData, ...data },
    })),

  setMosaicImage: (image) =>
    set((state) => ({
      collectedData: { ...state.collectedData, mosaicImage: image },
    })),

  setOverlaidImage: (image) =>
    set((state) => ({
      collectedData: { ...state.collectedData, overlaidImage: image },
    })),

  setDetections: (detections) =>
    set((state) => ({
      collectedData: {
        ...state.collectedData,
        detections,
        // Auto-select all detections by default (using index as ID)
        selectedDetectionIds: detections.map((_, i) => `detection-${i}`),
      },
    })),

  setSelectedDetectionIds: (ids) =>
    set((state) => ({
      collectedData: { ...state.collectedData, selectedDetectionIds: ids },
    })),

  toggleDetectionSelection: (id) =>
    set((state) => {
      const currentIds = state.collectedData.selectedDetectionIds || [];
      const newIds = currentIds.includes(id)
        ? currentIds.filter((existingId) => existingId !== id)
        : [...currentIds, id];
      return {
        collectedData: { ...state.collectedData, selectedDetectionIds: newIds },
      };
    }),

  updateCollectedFindings: (findings) =>
    set((state) => ({
      collectedData: { ...state.collectedData, findings },
    })),

  setCurrentReport: (report) =>
    set({
      currentReport: report,
      generationError: null,
      editedSections: {},  // Clear edits when new report is set
    }),

  setGenerating: (isGenerating, progress = 0) =>
    set({
      isGenerating,
      generationProgress: progress,
      generationError: isGenerating ? null : get().generationError,
    }),

  setGenerationError: (error) =>
    set({
      generationError: error,
      isGenerating: false,
      generationProgress: 0,
    }),

  updateEditedSection: (section, content) =>
    set((state) => ({
      editedSections: {
        ...state.editedSections,
        [section]: content,
      },
    })),

  clearEditedSections: () => set({ editedSections: {} }),

  addToHistory: (report) =>
    set((state) => ({
      reportHistory: [report, ...state.reportHistory].slice(0, 10),  // Keep last 10
    })),

  getEffectiveReport: () => {
    const state = get();
    if (!state.currentReport) return null;

    // Merge original report with user edits
    return {
      ...state.currentReport.sections,
      ...state.editedSections,
    };
  },

  getSelectedDetections: () => {
    const state = get();
    const detections = state.collectedData.detections || [];
    const selectedIds = state.collectedData.selectedDetectionIds || [];

    // Filter detections to only include selected ones
    return detections.filter((_, index) =>
      selectedIds.includes(`detection-${index}`)
    );
  },

  reset: () => set(initialState),

  resetCollectedData: () =>
    set({
      collectedData: initialCollectedData,
      generationError: null,
      generationProgress: 0,
    }),
}));
