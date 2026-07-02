/**
 * FusionControlsPanel - Multi-volume overlay and fusion controls
 *
 * Controls for:
 * - Opacity per volume
 * - Colormap selection
 * - Blend mode (additive, MIP, alpha)
 * - Registration transforms
 */

import React from 'react';
import { useNeuroSequenceStore } from '@medai/core';
import {
  BlendMode,
  ColorMapPreset,
  SEQUENCE_COLORS,
} from '@medai/core/stores/neuroSequenceTypes';
import { Panel, Button } from '@medai/ui';
import {
  Layers,
  Sliders,
  Palette,
  RefreshCw,
  Link,
  Unlink,
  Eye,
  EyeOff,
} from 'lucide-react';

interface FusionControlsPanelProps {
  className?: string;
  onRequestRegistration?: () => void;
}

const BLEND_MODES: Array<{ id: BlendMode; label: string; description: string }> = [
  { id: 'alpha', label: 'Alpha', description: 'Standard transparency blending' },
  { id: 'additive', label: 'Additive', description: 'Add pixel values together' },
  { id: 'mip', label: 'MIP', description: 'Maximum intensity projection' },
];

const COLORMAPS: Array<{ id: ColorMapPreset; label: string; gradient: string }> = [
  { id: 'grayscale', label: 'Gray', gradient: 'linear-gradient(to right, black, white)' },
  { id: 'hot', label: 'Hot', gradient: 'linear-gradient(to right, black, red, yellow, white)' },
  { id: 'cool', label: 'Cool', gradient: 'linear-gradient(to right, cyan, magenta)' },
  { id: 'jet', label: 'Jet', gradient: 'linear-gradient(to right, blue, cyan, green, yellow, red)' },
  { id: 'viridis', label: 'Viridis', gradient: 'linear-gradient(to right, #440154, #21918c, #fde725)' },
  { id: 'plasma', label: 'Plasma', gradient: 'linear-gradient(to right, #0d0887, #cc4778, #f0f921)' },
];

function OpacitySlider({
  label,
  value,
  onChange,
  color,
  visible,
  onToggleVisibility,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color?: string;
  visible: boolean;
  onToggleVisibility: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        className={`p-1 rounded transition-colors ${
          visible ? 'text-text-primary hover:text-white' : 'text-text-muted hover:text-text-secondary'
        }`}
        onClick={onToggleVisibility}
      >
        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <div
        className={`w-12 text-sm font-medium ${color || 'text-text-primary'}`}
      >
        {label}
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="flex-1 h-2 bg-background-primary rounded-lg appearance-none cursor-pointer accent-blue-400"
        disabled={!visible}
      />
      <div className="w-10 text-xs text-text-muted text-right">
        {Math.round(value * 100)}%
      </div>
    </div>
  );
}

