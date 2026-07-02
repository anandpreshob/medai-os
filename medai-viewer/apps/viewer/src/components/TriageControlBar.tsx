/**
 * TriageControlBar - Control bar for study triaging functionality
 *
 * Provides:
 * - "AI Triage Studies" button to trigger prioritization
 * - Toggle between Date Order and AI Triaged views
 * - Statistics badges showing STAT/URGENT/ROUTINE counts
 */

import React from 'react';
import { Sparkles, Calendar, SortDesc, AlertTriangle, Clock, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import { useTriageStore, type ViewMode } from '@medai/core';

interface TriageControlBarProps {
  onTriageClick: () => void;
  disabled?: boolean;
  studyCount: number;
  statusMessage?: string | null;
}

export function TriageControlBar({
  onTriageClick,
  disabled = false,
  studyCount,
  statusMessage,
}: TriageControlBarProps) {
  const {
    isTriaging,
    viewMode,
    setViewMode,
    stats,
    triageError,
    clearManualOrder,
  } = useTriageStore();

  const hasTriageResults = stats.totalProcessed > 0;

  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-background-tertiary/40 border border-border-subtle rounded-xl">
      {/* Left side: Triage button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onTriageClick}
          disabled={disabled || isTriaging || studyCount === 0}
          className={`
            flex items-center gap-2 px-4 py-2.5
            bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed
            text-white font-semibold text-sm
            rounded-xl shadow-lg shadow-purple-500/20
            hover:shadow-purple-500/30
            transition-all duration-200
            btn-shine
          `}
        >
          {isTriaging ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Triaging...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>AI Triage Studies</span>
            </>
          )}
        </button>

        {/* Reset manual order button */}
        {hasTriageResults && (
          <button
            onClick={clearManualOrder}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-muted hover:text-text-primary bg-background-tertiary/50 hover:bg-background-hover border border-border-subtle rounded-lg transition-colors"
            title="Reset to AI order"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Order
          </button>
        )}

        {/* Detection/triage status message */}
        {statusMessage && (
          <span className="text-xs text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg animate-pulse">
            {statusMessage}
          </span>
        )}

        {/* Error indicator */}
        {triageError && (
          <span className="text-xs text-accent-error bg-accent-error/10 px-2 py-1 rounded-lg">
            {triageError}
          </span>
        )}
      </div>

      {/* Center: View mode toggle */}
      <div className="flex items-center gap-1 bg-background-tertiary/60 rounded-xl p-1 border border-border-subtle/50">
        <ViewModeButton
          mode="date"
          currentMode={viewMode}
          onClick={() => setViewMode('date')}
          icon={Calendar}
          label="Date Order"
        />
        <ViewModeButton
          mode="triaged"
          currentMode={viewMode}
          onClick={() => setViewMode('triaged')}
          icon={SortDesc}
          label="AI Triaged"
          disabled={!hasTriageResults}
        />
      </div>

      {/* Right side: Statistics */}
      {hasTriageResults && (
        <div className="flex items-center gap-2">
          <StatBadge
            count={stats.statCount}
            label="STAT"
            color="red"
            icon={AlertTriangle}
          />
          <StatBadge
            count={stats.urgentCount}
            label="Urgent"
            color="orange"
            icon={Clock}
          />
          <StatBadge
            count={stats.routineCount}
            label="Routine"
            color="green"
            icon={CheckCircle}
          />
        </div>
      )}
    </div>
  );
}

interface ViewModeButtonProps {
  mode: ViewMode;
  currentMode: ViewMode;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
}

function ViewModeButton({
  mode,
  currentMode,
  onClick,
  icon: Icon,
  label,
  disabled = false,
}: ViewModeButtonProps) {
  const isActive = mode === currentMode;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-1.5 px-3 py-1.5
        rounded-lg text-sm font-medium
        transition-all duration-200
        ${isActive
          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
          : 'text-text-muted hover:text-text-primary hover:bg-background-hover border border-transparent'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}

interface StatBadgeProps {
  count: number;
  label: string;
  color: 'red' | 'orange' | 'yellow' | 'green';
  icon: React.ComponentType<{ className?: string }>;
}

const COLOR_CLASSES = {
  red: {
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },
  orange: {
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
  },
  yellow: {
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
  green: {
    bg: 'bg-green-500/15',
    text: 'text-green-400',
    border: 'border-green-500/30',
  },
};

function StatBadge({ count, label, color, icon: Icon }: StatBadgeProps) {
  const colors = COLOR_CLASSES[color];

  if (count === 0) return null;

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5
        ${colors.bg} ${colors.text}
        border ${colors.border}
        rounded-lg text-xs font-semibold
      `}
      title={`${count} ${label} studies`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{count}</span>
      <span className="text-[10px] opacity-75">{label}</span>
    </div>
  );
}

export default TriageControlBar;
