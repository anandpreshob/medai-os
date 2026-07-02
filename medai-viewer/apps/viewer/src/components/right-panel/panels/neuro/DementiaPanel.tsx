/**
 * DementiaPanel - Dementia assessment workflow panel
 *
 * Provides dementia-specific features:
 * - Hippocampal volume with asymmetry
 * - Ventricular volume
 * - Whole brain volume
 * - Brain parenchymal fraction
 * - Atrophy rate tracking
 */

import React, { useMemo } from 'react';
import { useNeuroModeStore } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  TrendingDown,
  Brain,
  AlertTriangle,
  Download,
  BarChart3,
} from 'lucide-react';

interface DementiaPanelProps {
  className?: string;
  onExport?: () => void;
}

export function DementiaPanel({ className, onExport }: DementiaPanelProps) {
  const {
    activeMode,
    asymmetryIndices,
    groupedRegions,
    icvData,
    atrophyAnalyses,
    showNormalizedVolumes,
    getGroupTotalVolume,
  } = useNeuroModeStore();

  // Get key dementia metrics
  const metrics = useMemo(() => {
    // Hippocampal volumes from grouped regions
    const hippocampi = groupedRegions.temporal?.filter((r) =>
      r.name.toLowerCase().includes('hippocampus')
    ) || [];

    const hippocampusLeft = hippocampi.find((h) => h.hemisphere === 'left');
    const hippocampusRight = hippocampi.find((h) => h.hemisphere === 'right');

    // Hippocampal asymmetry from computed indices
    const hippocampusAsymmetry = asymmetryIndices.find((ai) =>
      ai.region.toLowerCase().includes('hippocampus')
    );

    // Ventricular volume
    const ventricularVolume = getGroupTotalVolume('ventricles');

    // Whole brain volume (sum of all groups except ventricles)
    const brainGroups = ['frontal', 'temporal', 'parietal', 'occipital', 'subcortical', 'cerebellum', 'brainstem', 'white_matter'] as const;
    const wholeBrainVolume = brainGroups.reduce(
      (sum, group) => sum + getGroupTotalVolume(group),
      0
    );

    // Brain parenchymal fraction
    const bpf = icvData ? (wholeBrainVolume / icvData.volumeMl) * 100 : null;

    // Atrophy rates
    const hippocampalAtrophy = atrophyAnalyses.find((a) =>
      a.region.toLowerCase().includes('hippocampus')
    );
    const wholeBrainAtrophy = atrophyAnalyses.find((a) =>
      a.region.toLowerCase().includes('whole') || a.region.toLowerCase().includes('total')
    );

    return {
      hippocampusLeft: hippocampusLeft?.volumeMl || 0,
      hippocampusRight: hippocampusRight?.volumeMl || 0,
      hippocampusTotal: (hippocampusLeft?.volumeMl || 0) + (hippocampusRight?.volumeMl || 0),
      hippocampusAsymmetry: hippocampusAsymmetry?.asymmetryPercent || 0,
      hippocampusAsymmetryInterpretation: hippocampusAsymmetry?.interpretation || 'unknown',
      ventricularVolume,
      wholeBrainVolume,
      bpf,
      hippocampalAtrophy,
      wholeBrainAtrophy,
      hasAtrophyData: atrophyAnalyses.length > 0,
    };
  }, [groupedRegions, asymmetryIndices, icvData, atrophyAnalyses, getGroupTotalVolume]);

  if (activeMode !== 'dementia') {
    return null;
  }

  const formatVolume = (vol: number) => {
    if (showNormalizedVolumes && icvData) {
      return `${((vol / icvData.volumeMl) * 1000).toFixed(2)} /1000`;
    }
    return `${vol.toFixed(2)} mL`;
  };

  return (
    <Panel
      title="Dementia Assessment"
      className={className}
      collapsible
      actions={<TrendingDown className="h-4 w-4 text-blue-400" />}
    >
      {/* Hippocampal Section */}
      <div className="mb-4 p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-text-primary">Hippocampus</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="text-center">
            <div className="text-xs text-text-muted">Left</div>
            <div className="text-sm font-medium text-text-primary">
              {metrics.hippocampusLeft.toFixed(2)} mL
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-muted">Right</div>
            <div className="text-sm font-medium text-text-primary">
              {metrics.hippocampusRight.toFixed(2)} mL
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-muted">Total</div>
            <div className="text-sm font-bold text-amber-400">
              {metrics.hippocampusTotal.toFixed(2)} mL
            </div>
          </div>
        </div>

        {/* Asymmetry indicator */}
        <div
          className={`
            flex items-center justify-between p-2 rounded
            ${Math.abs(metrics.hippocampusAsymmetry) > 10
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-green-500/20 text-green-400'
            }
          `}
        >
          <span className="text-xs">Asymmetry</span>
          <span className="text-sm font-medium">
            {metrics.hippocampusAsymmetry.toFixed(1)}%
            <span className="text-xs ml-1">
              ({metrics.hippocampusAsymmetryInterpretation})
            </span>
          </span>
        </div>

        {/* Atrophy rate if available */}
        {metrics.hippocampalAtrophy && (
          <div className="mt-2 p-2 bg-background-hover/50 rounded">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Annual atrophy rate</span>
              <span
                className={
                  metrics.hippocampalAtrophy.interpretation === 'pathological'
                    ? 'text-red-400 font-medium'
                    : 'text-text-primary'
                }
              >
                {metrics.hippocampalAtrophy.annualizedRate.toFixed(2)}%/year
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="text-xs text-text-muted">Ventricular Vol</div>
          <div className="text-lg font-bold text-blue-400">
            {formatVolume(metrics.ventricularVolume)}
          </div>
        </div>
        <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="text-xs text-text-muted">Brain Vol</div>
          <div className="text-lg font-bold text-text-primary">
            {formatVolume(metrics.wholeBrainVolume)}
          </div>
        </div>
      </div>

      {/* Brain Parenchymal Fraction */}
      {metrics.bpf !== null && (
        <div className="mb-4 p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-muted">Brain Parenchymal Fraction</span>
            <span
              className={`
                text-lg font-bold
                ${metrics.bpf < 70 ? 'text-amber-400' : 'text-green-400'}
              `}
            >
              {metrics.bpf.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-background-primary rounded-full overflow-hidden">
            <div
              className={`h-full ${metrics.bpf < 70 ? 'bg-amber-400' : 'bg-green-400'}`}
              style={{ width: `${Math.min(metrics.bpf, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>Low</span>
            <span>Normal (70-85%)</span>
          </div>
        </div>
      )}

      {/* Whole Brain Atrophy */}
      {metrics.wholeBrainAtrophy && (
        <div className="mb-4 p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-sm font-medium text-text-primary">
              Whole Brain Atrophy
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-text-muted">Baseline</div>
              <div className="font-medium">
                {metrics.wholeBrainAtrophy.baselineVolumeMl.toFixed(1)} mL
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Current</div>
              <div className="font-medium">
                {metrics.wholeBrainAtrophy.currentVolumeMl.toFixed(1)} mL
              </div>
            </div>
          </div>
          <div
            className={`
              mt-2 p-2 rounded text-center
              ${metrics.wholeBrainAtrophy.interpretation === 'pathological'
                ? 'bg-red-500/20 text-red-400'
                : metrics.wholeBrainAtrophy.interpretation === 'accelerated'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-green-500/20 text-green-400'
              }
            `}
          >
            <div className="text-lg font-bold">
              {metrics.wholeBrainAtrophy.annualizedRate.toFixed(2)}%/year
            </div>
            <div className="text-xs capitalize">
              {metrics.wholeBrainAtrophy.interpretation.replace('_', ' ')}
            </div>
          </div>
        </div>
      )}

      {/* Reference ranges note */}
      <div className="mb-4 p-2 bg-background-hover/30 rounded text-xs text-text-muted">
        <p className="mb-1">
          <strong>Reference atrophy rates:</strong>
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Normal aging (20-60): 0.2-0.5%/year</li>
          <li>Normal aging (60+): 0.5-1.0%/year</li>
          <li>AD hippocampus: 3-6%/year</li>
        </ul>
      </div>

      {/* Export */}
      <Button variant="outline" size="sm" className="w-full" onClick={onExport}>
        <Download className="h-4 w-4 mr-2" />
        Export Dementia Report
      </Button>
    </Panel>
  );
}

export default DementiaPanel;
