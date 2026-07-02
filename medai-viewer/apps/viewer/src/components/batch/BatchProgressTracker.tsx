/**
 * BatchProgressTracker - Progress visualization for batch processing
 *
 * Features:
 * - Overall progress bar
 * - Per-file status indicators
 * - Current file being processed
 * - Time remaining estimate
 * - Cancel button
 */

import React, { useMemo } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
  StopCircle,
  Zap,
} from 'lucide-react';
import { Button, Spinner } from '@medai/ui';
import { type BatchJob } from '@medai/core';

interface BatchProgressTrackerProps {
  job: BatchJob;
  onCancel: () => void;
}

/**
 * Format seconds into human-readable time
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format processing duration
 */
function formatDuration(start: Date, end?: Date): string {
  const endTime = end || new Date();
  const durationMs = endTime.getTime() - start.getTime();
  return formatTime(durationMs / 1000);
}

export function BatchProgressTracker({ job, onCancel }: BatchProgressTrackerProps) {
  const isProcessing = job.status === 'processing';
  const isCompleted = job.status === 'completed';
  const isCancelled = job.status === 'cancelled';
  const isFailed = job.status === 'failed';

  // Calculate stats
  const totalFiles = job.files.length;
  const completedFiles = job.results.length;
  const failedFiles = job.results.filter((r) => r.error).length;
  const successfulFiles = completedFiles - failedFiles;

  // Processing speed calculation
  const processingSpeed = useMemo(() => {
    if (!job.startedAt || completedFiles === 0) return null;
    const elapsed = (Date.now() - job.startedAt.getTime()) / 1000;
    return completedFiles / elapsed;
  }, [job.startedAt, completedFiles]);

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isProcessing && (
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
            </div>
          )}
          {isCompleted && (
            <div className="w-10 h-10 rounded-xl bg-accent-success/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-accent-success" />
            </div>
          )}
          {isCancelled && (
            <div className="w-10 h-10 rounded-xl bg-accent-warning/10 flex items-center justify-center">
              <StopCircle className="w-5 h-5 text-accent-warning" />
            </div>
          )}
          {isFailed && (
            <div className="w-10 h-10 rounded-xl bg-accent-error/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-accent-error" />
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {isProcessing && 'Processing Files...'}
              {isCompleted && 'Batch Complete'}
              {isCancelled && 'Batch Cancelled'}
              {isFailed && 'Batch Failed'}
            </h3>
            <p className="text-sm text-text-muted">
              {isProcessing && `Processing ${job.currentFileName || 'files'}...`}
              {isCompleted && `Processed ${totalFiles} files successfully`}
              {isCancelled && `Cancelled after processing ${completedFiles} of ${totalFiles} files`}
              {isFailed && job.error}
            </p>
          </div>
        </div>

        {isProcessing && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onCancel}
          >
            <StopCircle className="w-4 h-4 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      {/* Main Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Overall Progress</span>
          <span className="font-medium text-text-primary">
            {Math.round(job.progress)}%
          </span>
        </div>
        <div className="h-3 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className={`
              h-full rounded-full transition-all duration-500 ease-out
              ${isCompleted
                ? 'bg-gradient-to-r from-accent-success to-accent-success/80'
                : isFailed || isCancelled
                  ? 'bg-gradient-to-r from-accent-warning to-accent-warning/80'
                  : 'bg-gradient-to-r from-accent-primary to-accent-secondary'
              }
            `}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Files Processed */}
        <div className="p-4 rounded-xl bg-background-tertiary/50 border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-text-muted" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Processed
            </span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {completedFiles}
            <span className="text-sm font-normal text-text-muted"> / {totalFiles}</span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="p-4 rounded-xl bg-background-tertiary/50 border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-accent-success" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Success
            </span>
          </div>
          <div className="text-2xl font-bold text-accent-success">
            {successfulFiles}
            {failedFiles > 0 && (
              <span className="text-sm font-normal text-accent-error ml-2">
                ({failedFiles} failed)
              </span>
            )}
          </div>
        </div>

        {/* Time Elapsed */}
        <div className="p-4 rounded-xl bg-background-tertiary/50 border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Elapsed
            </span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {job.startedAt ? formatDuration(job.startedAt, job.completedAt) : '--'}
          </div>
        </div>

        {/* Time Remaining */}
        <div className="p-4 rounded-xl bg-background-tertiary/50 border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-accent-warning" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Remaining
            </span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {isProcessing && job.estimatedTimeRemaining
              ? formatTime(job.estimatedTimeRemaining)
              : isCompleted
                ? 'Done'
                : '--'
            }
          </div>
        </div>
      </div>

      {/* Current File Indicator */}
      {isProcessing && job.currentFileName && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-accent-primary/5 border border-accent-primary/20">
          <div className="relative">
            <Spinner size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              Currently Processing
            </p>
            <p className="text-sm text-text-muted truncate">
              {job.currentFileName}
            </p>
          </div>
          <div className="text-sm text-text-muted">
            File {job.currentFileIndex + 1} of {totalFiles}
          </div>
        </div>
      )}

      {/* File Progress List */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
          File Progress
        </h4>
        <div className="max-h-[250px] overflow-y-auto pr-2 space-y-2">
          {job.files.map((file, index) => {
            const result = job.results.find((r) => r.fileId === file.id);
            const isCurrentFile = isProcessing && index === job.currentFileIndex;
            const isProcessed = !!result;
            const hasFailed = result?.error;
            const isPending = !isProcessed && !isCurrentFile && index > job.currentFileIndex;

            return (
              <div
                key={file.id}
                className={`
                  flex items-center gap-3 p-3 rounded-lg transition-all duration-200
                  ${isCurrentFile
                    ? 'bg-accent-primary/10 border border-accent-primary/20'
                    : isProcessed
                      ? hasFailed
                        ? 'bg-accent-error/5 border border-accent-error/10'
                        : 'bg-accent-success/5 border border-accent-success/10'
                      : 'bg-background-tertiary/30 border border-transparent'
                  }
                `}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {isCurrentFile && (
                    <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />
                  )}
                  {isProcessed && !hasFailed && (
                    <CheckCircle className="w-4 h-4 text-accent-success" />
                  )}
                  {hasFailed && (
                    <XCircle className="w-4 h-4 text-accent-error" />
                  )}
                  {isPending && (
                    <div className="w-4 h-4 rounded-full border-2 border-text-muted/30" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isCurrentFile ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                    {file.name}
                  </p>
                  {result?.error && (
                    <p className="text-xs text-accent-error mt-0.5">
                      {result.error}
                    </p>
                  )}
                </div>

                {/* Processing Time */}
                {result?.processingTime && (
                  <span className="text-xs text-text-muted">
                    {(result.processingTime / 1000).toFixed(1)}s
                  </span>
                )}

                {/* Status Badge */}
                <div className="flex-shrink-0">
                  {isCurrentFile && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-primary/20 text-accent-primary">
                      Processing
                    </span>
                  )}
                  {isProcessed && !hasFailed && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-success/20 text-accent-success">
                      Complete
                    </span>
                  )}
                  {hasFailed && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-error/20 text-accent-error">
                      Failed
                    </span>
                  )}
                  {isPending && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-background-hover text-text-muted">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Processing Speed */}
      {processingSpeed && isProcessing && (
        <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Zap className="w-4 h-4" />
          <span>
            Processing at {processingSpeed.toFixed(2)} files/second
          </span>
        </div>
      )}
    </div>
  );
}

export default BatchProgressTracker;
