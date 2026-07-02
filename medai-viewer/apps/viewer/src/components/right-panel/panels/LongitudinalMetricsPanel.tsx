/**
 * LongitudinalMetricsPanel - Display delta calculations and progression across timepoints
 *
 * Features:
 * - Volume change percentages between baseline and follow-up
 * - RECIST-style response classification
 * - Visual indicators (arrows, color-coded change)
 * - Per-segment breakdown
 */

import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Target,
  ChevronRight,
} from 'lucide-react';
import {
  useActiveSession,
  useLongitudinalStore,
  getLongitudinalMetrics,
  getCombinedLongitudinalMetrics,
  formatVolumeChange,
  formatDiameterChange,
  useLesionCorrespondenceStore,
  type LongitudinalMetricsResult,
  type LongitudinalDelta,
  type LongitudinalSegmentDelta,
  type ProgressionClassification,
  type CorrespondenceBasedMetrics,
  type CorrespondenceDelta,
} from '@medai/core';

/**
 * Get color and icon for progression classification
 */
function getProgressionDisplay(classification: ProgressionClassification): {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  label: string;
} {
  switch (classification) {
    case 'complete_response':
      return {
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        icon: <CheckCircle className="w-4 h-4" />,
        label: 'Complete Response',
      };
    case 'partial_response':
      return {
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        icon: <TrendingDown className="w-4 h-4" />,
        label: 'Partial Response',
      };
    case 'stable_disease':
      return {
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        icon: <Minus className="w-4 h-4" />,
        label: 'Stable Disease',
      };
    case 'progressive_disease':
      return {
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        icon: <TrendingUp className="w-4 h-4" />,
        label: 'Progressive Disease',
      };
    default:
      return {
        color: 'text-text-muted',
        bgColor: 'bg-background-tertiary',
        borderColor: 'border-border-subtle',
        icon: <AlertTriangle className="w-4 h-4" />,
        label: 'Not Evaluable',
      };
  }
}

/**
 * Format percentage change with sign and color
 */
function PercentageChange({ value }: { value: number }) {
  const sign = value >= 0 ? '+' : '';
  const colorClass = value > 20 ? 'text-red-400' : value < -30 ? 'text-green-400' : 'text-yellow-400';
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  return (
    <span className={`inline-flex items-center gap-1 font-mono ${colorClass}`}>
      <Icon className="w-3 h-3" />
      {sign}{value.toFixed(1)}%
    </span>
  );
}

/**
 * Segment delta row component
 */
