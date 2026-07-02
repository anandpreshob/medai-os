import React, { useCallback } from 'react';
import { Eye, EyeOff, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { useDetectionStore, Detection } from '@medai/core';

interface DetectionsListPanelProps {
  imageId: string;
}

/**
 * DetectionsListPanel - Shows list of AI detections with visibility toggle and delete
 *
 * Features:
 * - List each detection with label, confidence, and color indicator
 * - Eye icon to toggle individual detection visibility
 * - Trash icon to delete a detection
 * - Click to select/highlight detection on viewport
 * - Shows confidence level with color coding
 */
export function DetectionsListPanel({ imageId }: DetectionsListPanelProps) {
  const {
    selectedDetectionId,
    selectDetection,
    toggleDetectionVisibility,
    deleteDetection,
    getDetectionsForImage,
  } = useDetectionStore();

  const detections = getDetectionsForImage(imageId);

  const handleToggleVisibility = useCallback(
    (e: React.MouseEvent, detectionId: string) => {
      e.stopPropagation();
      toggleDetectionVisibility(imageId, detectionId);
    },
    [imageId, toggleDetectionVisibility]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, detectionId: string) => {
      e.stopPropagation();
      deleteDetection(imageId, detectionId);
    },
    [imageId, deleteDetection]
  );

  const handleSelect = useCallback(
    (detection: Detection) => {
      selectDetection(detection.id === selectedDetectionId ? null : detection.id);
    },
    [selectDetection, selectedDetectionId]
  );

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  };

  const getConfidenceBadgeClass = (confidence: number): string => {
    if (confidence >= 0.8) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (confidence >= 0.5) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  if (detections.length === 0) {
    return (
      <div className="p-3 text-center text-text-muted text-sm">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No detections yet.</p>
        <p className="text-xs mt-1">Run detection to identify abnormalities.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {detections.map((detection, index) => {
        const isSelected = detection.id === selectedDetectionId;
        const confidencePercent = Math.round(detection.confidence * 100);

        return (
          <div
            key={detection.id}
            className={`
              group flex items-center gap-2 p-2 rounded-lg cursor-pointer
              transition-all duration-150
              ${isSelected
                ? 'bg-accent-primary/20 border border-accent-primary/50'
                : 'bg-background-tertiary/50 border border-transparent hover:bg-background-tertiary hover:border-border-subtle'
              }
              ${!detection.visible ? 'opacity-50' : ''}
            `}
            onClick={() => handleSelect(detection)}
          >
            {/* Color indicator */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: detection.color }}
            />

            {/* Label and confidence */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium truncate ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {index + 1}. {detection.label}
                </span>
                {detection.userVerified && (
                  <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${getConfidenceBadgeClass(detection.confidence)}`}
                >
                  {confidencePercent}% {getConfidenceLabel(detection.confidence)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Visibility toggle */}
              <button
                onClick={(e) => handleToggleVisibility(e, detection.id)}
                className={`
                  p-1.5 rounded-md transition-colors
                  ${detection.visible
                    ? 'hover:bg-background-hover text-text-secondary hover:text-text-primary'
                    : 'bg-background-hover text-text-muted'
                  }
                `}
                title={detection.visible ? 'Hide detection' : 'Show detection'}
              >
                {detection.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, detection.id)}
                className="p-1.5 rounded-md hover:bg-red-500/20 text-text-secondary hover:text-red-400 transition-colors"
                title="Delete detection"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
