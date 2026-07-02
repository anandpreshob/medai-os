import React from 'react';
import {
  CheckSquare,
  Square,
  AlertTriangle,
  Cpu,
  Info,
  PenTool,
} from 'lucide-react';
import { Button } from '@medai/ui';
import { ReportDetection } from '@medai/core';

interface DetectionsReviewProps {
  detections: ReportDetection[];
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

/**
 * Get confidence color class based on confidence level
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-400';
  if (confidence >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

/**
 * Get confidence background color class
 */
function getConfidenceBgColor(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-500/20 border-green-500/30';
  if (confidence >= 0.5) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

/**
 * Get confidence level label
 */
function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Moderate';
  return 'Low';
}

/**
 * Component for reviewing and selecting AI detections to include in report
 */
export function DetectionsReview({
  detections,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onDeselectAll,
}: DetectionsReviewProps) {
  if (!detections || detections.length === 0) {
    return (
      <div className="p-4 bg-background-secondary rounded-lg border border-border-subtle">
        <div className="flex items-start gap-3 text-text-muted">
          <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">No AI Detections Available</p>
            <p className="text-xs mt-1">
              Run AI detection on a chest X-ray image to see findings here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedCount = selectedIds.length;
  const totalCount = detections.length;

  // Group detections by confidence level
  const highConfidence = detections.filter((d) => d.confidence >= 0.8);
  const moderateConfidence = detections.filter(
    (d) => d.confidence >= 0.5 && d.confidence < 0.8
  );
  const lowConfidence = detections.filter((d) => d.confidence < 0.5);

  return (
    <div className="space-y-4">
      {/* Selection controls */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <Button variant="ghost" size="sm" onClick={onSelectAll}>
          Select All
        </Button>
        <Button variant="ghost" size="sm" onClick={onDeselectAll}>
          Clear
        </Button>
      </div>

      {/* Detection list */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {detections.map((detection, index) => {
          const detectionId = `detection-${index}`;
          const isSelected = selectedIds.includes(detectionId);
          const confidencePercent = Math.round(detection.confidence * 100);

          return (
            <div
              key={detectionId}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-accent-primary/10 border-accent-primary/30'
                  : 'bg-background-secondary border-border-subtle hover:border-border-emphasis'
              }`}
              onClick={() => onToggleSelection(detectionId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Checkbox */}
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-accent-primary" />
                  ) : (
                    <Square className="h-5 w-5 text-text-muted" />
                  )}

                  {/* Label */}
                  <div>
                    <span className="font-medium text-text-primary">
                      {detection.label}
                    </span>
                    {detection.x_min !== undefined && (
                      <span className="text-xs text-text-muted ml-2">
                        (with location)
                      </span>
                    )}
                  </div>
                </div>

                {/* Source and Confidence badge */}
                <div className="flex items-center gap-2">
                  {/* Source badge */}
                  {detection.source === 'manual' ? (
                    <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-500/20 border border-purple-500/30 text-purple-400">
                      <PenTool className="h-3 w-3" />
                      Manual
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-500/20 border border-blue-500/30 text-blue-400">
                      <Cpu className="h-3 w-3" />
                      AI
                    </div>
                  )}
                  {/* Confidence badge - only show for AI detections */}
                  {detection.source !== 'manual' && (
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium border ${getConfidenceBgColor(
                        detection.confidence
                      )}`}
                    >
                      <span className={getConfidenceColor(detection.confidence)}>
                        {confidencePercent}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Low confidence warning */}
              {detection.confidence < 0.5 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-yellow-400">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Low confidence - verify manually</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary by confidence */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-subtle">
        <div className="text-center p-2 rounded bg-green-500/10">
          <div className="text-lg font-bold text-green-400">
            {highConfidence.length}
          </div>
          <div className="text-xs text-text-muted">High (&gt;80%)</div>
        </div>
        <div className="text-center p-2 rounded bg-yellow-500/10">
          <div className="text-lg font-bold text-yellow-400">
            {moderateConfidence.length}
          </div>
          <div className="text-xs text-text-muted">Moderate (50-80%)</div>
        </div>
        <div className="text-center p-2 rounded bg-red-500/10">
          <div className="text-lg font-bold text-red-400">
            {lowConfidence.length}
          </div>
          <div className="text-xs text-text-muted">Low (&lt;50%)</div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-3 bg-accent-warning-muted border border-accent-warning/30 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-accent-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">
            AI detections are provided for reference only. All findings must be
            verified by a qualified radiologist before inclusion in the final report.
          </p>
        </div>
      </div>
    </div>
  );
}
