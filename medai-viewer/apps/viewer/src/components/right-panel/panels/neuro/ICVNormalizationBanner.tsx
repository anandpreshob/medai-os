/**
 * ICVNormalizationBanner - Display and configure ICV normalization
 *
 * Shows:
 * - Current ICV value (if computed)
 * - Toggle for normalized vs raw volumes
 * - Option to recompute ICV
 */

import React, { useState } from 'react';
import { useNeuroModeStore } from '@medai/core';
import { Brain, RefreshCw, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import { Button } from '@medai/ui';

interface ICVNormalizationBannerProps {
  onRecomputeIcv?: () => void;
  isComputing?: boolean;
}

export function ICVNormalizationBanner({
  onRecomputeIcv,
  isComputing = false,
}: ICVNormalizationBannerProps) {
  const {
    icvData,
    showNormalizedVolumes,
    toggleNormalizedVolumes,
    autoComputeIcv,
  } = useNeuroModeStore();

  const [showTooltip, setShowTooltip] = useState(false);

  const hasIcv = icvData !== null;

  return (
    <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-500/20">
            <Brain className="h-4 w-4 text-purple-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary">
              ICV Normalization
            </div>
            {hasIcv ? (
              <div className="text-xs text-text-muted">
                ICV: {icvData.volumeMl.toFixed(1)} mL
              </div>
            ) : (
              <div className="text-xs text-amber-400">
                ICV not computed
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Info tooltip */}
          <div className="relative">
            <button
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <Info className="h-4 w-4" />
            </button>
            {showTooltip && (
              <div className="absolute right-0 top-full mt-1 w-56 p-2 bg-background-secondary border border-border-subtle rounded-md shadow-lg z-10 text-xs text-text-muted">
                <p>
                  ICV normalization adjusts brain structure volumes relative to
                  total intracranial volume, enabling comparison across individuals
                  with different head sizes.
                </p>
                <p className="mt-1">
                  Values shown as mL per 1000 mL ICV.
                </p>
              </div>
            )}
          </div>

          {/* Toggle normalized */}
          {hasIcv && (
            <button
              onClick={() => toggleNormalizedVolumes()}
              className={`
                p-1.5 rounded-md transition-colors
                ${showNormalizedVolumes
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-background-hover text-text-muted hover:text-text-primary'
                }
              `}
              title={showNormalizedVolumes ? 'Showing normalized' : 'Showing raw'}
            >
              {showNormalizedVolumes ? (
                <ToggleRight className="h-4 w-4" />
              ) : (
                <ToggleLeft className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Recompute button */}
          {onRecomputeIcv && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRecomputeIcv}
              disabled={isComputing}
              className="!p-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isComputing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Normalized toggle indicator */}
      {hasIcv && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <div
            className={`
              px-2 py-0.5 rounded-full
              ${showNormalizedVolumes
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-background-hover text-text-muted'
              }
            `}
          >
            {showNormalizedVolumes ? 'Normalized' : 'Raw'} volumes
          </div>
          {icvData.method && (
            <div className="text-text-muted">
              via {icvData.method}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ICVNormalizationBanner;
