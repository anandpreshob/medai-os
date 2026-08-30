import { executeCommand } from '@medai/core';
import { useSession } from '../state/session';

/** Series list for the open study. Click shows a series in the active slot. */
export function SeriesPanel() {
  const study = useSession((s) => s.study);
  const slots = useSession((s) => s.slots);
  const activeSlot = useSession((s) => s.activeSlot);
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
          return (
            <li key={s.id}>
              <button
                className={`w-full text-left px-3 py-2 border-b border-line hover:bg-surface-2 ${active ? 'bg-accent-soft' : ''} ${s.isDerived ? 'opacity-70' : ''}`}
                onClick={() => !s.isDerived && void executeCommand('viewer.showSeries', { seriesId: s.id }).catch((e) => window.alert(e.message))}
                disabled={s.isDerived}
                title={s.isDerived ? `${s.derivedKind} objects are listed but not displayed in Tier 1` : s.geometryNote}
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
