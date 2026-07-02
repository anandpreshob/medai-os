/**
 * Triage Store - Zustand store for radiologist worklist triaging
 *
 * Manages state for AI-powered study prioritization including:
 * - Triaged study list with priority rankings
 * - View mode toggling (date order vs AI triaged)
 * - Manual drag-and-drop reordering
 * - Triage statistics
 */

import { create } from 'zustand';

/**
 * Triage level for a study
 */
export type TriageLevel = 'STAT' | 'URGENT' | 'SEMI_URGENT' | 'ROUTINE';

/**
 * Triaged study with priority information
 */
export interface TriagedStudy {
  studyUID: string;
  patientName?: string;
  patientID?: string;
  modality?: string;
  studyDescription?: string;
  studyDate?: string;
  priorityRank: number;
  triageLevel: TriageLevel;
  priorityScore: number;
  rationale: string;
  keyFactors: string[];
  rulesApplied: string[];
  // Clinical context
  reasonForVisit?: string;
  patientHistory?: string;
  symptoms?: string;
  patientLocation?: string;
}

/**
 * Triage summary statistics
 */
export interface TriageStats {
  totalProcessed: number;
  statCount: number;
  urgentCount: number;
  semiUrgentCount: number;
  routineCount: number;
}

/**
 * View mode for study browser
 */
export type ViewMode = 'date' | 'triaged';

/**
 * Triage state interface
 */
export interface TriageState {
  // Triaged studies from AI
  triagedStudies: TriagedStudy[];

  // Manual reordering (overrides AI order when set)
  manualOrder: string[] | null;

  // Loading/processing state
  isTriaging: boolean;
  triageError: string | null;

  // View mode
  viewMode: ViewMode;

  // Statistics
  stats: TriageStats;

  // Actions
  setTriagedStudies: (studies: TriagedStudy[], stats: TriageStats) => void;
  reorderStudy: (activeId: string, overId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setTriaging: (isTriaging: boolean) => void;
  setTriageError: (error: string | null) => void;
  clearManualOrder: () => void;
  reset: () => void;

  // Selectors
  getOrderedStudies: () => TriagedStudy[];
  getStudyByUID: (uid: string) => TriagedStudy | undefined;
}

const initialStats: TriageStats = {
  totalProcessed: 0,
  statCount: 0,
  urgentCount: 0,
  semiUrgentCount: 0,
  routineCount: 0,
};

export const useTriageStore = create<TriageState>()((set, get) => ({
  triagedStudies: [],
  manualOrder: null,
  isTriaging: false,
  triageError: null,
  viewMode: 'date',
  stats: initialStats,

  setTriagedStudies: (studies, stats) => {
    set({
      triagedStudies: studies,
      stats,
      manualOrder: null, // Clear manual order when new triage results come in
      triageError: null,
    });
  },

  reorderStudy: (activeId, overId) => {
    const state = get();
    const currentOrder = state.manualOrder || state.triagedStudies.map(s => s.studyUID);

    const oldIndex = currentOrder.indexOf(activeId);
    const newIndex = currentOrder.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1) return;

    // Create new order
    const newOrder = [...currentOrder];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, activeId);

    set({ manualOrder: newOrder });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setTriaging: (isTriaging) => {
    set({ isTriaging, triageError: isTriaging ? null : get().triageError });
  },

  setTriageError: (error) => {
    set({ triageError: error, isTriaging: false });
  },

  clearManualOrder: () => {
    set({ manualOrder: null });
  },

  reset: () => {
    set({
      triagedStudies: [],
      manualOrder: null,
      isTriaging: false,
      triageError: null,
      viewMode: 'date',
      stats: initialStats,
    });
  },

  getOrderedStudies: () => {
    const state = get();

    if (state.viewMode === 'date') {
      // Return studies sorted by date (newest first)
      return [...state.triagedStudies].sort((a, b) => {
        const dateA = a.studyDate || '';
        const dateB = b.studyDate || '';
        return dateB.localeCompare(dateA);
      });
    }

    // AI triaged view
    if (state.manualOrder) {
      // Use manual order
      const studyMap = new Map(state.triagedStudies.map(s => [s.studyUID, s]));
      return state.manualOrder
        .map(uid => studyMap.get(uid))
        .filter((s): s is TriagedStudy => s !== undefined);
    }

    // Use AI priority order
    return [...state.triagedStudies].sort((a, b) => a.priorityRank - b.priorityRank);
  },

  getStudyByUID: (uid) => {
    return get().triagedStudies.find(s => s.studyUID === uid);
  },
}));

export default useTriageStore;
