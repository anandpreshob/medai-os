/**
 * StrokePanel - Stroke evaluation workflow panel
 *
 * Provides stroke-specific features:
 * - DWI/ADC comparison layout trigger
 * - Core volume measurement
 * - Penumbra volume (if available)
 * - DWI-ADC mismatch ratio
 * - ASPECTS score (future)
 */

import React, { useMemo } from 'react';
import { useNeuroModeStore, useNeuroSequenceStore } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  AlertTriangle,
  Layers,
  Activity,
  Clock,
  ArrowLeftRight,
  Download,
} from 'lucide-react';

interface StrokePanelProps {
  className?: string;
  onSetDwiAdcLayout?: () => void;
  onExport?: () => void;
}

export function StrokePanel({
  className,
  onSetDwiAdcLayout,
  onExport,
}: StrokePanelProps) {
  const { activeMode, classifiedLesions } = useNeuroModeStore();
  const { sequences, setLayoutPreset, getSequenceByType } = useNeuroSequenceStore();

  // Check if DWI and ADC sequences are loaded
  const dwiSequence = getSequenceByType('DWI');
  const adcSequence = getSequenceByType('ADC');
  const hasBothSequences = dwiSequence && adcSequence;

  // Compute stroke metrics
  const metrics = useMemo(() => {
    // Filter for stroke lesions
    const strokeLesions = classifiedLesions.filter(
      (l) => l.label.toLowerCase().includes('stroke') ||
             l.label.toLowerCase().includes('infarct') ||
             l.label.toLowerCase().includes('dwi')
    );

    // Core volume (DWI lesion)
    const coreVolume = strokeLesions.reduce((sum, l) => sum + l.volumeMl, 0);

    // Penumbra would come from perfusion data (not implemented yet)
    const penumbraVolume = 0; // Placeholder

    // Mismatch ratio
    const mismatchRatio = penumbraVolume > 0 ? penumbraVolume / coreVolume : null;

    return {
      coreVolume,
      penumbraVolume,
      mismatchRatio,
      lesionCount: strokeLesions.length,
    };
  }, [classifiedLesions]);

  const handleSetDwiAdcLayout = () => {
    setLayoutPreset('dwi-adc-compare');
    onSetDwiAdcLayout?.();
  };

  if (activeMode !== 'stroke') {
    return null;
  }

  return (
    <Panel
      title="Stroke Evaluation"
      className={className}
      collapsible
      actions={<AlertTriangle className="h-4 w-4 text-red-400" />}
    >
      {/* Time-sensitive warning */}
      <div className="mb-4 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
        <div className="flex items-center gap-2 text-red-400">
          <Clock className="h-5 w-5" />
          <span className="font-medium">Time-Critical Assessment</span>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Treatment decisions should be made promptly based on clinical presentation
          and imaging findings.
        </p>
      </div>

      {/* DWI/ADC Layout Button */}
      {hasBothSequences ? (
        <div className="mb-4">
          <Button
            variant="primary"
            className="w-full"
            onClick={handleSetDwiAdcLayout}
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Compare DWI / ADC
          </Button>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <Layers className="h-4 w-4" />
            <span>
              {!dwiSequence && !adcSequence
                ? 'Load DWI and ADC sequences'
                : !dwiSequence
                ? 'DWI sequence not loaded'
                : 'ADC sequence not loaded'}
            </span>
          </div>
        </div>
      )}

      {/* Core Volume */}
      <div className="mb-4 p-4 bg-background-hover/50 rounded-lg border border-border-subtle">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-400" />
            <span className="text-sm font-medium text-text-primary">
              Infarct Core (DWI)
            </span>
          </div>
        </div>
        <div className="text-3xl font-bold text-red-400">
          {metrics.coreVolume.toFixed(1)}
          <span className="text-lg font-normal text-text-muted ml-1">mL</span>
        </div>
        {metrics.lesionCount > 1 && (
          <div className="text-xs text-text-muted mt-1">
            {metrics.lesionCount} distinct lesions
          </div>
        )}
      </div>

      {/* Volume thresholds reference */}
      <div className="mb-4 p-3 bg-background-hover/30 rounded-lg">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Reference Thresholds
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Small core</span>
            <span className="text-green-400">{'<'}30 mL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Medium core</span>
            <span className="text-amber-400">30-50 mL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Large core</span>
            <span className="text-red-400">{'>'}50 mL</span>
          </div>
        </div>

        {/* Core size indicator */}
        <div className="mt-2 h-2 bg-background-primary rounded-full overflow-hidden flex">
          <div className="w-[30%] bg-green-400" />
          <div className="w-[20%] bg-amber-400" />
          <div className="flex-1 bg-red-400" />
        </div>
        <div
          className="relative h-4"
          style={{ marginLeft: `${Math.min(metrics.coreVolume, 100)}%` }}
        >
          <div className="absolute -left-1 top-0 w-2 h-2 bg-white rounded-full border-2 border-background-primary" />
        </div>
      </div>

      {/* Penumbra / Mismatch (placeholder for future CTP integration) */}
      <div className="mb-4 p-3 bg-background-hover/30 rounded-lg border border-dashed border-border-subtle">
        <div className="flex items-center gap-2 text-text-muted">
          <Layers className="h-4 w-4" />
          <span className="text-sm">Penumbra Analysis</span>
        </div>
        <p className="text-xs text-text-muted mt-1">
          CT perfusion integration coming soon for mismatch analysis
        </p>
      </div>

      {/* ASPECTS (placeholder) */}
      <div className="mb-4 p-3 bg-background-hover/30 rounded-lg border border-dashed border-border-subtle">
        <div className="flex items-center gap-2 text-text-muted">
          <Activity className="h-4 w-4" />
          <span className="text-sm">ASPECTS Score</span>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Automated ASPECTS scoring coming in future release
        </p>
      </div>

      {/* Clinical note */}
      <div className="mb-4 p-2 bg-background-hover/30 rounded text-xs text-text-muted">
        <strong>Note:</strong> AI-assisted measurements are for decision support only.
        Final treatment decisions should be made by qualified physicians based on
        complete clinical assessment.
      </div>

      {/* Export */}
      <Button variant="outline" size="sm" className="w-full" onClick={onExport}>
        <Download className="h-4 w-4 mr-2" />
        Export Stroke Report
      </Button>
    </Panel>
  );
}

export default StrokePanel;
