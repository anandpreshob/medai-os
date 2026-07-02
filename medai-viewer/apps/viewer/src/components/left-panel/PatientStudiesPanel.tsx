/**
 * PatientStudiesPanel - Displays and allows adding prior studies for a patient
 *
 * Features:
 * - Query PACS for all studies with same PatientID
 * - Filter by modality/anatomy
 * - Display as timeline or list
 * - Allow selection to "Add as Timepoint"
 * - Show which studies are already in the session
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  Calendar,
  Layers,
  Plus,
  Check,
  Clock,
  FileImage,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  DICOMWebClient,
  useLongitudinalStore,
  useActiveSession,
  useViewerStore,
  type DicomStudy,
} from '@medai/core';

// Create singleton DICOM client
const dicomClient = new DICOMWebClient();

/**
 * Format date string (YYYYMMDD) to readable format
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr || 'Unknown';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${month}/${day}/${year}`;
}

/**
 * Format date for display label (e.g., "Jan 2024")
 */
function formatDateLabel(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr || 'Unknown';
  const year = dateStr.substring(0, 4);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1] || 'Unknown'} ${year}`;
}

/**
 * Generate a timepoint label based on study date and position
 */
function generateTimepointLabel(
  studyDate: string,
  index: number,
  existingCount: number
): string {
  if (existingCount === 0) {
    return 'Baseline';
  }

  // Calculate approximate months difference from baseline
  // For simplicity, use order-based labels
  const labels = ['Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Follow-up 4', 'Follow-up 5'];
  return labels[existingCount - 1] || `Follow-up ${existingCount}`;
}

/**
 * Modality badge colors
 */
const MODALITY_COLORS: Record<string, string> = {
  CT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  MR: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  US: 'bg-green-500/20 text-green-400 border-green-500/30',
  XR: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  CR: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  DX: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  MG: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  default: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

interface PatientStudiesPanelProps {
  /** Called when a study is being loaded as a timepoint */
  onLoadStudy?: (studyUID: string) => Promise<string | null>;
}

export function PatientStudiesPanel({ onLoadStudy }: PatientStudiesPanelProps) {
  const session = useActiveSession();
  const { addTimepoint } = useLongitudinalStore();
  const { pacsStudy, activeImageId } = useViewerStore();

  const [studies, setStudies] = useState<DicomStudy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStudyUID, setLoadingStudyUID] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Get patient ID from active session or PACS study
  const patientId = session?.patientId || pacsStudy?.patientID;

  // Get study UIDs that are already in the session
  const existingStudyUIDs = new Set(
    session?.timepoints.map((tp) => tp.studyInstanceUID).filter(Boolean) || []
  );

  // Fetch studies for the patient
  const fetchPatientStudies = useCallback(async () => {
    if (!patientId) {
      setStudies([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = await dicomClient.searchStudies({
        PatientID: patientId,
        limit: 50,
      });

      // Sort by study date (newest first)
      const sorted = [...results].sort((a, b) => {
        const dateA = a.studyDate || '';
        const dateB = b.studyDate || '';
        return dateB.localeCompare(dateA);
      });

      setStudies(sorted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch studies';
      setError(message);
      console.error('[PatientStudiesPanel] Failed to fetch studies:', err);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  // Fetch studies when patient ID changes
  useEffect(() => {
    if (patientId) {
      fetchPatientStudies();
    }
  }, [patientId, fetchPatientStudies]);

  // Handle adding a study as a timepoint
  const handleAddTimepoint = useCallback(
    async (study: DicomStudy) => {
      if (!session) return;
      if (existingStudyUIDs.has(study.studyInstanceUID)) return;

      setLoadingStudyUID(study.studyInstanceUID);

      try {
        // If onLoadStudy is provided, load the study first
        let imageId = activeImageId;

        if (onLoadStudy) {
          const loadedImageId = await onLoadStudy(study.studyInstanceUID);
          if (loadedImageId) {
            imageId = loadedImageId;
          }
        }

        // Generate label based on position
        const label = generateTimepointLabel(
          study.studyDate,
          studies.findIndex((s) => s.studyInstanceUID === study.studyInstanceUID),
          session.timepoints.length
        );

        // Add timepoint to session
        addTimepoint(session.id, {
          label,
          imageId: imageId || `pacs:${study.studyInstanceUID}`,
          acquisitionDateTime: study.studyDate,
          studyInstanceUID: study.studyInstanceUID,
          studyDate: study.studyDate,
          studyDescription: study.studyDescription,
        });

        console.log('[PatientStudiesPanel] Added timepoint:', study.studyInstanceUID);
      } catch (err) {
        console.error('[PatientStudiesPanel] Failed to add timepoint:', err);
      } finally {
        setLoadingStudyUID(null);
      }
    },
    [session, existingStudyUIDs, activeImageId, onLoadStudy, addTimepoint, studies]
  );

  // Filter out studies that match the session modality (if set)
  const filteredStudies = session?.modality
    ? studies.filter((s) =>
        s.modalities.some((m) => m === session.modality || session.modality.includes(m))
      )
    : studies;

  if (!patientId) {
    return (
      <div className="py-8 text-center">
        <FileImage className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">No patient selected</p>
        <p className="text-xs text-text-disabled mt-1">
          Load a study to see prior examinations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
          )}
          <Search className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">Patient Studies</span>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && studies.length > 0 && (
            <span className="text-xs text-text-muted">
              {filteredStudies.length} found
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchPatientStudies();
            }}
            disabled={isLoading}
            className="p-1 rounded hover:bg-background-hover transition-colors"
            title="Refresh studies"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-text-muted hover:text-text-primary ${
                isLoading ? 'animate-spin' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <>
          {/* Error message */}
          {error && (
            <div className="px-3 py-2 bg-accent-error/10 border border-accent-error/30 rounded-lg text-xs text-accent-error flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="py-6 text-center">
              <RefreshCw className="w-6 h-6 mx-auto text-accent-primary animate-spin mb-2" />
              <p className="text-xs text-text-muted">Searching PACS...</p>
            </div>
          )}

          {/* Studies list */}
          {!isLoading && filteredStudies.length > 0 && (
            <div className="space-y-2">
              {filteredStudies.map((study) => {
                const isInSession = existingStudyUIDs.has(study.studyInstanceUID);
                const isLoadingThis = loadingStudyUID === study.studyInstanceUID;

                return (
                  <div
                    key={study.studyInstanceUID}
                    className={`
                      group relative p-3 rounded-xl border transition-all duration-200
                      ${isInSession
                        ? 'bg-accent-success/5 border-accent-success/30'
                        : 'bg-background-tertiary/30 border-border-subtle hover:bg-background-hover hover:border-border-emphasis'
                      }
                    `}
                  >
                    {/* Top row: Date and modalities */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-sm font-medium text-text-primary">
                          {formatDate(study.studyDate)}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {study.modalities.slice(0, 2).map((mod) => (
                          <span
                            key={mod}
                            className={`px-1.5 py-0.5 text-2xs font-bold uppercase rounded border ${
                              MODALITY_COLORS[mod] || MODALITY_COLORS.default
                            }`}
                          >
                            {mod}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-text-secondary truncate mb-2">
                      {study.studyDescription || 'No description'}
                    </p>

                    {/* Metadata row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-2xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {study.numberOfSeries} series
                        </span>
                        <span>{study.numberOfInstances} images</span>
                      </div>

                      {/* Add button */}
                      {isInSession ? (
                        <span className="flex items-center gap-1 px-2 py-1 text-2xs font-semibold text-accent-success bg-accent-success/10 rounded-lg">
                          <Check className="w-3 h-3" />
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddTimepoint(study)}
                          disabled={isLoadingThis}
                          className="flex items-center gap-1 px-2 py-1 text-2xs font-semibold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isLoadingThis ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              Add Timepoint
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredStudies.length === 0 && !error && (
            <div className="py-6 text-center">
              <Clock className="w-8 h-8 mx-auto text-text-muted mb-2" />
              <p className="text-xs text-text-muted">No prior studies found</p>
              <p className="text-2xs text-text-disabled mt-1">
                Patient ID: {patientId}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
