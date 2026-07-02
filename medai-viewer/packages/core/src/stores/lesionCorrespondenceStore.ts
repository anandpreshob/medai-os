/**
 * Lesion Correspondence Store
 *
 * Zustand store for managing lesion correspondences across longitudinal timepoints.
 * Handles matching, confirmation, rejection, and persistence of lesion relationships.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  LesionCorrespondence,
  LesionCorrespondenceStatus,
  LesionInstance,
  LesionMatchMethod,
  LesionMatchingResult,
  LesionMatchingStatistics,
  SerializedLesionCorrespondence,
  generateCorrespondenceId,
  serializeCorrespondence,
  deserializeCorrespondence,
  MATCH_CONFIG,
} from './lesionCorrespondenceTypes';

/**
 * State interface for lesion correspondence store.
 */
export interface LesionCorrespondenceState {
  // ============================================================================
  // State
  // ============================================================================

  /** All correspondences keyed by session ID, then by correspondence ID */
  correspondencesBySession: Record<string, Record<string, LesionCorrespondence>>;

  /** Unmatched lesions by session ID, then by timepoint ID */
  unmatchedBySession: Record<string, Record<string, LesionInstance[]>>;

  /** Currently selected correspondence ID for editing */
  selectedCorrespondenceId: string | null;

  /** Whether matching is in progress */
  isMatching: boolean;

  /** Last matching error */
  matchingError: string | null;

  /** Last matching result for display */
  lastMatchingResult: LesionMatchingResult | null;

  // ============================================================================
  // Correspondence Management Actions
  // ============================================================================

  /**
   * Add a new correspondence to a session.
   */
  addCorrespondence: (
    sessionId: string,
    correspondence: Omit<LesionCorrespondence, 'id' | 'createdAt' | 'updatedAt'>
  ) => string;

  /**
   * Update an existing correspondence.
   */
  updateCorrespondence: (
    sessionId: string,
    correspondenceId: string,
    updates: Partial<Pick<LesionCorrespondence, 'canonicalLabel' | 'notes' | 'status' | 'matchConfidence'>>
  ) => void;

  /**
   * Remove a correspondence.
   */
  removeCorrespondence: (sessionId: string, correspondenceId: string) => void;

  /**
   * Add a lesion instance to an existing correspondence.
   */
  addInstanceToCorrespondence: (
    sessionId: string,
    correspondenceId: string,
    instance: LesionInstance
  ) => void;

  /**
   * Remove a lesion instance from a correspondence.
   */
  removeInstanceFromCorrespondence: (
    sessionId: string,
    correspondenceId: string,
    timepointId: string
  ) => void;

  // ============================================================================
  // Status Management Actions
  // ============================================================================

  /**
   * Confirm a correspondence (mark as verified).
   */
  confirmCorrespondence: (sessionId: string, correspondenceId: string) => void;

  /**
   * Reject a correspondence (mark as incorrect).
   */
  rejectCorrespondence: (sessionId: string, correspondenceId: string) => void;

  /**
   * Reset a correspondence to pending status.
   */
  resetCorrespondenceStatus: (sessionId: string, correspondenceId: string) => void;

  /**
   * Confirm all high-confidence correspondences.
   */
  confirmHighConfidence: (sessionId: string, threshold?: number) => number;

  // ============================================================================
  // Matching Actions
  // ============================================================================

  /**
   * Set the result of a matching operation.
   */
  setMatchingResult: (sessionId: string, result: LesionMatchingResult) => void;

  /**
   * Set matching state.
   */
  setIsMatching: (isMatching: boolean) => void;

  /**
   * Set matching error.
   */
  setMatchingError: (error: string | null) => void;

  /**
   * Clear all correspondences for a session.
   */
  clearSessionCorrespondences: (sessionId: string) => void;

  // ============================================================================
  // Selection Actions
  // ============================================================================

  /**
   * Select a correspondence for editing/viewing.
   */
  selectCorrespondence: (correspondenceId: string | null) => void;

