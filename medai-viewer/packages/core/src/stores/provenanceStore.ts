/**
 * Provenance Store - Zustand store for edit and inference tracking
 *
 * Tracks all modifications to segmentations including:
 * - AI inference events (model, parameters, timestamp)
 * - Manual edits (brush, eraser, smart edit, etc.)
 * - Reviewer actions (draft/final status changes)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  EditRecord,
  EditType,
  ModelProvenance,
  ReviewerInfo,
  ReviewStatus,
  SegmentationProvenance,
} from '../schemas/oncologyExportSchema';

// ============================================================================
// Types
// ============================================================================

/**
 * Inference event record
 */
export interface InferenceEvent {
  /** Unique event ID */
  id: string;

  /** Segmentation ID this inference produced */
  segmentationId: string;

  /** Model provenance information */
  model: ModelProvenance;

  /** Segments created by this inference */
  segmentsCreated: number[];

  /** Duration of inference in ms */
  durationMs?: number;
}

/**
 * Per-segmentation provenance state
 */
export interface SegmentationProvenanceState {
  /** Segmentation ID */
  segmentationId: string;

  /** Review status */
  status: ReviewStatus;

  /** Latest inference event */
  latestInference?: InferenceEvent;

  /** All edit history */
  editHistory: EditRecord[];

  /** Reviewer information (if reviewed) */
  reviewer?: ReviewerInfo;

  /** Whether edits are allowed (false if status is 'final') */
  editsAllowed: boolean;
}

/**
 * Provenance store state
 */
export interface ProvenanceState {
  /** Provenance per segmentation */
  segmentations: Record<string, SegmentationProvenanceState>;

  /** Current authenticated user (if any) */
  currentUser?: string;

  // ========================================
  // Actions
  // ========================================

  /**
   * Initialize provenance for a new segmentation
   */
  initializeProvenance: (segmentationId: string, inferenceEvent?: InferenceEvent) => void;

  /**
   * Record an inference event
   */
  recordInference: (
    segmentationId: string,
    modelName: string,
    modelVersion: string,
    parameters: Record<string, unknown>,
    segmentsCreated: number[],
    durationMs?: number
  ) => void;

  /**
   * Record an edit event
   */
  recordEdit: (
    segmentationId: string,
    editType: EditType,
    affectedSegments: number[],
    parameters?: Record<string, unknown>,
    description?: string
  ) => boolean; // Returns false if edits not allowed

  /**
   * Set review status (draft/final)
   */
  setReviewStatus: (
    segmentationId: string,
    status: ReviewStatus,
    reviewerUsername?: string,
    notes?: string
  ) => void;

  /**
   * Get provenance for a segmentation
   */
  getProvenance: (segmentationId: string) => SegmentationProvenanceState | undefined;

  /**
   * Get full provenance for export
   */
  getExportProvenance: (segmentationId: string) => SegmentationProvenance | undefined;

  /**
   * Check if edits are allowed for a segmentation
   */
  canEdit: (segmentationId: string) => boolean;

  /**
   * Get edit history for a segmentation
   */
  getEditHistory: (segmentationId: string) => EditRecord[];

  /**
   * Undo last edit (if supported)
   */
  undoLastEdit: (segmentationId: string) => EditRecord | undefined;

  /**
   * Set current user
   */
  setCurrentUser: (username: string | undefined) => void;

  /**
   * Clear provenance for a segmentation
   */
  clearProvenance: (segmentationId: string) => void;

