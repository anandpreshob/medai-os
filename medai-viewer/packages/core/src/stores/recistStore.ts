/**
 * RECIST 1.1 Store
 *
 * Zustand store for managing RECIST 1.1 tumor response assessment.
 * Provides target lesion tracking, SLD computation, and response classification.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  RECISTLesion,
  RECISTLesionType,
  NonTargetStatus,
  RECISTAssessment,
  RECISTSession,
  RECISTOverallResponse,
  RECIST_CONSTRAINTS,
  generateLesionId,
  generateAssessmentId,
  generateRECISTSessionId,
  isLymphNodeRegion,
} from './recistTypes';
import {
  computeSLD,
  computeBaselineSLD,
  computeCurrentSLD,
  computeNonTargetOverallStatus,
  classifyTargetResponse,
  classifyNonTargetResponse,
  computeOverallResponse,
  validateTargetLesionSelection,
  canAddTargetLesion,
} from '../utils/recistMetrics';

// =============================================================================
// Store State Interface
// =============================================================================

export interface RECISTState {
  // ============================================================================
  // Session State
  // ============================================================================

  /** All RECIST sessions, keyed by session ID */
  sessions: Record<string, RECISTSession>;

  /** Currently active session ID */
  activeSessionId: string | null;

  /** Current working lesions for the active session */
  lesions: RECISTLesion[];

  /** Baseline SLD (set from first assessment) */
  baselineSLD: number;

  /** Nadir SLD (minimum SLD achieved during tracking) */
  nadirSLD: number;

  /** Timepoint ID when nadir was recorded */
  nadirTimepointId: string | null;

  /** Whether currently in RECIST assessment mode */
  isRECISTModeActive: boolean;

  /** Current timepoint/study being assessed */
  currentTimepointId: string | null;

  // ============================================================================
  // Session Management Actions
  // ============================================================================

  /**
   * Create a new RECIST session.
   */
  createSession: (params: {
    patientId: string;
    patientName?: string;
    indication?: string;
    protocolName?: string;
  }) => string;

  /**
   * Delete a session.
   */
  deleteSession: (sessionId: string) => void;

  /**
   * Set the active session.
   */
  setActiveSession: (sessionId: string | null) => void;

  /**
   * Update session metadata.
   */
  updateSession: (sessionId: string, updates: Partial<Pick<RECISTSession, 'indication' | 'protocolName' | 'notes'>>) => void;

  /**
   * Toggle RECIST mode on/off.
   */
  setRECISTModeActive: (active: boolean) => void;

  /**
   * Set current timepoint being assessed.
   */
  setCurrentTimepoint: (timepointId: string | null) => void;

  // ============================================================================
  // Lesion Management Actions
  // ============================================================================

  /**
   * Add a target lesion with constraint validation.
   * Returns lesion ID if successful, null if constraints violated.
   */
  addTargetLesion: (params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode?: boolean;
    baselineLongestDiameterMm: number;
    baselineShortAxisMm?: number;
    label?: string;
    notes?: string;
  }) => { success: boolean; lesionId?: string; error?: string };

  /**
   * Add a non-target lesion.
   */
  addNonTargetLesion: (params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode?: boolean;
    baselineLongestDiameterMm: number;
    baselineShortAxisMm?: number;
    label?: string;
    notes?: string;
    status?: NonTargetStatus;
  }) => string;

  /**
   * Add a new lesion (detected after baseline).
   */
  addNewLesion: (params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode?: boolean;
    currentLongestDiameterMm: number;
    currentShortAxisMm?: number;
    label?: string;
    notes?: string;
  }) => string;

  /**
   * Update lesion measurements.
   */
  updateLesionMeasurement: (
    lesionId: string,
    measurements: {
      currentLongestDiameterMm?: number;
      currentShortAxisMm?: number;
      tooSmallToMeasure?: boolean;
    }
  ) => void;

  /**
   * Set non-target lesion status.
   */
  setNonTargetStatus: (lesionId: string, status: NonTargetStatus) => void;

  /**
   * Update lesion metadata.
   */
  updateLesion: (
    lesionId: string,
    updates: Partial<Pick<RECISTLesion, 'label' | 'notes' | 'anatomicalRegion'>>
  ) => void;

  /**
   * Remove a lesion.
   */
  removeLesion: (lesionId: string) => void;

  /**
   * Change lesion type (e.g., target to non-target).
   */
  changeLesionType: (lesionId: string, newType: RECISTLesionType) => { success: boolean; error?: string };

  // ============================================================================
  // Assessment Actions
  // ============================================================================

  /**
   * Compute and return the current RECIST assessment.
   */
  computeAssessment: () => RECISTAssessment | null;

  /**
   * Save the current assessment to the session.
   */
  saveAssessment: (params: {
    timepointId: string;
    assessmentDate: string;
    notes?: string;
    isBaseline?: boolean;
    reviewedBy?: string;
  }) => string | null;

  /**
   * Confirm/lock an assessment.
   */
  confirmAssessment: (assessmentId: string, reviewedBy?: string) => void;

  /**
   * Set baseline from current lesions.
   */
  setBaseline: () => void;

  /**
   * Update nadir if current SLD is lower.
   */
  updateNadir: (timepointId?: string) => void;

  // ============================================================================
  // Query Actions
  // ============================================================================

  /**
   * Get lesions by type.
   */
  getLesionsByType: (type: RECISTLesionType) => RECISTLesion[];

  /**
   * Get target lesion count by organ.
   */
  getTargetCountByOrgan: () => Map<string, number>;

  /**
   * Get validation result for current selection.
   */
  getValidation: () => ReturnType<typeof validateTargetLesionSelection>;

  /**
   * Get remaining target lesion slots.
   */
  getRemainingTargetSlots: () => { total: number; byOrgan: Map<string, number> };

  /**
   * Get current SLD.
   */
  getCurrentSLD: () => number;

  /**
   * Get SLD change from baseline as percentage.
   */
  getSLDChangeFromBaseline: () => number;

  /**
   * Get SLD change from nadir as percentage.
   */
  getSLDChangeFromNadir: () => number;

  /**
   * Get all sessions.
   */
  getAllSessions: () => RECISTSession[];

  /**
   * Get session by ID.
   */
  getSession: (sessionId: string) => RECISTSession | undefined;

  /**
   * Get active session.
   */
  getActiveSession: () => RECISTSession | undefined;

  // ============================================================================
  // Utility Actions
  // ============================================================================

  /**
   * Load lesions from a saved assessment.
   */
  loadAssessment: (assessmentId: string) => void;

  /**
   * Clear current working state.
   */
  clearWorkingState: () => void;

  /**
   * Reset entire store.
   */
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  sessions: {} as Record<string, RECISTSession>,
  activeSessionId: null as string | null,
  lesions: [] as RECISTLesion[],
  baselineSLD: 0,
  nadirSLD: 0,
  nadirTimepointId: null as string | null,
  isRECISTModeActive: false,
  currentTimepointId: null as string | null,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useRECISTStore = create<RECISTState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================================================
      // Session Management
      // ========================================================================

      createSession: (params) => {
        const sessionId = generateRECISTSessionId();
        const now = Date.now();

        const session: RECISTSession = {
          id: sessionId,
          patientId: params.patientId,
          patientName: params.patientName,
          indication: params.indication,
          protocolName: params.protocolName,
          assessments: [],
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: session,
          },
          activeSessionId: sessionId,
          lesions: [],
          baselineSLD: 0,
          nadirSLD: 0,
          nadirTimepointId: null,
        }));

        console.log('[RECISTStore] Created session:', sessionId);
        return sessionId;
      },

      deleteSession: (sessionId) => {
        set((state) => {
          const { [sessionId]: deleted, ...remaining } = state.sessions;
          const newActiveId = state.activeSessionId === sessionId ? null : state.activeSessionId;

          return {
            sessions: remaining,
            activeSessionId: newActiveId,
            lesions: newActiveId === null ? [] : state.lesions,
            baselineSLD: newActiveId === null ? 0 : state.baselineSLD,
            nadirSLD: newActiveId === null ? 0 : state.nadirSLD,
            nadirTimepointId: newActiveId === null ? null : state.nadirTimepointId,
          };
        });
        console.log('[RECISTStore] Deleted session:', sessionId);
      },

      setActiveSession: (sessionId) => {
        if (sessionId === null) {
          set({
            activeSessionId: null,
            lesions: [],
            baselineSLD: 0,
            nadirSLD: 0,
            nadirTimepointId: null,
          });
          return;
        }

        const session = get().sessions[sessionId];
        if (!session) {
          console.error('[RECISTStore] Session not found:', sessionId);
          return;
        }

        // Load latest assessment if available
        const latestAssessment = session.assessments[session.assessments.length - 1];

        set({
          activeSessionId: sessionId,
          lesions: latestAssessment?.targetLesions.concat(
            latestAssessment.nonTargetLesions,
            latestAssessment.newLesions
          ) ?? [],
          baselineSLD: latestAssessment?.baselineSLD ?? 0,
          nadirSLD: latestAssessment?.nadirSLD ?? 0,
          nadirTimepointId: null,
        });

        console.log('[RECISTStore] Active session set:', sessionId);
      },

      updateSession: (sessionId, updates) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                ...updates,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setRECISTModeActive: (active) => {
        set({ isRECISTModeActive: active });
        console.log('[RECISTStore] RECIST mode:', active ? 'enabled' : 'disabled');
      },

      setCurrentTimepoint: (timepointId) => {
        set({ currentTimepointId: timepointId });
      },

      // ========================================================================
      // Lesion Management
      // ========================================================================

      addTargetLesion: (params) => {
        const state = get();

        // Auto-detect if lymph node from region
        const isLymphNode = params.isLymphNode ?? isLymphNodeRegion(params.anatomicalRegion);

        // Validate constraints
        const canAdd = canAddTargetLesion(state.lesions, {
          ...params,
          isLymphNode,
          type: 'target',
        });

        if (!canAdd.canAdd) {
          console.warn('[RECISTStore] Cannot add target lesion:', canAdd.reason);
          return { success: false, error: canAdd.reason };
        }

        const lesionId = generateLesionId();
        const now = Date.now();

        const lesion: RECISTLesion = {
          id: lesionId,
          segmentIndex: params.segmentIndex,
          type: 'target',
          anatomicalRegion: params.anatomicalRegion,
          isLymphNode,
          baselineLongestDiameterMm: params.baselineLongestDiameterMm,
          baselineShortAxisMm: params.baselineShortAxisMm,
          label: params.label,
          notes: params.notes,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          lesions: [...state.lesions, lesion],
        }));

        console.log('[RECISTStore] Added target lesion:', lesionId);
        return { success: true, lesionId };
      },

      addNonTargetLesion: (params) => {
        const lesionId = generateLesionId();
        const now = Date.now();
        const isLymphNode = params.isLymphNode ?? isLymphNodeRegion(params.anatomicalRegion);

        const lesion: RECISTLesion = {
          id: lesionId,
          segmentIndex: params.segmentIndex,
          type: 'non_target',
          anatomicalRegion: params.anatomicalRegion,
          isLymphNode,
          baselineLongestDiameterMm: params.baselineLongestDiameterMm,
          baselineShortAxisMm: params.baselineShortAxisMm,
          nonTargetStatus: params.status ?? 'present',
          label: params.label,
          notes: params.notes,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          lesions: [...state.lesions, lesion],
        }));

        console.log('[RECISTStore] Added non-target lesion:', lesionId);
        return lesionId;
      },

      addNewLesion: (params) => {
        const lesionId = generateLesionId();
        const now = Date.now();
        const isLymphNode = params.isLymphNode ?? isLymphNodeRegion(params.anatomicalRegion);

        const lesion: RECISTLesion = {
          id: lesionId,
          segmentIndex: params.segmentIndex,
          type: 'new',
          anatomicalRegion: params.anatomicalRegion,
          isLymphNode,
          baselineLongestDiameterMm: 0, // No baseline for new lesions
          currentLongestDiameterMm: params.currentLongestDiameterMm,
          currentShortAxisMm: params.currentShortAxisMm,
          label: params.label,
          notes: params.notes,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          lesions: [...state.lesions, lesion],
        }));

        console.log('[RECISTStore] Added new lesion:', lesionId);
        return lesionId;
      },

      updateLesionMeasurement: (lesionId, measurements) => {
        set((state) => ({
          lesions: state.lesions.map((lesion) =>
            lesion.id === lesionId
              ? {
                  ...lesion,
                  ...measurements,
                  updatedAt: Date.now(),
                }
              : lesion
          ),
        }));
      },

      setNonTargetStatus: (lesionId, status) => {
        set((state) => ({
          lesions: state.lesions.map((lesion) =>
            lesion.id === lesionId
              ? {
                  ...lesion,
                  nonTargetStatus: status,
                  updatedAt: Date.now(),
                }
              : lesion
          ),
        }));
      },

      updateLesion: (lesionId, updates) => {
        set((state) => ({
          lesions: state.lesions.map((lesion) =>
            lesion.id === lesionId
              ? {
                  ...lesion,
                  ...updates,
                  updatedAt: Date.now(),
                }
              : lesion
          ),
        }));
      },

      removeLesion: (lesionId) => {
        set((state) => ({
          lesions: state.lesions.filter((lesion) => lesion.id !== lesionId),
        }));
        console.log('[RECISTStore] Removed lesion:', lesionId);
      },

      changeLesionType: (lesionId, newType) => {
        const state = get();
        const lesion = state.lesions.find((l) => l.id === lesionId);

        if (!lesion) {
          return { success: false, error: 'Lesion not found' };
        }

        // If changing to target, validate constraints
        if (newType === 'target') {
          const canAdd = canAddTargetLesion(
            state.lesions.filter((l) => l.id !== lesionId),
            lesion
          );
          if (!canAdd.canAdd) {
            return { success: false, error: canAdd.reason };
          }
        }

        set((state) => ({
          lesions: state.lesions.map((l) =>
            l.id === lesionId
              ? {
                  ...l,
                  type: newType,
                  nonTargetStatus: newType === 'non_target' ? 'present' : undefined,
                  updatedAt: Date.now(),
                }
              : l
          ),
        }));

        return { success: true };
      },

      // ========================================================================
      // Assessment Actions
      // ========================================================================

      computeAssessment: () => {
        const state = get();

        if (!state.activeSessionId) {
          console.warn('[RECISTStore] No active session for assessment');
          return null;
        }

        const targetLesions = state.lesions.filter((l) => l.type === 'target');
        const nonTargetLesions = state.lesions.filter((l) => l.type === 'non_target');
        const newLesions = state.lesions.filter((l) => l.type === 'new');

        const currentSLD = computeCurrentSLD(targetLesions);
        const baselineSLD = state.baselineSLD || computeBaselineSLD(targetLesions);
        const nadirSLD = state.nadirSLD || baselineSLD;

        const sldChangeFromBaseline = baselineSLD > 0
          ? ((currentSLD - baselineSLD) / baselineSLD) * 100
          : 0;
        const sldChangeFromNadir = nadirSLD > 0
          ? ((currentSLD - nadirSLD) / nadirSLD) * 100
          : 0;
        const absoluteSldChangeFromNadir = currentSLD - nadirSLD;

        const targetResponse = classifyTargetResponse(currentSLD, baselineSLD, nadirSLD, targetLesions);
        const nonTargetOverallStatus = computeNonTargetOverallStatus(nonTargetLesions);
        const nonTargetResponse = classifyNonTargetResponse(nonTargetOverallStatus);
        const hasNewLesions = newLesions.length > 0;
        const overallResponse = computeOverallResponse(targetResponse, nonTargetResponse, hasNewLesions);

        const assessment: RECISTAssessment = {
          id: generateAssessmentId(),
          sessionId: state.activeSessionId,
          timepointId: state.currentTimepointId ?? '',
          assessmentDate: new Date().toISOString().split('T')[0],
          targetLesions: [...targetLesions],
          sumOfLongestDiameters: currentSLD,
          baselineSLD,
          nadirSLD,
          sldChangeFromBaseline,
          sldChangeFromNadir,
          absoluteSldChangeFromNadir,
          targetResponse,
          nonTargetLesions: [...nonTargetLesions],
          nonTargetOverallStatus,
          nonTargetResponse,
          newLesions: [...newLesions],
          hasNewLesions,
          overallResponse,
          isBaseline: state.baselineSLD === 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isConfirmed: false,
        };

        return assessment;
      },

      saveAssessment: (params) => {
        const state = get();

        if (!state.activeSessionId) {
          console.error('[RECISTStore] No active session');
          return null;
        }

        const assessment = get().computeAssessment();
        if (!assessment) {
          return null;
        }

        // Update assessment with provided params
        assessment.timepointId = params.timepointId;
        assessment.assessmentDate = params.assessmentDate;
        assessment.notes = params.notes;
        assessment.isBaseline = params.isBaseline ?? assessment.isBaseline;
        assessment.reviewedBy = params.reviewedBy;

        // If this is baseline, set baseline SLD
        if (assessment.isBaseline) {
          const baselineSLD = computeBaselineSLD(assessment.targetLesions);
          set({
            baselineSLD,
            nadirSLD: baselineSLD,
            nadirTimepointId: params.timepointId,
          });
          assessment.baselineSLD = baselineSLD;
          assessment.nadirSLD = baselineSLD;
        }

        // Save to session
        set((state) => {
          const session = state.sessions[state.activeSessionId!];
          if (!session) return state;

          const updatedSession: RECISTSession = {
            ...session,
            assessments: [...session.assessments, assessment],
            baselineAssessmentId: assessment.isBaseline
              ? assessment.id
              : session.baselineAssessmentId,
            currentAssessmentId: assessment.id,
            updatedAt: Date.now(),
          };

          return {
            sessions: {
              ...state.sessions,
              [state.activeSessionId!]: updatedSession,
            },
          };
        });

        // Update nadir if current SLD is lower
        const currentSLD = assessment.sumOfLongestDiameters;
        if (currentSLD < state.nadirSLD) {
          set({
            nadirSLD: currentSLD,
            nadirTimepointId: params.timepointId,
          });
        }

        console.log('[RECISTStore] Saved assessment:', assessment.id);
        return assessment.id;
      },

      confirmAssessment: (assessmentId, reviewedBy) => {
        set((state) => {
          if (!state.activeSessionId) return state;

          const session = state.sessions[state.activeSessionId];
          if (!session) return state;

          const updatedAssessments = session.assessments.map((a) =>
            a.id === assessmentId
              ? {
                  ...a,
                  isConfirmed: true,
                  reviewedBy: reviewedBy ?? a.reviewedBy,
                  updatedAt: Date.now(),
                }
              : a
          );

          return {
            sessions: {
              ...state.sessions,
              [state.activeSessionId]: {
                ...session,
                assessments: updatedAssessments,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setBaseline: () => {
        const state = get();
        const targetLesions = state.lesions.filter((l) => l.type === 'target');
        const baselineSLD = computeBaselineSLD(targetLesions);

        set({
          baselineSLD,
          nadirSLD: baselineSLD,
          nadirTimepointId: state.currentTimepointId,
        });

        console.log('[RECISTStore] Baseline set:', baselineSLD, 'mm');
      },

      updateNadir: (timepointId) => {
        const state = get();
        const currentSLD = computeCurrentSLD(state.lesions.filter((l) => l.type === 'target'));

        if (currentSLD < state.nadirSLD || state.nadirSLD === 0) {
          set({
            nadirSLD: currentSLD,
            nadirTimepointId: timepointId ?? state.currentTimepointId,
          });
          console.log('[RECISTStore] Nadir updated:', currentSLD, 'mm');
        }
      },

      // ========================================================================
      // Query Actions
      // ========================================================================

      getLesionsByType: (type) => {
        return get().lesions.filter((l) => l.type === type);
      },

      getTargetCountByOrgan: () => {
        const targetLesions = get().lesions.filter((l) => l.type === 'target');
        const byOrgan = new Map<string, number>();

        for (const lesion of targetLesions) {
          const count = byOrgan.get(lesion.anatomicalRegion) ?? 0;
          byOrgan.set(lesion.anatomicalRegion, count + 1);
        }

        return byOrgan;
      },

      getValidation: () => {
        return validateTargetLesionSelection(get().lesions);
      },

      getRemainingTargetSlots: () => {
        const targetLesions = get().lesions.filter((l) => l.type === 'target');
        const total = Math.max(0, RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL - targetLesions.length);

        const byOrgan = new Map<string, number>();
        const organCounts = new Map<string, number>();

        for (const lesion of targetLesions) {
          const count = organCounts.get(lesion.anatomicalRegion) ?? 0;
          organCounts.set(lesion.anatomicalRegion, count + 1);
        }

        for (const [organ, count] of organCounts) {
          byOrgan.set(organ, Math.max(0, RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN - count));
        }

        return { total, byOrgan };
      },

      getCurrentSLD: () => {
        return computeCurrentSLD(get().lesions.filter((l) => l.type === 'target'));
      },

      getSLDChangeFromBaseline: () => {
        const state = get();
        const currentSLD = computeCurrentSLD(state.lesions.filter((l) => l.type === 'target'));
        if (state.baselineSLD === 0) return 0;
        return ((currentSLD - state.baselineSLD) / state.baselineSLD) * 100;
      },

      getSLDChangeFromNadir: () => {
        const state = get();
        const currentSLD = computeCurrentSLD(state.lesions.filter((l) => l.type === 'target'));
        if (state.nadirSLD === 0) return 0;
        return ((currentSLD - state.nadirSLD) / state.nadirSLD) * 100;
      },

      getAllSessions: () => Object.values(get().sessions),

      getSession: (sessionId) => get().sessions[sessionId],

      getActiveSession: () => {
        const state = get();
        return state.activeSessionId ? state.sessions[state.activeSessionId] : undefined;
      },

      // ========================================================================
      // Utility Actions
      // ========================================================================

      loadAssessment: (assessmentId) => {
        const state = get();

        for (const session of Object.values(state.sessions)) {
          const assessment = session.assessments.find((a) => a.id === assessmentId);
          if (assessment) {
            set({
              activeSessionId: session.id,
              lesions: [
                ...assessment.targetLesions,
                ...assessment.nonTargetLesions,
                ...assessment.newLesions,
              ],
              baselineSLD: assessment.baselineSLD,
              nadirSLD: assessment.nadirSLD,
              currentTimepointId: assessment.timepointId,
            });
            console.log('[RECISTStore] Loaded assessment:', assessmentId);
            return;
          }
        }

        console.error('[RECISTStore] Assessment not found:', assessmentId);
      },

      clearWorkingState: () => {
        set({
          lesions: [],
          currentTimepointId: null,
        });
        console.log('[RECISTStore] Working state cleared');
      },

      reset: () => {
        set(initialState);
        console.log('[RECISTStore] Reset to initial state');
      },
    }),
    {
      name: 'medai-recist-sessions',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist sessions, not working state
        sessions: state.sessions,
      }),
    }
  )
);

