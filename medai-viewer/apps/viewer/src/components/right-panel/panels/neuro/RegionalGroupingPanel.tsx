/**
 * RegionalGroupingPanel - Display volumes grouped by brain region
 *
 * Groups parcellation results into anatomical regions:
 * - Frontal, Temporal, Parietal, Occipital lobes
 * - Subcortical structures
 * - Cerebellum, Brainstem
 * - Ventricles
 * - White matter
 */

import React, { useMemo, useState } from 'react';
import { useNeuroModeStore } from '@medai/core';
import { RegionalGroup } from '@medai/core/stores/neuroModeTypes';
import { Panel } from '@medai/ui';
import { Layers, ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface RegionalGroupingPanelProps {
  className?: string;
}

interface GroupConfig {
  label: string;
  color: string;
  bgColor: string;
}

const GROUP_CONFIG: Record<RegionalGroup, GroupConfig> = {
  frontal: {
    label: 'Frontal Lobe',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  temporal: {
    label: 'Temporal Lobe',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  parietal: {
    label: 'Parietal Lobe',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  occipital: {
    label: 'Occipital Lobe',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
  },
  subcortical: {
    label: 'Subcortical',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  cerebellum: {
    label: 'Cerebellum',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  brainstem: {
    label: 'Brainstem',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  ventricles: {
    label: 'Ventricles',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  white_matter: {
    label: 'White Matter',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
  },
  other: {
    label: 'Other',
    color: 'text-text-muted',
    bgColor: 'bg-background-hover/50',
  },
};

function RegionGroupRow({
  group,
  regions,
  totalVolume,
  icvMl,
  showNormalized,
}: {
  group: RegionalGroup;
  regions: Array<{ name: string; volumeMl: number; hemisphere?: 'left' | 'right' }>;
  totalVolume: number;
  icvMl?: number;
  showNormalized: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = GROUP_CONFIG[group];

  const formatVolume = (vol: number) => {
    if (showNormalized && icvMl) {
      return `${((vol / icvMl) * 1000).toFixed(2)} /1000`;
    }
    return `${vol.toFixed(2)} mL`;
  };

  return (
    <div className={`rounded-lg ${config.bgColor} border border-transparent`}>
      <button
        className="w-full p-2 flex items-center justify-between hover:bg-white/5 rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-text-muted">({regions.length})</span>
        </div>
        <span className={`text-sm font-bold ${config.color}`}>
          {formatVolume(totalVolume)}
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {regions
            .sort((a, b) => b.volumeMl - a.volumeMl)
            .map((region, idx) => (
              <div
                key={`${region.name}-${region.hemisphere || idx}`}
                className="flex items-center justify-between py-1 px-2 bg-black/20 rounded text-xs"
              >
                <span className="text-text-primary">
                  {region.name}
                  {region.hemisphere && (
                    <span className="text-text-muted ml-1">
                      ({region.hemisphere === 'left' ? 'L' : 'R'})
                    </span>
                  )}
                </span>
                <span className="text-text-muted">
                  {formatVolume(region.volumeMl)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function RegionalGroupingPanel({ className }: RegionalGroupingPanelProps) {
  const {
    groupedRegions,
    icvData,
    showNormalizedVolumes,
    getGroupTotalVolume,
  } = useNeuroModeStore();

  // Calculate totals for each group
  const groupTotals = useMemo(() => {
    const totals: Partial<Record<RegionalGroup, number>> = {};
    const groups = Object.keys(GROUP_CONFIG) as RegionalGroup[];

    groups.forEach((group) => {
      const vol = getGroupTotalVolume(group);
      if (vol > 0) {
        totals[group] = vol;
      }
    });

    return totals;
  }, [getGroupTotalVolume]);

  // Calculate total brain volume (excluding ventricles)
  const totalBrainVolume = useMemo(() => {
    return Object.entries(groupTotals)
      .filter(([group]) => group !== 'ventricles')
      .reduce((sum, [, vol]) => sum + (vol || 0), 0);
  }, [groupTotals]);

  const hasData = Object.keys(groupTotals).length > 0;

  if (!hasData) {
    return (
      <Panel
        title="Regional Volumes"
        className={className}
        collapsible
        defaultCollapsed
        actions={<Layers className="h-4 w-4 text-text-muted" />}
      >
        <div className="text-center py-4">
          <Layers className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No regional data available.</p>
          <p className="text-text-muted text-xs mt-1">
            Run brain parcellation to compute regional volumes.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Regional Volumes"
      className={className}
      collapsible
      actions={<Layers className="h-4 w-4 text-blue-400" />}
    >
      {/* Summary */}
      <div className="mb-4 p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            Brain Volume Summary
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-text-muted">Total Brain</div>
            <div className="font-bold text-text-primary">
              {showNormalizedVolumes && icvData
                ? `${((totalBrainVolume / icvData.volumeMl) * 100).toFixed(1)}% ICV`
                : `${totalBrainVolume.toFixed(1)} mL`}
            </div>
          </div>
          {icvData && (
            <div>
              <div className="text-xs text-text-muted">ICV</div>
              <div className="font-bold text-text-primary">
                {icvData.volumeMl.toFixed(1)} mL
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Regional Groups */}
      <div className="space-y-2">
        {(Object.keys(GROUP_CONFIG) as RegionalGroup[])
          .filter((group) => groupedRegions[group]?.length > 0)
          .sort((a, b) => (groupTotals[b] || 0) - (groupTotals[a] || 0))
          .map((group) => (
            <RegionGroupRow
              key={group}
              group={group}
              regions={groupedRegions[group] || []}
              totalVolume={groupTotals[group] || 0}
              icvMl={icvData?.volumeMl}
              showNormalized={showNormalizedVolumes}
            />
          ))}
      </div>

      {/* Volume distribution bar */}
      <div className="mt-4 pt-3 border-t border-border-subtle">
        <div className="text-xs text-text-muted mb-2">Volume Distribution</div>
        <div className="h-3 rounded-full overflow-hidden flex bg-background-primary">
          {(Object.keys(GROUP_CONFIG) as RegionalGroup[])
            .filter((group) => group !== 'ventricles' && groupTotals[group])
            .sort((a, b) => (groupTotals[b] || 0) - (groupTotals[a] || 0))
            .map((group) => {
              const percent = ((groupTotals[group] || 0) / totalBrainVolume) * 100;
              const config = GROUP_CONFIG[group];
              return (
                <div
                  key={group}
                  className={config.color.replace('text-', 'bg-')}
                  style={{ width: `${percent}%` }}
                  title={`${config.label}: ${percent.toFixed(1)}%`}
                />
              );
            })}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {(Object.keys(GROUP_CONFIG) as RegionalGroup[])
            .filter((group) => group !== 'ventricles' && groupTotals[group])
            .slice(0, 5)
            .map((group) => {
              const config = GROUP_CONFIG[group];
              return (
                <div
                  key={group}
                  className={`flex items-center gap-1 text-xs ${config.color}`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${config.color.replace(
                      'text-',
                      'bg-'
                    )}`}
                  />
                  <span>{config.label}</span>
                </div>
              );
            })}
        </div>
      </div>
    </Panel>
  );
}

export default RegionalGroupingPanel;