function SegmentDeltaRow({ delta }: { delta: LongitudinalSegmentDelta }) {
  const progression = getProgressionDisplay(delta.classification);

  return (
    <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-primary">{delta.segmentLabel}</span>
        <span className={`px-2 py-0.5 text-2xs font-semibold rounded ${progression.bgColor} ${progression.color} ${progression.borderColor} border`}>
          {progression.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {/* Baseline Volume */}
        <div>
          <span className="text-text-muted block mb-0.5">Baseline</span>
          <span className="text-text-secondary font-mono">
            {delta.baselineVolumeCm3.toFixed(2)} cm³
          </span>
        </div>

        {/* Current Volume */}
        <div>
          <span className="text-text-muted block mb-0.5">Current</span>
          <span className="text-text-secondary font-mono">
            {delta.currentVolumeCm3.toFixed(2)} cm³
          </span>
        </div>

        {/* Change */}
        <div>
          <span className="text-text-muted block mb-0.5">Change</span>
          <PercentageChange value={delta.percentChange} />
        </div>
      </div>

      {/* Diameter change if available */}
      {delta.baselineDiameterMm !== undefined && delta.currentDiameterMm !== undefined && (
        <div className="mt-2 pt-2 border-t border-border-subtle text-xs">
          <span className="text-text-muted">Diameter: </span>
          <span className="text-text-secondary font-mono">
            {formatDiameterChange(delta.baselineDiameterMm, delta.currentDiameterMm)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Match confidence indicator
 */
function MatchConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  let colorClass = 'text-gray-400 bg-gray-500/10';

  if (confidence >= 0.85) {
    colorClass = 'text-green-400 bg-green-500/10';
  } else if (confidence >= 0.5) {
    colorClass = 'text-yellow-400 bg-yellow-500/10';
  } else {
    colorClass = 'text-red-400 bg-red-500/10';
  }

  return (
    <span className={`px-1.5 py-0.5 text-2xs font-mono rounded ${colorClass}`}>
      {percent}% match
    </span>
  );
}

/**
 * Correspondence-based delta row
 */
function CorrespondenceDeltaRow({ delta }: { delta: CorrespondenceDelta }) {
  const progression = getProgressionDisplay(delta.classification);

  return (
    <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{delta.label}</span>
          {delta.isNew && (
            <span className="px-1.5 py-0.5 text-2xs bg-red-500/20 text-red-400 rounded">NEW</span>
          )}
          {delta.isResolved && (
            <span className="px-1.5 py-0.5 text-2xs bg-green-500/20 text-green-400 rounded">RESOLVED</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <MatchConfidenceBadge confidence={delta.matchConfidence} />
          <span className={`px-2 py-0.5 text-2xs font-semibold rounded ${progression.bgColor} ${progression.color} border ${progression.borderColor}`}>
            {progression.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-text-muted block mb-0.5">Baseline</span>
          <span className="text-text-secondary font-mono">
            {delta.baselineInstance ? `${(delta.baselineInstance.volumeMm3 / 1000).toFixed(2)} cm³` : '-'}
          </span>
        </div>
        <div>
          <span className="text-text-muted block mb-0.5">Current</span>
          <span className="text-text-secondary font-mono">
            {delta.currentInstance ? `${(delta.currentInstance.volumeMm3 / 1000).toFixed(2)} cm³` : '-'}
          </span>
        </div>
        <div>
          <span className="text-text-muted block mb-0.5">Change</span>
          {!delta.isNew && !delta.isResolved && <PercentageChange value={delta.percentChange} />}
          {delta.isNew && <span className="text-red-400 font-mono">+NEW</span>}
          {delta.isResolved && <span className="text-green-400 font-mono">-100%</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Delta summary card
 */
function DeltaSummaryCard({
  delta,
  timepointLabel,
  correspondenceMetrics,
}: {
  delta: LongitudinalDelta;
  timepointLabel: string;
  correspondenceMetrics?: CorrespondenceBasedMetrics | null;
}) {
  // Use correspondence metrics if available, otherwise fall back to segment-based
  const useCorrespondences = correspondenceMetrics &&
    (correspondenceMetrics.summary.matchedCount > 0 || correspondenceMetrics.summary.newLesionCount > 0);

  const classification = useCorrespondences
    ? correspondenceMetrics!.summary.classification
    : delta.summary.classification;

  const totalVolumeChangePercent = useCorrespondences
    ? correspondenceMetrics!.summary.totalVolumeChangePercent
    : delta.summary.totalVolumeChangePercent;

  const newLesionCount = useCorrespondences
    ? correspondenceMetrics!.summary.newLesionCount
    : delta.summary.newLesionCount ?? 0;

  const resolvedLesionCount = useCorrespondences
    ? correspondenceMetrics!.summary.resolvedLesionCount
    : delta.summary.resolvedLesionCount ?? 0;

  const progression = getProgressionDisplay(classification);

  return (
    <div className={`p-4 rounded-xl border ${progression.borderColor} ${progression.bgColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={progression.color}>{progression.icon}</span>
          <span className="text-sm font-semibold text-text-primary">{timepointLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {useCorrespondences && (
            <span className="text-2xs text-accent-primary">
              {correspondenceMetrics!.allConfirmed ? 'Confirmed' : `${correspondenceMetrics!.pendingCount} pending`}
            </span>
          )}
          <span className={`text-xs font-semibold ${progression.color}`}>
            {progression.label}
          </span>
        </div>
      </div>

      {/* Overall change */}
      <div className="flex items-center justify-between py-2 border-y border-border-subtle/50">
        <span className="text-sm text-text-muted">Total Volume Change</span>
        <PercentageChange value={totalVolumeChangePercent} />
      </div>

      {/* Match confidence (if using correspondences) */}
      {useCorrespondences && correspondenceMetrics && (
        <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
          <span className="text-text-muted">Avg. Match Confidence</span>
          <MatchConfidenceBadge confidence={correspondenceMetrics.summary.averageMatchConfidence} />
        </div>
      )}

      {/* New/Resolved lesions */}
      {(newLesionCount > 0 || resolvedLesionCount > 0) && (
        <div className="flex gap-4 mt-2 text-xs">
          {newLesionCount > 0 && (
            <span className="text-red-400">
              +{newLesionCount} new lesion{newLesionCount > 1 ? 's' : ''}
            </span>
          )}
          {resolvedLesionCount > 0 && (
            <span className="text-green-400">
              -{resolvedLesionCount} resolved
            </span>
          )}
        </div>
      )}

      {/* Per-lesion breakdown (correspondence-based) */}
      {useCorrespondences && correspondenceMetrics && correspondenceMetrics.correspondenceDeltas.length > 0 && (
        <div className="mt-3 space-y-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            By Lesion (Matched)
          </span>
          {correspondenceMetrics.correspondenceDeltas.map((corDelta) => (
            <CorrespondenceDeltaRow key={corDelta.correspondenceId} delta={corDelta} />
          ))}
        </div>
      )}

      {/* Per-segment breakdown (fallback) */}
      {!useCorrespondences && delta.segments.length > 0 && (
        <div className="mt-3 space-y-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            By Segment
          </span>
          {delta.segments.map((seg) => (
            <SegmentDeltaRow key={seg.segmentLabel} delta={seg} />
          ))}
        </div>
      )}
    </div>
  );
}

interface LongitudinalMetricsPanelProps {
  className?: string;
}

export function LongitudinalMetricsPanel({ className = '' }: LongitudinalMetricsPanelProps) {
  const session = useActiveSession();

  // Compute combined metrics (segment-based and correspondence-based)
  const combinedMetrics = useMemo(() => {
    if (!session) return null;
    return getCombinedLongitudinalMetrics(session.id);
  }, [session]);

  const metrics = combinedMetrics?.segmentBased ?? null;
  const correspondenceMetrics = combinedMetrics?.correspondenceBased ?? null;

  // Get timepoint labels by ID
  const timepointLabels = useMemo(() => {
    if (!session) return {};
    const labels: Record<string, string> = {};
    session.timepoints.forEach((tp) => {
      labels[tp.id] = tp.label;
    });
    return labels;
  }, [session]);

  if (!session) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <Activity className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">No longitudinal session active</p>
        <p className="text-xs text-text-disabled mt-1">
          Start a longitudinal session to see metrics
        </p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <Clock className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">Computing metrics...</p>
      </div>
    );
  }

  if (metrics.error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Incomplete Data</p>
              <p className="text-xs text-text-muted mt-1">{metrics.error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (metrics.deltas.length === 0) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <Target className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">Add more timepoints</p>
        <p className="text-xs text-text-disabled mt-1">
          At least 2 timepoints with volumetric data required
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">Response Assessment</span>
        </div>
        {!metrics.isComplete && (
          <span className="text-2xs text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Partial data
          </span>
        )}
      </div>

      {/* Session info */}
      <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Patient</span>
          <span className="text-text-primary font-medium">
            {session.patientName || session.patientId}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-text-muted">Timepoints</span>
          <span className="text-text-secondary">{session.timepoints.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-text-muted">Anatomy</span>
          <span className="text-text-secondary">{session.anatomy || 'N/A'}</span>
        </div>
      </div>

      {/* Correspondence indicator */}
      {combinedMetrics?.useCorrespondences && (
        <div className="p-2 bg-accent-primary/10 border border-accent-primary/30 rounded-lg text-xs text-accent-primary flex items-center gap-2">
          <CheckCircle className="w-3 h-3" />
          <span>Using lesion correspondence matching for accurate tracking</span>
        </div>
      )}

      {/* Delta cards for each follow-up */}
      {metrics.deltas.map((delta, index) => (
        <DeltaSummaryCard
          key={delta.currentTimepointId}
          delta={delta}
          timepointLabel={timepointLabels[delta.currentTimepointId] || `Follow-up ${index + 1}`}
          correspondenceMetrics={correspondenceMetrics}
        />
      ))}
    </div>
  );
}
