/**
 * RECIST 1.1 Metrics Utilities
 *
 * Computation functions for RECIST 1.1 response assessment including:
 * - Sum of Longest Diameters (SLD) calculation with lymph node handling
 * - Target lesion response classification
 * - Non-target lesion response classification
 * - Overall response determination
 */

import {
  RECISTLesion,
  RECISTOverallResponse,
  NonTargetStatus,
  RECIST_CONSTRAINTS,
  TargetLesionResponse,
  NonTargetLesionResponse,
  RECISTValidationResult,
  RECISTValidationError,
  RECISTValidationWarning,
} from '../stores/recistTypes';

// =============================================================================
// SLD Computation
// =============================================================================

/**
 * Compute Sum of Longest Diameters (SLD) for target lesions.
 *
 * Per RECIST 1.1:
 * - For non-lymph node lesions: use longest diameter
 * - For lymph nodes: use short axis measurement
 * - Lesions marked "too small to measure" contribute 0mm (but are still tracked)
 *
 * @param lesions - Array of target lesions
 * @param useCurrentMeasurements - Whether to use current (true) or baseline (false) measurements
 * @returns SLD in mm
 */
export function computeSLD(
  lesions: RECISTLesion[],
  useCurrentMeasurements: boolean = false
): number {
  return lesions
    .filter((lesion) => lesion.type === 'target')
    .reduce((sum, lesion) => {
      // Handle "too small to measure" - contributes 0 but stays in calculation
      if (useCurrentMeasurements && lesion.tooSmallToMeasure) {
        return sum;
      }

      if (lesion.isLymphNode) {
        // Lymph nodes: use short axis
        const measurement = useCurrentMeasurements
          ? (lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm ?? 0)
          : (lesion.baselineShortAxisMm ?? 0);
        return sum + measurement;
      } else {
        // Non-lymph node: use longest diameter
        const measurement = useCurrentMeasurements
          ? (lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm)
          : lesion.baselineLongestDiameterMm;
        return sum + measurement;
      }
    }, 0);
}

/**
 * Compute baseline SLD from target lesions.
 */
export function computeBaselineSLD(lesions: RECISTLesion[]): number {
  return computeSLD(lesions, false);
}

/**
 * Compute current SLD from target lesions.
 */
export function computeCurrentSLD(lesions: RECISTLesion[]): number {
  return computeSLD(lesions, true);
}

/**
 * Get the measurement value to use for a lesion in SLD calculation.
 */
export function getLesionSLDContribution(lesion: RECISTLesion, useCurrent: boolean = true): number {
  if (lesion.type !== 'target') {
    return 0;
  }

  if (useCurrent && lesion.tooSmallToMeasure) {
    return 0;
  }

  if (lesion.isLymphNode) {
    return useCurrent
      ? (lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm ?? 0)
      : (lesion.baselineShortAxisMm ?? 0);
  }

  return useCurrent
    ? (lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm)
    : lesion.baselineLongestDiameterMm;
}

// =============================================================================
// Target Lesion Response Classification
// =============================================================================

/**
 * Classify target lesion response based on SLD change.
 *
 * RECIST 1.1 criteria:
 * - CR: All target lesions have disappeared (SLD = 0 for all, lymph nodes < 10mm short axis)
 * - PR: >= 30% decrease in SLD from baseline
 * - PD: >= 20% increase in SLD from nadir AND >= 5mm absolute increase
 * - SD: Neither sufficient shrinkage for PR nor sufficient increase for PD
 *
 * @param currentSLD - Current sum of longest diameters in mm
 * @param baselineSLD - Baseline sum of longest diameters in mm
 * @param nadirSLD - Nadir (minimum achieved) SLD in mm
 * @param lesions - Target lesions for CR lymph node check
 * @returns Target lesion response classification
 */
