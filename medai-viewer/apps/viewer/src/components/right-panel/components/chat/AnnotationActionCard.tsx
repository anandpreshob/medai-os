import React, { useState } from 'react';
import {
  Check,
  X,
  Pencil,
  Image,
  Loader2,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
} from 'lucide-react';
import { Button } from '@medai/ui';
import type { ActionCard, SegmentationLabel } from '@medai/core';

interface AnnotationActionCardProps {
  actionCard: ActionCard;
  onAccept: (previewId: string) => void;
  onReject: (previewId: string) => void;
  onEdit: (previewId: string) => void;
  isLoading?: boolean;
}

/**
 * Card component for displaying segmentation preview and accept/reject/edit actions
 */
export function AnnotationActionCard({
  actionCard,
  onAccept,
  onReject,
  onEdit,
  isLoading = false,
}: AnnotationActionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { previewId, labels, thumbnailUrl, actions, type } = actionCard;

  const isEditPreview = type === 'edit_preview';

  const handleAccept = () => {
    if (previewId) {
      onAccept(previewId);
    }
  };

  const handleReject = () => {
    if (previewId) {
      onReject(previewId);
    }
  };

  const handleEdit = () => {
    if (previewId) {
      onEdit(previewId);
    }
  };

  // Calculate total volume
  const totalVolume = labels?.reduce((sum, label) => sum + (label.volumeMl || 0), 0) || 0;
  const avgConfidence = labels?.length
    ? labels.reduce((sum, label) => sum + (label.confidence || 0), 0) / labels.length
    : 0;

  return (
    <div className="mt-2 rounded-xl border border-border-subtle bg-background-secondary overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-purple-500/20">
            {isEditPreview ? (
              <Pencil className="h-3.5 w-3.5 text-purple-400" />
            ) : (
              <Layers className="h-3.5 w-3.5 text-purple-400" />
            )}
          </div>
          <span className="text-xs font-medium text-text-primary">
            {isEditPreview ? 'Edit Preview' : 'Segmentation Preview'}
          </span>
          {labels && labels.length > 0 && (
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-background-tertiary">
              {labels.length} label{labels.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </div>

      {isExpanded && (
        <>
          {/* Thumbnail and Labels */}
          <div className="p-3 space-y-3">
            {/* Thumbnail Preview */}
            {thumbnailUrl && (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-background-tertiary">
                <img
                  src={thumbnailUrl}
                  alt="Segmentation preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-[10px] text-white">
                  <Image className="h-3 w-3" />
                  Preview
                </div>
              </div>
            )}

            {/* Labels List */}
            {labels && labels.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wide">
                  Detected Structures
                </h4>
                <div className="space-y-1.5">
                  {labels.map((label, index) => (
                    <LabelRow key={index} label={label} />
                  ))}
                </div>
              </div>
            )}

            {/* Summary Stats */}
            {(totalVolume > 0 || avgConfidence > 0) && (
              <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
                {totalVolume > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3 w-3 text-text-muted" />
                    <span className="text-xs text-text-secondary">
                      Total: {totalVolume.toFixed(1)} ml
                    </span>
                  </div>
                )}
                {avgConfidence > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3 text-text-muted" />
                    <span className="text-xs text-text-secondary">
                      Confidence: {(avgConfidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 px-3 py-2 bg-background-tertiary border-t border-border-subtle">
            {actions.includes('accept') && (
              <Button
                size="sm"
                variant="default"
                onClick={handleAccept}
                disabled={isLoading}
                className="flex-1 gap-1.5"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Accept
              </Button>
            )}
            {actions.includes('edit') && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleEdit}
                disabled={isLoading}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            {actions.includes('reject') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReject}
                disabled={isLoading}
                className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Single label row with color, name, and stats
 */
function LabelRow({ label }: { label: SegmentationLabel }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-background-tertiary">
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: label.color }}
        />
        <span className="text-xs font-medium text-text-primary capitalize">
          {label.labelName.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        {label.volumeMl !== undefined && label.volumeMl > 0 && (
          <span>{label.volumeMl.toFixed(1)} ml</span>
        )}
        {label.voxelCount !== undefined && label.voxelCount > 0 && (
          <span>{formatVoxelCount(label.voxelCount)} vx</span>
        )}
        {label.confidence !== undefined && label.confidence > 0 && (
          <span
            className={`px-1.5 py-0.5 rounded ${
              label.confidence >= 0.8
                ? 'bg-green-500/20 text-green-400'
                : label.confidence >= 0.6
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {(label.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Format voxel count with K/M suffix
 */
function formatVoxelCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
