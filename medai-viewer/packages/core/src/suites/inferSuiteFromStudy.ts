/**
 * MedAI Suites - Auto-Detection Logic
 *
 * Analyzes study and image metadata to automatically detect
 * the most appropriate clinical suite for the workflow.
 */

import type {
  SuiteId,
  SuiteConfig,
  SuiteDetectionResult,
  StudyMetadata,
  SuiteDetectionHints,
} from './types';
import { SUITES_REGISTRY, getEnabledSuites } from './registry';

/**
 * PACS Study information from the server for suite detection
 */
export interface SuitePacsStudyInfo {
  studyInstanceUID: string;
  studyDescription?: string;
  modality?: string;
  series?: Array<{
    seriesInstanceUID: string;
    seriesDescription?: string;
    modality?: string;
  }>;
}

/**
 * Image metadata for single-image suite detection
 * Note: This is different from the ImageMetadata in loaders/types.ts
 * which contains dimension/spacing info for loaded images.
 */
export interface SuiteImageMetadata {
  modality?: string;
  bodyPartExamined?: string;
  seriesDescription?: string;
  studyDescription?: string;
  protocolName?: string;
}

// === Scoring Constants ===

/** Points awarded for modality match */
const MODALITY_SCORE = 3;

/** Points awarded for body part match */
const BODY_PART_SCORE = 2;

/** Points awarded for description keyword match (highest weight - most specific) */
const DESCRIPTION_KEYWORD_SCORE = 4;

/** Points awarded for protocol keyword match */
const PROTOCOL_KEYWORD_SCORE = 2;

/** Maximum possible score for normalization */
const MAX_SCORE = MODALITY_SCORE + BODY_PART_SCORE + DESCRIPTION_KEYWORD_SCORE + PROTOCOL_KEYWORD_SCORE;

/** Minimum confidence threshold to return a detected suite */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

// === RT Modalities (Special Case) ===

/** Modalities that definitively indicate radiation therapy */
const RT_MODALITIES = ['RTPLAN', 'RTDOSE', 'RTSTRUCT', 'RTIMAGE', 'RTRECORD'];

/** PET modality for oncology boost */
const PET_MODALITY = 'PT';

// === Helper Functions ===

/**
 * Normalizes a string for case-insensitive comparison
 * @param str - String to normalize
 * @returns Lowercase trimmed string, or empty string if null/undefined
 */
function normalize(str: string | undefined | null): string {
  return (str ?? '').toLowerCase().trim();
}

/**
 * Checks if a value matches any item in an array (case-insensitive)
 * @param value - Value to check
 * @param list - Array of items to match against
 * @returns True if any item matches
 */
function matchesAny(value: string | undefined | null, list: string[]): boolean {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return false;
  return list.some((item) => normalize(item) === normalizedValue);
}

/**
 * Checks if any keyword is found in the text (case-insensitive)
 * @param text - Text to search in
 * @param keywords - Keywords to search for
 * @returns True if any keyword is found
 */
function containsAnyKeyword(text: string | undefined | null, keywords: string[]): boolean {
  const normalizedText = normalize(text);
  if (!normalizedText) return false;
  return keywords.some((keyword) => normalizedText.includes(normalize(keyword)));
}

/**
 * Extracts all modalities from study metadata and PACS info
 * @param metadata - Study metadata
 * @param pacsStudy - PACS study information
 * @returns Array of unique modalities (uppercase)
 */
function extractModalities(
  metadata: StudyMetadata | null,
  pacsStudy: SuitePacsStudyInfo | null
): string[] {
  const modalities = new Set<string>();

  // Add modality from metadata
  if (metadata?.modality) {
    modalities.add(metadata.modality.toUpperCase());
  }

  // Add modality from PACS study
  if (pacsStudy?.modality) {
    modalities.add(pacsStudy.modality.toUpperCase());
  }

  // Add modalities from series
  if (pacsStudy?.series) {
    for (const series of pacsStudy.series) {
      if (series.modality) {
        modalities.add(series.modality.toUpperCase());
      }
    }
  }

  return Array.from(modalities);
}

/**
 * Combines all description text from metadata and PACS info
 * @param metadata - Study metadata
 * @param pacsStudy - PACS study information
 * @returns Combined description text
 */
function combineDescriptions(
  metadata: StudyMetadata | null,
  pacsStudy: SuitePacsStudyInfo | null
): string {
  const descriptions: string[] = [];

  if (metadata?.studyDescription) {
    descriptions.push(metadata.studyDescription);
  }
  if (metadata?.seriesDescription) {
    descriptions.push(metadata.seriesDescription);
  }
  if (pacsStudy?.studyDescription) {
    descriptions.push(pacsStudy.studyDescription);
  }
  if (pacsStudy?.series) {
    for (const series of pacsStudy.series) {
      if (series.seriesDescription) {
        descriptions.push(series.seriesDescription);
      }
    }
  }

  return descriptions.join(' ');
}

