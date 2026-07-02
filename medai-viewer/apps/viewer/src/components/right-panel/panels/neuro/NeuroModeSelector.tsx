/**
 * NeuroModeSelector - Mode toggle for neurology workflows
 *
 * Allows switching between:
 * - General Neuro
 * - MS Protocol
 * - Dementia Assessment
 * - Stroke Evaluation
 */

import React from 'react';
import { useNeuroModeStore } from '@medai/core';
import { NEURO_MODE_CONFIGS, NeuroMode } from '@medai/core/stores/neuroModeTypes';
import { Brain, Activity, TrendingDown, AlertTriangle } from 'lucide-react';

interface NeuroModeSelectorProps {
  compact?: boolean;
}

const MODE_ICONS: Record<NeuroMode, React.ReactNode> = {
  general: <Brain className="h-4 w-4" />,
  ms_protocol: <Activity className="h-4 w-4" />,
  dementia: <TrendingDown className="h-4 w-4" />,
  stroke: <AlertTriangle className="h-4 w-4" />,
};

const MODE_COLORS: Record<NeuroMode, string> = {
  general: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  ms_protocol: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  dementia: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  stroke: 'bg-red-500/20 text-red-400 border-red-500/50',
};

export function NeuroModeSelector({ compact = false }: NeuroModeSelectorProps) {
  const { activeMode, setMode } = useNeuroModeStore();
  const modes = Object.values(NEURO_MODE_CONFIGS);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setMode(mode.id)}
            className={`
              p-2 rounded-md border transition-all
              ${
                activeMode === mode.id
                  ? MODE_COLORS[mode.id]
                  : 'bg-background-hover border-border-subtle text-text-muted hover:text-text-primary'
              }
            `}
            title={mode.name}
          >
            {MODE_ICONS[mode.id]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-text-muted uppercase tracking-wide">
        Workflow Mode
      </div>
      <div className="grid grid-cols-2 gap-2">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setMode(mode.id)}
            className={`
              flex items-center gap-2 p-2.5 rounded-lg border transition-all text-left
              ${
                activeMode === mode.id
                  ? MODE_COLORS[mode.id] + ' border-2'
                  : 'bg-background-hover border-border-subtle text-text-muted hover:text-text-primary hover:bg-background-hover/80'
              }
            `}
          >
            {MODE_ICONS[mode.id]}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{mode.name}</div>
              {activeMode === mode.id && (
                <div className="text-xs opacity-75 truncate">{mode.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default NeuroModeSelector;
