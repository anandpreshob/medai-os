import React, { useCallback, useMemo } from 'react';
import {
  Eye,
  EyeOff,
  ChevronRight,
  Check,
  X,
  FileText,
  Edit2,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@medai/ui';
import { useDetectionStore, useViewerStore, useFindingsStore, Detection } from '@medai/core';

/**
 * Get confidence badge styling based on level
 */
function getConfidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (confidence >= 0.5) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

/**
 * DetectionItem - Individual detection row in the panel
 */
interface DetectionItemProps {
  detection: Detection;
  imageId: string;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleInclude: () => void;
  onAddToFindings: () => void;
}

function DetectionItem({
  detection,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleInclude,
  onAddToFindings,
}: DetectionItemProps) {
  const confidencePercent = Math.round(detection.confidence * 100);

  return (
    <div
      className={`
        group p-2 rounded-lg border transition-all duration-200 cursor-pointer
        ${isSelected
          ? 'bg-accent-primary/10 border-accent-primary/50'
          : 'bg-background-tertiary/50 border-border-subtle hover:border-border-default'
        }
      `}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Color indicator */}
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: detection.color }}
          />

          {/* Label */}
          <span className="text-sm font-medium text-text-primary truncate">
            {detection.label}
          </span>

          {/* User verified badge */}
          {detection.userVerified && (
            <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Confidence badge */}
          <span
            className={`
              text-xs px-1.5 py-0.5 rounded border
              ${getConfidenceBadgeClass(detection.confidence)}
            `}
          >
            {confidencePercent}%
          </span>

          {/* Visibility toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            title={detection.visible ? 'Hide overlay' : 'Show overlay'}
          >
            {detection.visible ? (
              <Eye className="h-3.5 w-3.5 text-text-secondary" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-text-muted" />
            )}
          </Button>

          {/* Include in report toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onToggleInclude();
            }}
            title={detection.includeInReport ? 'Exclude from report' : 'Include in report'}
          >
            {detection.includeInReport ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <X className="h-3.5 w-3.5 text-text-muted" />
            )}
          </Button>

          {/* Add to findings */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onAddToFindings();
            }}
            title="Add to findings"
          >
            <FileText className="h-3.5 w-3.5 text-text-secondary" />
          </Button>

          {/* Expand indicator */}
          <ChevronRight
            className={`h-4 w-4 text-text-muted transition-transform ${
              isSelected ? 'rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {/* Expanded details */}
      {isSelected && (
        <div className="mt-2 pt-2 border-t border-border-subtle space-y-2">
          {/* Confidence level description */}
          <div className="text-xs text-text-muted">
            <span className="font-medium">Confidence:</span>{' '}
            {detection.confidence >= 0.8
              ? 'High - Likely present'
              : detection.confidence >= 0.5
              ? 'Moderate - May be present'
              : 'Low - Possible, needs verification'}
          </div>

          {/* Bounding box info */}
          <div className="text-xs text-text-muted">
            <span className="font-medium">Location:</span>{' '}
            ({detection.x_min}, {detection.y_min}) to ({detection.x_max}, {detection.y_max})
          </div>

          {/* Description if available */}
          {detection.description && (
            <div className="text-xs text-text-muted">
              <span className="font-medium">Description:</span> {detection.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DetectionsPanelProps {
  /** Optional class name */
  className?: string;
}

/**
 * DetectionsPanel - List of AI detection results
 *
 * Features:
 * - List all detections with confidence scores
 * - Color-coded by confidence level
 * - Toggle visibility per detection
 * - Toggle include in report
 * - Add to radiologist findings
 */
export function DetectionsPanel({ className }: DetectionsPanelProps) {
  const { activeImageId } = useViewerStore();
  const { setFindings, getFindings } = useFindingsStore();
  const {
    selectedDetectionId,
    selectDetection,
    toggleDetectionVisibility,
    toggleIncludeInReport,
    getDetectionsForImage,
  } = useDetectionStore();

  const findings = activeImageId ? getFindings(activeImageId) : '';

  const detections = useMemo(() => {
    return activeImageId ? getDetectionsForImage(activeImageId) : [];
  }, [activeImageId, getDetectionsForImage]);

  // Sort detections by confidence (highest first)
  const sortedDetections = useMemo(() => {
    return [...detections].sort((a, b) => b.confidence - a.confidence);
  }, [detections]);

  // Handle selecting a detection
  const handleSelect = useCallback(
    (detectionId: string) => {
      selectDetection(detectionId === selectedDetectionId ? null : detectionId);
    },
    [selectDetection, selectedDetectionId]
  );

  // Handle adding detection to findings
  const handleAddToFindings = useCallback(
    (detection: Detection) => {
      if (!activeImageId) return;

      const confidenceLabel =
        detection.confidence >= 0.8
          ? 'definite'
          : detection.confidence >= 0.5
          ? 'probable'
          : 'possible';

      const findingText = `- ${detection.label} (${confidenceLabel}, ${Math.round(
        detection.confidence * 100
      )}% confidence)`;

      const newFindings = findings ? `${findings}\n${findingText}` : findingText;
      setFindings(activeImageId, newFindings);
    },
    [activeImageId, findings, setFindings]
  );

  if (!activeImageId) {
    return (
      <div className={`p-4 text-center text-text-muted text-sm ${className}`}>
        Load an image to see detections
      </div>
    );
  }

  if (detections.length === 0) {
    return (
      <div className={`p-4 text-center text-text-muted text-sm ${className}`}>
        No detections yet. Run AI detection to identify abnormalities.
      </div>
    );
  }

  // Count by confidence level
  const highCount = detections.filter((d) => d.confidence >= 0.8).length;
  const mediumCount = detections.filter((d) => d.confidence >= 0.5 && d.confidence < 0.8).length;
  const lowCount = detections.filter((d) => d.confidence < 0.5).length;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{detections.length} detection(s) found</span>
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <span className="text-green-400">{highCount} high</span>
          )}
          {mediumCount > 0 && (
            <span className="text-yellow-400">{mediumCount} med</span>
          )}
          {lowCount > 0 && (
            <span className="text-red-400">{lowCount} low</span>
          )}
        </div>
      </div>

      {/* Detection list */}
      <div className="space-y-1.5">
        {sortedDetections.map((detection) => (
          <DetectionItem
            key={detection.id}
            detection={detection}
            imageId={activeImageId}
            isSelected={detection.id === selectedDetectionId}
            onSelect={() => handleSelect(detection.id)}
            onToggleVisibility={() =>
              toggleDetectionVisibility(activeImageId, detection.id)
            }
            onToggleInclude={() =>
              toggleIncludeInReport(activeImageId, detection.id)
            }
            onAddToFindings={() => handleAddToFindings(detection)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="pt-2 border-t border-border-subtle">
        <p className="text-xs text-text-muted mb-1">Confidence levels:</p>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-text-muted">&gt;80% High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-text-muted">50-80% Med</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-text-muted">&lt;50% Low</span>
          </div>
        </div>
      </div>
    </div>
  );
}
