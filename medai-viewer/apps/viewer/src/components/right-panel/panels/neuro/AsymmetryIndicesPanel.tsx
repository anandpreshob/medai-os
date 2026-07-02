/**
 * AsymmetryIndicesPanel - Display left/right asymmetry comparisons
 *
 * Shows asymmetry indices for paired brain structures with
 * interpretation and visual indicators.
 */

import React, { useMemo } from 'react';
import { useNeuroModeStore } from '@medai/core';
import { AsymmetryIndex, AsymmetryInterpretation } from '@medai/core/stores/neuroModeTypes';
import { Panel } from '@medai/ui';
import { ArrowLeftRight, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface AsymmetryIndicesPanelProps {
  className?: string;
}

const INTERPRETATION_CONFIG: Record<
  AsymmetryInterpretation,
  { color: string; bgColor: string; icon: React.ReactNode; label: string }
> = {
  normal: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: <CheckCircle className="h-3 w-3" />,
    label: 'Normal',
  },
  mild: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: <AlertCircle className="h-3 w-3" />,
    label: 'Mild',
  },
  significant: {
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    icon: <AlertTriangle className="h-3 w-3" />,
    label: 'Significant',
  },
  severe: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: <AlertTriangle className="h-3 w-3" />,
    label: 'Severe',
  },
};

function AsymmetryBar({ index }: { index: AsymmetryIndex }) {
  const config = INTERPRETATION_CONFIG[index.interpretation];
  const absAsymmetry = Math.abs(index.asymmetryPercent);
  const barWidth = Math.min(absAsymmetry * 5, 100); // Scale: 20% asymmetry = full bar
  const isLeft = index.asymmetryPercent > 0;

  return (
    <div className={`p-2 rounded-lg ${config.bgColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-text-primary">
          {index.region}
        </span>
        <div className={`flex items-center gap-1 text-xs ${config.color}`}>
          {config.icon}
          <span>{config.label}</span>
        </div>
      </div>

      {/* Volume comparison */}
      <div className="flex items-center justify-between text-xs text-text-muted mb-2">
        <span>L: {index.leftVolumeMl.toFixed(2)} mL</span>
        <span>R: {index.rightVolumeMl.toFixed(2)} mL</span>
      </div>

      {/* Asymmetry bar */}
      <div className="relative h-2 bg-background-primary rounded-full overflow-hidden">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border-subtle" />

        {/* Asymmetry indicator */}
        <div
          className={`absolute top-0 bottom-0 ${config.color.replace('text-', 'bg-')}`}
          style={{
            width: `${barWidth / 2}%`,
            [isLeft ? 'right' : 'left']: '50%',
          }}
        />
      </div>

      {/* Asymmetry value */}
      <div className="flex items-center justify-between mt-1">
        <span className={`text-xs ${config.color}`}>
          {index.asymmetryPercent > 0 ? 'Left' : 'Right'} dominant
        </span>
        <span className={`text-xs font-medium ${config.color}`}>
          {Math.abs(index.asymmetryPercent).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function AsymmetryIndicesPanel({ className }: AsymmetryIndicesPanelProps) {
  const { asymmetryIndices, asymmetryHighlightThreshold, getSignificantAsymmetries } =
    useNeuroModeStore();

  const significant = useMemo(() => getSignificantAsymmetries(), [asymmetryIndices]);

  if (asymmetryIndices.length === 0) {
    return (
      <Panel
        title="Asymmetry Indices"
        className={className}
        collapsible
        defaultCollapsed
        actions={<ArrowLeftRight className="h-4 w-4 text-text-muted" />}
      >
        <div className="text-center py-4">
          <ArrowLeftRight className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No asymmetry data available.</p>
          <p className="text-text-muted text-xs mt-1">
            Run brain parcellation to compute L/R asymmetry.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Asymmetry Indices"
      className={className}
      collapsible
      badge={significant.length > 0 ? significant.length : undefined}
      actions={
        significant.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-orange-400" />
        ) : (
          <ArrowLeftRight className="h-4 w-4 text-text-muted" />
        )
      }
    >
      {/* Summary */}
      {significant.length > 0 && (
        <div className="mb-3 p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
          <div className="flex items-center gap-2 text-orange-400 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {significant.length} region{significant.length !== 1 ? 's' : ''} with{' '}
              {'>'}
              {asymmetryHighlightThreshold}% asymmetry
            </span>
          </div>
        </div>
      )}

      {/* Asymmetry list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {/* Show significant first */}
        {significant.map((index) => (
          <AsymmetryBar key={index.region} index={index} />
        ))}

        {/* Then normal */}
        {asymmetryIndices
          .filter((ai) => !significant.includes(ai))
          .map((index) => (
            <AsymmetryBar key={index.region} index={index} />
          ))}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border-subtle">
        <div className="text-xs text-text-muted">
          Asymmetry Index = (L - R) / ((L + R) / 2) × 100
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(INTERPRETATION_CONFIG).map(([key, config]) => (
            <div
              key={key}
              className={`flex items-center gap-1 text-xs ${config.color}`}
            >
              {config.icon}
              <span>{config.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export default AsymmetryIndicesPanel;