  /**
   * Reset all provenance data
   */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState = {
  segmentations: {} as Record<string, SegmentationProvenanceState>,
  currentUser: undefined as string | undefined,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an EditRecord
 */
function createEditRecord(
  editType: EditType,
  affectedSegments: number[],
  username?: string,
  parameters?: Record<string, unknown>,
  description?: string
): EditRecord {
  return {
    id: generateId('edit'),
    editType,
    timestamp: new Date().toISOString(),
    username,
    affectedSegments,
    parameters,
    description,
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useProvenanceStore = create<ProvenanceState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================
      // Initialize Provenance
      // ========================================

      initializeProvenance: (segmentationId, inferenceEvent) => {
        set((state) => ({
          segmentations: {
            ...state.segmentations,
            [segmentationId]: {
              segmentationId,
              status: 'draft',
              latestInference: inferenceEvent,
              editHistory: [],
              editsAllowed: true,
            },
          },
        }));

        console.log('[ProvenanceStore] Initialized provenance for:', segmentationId);
      },

      // ========================================
      // Record Inference
      // ========================================

      recordInference: (
        segmentationId,
        modelName,
        modelVersion,
        parameters,
        segmentsCreated,
        durationMs
      ) => {
        const inferenceEvent: InferenceEvent = {
          id: generateId('infer'),
          segmentationId,
          model: {
            name: modelName,
            version: modelVersion,
            parameters,
            timestamp: new Date().toISOString(),
          },
          segmentsCreated,
          durationMs,
        };

        set((state) => {
          const existing = state.segmentations[segmentationId];

          return {
            segmentations: {
              ...state.segmentations,
              [segmentationId]: {
                segmentationId,
                status: existing?.status || 'draft',
                latestInference: inferenceEvent,
                editHistory: existing?.editHistory || [],
                reviewer: existing?.reviewer,
                editsAllowed: existing?.editsAllowed ?? true,
              },
            },
          };
        });

        console.log('[ProvenanceStore] Recorded inference:', {
          segmentationId,
          model: modelName,
          segmentsCreated,
        });
      },

      // ========================================
      // Record Edit
      // ========================================

      recordEdit: (segmentationId, editType, affectedSegments, parameters, description) => {
        const state = get();
        const provenance = state.segmentations[segmentationId];

        // Check if edits are allowed
        if (provenance && !provenance.editsAllowed) {
          console.warn(
            '[ProvenanceStore] Edits not allowed for finalized segmentation:',
            segmentationId
          );
          return false;
        }

        const editRecord = createEditRecord(
          editType,
          affectedSegments,
          state.currentUser,
          parameters,
          description
        );

        set((state) => {
          const existing = state.segmentations[segmentationId];

          return {
            segmentations: {
              ...state.segmentations,
              [segmentationId]: {
                segmentationId,
                status: existing?.status || 'draft',
                latestInference: existing?.latestInference,
                editHistory: [...(existing?.editHistory || []), editRecord],
                reviewer: existing?.reviewer,
                editsAllowed: existing?.editsAllowed ?? true,
              },
            },
          };
        });

        console.log('[ProvenanceStore] Recorded edit:', {
          segmentationId,
          editType,
          affectedSegments,
        });

        return true;
      },

      // ========================================
      // Set Review Status
      // ========================================

      setReviewStatus: (segmentationId, status, reviewerUsername, notes) => {
        const state = get();
        const username = reviewerUsername || state.currentUser || 'anonymous';

        const reviewerInfo: ReviewerInfo = {
          username,
          status,
          timestamp: new Date().toISOString(),
          notes,
        };

        set((state) => {
          const existing = state.segmentations[segmentationId];

          if (!existing) {
            console.warn('[ProvenanceStore] Segmentation not found:', segmentationId);
            return state;
          }

          return {
            segmentations: {
              ...state.segmentations,
              [segmentationId]: {
                ...existing,
                status,
                reviewer: reviewerInfo,
                editsAllowed: status === 'draft', // Lock edits if final
              },
            },
          };
        });

        console.log('[ProvenanceStore] Status updated:', {
          segmentationId,
          status,
          reviewer: username,
        });
      },

      // ========================================
      // Getters
      // ========================================

      getProvenance: (segmentationId) => {
        return get().segmentations[segmentationId];
      },

      getExportProvenance: (segmentationId) => {
        const provenance = get().segmentations[segmentationId];
        if (!provenance) return undefined;

        const modelProvenance: ModelProvenance = provenance.latestInference?.model || {
          name: 'unknown',
          version: '0.0.0',
          parameters: {},
          timestamp: new Date().toISOString(),
        };

        return {
          segmentationModel: modelProvenance,
          edits: provenance.editHistory,
          reviewer: provenance.reviewer,
        };
      },

      canEdit: (segmentationId) => {
        const provenance = get().segmentations[segmentationId];
        return provenance?.editsAllowed ?? true;
      },

      getEditHistory: (segmentationId) => {
        return get().segmentations[segmentationId]?.editHistory || [];
      },

      undoLastEdit: (segmentationId) => {
        const state = get();
        const provenance = state.segmentations[segmentationId];

        if (!provenance || provenance.editHistory.length === 0) {
          return undefined;
        }

        if (!provenance.editsAllowed) {
          console.warn('[ProvenanceStore] Cannot undo on finalized segmentation');
          return undefined;
        }

        const lastEdit = provenance.editHistory[provenance.editHistory.length - 1];

        set((state) => ({
          segmentations: {
            ...state.segmentations,
            [segmentationId]: {
              ...provenance,
              editHistory: provenance.editHistory.slice(0, -1),
            },
          },
        }));

        console.log('[ProvenanceStore] Undone edit:', lastEdit.id);
        return lastEdit;
      },

      // ========================================
      // User Management
      // ========================================

      setCurrentUser: (username) => {
        set({ currentUser: username });
        console.log('[ProvenanceStore] Current user set:', username);
      },

      // ========================================
      // Cleanup
      // ========================================

      clearProvenance: (segmentationId) => {
        set((state) => {
          const { [segmentationId]: removed, ...rest } = state.segmentations;
          return { segmentations: rest };
        });
        console.log('[ProvenanceStore] Cleared provenance for:', segmentationId);
      },

      reset: () => {
        set(initialState);
        console.log('[ProvenanceStore] Reset to initial state');
      },
    }),
    {
      name: 'medai-provenance',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist segmentations but not currentUser (comes from auth)
        segmentations: state.segmentations,
      }),
    }
  )
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to get provenance for a specific segmentation
 */
export function useSegmentationProvenance(segmentationId: string | null) {
  return useProvenanceStore((state) =>
    segmentationId ? state.segmentations[segmentationId] : undefined
  );
}

/**
 * Hook to check if a segmentation can be edited
 */
export function useCanEditSegmentation(segmentationId: string | null) {
  return useProvenanceStore((state) => {
    if (!segmentationId) return true;
    return state.segmentations[segmentationId]?.editsAllowed ?? true;
  });
}

/**
 * Hook to get review status
 */
export function useReviewStatus(segmentationId: string | null): ReviewStatus {
  return useProvenanceStore((state) => {
    if (!segmentationId) return 'draft';
    return state.segmentations[segmentationId]?.status ?? 'draft';
  });
}

export default useProvenanceStore;
