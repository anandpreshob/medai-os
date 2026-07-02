/**
 * Lesion Matching Algorithm
 *
 * Implements intelligent lesion correspondence matching across longitudinal timepoints.
 * Uses a multi-stage approach:
 * 1. Label-first matching (exact label matches)
 * 2. Centroid proximity scoring
 * 3. Size similarity scoring
 * 4. Hungarian algorithm for optimal global assignment
 * 5. Combined confidence scoring
 */

import {
  LesionCorrespondence,
  LesionInstance,
  LesionMatchCandidate,
  LesionMatchingInput,
  LesionMatchingResult,
  LesionMatchingStatistics,
  LesionMatchMethod,
  LesionCorrespondenceStatus,
  MATCH_CONFIG,
  generateCorrespondenceId,
} from '../stores/lesionCorrespondenceTypes';

/**
 * Calculate Euclidean distance between two 3D points.
 */
export function euclideanDistance(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  const dz = p1[2] - p2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate size similarity between two volumes.
 * Returns a value between 0 and 1, where 1 means identical size.
 * Formula: 1 - |v1 - v2| / max(v1, v2)
 */
export function calculateSizeSimilarity(v1: number, v2: number): number {
  if (v1 <= 0 && v2 <= 0) return 1;
  if (v1 <= 0 || v2 <= 0) return 0;

  const maxVol = Math.max(v1, v2);
  const diff = Math.abs(v1 - v2);

  return 1 - diff / maxVol;
}

/**
 * Calculate centroid proximity score.
 * Returns a value between 0 and 1, where 1 means very close centroids.
 * Uses exponential decay based on distance threshold.
 */
export function calculateCentroidScore(
  distanceMm: number,
  thresholdMm: number = MATCH_CONFIG.centroidProximityThresholdMm
): number {
  if (distanceMm <= 0) return 1;
  if (distanceMm >= thresholdMm) return 0;

  // Exponential decay: score = exp(-distance^2 / (2 * sigma^2))
  // sigma = threshold / 3 so that score ~0.01 at threshold
  const sigma = thresholdMm / 3;
  return Math.exp(-(distanceMm * distanceMm) / (2 * sigma * sigma));
}

/**
 * Calculate combined match confidence score.
 */
export function calculateCombinedScore(
  centroidScore: number,
  sizeScore: number,
  labelMatch: boolean,
  weights: { centroid: number; size: number; label: number } = {
    centroid: MATCH_CONFIG.centroidWeight,
    size: MATCH_CONFIG.sizeWeight,
    label: MATCH_CONFIG.labelWeight,
  }
): number {
  const labelScore = labelMatch ? 1 : 0;

  const totalWeight = weights.centroid + weights.size + weights.label;
  const normalizedCentroid = weights.centroid / totalWeight;
  const normalizedSize = weights.size / totalWeight;
  const normalizedLabel = weights.label / totalWeight;

  return (
    centroidScore * normalizedCentroid +
    sizeScore * normalizedSize +
    labelScore * normalizedLabel
  );
}

/**
 * Generate all pairwise match candidates between two sets of lesions.
 */
export function generateMatchCandidates(
  sourceLesions: LesionInstance[],
  targetLesions: LesionInstance[],
  transformMatrix?: number[][]
): LesionMatchCandidate[] {
  const candidates: LesionMatchCandidate[] = [];

  for (const source of sourceLesions) {
    for (const target of targetLesions) {
      // Apply transformation to source centroid if provided
      let sourceCentroid = source.centroidWorld;
      if (transformMatrix) {
        sourceCentroid = applyTransform(source.centroidWorld, transformMatrix);
      }

      // Calculate distance
      const distanceMm = euclideanDistance(sourceCentroid, target.centroidWorld);

      // Skip if too far
      if (distanceMm > MATCH_CONFIG.centroidProximityThresholdMm * 2) {
        continue;
      }

      // Calculate scores
      const sizeSimilarity = calculateSizeSimilarity(source.volumeMm3, target.volumeMm3);
      const labelMatch =
        source.label.toLowerCase() === target.label.toLowerCase() &&
        source.label !== '' &&
        target.label !== '';
      const centroidScore = calculateCentroidScore(distanceMm);
      const confidence = calculateCombinedScore(centroidScore, sizeSimilarity, labelMatch);

      // Determine best method
      let bestMethod: LesionMatchMethod = 'centroid';
      if (labelMatch) {
        bestMethod = 'label';
      } else if (transformMatrix) {
        bestMethod = 'registration';
      }

      candidates.push({
        sourceInstance: source,
        targetInstance: target,
        centroidDistanceMm: distanceMm,
        sizeSimilarity,
        labelMatch,
        confidence,
        bestMethod,
      });
    }
  }

  return candidates;
}

/**
 * Apply a 4x4 transformation matrix to a 3D point.
 */
export function applyTransform(
  point: [number, number, number],
  matrix: number[][]
): [number, number, number] {
  // Assume matrix is 4x4 in row-major order
  const [x, y, z] = point;

  const newX = matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3];
  const newY = matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3];
  const newZ = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3];

  return [newX, newY, newZ];
}

