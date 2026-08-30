import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Upload, FolderOpen, ServerOff } from 'lucide-react';
import { dicomWeb, type StudySummary } from '../lib/dicomweb';

const MODALITIES = ['CT', 'MR', 'PT', 'CR', 'DX', 'MG', 'US', 'XA', 'NM', 'RTSTRUCT', 'SEG'];

function fmtDate(d: string): string {
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d || '—';
}

export function StudiesPage() {
  const navigate = useNavigate();
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [query, setQuery] = useState('');
  const [modality, setModality] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'offline' | 'error'>('idle');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await dicomWeb.searchStudies({ patientName: query || undefined, modality: modality || undefined });
      setStudies(rows.sort((a, b) => b.studyDate.localeCompare(a.studyDate)));
      setState('idle');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState(/Failed to fetch|NetworkError|ECONNREFUSED|502|503/.test(msg) ? 'offline' : 'error');
    }
  }, [query, modality]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-line bg-surface">
        <span className="font-semibold tracking-tight">medai-os</span>
        <span className="text-ink-3">/ studies</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={() => navigate('/local')} data-testid="open-local">
            <FolderOpen size={14} /> Open local files
          </button>
          <button className="btn" onClick={() => navigate('/upload')} data-testid="upload">
            <Upload size={14} /> Upload to PACS
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-line">
        <label className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-7 w-72"
            placeholder="Patient name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
            data-testid="search-patient"
          />
        </label>
        <select className="input" value={modality} onChange={(e) => setModality(e.target.value)} data-testid="filter-modality">
          <option value="">All modalities</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : ''} />
        </button>
        <span className="ml-auto text-ink-3 tabular-nums" data-testid="study-count">
          {studies.length} {studies.length === 1 ? 'study' : 'studies'}
        </span>
      </div>

      {state === 'offline' && (
        <div className="m-4 p-4 rounded border border-line bg-surface-2 flex gap-3 items-start" data-testid="pacs-offline">
          <ServerOff size={18} className="text-warn shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">PACS is not reachable</div>
            <div className="text-ink-2 mt-1">
              Start Orthanc with <code className="font-mono">docker compose up -d</code> in <code className="font-mono">MedAI-server/</code>, or open local files
              instead. The viewer works without a server.
            </div>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="m-4 p-3 rounded border border-bad/40 text-bad" data-testid="pacs-error">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface text-ink-3 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">ID</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Modality</th>
              <th className="px-4 py-2 font-medium text-right">Series</th>
              <th className="px-4 py-2 font-medium text-right">Images</th>
            </tr>
          </thead>
          <tbody>
            {studies.map((s) => (
              <tr
                key={s.studyInstanceUID}
                className="border-t border-line hover:bg-surface-2 cursor-pointer"
                onClick={() => navigate(`/viewer?studyUID=${encodeURIComponent(s.studyInstanceUID)}`)}
                data-testid="study-row"
                data-study-uid={s.studyInstanceUID}
              >
                <td className="px-4 py-2">{s.patientName.replace(/\^/g, ' ')}</td>
                <td className="px-4 py-2 font-mono text-ink-2">{s.patientID}</td>
                <td className="px-4 py-2 tabular-nums">{fmtDate(s.studyDate)}</td>
                <td className="px-4 py-2 text-ink-2">{s.studyDescription || '—'}</td>
                <td className="px-4 py-2">
                  {s.modalities.map((m) => (
                    <span key={m} className="chip mr-1">
                      {m}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{s.numberOfSeries || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.numberOfInstances || '—'}</td>
              </tr>
            ))}
            {state === 'idle' && studies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                  No studies. Upload DICOM to the PACS or open local files.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
