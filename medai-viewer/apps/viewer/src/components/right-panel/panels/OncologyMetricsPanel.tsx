import React, { useState, useCallback, useMemo } from 'react';
import { Target, TrendingUp, Download, Copy, Activity, AlertCircle, Zap, Flame, ClipboardList, ToggleLeft, ToggleRight } from 'lucide-react';
import { Panel, Button } from '@medai/ui';
import { useSegmentationStore, useAnalyticsStore, useViewerStore, isPETModality, useRECISTStore } from '@medai/core';
import type { SegmentVolumetrics, SUVResult, SegmentSUVMetrics } from '@medai/core';
import { PETMetricsPanel } from './PETMetricsPanel';
import { RECISTTargetSelectionPanel } from './RECISTTargetSelectionPanel';
import { RECISTNonTargetPanel } from './RECISTNonTargetPanel';
import { RECISTAssessmentTable } from './RECISTAssessmentTable';

/**
 * Props for the OncologyMetricsPanel component
 */
interface OncologyMetricsPanelProps {
  /** The ID of the currently active segmentation */
  activeSegmentationId: string | null;
}

/**
 * Placeholder lesion data structure for demonstration
 */
interface Lesion {
  id: string;
  segmentIndex: number;
  label: string;
  volumeCm3: number;
  location: string;
}

/**
 * Formats a volume value to a readable string with appropriate units
 * @param volumeCm3 - Volume in cubic centimeters
 * @returns Formatted string with units
 */
function formatVolume(volumeCm3: number): string {
  if (volumeCm3 < 0.001) {
    return `${(volumeCm3 * 1000).toFixed(3)} mm\u00B3`;
  }
  if (volumeCm3 < 1) {
    return `${volumeCm3.toFixed(3)} cm\u00B3`;
  }
  return `${volumeCm3.toFixed(2)} cm\u00B3`;
}

/**
 * OncologyMetricsPanel displays oncology-specific metrics for MedAI RT Suite.
 *
 * Features:
 * - Volume summary per segment from volumetrics results
 * - Lesion table (placeholder for detected lesions)
 * - Export functionality (CSV, JSON, clipboard)
 *
 * @param props - Component props
 * @returns The OncologyMetricsPanel component
 */
