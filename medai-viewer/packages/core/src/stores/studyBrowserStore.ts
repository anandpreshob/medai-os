import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DicomStudy as BaseDicomStudy } from '../services/DICOMWebClient';

// ============================================
// Types
// ============================================

/**
 * DICOM study from PACS server with source field
 */
export interface PacsStudy extends BaseDicomStudy {
  source: 'pacs';
}

/**
 * Locally uploaded study/file
 */
export interface LocalStudy {
  id: string;                  // UUID generated on upload
  fileName: string;
  fileSize: number;
  format: string;              // 'nifti' | 'nrrd' | 'dicom' | etc.
  uploadedAt: number;          // timestamp
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  modality?: string;
  patientName?: string;
  studyDescription?: string;
  source: 'local';
}

/**
 * Unified study type (can be either PACS or local)
 */
export type UnifiedStudy = PacsStudy | LocalStudy;

// Re-export for convenience
export type { BaseDicomStudy as DicomStudy };

/**
 * Search and filter parameters
 */
export interface SearchFilters {
  query: string;               // Free text search
  modalities: string[];        // Selected modalities filter
  dateFrom: string | null;     // YYYYMMDD
  dateTo: string | null;       // YYYYMMDD
  source: 'all' | 'pacs' | 'local';
}

/**
 * Study browser store state
 */
export interface StudyBrowserState {
  // Data
  pacsStudies: PacsStudy[];
  localStudies: LocalStudy[];

  // UI State
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  // Search & Filter
  filters: SearchFilters;

  // View options
  viewMode: 'grid' | 'list';
  sortBy: 'date' | 'patient' | 'modality';
  sortOrder: 'asc' | 'desc';

  // PACS connection state
  pacsConnected: boolean;
  pacsServerUrl: string | null;

  // Actions
  setPacsStudies: (studies: PacsStudy[]) => void;
  addLocalStudy: (study: LocalStudy) => void;
  removeLocalStudy: (id: string) => void;
  clearLocalStudies: () => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  setFilters: (filters: Partial<SearchFilters>) => void;
  clearFilters: () => void;

  setViewMode: (mode: 'grid' | 'list') => void;
  setSortBy: (sortBy: 'date' | 'patient' | 'modality') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;

  setPacsConnected: (connected: boolean, serverUrl?: string) => void;

  // Computed (via selector pattern)
  getFilteredStudies: () => UnifiedStudy[];
}

// ============================================
// Initial State
// ============================================

const initialFilters: SearchFilters = {
  query: '',
  modalities: [],
  dateFrom: null,
  dateTo: null,
  source: 'all',
};

// ============================================
// Store Implementation
// ============================================

export const useStudyBrowserStore = create<StudyBrowserState>()(
  persist(
    (set, get) => ({
      // Data
      pacsStudies: [],
      localStudies: [],

      // UI State
      isLoading: false,
      error: null,
      lastFetchedAt: null,

      // Search & Filter
      filters: initialFilters,

      // View options
      viewMode: 'grid',
      sortBy: 'date',
      sortOrder: 'desc',

      // PACS connection
      pacsConnected: false,
      pacsServerUrl: null,

      // Actions
      setPacsStudies: (studies) => set({
        pacsStudies: studies,
        lastFetchedAt: Date.now(),
        isLoading: false,
        error: null,
      }),

      addLocalStudy: (study) => set((state) => ({
        localStudies: [study, ...state.localStudies],
      })),

      removeLocalStudy: (id) => set((state) => ({
        localStudies: state.localStudies.filter((s) => s.id !== id),
      })),

      clearLocalStudies: () => set({ localStudies: [] }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error, isLoading: false }),

      setFilters: (newFilters) => set((state) => ({
        filters: { ...state.filters, ...newFilters },
      })),

      clearFilters: () => set({ filters: initialFilters }),

      setViewMode: (mode) => set({ viewMode: mode }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (order) => set({ sortOrder: order }),

      setPacsConnected: (connected, serverUrl) => set({
        pacsConnected: connected,
        pacsServerUrl: serverUrl || null,
      }),

      // Computed selector - returns filtered and sorted studies
      getFilteredStudies: () => {
        const { pacsStudies, localStudies, filters, sortBy, sortOrder } = get();

        // Combine based on source filter
        let studies: UnifiedStudy[] = [];
        if (filters.source === 'all' || filters.source === 'pacs') {
          studies = [...studies, ...pacsStudies.map(s => ({ ...s, source: 'pacs' as const }))];
        }
        if (filters.source === 'all' || filters.source === 'local') {
          studies = [...studies, ...localStudies];
        }

        // Apply text search
        if (filters.query) {
          const q = filters.query.toLowerCase();
          studies = studies.filter((s) => {
            const searchFields = [
              s.patientName,
              s.studyDescription,
              'patientID' in s ? s.patientID : '',
              'fileName' in s ? s.fileName : '',
            ].filter(Boolean).join(' ').toLowerCase();
            return searchFields.includes(q);
          });
        }

        // Apply modality filter
        if (filters.modalities.length > 0) {
          studies = studies.filter((s) => {
            const studyModalities = 'modalities' in s
              ? s.modalities
              : (s.modality ? [s.modality] : []);
            return filters.modalities.some((m) => studyModalities.includes(m));
          });
        }

        // Apply date range filter (PACS studies only)
        if (filters.dateFrom || filters.dateTo) {
          studies = studies.filter((s) => {
            if (!('studyDate' in s)) return true; // Don't filter local studies by date
            const date = s.studyDate;
            if (filters.dateFrom && date < filters.dateFrom) return false;
            if (filters.dateTo && date > filters.dateTo) return false;
            return true;
          });
        }

        // Sort
        studies.sort((a, b) => {
          let comparison = 0;
          switch (sortBy) {
            case 'date':
              const dateA = 'studyDate' in a ? a.studyDate : String(a.uploadedAt);
              const dateB = 'studyDate' in b ? b.studyDate : String(b.uploadedAt);
              comparison = dateA.localeCompare(dateB);
              break;
            case 'patient':
              comparison = (a.patientName || '').localeCompare(b.patientName || '');
              break;
            case 'modality':
              const modA = 'modalities' in a ? a.modalities[0] || '' : a.modality || '';
              const modB = 'modalities' in b ? b.modalities[0] || '' : b.modality || '';
              comparison = modA.localeCompare(modB);
              break;
          }
          return sortOrder === 'asc' ? comparison : -comparison;
        });

        return studies;
      },
    }),
    {
      name: 'medai-study-browser',
      // Only persist these fields
      partialize: (state) => ({
        localStudies: state.localStudies,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        pacsServerUrl: state.pacsServerUrl,
      }),
    }
  )
);
