/**
 * SequenceSelectorPanel - Assign MRI sequences to viewport slots
 *
 * Allows users to:
 * - View detected sequences (T1, T2, FLAIR, DWI, ADC)
 * - Assign sequences to viewport slots
 * - Apply preset layouts
 */

import React from 'react';
import { useNeuroSequenceStore } from '@medai/core';
import {
  MRISequenceType,
  ViewportSlot,
  LayoutPreset,
  SEQUENCE_COLORS,
} from '@medai/core/stores/neuroSequenceTypes';
import { Panel, Button } from '@medai/ui';
import {
  Grid2X2,
  LayoutGrid,
  Layers,
  ArrowLeftRight,
  Check,
  X,
} from 'lucide-react';

interface SequenceSelectorPanelProps {
  className?: string;
}

const SLOT_LABELS: Record<ViewportSlot, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
  main: 'Main',
  secondary: 'Secondary',
};

const LAYOUT_PRESETS: Array<{
  id: LayoutPreset;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    id: 'sequence-2x2',
    label: '2×2 Grid',
    icon: <Grid2X2 className="h-4 w-4" />,
    description: 'Four sequences in grid',
  },
  {
    id: 'sequence-1x4',
    label: '1×4 Row',
    icon: <LayoutGrid className="h-4 w-4" />,
    description: 'Four sequences in row',
  },
  {
    id: 'fusion-main',
    label: 'Fusion',
    icon: <Layers className="h-4 w-4" />,
    description: 'Fused main + strip',
  },
  {
    id: 'dwi-adc-compare',
    label: 'DWI/ADC',
    icon: <ArrowLeftRight className="h-4 w-4" />,
    description: 'Side-by-side comparison',
  },
];

function SequenceTag({
  type,
  loaded,
  selected,
  onClick,
}: {
  type: MRISequenceType;
  loaded: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const color = SEQUENCE_COLORS[type];

  return (
    <button
      className={`
        px-3 py-1.5 rounded-lg text-sm font-medium transition-all
        ${loaded ? color.bg : 'bg-background-hover/50'}
        ${loaded ? color.text : 'text-text-muted'}
        ${selected ? 'ring-2 ring-white/50' : ''}
        ${loaded ? 'hover:brightness-110' : 'opacity-50 cursor-not-allowed'}
      `}
      onClick={onClick}
      disabled={!loaded}
    >
      {type}
      {loaded && (
        <Check className="h-3 w-3 ml-1 inline-block" />
      )}
    </button>
  );
}

export function SequenceSelectorPanel({ className }: SequenceSelectorPanelProps) {
  const {
    sequences,
    slotAssignments,
    layoutPreset,
    setLayoutPreset,
    assignSlot,
    clearSlot,
    getSequenceByType,
    hasAllRequiredSequences,
  } = useNeuroSequenceStore();

  const [selectedSequence, setSelectedSequence] = React.useState<MRISequenceType | null>(null);

  const sequenceTypes: MRISequenceType[] = ['T1', 'T2', 'FLAIR', 'DWI', 'ADC'];

  const handleSlotClick = (slot: ViewportSlot) => {
    if (selectedSequence) {
      const sequence = getSequenceByType(selectedSequence);
      if (sequence) {
        assignSlot(slot, sequence.id);
      }
      setSelectedSequence(null);
    }
  };

  const handleClearSlot = (slot: ViewportSlot, e: React.MouseEvent) => {
    e.stopPropagation();
    clearSlot(slot);
  };

  const getSlotSequence = (slot: ViewportSlot) => {
    const sequenceId = slotAssignments[slot];
    return sequenceId ? sequences.find((s) => s.id === sequenceId) : null;
  };

  return (
    <Panel
      title="Sequence Selector"
      className={className}
      collapsible
      actions={<Grid2X2 className="h-4 w-4 text-blue-400" />}
    >
      {/* Layout Presets */}
      <div className="mb-4">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Layout Presets
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={`
                p-2 rounded-lg border transition-all text-left
                ${layoutPreset === preset.id
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : 'bg-background-hover/50 border-border-subtle text-text-primary hover:border-white/20'}
              `}
              onClick={() => setLayoutPreset(preset.id)}
            >
              <div className="flex items-center gap-2">
                {preset.icon}
                <span className="text-sm font-medium">{preset.label}</span>
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                {preset.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Available Sequences */}
      <div className="mb-4">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Available Sequences
        </div>
        <div className="flex flex-wrap gap-2">
          {sequenceTypes.map((type) => {
            const sequence = getSequenceByType(type);
            return (
              <SequenceTag
                key={type}
                type={type}
                loaded={!!sequence}
                selected={selectedSequence === type}
                onClick={() => setSelectedSequence(selectedSequence === type ? null : type)}
              />
            );
          })}
        </div>
        {selectedSequence && (
          <div className="mt-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/30 text-xs text-blue-400">
            Click a viewport slot below to assign {selectedSequence}
          </div>
        )}
      </div>

      {/* Slot Assignments */}
      <div className="mb-4">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Viewport Slots
        </div>

        {/* 2x2 Grid preview */}
        <div className="grid grid-cols-2 gap-2">
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as ViewportSlot[]).map(
            (slot) => {
              const sequence = getSlotSequence(slot);
              const color = sequence ? SEQUENCE_COLORS[sequence.type] : null;

              return (
                <button
                  key={slot}
                  className={`
                    relative p-3 rounded-lg border-2 border-dashed transition-all
                    ${sequence
                      ? `${color?.bg} ${color?.text} border-transparent`
                      : 'bg-background-hover/30 border-border-subtle text-text-muted'}
                    ${selectedSequence ? 'hover:border-blue-400 cursor-pointer' : ''}
                  `}
                  onClick={() => handleSlotClick(slot)}
                >
                  <div className="text-xs font-medium">{SLOT_LABELS[slot]}</div>
                  <div className="text-sm font-bold mt-1">
                    {sequence?.type || 'Empty'}
                  </div>
                  {sequence && (
                    <button
                      className="absolute top-1 right-1 p-0.5 rounded bg-black/30 hover:bg-black/50 transition-colors"
                      onClick={(e) => handleClearSlot(slot, e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            // Auto-assign common neuro sequences
            const t1 = getSequenceByType('T1');
            const t2 = getSequenceByType('T2');
            const flair = getSequenceByType('FLAIR');
            const dwi = getSequenceByType('DWI');

            if (t1) assignSlot('top-left', t1.id);
            if (t2) assignSlot('top-right', t2.id);
            if (flair) assignSlot('bottom-left', flair.id);
            if (dwi) assignSlot('bottom-right', dwi.id);
          }}
        >
          Auto-Assign
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearSlot('top-left');
            clearSlot('top-right');
            clearSlot('bottom-left');
            clearSlot('bottom-right');
          }}
        >
          Clear All
        </Button>
      </div>

      {/* Sequence count */}
      <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-muted">
        {sequences.length} sequence{sequences.length !== 1 ? 's' : ''} loaded
        {!hasAllRequiredSequences(['T1', 'FLAIR']) && (
          <span className="text-amber-400 ml-2">
            (T1 + FLAIR recommended)
          </span>
        )}
      </div>
    </Panel>
  );
}

export default SequenceSelectorPanel;
