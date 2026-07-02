/**
 * TopChangesPanel - Highlight significant longitudinal changes
 *
 * Shows top interval changes for neuro studies:
 * - New lesions
 * - Enlarging lesions
 * - Resolved lesions
 * - Atrophy changes
 */

import React, { useMemo } from 'react';
import { useNeuroModeStore, useLesionCorrespondenceStore } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  AlertTriangle,
  ArrowRight,
  Eye,
} from 'lucide-react';

interface TopChangesPanelProps {
  sessionId?: string;
  className?: string;
  onNavigateToLesion?: (lesionId: string) => void;
}

interface ChangeItem {
  id: string;
  type: 'new' | 'enlarging' | 'resolved' | 'shrinking' | 'atrophy';
  label: string;
  details: string;
  severity: 'high' | 'medium' | 'low';
  volumeChange?: number;
  percentChange?: number;
}

const CHANGE_TYPE_CONFIG: Record<
  ChangeItem['type'],
  { color: string; bgColor: string; icon: React.ReactNode }
> = {
  new: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: <Plus className="h-4 w-4" />,
  },
  enlarging: {
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    icon: <TrendingUp className="h-4 w-4" />,
  },
  resolved: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: <Minus className="h-4 w-4" />,
  },
  shrinking: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: <TrendingDown className="h-4 w-4" />,
  },
  atrophy: {
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    icon: <TrendingDown className="h-4 w-4" />,
  },
};