/**
 * Calculates the detection score for a suite based on metadata
 * @param suite - Suite configuration to score
 * @param metadata - Study metadata
 * @param pacsStudy - PACS study information
 * @returns Object containing score, confidence, and matched criteria
 */
function calculateSuiteScore(
  suite: SuiteConfig,
  metadata: StudyMetadata | null,
  pacsStudy: SuitePacsStudyInfo | null
): { score: number; confidence: number; matchedCriteria: string[] } {
  const hints = suite.detectionHints;
  let score = 0;
  const matchedCriteria: string[] = [];

  // Extract all data for matching
  const modalities = extractModalities(metadata, pacsStudy);
  const combinedDescriptions = combineDescriptions(metadata, pacsStudy);
  const bodyPart = metadata?.bodyPartExamined;
  const protocolName = metadata?.protocolName;

  // === Modality Match (+3 points) ===
  const modalityMatch = modalities.some((mod) => matchesAny(mod, hints.modalities));
  if (modalityMatch) {
    score += MODALITY_SCORE;
    const matchedMod = modalities.find((mod) => matchesAny(mod, hints.modalities));
    matchedCriteria.push(`modality:${matchedMod}`);
  }

  // === Body Part Match (+2 points) ===
  if (matchesAny(bodyPart, hints.bodyParts)) {
    score += BODY_PART_SCORE;
    matchedCriteria.push(`bodyPart:${bodyPart}`);
  }

  // === Description Keyword Match (+4 points) ===
  if (containsAnyKeyword(combinedDescriptions, hints.descriptionKeywords)) {
    score += DESCRIPTION_KEYWORD_SCORE;
    const matchedKeyword = hints.descriptionKeywords.find((kw) =>
      normalize(combinedDescriptions).includes(normalize(kw))
    );
    matchedCriteria.push(`description:${matchedKeyword}`);
  }

  // === Protocol Keyword Match (+2 points) ===
  if (containsAnyKeyword(protocolName, hints.protocolKeywords)) {
    score += PROTOCOL_KEYWORD_SCORE;
    const matchedKeyword = hints.protocolKeywords.find((kw) =>
      normalize(protocolName).includes(normalize(kw))
    );
    matchedCriteria.push(`protocol:${matchedKeyword}`);
  }

  // Normalize score to 0-1 confidence
  const confidence = score / MAX_SCORE;

  return { score, confidence, matchedCriteria };
}

/**
 * Checks for RT-specific modalities that definitively indicate radiation therapy
 * @param modalities - Array of modalities to check
 * @returns True if any RT modality is found
 */
function hasRTModality(modalities: string[]): boolean {
  return modalities.some((mod) => RT_MODALITIES.includes(mod.toUpperCase()));
}

/**
 * Checks if PET modality is present (indicates oncology)
 * @param modalities - Array of modalities to check
 * @returns True if PT (PET) modality is found
 */
function hasPETModality(modalities: string[]): boolean {
  return modalities.some((mod) => mod.toUpperCase() === PET_MODALITY);
}

// === Main Detection Functions ===

/**
 * Infers the most appropriate suite from study metadata and PACS information.
 *
 * Uses a scoring algorithm that weighs different metadata criteria:
 * - Modality match: +3 points
 * - Body part match: +2 points
 * - Description keyword match: +4 points (highest weight - most specific)
 * - Protocol keyword match: +2 points
 *
 * Special cases:
 * - RTPLAN, RTDOSE, RTSTRUCT modalities immediately return RT suite (confidence 1.0)
 * - PT (PET) modality boosts oncology suite score
 *
 * @param metadata - Study metadata from DICOM headers
 * @param pacsStudy - PACS study information from server
 * @returns Detection result with suite ID, confidence, and matched criteria
 *
 * @example
 * ```ts
 * const result = inferSuiteFromStudy(
 *   { modality: 'CT', bodyPartExamined: 'BRAIN' },
 *   { studyInstanceUID: '1.2.3', studyDescription: 'Brain tumor follow-up' }
 * );
 * // Returns: { suiteId: 'oncology', confidence: 0.82, matchedCriteria: [...] }
 * ```
 */