/**
 * Hungarian Algorithm for optimal bipartite matching.
 * Returns optimal assignment that minimizes total cost.
 *
 * @param costMatrix - 2D array where costMatrix[i][j] is cost of assigning i to j
 * @returns Array of [rowIndex, colIndex] pairs representing optimal assignment
 */
export function hungarianAlgorithm(costMatrix: number[][]): [number, number][] {
  const numRows = costMatrix.length;
  if (numRows === 0) return [];

  const numCols = costMatrix[0].length;
  if (numCols === 0) return [];

  // Make matrix square by padding with large values
  const size = Math.max(numRows, numCols);
  const matrix: number[][] = [];
  const INF = 1e9;

  for (let i = 0; i < size; i++) {
    matrix[i] = [];
    for (let j = 0; j < size; j++) {
      if (i < numRows && j < numCols) {
        matrix[i][j] = costMatrix[i][j];
      } else {
        matrix[i][j] = INF;
      }
    }
  }

  // Step 1: Subtract row minimum from each row
  for (let i = 0; i < size; i++) {
    const rowMin = Math.min(...matrix[i]);
    for (let j = 0; j < size; j++) {
      matrix[i][j] -= rowMin;
    }
  }

  // Step 2: Subtract column minimum from each column
  for (let j = 0; j < size; j++) {
    let colMin = INF;
    for (let i = 0; i < size; i++) {
      colMin = Math.min(colMin, matrix[i][j]);
    }
    for (let i = 0; i < size; i++) {
      matrix[i][j] -= colMin;
    }
  }

  // Initialize assignment arrays
  const rowAssignment: number[] = new Array(size).fill(-1);
  const colAssignment: number[] = new Array(size).fill(-1);

  // Greedy initial assignment on zeros
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (matrix[i][j] === 0 && rowAssignment[i] === -1 && colAssignment[j] === -1) {
        rowAssignment[i] = j;
        colAssignment[j] = i;
      }
    }
  }

  // Augmenting path algorithm
  for (let iter = 0; iter < size * size; iter++) {
    // Find unassigned row
    let unassignedRow = -1;
    for (let i = 0; i < size; i++) {
      if (rowAssignment[i] === -1) {
        unassignedRow = i;
        break;
      }
    }

    if (unassignedRow === -1) break; // All rows assigned

    // BFS to find augmenting path
    const rowVisited = new Array(size).fill(false);
    const colVisited = new Array(size).fill(false);
    const parent: number[] = new Array(size).fill(-1);
    const queue: number[] = [unassignedRow];
    rowVisited[unassignedRow] = true;
    let foundAugmentingPath = false;
    let augmentingCol = -1;

    while (queue.length > 0 && !foundAugmentingPath) {
      const row = queue.shift()!;

      for (let col = 0; col < size; col++) {
        if (matrix[row][col] === 0 && !colVisited[col]) {
          colVisited[col] = true;
          parent[col] = row;

          if (colAssignment[col] === -1) {
            // Found augmenting path
            foundAugmentingPath = true;
            augmentingCol = col;
            break;
          } else {
            // Continue BFS
            const nextRow = colAssignment[col];
            if (!rowVisited[nextRow]) {
              rowVisited[nextRow] = true;
              queue.push(nextRow);
            }
          }
        }
      }
    }

    if (foundAugmentingPath) {
      // Augment along path
      let col = augmentingCol;
      while (col !== -1) {
        const row = parent[col];
        const prevCol = rowAssignment[row];
        rowAssignment[row] = col;
        colAssignment[col] = row;
        col = prevCol;
      }
    } else {
      // Update matrix with minimum uncovered value
      let minUncovered = INF;
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          if (rowVisited[i] && !colVisited[j]) {
            minUncovered = Math.min(minUncovered, matrix[i][j]);
          }
        }
      }

      if (minUncovered === INF) break;

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          if (rowVisited[i] && !colVisited[j]) {
            matrix[i][j] -= minUncovered;
          } else if (!rowVisited[i] && colVisited[j]) {
            matrix[i][j] += minUncovered;
          }
        }
      }
    }
  }

  // Extract valid assignments (within original matrix bounds)
  const assignments: [number, number][] = [];
  for (let i = 0; i < numRows; i++) {
    const j = rowAssignment[i];
    if (j !== -1 && j < numCols) {
      assignments.push([i, j]);
    }
  }

  return assignments;
}

