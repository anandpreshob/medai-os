import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setConfirmationHandler } from '@medai/core';
import { initEngine } from '../engine/init';
import { registerViewerCommands } from '../engine/commands';
import { installKeyboard } from '../engine/keyboard';
import { loadDicomWebStudy } from '../engine/loaders/dicomweb';
import { loadLocalDicomFiles } from '../engine/loaders/localDicom';
import { isVolumeFile, loadVolumeFile } from '../engine/loaders/volumeFiles';
import { expandArchives, takeLocalFiles } from '../lib/localFiles';
import { useSession, type OpenSeries, type OpenStudy } from '../state/session';
import { Toolbar } from '../components/Toolbar';
import { SeriesPanel } from '../components/SeriesPanel';
import { ViewportGrid } from '../components/ViewportGrid';
import { viewports } from '../engine/viewports';

export function ViewerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const studyUID = params.get('studyUID');
  const localToken = params.get('local');
  const session = useSession();
  const [ready, setReady] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const started = useRef<string | null>(null);

  useEffect(() => {
    registerViewerCommands();
    setConfirmationHandler(async (cmd) => window.confirm(`${cmd.title}?`));
    return installKeyboard();
  }, []);

  useEffect(() => {
    const key = studyUID ? `pacs:${studyUID}` : localToken ? `local:${localToken}` : '';
    if (!key || started.current === key) return;
    started.current = key;
    const s = useSession.getState();
    s.reset();
    viewports.clearAll();
    s.setLoading(true, 'Starting viewer…');
    (async () => {
      await initEngine();
      setReady(true);
      let study: OpenStudy | null = null;
      const skipped: string[] = [];
      if (studyUID) {
        study = await loadDicomWebStudy(studyUID, (message, fraction) => s.setLoading(true, message, fraction));
      } else if (localToken) {
        const staged = takeLocalFiles(localToken);
        if (!staged) throw new Error('These local files are no longer staged — open them again.');
        const expanded = await expandArchives(staged);
        skipped.push(...expanded.skipped);
        const files = expanded.files;
        const dicomFiles = files.filter((f) => !isVolumeFile(f.name) && !/\.raw$/i.test(f.name));
        const volumeFiles = files.filter((f) => isVolumeFile(f.name));
        if (dicomFiles.length) {
          s.setLoading(true, 'Reading DICOM headers…');
          const r = await loadLocalDicomFiles(dicomFiles, (done, total) => s.setLoading(true, `Reading DICOM headers… ${done}/${total}`, done / total));
          study = r.study;
          skipped.push(...r.skipped.filter((x) => !/not a DICOM file/.test(x.reason) || dicomFiles.length === 1).map((x) => `${x.name}: ${x.reason}`));
        }
        const extra: OpenSeries[] = [];
        for (const f of volumeFiles) {
          s.setLoading(true, `Reading ${f.name}…`);
          try {
            extra.push(await loadVolumeFile(f, files));
          } catch (e) {
            skipped.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (!study && extra.length) {
          study = { studyInstanceUID: 'local', patientName: 'Local files', patientID: '', studyDate: '', studyDescription: '', series: [] };
        }
        if (study) study.series.push(...extra);
      }
      if (!study || study.series.length === 0) {
        throw new Error(skipped.length ? `Nothing displayable.\n${skipped.join('\n')}` : 'Nothing displayable in the selection.');
      }
      s.setStudy(study);
      const first = study.series.find((x) => !x.isDerived);
      if (first) s.setSlot(0, first.id);
      setNotices(skipped);
      s.setLoading(false);
    })().catch((e) => {
      s.setLoading(false);
      s.setError(e instanceof Error ? e.message : String(e));
    });
  }, [studyUID, localToken]);

  return (
    <div className="h-full flex flex-col" data-testid="viewer-page">
      <Toolbar onBack={() => navigate('/')} />
      <div className="flex-1 flex min-h-0">
        <SeriesPanel />
        <div className="flex-1 relative min-w-0">
          {ready && <ViewportGrid />}
          {session.loading.active && (
            <div className="absolute inset-0 flex items-center justify-center bg-ground/70" data-testid="loading">
              <div className="text-ink-2">{session.loading.message || 'Loading…'}</div>
            </div>
          )}
          {session.error && (
            <div className="absolute inset-x-0 top-0 m-3 p-3 rounded border border-bad/40 bg-surface text-bad whitespace-pre-wrap" data-testid="viewer-error">
              {session.error}
            </div>
          )}
          {notices.length > 0 && !session.error && (
            <div className="absolute right-3 bottom-3 max-w-md p-2 rounded border border-line bg-surface text-warn text-[11px] whitespace-pre-wrap" data-testid="viewer-notices">
              {notices.join('\n')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
