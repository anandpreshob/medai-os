import { useEffect, useRef, useState } from 'react';
import { executeCommand } from '@medai/core';
import { viewports, type SlotKind, type SlotOrientation } from '../engine/viewports';
import { md } from '../engine/metadata';
import { getSeries, slotCount, useSession, type LayoutId } from '../state/session';

const GRID: Record<LayoutId, string> = {
  '1x1': 'grid-cols-1 grid-rows-1',
  '1x2': 'grid-cols-2 grid-rows-1',
  '2x2': 'grid-cols-2 grid-rows-2',
  mpr: 'grid-cols-3 grid-rows-1',
  'mpr+3d': 'grid-cols-2 grid-rows-2',
};

function planFor(layout: LayoutId, slot: number, hasImageIds: boolean): { kind: SlotKind; orientation?: SlotOrientation } {
  if (layout === 'mpr' || layout === 'mpr+3d') {
    if (layout === 'mpr+3d' && slot === 3) return { kind: '3d' };
    return { kind: 'volume', orientation: (['axial', 'sagittal', 'coronal'] as SlotOrientation[])[slot] };
  }
  return hasImageIds ? { kind: 'stack' } : { kind: 'volume', orientation: 'axial' };
}

/** Pick a round length (1–200 mm) whose bar is at most a quarter of the viewport width. */
function scaleBarFor(mmPerPx: number | undefined, maxPx = 220): { mm: number; px: number } | null {
  if (!mmPerPx) return null;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200];
  let best: { mm: number; px: number } | null = null;
  for (const mm of steps) {
    const px = mm / mmPerPx;
    if (px <= maxPx) best = { mm, px };
  }
  return best && best.px >= 20 ? best : null;
}

export function ViewportGrid() {
  const layout = useSession((s) => s.layout);
  const n = slotCount(layout);
  return (
    <div className={`h-full w-full grid gap-px bg-line ${GRID[layout]}`} data-testid="viewport-grid" data-layout={layout}>
      {Array.from({ length: n }, (_, i) => (
        <ViewportPane key={i} slot={i} />
      ))}
    </div>
  );
}

function ViewportPane({ slot }: { slot: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seriesId = useSession((s) => s.slots[slot]);
  const layout = useSession((s) => s.layout);
  const activeSlot = useSession((s) => s.activeSlot);
  const overlays = useSession((s) => s.overlays);
  const study = useSession((s) => s.study);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current!;
    viewports.attach(slot, el);
    const unsub = viewports.subscribe(slot, () => setTick((t) => t + 1));
    return () => {
      unsub();
      viewports.detach(slot);
    };
  }, [slot]);

  useEffect(() => {
    const series = getSeries(seriesId);
    setError(null);
    if (!series) {
      viewports.clear(slot);
      return;
    }
    const plan = planFor(layout, slot, series.imageIds.length > 0);
    viewports.show(slot, series, plan).catch((e) => {
      console.error('[viewport] show failed', e);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [seriesId, layout, slot]);

  const series = getSeries(seriesId);
  const imageId = viewports.currentImageId(slot);
  const slice = viewports.sliceInfo(slot);
  const wl = viewports.windowLevel(slot);
  const zoom = viewports.zoom(slot);
  const plane = imageId ? md.plane(imageId) : undefined;
  const labels = overlays.orientation ? viewports.orientationLabels(slot) : { left: '', right: '', top: '', bottom: '' };
  const scale = overlays.scaleBar ? scaleBarFor(viewports.mmPerPixel(slot)) : null;
  const isActive = activeSlot === slot;
  void tick;

  return (
    <div
      className={`relative bg-black outline-none ${isActive ? 'ring-1 ring-inset ring-accent' : ''}`}
      onMouseDown={() => !isActive && void executeCommand('viewer.selectSlot', { slot })}
      data-testid={`viewport-${slot}`}
      data-active={isActive}
      data-series={seriesId ?? ''}
      data-slice-index={slice.index}
      data-slice-count={slice.count}
      data-window-width={wl ? Math.round(wl.width) : ''}
      data-window-center={wl ? Math.round(wl.center) : ''}
    >
      <div ref={ref} className="cs-viewport" onContextMenu={(e) => e.preventDefault()} />
      {series && overlays.patientInfo && study && (
        <>
          <div className="overlay-corner left-2 top-1.5" data-testid="overlay-top-left">
            {study.patientName}
            {'\n'}
            {study.patientID}
            {study.studyDate ? `\n${study.studyDate}` : ''}
          </div>
          <div className="overlay-corner right-2 top-1.5 text-right" data-testid="overlay-top-right">
            {series.modality} {series.description}
            {series.isDerived ? `\n${series.derivedKind}` : ''}
          </div>
        </>
      )}
      {series && (
        <>
          <div className="overlay-corner left-2 bottom-1.5" data-testid="overlay-bottom-left">
            {slice.count > 0 ? `${slice.index + 1} / ${slice.count}` : ''}
            {wl ? `\nW ${Math.round(wl.width)}  L ${Math.round(wl.center)}` : ''}
          </div>
          <div className="overlay-corner right-2 bottom-1.5 text-right" data-testid="overlay-bottom-right">
            {`Zoom ${zoom.toFixed(2)}×`}
            {plane?.pixelSpacing ? `\n${plane.pixelSpacing[0].toFixed(2)} × ${plane.pixelSpacing[1].toFixed(2)} mm` : ''}
            {plane?.sliceThickness ? `  T ${plane.sliceThickness.toFixed(1)}` : ''}
          </div>
        </>
      )}
      {labels.left && (
        <>
          <div className="overlay-corner left-2 top-1/2 -translate-y-1/2 text-accent" data-testid="orient-left">{labels.left}</div>
          <div className="overlay-corner right-2 top-1/2 -translate-y-1/2 text-accent" data-testid="orient-right">{labels.right}</div>
          <div className="overlay-corner top-1.5 left-1/2 -translate-x-1/2 text-accent" data-testid="orient-top">{labels.top}</div>
          <div className="overlay-corner bottom-1.5 left-1/2 -translate-x-1/2 text-accent" data-testid="orient-bottom">{labels.bottom}</div>
        </>
      )}
      {series && scale && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center" data-testid="scale-bar" data-mm={scale.mm}>
          <div className="h-2 border-x border-b border-ink-2" style={{ width: scale.px }} />
          <div className="overlay-corner static text-[10px] mt-0.5">{scale.mm >= 10 ? `${scale.mm / 10} cm` : `${scale.mm} mm`}</div>
        </div>
      )}
      {!series && <div className="absolute inset-0 flex items-center justify-center text-ink-3 text-xs pointer-events-none">Empty — pick a series</div>}
      {error && (
        <div className="absolute inset-x-2 top-8 p-2 rounded bg-surface border border-bad/40 text-bad text-xs" data-testid="viewport-error">
          {error}
        </div>
      )}
    </div>
  );
}