/**
 * Perform optimal lesion matching using Hungarian algorithm.
 */
export function performOptimalMatching(
  candidates: LesionMatchCandidate[],
  sourceLesions: LesionInstance[],
  targetLesions: LesionInstance[]
): LesionMatchCandidate[] {
  if (sourceLesions.length === 0 || targetLesions.length === 0) {
    return [];
  }

  // Build cost matrix (use 1 - confidence as cost since we want to maximize confidence)
  const costMatrix: number[][] = [];
  const candidateMap = new Map<string, LesionMatchCandidate>();

  // Index lookup
  const sourceIndexMap = new Map<LesionInstance, number>();
  const targetIndexMap = new Map<LesionInstance, number>();

  sourceLesions.forEach((s, i) => sourceIndexMap.set(s, i));
  targetLesions.forEach((t, i) => targetIndexMap.set(t, i));

  // Initialize with high cost (no match)
  for (let i = 0; i < sourceLesions.length; i++) {
    costMatrix[i] = [];
    for (let j = 0; j < targetLesions.length; j++) {
      costMatrix[i][j] = 1.0; // Cost = 1 means no match (0 confidence)
    }
  }

  // Fill with actual costs from candidates
  for (const candidate of candidates) {
    const i = sourceIndexMap.get(candidate.sourceInstance);
    const j = targetIndexMap.get(candidate.targetInstance);

    if (i !== undefined && j !== undefined) {
      costMatrix[i][j] = 1.0 - candidate.confidence;
      candidateMap.set(`${i}-${j}`, candidate);
    }
  }

  // Run Hungarian algorithm
  const assignments = hungarianAlgorithm(costMatrix);

  // Filter valid matches (above minimum threshold)
  const optimalMatches: LesionMatchCandidate[] = [];

  for (const [i, j] of assignments) {
    const key = `${i}-${j}`;
    const candidate = candidateMap.get(key);

    if (candidate) {
      // Check if match meets minimum criteria
      const meetsDistanceThreshold =
        candidate.centroidDistanceMm <= MATCH_CONFIG.centroidProximityThresholdMm;
      const meetsSizeThreshold =
        candidate.sizeSimilarity >= MATCH_CONFIG.sizeSimilarityThreshold;

      if (meetsDistanceThreshold || candidate.labelMatch) {
        optimalMatches.push(candidate);
      }
    }
  }

  return optimalMatches;
}

