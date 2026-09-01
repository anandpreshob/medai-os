import { executeCommand } from '@medai/core';
import { Layers, Blend } from 'lucide-react';
import { useSession } from '../state/session';
import { viewports } from '../engine/viewports';

const run = (id: string, input: unknown) => void executeCommand(id, input).catch((e) => window.alert(e.message));

/** Series list for the open study. Click shows a series in the active slot. */
export function SeriesPanel() {
  const study = useSession((s) => s.study);
  const slots = useSession((s) => s.slots);
  const activeSlot = useSession((s) => s.activeSlot);
  useSession((s) => s.engineTick);
  const activeIsVolume = viewports.kindOf(activeSlot) === 'volume';
  const fused = viewports.fusionOf(activeSlot)?.seriesId;
  if (!study) return <aside className="w-56 border-r border-line bg-surface shrink-0" data-testid="series-panel" />;
  return (
    <aside className="w-56 border-r border-line bg-surface shrink-0 overflow-auto" data-testid="series-panel">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-ink-3 border-b border-line">
        {study.series.length} series
        {study.studyDescription ? ` · ${study.studyDescription}` : ''}
      </div>
      <ul>
        {study.series.map((s) => {
          const shownIn = slots.map((id, i) => (id === s.id ? i : -1)).filter((i) => i >= 0);
          const active = slots[activeSlot] === s.id;
          const objectShown = s.isDerived && viewports.isObjectShown(s.id);
          const canShowObject = s.isDerived && (s.derivedKind === 'SEG' || s.derivedKind === 'RTSTRUCT');
          const canFuse = !s.isDerived && activeIsVolume && slots[activeSlot] !== s.id && s.isVolumetric;
          return (
            <li key={s.id}>
              <button
                className={`w-full text-left px-3 py-2 border-b border-line hover:bg-surface-2 ${active || objectShown ? 'bg-accent-soft' : ''} ${s.isDerived && !canShowObject ? 'opacity-70' : ''}`}
                onClick={() => {
                  if (canShowObject) run(objectShown ? 'object.hide' : 'object.show', { seriesId: s.id });
                  else if (!s.isDerived) run('viewer.showSeries', { seriesId: s.id });
                }}
                disabled={s.isDerived && !canShowObject}
                title={canShowObject ? `${objectShown ? 'Hide' : 'Show'} ${s.derivedKind} overlay` : s.isDerived ? `${s.derivedKind} objects are listed but not displayed` : s.geometryNote}
                data-object-shown={objectShown}
                data-testid="series-item"
                data-series-id={s.id}
                data-modality={s.modality}
                data-volumetric={s.isVolumetric}
                data-derived={s.isDerived}
              >
                <div className="flex items-center gap-2">
                  <span className="chip">{s.isDerived ? s.derivedKind : s.modality}</span>
                  <span className="text-ink-3 tabular-nums text-[11px]">
                    {s.isDerived ? '' : s.isCine ? `${s.frameCount} fr` : `${s.frameCount} img`}
                  </span>
                  {shownIn.length > 0 && <span className="ml-auto text-accent text-[11px]">{shownIn.map((i) => i + 1).join(',')}</span>}
                  {objectShown && <Layers size={12} className="ml-auto text-accent" />}
                  {canFuse && (
                    <span
                      role="button"
                      tabIndex={0}
                      className={`ml-auto btn !py-0 !px-1.5 text-[11px] ${fused === s.id ? 'active' : ''}`}
                      title={fused === s.id ? 'Remove fusion' : `Fuse ${s.modality} over the active MPR viewport`}
                      onClick={(e) => {
                        e.stopPropagation();
                        run(fused === s.id ? 'viewer.unfuse' : 'viewer.fuse', fused === s.id ? {} : { seriesId: s.id });
                      }}
                      data-testid="fuse-button"
                    >
                      <Blend size={11} /> fuse
                    </span>
                  )}
                </div>
                <div className="truncate mt-0.5" title={s.description}>
                  {s.seriesNumber ? <span className="text-ink-3 mr-1">{s.seriesNumber}</span> : null}
                  {s.description}
                </div>
                {s.geometryNote && <div className="text-warn text-[11px] truncate">{s.geometryNote}</div>}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
