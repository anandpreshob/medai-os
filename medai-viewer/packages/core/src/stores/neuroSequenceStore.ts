/**
 * Neuro Sequence Store
 *
 * Zustand store for managing multi-sequence neuro workflows including:
 * - Sequence registration and assignment
 * - Viewport slot management
 * - Fusion/overlay settings
 * - Cross-viewport synchronization
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  NeuroSequenceType,
  SequenceInfo,
  ViewportSlot,
  SlotAssignment,
  FusionSettings,
  FusionBlendMode,
  OverlayColormap,
  RegistrationState,
  RegistrationStatus,
  RegistrationResult,
  RegistrationMethod,
  SyncState,
  WorldPosition,
  NeuroLayoutPreset,
  NeuroLayoutConfig,
  NEURO_LAYOUT_CONFIGS,
  detectSequenceType,
  SEQUENCE_WL_PRESETS,
} from './neuroSequenceTypes';

// ============================================================================
// Store State Interface
// ============================================================================

export interface NeuroSequenceState {
  // ========================================
  // Sequences
  // ========================================

  /** All registered sequences */
  sequences: Record<string, SequenceInfo>;

  /** Reference sequence ID (for registration) */
  referenceSequenceId: string | null;

  // ========================================
  // Layout & Slots
  // ========================================

  /** Current layout preset */
  layoutPreset: NeuroLayoutPreset;

  /** Slot assignments */
  slotAssignments: Record<ViewportSlot, SlotAssignment>;

  // ========================================
  // Fusion
  // ========================================

  /** Fusion settings per slot */
  fusionSettings: Record<ViewportSlot, FusionSettings | null>;

  /** Active fusion slot */
  activeFusionSlot: ViewportSlot | null;

  // ========================================
  // Registration
  // ========================================

  /** Registration states */
  registrations: Record<string, RegistrationState>;

  /** Whether registration is in progress */
  isRegistering: boolean;

  // ========================================
  // Synchronization
  // ========================================

  /** Sync state */
  syncState: SyncState;

  // ========================================
  // Actions - Sequences
  // ========================================

  /**
   * Add a sequence
   */
  addSequence: (
    imageId: string,
    seriesDescription?: string,
    manualType?: NeuroSequenceType
  ) => string;

  /**
   * Remove a sequence
   */
  removeSequence: (sequenceId: string) => void;

  /**
   * Update sequence info
   */
  updateSequence: (sequenceId: string, updates: Partial<SequenceInfo>) => void;

  /**
   * Set reference sequence
   */
  setReferenceSequence: (sequenceId: string | null) => void;

  /**
   * Get sequence by type
   */
  getSequenceByType: (type: NeuroSequenceType) => SequenceInfo | undefined;

  /**
   * Get all sequences of a type
   */
  getSequencesByType: (type: NeuroSequenceType) => SequenceInfo[];

  // ========================================
  // Actions - Layout & Slots
  // ========================================

  /**
   * Set layout preset
   */
  setLayoutPreset: (preset: NeuroLayoutPreset) => void;

  /**
   * Assign sequence to slot
   */
  assignSequenceToSlot: (slot: ViewportSlot, sequenceId: string | null) => void;

  /**
   * Set slot orientation
   */
  setSlotOrientation: (slot: ViewportSlot, orientation: 'axial' | 'sagittal' | 'coronal') => void;

  /**
   * Set reference slot
   */
  setReferenceSlot: (slot: ViewportSlot) => void;

  /**
   * Auto-assign sequences to slots based on type
   */
  autoAssignSlots: () => void;

  /**
   * Get layout configuration
   */
  getLayoutConfig: () => NeuroLayoutConfig;

  // ========================================
  // Actions - Fusion
  // ========================================

  /**
   * Enable fusion for a slot
   */
  enableFusion: (
    slot: ViewportSlot,
    baseSequenceId: string,
    overlaySequenceId: string,
    settings?: Partial<FusionSettings>
  ) => void;

  /**
   * Disable fusion for a slot
   */
  disableFusion: (slot: ViewportSlot) => void;

  /**
   * Update fusion settings
   */
  updateFusionSettings: (slot: ViewportSlot, updates: Partial<FusionSettings>) => void;

  /**
   * Set active fusion slot
   */
  setActiveFusionSlot: (slot: ViewportSlot | null) => void;

  // ========================================
  // Actions - Registration
  // ========================================

  /**
   * Start registration between two sequences
   */
  startRegistration: (
    sourceSequenceId: string,
    targetSequenceId: string,
    method?: RegistrationMethod
  ) => void;

  /**
   * Update registration progress
   */
  updateRegistrationProgress: (sourceId: string, targetId: string, progress: number) => void;

  /**
   * Complete registration
   */
  completeRegistration: (
    sourceId: string,
    targetId: string,
    result: RegistrationResult
  ) => void;

  /**
   * Fail registration
   */
  failRegistration: (sourceId: string, targetId: string, error: string) => void;

  /**
   * Get registration state
   */
  getRegistrationState: (sourceId: string, targetId: string) => RegistrationState | undefined;

  // ========================================
  // Actions - Synchronization
  // ========================================

  /**
   * Toggle sync enabled
   */
  toggleSync: (enabled?: boolean) => void;

  /**
   * Update synchronized world position
   */
  updateSyncPosition: (position: WorldPosition) => void;

  /**
   * Toggle window/level sync
   */
  toggleWindowLevelSync: (enabled?: boolean) => void;

  /**
   * Toggle zoom sync
   */
  toggleZoomSync: (enabled?: boolean) => void;

  // ========================================
  // Actions - Utilities
  // ========================================

  /**
   * Clear all sequences
   */
  clearSequences: () => void;

  /**
   * Reset to initial state
   */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialSlotAssignments: Record<ViewportSlot, SlotAssignment> = {
  slot1: { slot: 'slot1', sequenceId: null, isReference: true, orientation: 'axial' },
  slot2: { slot: 'slot2', sequenceId: null, isReference: false, orientation: 'axial' },
  slot3: { slot: 'slot3', sequenceId: null, isReference: false, orientation: 'axial' },
  slot4: { slot: 'slot4', sequenceId: null, isReference: false, orientation: 'axial' },
};

