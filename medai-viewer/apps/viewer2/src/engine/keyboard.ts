import { executeCommand, listCommands } from '@medai/core';
import { presetsForModality } from '../lib/presets';
import { useSession } from '../state/session';
import { viewports } from './viewports';

/**
 * Keyboard → commands. Bindings with fixed inputs live here; no-argument
 * commands declare their own `keybinding`. Every key press ends in
 * `executeCommand`, so the command log sees keyboard use too.
 */
const BOUND: Record<string, [string, unknown]> = {
  w: ['viewer.setTool', { tool: 'WindowLevel' }],
  p: ['viewer.setTool', { tool: 'Pan' }],
  z: ['viewer.setTool', { tool: 'Zoom' }],
  l: ['viewer.setTool', { tool: 'Length' }],
  a: ['viewer.setTool', { tool: 'Angle' }],
  b: ['viewer.setTool', { tool: 'Bidirectional' }],
  e: ['viewer.setTool', { tool: 'EllipticalROI' }],
  r: ['viewer.setTool', { tool: 'RectangleROI' }],
  c: ['viewer.setTool', { tool: 'CircleROI' }],
  o: ['viewer.setTool', { tool: 'Probe' }],
  x: ['viewer.setTool', { tool: 'Crosshairs' }],
  escape: ['viewer.setTool', { tool: 'WindowLevel' }],
  arrowup: ['viewer.scroll', { delta: -1 }],
  arrowdown: ['viewer.scroll', { delta: 1 }],
  pageup: ['viewer.scroll', { delta: -10 }],
  pagedown: ['viewer.scroll', { delta: 10 }],
  home: ['viewer.jumpToSlice', { index: 0 }],
  'shift+delete': ['measure.clearAll', {}],
};

export const KEY_HELP: { keys: string; action: string }[] = [
  { keys: 'W / P / Z', action: 'Window-level / Pan / Zoom' },
  { keys: 'L A B E R C O', action: 'Length, Angle, Bidirectional, Ellipse, Rectangle, Circle, Probe' },
  { keys: 'X', action: 'Crosshairs (MPR)' },
  { keys: '1–8', action: 'Window presets for the modality' },
  { keys: 'I', action: 'Invert' },
  { keys: 'Shift+R', action: 'Reset view' },
  { keys: '↑ ↓ PgUp PgDn Home End', action: 'Scroll slices' },
  { keys: 'Space', action: 'Play / pause cine' },
  { keys: 'Delete / Shift+Delete', action: 'Delete selected / clear all measurements' },
  { keys: 'Esc', action: 'Back to window-level' },
];

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

export function installKeyboard(): () => void {
  const handler = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const combo = comboOf(e);
    const run = (id: string, input: unknown) => {
      e.preventDefault();
      void executeCommand(id, input, { source: 'keyboard' }).catch((err) => console.warn(`[keyboard] ${combo}:`, err.message));
    };

    if (combo in BOUND) return run(...BOUND[combo]);
    if (combo === ' ' || combo === 'space') {
      return run('viewer.cine', { playing: !useSession.getState().cinePlaying });
    }
    if (combo === 'end') {
      return run('viewer.jumpToSlice', { index: Math.max(0, viewports.sliceInfo(useSession.getState().activeSlot).count - 1) });
    }
    if (/^[1-8]$/.test(combo)) {
      const slot = useSession.getState().activeSlot;
      const modality = viewports.modality(slot) ?? 'OT';
      const preset = presetsForModality(modality, { suvScaled: viewports.isSuvScaled(slot) }).presets.find((p) => p.key === combo);
      if (preset) return run('viewer.applyPreset', { presetId: preset.id });
      return;
    }
    const cmd = listCommands().find((c) => c.keybinding === combo);
    if (cmd) return run(cmd.id, {});
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
