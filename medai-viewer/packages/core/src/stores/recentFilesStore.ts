import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentFile {
  name: string;
  path: string;
  format: string;
  timestamp: number;
  dimensions?: { width: number; height: number; depth: number };
}

interface RecentFilesState {
  recentFiles: RecentFile[];
  maxRecentFiles: number;
  addRecentFile: (file: RecentFile) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
}

export const useRecentFilesStore = create<RecentFilesState>()(
  persist(
    (set) => ({
      recentFiles: [],
      maxRecentFiles: 10,

      addRecentFile: (file) =>
        set((state) => {
          // Remove existing entry with same path
          const filtered = state.recentFiles.filter((f) => f.path !== file.path);

          // Add new file at the beginning
          const newFiles = [file, ...filtered].slice(0, state.maxRecentFiles);

          return { recentFiles: newFiles };
        }),

      removeRecentFile: (path) =>
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f.path !== path),
        })),

      clearRecentFiles: () => set({ recentFiles: [] }),
    }),
    {
      name: 'medai-recent-files',
    }
  )
);
