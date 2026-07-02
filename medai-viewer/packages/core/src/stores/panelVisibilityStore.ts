import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Panel visibility store
 *
 * Tracks which right-panel "windows" the user has chosen to show. Choices are
 * persisted per-browser. Default is hidden: the right panel starts empty and
 * the user opts windows in via the Panels dropdown. Feature availability is a
 * separate concern (a window only appears in the dropdown when its feature is
 * enabled) — this store only records the user's show/hide preference.
 */
interface PanelVisibilityState {
  /** panelId -> visible. Absent key means hidden (default). */
  visible: Record<string, boolean>;
  isPanelVisible: (id: string) => boolean;
  setPanelVisible: (id: string, visible: boolean) => void;
  togglePanel: (id: string) => void;
}

export const usePanelVisibilityStore = create<PanelVisibilityState>()(
  persist(
    (set, get) => ({
      visible: {},
      isPanelVisible: (id) => get().visible[id] ?? false,
      setPanelVisible: (id, visible) =>
        set((state) => ({ visible: { ...state.visible, [id]: visible } })),
      togglePanel: (id) =>
        set((state) => ({ visible: { ...state.visible, [id]: !(state.visible[id] ?? false) } })),
    }),
    {
      name: 'medai-panel-visibility',
    }
  )
);