function ChangeItemRow({
  item,
  onNavigate,
}: {
  item: ChangeItem;
  onNavigate?: () => void;
}) {
  const config = CHANGE_TYPE_CONFIG[item.type];

  return (
    <div
      className={`p-2 rounded-lg ${config.bgColor} border border-transparent hover:border-white/10 transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className={config.color}>{config.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">
                {item.label}
              </span>
              {item.severity === 'high' && (
                <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />
              )}
            </div>
            <div className="text-xs text-text-muted mt-0.5">{item.details}</div>
          </div>
        </div>

        {(item.volumeChange !== undefined || item.percentChange !== undefined) && (
          <div className="text-right flex-shrink-0">
            {item.percentChange !== undefined && (
              <div className={`text-sm font-bold ${config.color}`}>
                {item.percentChange > 0 ? '+' : ''}
                {item.percentChange.toFixed(1)}%
              </div>
            )}
            {item.volumeChange !== undefined && (
              <div className="text-xs text-text-muted">
                {item.volumeChange > 0 ? '+' : ''}
                {item.volumeChange.toFixed(2)} mL
              </div>
            )}
          </div>
        )}
      </div>

      {onNavigate && (
        <button
          className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors py-1"
          onClick={onNavigate}
        >
          <Eye className="h-3 w-3" />
          Navigate to location
        </button>
      )}
    </div>
  );
}

export function TopChangesPanel({
  sessionId,
  className,
  onNavigateToLesion,
}: TopChangesPanelProps) {
  const { atrophyAnalyses } = useNeuroModeStore();

  // Get lesion correspondence data
  const correspondences = useLesionCorrespondenceStore((state) =>
    sessionId ? state.getCorrespondences(sessionId) : []
  );
  const statistics = useLesionCorrespondenceStore((state) =>
    sessionId ? state.getStatistics(sessionId) : null
  );

  // Compile top changes
  const changes = useMemo(() => {
    const items: ChangeItem[] = [];

    // New lesions
    correspondences
      .filter((c) => {
        const instances = Array.from(c.instances.values());
        return instances.length === 1 && instances[0].timepointId !== 'baseline';
      })
      .slice(0, 3)
      .forEach((c) => {
        const instance = Array.from(c.instances.values())[0];
        items.push({
          id: c.id,
          type: 'new',
          label: 'New Lesion',
          details: `${instance.volumeMl?.toFixed(2) || '?'} mL`,
          severity: (instance.volumeMl || 0) > 0.5 ? 'high' : 'medium',
          volumeChange: instance.volumeMl,
        });
      });

    // Enlarging lesions (>20% increase)
    correspondences
      .filter((c) => {
        const instances = Array.from(c.instances.values());
        if (instances.length < 2) return false;

        const sorted = [...instances].sort((a, b) =>
          a.timepointId.localeCompare(b.timepointId)
        );
        const baseline = sorted[0];
        const latest = sorted[sorted.length - 1];

        if (baseline.volumeMl && latest.volumeMl) {
          return (latest.volumeMl - baseline.volumeMl) / baseline.volumeMl > 0.2;
        }
        return false;
      })
      .slice(0, 3)
      .forEach((c) => {
        const instances = Array.from(c.instances.values());
        const sorted = [...instances].sort((a, b) =>
          a.timepointId.localeCompare(b.timepointId)
        );
        const baseline = sorted[0];
        const latest = sorted[sorted.length - 1];
        const percentChange =
          ((latest.volumeMl! - baseline.volumeMl!) / baseline.volumeMl!) * 100;

        items.push({
          id: c.id,
          type: 'enlarging',
          label: 'Enlarging Lesion',
          details: `${baseline.volumeMl?.toFixed(2)} → ${latest.volumeMl?.toFixed(2)} mL`,
          severity: percentChange > 50 ? 'high' : 'medium',
          volumeChange: latest.volumeMl! - baseline.volumeMl!,
          percentChange,
        });
      });

    // Resolved lesions
    correspondences
      .filter((c) => {
        const instances = Array.from(c.instances.values());
        return instances.length === 1 && instances[0].timepointId === 'baseline';
      })
      .slice(0, 2)
      .forEach((c) => {
        const instance = Array.from(c.instances.values())[0];
        items.push({
          id: c.id,
          type: 'resolved',
          label: 'Resolved Lesion',
          details: `Was ${instance.volumeMl?.toFixed(2) || '?'} mL`,
          severity: 'low',
          volumeChange: -(instance.volumeMl || 0),
        });
      });

    // Atrophy changes
    atrophyAnalyses
      .filter((a) => a.interpretation !== 'normal')
      .slice(0, 2)
      .forEach((a) => {
        items.push({
          id: `atrophy-${a.region}`,
          type: 'atrophy',
          label: `${a.region} Atrophy`,
          details: `${a.annualizedRate.toFixed(2)}%/year (${a.interpretation})`,
          severity: a.interpretation === 'pathological' ? 'high' : 'medium',
          percentChange: -a.annualizedRate,
        });
      });

    // Sort by severity
    return items.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [correspondences, atrophyAnalyses]);

  const hasData = changes.length > 0 || statistics !== null;

  if (!hasData) {
    return (
      <Panel
        title="Top Changes"
        className={className}
        collapsible
        defaultCollapsed
        actions={<TrendingUp className="h-4 w-4 text-text-muted" />}
      >
        <div className="text-center py-4">
          <TrendingUp className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No longitudinal data.</p>
          <p className="text-text-muted text-xs mt-1">
            Load baseline and follow-up studies to track changes.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Top Changes"
      className={className}
      collapsible
      badge={changes.filter((c) => c.severity === 'high').length || undefined}
      actions={
        changes.some((c) => c.severity === 'high') ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : (
          <TrendingUp className="h-4 w-4 text-orange-400" />
        )
      }
    >
      {/* Summary */}
      {statistics && (
        <div className="mb-4 p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-red-400">
                {statistics.newLesionCount}
              </div>
              <div className="text-xs text-text-muted">New</div>
            </div>
            <div>
              <div className="text-lg font-bold text-orange-400">
                {
                  correspondences.filter((c) => {
                    const instances = Array.from(c.instances.values());
                    if (instances.length < 2) return false;
                    const sorted = [...instances].sort((a, b) =>
                      a.timepointId.localeCompare(b.timepointId)
                    );
                    const baseline = sorted[0];
                    const latest = sorted[sorted.length - 1];
                    if (baseline.volumeMl && latest.volumeMl) {
                      return (
                        (latest.volumeMl - baseline.volumeMl) / baseline.volumeMl > 0.2
                      );
                    }
                    return false;
                  }).length
                }
              </div>
              <div className="text-xs text-text-muted">Enlarging</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-400">
                {statistics.resolvedLesionCount}
              </div>
              <div className="text-xs text-text-muted">Resolved</div>
            </div>
          </div>
        </div>
      )}

      {/* Change list */}
      {changes.length > 0 ? (
        <div className="space-y-2">
          {changes.map((item) => (
            <ChangeItemRow
              key={item.id}
              item={item}
              onNavigate={
                item.type !== 'atrophy' && onNavigateToLesion
                  ? () => onNavigateToLesion(item.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-text-muted text-sm">
          No significant changes detected.
        </div>
      )}

      {/* View all link */}
      {correspondences.length > 5 && (
        <Button variant="ghost" size="sm" className="w-full mt-3">
          View all {correspondences.length} tracked lesions
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}
    </Panel>
  );
}

export default TopChangesPanel;
