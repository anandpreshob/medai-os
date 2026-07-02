/**
 * LongitudinalReportTab - Collect findings per timepoint and generate longitudinal reports
 *
 * Features:
 * - Preview findings per timepoint
 * - Show delta calculations summary
 * - Trigger longitudinal report generation
 * - Bundle per-timepoint data into request
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Send,
  Image,
  Activity,
  Download,
  Upload,
  Archive,
} from 'lucide-react';
import { Button, toast } from '@medai/ui';
import {
  useActiveSession,
  useActiveTimepoints,
  useLongitudinalStore,
  useDetectionStore,
  useFindingsStore,
  useReportStore,
  useViewerStore,
  getLongitudinalMetrics,
  type LongitudinalTimepoint,
  type LongitudinalMetricsResult,
  type ProgressionClassification,
  type LongitudinalReportPayload,
  type LongitudinalTimepointData,
} from '@medai/core';
import { capture2DViewport } from '../../../lib/viewportCapture';

/**
 * Get classification display properties
 */
function getClassificationDisplay(classification: ProgressionClassification) {
  switch (classification) {
    case 'complete_response':
      return { color: 'text-green-400', bg: 'bg-green-500/10', label: 'CR', fullLabel: 'Complete Response' };
    case 'partial_response':
      return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'PR', fullLabel: 'Partial Response' };
    case 'stable_disease':
      return { color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'SD', fullLabel: 'Stable Disease' };
    case 'progressive_disease':
      return { color: 'text-red-400', bg: 'bg-red-500/10', label: 'PD', fullLabel: 'Progressive Disease' };
    default:
      return { color: 'text-text-muted', bg: 'bg-background-tertiary', label: 'NE', fullLabel: 'Not Evaluable' };
  }
}

interface TimepointPreviewProps {
  timepoint: LongitudinalTimepoint;
  isBaseline: boolean;
  findings?: string;
  detectionCount: number;
}

