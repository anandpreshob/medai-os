import React, { useRef } from 'react';
import { Button } from '@medai/ui';
import { FolderOpen, File, X } from 'lucide-react';

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (files: FileList) => void;
  supportedFormats?: string[];
}

const DEFAULT_FORMATS = ['.nii', '.nii.gz', '.nrrd', '.nhdr', '.mha', '.mhd'];

export function FileBrowser({
  isOpen,
  onClose,
  onFileSelect,
  supportedFormats = DEFAULT_FORMATS,
}: FileBrowserProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) {
    return null;
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files);
      onClose();
    }
  };

  // Generate accept string for input
  const acceptString = supportedFormats
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
    .join(',');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background-secondary border border-border-default rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h2 className="text-text-primary font-medium">Open Medical Image</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-background-hover rounded"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-primary/10 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-accent-primary" />
            </div>

            <h3 className="text-text-primary font-medium mb-2">
              Select a medical image file
            </h3>

            <p className="text-text-muted text-sm mb-6">
              Supported formats: NIfTI (.nii, .nii.gz), NRRD (.nrrd), MHA (.mha, .mhd)
            </p>

            {/* Using * to show all files - medical formats don't have registered MIME types */}
            <input
              ref={fileInputRef}
              type="file"
              accept="*"
              onChange={handleFileChange}
              className="hidden"
              multiple
            />

            <Button onClick={handleBrowseClick} className="w-full">
              <File className="w-4 h-4 mr-2" />
              Browse Files
            </Button>
          </div>

          {/* Supported formats list */}
          <div className="mt-6 pt-6 border-t border-border-subtle">
            <h4 className="text-text-secondary text-xs font-medium mb-3">
              SUPPORTED FORMATS
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-accent-success" />
                <span className="text-text-primary">NIfTI</span>
                <span className="text-text-muted">.nii, .nii.gz</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-accent-success" />
                <span className="text-text-primary">NRRD</span>
                <span className="text-text-muted">.nrrd, .nhdr</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-accent-success" />
                <span className="text-text-primary">MetaImage</span>
                <span className="text-text-muted">.mha, .mhd</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-text-muted" />
                <span className="text-text-muted">DICOM</span>
                <span className="text-text-muted">(coming soon)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
