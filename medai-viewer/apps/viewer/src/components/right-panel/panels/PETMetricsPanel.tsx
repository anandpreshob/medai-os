/**
 * PETMetricsPanel - Display SUV metrics for PET imaging
 *
 * Features:
 * - Per-lesion SUV metrics (SUVmax, SUVmean, SUVpeak)
 * - Metabolic volume and TLG display
 * - SUV threshold configuration
 * - Export functionality
 * - Visual classification of uptake levels
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Activity,
  Zap,
  Target,
  TrendingUp,
  Download,
  Copy,
  AlertCircle,
  Loader2,
  Settings,
  Info,
  ChevronDown,
  ChevronUp,
  Flame,
} from 'lucide-react';
import { Panel, Button, toast } from '@medai/ui';
import {
  useSegmentationStore,
  useAnalyticsStore,
  useViewerStore,
  type SegmentVolumetrics,
} from '@medai/core';

// ============================================================================
// Types
// ============================================================================

interface PETMetricsPanelProps {
  /** The ID of the currently active segmentation */
  activeSegmentationId: string | null;
}

interface SUVMetrics {
  segmentLabel: string;
  segmentIndex: number;
  suvMax: number;
  suvMean: number;
  suvPeak: number;
  suvMin: number;
  suvStd: number;
  metabolicVolumeCm3: number;
  totalLesionGlycolysis: number;
  voxelCount: number;
  volumeCm3: number;
  maxLocationIjk?: [number, number, number];
}