  // ============================================================================
  // Query Actions
  // ============================================================================

  /**
   * Get all correspondences for a session.
   */
  getCorrespondences: (sessionId: string) => LesionCorrespondence[];

  /**
   * Get a specific correspondence.
   */
  getCorrespondence: (sessionId: string, correspondenceId: string) => LesionCorrespondence | undefined;

  /**
   * Get correspondences by status.
   */
  getCorrespondencesByStatus: (sessionId: string, status: LesionCorrespondenceStatus) => LesionCorrespondence[];

  /**
   * Get unmatched lesions for a session/timepoint.
   */
  getUnmatchedLesions: (sessionId: string, timepointId?: string) => LesionInstance[];

  /**
   * Get statistics for a session.
   */
  getStatistics: (sessionId: string) => LesionMatchingStatistics | null;

  /**
   * Find correspondence containing a specific lesion instance.
   */
  findCorrespondenceByInstance: (
    sessionId: string,
    timepointId: string,
    segmentIndex: number
  ) => LesionCorrespondence | undefined;

  // ============================================================================
  // Utility Actions
  // ============================================================================

  /**
   * Create a manual correspondence between lesions.
   */
  createManualCorrespondence: (
    sessionId: string,
    instances: LesionInstance[],
    canonicalLabel: string
  ) => string;

  /**
   * Merge two correspondences.
   */
  mergeCorrespondences: (
    sessionId: string,
    sourceId: string,
    targetId: string
  ) => void;

  /**
   * Split a correspondence (remove instances to unmatched).
   */
  splitCorrespondence: (
    sessionId: string,
    correspondenceId: string,
    timepointIdsToRemove: string[]
  ) => void;

  /**
   * Reset entire store.
   */
  reset: () => void;
}

/**
 * Initial state.
 */
const initialState = {
  correspondencesBySession: {} as Record<string, Record<string, LesionCorrespondence>>,
  unmatchedBySession: {} as Record<string, Record<string, LesionInstance[]>>,
  selectedCorrespondenceId: null as string | null,
  isMatching: false,
  matchingError: null as string | null,
  lastMatchingResult: null as LesionMatchingResult | null,
};

/**
 * Lesion correspondence store with persistence.
 */
