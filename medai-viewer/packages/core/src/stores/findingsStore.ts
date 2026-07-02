/**
 * Findings Store - Zustand store for radiologist findings and AI-generated reports
 *
 * Manages editable findings for medical image analysis including:
 * - AI-generated report text
 * - Radiologist notes and corrections
 * - Final edited report
 * - Voice dictation state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Enhanced findings data for a single image
 */
export interface ImageFindings {
  imageId: string;
  // Legacy simple text field (for backward compatibility) - also used for radiologist dictation
  text: string;
  // Clinical context (patient history, indication, reason for exam)
  clinicalContext: string;
  // AI-generated report
  aiReport: string;
  // Radiologist notes/corrections
  radiologistNotes: string;
  // Final edited report
  editedReport: string;
  // Detection summary list (from AI detections)
  detectionSummary: string[];
  // Timestamps
  lastModified: number;
  // Approval status
  isApproved: boolean;
}

export interface FindingsState {
  // Map of imageId → findings
  findings: Map<string, ImageFindings>;

  // Voice recording state
  isRecording: boolean;

  // Actions - Legacy API (backward compatible)
  setFindings: (imageId: string, text: string) => void;
  getFindings: (imageId: string) => string;
  clearFindings: (imageId: string) => void;
  clearAllFindings: () => void;
  setRecording: (isRecording: boolean) => void;

  // Actions - Enhanced API
  setAIReport: (imageId: string, aiReport: string, detectionSummary?: string[]) => void;
  setClinicalContext: (imageId: string, clinicalContext: string) => void;
  updateRadiologistNotes: (imageId: string, notes: string) => void;
  updateEditedReport: (imageId: string, report: string) => void;
  approveFindings: (imageId: string, approved: boolean) => void;

  // Getters - Enhanced
  getImageFindings: (imageId: string) => ImageFindings | undefined;
  getExportableReport: (imageId: string) => string | null;
  getRadiologistObservations: (imageId: string) => string;

  // Reset
  reset: () => void;
}

// Helper to create default findings
const createDefaultFindings = (imageId: string): ImageFindings => ({
  imageId,
  text: '',
  clinicalContext: '',
  aiReport: '',
  radiologistNotes: '',
  editedReport: '',
  detectionSummary: [],
  lastModified: Date.now(),
  isApproved: false,
});

export const useFindingsStore = create<FindingsState>()(
  persist(
    (set, get) => ({
      findings: new Map<string, ImageFindings>(),
      isRecording: false,

      // Legacy API - backward compatible
      setFindings: (imageId, text) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          const existing = newFindings.get(imageId) || createDefaultFindings(imageId);
          newFindings.set(imageId, {
            ...existing,
            text,
            editedReport: text, // Keep in sync with edited report
            lastModified: Date.now(),
          });
          return { findings: newFindings };
        }),

      getFindings: (imageId) => {
        const finding = get().findings.get(imageId);
        // Return editedReport if available, otherwise legacy text field
        return finding?.editedReport || finding?.text || '';
      },

      clearFindings: (imageId) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          newFindings.delete(imageId);
          return { findings: newFindings };
        }),

      clearAllFindings: () =>
        set({ findings: new Map<string, ImageFindings>() }),

      setRecording: (isRecording) => set({ isRecording }),

      // Enhanced API
      setAIReport: (imageId, aiReport, detectionSummary = []) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          const existing = newFindings.get(imageId) || createDefaultFindings(imageId);
          newFindings.set(imageId, {
            ...existing,
            aiReport,
            // Set editedReport to AI report if not already edited
            editedReport: existing.editedReport || aiReport,
            detectionSummary,
            lastModified: Date.now(),
            isApproved: false,
          });
          return { findings: newFindings };
        }),

      setClinicalContext: (imageId, clinicalContext) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          const existing = newFindings.get(imageId) || createDefaultFindings(imageId);
          newFindings.set(imageId, {
            ...existing,
            clinicalContext,
            lastModified: Date.now(),
          });
          return { findings: newFindings };
        }),

      updateRadiologistNotes: (imageId, notes) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          const existing = newFindings.get(imageId) || createDefaultFindings(imageId);
          newFindings.set(imageId, {
            ...existing,
            radiologistNotes: notes,
            lastModified: Date.now(),
            isApproved: false,
          });
          return { findings: newFindings };
        }),

      updateEditedReport: (imageId, report) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          const existing = newFindings.get(imageId) || createDefaultFindings(imageId);
          newFindings.set(imageId, {
            ...existing,
            editedReport: report,
            text: report, // Keep legacy field in sync
            lastModified: Date.now(),
            isApproved: false,
          });
          return { findings: newFindings };
        }),

      approveFindings: (imageId, approved) =>
        set((state) => {
          const newFindings = new Map(state.findings);
          const existing = newFindings.get(imageId);
          if (!existing) return state;

          newFindings.set(imageId, {
            ...existing,
            isApproved: approved,
            lastModified: Date.now(),
          });
          return { findings: newFindings };
        }),

      getImageFindings: (imageId) => {
        return get().findings.get(imageId);
      },

      // Get radiologist observations (from FindingsPanel dictation)
      getRadiologistObservations: (imageId) => {
        const finding = get().findings.get(imageId);
        // The 'text' field contains the radiologist's dictated observations from FindingsPanel
        return finding?.text || '';
      },

      getExportableReport: (imageId) => {
        const finding = get().findings.get(imageId);
        if (!finding) return null;

        // Build exportable report combining all fields
        let report = '';

        // Clinical context
        if (finding.clinicalContext) {
          report += '--- Clinical Context ---\n';
          report += finding.clinicalContext;
          report += '\n\n';
        }

        // Main report content
        if (finding.editedReport) {
          report += finding.editedReport;
        } else if (finding.aiReport) {
          report += finding.aiReport;
        } else if (finding.text) {
          report += finding.text;
        }

        // Radiologist notes
        if (finding.radiologistNotes) {
          report += '\n\n--- Radiologist Notes ---\n';
          report += finding.radiologistNotes;
        }

        // AI Detection summary
        if (finding.detectionSummary && finding.detectionSummary.length > 0) {
          report += '\n\n--- AI Detection Summary ---\n';
          finding.detectionSummary.forEach((item, index) => {
            report += `${index + 1}. ${item}\n`;
          });
        }

        // Report metadata
        report += `\n\n--- Report Status ---\n`;
        report += `Approved: ${finding.isApproved ? 'Yes' : 'No'}\n`;
        report += `Last Modified: ${new Date(finding.lastModified).toLocaleString()}\n`;

        return report;
      },

      reset: () => {
        set({
          findings: new Map<string, ImageFindings>(),
          isRecording: false,
        });
      },
    }),
    {
      name: 'medai-findings-store',
      // Custom storage for Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const parsed = JSON.parse(str);
            // Convert object back to Map
            if (parsed.state?.findings && typeof parsed.state.findings === 'object') {
              parsed.state.findings = new Map(Object.entries(parsed.state.findings));
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          // Convert Map to object for serialization
          const toStore = {
            ...value,
            state: {
              ...value.state,
              findings: value.state.findings instanceof Map
                ? Object.fromEntries(value.state.findings)
                : value.state.findings,
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

export default useFindingsStore;
