/**
 * InterpolationControls - UI for Slice Interpolation
 *
 * Provides controls for marking keyframes and running interpolation
 * between slices for segmentation masks.
 *
 * Features:
 * - Mark current slice as keyframe
 * - List of marked keyframes
 * - Run interpolation between keyframes
 * - Preview interpolation results
 * - Apply or discard interpolated slices
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@medai/ui';
import {
  KeyRound,
  Play,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import {
  interpolateSlices,
  InterpolationConfig,
  InterpolationResult,
  KeyframeSlice,
  DEFAULT_INTERPOLATION_CONFIG,
} from '@medai/core';

interface InterpolationControlsProps {
  /** Current slice index */
  currentSliceIndex: number;
  /** Total number of slices */
  totalSlices: number;
  /** Current orientation */
  orientation: 'axial' | 'sagittal' | 'coronal';
  /** Active segmentation ID */
  segmentationId: string | null;
  /** Active segment index */
  segmentIndex: number | null;
  /** Function to get mask data for a slice */
  getSliceMaskData: (sliceIndex: number) => Uint8Array | null;
  /** Function to set mask data for a slice */
  setSliceMaskData: (sliceIndex: number, data: Uint8Array) => void;
  /** Mask dimensions [width, height] */
  maskDimensions: [number, number];
  /** Whether interpolation is disabled */
  disabled?: boolean;
}

interface Keyframe {
  sliceIndex: number;
  hasData: boolean;
  addedAt: number;
}

