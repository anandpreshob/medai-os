/**
 * LesionCorrespondencePanel - UI for managing lesion correspondences across timepoints
 *
 * Features:
 * - View and manage lesion matches
 * - Confirm or reject automatic matches
 * - Create manual correspondences
 * - View match confidence scores
 * - Trigger registration and re-matching
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Link2,
  Unlink,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Target,
  Activity,
  Layers,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  GitMerge,
  GitBranch,
  BarChart3,
  Shield,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import {
  useLesionCorrespondenceStore,
  useActiveSession,
  useLongitudinalStore,
  type LesionCorrespondence,
  type LesionCorrespondenceStatus,
  type LesionMatchMethod,
  type LesionMatchingStatistics,
  getStatusColor,
  getStatusLabel,
  getMatchMethodLabel,
  MATCH_CONFIG,
} from '@medai/core';

/**
 * Get icon for correspondence status.
 */
function StatusIcon({ status }: { status: LesionCorrespondenceStatus }) {
  switch (status) {
    case 'confirmed':
      return <ShieldCheck className="w-4 h-4 text-green-400" />;
    case 'pending':
      return <Shield className="w-4 h-4 text-yellow-400" />;
    case 'rejected':
      return <ShieldX className="w-4 h-4 text-red-400" />;
    default:
      return <Shield className="w-4 h-4 text-gray-400" />;
  }
}

/**
 * Confidence badge component.
 */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  let colorClass = 'text-gray-400 bg-gray-500/10 border-gray-500/30';

  if (confidence >= MATCH_CONFIG.highConfidenceThreshold) {
    colorClass = 'text-green-400 bg-green-500/10 border-green-500/30';
  } else if (confidence >= 0.5) {
    colorClass = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
  } else {
    colorClass = 'text-red-400 bg-red-500/10 border-red-500/30';
  }

  return (
    <span className={`px-2 py-0.5 text-2xs font-mono rounded border ${colorClass}`}>
      {percentage}%
    </span>
  );
}

/**
 * Method badge component.
 */
function MethodBadge({ method }: { method: LesionMatchMethod }) {
  const colorMap: Record<LesionMatchMethod, string> = {
    label: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    centroid: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    registration: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    manual: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  };

  return (
    <span className={`px-2 py-0.5 text-2xs rounded border ${colorMap[method]}`}>
      {getMatchMethodLabel(method)}
    </span>
  );
}

/**
 * Single correspondence row component.
 */
interface CorrespondenceRowProps {
  correspondence: LesionCorrespondence;
  sessionId: string;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  timepointLabels: Record<string, string>;
}

