/**
 * Longitudinal Metrics Helper
 *
 * Utilities for computing delta calculations and progression classification
 * between timepoints in longitudinal sessions.
 */

import { useAnalyticsStore, VolumetricsResult, SegmentVolumetrics } from '../stores/analyticsStore';
import { useLongitudinalStore } from '../stores/longitudinalStore';
import {
  LongitudinalSession,
  LongitudinalTimepoint,
  LongitudinalMetricsResult,
  LongitudinalDelta,
  LongitudinalSegmentDelta,
  TimepointMetrics,
  ProgressionClassification,
  RECIST_THRESHOLDS,
} from '../stores/longitudinalTypes';

/**
 * Compute volume change between two values.
 *
 * @param baseline - Baseline volume
 * @param current - Current volume
 * @returns Object with absolute and percent change
 */
export function computeVolumeChange(
  baseline: number,
  current: number
): { absolute: number; percent: number } {
  const absolute = current - baseline;
  const percent = baseline > 0 ? ((current - baseline) / baseline) * 100 : 0;

  return { absolute, percent };
}

/**
 * Classify progression based on RECIST 1.1 criteria.
 *
 * @param changePercent - Percentage change from baseline
 * @param hasNewLesion - Whether new lesions were detected
 * @param absoluteIncreaseMm - Absolute increase in mm (for minimum threshold check)
 * @returns Progression classification
 */
export function classifyProgressionRECIST(
  changePercent: number,
  hasNewLesion: boolean = false,
  absoluteIncreaseMm?: number
): ProgressionClassification {
  // New lesion = Progressive Disease
  if (hasNewLesion) {
    return 'progressive_disease';
  }

  // Complete Response: Complete disappearance
  if (changePercent <= -100) {
    return 'complete_response';
  }

  // Partial Response: >= 30% decrease
  if (changePercent <= RECIST_THRESHOLDS.PARTIAL_RESPONSE) {
    return 'partial_response';
  }

  // Progressive Disease: >= 20% increase AND >= 5mm absolute increase
  if (changePercent >= RECIST_THRESHOLDS.PROGRESSIVE_DISEASE) {
    // Check minimum absolute increase if diameter provided
    if (absoluteIncreaseMm === undefined || absoluteIncreaseMm >= RECIST_THRESHOLDS.MINIMUM_ABSOLUTE_INCREASE_MM) {
      return 'progressive_disease';
    }
  }

  // Stable Disease: Neither sufficient shrinkage nor increase
  return 'stable_disease';
}

/**
 * Simplified progression classification based on volume change.
 *
 * @param changePercent - Percentage change from baseline
 * @returns Simple progression classification
 */
export function classifyProgression(
  changePercent: number
): 'progressive' | 'stable' | 'regressive' {
  if (changePercent <= -30) {
    return 'regressive';
  }
  if (changePercent >= 20) {
    return 'progressive';
  }
  return 'stable';
}

/**
 * Extract metrics from volumetrics result for a specific segment.
 *
 * @param volumetrics - Volumetrics result
 * @param segmentLabel - Optional segment label filter
 * @returns Extracted metrics by segment
 */
export function extractSegmentMetrics(
  volumetrics: VolumetricsResult | null,
  segmentLabel?: string
): {
  volumesBySegment: Record<string, number>;
  diametersBySegment: Record<string, number>;
  countsBySegment: Record<string, number>;
} {
  const volumesBySegment: Record<string, number> = {};
  const diametersBySegment: Record<string, number> = {};
  const countsBySegment: Record<string, number> = {};

  if (!volumetrics?.volumetrics?.segments) {
    return { volumesBySegment, diametersBySegment, countsBySegment };
  }

  for (const segment of volumetrics.volumetrics.segments) {
    // Skip if filtering by label and doesn't match
    if (segmentLabel && segment.label !== segmentLabel) {
      continue;
    }

    const label = segment.label || `Segment ${segment.segment_index}`;
    volumesBySegment[label] = segment.total_volume_cm3;
    diametersBySegment[label] = segment.max_diameter_mm ?? segment.longest_axis_mm ?? 0;
    countsBySegment[label] = segment.instance_count;
  }

  return { volumesBySegment, diametersBySegment, countsBySegment };
}

/**
 * Compute delta between two timepoints' metrics.
 *
 * @param baseline - Baseline timepoint metrics
 * @param current - Current timepoint metrics
 * @returns Delta calculations
 */