export function classifyTargetResponse(
  currentSLD: number,
  baselineSLD: number,
  nadirSLD: number,
  lesions: RECISTLesion[]
): 'CR' | 'PR' | 'SD' | 'PD' | 'NE' {
  // Check for NE conditions
  if (baselineSLD === 0 || lesions.length === 0) {
    return 'NE';
  }

  // Check for Complete Response
  // All target lesions must have disappeared
  // For lymph nodes: short axis must be < 10mm
  const isCR = lesions.every((lesion) => {
    if (lesion.isLymphNode) {
      const shortAxis = lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm ?? 0;
      return shortAxis < RECIST_CONSTRAINTS.LYMPH_NODE_NORMAL_THRESHOLD_MM;
    } else {
      // Non-lymph node must have disappeared (essentially 0 or too small to measure)
      const currentDiameter = lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm;
      return currentDiameter === 0 || lesion.tooSmallToMeasure;
    }
  });

  if (isCR) {
    return 'CR';
  }

  // Calculate percentage changes
  const changeFromBaseline = ((currentSLD - baselineSLD) / baselineSLD) * 100;
  const changeFromNadir = nadirSLD > 0 ? ((currentSLD - nadirSLD) / nadirSLD) * 100 : 0;
  const absoluteChangeFromNadir = currentSLD - nadirSLD;

  // Check for Progressive Disease
  // >= 20% increase from nadir AND >= 5mm absolute increase
  if (
    changeFromNadir >= RECIST_CONSTRAINTS.PD_THRESHOLD_PERCENT &&
    absoluteChangeFromNadir >= RECIST_CONSTRAINTS.PD_MINIMUM_ABSOLUTE_INCREASE_MM
  ) {
    return 'PD';
  }

  // Check for Partial Response
  // >= 30% decrease from baseline
  if (changeFromBaseline <= RECIST_CONSTRAINTS.PR_THRESHOLD_PERCENT) {
    return 'PR';
  }

  // Stable Disease - neither PR nor PD
  return 'SD';
}

/**
 * Compute full target lesion response analysis.
 */
export function computeTargetLesionResponse(
  targetLesions: RECISTLesion[],
  baselineSLD: number,
  nadirSLD: number,
  nadirTimepointId?: string
): TargetLesionResponse {
  const currentSLD = computeCurrentSLD(targetLesions);
  const changeFromBaselinePercent = baselineSLD > 0
    ? ((currentSLD - baselineSLD) / baselineSLD) * 100
    : 0;
  const changeFromNadirPercent = nadirSLD > 0
    ? ((currentSLD - nadirSLD) / nadirSLD) * 100
    : 0;
  const absoluteChangeFromNadirMm = currentSLD - nadirSLD;

  const response = classifyTargetResponse(currentSLD, baselineSLD, nadirSLD, targetLesions);

  return {
    lesions: targetLesions,
    baselineSLD,
    currentSLD,
    nadirSLD,
    nadirTimepointId,
    changeFromBaselinePercent,
    changeFromNadirPercent,
    absoluteChangeFromNadirMm,
    response,
  };
}

// =============================================================================
// Non-Target Lesion Response Classification
// =============================================================================

/**
 * Determine overall non-target status from individual statuses.
 *
 * @param lesions - Non-target lesions with status
 * @returns Overall non-target status
 */
export function computeNonTargetOverallStatus(lesions: RECISTLesion[]): NonTargetStatus {
  const nonTargetLesions = lesions.filter((l) => l.type === 'non_target');

  if (nonTargetLesions.length === 0) {
    return 'absent';
  }

  // If any lesion shows unequivocal progression, overall is progression
  if (nonTargetLesions.some((l) => l.nonTargetStatus === 'unequivocal_progression')) {
    return 'unequivocal_progression';
  }

  // If all are absent, overall is absent (CR)
  if (nonTargetLesions.every((l) => l.nonTargetStatus === 'absent')) {
    return 'absent';
  }

  // Otherwise, disease is present
  return 'present';
}

/**
 * Classify non-target lesion response.
 *
 * @param overallStatus - Overall non-target status
 * @returns Non-target response classification
 */
export function classifyNonTargetResponse(
  overallStatus: NonTargetStatus
): 'CR' | 'Non-CR/Non-PD' | 'PD' | 'NE' {
  switch (overallStatus) {
    case 'absent':
      return 'CR';
    case 'present':
      return 'Non-CR/Non-PD';
    case 'unequivocal_progression':
      return 'PD';
    default:
      return 'NE';
  }
}

/**
 * Compute full non-target lesion response analysis.
 */
export function computeNonTargetLesionResponse(
  nonTargetLesions: RECISTLesion[]
): NonTargetLesionResponse {
  const overallStatus = computeNonTargetOverallStatus(nonTargetLesions);
  const response = classifyNonTargetResponse(overallStatus);

  return {
    lesions: nonTargetLesions,
    overallStatus,
    response,
  };
}

