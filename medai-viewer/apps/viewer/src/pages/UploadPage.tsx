import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileText, CheckCircle, XCircle, Loader, ArrowLeft,
  Activity, HardDrive, Database, AlertCircle
} from 'lucide-react';
import {
  detectFileFormat,
  shouldUploadToOrthanc,
  getFormatDescription,
  orthancUploadService,
  LoaderRegistry,
  useViewerStore,
  isFeatureEnabled,
  type FileFormat,
  type UploadResultWithDetection,
} from '@medai/core';
import { toast } from '@medai/ui';

interface FileWithFormat {
  file: File;
  format: FileFormat | null;
  uploading: boolean;
  uploaded: boolean;
  error?: string;
  studyInstanceUID?: string;
}

/**
 * UploadPage - Smart file upload that routes to Orthanc or direct viewer
 *
 * Features:
 * - Automatic file format detection (DICOM, NIfTI, NRRD, etc.)
 * - DICOM files uploaded to Orthanc PACS server
 * - Non-DICOM files opened directly in viewer
 * - Progress tracking and error handling
 */
export function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileWithFormat[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { setLoading, addImage, persistImage, setActiveImage } = useViewerStore();

  // Handle file selection
  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsProcessing(true);

    // Detect format for each file
    const filesWithFormat: FileWithFormat[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        const format = await detectFileFormat(file);
        filesWithFormat.push({
          file,
          format,
          uploading: false,
          uploaded: false,
        });
      } catch (error) {
        console.error('[Upload] Format detection failed:', error);
        filesWithFormat.push({
          file,
          format: null,
          uploading: false,
          uploaded: false,
          error: 'Format detection failed',
        });
      }
    }

    setFiles(filesWithFormat);
    setIsProcessing(false);
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // Upload DICOM files to Orthanc with auto-detection
  const uploadDicomFiles = async () => {
    const dicomFiles = files.filter(f => f.format && shouldUploadToOrthanc(f.format));

    if (dicomFiles.length === 0) {
      toast.error('No DICOM Files', 'No DICOM files to upload to Orthanc');
      return;
    }

    // Mark files as uploading
    setFiles(prev => prev.map(f => {
      if (f.format && shouldUploadToOrthanc(f.format)) {
        return { ...f, uploading: true };
      }
      return f;
    }));

    // Upload each DICOM file with auto-detection enabled
    const results: UploadResultWithDetection[] = [];
    for (const fileWithFormat of dicomFiles) {
      // Auto AI detection only when the chestxray feature is enabled
      const result = await orthancUploadService.uploadDicomFileWithAutoDetection(
        fileWithFormat.file,
        { enabled: isFeatureEnabled('chestxray'), confidenceThreshold: 0.8 }
      );
      results.push(result);

      // Update file status
      setFiles(prev => prev.map(f => {
        if (f.file === fileWithFormat.file) {
          return {
            ...f,
            uploading: false,
            uploaded: result.success,
            error: result.error,
            studyInstanceUID: result.studyInstanceUID,
          };
        }
        return f;
      }));
    }

    // Show summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const detectionTriggeredCount = results.filter(r => r.detectionTriggered).length;

    if (successCount > 0) {
      let message = `${successCount} file(s) uploaded to Orthanc`;
      if (failCount > 0) {
        message += `, ${failCount} failed`;
      }
      if (detectionTriggeredCount > 0) {
        message += `. AI detection running in background.`;
      }
      toast.success('Upload Complete', message);

      // Navigate back to study browser after a delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } else {
      toast.error('Upload Failed', 'All uploads failed');
    }
  };

  // Open non-DICOM files directly in viewer
  const openInViewer = async () => {
    const nonDicomFiles = files.filter(f => f.format && !shouldUploadToOrthanc(f.format));

    if (nonDicomFiles.length === 0) {
      toast.error('No Files', 'No files to open in viewer');
      return;
    }

    setIsProcessing(true);
    setLoading(true, 0);

    try {
      // Load all non-DICOM files into the viewer
      for (let i = 0; i < nonDicomFiles.length; i++) {
        const fileWithFormat = nonDicomFiles[i];
        try {
          console.log('[UploadPage] Loading file:', fileWithFormat.file.name);
          const image = await LoaderRegistry.loadFile(fileWithFormat.file);
          addImage(image);
          // Explicitly set this image as active (overrides any previously active image)
          setActiveImage(image.imageId);
          // Persist image to IndexedDB
          await persistImage(image);
          setLoading(true, ((i + 1) / nonDicomFiles.length) * 100);
        } catch (error) {
          console.error('[UploadPage] Failed to load file:', error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Load Failed', `Failed to load ${fileWithFormat.file.name}: ${message}`);
        }
      }

      toast.success('Files Loaded', `Loaded ${nonDicomFiles.length} file(s) into viewer`);

      // Navigate to viewer
      setTimeout(() => {
        navigate('/viewer');
      }, 500);
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  // Get file counts
  const dicomCount = files.filter(f => f.format && shouldUploadToOrthanc(f.format)).length;
  const nonDicomCount = files.filter(f => f.format && !shouldUploadToOrthanc(f.format)).length;
  const unknownCount = files.filter(f => !f.format).length;
  const uploadedCount = files.filter(f => f.uploaded).length;

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-gradient-to-r from-[#0f0f18] to-[#12121a] border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white/60" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-bold text-lg tracking-tight leading-none">
                  Upload Files
                </span>
                <span className="text-cyan-400 text-[10px] font-semibold uppercase tracking-widest">
                  Smart Routing
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-semibold mb-1">Smart Upload Routing</p>
              <p className="text-blue-300/80">
                DICOM files will be uploaded to the Orthanc PACS server. Other formats (NIfTI, NRRD, etc.)
                will be opened directly in the viewer.
              </p>
            </div>
          </div>
        </div>

        {/* Drop Zone */}
        {files.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-12 transition-all ${
              isDragging
                ? 'border-cyan-500 bg-cyan-500/5'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-white/40" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Drop files here or click to browse
              </h3>
              <p className="text-sm text-white/40 mb-6">
                Supports DICOM, NIfTI (.nii, .nii.gz), NRRD, and other medical image formats
              </p>
              <div className="flex gap-3">
                <label className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 rounded-xl text-sm font-semibold cursor-pointer transition-colors">
                  Select Files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    accept=".dcm,.nii,.gz,.nrrd,.nhdr,.mhd,.mha"
                  />
                </label>
                <label className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-sm font-semibold cursor-pointer transition-colors">
                  Select Folder
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    {...{ webkitdirectory: '', directory: '' } as any}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-white/60">To Orthanc</span>
                </div>
                <div className="text-2xl font-bold text-white">{dicomCount}</div>
                <div className="text-xs text-white/40">DICOM files</div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <HardDrive className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-white/60">Direct Viewer</span>
                </div>
                <div className="text-2xl font-bold text-white">{nonDicomCount}</div>
                <div className="text-xs text-white/40">Non-DICOM files</div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  <span className="text-sm text-white/60">Unknown</span>
                </div>
                <div className="text-2xl font-bold text-white">{unknownCount}</div>
                <div className="text-xs text-white/40">Unrecognized format</div>
              </div>
            </div>

            {/* File List */}
            <div className="space-y-2 mb-6">
              {files.map((fileWithFormat, index) => (
                <div
                  key={index}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4"
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {fileWithFormat.uploading ? (
                      <Loader className="w-5 h-5 text-cyan-400 animate-spin" />
                    ) : fileWithFormat.uploaded ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : fileWithFormat.error ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <FileText className="w-5 h-5 text-white/40" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">
                      {fileWithFormat.file.name}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/40">
                      <span>{(fileWithFormat.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      {fileWithFormat.format && (
                        <>
                          <span>•</span>
                          <span>{getFormatDescription(fileWithFormat.format)}</span>
                        </>
                      )}
                      {fileWithFormat.error && (
                        <>
                          <span>•</span>
                          <span className="text-red-400">{fileWithFormat.error}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Destination Badge */}
                  <div className="flex-shrink-0">
                    {fileWithFormat.format && shouldUploadToOrthanc(fileWithFormat.format) ? (
                      <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
                        Orthanc
                      </span>
                    ) : fileWithFormat.format ? (
                      <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg">
                        Viewer
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg">
                        Unknown
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={uploadDicomFiles}
                disabled={dicomCount === 0 || uploadedCount === dicomCount || isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Database className="w-4 h-4" />
                Upload to Orthanc ({dicomCount})
              </button>

              <button
                onClick={openInViewer}
                disabled={nonDicomCount === 0 || isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <HardDrive className="w-4 h-4" />
                Open in Viewer ({nonDicomCount})
              </button>

              <button
                onClick={() => setFiles([])}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