function CorrespondenceRow({
  correspondence,
  sessionId,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  timepointLabels,
}: CorrespondenceRowProps) {
  const {
    confirmCorrespondence,
    rejectCorrespondence,
    resetCorrespondenceStatus,
    removeCorrespondence,
  } = useLesionCorrespondenceStore();

  const instanceCount = correspondence.instances.size;
  const instances = Array.from(correspondence.instances.entries());

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    confirmCorrespondence(sessionId, correspondence.id);
  };

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    rejectCorrespondence(sessionId, correspondence.id);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetCorrespondenceStatus(sessionId, correspondence.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Remove this correspondence? Lesions will be moved to unmatched.')) {
      removeCorrespondence(sessionId, correspondence.id);
    }
  };

  return (
    <div
      className={`border rounded-lg transition-colors ${
        isSelected
          ? 'border-accent-primary bg-accent-primary/5'
          : 'border-border-subtle hover:border-border-hover'
      }`}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer"
        onClick={onSelect}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="text-text-muted hover:text-text-primary"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Status icon */}
        <StatusIcon status={correspondence.status} />

        {/* Label */}
        <span className="flex-1 text-sm font-medium text-text-primary truncate">
          {correspondence.canonicalLabel}
        </span>

        {/* Timepoint count */}
        <span className="text-2xs text-text-muted">
          {instanceCount} timepoint{instanceCount !== 1 ? 's' : ''}
        </span>

        {/* Confidence */}
        <ConfidenceBadge confidence={correspondence.matchConfidence} />

        {/* Method badge */}
        <MethodBadge method={correspondence.matchMethod} />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Instances list */}
          <div className="space-y-1.5">
            {instances.map(([timepointId, instance]) => (
              <div
                key={timepointId}
                className="flex items-center gap-2 p-2 bg-background-tertiary/30 rounded text-xs"
              >
                <Layers className="w-3 h-3 text-text-muted" />
                <span className="text-text-muted">
                  {timepointLabels[timepointId] || timepointId}:
                </span>
                <span className="text-text-secondary flex-1 truncate">
                  {instance.label}
                </span>
                <span className="text-text-muted font-mono">
                  {(instance.volumeMm3 / 1000).toFixed(2)} cm³
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
            {correspondence.status === 'pending' && (
              <>
                <button
                  onClick={handleConfirm}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Confirm
                </button>
                <button
                  onClick={handleReject}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors"
                >
                  <X className="w-3 h-3" />
                  Reject
                </button>
              </>
            )}

            {correspondence.status !== 'pending' && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary bg-background-tertiary hover:bg-background-hover rounded transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reset
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Statistics summary component.
 */
function StatisticsSummary({ statistics }: { statistics: LesionMatchingStatistics | null }) {
  if (!statistics) return null;

  return (
    <div className="grid grid-cols-3 gap-2 p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle">
      <div className="text-center">
        <div className="text-lg font-semibold text-text-primary">
          {statistics.matchedCount}
        </div>
        <div className="text-2xs text-text-muted">Matched</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-green-400">
          {statistics.resolvedLesionCount}
        </div>
        <div className="text-2xs text-text-muted">Resolved</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-red-400">
          {statistics.newLesionCount}
        </div>
        <div className="text-2xs text-text-muted">New</div>
      </div>

      {/* Status breakdown */}
      <div className="col-span-3 pt-2 mt-2 border-t border-border-subtle">
        <div className="flex items-center justify-around text-xs">
          <span className="text-green-400">
            {statistics.countByStatus.confirmed} confirmed
          </span>
          <span className="text-yellow-400">
            {statistics.countByStatus.pending} pending
          </span>
          <span className="text-red-400">
            {statistics.countByStatus.rejected} rejected
          </span>
        </div>
      </div>

      {/* Average confidence */}
      <div className="col-span-3 pt-2 mt-2 border-t border-border-subtle text-center">
        <span className="text-xs text-text-muted">Avg. Confidence: </span>
        <span className="text-xs font-mono text-text-primary">
          {Math.round(statistics.averageConfidence * 100)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Filter tabs component.
 */
type FilterTab = 'all' | 'pending' | 'confirmed' | 'rejected';

interface FilterTabsProps {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  counts: Record<FilterTab, number>;
}

function FilterTabs({ activeTab, onTabChange, counts }: FilterTabsProps) {
  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="flex gap-1 p-1 bg-background-tertiary/50 rounded-lg">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
            activeTab === tab.id
              ? 'bg-background-primary text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {tab.label}
          {counts[tab.id] > 0 && (
            <span className="ml-1 text-2xs opacity-60">({counts[tab.id]})</span>
          )}
        </button>
      ))}
    </div>
  );
}

interface LesionCorrespondencePanelProps {
  className?: string;
}

export function LesionCorrespondencePanel({ className = '' }: LesionCorrespondencePanelProps) {
  const session = useActiveSession();
  const sessionId = session?.id || '';

  const {
    getCorrespondences,
    getStatistics,
    confirmHighConfidence,
    clearSessionCorrespondences,
    selectedCorrespondenceId,
    selectCorrespondence,
    isMatching,
    matchingError,
  } = useLesionCorrespondenceStore();

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Get correspondences and statistics
  const correspondences = useMemo(() => {
    if (!sessionId) return [];
    return getCorrespondences(sessionId);
  }, [sessionId, getCorrespondences]);

  const statistics = useMemo(() => {
    if (!sessionId) return null;
    return getStatistics(sessionId);
  }, [sessionId, getStatistics]);

  // Get timepoint labels
  const timepointLabels = useMemo(() => {
    if (!session) return {};
    const labels: Record<string, string> = {};
    session.timepoints.forEach((tp) => {
      labels[tp.id] = tp.label;
    });
    return labels;
  }, [session]);

  // Filter correspondences
  const filteredCorrespondences = useMemo(() => {
    if (filterTab === 'all') return correspondences;
    return correspondences.filter((c) => c.status === filterTab);
  }, [correspondences, filterTab]);

  // Count by status
  const counts = useMemo(() => {
    const result: Record<FilterTab, number> = {
      all: correspondences.length,
      pending: 0,
      confirmed: 0,
      rejected: 0,
    };

    correspondences.forEach((c) => {
      result[c.status]++;
    });

    return result;
  }, [correspondences]);

  // Toggle expansion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Auto-confirm high confidence
  const handleAutoConfirm = useCallback(() => {
    if (!sessionId) return;
    const count = confirmHighConfidence(sessionId);
    console.log(`Auto-confirmed ${count} correspondences`);
  }, [sessionId, confirmHighConfidence]);

  // Clear all
  const handleClearAll = useCallback(() => {
    if (!sessionId) return;
    if (confirm('Clear all correspondences? This cannot be undone.')) {
      clearSessionCorrespondences(sessionId);
    }
  }, [sessionId, clearSessionCorrespondences]);

  // Empty state
  if (!session) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <Link2 className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">No longitudinal session active</p>
        <p className="text-xs text-text-disabled mt-1">
          Start a longitudinal session to match lesions
        </p>
      </div>
    );
  }

  if (correspondences.length === 0 && !isMatching) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <GitBranch className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-sm text-text-muted">No lesion correspondences</p>
        <p className="text-xs text-text-disabled mt-1">
          Run segmentation on multiple timepoints to match lesions
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">
            Lesion Correspondence
          </span>
        </div>

        {counts.pending > 0 && (
          <span className="text-2xs text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {counts.pending} pending
          </span>
        )}
      </div>

      {/* Matching status */}
      {isMatching && (
        <div className="p-3 bg-accent-primary/10 border border-accent-primary/30 rounded-lg">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-accent-primary animate-spin" />
            <span className="text-sm text-accent-primary">Matching lesions...</span>
          </div>
        </div>
      )}

      {matchingError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Matching Error</p>
              <p className="text-xs text-text-muted mt-1">{matchingError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <StatisticsSummary statistics={statistics} />

      {/* Filter tabs */}
      <FilterTabs
        activeTab={filterTab}
        onTabChange={setFilterTab}
        counts={counts}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {counts.pending > 0 && (
          <button
            onClick={handleAutoConfirm}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors"
          >
            <Check className="w-3 h-3" />
            Auto-Confirm High Confidence
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={handleClearAll}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear All
        </button>
      </div>

      {/* Correspondence list */}
      <div className="space-y-2">
        {filteredCorrespondences.map((correspondence) => (
          <CorrespondenceRow
            key={correspondence.id}
            correspondence={correspondence}
            sessionId={sessionId}
            isSelected={selectedCorrespondenceId === correspondence.id}
            isExpanded={expandedIds.has(correspondence.id)}
            onSelect={() => selectCorrespondence(correspondence.id)}
            onToggleExpand={() => toggleExpanded(correspondence.id)}
            timepointLabels={timepointLabels}
          />
        ))}
      </div>

      {/* Empty filter state */}
      {filteredCorrespondences.length === 0 && correspondences.length > 0 && (
        <div className="p-4 text-center">
          <p className="text-sm text-text-muted">
            No {filterTab} correspondences
          </p>
        </div>
      )}
    </div>
  );
}

export default LesionCorrespondencePanel;