export function computeTimepointDelta(
  baseline: TimepointMetrics,
  current: TimepointMetrics
): LongitudinalDelta {
  const segments: LongitudinalSegmentDelta[] = [];

  // Get all unique segment labels
  const allLabels = new Set([
    ...Object.keys(baseline.volumesBySegment),
    ...Object.keys(current.volumesBySegment),
  ]);

  let totalBaselineVolume = 0;
  let totalCurrentVolume = 0;
  let newLesionCount = 0;
  let resolvedLesionCount = 0;

  for (const label of allLabels) {
    const baselineVolume = baseline.volumesBySegment[label] ?? 0;
    const currentVolume = current.volumesBySegment[label] ?? 0;
    const baselineDiameter = baseline.diametersBySegment[label];
    const currentDiameter = current.diametersBySegment[label];

    // Track new/resolved lesions
    if (baselineVolume === 0 && currentVolume > 0) {
      newLesionCount++;
    } else if (baselineVolume > 0 && currentVolume === 0) {
      resolvedLesionCount++;
    }

    const volumeChange = computeVolumeChange(baselineVolume, currentVolume);

    // Compute diameter change if available
    let diameterChangePercent: number | undefined;
    if (baselineDiameter !== undefined && currentDiameter !== undefined && baselineDiameter > 0) {
      diameterChangePercent = ((currentDiameter - baselineDiameter) / baselineDiameter) * 100;
    }

    // Classify progression for this segment
    const classification = classifyProgressionRECIST(
      volumeChange.percent,
      baselineVolume === 0 && currentVolume > 0, // New lesion for this segment
      currentDiameter !== undefined && baselineDiameter !== undefined
        ? currentDiameter - baselineDiameter
        : undefined
    );

    segments.push({
      segmentLabel: label,
      baselineVolumeCm3: baselineVolume,
      currentVolumeCm3: currentVolume,
      absoluteChangeCm3: volumeChange.absolute,
      percentChange: volumeChange.percent,
      classification,
      baselineDiameterMm: baselineDiameter,
      currentDiameterMm: currentDiameter,
      diameterChangePercent,
    });

    totalBaselineVolume += baselineVolume;
    totalCurrentVolume += currentVolume;
  }

  // Overall summary
  const totalVolumeChange = computeVolumeChange(totalBaselineVolume, totalCurrentVolume);
  const overallClassification = classifyProgressionRECIST(
    totalVolumeChange.percent,
    newLesionCount > 0
  );

  return {
    baselineTimepointId: baseline.timepointId,
    currentTimepointId: current.timepointId,
    segments,
    summary: {
      totalVolumeChangePercent: totalVolumeChange.percent,
      classification: overallClassification,
      newLesionCount,
      resolvedLesionCount,
    },
  };
}

/**
 * Get longitudinal metrics for a session.
 *
 * Computes metrics for all timepoints and delta calculations between
 * baseline and each follow-up.
 *
 * @param sessionId - Longitudinal session ID
 * @param segmentKey - Optional segment label to filter by
 * @returns Longitudinal metrics result, or null if session not found
 */
export function getLongitudinalMetrics(
  sessionId: string,
  segmentKey?: string
): LongitudinalMetricsResult | null {
  const session = useLongitudinalStore.getState().sessions[sessionId];

  if (!session) {
    console.warn('[LongitudinalMetrics] Session not found:', sessionId);
    return null;
  }

  if (session.timepoints.length < 2) {
    return {
      sessionId,
      timepointMetrics: [],
      deltas: [],
      isComplete: false,
      error: 'At least 2 timepoints required for longitudinal analysis',
    };
  }

  const analyticsState = useAnalyticsStore.getState();
  const timepointMetrics: TimepointMetrics[] = [];
  let allMetricsAvailable = true;

  // Extract metrics for each timepoint
  for (const timepoint of session.timepoints) {
    const imageMetrics = analyticsState.metricsByImageId.get(timepoint.imageId);

    if (!imageMetrics?.volumetrics) {
      allMetricsAvailable = false;
    }

    const { volumesBySegment, diametersBySegment, countsBySegment } = extractSegmentMetrics(
      imageMetrics?.volumetrics ?? null,
      segmentKey
    );

    timepointMetrics.push({
      timepointId: timepoint.id,
      volumesBySegment,
      diametersBySegment,
      countsBySegment,
      computedAt: imageMetrics?.computedAt ?? 0,
    });
  }

  // Compute deltas (baseline vs each follow-up)
  const deltas: LongitudinalDelta[] = [];
  const baselineMetrics = timepointMetrics[0];

  for (let i = 1; i < timepointMetrics.length; i++) {
    const currentMetrics = timepointMetrics[i];
    const delta = computeTimepointDelta(baselineMetrics, currentMetrics);
    deltas.push(delta);
  }

  return {
    sessionId,
    timepointMetrics,
    deltas,
    isComplete: allMetricsAvailable,
    error: allMetricsAvailable ? undefined : 'Some timepoints missing volumetric data',
  };
}