// =============================================================================
// Overall Response Determination
// =============================================================================

/**
 * Compute overall RECIST 1.1 response from target, non-target, and new lesion status.
 *
 * Decision matrix per RECIST 1.1:
 *
 * | Target    | Non-Target        | New Lesions | Overall |
 * |-----------|-------------------|-------------|---------|
 * | CR        | CR                | No          | CR      |
 * | CR        | Non-CR/Non-PD     | No          | PR      |
 * | CR        | NE                | No          | PR      |
 * | PR        | Non-PD or NE      | No          | PR      |
 * | SD        | Non-PD or NE      | No          | SD      |
 * | PD        | Any               | Yes/No      | PD      |
 * | Any       | PD                | Yes/No      | PD      |
 * | Any       | Any               | Yes         | PD      |
 * | NE        | NE                | No          | NE      |
 *
 * @param targetResponse - Target lesion response
 * @param nonTargetResponse - Non-target lesion response
 * @param hasNewLesions - Whether new lesions are present
 * @returns Overall RECIST response
 */
export function computeOverallResponse(
  targetResponse: TargetLesionResponse['response'],
  nonTargetResponse: NonTargetLesionResponse['response'],
  hasNewLesions: boolean
): RECISTOverallResponse {
  // Any new lesions = PD
  if (hasNewLesions) {
    return 'PD';
  }

  // Target PD = Overall PD
  if (targetResponse === 'PD') {
    return 'PD';
  }

  // Non-target PD = Overall PD
  if (nonTargetResponse === 'PD') {
    return 'PD';
  }

  // CR requires both target CR and non-target CR (or no non-target)
  if (targetResponse === 'CR') {
    if (nonTargetResponse === 'CR' || nonTargetResponse === 'NE') {
      return nonTargetResponse === 'CR' ? 'CR' : 'PR';
    }
    // CR target + Non-CR/Non-PD non-target = PR
    return 'PR';
  }

  // PR target with no progression = PR
  if (targetResponse === 'PR') {
    return 'PR';
  }

  // SD target with no progression = SD
  if (targetResponse === 'SD') {
    return 'SD';
  }

  // NE
  return 'NE';
}

/**
 * Compute overall response from all components at once.
 */