export function FusionControlsPanel({
  className,
  onRequestRegistration,
}: FusionControlsPanelProps) {
  const {
    sequences,
    fusionSettings,
    registrationState,
    setFusionOpacity,
    setFusionColormap,
    setBlendMode,
    toggleFusionVisibility,
    setRegistrationEnabled,
  } = useNeuroSequenceStore();

  const activeSequences = sequences.filter((s) => fusionSettings.volumeIds.includes(s.id));

  if (sequences.length < 2) {
    return (
      <Panel
        title="Fusion Controls"
        className={className}
        collapsible
        defaultCollapsed
        actions={<Layers className="h-4 w-4 text-text-muted" />}
      >
        <div className="text-center py-4">
          <Layers className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">Load multiple sequences</p>
          <p className="text-text-muted text-xs mt-1">
            Fusion requires at least 2 MRI sequences.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Fusion Controls"
      className={className}
      collapsible
      actions={<Layers className="h-4 w-4 text-purple-400" />}
    >
      {/* Blend Mode */}
      <div className="mb-4">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Blend Mode
        </div>
        <div className="flex gap-2">
          {BLEND_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`
                flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all
                ${fusionSettings.blendMode === mode.id
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                  : 'bg-background-hover/50 text-text-muted border border-transparent hover:border-white/10'}
              `}
              onClick={() => setBlendMode(mode.id)}
              title={mode.description}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Volume Opacity */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="h-4 w-4 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Volume Opacity
          </span>
        </div>
        <div className="space-y-2">
          {sequences.map((seq) => {
            const opacity = fusionSettings.opacities[seq.id] ?? 1;
            const visible = fusionSettings.volumeIds.includes(seq.id);
            const colorConfig = SEQUENCE_COLORS[seq.type];

            return (
              <OpacitySlider
                key={seq.id}
                label={seq.type}
                value={opacity}
                onChange={(val) => setFusionOpacity(seq.id, val)}
                color={colorConfig?.text}
                visible={visible}
                onToggleVisibility={() => toggleFusionVisibility(seq.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Colormap per Volume */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="h-4 w-4 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Colormaps
          </span>
        </div>
        <div className="space-y-2">
          {sequences.slice(0, 2).map((seq) => {
            const currentColormap = fusionSettings.colormaps[seq.id] || 'grayscale';

            return (
              <div key={seq.id} className="flex items-center gap-2">
                <div className="w-12 text-sm font-medium text-text-primary">
                  {seq.type}
                </div>
                <div className="flex-1 flex gap-1">
                  {COLORMAPS.map((cm) => (
                    <button
                      key={cm.id}
                      className={`
                        flex-1 h-4 rounded transition-all
                        ${currentColormap === cm.id ? 'ring-2 ring-white/50' : 'opacity-70 hover:opacity-100'}
                      `}
                      style={{ background: cm.gradient }}
                      onClick={() => setFusionColormap(seq.id, cm.id)}
                      title={cm.label}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Registration */}
      <div className="mb-4 p-3 bg-background-hover/30 rounded-lg border border-border-subtle">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {registrationState.isRegistered ? (
              <Link className="h-4 w-4 text-green-400" />
            ) : (
              <Unlink className="h-4 w-4 text-text-muted" />
            )}
            <span className="text-sm font-medium text-text-primary">Registration</span>
          </div>
          <div
            className={`text-xs px-2 py-0.5 rounded ${
              registrationState.isRegistered
                ? 'bg-green-500/20 text-green-400'
                : 'bg-background-hover text-text-muted'
            }`}
          >
            {registrationState.isRegistered ? 'Registered' : 'Not registered'}
          </div>
        </div>

        {registrationState.isRegistered ? (
          <div className="space-y-2">
            <div className="text-xs text-text-muted">
              {registrationState.referenceId} → {registrationState.movingId}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={registrationState.enabled}
                onChange={(e) => setRegistrationEnabled(e.target.checked)}
                className="rounded border-border-subtle"
              />
              <span className="text-text-primary">Apply transform</span>
            </label>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onRequestRegistration}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Registration
          </Button>
        )}
      </div>

      {/* Preset Fusions */}
      <div className="pt-3 border-t border-border-subtle">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Quick Presets
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => {
              // T1 + FLAIR fusion preset
              const t1 = sequences.find((s) => s.type === 'T1');
              const flair = sequences.find((s) => s.type === 'FLAIR');
              if (t1 && flair) {
                setBlendMode('alpha');
                setFusionOpacity(t1.id, 0.5);
                setFusionOpacity(flair.id, 0.5);
                setFusionColormap(t1.id, 'grayscale');
                setFusionColormap(flair.id, 'hot');
              }
            }}
          >
            T1 + FLAIR
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => {
              // DWI + ADC preset
              const dwi = sequences.find((s) => s.type === 'DWI');
              const adc = sequences.find((s) => s.type === 'ADC');
              if (dwi && adc) {
                setBlendMode('alpha');
                setFusionOpacity(dwi.id, 0.6);
                setFusionOpacity(adc.id, 0.4);
                setFusionColormap(dwi.id, 'hot');
                setFusionColormap(adc.id, 'cool');
              }
            }}
          >
            DWI + ADC
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export default FusionControlsPanel;
