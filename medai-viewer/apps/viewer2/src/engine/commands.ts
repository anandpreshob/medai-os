import { registerCommands, type CommandDefinition } from '@medai/core';
import { presetsForModality, resolvePreset } from '../lib/presets';
import { getSeries, slotCount, useSession, type LayoutId, type ToolName } from '../state/session';
import { viewports } from './viewports';

const TOOLS: ToolName[] = [
  'WindowLevel',
  'Pan',
  'Zoom',
  'StackScroll',
  'Length',
  'Angle',
  'CobbAngle',
  'Bidirectional',
  'EllipticalROI',
  'RectangleROI',
  'CircleROI',
  'Probe',
  'ArrowAnnotate',
  'PlanarFreehandROI',
  'Crosshairs',
];
const LAYOUTS: LayoutId[] = ['1x1', '1x2', '2x2', 'mpr', 'mpr+3d'];

const active = () => useSession.getState().activeSlot;

/**
 * Every viewer action, once. UI buttons, keyboard shortcuts, and the agent all
 * go through these. Descriptions double as LLM tool descriptions.
 */
export const VIEWER_COMMANDS: CommandDefinition<any, any>[] = [
  {
    id: 'viewer.setTool',
    title: 'Set active tool',
    description: 'Choose which tool the left mouse button uses in all viewports (window/level, pan, zoom, or a measurement tool).',
    category: 'viewer',
    input: { type: 'object', properties: { tool: { type: 'string', enum: TOOLS } }, required: ['tool'], additionalProperties: false },
    run: ({ tool }: { tool: ToolName }) => {
      useSession.getState().setActiveTool(tool);
      viewports.setPrimaryTool(tool);
    },
  },
  {
    id: 'layout.set',
    title: 'Set layout',
    description: 'Arrange viewports: 1x1, 1x2, 2x2, mpr (axial/sagittal/coronal of the active series), or mpr+3d.',
    category: 'layout',
    input: { type: 'object', properties: { layout: { type: 'string', enum: LAYOUTS } }, required: ['layout'], additionalProperties: false },
    run: ({ layout }: { layout: LayoutId }) => {
      const s = useSession.getState();
      const current = s.slots[s.activeSlot] ?? s.slots.find(Boolean) ?? null;
      const n = slotCount(layout);
      if (layout === 'mpr' || layout === 'mpr+3d') {
        const series = getSeries(current);
        if (!series) throw new Error('Open a series first');
        if (!series.isVolumetric) throw new Error(`${series.description} is not a 3D stack${series.geometryNote ? ` (${series.geometryNote})` : ''}`);
        for (let i = 0; i < n; i++) s.setSlot(i, current);
      } else {
        for (let i = 0; i < 4; i++) if (i >= n) s.setSlot(i, null);
        if (n >= 1 && !s.slots[0]) s.setSlot(0, current);
      }
      s.setLayout(layout);
      if (s.activeSlot >= n) s.setActiveSlot(0);
    },
  },
  {
    id: 'viewer.showSeries',
    title: 'Show series',
    description: 'Display a series (by its id from the open study) in a viewport slot; defaults to the active slot.',
    category: 'study',
    input: {
      type: 'object',
      properties: { seriesId: { type: 'string' }, slot: { type: 'integer', minimum: 0, maximum: 3 } },
      required: ['seriesId'],
      additionalProperties: false,
    },
    run: ({ seriesId, slot }: { seriesId: string; slot?: number }) => {
      const s = useSession.getState();
      const series = getSeries(seriesId);
      if (!series) throw new Error(`Unknown series ${seriesId}`);
      if (series.isDerived) throw new Error(`${series.description} is a ${series.derivedKind} object, not an image series`);
      const target = slot ?? s.activeSlot;
      if (s.layout === 'mpr' || s.layout === 'mpr+3d') {
        if (!series.isVolumetric) throw new Error(`${series.description} cannot be shown in MPR${series.geometryNote ? ` (${series.geometryNote})` : ''}`);
        for (let i = 0; i < slotCount(s.layout); i++) s.setSlot(i, seriesId);
      } else {
        s.setSlot(target, seriesId);
      }
      s.setActiveSlot(target);
    },
  },
  {
    id: 'viewer.selectSlot',
    title: 'Select viewport',
    description: 'Make a viewport slot the active one that other commands act on.',
    category: 'viewer',
    input: { type: 'object', properties: { slot: { type: 'integer', minimum: 0, maximum: 3 } }, required: ['slot'], additionalProperties: false },
    run: ({ slot }: { slot: number }) => useSession.getState().setActiveSlot(slot),
  },
  {
    id: 'viewer.scroll',
    title: 'Scroll slices',
    description: 'Move through slices/frames in the active viewport by a signed number of steps.',
    category: 'viewer',
    input: { type: 'object', properties: { delta: { type: 'integer' } }, required: ['delta'], additionalProperties: false },
    run: ({ delta }: { delta: number }) => viewports.scroll(active(), delta),
  },
  {
    id: 'viewer.jumpToSlice',
    title: 'Jump to slice',
    description: 'Go to a slice/frame index (0-based) in the active viewport.',
    category: 'viewer',
    input: { type: 'object', properties: { index: { type: 'integer', minimum: 0 } }, required: ['index'], additionalProperties: false },
    run: ({ index }: { index: number }) => viewports.jumpToSlice(active(), index),
  },
  {
    id: 'viewer.setWindowLevel',
    title: 'Set window/level',
    description: 'Set window width and center (in modality units, e.g. HU for CT) on the active viewport.',
    category: 'viewer',
    input: { type: 'object', properties: { width: { type: 'number', minimum: 0 }, center: { type: 'number' } }, required: ['width', 'center'], additionalProperties: false },
    run: ({ width, center }: { width: number; center: number }) => viewports.setWindowLevel(active(), width, center),
  },
  {
    id: 'viewer.applyPreset',
    title: 'Apply window preset',
    description: 'Apply a named window/level preset for the current modality (e.g. ct-lung, ct-bone, ct-brain); relative presets use the image pixel range.',
    category: 'viewer',
    input: { type: 'object', properties: { presetId: { type: 'string' } }, required: ['presetId'], additionalProperties: false },
    run: ({ presetId }: { presetId: string }) => {
      const slot = active();
      const modality = viewports.modality(slot) ?? getSeries(useSession.getState().slots[slot])?.modality ?? 'OT';
      const { presets, relative } = presetsForModality(modality);
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) throw new Error(`No preset ${presetId} for ${modality}. Available: ${presets.map((p) => p.id).join(', ')}`);
      const range = relative ? viewports.pixelRange(slot) : undefined;
      if (relative && !range) throw new Error('Image range not available yet');
      const { width, center } = resolvePreset(preset, relative, range ?? { min: 0, max: 1 });
      viewports.setWindowLevel(slot, width, center);
    },
  },
  {
    id: 'viewer.invert',
    title: 'Invert grayscale',
    description: 'Toggle grayscale inversion on the active viewport.',
    category: 'viewer',
    input: { type: 'object', additionalProperties: false },
    keybinding: 'i',
    run: () => viewports.invert(active()),
  },
  {
    id: 'viewer.resetView',
    title: 'Reset view',
    description: 'Reset zoom, pan, and window/level of the active viewport to the image defaults.',
    category: 'viewer',
    input: { type: 'object', additionalProperties: false },
    keybinding: 'shift+r',
    run: () => viewports.resetView(active()),
  },
  {
    id: 'viewer.cine',
    title: 'Cine playback',
    description: 'Start or stop cine playback of frames in the active viewport, optionally at a given frames-per-second.',
    category: 'viewer',
    input: { type: 'object', properties: { playing: { type: 'boolean' }, fps: { type: 'number', minimum: 1, maximum: 60 } }, required: ['playing'], additionalProperties: false },
    run: ({ playing, fps }: { playing: boolean; fps?: number }) => {
      const s = useSession.getState();
      const rate = fps ?? s.cineFps;
      if (playing) viewports.playCine(s.activeSlot, rate);
      else viewports.stopCine(s.activeSlot);
      s.setCine(playing, rate);
    },
  },
  {
    id: 'overlay.toggle',
    title: 'Toggle overlay',
    description: 'Show or hide an overlay: patientInfo, orientation labels, scaleBar.',
    category: 'overlay',
    input: {
      type: 'object',
      properties: { overlay: { type: 'string', enum: ['patientInfo', 'orientation', 'scaleBar'] }, on: { type: 'boolean' } },
      required: ['overlay'],
      additionalProperties: false,
    },
    run: ({ overlay, on }: { overlay: 'patientInfo' | 'orientation' | 'scaleBar'; on?: boolean }) => {
      const s = useSession.getState();
      const next = on ?? !s.overlays[overlay];
      s.setOverlay(overlay, next);
    },
  },
  {
    id: 'measure.deleteSelected',
    title: 'Delete selected measurement',
    description: 'Delete the currently selected measurement annotation(s).',
    category: 'measure',
    input: { type: 'object', additionalProperties: false },
    keybinding: 'delete',
    run: () => viewports.deleteSelectedAnnotations(),
  },
  {
    id: 'measure.clearAll',
    title: 'Clear all measurements',
    description: 'Remove every measurement annotation from the open study.',
    category: 'measure',
    input: { type: 'object', additionalProperties: false },
    requiresConfirmation: true,
    run: () => viewports.clearAnnotations(),
  },
];

let disposer: (() => void) | undefined;
export function registerViewerCommands(): void {
  if (disposer) return;
  disposer = registerCommands(VIEWER_COMMANDS);
}