export function computeFullRECISTResponse(
  targetLesions: RECISTLesion[],
  nonTargetLesions: RECISTLesion[],
  newLesions: RECISTLesion[],
  baselineSLD: number,
  nadirSLD: number
): {
  targetResponse: TargetLesionResponse;
  nonTargetResponse: NonTargetLesionResponse;
  hasNewLesions: boolean;
  overallResponse: RECISTOverallResponse;
} {
  const targetResponse = computeTargetLesionResponse(targetLesions, baselineSLD, nadirSLD);
  const nonTargetResponse = computeNonTargetLesionResponse(nonTargetLesions);
  const hasNewLesions = newLesions.length > 0;
  const overallResponse = computeOverallResponse(
    targetResponse.response,
    nonTargetResponse.response,
    hasNewLesions
  );

  return {
    targetResponse,
    nonTargetResponse,
    hasNewLesions,
    overallResponse,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate target lesion selection against RECIST 1.1 constraints.
 */
export function validateTargetLesionSelection(
  lesions: RECISTLesion[]
): RECISTValidationResult {
  const errors: RECISTValidationError[] = [];
  const warnings: RECISTValidationWarning[] = [];

  const targetLesions = lesions.filter((l) => l.type === 'target');

  // Check total count
  if (targetLesions.length > RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL) {
    errors.push({
      code: 'MAX_TARGET_EXCEEDED',
      message: `Maximum ${RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL} target lesions allowed. Currently: ${targetLesions.length}`,
    });
  }

  // Check per-organ count
  const byOrgan = new Map<string, RECISTLesion[]>();
  for (const lesion of targetLesions) {
    const existing = byOrgan.get(lesion.anatomicalRegion) ?? [];
    byOrgan.set(lesion.anatomicalRegion, [...existing, lesion]);
  }

  for (const [organ, organLesions] of byOrgan) {
    if (organLesions.length > RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN) {
      errors.push({
        code: 'MAX_PER_ORGAN_EXCEEDED',
        message: `Maximum ${RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN} target lesions per organ allowed. ${organ}: ${organLesions.length}`,
        field: organ,
      });
    }
  }

  // Check measurability
  for (const lesion of targetLesions) {
    if (lesion.isLymphNode) {
      const shortAxis = lesion.baselineShortAxisMm ?? 0;
      if (shortAxis < RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM) {
        errors.push({
          code: 'LYMPH_NODE_TOO_SMALL',
          message: `Lymph node target lesion requires short axis >= ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM}mm. Current: ${shortAxis}mm`,
          lesionId: lesion.id,
        });
      }
    } else {
      if (lesion.baselineLongestDiameterMm < RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM) {
        errors.push({
          code: 'LESION_TOO_SMALL',
          message: `Target lesion requires longest diameter >= ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM}mm. Current: ${lesion.baselineLongestDiameterMm}mm`,
          lesionId: lesion.id,
        });
      }
    }
  }

  // Warnings
  if (targetLesions.length === 0) {
    warnings.push({
      code: 'NO_TARGET_LESIONS',
      message: 'No target lesions selected. Consider adding target lesions for accurate response assessment.',
    });
  }

  if (targetLesions.length < 2) {
    warnings.push({
      code: 'FEW_TARGET_LESIONS',
      message: 'Consider selecting multiple target lesions representing all involved organs.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a lesion can be added as a target lesion.
 */
export function canAddTargetLesion(
  existingLesions: RECISTLesion[],
  newLesion: Partial<RECISTLesion>
): { canAdd: boolean; reason?: string } {
  const targetLesions = existingLesions.filter((l) => l.type === 'target');

  // Check total count
  if (targetLesions.length >= RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL) {
    return {
      canAdd: false,
      reason: `Maximum ${RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL} target lesions already selected`,
    };
  }

  // Check per-organ count
  if (newLesion.anatomicalRegion) {
    const organCount = targetLesions.filter(
      (l) => l.anatomicalRegion === newLesion.anatomicalRegion
    ).length;
    if (organCount >= RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN) {
      return {
        canAdd: false,
        reason: `Maximum ${RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN} target lesions for ${newLesion.anatomicalRegion} already selected`,
      };
    }
  }

  // Check measurability
  if (newLesion.isLymphNode) {
    const shortAxis = newLesion.baselineShortAxisMm ?? 0;
    if (shortAxis < RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM) {
      return {
        canAdd: false,
        reason: `Lymph node short axis (${shortAxis}mm) below minimum ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM}mm for target lesion`,
      };
    }
  } else {
    const diameter = newLesion.baselineLongestDiameterMm ?? 0;
    if (diameter < RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM) {
      return {
        canAdd: false,
        reason: `Lesion diameter (${diameter}mm) below minimum ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM}mm for target lesion`,
      };
    }
  }

  return { canAdd: true };
}

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format SLD value for display.
 */
export function formatSLD(sldMm: number): string {
  return `${sldMm.toFixed(1)} mm`;
}

/**
 * Format percentage change for display.
 */
export function formatPercentChange(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

/**
 * Format lesion measurement for display.
 */
export function formatLesionMeasurement(lesion: RECISTLesion, useCurrent: boolean = true): string {
  if (lesion.tooSmallToMeasure && useCurrent) {
    return 'Too small to measure';
  }

  if (lesion.isLymphNode) {
    const shortAxis = useCurrent
      ? (lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm)
      : lesion.baselineShortAxisMm;
    return `${shortAxis?.toFixed(1) ?? '--'} mm (short axis)`;
  }

  const diameter = useCurrent
    ? (lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm)
    : lesion.baselineLongestDiameterMm;
  return `${diameter.toFixed(1)} mm`;
}

/**
 * Calculate percent change between two values.
 */
export function calculatePercentChange(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

/**
 * Get the number of target lesions remaining for an organ.
 */
export function getRemainingTargetSlotsForOrgan(
  lesions: RECISTLesion[],
  anatomicalRegion: string
): number {
  const organCount = lesions.filter(
    (l) => l.type === 'target' && l.anatomicalRegion === anatomicalRegion
  ).length;
  return Math.max(0, RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN - organCount);
}

/**
 * Get the total number of remaining target lesion slots.
 */
export function getRemainingTotalTargetSlots(lesions: RECISTLesion[]): number {
  const targetCount = lesions.filter((l) => l.type === 'target').length;
  return Math.max(0, RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL - targetCount);
}