/**
 * Format volume change for display.
 *
 * @param absoluteCm3 - Absolute change in cm³
 * @param percentChange - Percentage change
 * @returns Formatted string
 */
export function formatVolumeChange(absoluteCm3: number, percentChange: number): string {
  const sign = absoluteCm3 >= 0 ? '+' : '';
  return `${sign}${absoluteCm3.toFixed(2)} cm³ (${sign}${percentChange.toFixed(1)}%)`;
}

/**
 * Format diameter change for display.
 *
 * @param baselineMm - Baseline diameter in mm
 * @param currentMm - Current diameter in mm
 * @returns Formatted string
 */
export function formatDiameterChange(baselineMm: number, currentMm: number): string {
  const change = currentMm - baselineMm;
  const percent = baselineMm > 0 ? (change / baselineMm) * 100 : 0;
  const sign = change >= 0 ? '+' : '';
  return `${baselineMm.toFixed(1)}mm → ${currentMm.toFixed(1)}mm (${sign}${percent.toFixed(1)}%)`;
}

/**
 * Get the worst progression classification from a list of deltas.
 *
 * @param deltas - Array of segment deltas
 * @returns Worst (most progressive) classification
 */
export function getWorstProgression(deltas: LongitudinalSegmentDelta[]): ProgressionClassification {
  const priority: ProgressionClassification[] = [
    'progressive_disease',
    'stable_disease',
    'partial_response',
    'complete_response',
    'not_evaluable',
  ];

  let worst: ProgressionClassification = 'not_evaluable';

  for (const delta of deltas) {
    const currentIndex = priority.indexOf(delta.classification);
    const worstIndex = priority.indexOf(worst);

    if (currentIndex < worstIndex) {
      worst = delta.classification;
    }
  }

  return worst;
}

/**
 * Check if metrics are available for all timepoints in a session.
 *
 * @param sessionId - Longitudinal session ID
 * @returns True if all timepoints have metrics
 */
