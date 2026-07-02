import React, { useCallback, useState } from 'react';
import { LoaderRegistry, useViewerStore, useRecentFilesStore } from '@medai/core';
import { toast } from '@medai/ui';
import { Upload, FileImage, Layers, MousePointer } from 'lucide-react';

interface FileDropZoneProps {
  onFileLoaded?: () => void;
}

const FILE_FORMATS = [
  { label: 'NIfTI', ext: '.nii, .nii.gz', type: '3D' },
  { label: 'NRRD', ext: '.nrrd', type: '3D' },
  { label: 'MHA', ext: '.mha, .mhd', type: '3D' },
  { label: 'DICOM', ext: 'folder', type: '3D' },
  { label: 'PNG/JPG', ext: 'images', type: '2D' },
  { label: 'TIFF', ext: '.tiff', type: '2D' },
];

export function FileDropZone({ onFileLoaded }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { setLoading, addImage, persistImage } = useViewerStore();
  const { addRecentFile } = useRecentFilesStore();

  const loadFile = useCallback(
    async (file: File) => {
      setLoading(true, 0);

      try {
        console.log('[FileDropZone] Loading file:', file.name);
        const image = await LoaderRegistry.loadFile(file);
        console.log('[FileDropZone] Loaded image:', image.imageId, image.metadata);
        addImage(image);

        // Persist image to IndexedDB
        await persistImage(image);

        // Add to recent files
        addRecentFile({
          name: file.name,
          path: file.name,
          format: image.metadata.format,
          timestamp: Date.now(),
          dimensions: {
            width: image.metadata.width,
            height: image.metadata.height,
            depth: image.metadata.depth,
          },
        });

        toast.success('Image loaded', `Successfully loaded ${file.name}`);
        onFileLoaded?.();
      } catch (error) {
        console.error('[FileDropZone] Failed to load file:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Load failed', `Failed to load ${file.name}: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, addImage, persistImage, addRecentFile, onFileLoaded]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Load all dropped files
      for (const file of files) {
        await loadFile(file);
      }
    },
    [loadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        await loadFile(files[i]);
      }
    },
    [loadFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        flex flex-col items-center justify-center
        rounded-2xl p-12
        border-2 border-dashed
        transition-all duration-300 ease-out
        cursor-pointer group
        corner-brackets
        ${isDragOver
          ? 'border-accent-primary bg-accent-primary-muted scale-[1.02] shadow-glow'
          : 'border-border-default hover:border-accent-primary/40 hover:bg-background-hover/20'
        }
      `}
    >
      {/* Hidden file input */}
      <input
        type="file"
        id="file-input"
        className="hidden"
        accept="*"
        onChange={handleFileInput}
        multiple
      />

      <label htmlFor="file-input" className="cursor-pointer text-center w-full">
        {/* Animated icon container */}
        <div className={`
          relative mx-auto mb-8
          w-24 h-24 rounded-2xl
          bg-gradient-to-br from-background-tertiary to-background-secondary
          flex items-center justify-center
          shadow-lg border border-border-subtle
          transition-all duration-300
          ${isDragOver ? 'shadow-glow scale-110' : 'group-hover:shadow-glow-sm group-hover:scale-105'}
        `}>
          <Upload className={`
            h-10 w-10 text-text-muted
            transition-all duration-300
            ${isDragOver ? 'text-accent-primary scale-110 animate-float' : 'group-hover:text-accent-primary'}
          `} />

          {/* Decorative corner accents */}
          <div className={`absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-accent-primary/40 rounded-tl transition-all duration-300 ${isDragOver ? 'border-accent-primary w-4 h-4' : ''}`} />
          <div className={`absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-accent-primary/40 rounded-tr transition-all duration-300 ${isDragOver ? 'border-accent-primary w-4 h-4' : ''}`} />
          <div className={`absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-accent-primary/40 rounded-bl transition-all duration-300 ${isDragOver ? 'border-accent-primary w-4 h-4' : ''}`} />
          <div className={`absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-accent-primary/40 rounded-br transition-all duration-300 ${isDragOver ? 'border-accent-primary w-4 h-4' : ''}`} />

          {/* Pulse ring on drag */}
          {isDragOver && (
            <div className="absolute inset-0 rounded-2xl border-2 border-accent-primary animate-pulse-subtle" />
          )}
        </div>

        {/* Title */}
        <p className={`
          text-lg font-semibold mb-2 transition-colors duration-200
          ${isDragOver ? 'text-accent-primary' : 'text-text-primary'}
        `}>
          {isDragOver ? 'Release to Upload' : 'Drop Medical Images Here'}
        </p>

        {/* Subtitle with pointer hint */}
        <p className="text-text-secondary text-sm mb-8 flex items-center justify-center gap-2">
          <MousePointer className="h-3.5 w-3.5" />
          or click to browse your files
        </p>

        {/* Format chips */}
        <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
          {FILE_FORMATS.map((format) => (
            <span
              key={format.label}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5
                bg-background-tertiary/60 rounded-full
                text-xs border border-border-subtle
                transition-all duration-200
                hover:border-accent-primary/30 hover:bg-background-hover/50 hover:scale-105
              `}
            >
              {format.type === '3D' ? (
                <Layers className="h-3 w-3 text-purple-400" />
              ) : (
                <FileImage className="h-3 w-3 text-accent-info" />
              )}
              <span className="text-text-secondary font-medium">{format.label}</span>
              <span className="text-text-disabled">{format.ext}</span>
            </span>
          ))}
        </div>
      </label>
    </div>
  );
}
