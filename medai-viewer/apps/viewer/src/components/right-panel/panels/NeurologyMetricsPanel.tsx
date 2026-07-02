/**
 * NeurologyMetricsPanel - Neurology Suite Metrics Display
 *
 * Displays brain-specific metrics including:
 * - Lesion count and load
 * - Brain volumetrics
 * - Regional volume comparisons
 * - Atrophy analysis
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useSegmentationStore, useAnalyticsStore } from '@medai/core';
import type { SegmentVolumetrics, Segment } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  Brain,
  Activity,
  Download,
  Copy,
  AlertCircle,
  TrendingDown,
  Layers,
} from 'lucide-react';

interface NeurologyMetricsPanelProps {
  activeSegmentationId: string | null;
}

/**
 * Formats a volume value to a readable string with appropriate units
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

export function NeurologyMetricsPanel({ activeSegmentationId }: NeurologyMetricsPanelProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  // Get segmentation data
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  // Get analytics data
  const volumetricsResult = useAnalyticsStore((state) => state.volumetricsResult);

  // Derive volume data from volumetrics result
  const volumeData: SegmentVolumetrics[] = useMemo(() => {
    if (!volumetricsResult?.volumetrics?.segments) {
      return [];
    }
    return volumetricsResult.volumetrics.segments;
  }, [volumetricsResult]);

  // Identify lesion segments vs brain structure segments
  const { lesionSegments, brainStructures } = useMemo(() => {
    const lesionKeywords = ['lesion', 'ms', 'wmh', 'stroke', 'tumor', 'hemorrhage', 'ich', 'infarct'];

    const lesions: SegmentVolumetrics[] = [];
    const structures: SegmentVolumetrics[] = [];

    volumeData.forEach((seg) => {
      const labelLower = seg.label.toLowerCase();
      const isLesion = lesionKeywords.some((kw) => labelLower.includes(kw));
      if (isLesion) {
        lesions.push(seg);
      } else {
        structures.push(seg);
      }
    });

    return { lesionSegments: lesions, brainStructures: structures };
  }, [volumeData]);

  // Calculate metrics
  const lesionCount = lesionSegments.length;
  const totalLesionLoad = useMemo(
    () => lesionSegments.reduce((sum, seg) => sum + seg.total_volume_cm3, 0),
    [lesionSegments]
  );
  const averageLesionVolume = lesionCount > 0 ? totalLesionLoad / lesionCount : 0;
  const largestLesion = useMemo(
    () =>
      lesionSegments.length > 0
        ? Math.max(...lesionSegments.map((seg) => seg.total_volume_cm3))
        : 0,
    [lesionSegments]
  );
  const totalBrainVolume = useMemo(
    () => brainStructures.reduce((sum, seg) => sum + seg.total_volume_cm3, 0),
    [brainStructures]
  );

  /**
   * Generates CSV content from the current metrics data
   */
  const generateCSV = useCallback((): string => {
    const headers = ['Structure', 'Volume (cm3)', 'Type'];
    const rows = volumeData.map((seg) => {
      const labelLower = seg.label.toLowerCase();
      const isLesion = ['lesion', 'ms', 'wmh', 'stroke'].some((kw) => labelLower.includes(kw));
      return [seg.label, seg.total_volume_cm3.toFixed(4), isLesion ? 'Lesion' : 'Structure'];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      '',
      `Lesion Count,${lesionCount}`,
      `Total Lesion Load,${totalLesionLoad.toFixed(4)} cm3`,
      `Total Brain Volume,${totalBrainVolume.toFixed(4)} cm3`,
    ].join('\n');

    return csvContent;
  }, [volumeData, lesionCount, totalLesionLoad, totalBrainVolume]);

  /**
   * Handles CSV export
   */
  const handleExportCSV = useCallback(() => {
    const csv = generateCSV();
    const timestamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neurology-metrics-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generateCSV]);

  /**
   * Handles copy to clipboard
   */
  const handleCopyToClipboard = useCallback(async () => {
    try {
      const data = {
        segmentationId: activeSegmentationId,
        exportDate: new Date().toISOString(),
        lesionCount,
        totalLesionLoad,
        averageLesionVolume,
        largestLesion,
        totalBrainVolume,
        lesions: lesionSegments,
        structures: brainStructures,
      };
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [
    activeSegmentationId,
    lesionCount,
    totalLesionLoad,
    averageLesionVolume,
    largestLesion,
    totalBrainVolume,
    lesionSegments,
    brainStructures,
  ]);

  if (!activeSegmentationId) {
    return (
      <div className="mt-4">
        <Panel title="Neurology Metrics">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Brain className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-muted text-sm">No active segmentation.</p>
            <p className="text-text-muted text-xs mt-1">
              Create or load a segmentation to view brain metrics.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const hasVolumeData = volumeData.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* Lesion Analysis Section */}
      <Panel
        title="Lesion Analysis"
        collapsible
        badge={lesionCount > 0 ? lesionCount : undefined}
        actions={<AlertCircle className="h-4 w-4 text-orange-500" />}
      >
        {lesionCount === 0 ? (
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No lesions detected.</p>
            <p className="text-text-muted text-xs mt-1">
              Run brain lesion segmentation to analyze lesions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Lesion Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
                <div className="text-xs text-text-muted">Lesion Count</div>
                <div className="text-lg font-bold text-orange-500">{lesionCount}</div>
              </div>
              <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
                <div className="text-xs text-text-muted">Total Load</div>
                <div className="text-lg font-bold text-text-primary">
                  {formatVolume(totalLesionLoad)}
                </div>
              </div>
              <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
                <div className="text-xs text-text-muted">Avg Size</div>
                <div className="text-lg font-bold text-text-primary">
                  {formatVolume(averageLesionVolume)}
                </div>
              </div>
              <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
                <div className="text-xs text-text-muted">Largest</div>
                <div className="text-lg font-bold text-text-primary">
                  {formatVolume(largestLesion)}
                </div>
              </div>
            </div>

            {/* Lesion List */}
            <div className="space-y-1 max-h-32 overflow-y-auto">
              <div className="text-xs font-medium text-text-muted px-2">Individual Lesions</div>
              {lesionSegments.map((seg) => {
                const segmentColor =
                  activeSegmentation?.segments.find((s) => s.segmentIndex === seg.segment_index)
                    ?.color || '#FF6B6B';
                return (
                  <div
                    key={seg.segment_index}
                    className="flex items-center justify-between text-sm py-1 px-2 border-b border-border-subtle last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: segmentColor }}
                      />
                      <span className="text-text-primary">{seg.label}</span>
                    </div>
                    <span className="text-text-muted">{formatVolume(seg.total_volume_cm3)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {/* Brain Volumetrics Section */}
      <Panel
        title="Brain Volumetrics"
        collapsible
        defaultCollapsed={!hasVolumeData}
        badge={brainStructures.length > 0 ? brainStructures.length : undefined}
        actions={<Layers className="h-4 w-4 text-purple-500" />}
      >
        {brainStructures.length === 0 ? (
          <div className="text-center py-4">
            <Layers className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No brain structures segmented.</p>
            <p className="text-text-muted text-xs mt-1">
              Run brain parcellation to analyze volumes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
              <div className="text-xs text-text-muted">Total Segmented Volume</div>
              <div className="text-lg font-bold text-purple-500">
                {formatVolume(totalBrainVolume)}
              </div>
            </div>

            {/* Structure List */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              <div className="text-xs font-medium text-text-muted px-2">Brain Structures</div>
              {brainStructures.map((seg) => {
                const segmentColor =
                  activeSegmentation?.segments.find((s) => s.segmentIndex === seg.segment_index)
                    ?.color || '#808080';
                const percent =
                  totalBrainVolume > 0
                    ? ((seg.total_volume_cm3 / totalBrainVolume) * 100).toFixed(1)
                    : '0';
                return (
                  <div
                    key={seg.segment_index}
                    className="flex items-center justify-between text-sm py-1 px-2 border-b border-border-subtle last:border-0"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: segmentColor }}
                      />
                      <span className="text-text-primary truncate">{seg.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-text-muted">
                      <span>{formatVolume(seg.total_volume_cm3)}</span>
                      <span className="text-xs">({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {/* Atrophy Analysis Section */}
      <Panel
        title="Atrophy Analysis"
        collapsible
        defaultCollapsed
        actions={<TrendingDown className="h-4 w-4 text-red-500" />}
      >
        <div className="text-center py-4">
          <TrendingDown className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">
            Atrophy analysis requires comparison with baseline study.
          </p>
          <p className="text-text-muted text-xs mt-1">
            Load a prior study to enable longitudinal analysis.
          </p>
        </div>
      </Panel>

      {/* Export Section */}
      <Panel
        title="Export"
        collapsible
        defaultCollapsed
        actions={<Download className="h-4 w-4 text-text-muted" />}
      >
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            Export neurology metrics data for external analysis or reporting.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!hasVolumeData}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              disabled={!hasVolumeData}
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

export default NeurologyMetricsPanel;