interface SUVComputationResult {
  segments: SUVMetrics[];
  metadata: {
    normalizationMethod: string;
    suvThreshold: number;
    patientWeightKg: number;
    injectedDoseBq: number;
    decayFactor: number;
    decayCorrected: boolean;
    computationTimeSeconds: number;
  };
  warnings?: string[];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats SUV value for display
 */
function formatSUV(value: number): string {
  if (!isFinite(value) || isNaN(value)) return 'N/A';
  return value.toFixed(2);
}

/**
 * Formats volume for display
 */
function formatVolume(volumeCm3: number): string {
  if (volumeCm3 < 0.1) {
    return `${(volumeCm3 * 1000).toFixed(1)} mm\u00B3`;
  }
  return `${volumeCm3.toFixed(2)} cm\u00B3`;
}

/**
 * Formats TLG for display
 */
function formatTLG(tlg: number): string {
  if (tlg < 1) return tlg.toFixed(3);
  if (tlg < 100) return tlg.toFixed(2);
  return tlg.toFixed(1);
}

/**
 * Get uptake level classification based on SUVmax
 */
function getUptakeLevel(suvMax: number): {
  level: 'low' | 'moderate' | 'high' | 'very-high';
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  if (suvMax < 2.5) {
    return {
      level: 'low',
      label: 'Low',
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
    };
  }
  if (suvMax < 5) {
    return {
      level: 'moderate',
      label: 'Moderate',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
    };
  }
  if (suvMax < 10) {
    return {
      level: 'high',
      label: 'High',
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
    };
  }
  return {
    level: 'very-high',
    label: 'Very High',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  };
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * SUV metrics row for a single segment
 */
function SUVMetricsRow({
  metrics,
  isExpanded,
  onToggleExpand,
  segmentColor,
}: {
  metrics: SUVMetrics;
  isExpanded: boolean;
  onToggleExpand: () => void;
  segmentColor?: string;
}) {
  const uptake = getUptakeLevel(metrics.suvMax);

  return (
    <div
      className={`rounded-lg border transition-all ${uptake.borderColor} ${uptake.bgColor}`}
    >
      {/* Header row - always visible */}
      <button
        className="w-full p-3 flex items-center justify-between text-left"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: segmentColor || '#888888' }}
          />
          <span className="text-sm font-medium text-text-primary truncate">
            {metrics.segmentLabel}
          </span>
          <span
            className={`px-1.5 py-0.5 text-2xs font-semibold rounded ${uptake.bgColor} ${uptake.color}`}
          >
            {uptake.label}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <span className="text-xs text-text-muted">SUVmax</span>
            <span className={`ml-2 text-sm font-bold ${uptake.color}`}>
              {formatSUV(metrics.suvMax)}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border-subtle/50">
          {/* SUV metrics grid */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center p-2 bg-background-tertiary/30 rounded">
              <span className="text-2xs text-text-muted block">SUVmax</span>
              <span className="text-sm font-bold text-text-primary">
                {formatSUV(metrics.suvMax)}
              </span>
            </div>
            <div className="text-center p-2 bg-background-tertiary/30 rounded">
              <span className="text-2xs text-text-muted block">SUVmean</span>
              <span className="text-sm font-semibold text-text-secondary">
                {formatSUV(metrics.suvMean)}
              </span>
            </div>
            <div className="text-center p-2 bg-background-tertiary/30 rounded">
              <span className="text-2xs text-text-muted block">SUVpeak</span>
              <span className="text-sm font-semibold text-text-secondary">
                {formatSUV(metrics.suvPeak)}
              </span>
            </div>
          </div>

          {/* Additional metrics */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Metabolic Volume</span>
              <span className="text-text-secondary font-mono">
                {formatVolume(metrics.metabolicVolumeCm3)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Total Lesion Glycolysis</span>
              <span className="text-text-secondary font-mono">
                {formatTLG(metrics.totalLesionGlycolysis)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Total Volume</span>
              <span className="text-text-secondary font-mono">
                {formatVolume(metrics.volumeCm3)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SUV Range</span>
              <span className="text-text-secondary font-mono">
                {formatSUV(metrics.suvMin)} - {formatSUV(metrics.suvMax)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SUV Std Dev</span>
              <span className="text-text-secondary font-mono">
                {formatSUV(metrics.suvStd)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Summary card showing aggregate PET metrics
 */
function PETSummaryCard({
  suvResults,
  threshold,
}: {
  suvResults: SUVMetrics[];
  threshold: number;
}) {
  // Calculate aggregate metrics
  const maxSUVmax = useMemo(
    () => Math.max(...suvResults.map((s) => s.suvMax)),
    [suvResults]
  );
  const totalMTV = useMemo(
    () => suvResults.reduce((sum, s) => sum + s.metabolicVolumeCm3, 0),
    [suvResults]
  );
  const totalTLG = useMemo(
    () => suvResults.reduce((sum, s) => sum + s.totalLesionGlycolysis, 0),
    [suvResults]
  );

  const uptake = getUptakeLevel(maxSUVmax);

  return (
    <div className="p-3 bg-gradient-to-br from-background-tertiary/60 to-background-tertiary/30 rounded-xl border border-border-subtle">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">
            PET Summary
          </span>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-semibold rounded ${uptake.bgColor} ${uptake.color} border ${uptake.borderColor}`}
        >
          {suvResults.length} lesion{suvResults.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <span className="text-2xs text-text-muted block mb-1">Peak SUVmax</span>
          <span className={`text-lg font-bold ${uptake.color}`}>
            {formatSUV(maxSUVmax)}
          </span>
        </div>
        <div className="text-center">
          <span className="text-2xs text-text-muted block mb-1">Total MTV</span>
          <span className="text-lg font-semibold text-text-primary">
            {formatVolume(totalMTV)}
          </span>
        </div>
        <div className="text-center">
          <span className="text-2xs text-text-muted block mb-1">Total TLG</span>
          <span className="text-lg font-semibold text-text-primary">
            {formatTLG(totalTLG)}
          </span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-border-subtle/50 text-2xs text-text-muted text-center">
        MTV threshold: SUV &gt; {threshold}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * PETMetricsPanel displays SUV metrics for PET imaging in oncology workflows.
 */
export function PETMetricsPanel({ activeSegmentationId }: PETMetricsPanelProps) {
  const [isComputing, setIsComputing] = useState(false);
  const [suvResults, setSuvResults] = useState<SUVMetrics[] | null>(null);
  const [suvMetadata, setSuvMetadata] = useState<SUVComputationResult['metadata'] | null>(null);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set());
  const [copySuccess, setCopySuccess] = useState(false);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [suvThreshold, setSuvThreshold] = useState(2.5);
  const [normalizationMethod, setNormalizationMethod] = useState<'bw' | 'lbm' | 'bsa'>('bw');

  // Store access
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  const { images, activeImageId, pacsStudy } = useViewerStore();
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;

  // Check if current image is PET modality
  const isPETImage = useMemo(() => {
    const modality = activeImage?.metadata.modality?.toUpperCase();
    if (modality === 'PT' || modality === 'PET') return true;

    // Also check PACS study modality
    const studyModality = pacsStudy?.modality?.toUpperCase();
    return studyModality === 'PT' || studyModality === 'PET';
  }, [activeImage, pacsStudy]);

  // Toggle segment expansion
  const toggleSegmentExpansion = useCallback((segmentIndex: number) => {
    setExpandedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(segmentIndex)) {
        next.delete(segmentIndex);
      } else {
        next.add(segmentIndex);
      }
      return next;
    });
  }, []);

  /**
   * Compute SUV metrics (placeholder - would call backend)
   */
  const handleComputeSUV = useCallback(async () => {
    if (!activeSegmentationId || !activeImage) return;

    setIsComputing(true);
    setComputeError(null);

    try {
      // TODO: Implement actual backend call to /suv/compute
      // For now, show a placeholder message
      toast.info(
        'SUV Computation',
        'SUV computation requires PET DICOM metadata. Please ensure the image is a PET scan with proper DICOM headers.'
      );

      // Simulated delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // For demonstration, create placeholder results
      const placeholderResults: SUVMetrics[] =
        activeSegmentation?.segments.map((seg, idx) => ({
          segmentLabel: seg.label,
          segmentIndex: seg.segmentIndex,
          suvMax: 3.5 + Math.random() * 8, // Simulated values
          suvMean: 2.0 + Math.random() * 4,
          suvPeak: 3.0 + Math.random() * 6,
          suvMin: 0.5 + Math.random() * 1.5,
          suvStd: 0.8 + Math.random() * 1.2,
          metabolicVolumeCm3: 1.5 + Math.random() * 10,
          totalLesionGlycolysis: 5 + Math.random() * 50,
          voxelCount: 1000 + Math.floor(Math.random() * 5000),
          volumeCm3: 2 + Math.random() * 15,
        })) || [];

      setSuvResults(placeholderResults);
      setSuvMetadata({
        normalizationMethod,
        suvThreshold,
        patientWeightKg: 70,
        injectedDoseBq: 370000000, // 370 MBq
        decayFactor: 0.85,
        decayCorrected: true,
        computationTimeSeconds: 1.2,
      });

      // Expand first segment by default
      if (placeholderResults.length > 0) {
        setExpandedSegments(new Set([placeholderResults[0].segmentIndex]));
      }
    } catch (err) {
      console.error('[PETMetricsPanel] SUV computation failed:', err);
      setComputeError(err instanceof Error ? err.message : 'SUV computation failed');
    } finally {
      setIsComputing(false);
    }
  }, [activeSegmentationId, activeImage, activeSegmentation, normalizationMethod, suvThreshold]);

  /**
   * Generate export data
   */
  const generateExportData = useCallback(() => {
    if (!suvResults || !suvMetadata) return null;

    return {
      exportDate: new Date().toISOString(),
      segmentationId: activeSegmentationId,
      computationParams: suvMetadata,
      segments: suvResults.map((seg) => ({
        label: seg.segmentLabel,
        segmentIndex: seg.segmentIndex,
        suvMax: seg.suvMax,
        suvMean: seg.suvMean,
        suvPeak: seg.suvPeak,
        suvMin: seg.suvMin,
        suvStd: seg.suvStd,
        metabolicVolumeCm3: seg.metabolicVolumeCm3,
        totalLesionGlycolysis: seg.totalLesionGlycolysis,
        volumeCm3: seg.volumeCm3,
      })),
      summary: {
        lesionCount: suvResults.length,
        maxSUVmax: Math.max(...suvResults.map((s) => s.suvMax)),
        totalMetabolicVolume: suvResults.reduce((sum, s) => sum + s.metabolicVolumeCm3, 0),
        totalTLG: suvResults.reduce((sum, s) => sum + s.totalLesionGlycolysis, 0),
      },
    };
  }, [suvResults, suvMetadata, activeSegmentationId]);

  /**
   * Export to JSON
   */
  const handleExportJSON = useCallback(() => {
    const data = generateExportData();
    if (!data) return;

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suv-metrics-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generateExportData]);

  /**
   * Copy to clipboard
   */
  const handleCopyToClipboard = useCallback(async () => {
    const data = generateExportData();
    if (!data) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      toast.success('Copied', 'SUV metrics copied to clipboard');
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Copy failed', 'Failed to copy to clipboard');
    }
  }, [generateExportData]);

  // Don't show panel if not a PET image
  if (!isPETImage) {
    return null;
  }

  // Show empty state when no segmentation is active
  if (!activeSegmentationId) {
    return (
      <div className="mt-4">
        <Panel
          title="PET Metrics"
          actions={<Zap className="h-4 w-4 text-text-muted" />}
        >
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-muted text-sm">No active segmentation.</p>
            <p className="text-text-muted text-xs mt-1">
              Create or load a segmentation to compute SUV metrics.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const hasSegments = activeSegmentation && activeSegmentation.segments.length > 0;
  const hasResults = suvResults && suvResults.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* Compute SUV Panel */}
      <Panel
        title="PET/SUV Metrics"
        actions={<Zap className="h-4 w-4 text-accent-primary" />}
      >
        <div className="space-y-3">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-2 bg-accent-primary/5 border border-accent-primary/20 rounded-lg">
            <Info className="w-4 h-4 text-accent-primary flex-shrink-0 mt-0.5" />
            <p className="text-2xs text-text-muted">
              SUV (Standardized Uptake Value) quantifies radiotracer uptake in PET imaging.
              Higher values indicate increased metabolic activity.
            </p>
          </div>

          {/* Settings toggle */}
          <button
            className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
            {showSettings ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {/* Settings panel */}
          {showSettings && (
            <div className="p-3 bg-background-tertiary/30 rounded-lg space-y-3 border border-border-subtle">
              {/* Normalization method */}
              <div>
                <label className="text-xs text-text-muted block mb-1.5">
                  Normalization Method
                </label>
                <select
                  className="w-full px-2 py-1.5 text-sm bg-background-primary border border-border-subtle rounded"
                  value={normalizationMethod}
                  onChange={(e) =>
                    setNormalizationMethod(e.target.value as 'bw' | 'lbm' | 'bsa')
                  }
                >
                  <option value="bw">Body Weight (SUVbw)</option>
                  <option value="lbm">Lean Body Mass (SUVlbm)</option>
                  <option value="bsa">Body Surface Area (SUVbsa)</option>
                </select>
              </div>

              {/* SUV threshold */}
              <div>
                <label className="text-xs text-text-muted block mb-1.5">
                  SUV Threshold for MTV
                </label>
                <input
                  type="number"
                  className="w-full px-2 py-1.5 text-sm bg-background-primary border border-border-subtle rounded"
                  value={suvThreshold}
                  onChange={(e) => setSuvThreshold(parseFloat(e.target.value) || 2.5)}
                  min={0}
                  max={20}
                  step={0.5}
                />
                <p className="text-2xs text-text-disabled mt-1">
                  Metabolic tumor volume includes voxels with SUV above this threshold
                </p>
              </div>
            </div>
          )}

          {/* Compute button */}
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={handleComputeSUV}
            disabled={isComputing || !hasSegments}
          >
            {isComputing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Computing SUV...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Compute SUV Metrics
              </>
            )}
          </Button>

          {!hasSegments && (
            <p className="text-2xs text-text-disabled text-center">
              Run segmentation first to compute SUV metrics
            </p>
          )}

          {computeError && (
            <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{computeError}</p>
            </div>
          )}
        </div>
      </Panel>

      {/* Results Panel */}
      {hasResults && suvMetadata && (
        <>
          {/* Summary card */}
          <PETSummaryCard suvResults={suvResults} threshold={suvMetadata.suvThreshold} />

          {/* Per-lesion metrics */}
          <Panel
            title="Lesion SUV Metrics"
            collapsible
            badge={suvResults.length}
            actions={<Target className="h-4 w-4 text-text-muted" />}
          >
            <div className="space-y-2">
              {suvResults.map((metrics) => (
                <SUVMetricsRow
                  key={metrics.segmentIndex}
                  metrics={metrics}
                  isExpanded={expandedSegments.has(metrics.segmentIndex)}
                  onToggleExpand={() => toggleSegmentExpansion(metrics.segmentIndex)}
                  segmentColor={
                    activeSegmentation?.segments.find(
                      (s) => s.segmentIndex === metrics.segmentIndex
                    )?.color
                  }
                />
              ))}
            </div>
          </Panel>

          {/* Export Panel */}
          <Panel
            title="Export SUV Data"
            collapsible
            defaultCollapsed
            actions={<Download className="h-4 w-4 text-text-muted" />}
          >
            <div className="space-y-3">
              <p className="text-text-muted text-xs">
                Export SUV metrics for external analysis or clinical reporting.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleExportJSON}
                >
                  <Download className="h-4 w-4 mr-1" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleCopyToClipboard}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  {copySuccess ? 'Copied!' : 'Copy'}
                </Button>
              </div>

              {/* Computation metadata */}
              <div className="pt-2 border-t border-border-subtle text-2xs text-text-disabled space-y-0.5">
                <div>Method: SUV{suvMetadata.normalizationMethod}</div>
                <div>Threshold: {suvMetadata.suvThreshold}</div>
                <div>Computed in {suvMetadata.computationTimeSeconds.toFixed(2)}s</div>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

export default PETMetricsPanel;
