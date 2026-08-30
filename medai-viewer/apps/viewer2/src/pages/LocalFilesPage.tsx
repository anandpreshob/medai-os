import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import { stageLocalFiles } from '../lib/localFiles';

/**
 * Open files without a server. Files are staged in memory and the viewer
 * route reads them from the staging area (they never leave the browser).
 */
export function LocalFilesPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const open = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const token = stageLocalFiles(Array.from(files));
    navigate(`/viewer?local=${token}`);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-line bg-surface">
        <button className="btn" onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> Studies
        </button>
        <span className="font-semibold">Open local files</span>
      </header>
      <div
        className="m-6 flex-1 rounded border-2 border-dashed border-line-strong flex flex-col items-center justify-center gap-3 text-ink-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          open(e.dataTransfer.files);
        }}
        data-testid="local-dropzone"
      >
        <FolderOpen size={28} />
        <div>Drop DICOM files, a DICOM folder or .zip, or NIfTI / NRRD / MetaImage volumes</div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => inputRef.current?.click()} data-testid="choose-files">
            Choose files
          </button>
          <button className="btn" onClick={() => dirRef.current?.click()} data-testid="choose-folder">
            Choose folder
          </button>
        </div>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => open(e.target.files)} data-testid="local-file-input" />
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          // @ts-expect-error non-standard attribute for directory selection
          webkitdirectory=""
          onChange={(e) => open(e.target.files)}
        />
      </div>
    </div>
  );
}