export const useLesionCorrespondenceStore = create<LesionCorrespondenceState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================================================
      // Correspondence Management
      // ========================================================================

      addCorrespondence: (sessionId, correspondenceData) => {
        const id = generateCorrespondenceId();
        const now = Date.now();

        const correspondence: LesionCorrespondence = {
          ...correspondenceData,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          const sessionCorrespondences = state.correspondencesBySession[sessionId] || {};

          return {
            correspondencesBySession: {
              ...state.correspondencesBySession,
              [sessionId]: {
                ...sessionCorrespondences,
                [id]: correspondence,
              },
            },
          };
        });

        console.log('[LesionCorrespondenceStore] Added correspondence:', id, 'to session:', sessionId);
        return id;
      },

      updateCorrespondence: (sessionId, correspondenceId, updates) => {
        set((state) => {
          const sessionCorrespondences = state.correspondencesBySession[sessionId];
          if (!sessionCorrespondences) return state;

          const correspondence = sessionCorrespondences[correspondenceId];
          if (!correspondence) return state;

          return {
            correspondencesBySession: {
              ...state.correspondencesBySession,
              [sessionId]: {
                ...sessionCorrespondences,
                [correspondenceId]: {
                  ...correspondence,
                  ...updates,
                  updatedAt: Date.now(),
                },
              },
            },
          };
        });
      },

      removeCorrespondence: (sessionId, correspondenceId) => {
        set((state) => {
          const sessionCorrespondences = state.correspondencesBySession[sessionId];
          if (!sessionCorrespondences) return state;

          const { [correspondenceId]: removed, ...remaining } = sessionCorrespondences;

          // Move instances to unmatched
          let unmatchedByTimepoint = { ...(state.unmatchedBySession[sessionId] || {}) };
          if (removed) {
            removed.instances.forEach((instance, timepointId) => {
              const existing = unmatchedByTimepoint[timepointId] || [];
              unmatchedByTimepoint[timepointId] = [...existing, instance];
            });
          }

          return {
            correspondencesBySession: {
              ...state.correspondencesBySession,
              [sessionId]: remaining,
            },
            unmatchedBySession: {
              ...state.unmatchedBySession,
              [sessionId]: unmatchedByTimepoint,
            },
            selectedCorrespondenceId:
              state.selectedCorrespondenceId === correspondenceId
                ? null
                : state.selectedCorrespondenceId,
          };
        });

        console.log('[LesionCorrespondenceStore] Removed correspondence:', correspondenceId);
      },

      addInstanceToCorrespondence: (sessionId, correspondenceId, instance) => {
        set((state) => {
          const sessionCorrespondences = state.correspondencesBySession[sessionId];
          if (!sessionCorrespondences) return state;

          const correspondence = sessionCorrespondences[correspondenceId];
          if (!correspondence) return state;

          const newInstances = new Map(correspondence.instances);
          newInstances.set(instance.timepointId, instance);

          // Remove from unmatched if present
          const unmatchedByTimepoint = { ...(state.unmatchedBySession[sessionId] || {}) };
          if (unmatchedByTimepoint[instance.timepointId]) {
            unmatchedByTimepoint[instance.timepointId] = unmatchedByTimepoint[instance.timepointId].filter(
              (l) => l.segmentIndex !== instance.segmentIndex
            );
          }

          return {
            correspondencesBySession: {
              ...state.correspondencesBySession,
              [sessionId]: {
                ...sessionCorrespondences,
                [correspondenceId]: {
                  ...correspondence,
                  instances: newInstances,
                  updatedAt: Date.now(),
                },
              },
            },
            unmatchedBySession: {
              ...state.unmatchedBySession,
              [sessionId]: unmatchedByTimepoint,
            },
          };
        });
      },

      removeInstanceFromCorrespondence: (sessionId, correspondenceId, timepointId) => {
        set((state) => {
          const sessionCorrespondences = state.correspondencesBySession[sessionId];
          if (!sessionCorrespondences) return state;

          const correspondence = sessionCorrespondences[correspondenceId];
          if (!correspondence) return state;

          const instance = correspondence.instances.get(timepointId);
          if (!instance) return state;

          const newInstances = new Map(correspondence.instances);
          newInstances.delete(timepointId);

          // Add to unmatched
          const unmatchedByTimepoint = { ...(state.unmatchedBySession[sessionId] || {}) };
          const existing = unmatchedByTimepoint[timepointId] || [];
          unmatchedByTimepoint[timepointId] = [...existing, instance];

          // If only 0 or 1 instance remains, remove correspondence
          if (newInstances.size <= 1) {
            const { [correspondenceId]: removed, ...remaining } = sessionCorrespondences;

            // Move remaining instance to unmatched too
            newInstances.forEach((inst, tpId) => {
              const ex = unmatchedByTimepoint[tpId] || [];
              unmatchedByTimepoint[tpId] = [...ex, inst];
            });

            return {
              correspondencesBySession: {
                ...state.correspondencesBySession,
                [sessionId]: remaining,
              },
              unmatchedBySession: {
                ...state.unmatchedBySession,
                [sessionId]: unmatchedByTimepoint,
              },
            };
          }

          return {
            correspondencesBySession: {
              ...state.correspondencesBySession,
              [sessionId]: {
                ...sessionCorrespondences,
                [correspondenceId]: {
                  ...correspondence,
                  instances: newInstances,
                  updatedAt: Date.now(),
                },
              },
            },
            unmatchedBySession: {
              ...state.unmatchedBySession,
              [sessionId]: unmatchedByTimepoint,
            },
          };
        });
      },

      // ========================================================================
      // Status Management
      // ========================================================================

      confirmCorrespondence: (sessionId, correspondenceId) => {
        get().updateCorrespondence(sessionId, correspondenceId, { status: 'confirmed' });
        console.log('[LesionCorrespondenceStore] Confirmed correspondence:', correspondenceId);
      },

      rejectCorrespondence: (sessionId, correspondenceId) => {
        get().updateCorrespondence(sessionId, correspondenceId, { status: 'rejected' });
        console.log('[LesionCorrespondenceStore] Rejected correspondence:', correspondenceId);
      },

      resetCorrespondenceStatus: (sessionId, correspondenceId) => {
        get().updateCorrespondence(sessionId, correspondenceId, { status: 'pending' });
      },

      confirmHighConfidence: (sessionId, threshold = MATCH_CONFIG.highConfidenceThreshold) => {
        const correspondences = get().getCorrespondences(sessionId);
        let confirmedCount = 0;

        correspondences.forEach((corr) => {
          if (corr.status === 'pending' && corr.matchConfidence >= threshold) {
            get().confirmCorrespondence(sessionId, corr.id);
            confirmedCount++;
          }
        });

        console.log(`[LesionCorrespondenceStore] Auto-confirmed ${confirmedCount} high-confidence correspondences`);
        return confirmedCount;
      },

      // ========================================================================
      // Matching Actions
      // ========================================================================

      setMatchingResult: (sessionId, result) => {
        set((state) => {
          // Convert correspondences array to record
          const correspondenceRecord: Record<string, LesionCorrespondence> = {};
          result.correspondences.forEach((corr) => {
            correspondenceRecord[corr.id] = corr;
          });

          // Convert unmatched map to record
          const unmatchedRecord: Record<string, LesionInstance[]> = {};
          result.unmatchedByTimepoint.forEach((instances, timepointId) => {
            unmatchedRecord[timepointId] = instances;
          });

          return {
            correspondencesBySession: {
              ...state.correspondencesBySession,
              [sessionId]: correspondenceRecord,
            },
            unmatchedBySession: {
              ...state.unmatchedBySession,
              [sessionId]: unmatchedRecord,
            },
            lastMatchingResult: result,
            isMatching: false,
            matchingError: null,
          };
        });

        console.log('[LesionCorrespondenceStore] Set matching result for session:', sessionId);
      },

      setIsMatching: (isMatching) => {
        set({ isMatching });
      },

      setMatchingError: (error) => {
        set({ matchingError: error, isMatching: false });
      },

      clearSessionCorrespondences: (sessionId) => {
        set((state) => {
          const { [sessionId]: removed1, ...remainingCorr } = state.correspondencesBySession;
          const { [sessionId]: removed2, ...remainingUnmatched } = state.unmatchedBySession;

          return {
            correspondencesBySession: remainingCorr,
            unmatchedBySession: remainingUnmatched,
            lastMatchingResult: null,
          };
        });

        console.log('[LesionCorrespondenceStore] Cleared correspondences for session:', sessionId);
      },

      // ========================================================================
      // Selection
      // ========================================================================

      selectCorrespondence: (correspondenceId) => {
        set({ selectedCorrespondenceId: correspondenceId });
      },

      // ========================================================================
      // Query Actions
      // ========================================================================

      getCorrespondences: (sessionId) => {
        const sessionCorrespondences = get().correspondencesBySession[sessionId];
        if (!sessionCorrespondences) return [];
        return Object.values(sessionCorrespondences);
      },

      getCorrespondence: (sessionId, correspondenceId) => {
        const sessionCorrespondences = get().correspondencesBySession[sessionId];
        if (!sessionCorrespondences) return undefined;
        return sessionCorrespondences[correspondenceId];
      },

      getCorrespondencesByStatus: (sessionId, status) => {
        return get().getCorrespondences(sessionId).filter((c) => c.status === status);
      },

      getUnmatchedLesions: (sessionId, timepointId) => {
        const sessionUnmatched = get().unmatchedBySession[sessionId];
        if (!sessionUnmatched) return [];

        if (timepointId) {
          return sessionUnmatched[timepointId] || [];
        }

        // Return all unmatched across timepoints
        return Object.values(sessionUnmatched).flat();
      },

      getStatistics: (sessionId) => {
        const correspondences = get().getCorrespondences(sessionId);
        const unmatchedByTimepoint = get().unmatchedBySession[sessionId] || {};

        if (correspondences.length === 0) {
          return null;
        }

        const countByMethod: Record<LesionMatchMethod, number> = {
          label: 0,
          centroid: 0,
          registration: 0,
          manual: 0,
        };

        const countByStatus: Record<LesionCorrespondenceStatus, number> = {
          confirmed: 0,
          pending: 0,
          rejected: 0,
        };

        let totalConfidence = 0;

        correspondences.forEach((corr) => {
          countByMethod[corr.matchMethod]++;
          countByStatus[corr.status]++;
          totalConfidence += corr.matchConfidence;
        });

        // Calculate baseline and follow-up lesion counts
        const timepointIds = new Set<string>();
        correspondences.forEach((corr) => {
          corr.instances.forEach((_, tpId) => timepointIds.add(tpId));
        });
        Object.keys(unmatchedByTimepoint).forEach((tpId) => timepointIds.add(tpId));

        const sortedTimepoints = Array.from(timepointIds).sort();
        const baselineId = sortedTimepoints[0];
        const latestFollowUpId = sortedTimepoints[sortedTimepoints.length - 1];

        let baselineCount = 0;
        let latestCount = 0;

        correspondences.forEach((corr) => {
          if (corr.instances.has(baselineId)) baselineCount++;
          if (corr.instances.has(latestFollowUpId)) latestCount++;
        });

        baselineCount += (unmatchedByTimepoint[baselineId] || []).length;
        latestCount += (unmatchedByTimepoint[latestFollowUpId] || []).length;

        // New lesions = in latest but not baseline
        const newLesionCount = correspondences.filter(
          (c) => !c.instances.has(baselineId) && c.instances.has(latestFollowUpId)
        ).length + (unmatchedByTimepoint[latestFollowUpId] || []).length;

        // Resolved = in baseline but not latest
        const resolvedLesionCount = correspondences.filter(
          (c) => c.instances.has(baselineId) && !c.instances.has(latestFollowUpId)
        ).length + (unmatchedByTimepoint[baselineId] || []).length;

        return {
          baselineLesionCount: baselineCount,
          latestFollowUpLesionCount: latestCount,
          matchedCount: correspondences.length,
          newLesionCount,
          resolvedLesionCount,
          averageConfidence: correspondences.length > 0 ? totalConfidence / correspondences.length : 0,
          countByMethod,
          countByStatus,
        };
      },

      findCorrespondenceByInstance: (sessionId, timepointId, segmentIndex) => {
        const correspondences = get().getCorrespondences(sessionId);
        return correspondences.find((corr) => {
          const instance = corr.instances.get(timepointId);
          return instance?.segmentIndex === segmentIndex;
        });
      },

      // ========================================================================
      // Utility Actions
      // ========================================================================

      createManualCorrespondence: (sessionId, instances, canonicalLabel) => {
        if (instances.length < 2) {
          console.warn('[LesionCorrespondenceStore] Manual correspondence requires at least 2 instances');
          return '';
        }

        const instanceMap = new Map<string, LesionInstance>();
        instances.forEach((inst) => {
          instanceMap.set(inst.timepointId, inst);
        });

        const id = get().addCorrespondence(sessionId, {
          canonicalLabel,
          instances: instanceMap,
          matchConfidence: 1.0, // Manual = 100% confidence
          matchMethod: 'manual',
          status: 'confirmed', // Manual = auto-confirmed
        });

        // Remove from unmatched
        set((state) => {
          const unmatchedByTimepoint = { ...(state.unmatchedBySession[sessionId] || {}) };

          instances.forEach((inst) => {
            if (unmatchedByTimepoint[inst.timepointId]) {
              unmatchedByTimepoint[inst.timepointId] = unmatchedByTimepoint[inst.timepointId].filter(
                (l) => l.segmentIndex !== inst.segmentIndex
              );
            }
          });

          return {
            unmatchedBySession: {
              ...state.unmatchedBySession,
              [sessionId]: unmatchedByTimepoint,
            },
          };
        });

        console.log('[LesionCorrespondenceStore] Created manual correspondence:', id);
        return id;
      },

      mergeCorrespondences: (sessionId, sourceId, targetId) => {
        const source = get().getCorrespondence(sessionId, sourceId);
        const target = get().getCorrespondence(sessionId, targetId);

        if (!source || !target) {
          console.warn('[LesionCorrespondenceStore] Cannot merge: correspondence not found');
          return;
        }

        // Add all source instances to target
        source.instances.forEach((instance, timepointId) => {
          if (!target.instances.has(timepointId)) {
            get().addInstanceToCorrespondence(sessionId, targetId, instance);
          }
        });

        // Remove source correspondence
        get().removeCorrespondence(sessionId, sourceId);

        // Update target confidence (average)
        const newConfidence = (source.matchConfidence + target.matchConfidence) / 2;
        get().updateCorrespondence(sessionId, targetId, {
          matchConfidence: newConfidence,
          status: 'pending', // Require re-confirmation after merge
        });

        console.log('[LesionCorrespondenceStore] Merged correspondence:', sourceId, 'into:', targetId);
      },

      splitCorrespondence: (sessionId, correspondenceId, timepointIdsToRemove) => {
        timepointIdsToRemove.forEach((tpId) => {
          get().removeInstanceFromCorrespondence(sessionId, correspondenceId, tpId);
        });
      },

      reset: () => {
        set(initialState);
        console.log('[LesionCorrespondenceStore] Reset to initial state');
      },
    }),
    {
      name: 'medai-lesion-correspondences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist correspondences and unmatched, not transient state
        correspondencesBySession: Object.fromEntries(
          Object.entries(state.correspondencesBySession).map(([sessionId, correspondences]) => [
            sessionId,
            Object.fromEntries(
              Object.entries(correspondences).map(([id, corr]) => [
                id,
                serializeCorrespondence(corr),
              ])
            ),
          ])
        ),
        unmatchedBySession: state.unmatchedBySession,
      }),
      onRehydrateStorage: () => (state) => {
        // Deserialize correspondences on load
        if (state) {
          const deserialized: Record<string, Record<string, LesionCorrespondence>> = {};

          Object.entries(state.correspondencesBySession).forEach(([sessionId, correspondences]) => {
            deserialized[sessionId] = {};
            Object.entries(correspondences).forEach(([id, serialized]) => {
              deserialized[sessionId][id] = deserializeCorrespondence(
                serialized as unknown as SerializedLesionCorrespondence
              );
            });
          });

          state.correspondencesBySession = deserialized;
        }
      },
    }
  )
);

/**
 * Hook to get correspondences for the active session.
 */
export function useActiveSessionCorrespondences(sessionId: string | null): LesionCorrespondence[] {
  return useLesionCorrespondenceStore((state) =>
    sessionId ? Object.values(state.correspondencesBySession[sessionId] || {}) : []
  );
}

/**
 * Hook to get pending correspondences count.
 */
export function usePendingCorrespondenceCount(sessionId: string | null): number {
  return useLesionCorrespondenceStore((state) => {
    if (!sessionId) return 0;
    const correspondences = state.correspondencesBySession[sessionId] || {};
    return Object.values(correspondences).filter((c) => c.status === 'pending').length;
  });
}

export default useLesionCorrespondenceStore;