export function OncologyMetricsPanel({
  activeSegmentationId,
}: OncologyMetricsPanelProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  // RECIST mode state
  const isRECISTModeActive = useRECISTStore((state) => state.isRECISTModeActive);
  const setRECISTModeActive = useRECISTStore((state) => state.setRECISTModeActive);

  // Get segmentation data
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  // Get analytics data
  const volumetricsResult = useAnalyticsStore((state) => state.volumetricsResult);
  const suvResult = useAnalyticsStore((state) => state.suvResult);

  // Get viewer data for modality detection
  const { images, activeImageId, pacsStudy } = useViewerStore();
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;

  // Check if current image is PET modality
  const isPET = useMemo(() => {
    const imageModality = activeImage?.metadata.modality;
    const studyModality = pacsStudy?.modality;
    return isPETModality(imageModality) || isPETModality(studyModality);
  }, [activeImage, pacsStudy]);

  // Derive volume data from volumetrics result
  const volumeData: SegmentVolumetrics[] = useMemo(() => {
    if (!volumetricsResult?.volumetrics?.segments) {
      return [];
    }
    return volumetricsResult.volumetrics.segments;
  }, [volumetricsResult]);

  // Generate placeholder lesion data from segments
  const lesions: Lesion[] = useMemo(() => {
    if (!activeSegmentation?.segments || volumeData.length === 0) {
      return [];
    }

    // Create placeholder lesions from segments that have volume data
    return volumeData.map((segVol, index) => ({
      id: `L${String(index + 1).padStart(3, '0')}`,
      segmentIndex: segVol.segment_index,
      label: segVol.label,
      volumeCm3: segVol.total_volume_cm3,
      location: 'N/A', // Placeholder - would come from anatomical mapping
    }));
  }, [activeSegmentation, volumeData]);

  // Calculate total tumor burden
  const totalTumorBurden = useMemo(() => {
    return volumeData.reduce((sum, seg) => sum + seg.total_volume_cm3, 0);
  }, [volumeData]);

  /**
   * Generates CSV content from the current metrics data
   */
  const generateCSV = useCallback((): string => {
    const headers = ['Segment Index', 'Label', 'Volume (cm3)', 'Voxel Count', 'Instance Count'];
    const rows = volumeData.map((seg) => [
      seg.segment_index,
      seg.label,
      seg.total_volume_cm3.toFixed(4),
      seg.total_voxel_count,
      seg.instance_count,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      '',
      `Total Tumor Burden,${totalTumorBurden.toFixed(4)} cm3`,
    ].join('\n');

    return csvContent;
  }, [volumeData, totalTumorBurden]);

  /**
   * Generates JSON content from the current metrics data
   */
  const generateJSON = useCallback((): string => {
    const data = {
      segmentationId: activeSegmentationId,
      exportDate: new Date().toISOString(),
      modality: isPET ? 'PT' : activeImage?.metadata.modality || 'Unknown',
      totalTumorBurden: totalTumorBurden,
      segments: volumeData.map((seg) => {
        // Find matching SUV data if available
        const suvData = suvResult?.segments?.find(
          (s) => s.segment_index === seg.segment_index
        );

        return {
          segmentIndex: seg.segment_index,
          label: seg.label,
          volumeCm3: seg.total_volume_cm3,
          volumeMm3: seg.total_volume_mm3,
          voxelCount: seg.total_voxel_count,
          instanceCount: seg.instance_count,
          instances: seg.instances,
          // Include SUV metrics if available
          ...(suvData && {
            suvMetrics: {
              suvMax: suvData.suv_max,
              suvMean: suvData.suv_mean,
              suvPeak: suvData.suv_peak,
              metabolicVolumeCm3: suvData.metabolic_volume_cm3,
              totalLesionGlycolysis: suvData.total_lesion_glycolysis,
            },
          }),
        };
      }),
      lesions: lesions,
      // Include SUV summary if available
      ...(suvResult && {
        suvSummary: {
          peakSUVmax: Math.max(...(suvResult.segments?.map((s) => s.suv_max) || [0])),
          totalMetabolicVolume: suvResult.segments?.reduce(
            (sum, s) => sum + s.metabolic_volume_cm3,
            0
          ) || 0,
          totalTLG: suvResult.segments?.reduce(
            (sum, s) => sum + s.total_lesion_glycolysis,
            0
          ) || 0,
          normalizationMethod: suvResult.metadata?.normalization_method,
          suvThreshold: suvResult.metadata?.suv_threshold,
        },
      }),
    };

    return JSON.stringify(data, null, 2);
  }, [activeSegmentationId, volumeData, lesions, totalTumorBurden, suvResult, isPET, activeImage]);

  /**
   * Downloads a file with the given content
   */
  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Handles CSV export
   */
  const handleExportCSV = useCallback(() => {
    const csv = generateCSV();
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `oncology-metrics-${timestamp}.csv`, 'text/csv');
  }, [generateCSV, downloadFile]);

  /**
   * Handles JSON export
   */
  const handleExportJSON = useCallback(() => {
    const json = generateJSON();
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(json, `oncology-metrics-${timestamp}.json`, 'application/json');
  }, [generateJSON, downloadFile]);

  /**
   * Handles copy to clipboard
   */
  const handleCopyToClipboard = useCallback(async () => {
    try {
      const json = generateJSON();
      await navigator.clipboard.writeText(json);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [generateJSON]);

  // Show empty state when no segmentation is active
  if (!activeSegmentationId) {
    return (
      <div className="mt-4">
        <Panel title="Oncology Metrics">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-muted text-sm">
              No active segmentation.
            </p>
            <p className="text-text-muted text-xs mt-1">
              Create or load a segmentation to view oncology metrics.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const hasVolumeData = volumeData.length > 0;
  const hasSUVData = suvResult?.segments && suvResult.segments.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* RECIST Mode Toggle */}
      <Panel
        title="Response Assessment"
        actions={
          <ClipboardList className="h-4 w-4 text-accent-primary" />
        }
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-text-primary">RECIST 1.1 Mode</span>
            <p className="text-xs text-text-muted mt-0.5">
              Enable tumor response tracking with RECIST criteria
            </p>
          </div>
          <button
            onClick={() => setRECISTModeActive(!isRECISTModeActive)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              isRECISTModeActive
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-background-hover text-text-muted hover:text-text-primary'
            }`}
          >
            {isRECISTModeActive ? (
              <>
                <ToggleRight className="w-5 h-5" />
                <span className="text-sm font-medium">Active</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Off</span>
              </>
            )}
          </button>
        </div>
      </Panel>

      {/* RECIST Panels - shown when RECIST mode is active */}
      {isRECISTModeActive && (
        <>
          <RECISTTargetSelectionPanel activeSegmentationId={activeSegmentationId} />
          <RECISTNonTargetPanel activeSegmentationId={activeSegmentationId} />
          <RECISTAssessmentTable />
        </>
      )}

      {/* PET Metrics Panel - shown when PT modality is detected */}
      {isPET && (
        <PETMetricsPanel activeSegmentationId={activeSegmentationId} />
      )}

      {/* SUV Summary Banner - shown when SUV data is available */}
      {hasSUVData && (
        <div className="p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/5 border border-orange-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-semibold text-text-primary">PET/SUV Available</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-text-muted block">Peak SUVmax</span>
              <span className="text-orange-400 font-semibold">
                {Math.max(...(suvResult.segments?.map((s) => s.suv_max) || [0])).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Total MTV</span>
              <span className="text-text-secondary font-medium">
                {(suvResult.segments?.reduce((sum, s) => sum + s.metabolic_volume_cm3, 0) || 0).toFixed(2)} cm3
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Total TLG</span>
              <span className="text-text-secondary font-medium">
                {(suvResult.segments?.reduce((sum, s) => sum + s.total_lesion_glycolysis, 0) || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Volume Summary Section */}
      <Panel
        title="Volume Summary"
        collapsible
        badge={hasVolumeData ? volumeData.length : undefined}
        actions={
          <Target className="h-4 w-4 text-text-muted" />
        }
      >
        {!hasVolumeData ? (
          <div className="text-center py-4">
            <Activity className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">
              No volumetrics data available.
            </p>
            <p className="text-text-muted text-xs mt-1">
              Run volumetrics analysis from the Analytics panel.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Total Tumor Burden */}
            <div className="flex items-center justify-between p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent-primary" />
                <span className="text-sm font-medium text-text-primary">
                  Total Tumor Burden
                </span>
              </div>
              <span className="text-sm font-semibold text-accent-primary">
                {formatVolume(totalTumorBurden)}
              </span>
            </div>

            {/* Per-segment volumes */}
            <div className="space-y-2">
              {volumeData.map((segment) => (
                <div
                  key={segment.segment_index}
                  className="flex items-center justify-between p-2 hover:bg-background-hover/30 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          activeSegmentation?.segments.find(
                            (s) => s.segmentIndex === segment.segment_index
                          )?.color || '#888888',
                      }}
                    />
                    <span className="text-sm text-text-primary truncate">
                      {segment.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-text-muted">
                      {segment.instance_count} instance{segment.instance_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-medium text-text-secondary">
                      {formatVolume(segment.total_volume_cm3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Lesion Table Section */}
      <Panel
        title="Detected Lesions"
        collapsible
        defaultCollapsed={!hasVolumeData}
        badge={lesions.length > 0 ? lesions.length : undefined}
        actions={
          <Target className="h-4 w-4 text-text-muted" />
        }
      >
        {lesions.length === 0 ? (
          <div className="text-center py-4">
            <Target className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">
              No lesions detected.
            </p>
            <p className="text-text-muted text-xs mt-1">
              Lesion detection requires volumetrics analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-2 px-2 py-1 text-xs font-medium text-text-muted border-b border-border-subtle">
              <span>ID</span>
              <span>Label</span>
              <span>Volume</span>
              <span>Location</span>
            </div>

            {/* Table Rows */}
            {lesions.map((lesion) => (
              <div
                key={lesion.id}
                className="grid grid-cols-4 gap-2 px-2 py-2 text-sm hover:bg-background-hover/30 rounded-lg transition-colors"
              >
                <span className="text-text-secondary font-mono text-xs">
                  {lesion.id}
                </span>
                <span className="text-text-primary truncate">
                  {lesion.label}
                </span>
                <span className="text-text-secondary">
                  {formatVolume(lesion.volumeCm3)}
                </span>
                <span className="text-text-muted truncate">
                  {lesion.location}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Export Section */}
      <Panel
        title="Export"
        collapsible
        defaultCollapsed
        actions={
          <Download className="h-4 w-4 text-text-muted" />
        }
      >
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            Export oncology metrics data for external analysis or reporting.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!hasVolumeData}
              data-testid="export-csv-button"
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              disabled={!hasVolumeData}
              data-testid="export-json-button"
            >
              <Download className="h-4 w-4 mr-1" />
              JSON
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              disabled={!hasVolumeData}
              data-testid="copy-clipboard-button"
            >
              <Copy className="h-4 w-4 mr-1" />
              {copySuccess ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          {!hasVolumeData && (
            <p className="text-text-muted text-xs italic">
              Run volumetrics analysis to enable export options.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default OncologyMetricsPanel;