export function InterpolationControls({
  currentSliceIndex,
  totalSlices,
  orientation,
  segmentationId,
  segmentIndex,
  getSliceMaskData,
  setSliceMaskData,
  maskDimensions,
  disabled = false,
}: InterpolationControlsProps) {
  // Keyframes marked by the user
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);

  // Interpolation state
  const [isInterpolating, setIsInterpolating] = useState(false);
  const [interpolationResults, setInterpolationResults] = useState<InterpolationResult[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interpolation configuration
  const [config, setConfig] = useState<InterpolationConfig>(DEFAULT_INTERPOLATION_CONFIG);

  // Check if current slice is a keyframe
  const isCurrentSliceKeyframe = useMemo(() => {
    return keyframes.some((kf) => kf.sliceIndex === currentSliceIndex);
  }, [keyframes, currentSliceIndex]);

  // Check if we have enough keyframes for interpolation
  const canInterpolate = keyframes.length >= 2;

  // Add current slice as keyframe
  const handleAddKeyframe = useCallback(() => {
    if (isCurrentSliceKeyframe || !segmentationId || segmentIndex === null) {
      return;
    }

    const maskData = getSliceMaskData(currentSliceIndex);
    const hasData = maskData !== null && maskData.some((v) => v > 0);

    const newKeyframe: Keyframe = {
      sliceIndex: currentSliceIndex,
      hasData,
      addedAt: Date.now(),
    };

    setKeyframes((prev) => {
      // Insert in sorted order
      const updated = [...prev, newKeyframe].sort((a, b) => a.sliceIndex - b.sliceIndex);
      return updated;
    });

    setError(null);
    console.log('[InterpolationControls] Added keyframe at slice', currentSliceIndex);
  }, [currentSliceIndex, isCurrentSliceKeyframe, segmentationId, segmentIndex, getSliceMaskData]);

  // Remove a keyframe
  const handleRemoveKeyframe = useCallback((sliceIndex: number) => {
    setKeyframes((prev) => prev.filter((kf) => kf.sliceIndex !== sliceIndex));
    setInterpolationResults(null);
    setError(null);
    console.log('[InterpolationControls] Removed keyframe at slice', sliceIndex);
  }, []);

  // Clear all keyframes
  const handleClearKeyframes = useCallback(() => {
    setKeyframes([]);
    setInterpolationResults(null);
    setError(null);
    console.log('[InterpolationControls] Cleared all keyframes');
  }, []);

  // Run interpolation
  const handleRunInterpolation = useCallback(async () => {
    if (!canInterpolate) {
      setError('Need at least 2 keyframes for interpolation');
      return;
    }

    setIsInterpolating(true);
    setError(null);

    try {
      // Build keyframe slices from stored keyframes
      const keyframeSlices: KeyframeSlice[] = [];

      for (const kf of keyframes) {
        const maskData = getSliceMaskData(kf.sliceIndex);
        if (maskData) {
          keyframeSlices.push({
            sliceIndex: kf.sliceIndex,
            maskData,
            dimensions: maskDimensions,
          });
        } else {
          // Create empty mask for keyframes without data
          keyframeSlices.push({
            sliceIndex: kf.sliceIndex,
            maskData: new Uint8Array(maskDimensions[0] * maskDimensions[1]),
            dimensions: maskDimensions,
          });
        }
      }

      console.log('[InterpolationControls] Running interpolation with', keyframeSlices.length, 'keyframes');

      // Run interpolation (this is CPU-intensive, could use web worker in production)
      const results = interpolateSlices(keyframeSlices, config);

      setInterpolationResults(results);
      setShowPreview(true);

      console.log('[InterpolationControls] Interpolation complete:', results.length, 'slices');
    } catch (err) {
      console.error('[InterpolationControls] Interpolation failed:', err);
      setError(err instanceof Error ? err.message : 'Interpolation failed');
    } finally {
      setIsInterpolating(false);
    }
  }, [canInterpolate, keyframes, getSliceMaskData, maskDimensions, config]);

  // Apply interpolation results
  const handleApplyInterpolation = useCallback(() => {
    if (!interpolationResults) {
      return;
    }

    console.log('[InterpolationControls] Applying interpolation results');

    for (const result of interpolationResults) {
      // Only apply non-keyframe slices
      if (!result.isKeyframe) {
        setSliceMaskData(result.sliceIndex, result.maskData);
      }
    }

    // Clear state
    setInterpolationResults(null);
    setShowPreview(false);
    setKeyframes([]);

    console.log('[InterpolationControls] Interpolation applied');
  }, [interpolationResults, setSliceMaskData]);

  // Discard interpolation results
  const handleDiscardInterpolation = useCallback(() => {
    setInterpolationResults(null);
    setShowPreview(false);
    console.log('[InterpolationControls] Interpolation discarded');
  }, []);

  // Toggle interpolation method
  const handleToggleMethod = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      method: prev.method === 'morphological' ? 'linear' : 'morphological',
    }));
  }, []);

  // Calculate statistics for interpolation preview
  const interpolationStats = useMemo(() => {
    if (!interpolationResults) return null;

    const keyframeCount = interpolationResults.filter((r) => r.isKeyframe).length;
    const interpolatedCount = interpolationResults.filter((r) => !r.isKeyframe).length;
    const avgConfidence =
      interpolationResults.filter((r) => !r.isKeyframe).reduce((sum, r) => sum + r.confidence, 0) /
      (interpolatedCount || 1);

    return {
      keyframeCount,
      interpolatedCount,
      avgConfidence,
    };
  }, [interpolationResults]);

  if (!segmentationId || segmentIndex === null) {
    return (
      <div className="p-3 rounded-lg bg-background-tertiary border border-border-subtle">
        <p className="text-text-muted text-sm text-center">
          Select a segment to use interpolation
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent-primary" />
          <span className="text-sm font-medium text-text-primary">Slice Interpolation</span>
        </div>
        <span className="text-xs text-text-muted">
          {orientation.charAt(0).toUpperCase() + orientation.slice(1)}
        </span>
      </div>

      {/* Current slice info */}
      <div className="flex items-center justify-between p-2 rounded bg-background-tertiary text-xs">
        <span className="text-text-secondary">Current Slice</span>
        <span className="text-text-primary font-medium">
          {currentSliceIndex + 1} / {totalSlices}
        </span>
      </div>

      {/* Add keyframe button */}
      <Button
        variant={isCurrentSliceKeyframe ? 'outline' : 'default'}
        size="sm"
        className="w-full"
        onClick={handleAddKeyframe}
        disabled={disabled || isCurrentSliceKeyframe || isInterpolating}
      >
        <KeyRound className="h-4 w-4 mr-2" />
        {isCurrentSliceKeyframe ? 'Keyframe Marked' : 'Mark as Keyframe'}
      </Button>

      {/* Keyframes list */}
      {keyframes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Keyframes ({keyframes.length})</span>
            <button
              onClick={handleClearKeyframes}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              disabled={isInterpolating}
            >
              Clear All
            </button>
          </div>

          <div className="max-h-32 overflow-y-auto space-y-1">
            {keyframes.map((kf) => (
              <div
                key={kf.sliceIndex}
                className={`flex items-center justify-between p-2 rounded text-xs ${
                  kf.sliceIndex === currentSliceIndex
                    ? 'bg-accent-primary/20 border border-accent-primary/30'
                    : 'bg-background-tertiary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="h-3 w-3 text-accent-primary" />
                  <span className="text-text-primary">Slice {kf.sliceIndex + 1}</span>
                  {!kf.hasData && (
                    <span className="text-yellow-400 text-[10px]">(empty)</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveKeyframe(kf.sliceIndex)}
                  className="p-1 hover:bg-background-hover rounded text-text-muted hover:text-red-400"
                  disabled={isInterpolating}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interpolation method selector */}
      {keyframes.length >= 2 && (
        <div className="flex items-center justify-between p-2 rounded bg-background-tertiary text-xs">
          <span className="text-text-secondary">Method</span>
          <button
            onClick={handleToggleMethod}
            className="text-accent-primary hover:text-accent-secondary"
            disabled={isInterpolating}
          >
            {config.method === 'morphological' ? 'Morphological' : 'Linear'}
          </button>
        </div>
      )}

      {/* Run interpolation button */}
      {keyframes.length >= 2 && !interpolationResults && (
        <Button
          variant="default"
          size="sm"
          className="w-full bg-accent-primary hover:bg-accent-secondary"
          onClick={handleRunInterpolation}
          disabled={disabled || isInterpolating}
        >
          {isInterpolating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Interpolating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run Interpolation
            </>
          )}
        </Button>
      )}

      {/* Interpolation preview */}
      {interpolationResults && interpolationStats && (
        <div className="space-y-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-green-400">Interpolation Complete</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Keyframes:</span>
              <span className="text-text-primary">{interpolationStats.keyframeCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Interpolated:</span>
              <span className="text-text-primary">{interpolationStats.interpolatedCount}</span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-text-secondary">Avg Confidence:</span>
              <span className="text-text-primary">
                {(interpolationStats.avgConfidence * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Preview toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Show Preview
              </>
            )}
          </Button>

          {/* Apply/Discard buttons */}
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-500"
              onClick={handleApplyInterpolation}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Apply
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
              onClick={handleDiscardInterpolation}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="text-xs text-red-400">{error}</span>
        </div>
      )}

      {/* Help text */}
      {keyframes.length < 2 && (
        <p className="text-text-muted text-xs">
          Mark at least 2 slices as keyframes to interpolate between them.
          Annotate the first and last slices, then run interpolation.
        </p>
      )}
    </div>
  );
}

export default InterpolationControls;
