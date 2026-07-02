import React, { useState, useEffect } from 'react';
import {
  Layers,
  Play,
  Pause,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileImage,
} from 'lucide-react';
import { Button } from '@medai/ui';
import type { ActionCard } from '@medai/core';

interface BatchProgressCardProps {
  actionCard: ActionCard;
  onStart?: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
}

/**
 * Card component for displaying batch processing progress inline in chat
 */
export function BatchProgressCard({
  actionCard,
  onStart,
  onCancel,
  onPause,
  onResume,
}: BatchProgressCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const {
    jobId,
    totalImages = 0,
    completedCount = 0,
    failedCount = 0,
    status = 'queued',
    estimatedTimeS,
    actions,
    type,
  } = actionCard;

  const isConfirmation = type === 'batch_confirmation';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';

  // Calculate progress
  const processedCount = completedCount + failedCount;
  const progressPercent = totalImages > 0 ? (processedCount / totalImages) * 100 : 0;
  const successRate = processedCount > 0 ? (completedCount / processedCount) * 100 : 0;

  // Format estimated time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calculate remaining time based on progress
  const [remainingTime, setRemainingTime] = useState<number | null>(estimatedTimeS || null);

  useEffect(() => {
    if (isRunning && estimatedTimeS && processedCount > 0) {
      const elapsed = (processedCount / totalImages) * estimatedTimeS;
      const remaining = estimatedTimeS - elapsed;
      setRemainingTime(Math.max(0, remaining));
    } else if (isCompleted || isCancelled) {
      setRemainingTime(null);
    }
  }, [isRunning, processedCount, totalImages, estimatedTimeS, isCompleted, isCancelled]);

  const handleStart = () => {
    if (jobId && onStart) {
      onStart(jobId);
    }
  };

  const handleCancel = () => {
    if (jobId) {
      onCancel(jobId);
    }
  };

  const handlePause = () => {
    if (jobId && onPause) {
      onPause(jobId);
    }
  };

  const handleResume = () => {
    if (jobId && onResume) {
      onResume(jobId);
    }
  };

  // Status badge color
  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-blue-500/20 text-blue-400';
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400';
      case 'paused':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-border-subtle bg-background-secondary overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-blue-500/20">
            <Layers className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <span className="text-xs font-medium text-text-primary">
            {isConfirmation ? 'Batch Processing' : 'Batch Progress'}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getStatusColor()}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </div>

      {isExpanded && (
        <>
          {/* Progress Content */}
          <div className="p-3 space-y-3">
            {/* Image Count */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileImage className="h-4 w-4 text-text-muted" />
                <span className="text-sm text-text-primary">
                  {totalImages} image{totalImages !== 1 ? 's' : ''}
                </span>
              </div>
              {remainingTime !== null && !isConfirmation && (
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  <span>~{formatTime(remainingTime)} remaining</span>
                </div>
              )}
              {isConfirmation && estimatedTimeS && (
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Est. {formatTime(estimatedTimeS)}</span>
                </div>
              )}
            </div>

            {/* Progress Bar (only for non-confirmation) */}
            {!isConfirmation && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-text-muted">Progress</span>
                    <span className="text-text-primary font-medium">
                      {processedCount} / {totalImages}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-background-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-xs text-text-secondary">
                      {completedCount} completed
                    </span>
                  </div>
                  {failedCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-xs text-text-secondary">
                        {failedCount} failed
                      </span>
                    </div>
                  )}
                  {processedCount > 0 && (
                    <div className="text-[10px] text-text-muted ml-auto">
                      Success rate: {successRate.toFixed(0)}%
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Running indicator */}
            {isRunning && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                <span className="text-xs text-blue-300">Processing images...</span>
              </div>
            )}

            {/* Completed message */}
            {isCompleted && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-300">
                  Batch processing complete!
                </span>
              </div>
            )}

            {/* Cancelled message */}
            {isCancelled && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-300">
                  Batch processing cancelled
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {!isCompleted && !isCancelled && (
            <div className="flex items-center gap-2 px-3 py-2 bg-background-tertiary border-t border-border-subtle">
              {isConfirmation && actions.includes('start') && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleStart}
                  className="flex-1 gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start Processing
                </Button>
              )}
              {isRunning && onPause && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handlePause}
                  className="gap-1.5"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
              )}
              {isPaused && onResume && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleResume}
                  className="flex-1 gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
              )}
              {(actions.includes('cancel') || isRunning || isPaused) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