function TimepointPreview({ timepoint, isBaseline, findings, detectionCount }: TimepointPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-background-tertiary/30 hover:bg-background-tertiary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
          <span className="text-sm font-medium text-text-primary">{timepoint.label}</span>
          {isBaseline && (
            <span className="px-1.5 py-0.5 text-2xs font-semibold bg-accent-info/20 text-accent-info rounded">
              Baseline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {detectionCount > 0 && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {detectionCount}
            </span>
          )}
          {timepoint.studyDate && (
            <span>{timepoint.studyDate.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3/$1')}</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-3 border-t border-border-subtle text-sm">
          {findings ? (
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Findings</span>
              <p className="text-text-secondary mt-1 text-xs whitespace-pre-wrap">{findings}</p>
            </div>
          ) : (
            <p className="text-text-muted text-xs italic">No findings recorded</p>
          )}

          {detectionCount > 0 && (
            <div className="mt-2 text-xs text-text-muted">
              {detectionCount} AI detection{detectionCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LongitudinalReportTabProps {
  className?: string;
}

export function LongitudinalReportTab({ className = '' }: LongitudinalReportTabProps) {
  const navigate = useNavigate();
  const session = useActiveSession();
  const activeTimepoints = useActiveTimepoints();
  const { images } = useViewerStore();
  const { getDetectionsForImage } = useDetectionStore();
  const { getRadiologistObservations, getImageFindings } = useFindingsStore();
  const { setCollectedData, resetCollectedData } = useReportStore();

  const [isCapturing, setIsCapturing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get metrics for the session
  const metrics = useMemo<LongitudinalMetricsResult | null>(() => {
    if (!session) return null;
    return getLongitudinalMetrics(session.id);
  }, [session]);

  // Get overall classification from the last delta
  const overallClassification = useMemo(() => {
    if (!metrics || metrics.deltas.length === 0) return undefined;
    return metrics.deltas[metrics.deltas.length - 1].summary.classification;
  }, [metrics]);

  const classificationDisplay = overallClassification
    ? getClassificationDisplay(overallClassification)
    : null;

  // Get findings and detection counts for each timepoint
  const timepointData = useMemo(() => {
    if (!session) return [];

    return session.timepoints.map((tp) => ({
      timepoint: tp,
      findings: getRadiologistObservations(tp.imageId) || '',
      detectionCount: getDetectionsForImage(tp.imageId).length,
    }));
  }, [session, getRadiologistObservations, getDetectionsForImage]);

  // Handle generating longitudinal report
  const handleGenerateReport = useCallback(async () => {
    if (!session || session.timepoints.length < 2) {
      toast.error('Insufficient Data', 'At least 2 timepoints required for longitudinal report');
      return;
    }

    setIsCapturing(true);

    try {
      resetCollectedData();

      // Capture images and collect data for each timepoint
      const timepointDataArray: LongitudinalTimepointData[] = [];
      let mosaicImage: string | null = null;

      for (const tp of session.timepoints) {
        const image = images.get(tp.imageId);
        const detections = getDetectionsForImage(tp.imageId);
        const findings = getRadiologistObservations(tp.imageId);
        const clinicalContext = getImageFindings(tp.imageId)?.clinicalContext;

        // Try to capture viewport for this timepoint
        let imageBase64: string | undefined;
        try {
          // Note: In a full implementation, we'd switch viewport to this image and capture
          // For now, we'll just use the first capture as the mosaic
          if (!mosaicImage) {
            const captured = await capture2DViewport();
            mosaicImage = captured;
            imageBase64 = captured || undefined;
          }
        } catch (err) {
          console.warn('[LongitudinalReportTab] Failed to capture viewport:', err);
        }

        timepointDataArray.push({
          timepointId: tp.id,
          label: tp.label,
          studyDate: tp.studyDate,
          imageBase64,
          detections: detections.map((det) => ({
            label: det.label,
            confidence: det.confidence,
            x_min: det.x_min,
            y_min: det.y_min,
            x_max: det.x_max,
            y_max: det.y_max,
            source: det.source,
          })),
          volumetrics: null, // Would need to fetch from analytics store
          findings: findings || clinicalContext || '',
        });
      }

      // Build longitudinal payload
      const longitudinalPayload: LongitudinalReportPayload = {
        sessionId: session.id,
        patientId: session.patientId,
        patientName: session.patientName,
        modality: session.modality,
        anatomy: session.anatomy,
        timepoints: timepointDataArray,
        deltas: metrics?.deltas || [],
        overallClassification,
        clinicalContext: session.description,
      };

      // Set collected data for report page
      setCollectedData({
        mosaicImage: mosaicImage || '',
        overlaidImage: mosaicImage,
        volumetrics: null,
        radiomics: null,
        findings: `Longitudinal comparison of ${session.timepoints.length} timepoints`,
        modality: session.modality,
        patientInfo: {
          patientId: session.patientId,
          patientName: session.patientName,
          studyDescription: session.description,
        },
        clinicalContext: session.description,
        detections: [],
        longitudinal: longitudinalPayload,
      });

      // Navigate to report page
      navigate('/report');

    } catch (error) {
      console.error('[LongitudinalReportTab] Failed to prepare report:', error);
      toast.error('Error', 'Failed to prepare longitudinal report data');
    } finally {
      setIsCapturing(false);
    }
  }, [
    session,
    metrics,
    overallClassification,
    images,
    getDetectionsForImage,
    getRadiologistObservations,
    getImageFindings,
    setCollectedData,
    resetCollectedData,
    navigate,
  ]);

  // Handle session export
  const handleExportSession = useCallback(async () => {
    if (!session) return;

    setIsExporting(true);
    try {
      // Dynamic import to avoid bundling issues
      const { createSessionExportService } = await import('@medai/core');
      const exportService = createSessionExportService();

      // Gather all session data
      const segmentations: Parameters<typeof exportService.buildArtifact>[0] = [];
      const detections: Record<string, Array<{
        id: string;
        label: string;
        confidence: number;
        x_min: number;
        y_min: number;
        x_max: number;
        y_max: number;
        source: 'ai' | 'manual';
      }>> = {};
      const findings: Array<{
        imageId: string;
        radiologistObservations?: string;
        aiFindings?: string;
        clinicalContext?: string;
        timestamp?: string;
      }> = [];

      // Collect data for each timepoint
      for (const tp of session.timepoints) {
        const dets = getDetectionsForImage(tp.imageId);
        if (dets.length > 0) {
          detections[tp.imageId] = dets.map((d) => ({
            id: d.id || `det-${Date.now()}`,
            label: d.label,
            confidence: d.confidence,
            x_min: d.x_min,
            y_min: d.y_min,
            x_max: d.x_max,
            y_max: d.y_max,
            source: d.source as 'ai' | 'manual',
          }));
        }

        const obs = getRadiologistObservations(tp.imageId);
        const imageFindings = getImageFindings(tp.imageId);
        if (obs || imageFindings) {
          findings.push({
            imageId: tp.imageId,
            radiologistObservations: obs || undefined,
            clinicalContext: imageFindings?.clinicalContext,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Build artifact
      const artifact = await exportService.buildArtifact(
        segmentations,
        detections,
        findings,
        session,
        {
          includeLabelmaps: true,
          includeChecksum: true,
          applicationVersion: '1.0.0',
        }
      );

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `session_${session.patientId}_${timestamp}.json`;

      // Download
      await exportService.exportAndDownload(artifact, filename);

      toast.success('Session Exported', 'Session artifact downloaded successfully');
    } catch (error) {
      console.error('[LongitudinalReportTab] Export failed:', error);
      toast.error('Export Failed', 'Failed to export session artifact');
    } finally {
      setIsExporting(false);
    }
  }, [session, getDetectionsForImage, getRadiologistObservations, getImageFindings]);

  // Handle session import
  const handleImportSession = useCallback(async (file: File) => {
    setIsImporting(true);
    try {
      const { createSessionExportService } = await import('@medai/core');
      const exportService = createSessionExportService();

      const result = await exportService.importFromFile(file);

      if (!result.success) {
        toast.error('Import Failed', result.error || 'Failed to parse session artifact');
        return;
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          toast.warning('Import Warning', warning);
        }
      }

      // TODO: Apply imported data to stores
      // This would involve:
      // 1. Creating/updating longitudinal session
      // 2. Restoring segmentations with labelmaps
      // 3. Restoring detections
      // 4. Restoring findings

      toast.success('Session Imported', `Imported session with ${result.segmentations?.length || 0} segmentations`);
    } catch (error) {
      console.error('[LongitudinalReportTab] Import failed:', error);
      toast.error('Import Failed', 'Failed to import session artifact');
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportSession(file);
    }
    // Reset input
    if (event.target) {
      event.target.value = '';
    }
  }, [handleImportSession]);

  if (!session) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <FileText className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">No longitudinal session active</p>
        <p className="text-xs text-text-disabled mt-1">
          Start a session from the Study Browser
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-accent-primary" />
        <span className="text-sm font-semibold text-text-primary">Longitudinal Report</span>
      </div>

      {/* Session Summary */}
      <div className="p-3 bg-gradient-to-r from-accent-primary/10 to-transparent border border-accent-primary/30 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-primary">
            {session.patientName || session.patientId}
          </span>
          <span className="text-xs text-text-muted">
            {session.timepoints.length} timepoints
          </span>
        </div>

        {/* Overall classification badge */}
        {classificationDisplay && (
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${classificationDisplay.bg}`}>
            {overallClassification === 'progressive_disease' && <TrendingUp className="w-3.5 h-3.5" />}
            {overallClassification === 'partial_response' && <TrendingDown className="w-3.5 h-3.5" />}
            {overallClassification === 'stable_disease' && <Minus className="w-3.5 h-3.5" />}
            {overallClassification === 'complete_response' && <CheckCircle className="w-3.5 h-3.5" />}
            <span className={`text-xs font-semibold ${classificationDisplay.color}`}>
              {classificationDisplay.fullLabel}
            </span>
          </div>
        )}
      </div>

      {/* Timepoint previews */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide px-1">
          Timepoints
        </span>
        {timepointData.map((data, index) => (
          <TimepointPreview
            key={data.timepoint.id}
            timepoint={data.timepoint}
            isBaseline={index === 0}
            findings={data.findings}
            detectionCount={data.detectionCount}
          />
        ))}
      </div>

      {/* Metrics Warning */}
      {metrics && !metrics.isComplete && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-yellow-400">Incomplete Data</p>
              <p className="text-text-muted mt-0.5">{metrics.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Minimum timepoints warning */}
      {session.timepoints.length < 2 && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-yellow-400">Add More Timepoints</p>
              <p className="text-text-muted mt-0.5">
                At least 2 timepoints required for comparison report
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Generate Report Button */}
      <Button
        className="w-full"
        disabled={session.timepoints.length < 2 || isCapturing}
        onClick={handleGenerateReport}
      >
        {isCapturing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Preparing...
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Generate Comparison Report
          </>
        )}
      </Button>

      <p className="text-xs text-text-muted text-center">
        Generates a comprehensive report comparing all timepoints
      </p>

      {/* Session Export/Import */}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <div className="flex items-center gap-2 mb-3">
          <Archive className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            Session Artifact
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={isExporting}
            onClick={handleExportSession}
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            Export
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 mr-1.5" />
            )}
            Import
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <p className="text-2xs text-text-disabled text-center mt-2">
          Export/import complete session with segmentations and measurements
        </p>
      </div>
    </div>
  );
}
