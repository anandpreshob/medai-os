/**
 * BatchResultsGrid - Review grid for batch processing results
 *
 * Features:
 * - Grid of results with thumbnails
 * - Accept/Reject buttons per result
 * - Bulk accept/reject actions
 * - Click to view full result
 * - Filter by accepted/rejected/pending
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Check,
  X,
  Eye,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  Percent,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@medai/ui';
import {
  useBatchProcessingStore,
  type BatchResult,
  type BatchResultStatus,
} from '@medai/core';

interface ResultDetailModalProps {
  result: BatchResult;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * Modal for viewing result details
 */
function ResultDetailModal({ result, onClose, onAccept, onReject }: ResultDetailModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-background-secondary border border-border-default rounded-2xl shadow-2xl w-[600px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary">{result.fileName}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-background-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Preview */}
          <div className="aspect-video bg-background-tertiary rounded-xl flex items-center justify-center">
            {result.thumbnailUrl ? (
              <img
                src={result.thumbnailUrl}
                alt={result.fileName}
                className="max-w-full max-h-full object-contain rounded-xl"
              />
            ) : result.maskUrl ? (
              <img
                src={result.maskUrl}
                alt="Segmentation mask"
                className="max-w-full max-h-full object-contain rounded-xl"
              />
            ) : (
              <div className="text-text-muted text-center">
                <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Preview not available</p>
              </div>
            )}
          </div>

          {/* Labels */}
          {result.labels && result.labels.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
                Detected Segments
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.labels.map((label, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-tertiary border border-border-subtle"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm text-text-primary">{label.name}</span>
                    {label.count !== undefined && (
                      <span className="text-xs text-text-muted">({label.count})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {result.confidence !== undefined && (
              <div className="p-3 rounded-lg bg-background-tertiary/50 border border-border-subtle">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-text-muted" />
                  <span className="text-xs text-text-muted">Confidence</span>
                </div>
                <p className="text-lg font-semibold text-text-primary">
                  {(result.confidence * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {result.processingTime !== undefined && (
              <div className="p-3 rounded-lg bg-background-tertiary/50 border border-border-subtle">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-text-muted" />
                  <span className="text-xs text-text-muted">Processing Time</span>
                </div>
                <p className="text-lg font-semibold text-text-primary">
                  {(result.processingTime / 1000).toFixed(2)}s
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {result.error && (
            <div className="p-3 rounded-lg bg-accent-error/10 border border-accent-error/20">
              <p className="text-sm text-accent-error">{result.error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {result.status !== 'rejected' && (
            <Button variant="destructive" onClick={onReject}>
              <X className="w-4 h-4 mr-1.5" />
              Reject
            </Button>
          )}
          {result.status !== 'accepted' && (
            <Button variant="success" onClick={onAccept}>
              <Check className="w-4 h-4 mr-1.5" />
              Accept
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function BatchResultsGrid() {
  const [selectedResult, setSelectedResult] = useState<BatchResult | null>(null);

  // Store state
  const {
    currentJob,
    filterStatus,
    setFilterStatus,
    acceptResult,
    rejectResult,
    acceptAllResults,
    rejectAllResults,
    getFilteredResults,
    getResultStats,
  } = useBatchProcessingStore();

  const filteredResults = getFilteredResults();
  const stats = getResultStats();

  /**
   * Handle accept result
   */
  const handleAccept = useCallback((resultId: string) => {
    acceptResult(resultId);
  }, [acceptResult]);

  /**
   * Handle reject result
   */
  const handleReject = useCallback((resultId: string) => {
    rejectResult(resultId);
  }, [rejectResult]);

  /**
   * Get status icon
   */
  const getStatusIcon = (status: BatchResultStatus) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-accent-success" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-accent-error" />;
      default:
        return <Clock className="w-4 h-4 text-text-muted" />;
    }
  };

  /**
   * Get status color classes
   */
  const getStatusClasses = (status: BatchResultStatus) => {
    switch (status) {
      case 'accepted':
        return 'border-accent-success/30 bg-accent-success/5';
      case 'rejected':
        return 'border-accent-error/30 bg-accent-error/5';
      default:
        return 'border-border-subtle bg-background-tertiary/30';
    }
  };

  const filterOptions: Array<{ value: BatchResultStatus | 'all'; label: string; count: number }> = [
    { value: 'all', label: 'All Results', count: stats.total },
    { value: 'pending', label: 'Pending Review', count: stats.pending },
    { value: 'accepted', label: 'Accepted', count: stats.accepted },
    { value: 'rejected', label: 'Rejected', count: stats.rejected },
  ];

  return (
    <div className="space-y-4">
      {/* Header with Filter and Bulk Actions */}
      <div className="flex items-center justify-between">
        {/* Filter Dropdown */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as BatchResultStatus | 'all')}
              className="
                appearance-none px-4 py-2 pr-10 rounded-lg
                bg-background-tertiary border border-border-subtle
                text-text-primary text-sm
                focus:outline-none focus:border-accent-primary/40
                transition-colors cursor-pointer
              "
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          </div>

          {/* Results Count */}
          <span className="text-sm text-text-muted">
            Showing {filteredResults.length} results
          </span>
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          {stats.pending > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={acceptAllResults}
                className="text-accent-success"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Accept All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={rejectAllResults}
                className="text-accent-error"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject All
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-background-tertiary/50 border border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent-success" />
          <span className="text-sm text-text-primary">{stats.accepted} Accepted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent-error" />
          <span className="text-sm text-text-primary">{stats.rejected} Rejected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-text-muted" />
          <span className="text-sm text-text-primary">{stats.pending} Pending</span>
        </div>

        {/* Progress indicator */}
        <div className="flex-1 h-2 bg-background-tertiary rounded-full overflow-hidden ml-4">
          <div className="h-full flex">
            <div
              className="bg-accent-success transition-all duration-300"
              style={{ width: `${stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0}%` }}
            />
            <div
              className="bg-accent-error transition-all duration-300"
              style={{ width: `${stats.total > 0 ? (stats.rejected / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-3 gap-4 max-h-[450px] overflow-y-auto pr-2">
        {filteredResults.map((result) => (
          <div
            key={result.id}
            className={`
              group relative rounded-xl border-2 transition-all duration-200
              hover:shadow-lg cursor-pointer
              ${getStatusClasses(result.status)}
            `}
          >
            {/* Status Badge */}
            <div className="absolute top-2 left-2 z-10">
              <div className={`
                flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                ${result.status === 'accepted'
                  ? 'bg-accent-success/20 text-accent-success'
                  : result.status === 'rejected'
                    ? 'bg-accent-error/20 text-accent-error'
                    : 'bg-background-hover text-text-muted'
                }
              `}>
                {getStatusIcon(result.status)}
                <span className="capitalize">{result.status}</span>
              </div>
            </div>

            {/* Thumbnail */}
            <div
              className="aspect-video bg-background-tertiary rounded-t-xl flex items-center justify-center overflow-hidden"
              onClick={() => setSelectedResult(result)}
            >
              {result.thumbnailUrl ? (
                <img
                  src={result.thumbnailUrl}
                  alt={result.fileName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Layers className="w-8 h-8 text-text-muted/30" />
              )}

              {/* View Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-sm font-medium">
                  <Eye className="w-4 h-4" />
                  View Details
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              <p className="text-sm font-medium text-text-primary truncate mb-2" title={result.fileName}>
                {result.fileName}
              </p>

              {/* Labels Preview */}
              {result.labels && result.labels.length > 0 && (
                <div className="flex items-center gap-1 mb-3">
                  {result.labels.slice(0, 3).map((label, idx) => (
                    <div
                      key={idx}
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: label.color }}
                      title={label.name}
                    />
                  ))}
                  {result.labels.length > 3 && (
                    <span className="text-xs text-text-muted ml-1">
                      +{result.labels.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Confidence */}
              {result.confidence !== undefined && (
                <div className="flex items-center gap-1 text-xs text-text-muted mb-3">
                  <Percent className="w-3 h-3" />
                  <span>Confidence: {(result.confidence * 100).toFixed(0)}%</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {result.status !== 'accepted' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAccept(result.id);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Accept
                  </button>
                )}
                {result.status !== 'rejected' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReject(result.id);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-error/10 text-accent-error hover:bg-accent-error/20 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredResults.length === 0 && (
        <div className="py-12 text-center">
          <Layers className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No results found</p>
          <p className="text-sm text-text-muted mt-1">
            {filterStatus === 'all'
              ? 'Results will appear here after processing'
              : `No ${filterStatus} results to display`
            }
          </p>
          {filterStatus !== 'all' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterStatus('all')}
              className="mt-3"
            >
              Show All Results
            </Button>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedResult && (
        <ResultDetailModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onAccept={() => {
            handleAccept(selectedResult.id);
            setSelectedResult(null);
          }}
          onReject={() => {
            handleReject(selectedResult.id);
            setSelectedResult(null);
          }}
        />
      )}
    </div>
  );
}

export default BatchResultsGrid;
