/**
 * Longitudinal Sessioning Store
 *
 * Zustand store for managing longitudinal comparison sessions.
 * Enables radiologists to compare multiple studies across timepoints.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  LongitudinalSession,
  LongitudinalTimepoint,
  LongitudinalSyncSettings,
  LongitudinalLayoutMode,
  DEFAULT_SYNC_SETTINGS,
  generateSessionId,
  generateTimepointId,
} from './longitudinalTypes';

/**
 * Longitudinal store state interface.
 */
export interface LongitudinalState {
  // ============================================================================
  // Session State
  // ============================================================================

  /** All longitudinal sessions, keyed by session ID */
  sessions: Record<string, LongitudinalSession>;

  /** Currently active session ID (null if no session active) */
  activeSessionId: string | null;

  /** Currently selected/visible timepoint IDs within the active session */
  activeTimepointIds: string[];

  // ============================================================================
  // Viewport Settings
  // ============================================================================

  /** Current layout mode for comparison view */
  layoutMode: LongitudinalLayoutMode;

  /** Synchronization settings for linked viewports */
  syncSettings: LongitudinalSyncSettings;

  /** Whether sync is currently enabled */
  syncEnabled: boolean;

  // ============================================================================
  // Session Management Actions
  // ============================================================================

  /**
   * Create a new longitudinal session.
   * @param params - Session parameters
   * @returns The created session ID
   */
  createSession: (params: {
    patientId: string;
    patientName?: string;
    modality: string;
    anatomy: string;
    description?: string;
    responseAssessment?: LongitudinalSession['responseAssessment'];
    suiteId?: string;
  }) => string;

  /**
   * Delete a session by ID.
   */
  deleteSession: (sessionId: string) => void;

  /**
   * Set the active session.
   * @param sessionId - Session ID to activate, or null to deactivate
   */
  setActiveSession: (sessionId: string | null) => void;

  /**
   * Update session metadata.
   */
  updateSession: (sessionId: string, updates: Partial<Pick<
    LongitudinalSession,
    'description' | 'anatomy' | 'responseAssessment'
  >>) => void;

  // ============================================================================
  // Timepoint Management Actions
  // ============================================================================

  /**
   * Add a timepoint to a session.
   * @param sessionId - Target session ID
   * @param timepoint - Timepoint data (id will be generated if not provided)
   * @returns The timepoint ID
   */
  addTimepoint: (sessionId: string, timepoint: Omit<LongitudinalTimepoint, 'id' | 'order'> & { id?: string }) => string;

  /**
   * Remove a timepoint from a session.
   */
  removeTimepoint: (sessionId: string, timepointId: string) => void;

  /**
   * Update a timepoint's metadata.
   */
  updateTimepoint: (sessionId: string, timepointId: string, updates: Partial<Pick<
    LongitudinalTimepoint,
    'label' | 'notes' | 'segmentationIds'
  >>) => void;

  /**
   * Reorder timepoints within a session.
   * @param sessionId - Target session ID
   * @param timepointIds - New order of timepoint IDs
   */
  reorderTimepoints: (sessionId: string, timepointIds: string[]) => void;

  /**
   * Set which timepoints are actively visible in the comparison view.
   */
  setActiveTimepoints: (timepointIds: string[]) => void;

  // ============================================================================
  // Viewport Settings Actions
  // ============================================================================

  /**
   * Set the layout mode for longitudinal comparison.
   */
  setLayoutMode: (mode: LongitudinalLayoutMode) => void;

  /**
   * Update sync settings.
   */
  setSyncSettings: (settings: Partial<LongitudinalSyncSettings>) => void;

  /**
   * Toggle sync on/off.
   */
  toggleSync: () => void;

  /**
   * Enable/disable specific sync option.
   */
  setSyncEnabled: (enabled: boolean) => void;

  // ============================================================================
  // Utility Actions
  // ============================================================================

  /**
   * Get a session by ID.
   */
  getSession: (sessionId: string) => LongitudinalSession | undefined;

  /**
   * Get the active session.
   */
  getActiveSession: () => LongitudinalSession | undefined;

  /**
   * Get sessions for a specific patient.
   */
  getSessionsByPatient: (patientId: string) => LongitudinalSession[];

