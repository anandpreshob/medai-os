import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload } from 'lucide-react';
import { dicomWeb } from '../lib/dicomweb';

/** Upload DICOM files to the PACS over STOW-RS. Non-DICOM files are skipped. */
export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; text: string }>({ kind: 'idle', text: '' });

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const dicom: File[] = [];
    for (const f of list) {
      if (await looksLikeDicom(f)) dicom.push(f);
    }
    if (dicom.length === 0) {
      setStatus({ kind: 'error', text: 'No DICOM files found (files must start with the DICM magic at byte 128).' });
      return;
    }
    setStatus({ kind: 'busy', text: `Uploading ${dicom.length} of ${list.length} files…` });
    try {
      let stored = 0;
      let failed = 0;
      // STOW in batches to keep request bodies reasonable.
      for (let i = 0; i < dicom.length; i += 50) {
        const r = await dicomWeb.storeInstances(dicom.slice(i, i + 50));
        stored += r.stored;
        failed += r.failed;
        setStatus({ kind: 'busy', text: `Uploaded ${Math.min(i + 50, dicom.length)} / ${dicom.length}…` });
      }
      setStatus({ kind: 'done', text: `Stored ${stored} instance${stored === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.` });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-line bg-surface">
        <button className="btn" onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> Studies
        </button>
        <span className="font-semibold">Upload to PACS</span>
      </header>
      <div
        className="m-6 flex-1 rounded border-2 border-dashed border-line-strong flex flex-col items-center justify-center gap-3 text-ink-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
        data-testid="upload-dropzone"
      >
        <Upload size={28} />
        <div>Drop DICOM files or a folder here</div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => inputRef.current?.click()} data-testid="upload-choose-files">
            Choose files
          </button>
          <button className="btn" onClick={() => dirRef.current?.click()} data-testid="upload-choose-folder">
            Choose folder
          </button>
        </div>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} data-testid="upload-file-input" />
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          // @ts-expect-error non-standard attribute for directory selection
          webkitdirectory=""
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
        {status.text && (
          <div className={status.kind === 'error' ? 'text-bad' : status.kind === 'done' ? 'text-ok' : 'text-ink'} data-testid="upload-status">
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}

export async function looksLikeDicom(file: File): Promise<boolean> {
  if (file.size < 132) return false;
  const head = new Uint8Array(await file.slice(128, 132).arrayBuffer());
  return head[0] === 0x44 && head[1] === 0x49 && head[2] === 0x43 && head[3] === 0x4d; // "DICM"
}
