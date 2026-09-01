import { useState } from 'react';
import { executeCommand } from '@medai/core';
import {
  ArrowLeft,
  Contrast,
  Move,
  ZoomIn,
  Ruler,
  TriangleRight,
  MoveDiagonal,
  Circle,
  Square,
  Crosshair,
  Locate,
  RotateCcw,
  Play,
  Pause,
  LayoutGrid,
  Keyboard,
  Trash2,
  SunMoon,
} from 'lucide-react';
import { KEY_HELP } from '../engine/keyboard';
import { presetsForModality } from '../lib/presets';
import { viewports } from '../engine/viewports';
import { getSeries, useSession, type LayoutId, type ToolName } from '../state/session';

const TOOL_BUTTONS: { tool: ToolName; icon: React.ReactNode; label: string; key: string }[] = [
  { tool: 'WindowLevel', icon: <Contrast size={15} />, label: 'Window/level', key: 'W' },
  { tool: 'Pan', icon: <Move size={15} />, label: 'Pan', key: 'P' },
  { tool: 'Zoom', icon: <ZoomIn size={15} />, label: 'Zoom', key: 'Z' },
  { tool: 'Length', icon: <Ruler size={15} />, label: 'Length', key: 'L' },
  { tool: 'Angle', icon: <TriangleRight size={15} />, label: 'Angle', key: 'A' },
  { tool: 'Bidirectional', icon: <MoveDiagonal size={15} />, label: 'Bidirectional', key: 'B' },
  { tool: 'EllipticalROI', icon: <Circle size={15} />, label: 'Ellipse ROI', key: 'E' },
  { tool: 'RectangleROI', icon: <Square size={15} />, label: 'Rectangle ROI', key: 'R' },
  { tool: 'Probe', icon: <Locate size={15} />, label: 'Probe', key: 'O' },
  { tool: 'Crosshairs', icon: <Crosshair size={15} />, label: 'Crosshairs (MPR)', key: 'X' },
];

const LAYOUT_BUTTONS: { layout: LayoutId; label: string }[] = [
  { layout: '1x1', label: '1×1' },
  { layout: '1x2', label: '1×2' },
  { layout: '2x2', label: '2×2' },
  { layout: 'mpr', label: 'MPR' },
  { layout: 'mpr+3d', label: 'MPR+3D' },
];

const run = (id: string, input: unknown = {}) => void executeCommand(id, input).catch((e) => window.alert(e.message));

export function Toolbar({ onBack }: { onBack: () => void }) {
  const activeTool = useSession((s) => s.activeTool);
  const layout = useSession((s) => s.layout);
  const cinePlaying = useSession((s) => s.cinePlaying);
  const overlays = useSession((s) => s.overlays);
  const activeSlot = useSession((s) => s.activeSlot);
  const slotSeries = useSession((s) => s.slots[s.activeSlot]);
  const study = useSession((s) => s.study);
  const [help, setHelp] = useState(false);
  const series = getSeries(slotSeries);
  const modality = viewports.modality(activeSlot) ?? series?.modality ?? 'OT';
  const { presets } = presetsForModality(modality, { suvScaled: viewports.isSuvScaled(activeSlot) });
  const mprOk = !!series?.isVolumetric;

  return (
    <header className="flex items-center gap-1 px-2 h-11 border-b border-line bg-surface shrink-0" data-testid="toolbar">
      <button className="btn" onClick={onBack} title="Back to studies">
        <ArrowLeft size={14} />
      </button>
      <span className="mx-2 text-ink-2 truncate max-w-[22ch]" title={study?.patientName}>
        {study?.patientName ?? ''}
      </span>
      <div className="w-px h-6 bg-line mx-1" />
      {TOOL_BUTTONS.map((b) => (
        <button
          key={b.tool}
          className="btn"
          aria-pressed={activeTool === b.tool}
          title={`${b.label} (${b.key})`}
          onClick={() => run('viewer.setTool', { tool: b.tool })}
          disabled={b.tool === 'Crosshairs' && layout !== 'mpr' && layout !== 'mpr+3d'}
          data-testid={`tool-${b.tool}`}
        >
          {b.icon}
        </button>
      ))}
      <div className="w-px h-6 bg-line mx-1" />
      <select
        className="input"
        value=""
        onChange={(e) => e.target.value && run('viewer.applyPreset', { presetId: e.target.value })}
        title="Window presets"
        data-testid="preset-select"
      >
        <option value="">{modality} presets</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.key ? `${p.key}  ` : ''}
            {p.name}
          </option>
        ))}
      </select>
      <button className="btn" title="Invert (I)" onClick={() => run('viewer.invert')} data-testid="invert">
        <SunMoon size={15} />
      </button>
      <button className="btn" title="Reset view (Shift+R)" onClick={() => run('viewer.resetView')} data-testid="reset-view">
        <RotateCcw size={15} />
      </button>
      <button
        className="btn"
        aria-pressed={cinePlaying}
        title="Cine (Space)"
        onClick={() => run('viewer.cine', { playing: !cinePlaying })}
        disabled={!series || series.frameCount < 2}
        data-testid="cine-toggle"
      >
        {cinePlaying ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <div className="w-px h-6 bg-line mx-1" />
      <LayoutGrid size={14} className="text-ink-3" />
      {LAYOUT_BUTTONS.map((b) => (
        <button
          key={b.layout}
          className="btn"
          aria-pressed={layout === b.layout}
          onClick={() => run('layout.set', { layout: b.layout })}
          disabled={(b.layout === 'mpr' || b.layout === 'mpr+3d') && !mprOk}
          title={(b.layout === 'mpr' || b.layout === 'mpr+3d') && !mprOk ? series?.geometryNote ?? 'Needs a 3D stack' : b.label}
          data-testid={`layout-${b.layout}`}
        >
          {b.label}
        </button>
      ))}
      <div className="w-px h-6 bg-line mx-1" />
      <button className="btn" aria-pressed={overlays.patientInfo} onClick={() => run('overlay.toggle', { overlay: 'patientInfo' })} title="Patient info overlay">
        Info
      </button>
      <button className="btn" aria-pressed={overlays.orientation} onClick={() => run('overlay.toggle', { overlay: 'orientation' })} title="Orientation labels">
        LRAP
      </button>
      <button className="btn" aria-pressed={overlays.scaleBar} onClick={() => run('overlay.toggle', { overlay: 'scaleBar' })} title="Scale bar">
        Scale
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button className="btn" title="Delete selected measurement (Delete)" onClick={() => run('measure.deleteSelected')}>
          <Trash2 size={15} />
        </button>
        <button className="btn" aria-pressed={help} onClick={() => setHelp((h) => !h)} title="Keyboard shortcuts">
          <Keyboard size={15} />
        </button>
      </div>
      {help && (
        <div className="absolute right-2 top-12 z-10 p-3 rounded border border-line bg-surface shadow-lg text-xs" data-testid="key-help">
          <table>
            <tbody>
              {KEY_HELP.map((k) => (
                <tr key={k.keys}>
                  <td className="pr-4 font-mono text-accent whitespace-nowrap">{k.keys}</td>
                  <td className="text-ink-2">{k.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </header>
  );
}