// =============================================================================
// Selector Hooks
// =============================================================================

/**
 * Hook to get the active RECIST session.
 */
export function useActiveRECISTSession(): RECISTSession | undefined {
  return useRECISTStore((state) =>
    state.activeSessionId ? state.sessions[state.activeSessionId] : undefined
  );
}

/**
 * Hook to check if RECIST mode is active.
 */
export function useIsRECISTModeActive(): boolean {
  return useRECISTStore((state) => state.isRECISTModeActive);
}

/**
 * Hook to get target lesions.
 */
export function useTargetLesions(): RECISTLesion[] {
  return useRECISTStore((state) => state.lesions.filter((l) => l.type === 'target'));
}

/**
 * Hook to get non-target lesions.
 */
export function useNonTargetLesions(): RECISTLesion[] {
  return useRECISTStore((state) => state.lesions.filter((l) => l.type === 'non_target'));
}

/**
 * Hook to get new lesions.
 */
export function useNewLesions(): RECISTLesion[] {
  return useRECISTStore((state) => state.lesions.filter((l) => l.type === 'new'));
}

/**
 * Hook to get current SLD metrics.
 */
export function useSLDMetrics(): {
  currentSLD: number;
  baselineSLD: number;
  nadirSLD: number;
  changeFromBaseline: number;
  changeFromNadir: number;
} {
  return useRECISTStore((state) => {
    const targetLesions = state.lesions.filter((l) => l.type === 'target');
    const currentSLD = computeCurrentSLD(targetLesions);
    const baselineSLD = state.baselineSLD;
    const nadirSLD = state.nadirSLD;
    const changeFromBaseline = baselineSLD > 0
      ? ((currentSLD - baselineSLD) / baselineSLD) * 100
      : 0;
    const changeFromNadir = nadirSLD > 0
      ? ((currentSLD - nadirSLD) / nadirSLD) * 100
      : 0;

    return {
      currentSLD,
      baselineSLD,
      nadirSLD,
      changeFromBaseline,
      changeFromNadir,
    };
  });
}

export default useRECISTStore;