  /**
   * Get all sessions as an array.
   */
  getAllSessions: () => LongitudinalSession[];

  /**
   * Clear all sessions (for testing/reset).
   */
  clearAllSessions: () => void;

  /**
   * Reset to initial state.
   */
  reset: () => void;
}

/**
 * Initial state for the longitudinal store.
 */
const initialState = {
  sessions: {} as Record<string, LongitudinalSession>,
  activeSessionId: null as string | null,
  activeTimepointIds: [] as string[],
  layoutMode: 'longitudinal-2' as LongitudinalLayoutMode,
  syncSettings: { ...DEFAULT_SYNC_SETTINGS },
  syncEnabled: true,
};

/**
 * Longitudinal sessioning store.
 *
 * Manages multi-study comparison sessions with persistence.
 */
export const useLongitudinalStore = create<LongitudinalState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================================================
      // Session Management
      // ========================================================================

      createSession: (params) => {
        const sessionId = generateSessionId();
        const now = Date.now();

        const session: LongitudinalSession = {
          id: sessionId,
          patientId: params.patientId,
          patientName: params.patientName,
          modality: params.modality,
          anatomy: params.anatomy,
          description: params.description,
          responseAssessment: params.responseAssessment,
          suiteId: params.suiteId,
          timepoints: [],
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: session,
          },
          activeSessionId: sessionId,
          activeTimepointIds: [],
        }));

        console.log('[LongitudinalStore] Created session:', sessionId);
        return sessionId;
      },

      deleteSession: (sessionId) => {
        set((state) => {
          const { [sessionId]: deleted, ...remaining } = state.sessions;
          const newActiveId = state.activeSessionId === sessionId ? null : state.activeSessionId;

          return {
            sessions: remaining,
            activeSessionId: newActiveId,
            activeTimepointIds: newActiveId === null ? [] : state.activeTimepointIds,
          };
        });
        console.log('[LongitudinalStore] Deleted session:', sessionId);
      },

      setActiveSession: (sessionId) => {
        const session = sessionId ? get().sessions[sessionId] : undefined;

        set({
          activeSessionId: sessionId,
          // Auto-select first two timepoints when activating a session
          activeTimepointIds: session?.timepoints.slice(0, 2).map((tp) => tp.id) ?? [],
        });

        console.log('[LongitudinalStore] Active session set:', sessionId);
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

      // ========================================================================
      // Timepoint Management
      // ========================================================================

      addTimepoint: (sessionId, timepointData) => {
        const timepointId = timepointData.id ?? generateTimepointId();
        const session = get().sessions[sessionId];

        if (!session) {
          console.error('[LongitudinalStore] Session not found:', sessionId);
          return timepointId;
        }

        const order = session.timepoints.length;
        const timepoint: LongitudinalTimepoint = {
          ...timepointData,
          id: timepointId,
          order,
        };

        set((state) => {
          const existingSession = state.sessions[sessionId];
          if (!existingSession) return state;

          const updatedSession: LongitudinalSession = {
            ...existingSession,
            timepoints: [...existingSession.timepoints, timepoint],
            updatedAt: Date.now(),
          };

          // Auto-add to active timepoints if we have fewer than the layout supports
          let newActiveTimepointIds = state.activeTimepointIds;
          const maxTimepoints = state.layoutMode === 'longitudinal-3' ? 3 : 2;

          if (
            state.activeSessionId === sessionId &&
            state.activeTimepointIds.length < maxTimepoints
          ) {
            newActiveTimepointIds = [...state.activeTimepointIds, timepointId];
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: updatedSession,
            },
            activeTimepointIds: newActiveTimepointIds,
          };
        });

        console.log('[LongitudinalStore] Added timepoint:', timepointId, 'to session:', sessionId);
        return timepointId;
      },

      removeTimepoint: (sessionId, timepointId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const filteredTimepoints = session.timepoints.filter((tp) => tp.id !== timepointId);

          // Re-index orders
          const reorderedTimepoints = filteredTimepoints.map((tp, index) => ({
            ...tp,
            order: index,
          }));

          const updatedSession: LongitudinalSession = {
            ...session,
            timepoints: reorderedTimepoints,
            updatedAt: Date.now(),
          };

          // Remove from active timepoints if present
          const newActiveTimepointIds = state.activeTimepointIds.filter(
            (id) => id !== timepointId
          );

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: updatedSession,
            },
            activeTimepointIds: newActiveTimepointIds,
          };
        });

        console.log('[LongitudinalStore] Removed timepoint:', timepointId);
      },

      updateTimepoint: (sessionId, timepointId, updates) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const updatedTimepoints = session.timepoints.map((tp) =>
            tp.id === timepointId ? { ...tp, ...updates } : tp
          );

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                timepoints: updatedTimepoints,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      reorderTimepoints: (sessionId, timepointIds) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          // Create a map of existing timepoints
          const timepointMap = new Map(session.timepoints.map((tp) => [tp.id, tp]));

          // Reorder based on provided IDs
          const reorderedTimepoints = timepointIds
            .map((id, index) => {
              const tp = timepointMap.get(id);
              return tp ? { ...tp, order: index } : null;
            })
            .filter((tp): tp is LongitudinalTimepoint => tp !== null);

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                timepoints: reorderedTimepoints,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setActiveTimepoints: (timepointIds) => {
        set({ activeTimepointIds: timepointIds });
      },

      // ========================================================================
      // Viewport Settings
      // ========================================================================

      setLayoutMode: (mode) => {
        set({ layoutMode: mode });

        // Adjust active timepoints to match new layout capacity
        const maxTimepoints = mode === 'longitudinal-3' ? 3 : mode === 'longitudinal-4' ? 4 : 2;
        const currentActive = get().activeTimepointIds;

        if (currentActive.length > maxTimepoints) {
          set({ activeTimepointIds: currentActive.slice(0, maxTimepoints) });
        }
      },

      setSyncSettings: (settings) => {
        set((state) => ({
          syncSettings: {
            ...state.syncSettings,
            ...settings,
          },
        }));
      },

      toggleSync: () => {
        set((state) => ({ syncEnabled: !state.syncEnabled }));
      },

      setSyncEnabled: (enabled) => {
        set({ syncEnabled: enabled });
      },

      // ========================================================================
      // Utilities
      // ========================================================================

      getSession: (sessionId) => get().sessions[sessionId],

      getActiveSession: () => {
        const { activeSessionId, sessions } = get();
        return activeSessionId ? sessions[activeSessionId] : undefined;
      },

      getSessionsByPatient: (patientId) => {
        return Object.values(get().sessions).filter(
          (session) => session.patientId === patientId
        );
      },

      getAllSessions: () => Object.values(get().sessions),

      clearAllSessions: () => {
        set({ sessions: {}, activeSessionId: null, activeTimepointIds: [] });
        console.log('[LongitudinalStore] Cleared all sessions');
      },

      reset: () => {
        set(initialState);
        console.log('[LongitudinalStore] Reset to initial state');
      },
    }),
    {
      name: 'medai-longitudinal-sessions',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist sessions and settings, not active state
        sessions: state.sessions,
        syncSettings: state.syncSettings,
        layoutMode: state.layoutMode,
      }),
    }
  )
);

/**
 * Hook to get just the active session (convenience).
 */
export function useActiveSession(): LongitudinalSession | undefined {
  return useLongitudinalStore((state) =>
    state.activeSessionId ? state.sessions[state.activeSessionId] : undefined
  );
}

/**
 * Hook to get active timepoints data.
 */
export function useActiveTimepoints(): LongitudinalTimepoint[] {
  return useLongitudinalStore((state) => {
    const session = state.activeSessionId ? state.sessions[state.activeSessionId] : undefined;
    if (!session) return [];

    return state.activeTimepointIds
      .map((id) => session.timepoints.find((tp) => tp.id === id))
      .filter((tp): tp is LongitudinalTimepoint => tp !== undefined);
  });
}

/**
 * Hook to check if longitudinal mode is active.
 */
export function useIsLongitudinalActive(): boolean {
  return useLongitudinalStore((state) =>
    state.activeSessionId !== null && state.activeTimepointIds.length >= 2
  );
}