export function inferSuiteFromStudy(
  metadata: StudyMetadata | null,
  pacsStudy: SuitePacsStudyInfo | null
): SuiteDetectionResult {
  // Default result - return 'auto' if no confident match
  const defaultResult: SuiteDetectionResult = {
    suiteId: 'auto',
    confidence: 0,
    matchedCriteria: [],
  };

  // If no metadata available, return default
  if (!metadata && !pacsStudy) {
    return defaultResult;
  }

  // Extract modalities for special case handling
  const modalities = extractModalities(metadata, pacsStudy);

  // === Special Case: RT Modalities ===
  // RTPLAN, RTDOSE, RTSTRUCT definitively indicate radiation therapy
  if (hasRTModality(modalities)) {
    const rtModality = modalities.find((mod) => RT_MODALITIES.includes(mod.toUpperCase()));
    return {
      suiteId: 'rt',
      confidence: 1.0,
      matchedCriteria: [`rtModality:${rtModality}`],
    };
  }

  // Get all enabled suites for scoring
  const enabledSuites = getEnabledSuites();

  // Skip 'auto' suite - it's not a real suite to detect
  const scorableSuites = enabledSuites.filter((suite) => suite.id !== 'auto');

  if (scorableSuites.length === 0) {
    return defaultResult;
  }

  // Score each suite
  const scoredSuites = scorableSuites.map((suite) => {
    const scoreResult = calculateSuiteScore(suite, metadata, pacsStudy);

    // === Special Case: PET Oncology Boost ===
    // PET scans are primarily used in oncology for tumor detection
    if (suite.id === 'oncology' && hasPETModality(modalities)) {
      const boostedScore = scoreResult.score + MODALITY_SCORE;
      const boostedConfidence = Math.min(boostedScore / MAX_SCORE, 1.0);
      return {
        suite,
        score: boostedScore,
        confidence: boostedConfidence,
        matchedCriteria: [...scoreResult.matchedCriteria, 'petBoost:PT'],
      };
    }

    return {
      suite,
      ...scoreResult,
    };
  });

  // Sort by score descending
  scoredSuites.sort((a, b) => b.score - a.score);

  // Get the best match
  const bestMatch = scoredSuites[0];

  // If confidence is below threshold, return 'auto'
  if (bestMatch.confidence < MIN_CONFIDENCE_THRESHOLD) {
    return defaultResult;
  }

  return {
    suiteId: bestMatch.suite.id,
    confidence: bestMatch.confidence,
    matchedCriteria: bestMatch.matchedCriteria,
  };
}

/**
 * Infers the most appropriate suite from a single image's metadata.
 *
 * This is a convenience wrapper around `inferSuiteFromStudy` for cases
 * where you have image-level metadata rather than study-level metadata.
 *
 * @param image - Object containing image metadata
 * @returns Detection result with suite ID, confidence, and matched criteria
 *
 * @example
 * ```ts
 * const result = inferSuiteFromImage({
 *   metadata: {
 *     modality: 'MR',
 *     bodyPartExamined: 'BRAIN',
 *     seriesDescription: 'T1 FLAIR post contrast'
 *   }
 * });
 * // Returns: { suiteId: 'neurology', confidence: 0.73, matchedCriteria: [...] }
 * ```
 */
export function inferSuiteFromImage(image: { metadata: SuiteImageMetadata }): SuiteDetectionResult {
  // Convert ImageMetadata to StudyMetadata (they share the same structure)
  const studyMetadata: StudyMetadata = {
    modality: image.metadata.modality,
    bodyPartExamined: image.metadata.bodyPartExamined,
    seriesDescription: image.metadata.seriesDescription,
    studyDescription: image.metadata.studyDescription,
    protocolName: image.metadata.protocolName,
  };

  return inferSuiteFromStudy(studyMetadata, null);
}

/**
 * Gets all suite detection scores for debugging/display purposes.
 *
 * Returns scores for all enabled suites, not just the best match.
 * Useful for UI components that want to show why a particular suite was selected.
 *
 * @param metadata - Study metadata from DICOM headers
 * @param pacsStudy - PACS study information from server
 * @returns Array of all suite scores sorted by confidence descending
 *
 * @example
 * ```ts
 * const allScores = getAllSuiteScores(metadata, pacsStudy);
 * // Returns: [
 * //   { suiteId: 'oncology', confidence: 0.82, matchedCriteria: [...] },
 * //   { suiteId: 'neurology', confidence: 0.45, matchedCriteria: [...] },
 * //   ...
 * // ]
 * ```
 */
export function getAllSuiteScores(
  metadata: StudyMetadata | null,
  pacsStudy: SuitePacsStudyInfo | null
): SuiteDetectionResult[] {
  const enabledSuites = getEnabledSuites();
  const scorableSuites = enabledSuites.filter((suite) => suite.id !== 'auto');

  const modalities = extractModalities(metadata, pacsStudy);

  const results = scorableSuites.map((suite) => {
    const scoreResult = calculateSuiteScore(suite, metadata, pacsStudy);

    // Apply PET boost for oncology
    if (suite.id === 'oncology' && hasPETModality(modalities)) {
      const boostedScore = scoreResult.score + MODALITY_SCORE;
      const boostedConfidence = Math.min(boostedScore / MAX_SCORE, 1.0);
      return {
        suiteId: suite.id,
        confidence: boostedConfidence,
        matchedCriteria: [...scoreResult.matchedCriteria, 'petBoost:PT'],
      };
    }

    return {
      suiteId: suite.id,
      confidence: scoreResult.confidence,
      matchedCriteria: scoreResult.matchedCriteria,
    };
  });

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