const initialSyncState: SyncState = {
  enabled: true,
  worldPosition: null,
  referenceSlot: 'slot1',
  syncWindowLevel: false,
  syncZoom: true,
};

const initialState = {
  sequences: {} as Record<string, SequenceInfo>,
  referenceSequenceId: null as string | null,
  layoutPreset: 'sequence-2x2' as NeuroLayoutPreset,
  slotAssignments: initialSlotAssignments,
  fusionSettings: {
    slot1: null,
    slot2: null,
    slot3: null,
    slot4: null,
  } as Record<ViewportSlot, FusionSettings | null>,
  activeFusionSlot: null as ViewportSlot | null,
  registrations: {} as Record<string, RegistrationState>,
  isRegistering: false,
  syncState: initialSyncState,
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateSequenceId(): string {
  return `seq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getRegistrationKey(sourceId: string, targetId: string): string {
  return `${sourceId}:${targetId}`;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useNeuroSequenceStore = create<NeuroSequenceState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========================================
      // Sequence Actions
      // ========================================

      addSequence: (imageId, seriesDescription, manualType) => {
        const id = generateSequenceId();
        const type = manualType || detectSequenceType(seriesDescription || '');
        const wlPreset = SEQUENCE_WL_PRESETS[type];

        const sequence: SequenceInfo = {
          id,
          type,
          displayName: seriesDescription || `Sequence ${id.slice(-4)}`,
          imageId,
          seriesDescription,
          isRegistered: false,
          wlPreset,
        };

        set((state) => ({
          sequences: {
            ...state.sequences,
            [id]: sequence,
          },
          // Set first sequence as reference
          referenceSequenceId: state.referenceSequenceId || id,
        }));

        console.log('[NeuroSequenceStore] Added sequence:', id, type);
        return id;
      },

      removeSequence: (sequenceId) => {
        set((state) => {
          const { [sequenceId]: removed, ...remaining } = state.sequences;

          // Clear from slot assignments
          const newSlotAssignments = { ...state.slotAssignments };
          for (const slot of Object.keys(newSlotAssignments) as ViewportSlot[]) {
            if (newSlotAssignments[slot].sequenceId === sequenceId) {
              newSlotAssignments[slot] = { ...newSlotAssignments[slot], sequenceId: null };
            }
          }

          return {
            sequences: remaining,
            slotAssignments: newSlotAssignments,
            referenceSequenceId:
              state.referenceSequenceId === sequenceId
                ? Object.keys(remaining)[0] || null
                : state.referenceSequenceId,
          };
        });

        console.log('[NeuroSequenceStore] Removed sequence:', sequenceId);
      },

      updateSequence: (sequenceId, updates) => {
        set((state) => {
          const sequence = state.sequences[sequenceId];
          if (!sequence) return state;

          return {
            sequences: {
              ...state.sequences,
              [sequenceId]: { ...sequence, ...updates },
            },
          };
        });
      },

      setReferenceSequence: (sequenceId) => {
        set({ referenceSequenceId: sequenceId });
        console.log('[NeuroSequenceStore] Set reference sequence:', sequenceId);
      },

      getSequenceByType: (type) => {
        const sequences = get().sequences;
        return Object.values(sequences).find((s) => s.type === type);
      },

      getSequencesByType: (type) => {
        const sequences = get().sequences;
        return Object.values(sequences).filter((s) => s.type === type);
      },

      // ========================================
      // Layout & Slot Actions
      // ========================================

      setLayoutPreset: (preset) => {
        set({ layoutPreset: preset });
        console.log('[NeuroSequenceStore] Set layout preset:', preset);
      },

      assignSequenceToSlot: (slot, sequenceId) => {
        set((state) => ({
          slotAssignments: {
            ...state.slotAssignments,
            [slot]: { ...state.slotAssignments[slot], sequenceId },
          },
        }));
        console.log('[NeuroSequenceStore] Assigned sequence to slot:', slot, sequenceId);
      },

      setSlotOrientation: (slot, orientation) => {
        set((state) => ({
          slotAssignments: {
            ...state.slotAssignments,
            [slot]: { ...state.slotAssignments[slot], orientation },
          },
        }));
      },

      setReferenceSlot: (slot) => {
        set((state) => {
          const newAssignments = { ...state.slotAssignments };
          for (const s of Object.keys(newAssignments) as ViewportSlot[]) {
            newAssignments[s] = { ...newAssignments[s], isReference: s === slot };
          }
          return {
            slotAssignments: newAssignments,
            syncState: { ...state.syncState, referenceSlot: slot },
          };
        });
      },

      autoAssignSlots: () => {
        const sequences = get().sequences;
        const sequenceList = Object.values(sequences);

        // Priority order for slot assignment
        const priorityOrder: NeuroSequenceType[] = ['T1', 'FLAIR', 'T2', 'DWI', 'ADC', 'T1_GD', 'SWI', 'MRA', 'OTHER'];

        // Sort sequences by priority
        const sorted = [...sequenceList].sort((a, b) => {
          return priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type);
        });

        // Assign to slots
        const slots: ViewportSlot[] = ['slot1', 'slot2', 'slot3', 'slot4'];
        const newAssignments = { ...initialSlotAssignments };

        for (let i = 0; i < Math.min(sorted.length, slots.length); i++) {
          newAssignments[slots[i]] = {
            ...newAssignments[slots[i]],
            sequenceId: sorted[i].id,
          };
        }

        set({ slotAssignments: newAssignments });
        console.log('[NeuroSequenceStore] Auto-assigned slots');
      },

      getLayoutConfig: () => {
        return NEURO_LAYOUT_CONFIGS[get().layoutPreset];
      },

      // ========================================
      // Fusion Actions
      // ========================================

      enableFusion: (slot, baseSequenceId, overlaySequenceId, settings) => {
        const defaultSettings: FusionSettings = {
          enabled: true,
          baseSequenceId,
          overlaySequenceId,
          blendMode: 'alpha',
          baseOpacity: 1.0,
          overlayOpacity: 0.5,
          overlayColormap: 'hot',
          ...settings,
        };

        set((state) => ({
          fusionSettings: {
            ...state.fusionSettings,
            [slot]: defaultSettings,
          },
          activeFusionSlot: slot,
        }));

        console.log('[NeuroSequenceStore] Enabled fusion for slot:', slot);
      },

      disableFusion: (slot) => {
        set((state) => ({
          fusionSettings: {
            ...state.fusionSettings,
            [slot]: null,
          },
          activeFusionSlot: state.activeFusionSlot === slot ? null : state.activeFusionSlot,
        }));
      },

      updateFusionSettings: (slot, updates) => {
        set((state) => {
          const current = state.fusionSettings[slot];
          if (!current) return state;

          return {
            fusionSettings: {
              ...state.fusionSettings,
              [slot]: { ...current, ...updates },
            },
          };
        });
      },

      setActiveFusionSlot: (slot) => {
        set({ activeFusionSlot: slot });
      },

      // ========================================
      // Registration Actions
      // ========================================

      startRegistration: (sourceSequenceId, targetSequenceId, method = 'rigid') => {
        const key = getRegistrationKey(sourceSequenceId, targetSequenceId);

        set((state) => ({
          registrations: {
            ...state.registrations,
            [key]: {
              sourceId: sourceSequenceId,
              targetId: targetSequenceId,
              status: 'in_progress',
              progress: 0,
            },
          },
          isRegistering: true,
        }));

        console.log('[NeuroSequenceStore] Started registration:', sourceSequenceId, '->', targetSequenceId);
      },

      updateRegistrationProgress: (sourceId, targetId, progress) => {
        const key = getRegistrationKey(sourceId, targetId);

        set((state) => {
          const reg = state.registrations[key];
          if (!reg) return state;

          return {
            registrations: {
              ...state.registrations,
              [key]: { ...reg, progress },
            },
          };
        });
      },

      completeRegistration: (sourceId, targetId, result) => {
        const key = getRegistrationKey(sourceId, targetId);

        set((state) => ({
          registrations: {
            ...state.registrations,
            [key]: {
              sourceId,
              targetId,
              status: 'completed',
              progress: 100,
              result,
            },
          },
          isRegistering: false,
          sequences: {
            ...state.sequences,
            [sourceId]: {
              ...state.sequences[sourceId],
              isRegistered: true,
              registrationMatrix: result.transformMatrix,
            },
          },
        }));

        console.log('[NeuroSequenceStore] Registration completed:', sourceId, '->', targetId);
      },

      failRegistration: (sourceId, targetId, error) => {
        const key = getRegistrationKey(sourceId, targetId);

        set((state) => ({
          registrations: {
            ...state.registrations,
            [key]: {
              sourceId,
              targetId,
              status: 'failed',
              progress: 0,
              result: {
                sourceSequenceId: sourceId,
                targetSequenceId: targetId,
                method: 'rigid',
                transformMatrix: [],
                qualityScore: 0,
                timestamp: Date.now(),
                error,
              },
            },
          },
          isRegistering: false,
        }));

        console.error('[NeuroSequenceStore] Registration failed:', error);
      },

      getRegistrationState: (sourceId, targetId) => {
        const key = getRegistrationKey(sourceId, targetId);
        return get().registrations[key];
      },

      // ========================================
      // Synchronization Actions
      // ========================================

      toggleSync: (enabled) => {
        set((state) => ({
          syncState: {
            ...state.syncState,
            enabled: enabled !== undefined ? enabled : !state.syncState.enabled,
          },
        }));
      },

      updateSyncPosition: (position) => {
        set((state) => ({
          syncState: {
            ...state.syncState,
            worldPosition: position,
          },
        }));
      },

      toggleWindowLevelSync: (enabled) => {
        set((state) => ({
          syncState: {
            ...state.syncState,
            syncWindowLevel: enabled !== undefined ? enabled : !state.syncState.syncWindowLevel,
          },
        }));
      },

      toggleZoomSync: (enabled) => {
        set((state) => ({
          syncState: {
            ...state.syncState,
            syncZoom: enabled !== undefined ? enabled : !state.syncState.syncZoom,
          },
        }));
      },

      // ========================================
      // Utility Actions
      // ========================================

      clearSequences: () => {
        set({
          sequences: {},
          referenceSequenceId: null,
          slotAssignments: initialSlotAssignments,
          fusionSettings: { slot1: null, slot2: null, slot3: null, slot4: null },
          registrations: {},
        });
        console.log('[NeuroSequenceStore] Cleared all sequences');
      },

      reset: () => {
        set(initialState);
        console.log('[NeuroSequenceStore] Reset to initial state');
      },
    }),
    {
      name: 'medai-neuro-sequences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        layoutPreset: state.layoutPreset,
        syncState: state.syncState,
        // Don't persist sequences as they're session-specific
      }),
    }
  )
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Get all sequences as array
 */
export function useSequenceList(): SequenceInfo[] {
  return useNeuroSequenceStore((state) => Object.values(state.sequences));
}

/**
 * Get sequence by ID
 */
export function useSequence(sequenceId: string | null): SequenceInfo | undefined {
  return useNeuroSequenceStore((state) =>
    sequenceId ? state.sequences[sequenceId] : undefined
  );
}

/**
 * Get current layout config
 */
export function useNeuroLayoutConfig(): NeuroLayoutConfig {
  return useNeuroSequenceStore((state) => NEURO_LAYOUT_CONFIGS[state.layoutPreset]);
}

/**
 * Get fusion settings for a slot
 */
export function useFusionSettings(slot: ViewportSlot): FusionSettings | null {
  return useNeuroSequenceStore((state) => state.fusionSettings[slot]);
}

/**
 * Check if sync is enabled
 */
export function useIsSyncEnabled(): boolean {
  return useNeuroSequenceStore((state) => state.syncState.enabled);
}

export default useNeuroSequenceStore;