export function hasCompleteMetrics(sessionId: string): boolean {
  const session = useLongitudinalStore.getState().sessions[sessionId];
  if (!session) return false;

  const analyticsState = useAnalyticsStore.getState();

  for (const timepoint of session.timepoints) {
    const metrics = analyticsState.metricsByImageId.get(timepoint.imageId);
    if (!metrics?.volumetrics) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Correspondence-Aware Metrics
// ============================================================================

import { useLesionCorrespondenceStore } from '../stores/lesionCorrespondenceStore';
import {
  LesionCorrespondence,
  LesionInstance,
} from '../stores/lesionCorrespondenceTypes';

/**
 * Delta for a single matched lesion correspondence.
 */
export interface CorrespondenceDelta {
  /** Correspondence ID */
  correspondenceId: string;
  /** Canonical label */
  label: string;
  /** Baseline instance (if exists) */
  baselineInstance?: LesionInstance;
  /** Current instance (if exists) */
  currentInstance?: LesionInstance;
  /** Volume change in mm³ */
  volumeChangeMm3: number;
  /** Percentage change */
  percentChange: number;
  /** Progression classification */
  classification: ProgressionClassification;
  /** Match confidence */
  matchConfidence: number;
  /** Whether this is a new lesion */
  isNew: boolean;
  /** Whether this lesion resolved */
  isResolved: boolean;
}

/**
 * Longitudinal metrics using correspondence-based matching.
 */
export interface CorrespondenceBasedMetrics {
  /** Session ID */
  sessionId: string;
  /** Baseline timepoint ID */
  baselineTimepointId: string;
  /** Current/follow-up timepoint ID */
  currentTimepointId: string;
  /** Per-correspondence deltas */
  correspondenceDeltas: CorrespondenceDelta[];
  /** Summary statistics */
  summary: {
    /** Total matched lesion count */
    matchedCount: number;
    /** New lesion count (in current but not baseline) */
    newLesionCount: number;
    /** Resolved lesion count (in baseline but not current) */
    resolvedLesionCount: number;
    /** Total volume change percentage */
    totalVolumeChangePercent: number;
    /** Overall progression classification */
    classification: ProgressionClassification;
    /** Average match confidence */
    averageMatchConfidence: number;
  };
  /** Whether all correspondences are confirmed */
  allConfirmed: boolean;
  /** Count of pending correspondences */
  pendingCount: number;
}

/**
 * Get longitudinal metrics using lesion correspondences for more accurate tracking.
 *
 * This function uses established lesion correspondences to compute deltas,
 * providing more accurate tracking than segment-label matching alone.
 *
 * @param sessionId - Longitudinal session ID
 * @param baselineTimepointId - Baseline timepoint ID
 * @param currentTimepointId - Current/follow-up timepoint ID
 * @returns Correspondence-based metrics, or null if not available
 */
export function getCorrespondenceBasedMetrics(
  sessionId: string,
  baselineTimepointId: string,
  currentTimepointId: string
): CorrespondenceBasedMetrics | null {
  const correspondenceStore = useLesionCorrespondenceStore.getState();
  const correspondences = correspondenceStore.getCorrespondences(sessionId);

  if (correspondences.length === 0) {
    return null;
  }

  const deltas: CorrespondenceDelta[] = [];
  let totalBaselineVolume = 0;
  let totalCurrentVolume = 0;
  let matchedCount = 0;
  let newLesionCount = 0;
  let resolvedLesionCount = 0;
  let confirmedCount = 0;
  let pendingCount = 0;
  let totalConfidence = 0;

  for (const correspondence of correspondences) {
    const baselineInstance = correspondence.instances.get(baselineTimepointId);
    const currentInstance = correspondence.instances.get(currentTimepointId);

    // Skip correspondences that don't involve these timepoints
    if (!baselineInstance && !currentInstance) {
      continue;
    }

    const isNew = !baselineInstance && !!currentInstance;
    const isResolved = !!baselineInstance && !currentInstance;

    const baselineVolume = baselineInstance?.volumeMm3 ?? 0;
    const currentVolume = currentInstance?.volumeMm3 ?? 0;

    const volumeChange = computeVolumeChange(baselineVolume / 1000, currentVolume / 1000); // Convert to cm³

    const classification = classifyProgressionRECIST(
      volumeChange.percent,
      isNew
    );

    deltas.push({
      correspondenceId: correspondence.id,
      label: correspondence.canonicalLabel,
      baselineInstance,
      currentInstance,
      volumeChangeMm3: currentVolume - baselineVolume,
      percentChange: volumeChange.percent,
      classification,
      matchConfidence: correspondence.matchConfidence,
      isNew,
      isResolved,
    });

    // Update totals
    if (baselineInstance) {
      totalBaselineVolume += baselineVolume;
    }
    if (currentInstance) {
      totalCurrentVolume += currentVolume;
    }

    if (isNew) {
      newLesionCount++;
    } else if (isResolved) {
      resolvedLesionCount++;
    } else {
      matchedCount++;
    }

    if (correspondence.status === 'confirmed') {
      confirmedCount++;
    } else if (correspondence.status === 'pending') {
      pendingCount++;
    }

    totalConfidence += correspondence.matchConfidence;
  }

  // Overall classification
  const totalVolumeChange = computeVolumeChange(
    totalBaselineVolume / 1000,
    totalCurrentVolume / 1000
  );

  const overallClassification = classifyProgressionRECIST(
    totalVolumeChange.percent,
    newLesionCount > 0
  );

  const totalCorrespondences = deltas.length;

  return {
    sessionId,
    baselineTimepointId,
    currentTimepointId,
    correspondenceDeltas: deltas,
    summary: {
      matchedCount,
      newLesionCount,
      resolvedLesionCount,
      totalVolumeChangePercent: totalVolumeChange.percent,
      classification: overallClassification,
      averageMatchConfidence: totalCorrespondences > 0 ? totalConfidence / totalCorrespondences : 0,
    },
    allConfirmed: pendingCount === 0 && totalCorrespondences > 0,
    pendingCount,
  };
}

/**
 * Get combined metrics using both segment-based and correspondence-based approaches.
 *
 * Falls back to segment-based metrics if no correspondences are available.
 *
 * @param sessionId - Longitudinal session ID
 * @returns Combined metrics result
 */
export function getCombinedLongitudinalMetrics(
  sessionId: string
): {
  segmentBased: LongitudinalMetricsResult | null;
  correspondenceBased: CorrespondenceBasedMetrics | null;
  useCorrespondences: boolean;
} {
  const session = useLongitudinalStore.getState().sessions[sessionId];

  if (!session || session.timepoints.length < 2) {
    return {
      segmentBased: null,
      correspondenceBased: null,
      useCorrespondences: false,
    };
  }

  const segmentBased = getLongitudinalMetrics(sessionId);

  const baselineId = session.timepoints[0].id;
  const latestId = session.timepoints[session.timepoints.length - 1].id;

  const correspondenceBased = getCorrespondenceBasedMetrics(
    sessionId,
    baselineId,
    latestId
  );

  // Use correspondence-based if available and has confirmed matches
  const useCorrespondences = correspondenceBased !== null &&
    (correspondenceBased.summary.matchedCount > 0 || correspondenceBased.summary.newLesionCount > 0);

  return {
    segmentBased,
    correspondenceBased,
    useCorrespondences,
  };
}