/**
 * Main lesion matching function.
 * Matches lesions across all timepoints in a longitudinal session.
 */
export function matchLesionsAcrossTimepoints(
  input: LesionMatchingInput
): LesionMatchingResult {
  const {
    sessionId,
    baselineTimepointId,
    followUpTimepointIds,
    instancesByTimepoint,
    transformations,
  } = input;

  const correspondences: LesionCorrespondence[] = [];
  const unmatchedByTimepoint = new Map<string, LesionInstance[]>();

  // Get baseline lesions
  const baselineLesions = instancesByTimepoint.get(baselineTimepointId) || [];

  // Initialize tracking
  const matchedBaseline = new Set<number>(); // Track by segmentIndex
  const allTimepoints = [baselineTimepointId, ...followUpTimepointIds];

  // Initialize unmatched with copies of all lesions
  allTimepoints.forEach((tpId) => {
    const lesions = instancesByTimepoint.get(tpId) || [];
    unmatchedByTimepoint.set(tpId, [...lesions]);
  });

  // Stage 1: Label-based matching (highest priority)
  // Find exact label matches across all timepoints
  const labelGroups = new Map<string, LesionInstance[]>();

  allTimepoints.forEach((tpId) => {
    const lesions = instancesByTimepoint.get(tpId) || [];
    lesions.forEach((lesion) => {
      if (lesion.label && lesion.label.trim() !== '') {
        const normalizedLabel = lesion.label.toLowerCase().trim();
        const existing = labelGroups.get(normalizedLabel) || [];
        existing.push(lesion);
        labelGroups.set(normalizedLabel, existing);
      }
    });
  });

  // Create correspondences for label groups with multiple timepoints
  labelGroups.forEach((lesions, label) => {
    // Get unique timepoints in this group
    const timepointsInGroup = new Set(lesions.map((l) => l.timepointId));

    if (timepointsInGroup.size >= 2) {
      // Valid correspondence (spans multiple timepoints)
      const instanceMap = new Map<string, LesionInstance>();
      let totalConfidence = 0;

      lesions.forEach((lesion) => {
        // Only keep one instance per timepoint (first one)
        if (!instanceMap.has(lesion.timepointId)) {
          instanceMap.set(lesion.timepointId, lesion);
          totalConfidence += 1.0; // Label match = 100% confidence for that pair

          // Mark as matched
          const unmatched = unmatchedByTimepoint.get(lesion.timepointId) || [];
          unmatchedByTimepoint.set(
            lesion.timepointId,
            unmatched.filter((l) => l.segmentIndex !== lesion.segmentIndex)
          );

          if (lesion.timepointId === baselineTimepointId) {
            matchedBaseline.add(lesion.segmentIndex);
          }
        }
      });

      correspondences.push({
        id: generateCorrespondenceId(),
        canonicalLabel: lesions[0].label, // Use first label as canonical
        instances: instanceMap,
        matchConfidence: totalConfidence / instanceMap.size,
        matchMethod: 'label',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });

  // Stage 2: Centroid/registration-based matching for remaining lesions
  // Process each follow-up timepoint sequentially
  for (const followUpId of followUpTimepointIds) {
    const remainingBaseline = unmatchedByTimepoint.get(baselineTimepointId) || [];
    const remainingFollowUp = unmatchedByTimepoint.get(followUpId) || [];

    if (remainingBaseline.length === 0 || remainingFollowUp.length === 0) {
      continue;
    }

    // Get transformation if available
    const transform = transformations?.get(followUpId);

    // Generate candidates
    const candidates = generateMatchCandidates(remainingBaseline, remainingFollowUp, transform);

    // Perform optimal matching
    const optimalMatches = performOptimalMatching(candidates, remainingBaseline, remainingFollowUp);

    // Create correspondences from matches
    for (const match of optimalMatches) {
      // Check if baseline lesion already has a correspondence
      const existingCorr = correspondences.find((c) =>
        c.instances.get(baselineTimepointId)?.segmentIndex === match.sourceInstance.segmentIndex
      );

      if (existingCorr) {
        // Add to existing correspondence
        existingCorr.instances.set(followUpId, match.targetInstance);
        existingCorr.matchConfidence =
          (existingCorr.matchConfidence * (existingCorr.instances.size - 1) + match.confidence) /
          existingCorr.instances.size;
        existingCorr.updatedAt = Date.now();

        // Downgrade method if this match is lower quality
        if (existingCorr.matchMethod === 'label' && !match.labelMatch) {
          existingCorr.matchMethod = match.bestMethod;
        }
      } else {
        // Create new correspondence
        const instanceMap = new Map<string, LesionInstance>();
        instanceMap.set(baselineTimepointId, match.sourceInstance);
        instanceMap.set(followUpId, match.targetInstance);

        correspondences.push({
          id: generateCorrespondenceId(),
          canonicalLabel: match.sourceInstance.label || `Lesion ${correspondences.length + 1}`,
          instances: instanceMap,
          matchConfidence: match.confidence,
          matchMethod: match.bestMethod,
          status: match.confidence >= MATCH_CONFIG.highConfidenceThreshold ? 'confirmed' : 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        matchedBaseline.add(match.sourceInstance.segmentIndex);
      }

      // Remove from unmatched
      const unmatchedBase = unmatchedByTimepoint.get(baselineTimepointId) || [];
      unmatchedByTimepoint.set(
        baselineTimepointId,
        unmatchedBase.filter((l) => l.segmentIndex !== match.sourceInstance.segmentIndex)
      );

      const unmatchedFollow = unmatchedByTimepoint.get(followUpId) || [];
      unmatchedByTimepoint.set(
        followUpId,
        unmatchedFollow.filter((l) => l.segmentIndex !== match.targetInstance.segmentIndex)
      );
    }
  }

  // Identify new and resolved lesions
  const baselineUnmatched = unmatchedByTimepoint.get(baselineTimepointId) || [];
  const lastFollowUpId = followUpTimepointIds[followUpTimepointIds.length - 1];
  const lastFollowUpUnmatched = unmatchedByTimepoint.get(lastFollowUpId) || [];

  const resolvedLesions = baselineUnmatched; // Present at baseline, not matched to any follow-up
  const newLesions = lastFollowUpUnmatched; // Present at last follow-up, not matched to baseline

  // Calculate statistics
  const statistics = calculateStatistics(
    correspondences,
    unmatchedByTimepoint,
    baselineTimepointId,
    lastFollowUpId
  );

  return {
    correspondences,
    unmatchedByTimepoint,
    newLesions,
    resolvedLesions,
    statistics,
  };
}

/**
 * Calculate matching statistics.
 */
function calculateStatistics(
  correspondences: LesionCorrespondence[],
  unmatchedByTimepoint: Map<string, LesionInstance[]>,
  baselineTimepointId: string,
  latestFollowUpId: string
): LesionMatchingStatistics {
  const countByMethod: Record<LesionMatchMethod, number> = {
    label: 0,
    centroid: 0,
    registration: 0,
    manual: 0,
  };

  const countByStatus: Record<LesionCorrespondenceStatus, number> = {
    confirmed: 0,
    pending: 0,
    rejected: 0,
  };

  let totalConfidence = 0;

  correspondences.forEach((corr) => {
    countByMethod[corr.matchMethod]++;
    countByStatus[corr.status]++;
    totalConfidence += corr.matchConfidence;
  });

  const baselineUnmatched = unmatchedByTimepoint.get(baselineTimepointId) || [];
  const latestUnmatched = unmatchedByTimepoint.get(latestFollowUpId) || [];

  // Count lesions at each timepoint
  let baselineCount = baselineUnmatched.length;
  let latestCount = latestUnmatched.length;

  correspondences.forEach((corr) => {
    if (corr.instances.has(baselineTimepointId)) baselineCount++;
    if (corr.instances.has(latestFollowUpId)) latestCount++;
  });

  return {
    baselineLesionCount: baselineCount,
    latestFollowUpLesionCount: latestCount,
    matchedCount: correspondences.length,
    newLesionCount: latestUnmatched.length,
    resolvedLesionCount: baselineUnmatched.length,
    averageConfidence: correspondences.length > 0 ? totalConfidence / correspondences.length : 0,
    countByMethod,
    countByStatus,
  };
}

/**
 * Extract lesion instances from segmentation data.
 * This helper function converts volumetric results to LesionInstance format.
 */
export function extractLesionInstances(
  timepointId: string,
  imageId: string,
  segmentationId: string,
  segments: Array<{
    segment_index: number;
    label: string;
    total_volume_mm3: number;
    instances: Array<{
      instance_id: number;
      centroid_ijk: [number, number, number];
      volume_mm3: number;
      longest_axis_mm?: number;
      bounding_box?: [[number, number, number], [number, number, number]];
    }>;
  }>,
  imageToWorldMatrix?: number[][]
): LesionInstance[] {
  const instances: LesionInstance[] = [];

  for (const segment of segments) {
    // For segments with multiple instances, create one LesionInstance per instance
    if (segment.instances && segment.instances.length > 0) {
      for (const inst of segment.instances) {
        // Convert centroid from IJK to world coordinates if matrix provided
        let centroidWorld: [number, number, number] = inst.centroid_ijk;

        if (imageToWorldMatrix) {
          centroidWorld = applyTransform(inst.centroid_ijk, imageToWorldMatrix);
        }

        instances.push({
          timepointId,
          segmentIndex: segment.segment_index,
          centroidWorld,
          volumeMm3: inst.volume_mm3,
          label: segment.label || `Segment ${segment.segment_index}`,
          longestAxisMm: inst.longest_axis_mm,
          boundingBoxWorld: inst.bounding_box, // TODO: Transform if needed
          imageId,
          segmentationId,
        });
      }
    } else {
      // Single instance segment
      instances.push({
        timepointId,
        segmentIndex: segment.segment_index,
        centroidWorld: [0, 0, 0], // Unknown centroid
        volumeMm3: segment.total_volume_mm3,
        label: segment.label || `Segment ${segment.segment_index}`,
        imageId,
        segmentationId,
      });
    }
  }

  return instances;
}

/**
 * Re-match correspondences after user modification.
 * Use this after manual edits to recalculate confidence scores.
 */
export function recalculateCorrespondenceConfidence(
  correspondence: LesionCorrespondence
): number {
  const instances = Array.from(correspondence.instances.values());

  if (instances.length < 2) return 0;

  let totalConfidence = 0;
  let pairCount = 0;

  // Calculate pairwise confidence between consecutive timepoints
  for (let i = 0; i < instances.length - 1; i++) {
    const source = instances[i];
    const target = instances[i + 1];

    const distanceMm = euclideanDistance(source.centroidWorld, target.centroidWorld);
    const sizeSimilarity = calculateSizeSimilarity(source.volumeMm3, target.volumeMm3);
    const labelMatch = source.label.toLowerCase() === target.label.toLowerCase();
    const centroidScore = calculateCentroidScore(distanceMm);

    const pairConfidence = calculateCombinedScore(centroidScore, sizeSimilarity, labelMatch);
    totalConfidence += pairConfidence;
    pairCount++;
  }

  return pairCount > 0 ? totalConfidence / pairCount : 0;
}
