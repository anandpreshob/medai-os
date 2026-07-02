/**
 * BatchExportSection - Export options for batch processing results
 *
 * Features:
 * - Format selector (COCO, YOLO, VOC, PNG masks, DICOM-SEG, NIfTI)
 * - Options per format (train/val split, color coding)
 * - Destination selector (download, PACS, cloud)
 * - Export button with progress
 */

import React, { useState, useCallback } from 'react';
import {
  Download,
  Server,
  Cloud,
  FileJson,
  FileImage,
  Layers,
  Settings,
  CheckCircle,
  Loader2,
  AlertCircle,
  ChevronRight,
  Info,
} from 'lucide-react';
import { Button, Spinner, toast } from '@medai/ui';
import {
  useBatchProcessingStore,
  type BatchExportFormat,
  type BatchExportSettings,
} from '@medai/core';

interface FormatOption {
  id: BatchExportFormat;
  name: string;
  description: string;
  icon: React.ReactNode;
  hasTrainValSplit?: boolean;
  hasColorCoding?: boolean;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'coco',
    name: 'COCO JSON',
    description: 'Common Objects in Context format for ML training',
    icon: <FileJson className="w-5 h-5" />,
    hasTrainValSplit: true,
    hasColorCoding: false,
  },
  {
    id: 'yolo',
    name: 'YOLO',
    description: 'You Only Look Once format with normalized coordinates',
    icon: <FileJson className="w-5 h-5" />,
    hasTrainValSplit: true,
    hasColorCoding: false,
  },
  {
    id: 'voc',
    name: 'Pascal VOC',
    description: 'XML annotations for object detection',
    icon: <FileJson className="w-5 h-5" />,
    hasTrainValSplit: true,
    hasColorCoding: false,
  },
  {
    id: 'png_masks',
    name: 'PNG Masks',
    description: 'Binary or multi-class segmentation masks',
    icon: <FileImage className="w-5 h-5" />,
    hasTrainValSplit: false,
    hasColorCoding: true,
  },
  {
    id: 'dicom_seg',
    name: 'DICOM-SEG',
    description: 'DICOM Segmentation Objects for clinical use',
    icon: <Layers className="w-5 h-5" />,
    hasTrainValSplit: false,
    hasColorCoding: true,
  },
  {
    id: 'nifti',
    name: 'NIfTI',
    description: 'Neuroimaging format (.nii.gz) for research',
    icon: <Layers className="w-5 h-5" />,
    hasTrainValSplit: false,
    hasColorCoding: false,
  },
];

interface DestinationOption {
  id: 'download' | 'pacs' | 'cloud';
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
}

const DESTINATION_OPTIONS: DestinationOption[] = [
  {
    id: 'download',
    name: 'Download',
    description: 'Save to your local computer',
    icon: <Download className="w-5 h-5" />,
    available: true,
  },
  {
    id: 'pacs',
    name: 'PACS',
    description: 'Send to connected PACS server',
    icon: <Server className="w-5 h-5" />,
    available: false, // Would be enabled when PACS is connected
  },
  {
    id: 'cloud',
    name: 'Cloud Storage',
    description: 'Upload to configured cloud storage',
    icon: <Cloud className="w-5 h-5" />,
    available: false, // Would be enabled when cloud is configured
  },
];

export function BatchExportSection() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Store state
  const {
    exportSettings,
    isExporting,
    exportProgress,
    exportError,
    setExportSettings,
    startExport,
    updateExportProgress,
    completeExport,
    setExportError,
    getAcceptedResults,
    getResultStats,
  } = useBatchProcessingStore();

  const acceptedResults = getAcceptedResults();
  const stats = getResultStats();
  const selectedFormat = FORMAT_OPTIONS.find((f) => f.id === exportSettings.format);

  /**
   * Handle format change
   */
  const handleFormatChange = useCallback((format: BatchExportFormat) => {
    setExportSettings({ format });
  }, [setExportSettings]);

  /**
   * Handle destination change
   */
  const handleDestinationChange = useCallback((destination: 'download' | 'pacs' | 'cloud') => {
    setExportSettings({ destination });
  }, [setExportSettings]);

  /**
   * Handle train/val split change
   */
  const handleSplitChange = useCallback((value: number) => {
    setExportSettings({ trainValSplit: value / 100 });
  }, [setExportSettings]);

  /**
   * Handle export
   */
  const handleExport = useCallback(async () => {
    if (acceptedResults.length === 0) {
      toast.error('No Results', 'Please accept some results before exporting');
      return;
    }

    startExport();

    try {
      // Simulate export process
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        updateExportProgress(i);
      }

      completeExport();
      toast.success('Export Complete', `Exported ${acceptedResults.length} results as ${exportSettings.format.toUpperCase()}`);

      // In a real implementation, this would trigger file download or upload
      // For now, we'll just show a success message
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed');
      toast.error('Export Failed', 'An error occurred during export');
    }
  }, [acceptedResults, exportSettings, startExport, updateExportProgress, completeExport, setExportError]);

  return (
    <div className="space-y-6">
      {/* Export Summary */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10 border border-accent-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">
                Export {stats.accepted} Results
              </h3>
              <p className="text-sm text-text-muted">
                {exportSettings.includeOnlyAccepted ? 'Only accepted results' : 'All results'} will be exported
              </p>
            </div>
          </div>

          {/* Include Only Accepted Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={exportSettings.includeOnlyAccepted}
              onChange={(e) => setExportSettings({ includeOnlyAccepted: e.target.checked })}
              className="w-4 h-4 rounded border-border-default text-accent-primary focus:ring-accent-primary/50"
            />
            <span className="text-sm text-text-secondary">Include only accepted</span>
          </label>
        </div>
      </div>

      {/* Format Selection */}
      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
          Export Format
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {FORMAT_OPTIONS.map((format) => (
            <button
              key={format.id}
              onClick={() => handleFormatChange(format.id)}
              className={`
                p-4 rounded-xl text-left transition-all duration-200
                ${exportSettings.format === format.id
                  ? 'bg-accent-primary/10 border-2 border-accent-primary/40 shadow-lg shadow-accent-primary/10'
                  : 'bg-background-tertiary/50 border-2 border-transparent hover:border-border-emphasis hover:bg-background-hover/50'
                }
              `}
            >
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center mb-3
                ${exportSettings.format === format.id
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-background-hover text-text-muted'
                }
              `}>
                {format.icon}
              </div>
              <p className={`text-sm font-medium ${exportSettings.format === format.id ? 'text-text-primary' : 'text-text-secondary'}`}>
                {format.name}
              </p>
              <p className="text-xs text-text-muted mt-1 line-clamp-2">
                {format.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Destination Selection */}
      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
          Destination
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {DESTINATION_OPTIONS.map((dest) => (
            <button
              key={dest.id}
              onClick={() => dest.available && handleDestinationChange(dest.id)}
              disabled={!dest.available}
              className={`
                p-4 rounded-xl text-left transition-all duration-200
                ${!dest.available
                  ? 'opacity-50 cursor-not-allowed bg-background-tertiary/30 border-2 border-transparent'
                  : exportSettings.destination === dest.id
                    ? 'bg-accent-primary/10 border-2 border-accent-primary/40 shadow-lg shadow-accent-primary/10'
                    : 'bg-background-tertiary/50 border-2 border-transparent hover:border-border-emphasis hover:bg-background-hover/50'
                }
              `}
            >
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center mb-3
                ${!dest.available
                  ? 'bg-background-hover/50 text-text-muted'
                  : exportSettings.destination === dest.id
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-background-hover text-text-muted'
                }
              `}>
                {dest.icon}
              </div>
              <p className={`text-sm font-medium ${!dest.available ? 'text-text-muted' : exportSettings.destination === dest.id ? 'text-text-primary' : 'text-text-secondary'}`}>
                {dest.name}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {dest.available ? dest.description : 'Not configured'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Format-Specific Options */}
      {selectedFormat && (selectedFormat.hasTrainValSplit || selectedFormat.hasColorCoding) && (
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Advanced Options</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl bg-background-tertiary/50 border border-border-subtle space-y-4">
              {/* Train/Val Split */}
              {selectedFormat.hasTrainValSplit && (
                <div>
                  <label className="block text-xs text-text-muted mb-2">
                    Train/Validation Split
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="50"
                      max="95"
                      step="5"
                      value={(exportSettings.trainValSplit || 0.8) * 100}
                      onChange={(e) => handleSplitChange(Number(e.target.value))}
                      className="flex-1 h-2 rounded-full appearance-none bg-background-hover cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <span className="text-sm text-text-primary font-medium w-24 text-right">
                      {Math.round((exportSettings.trainValSplit || 0.8) * 100)}% / {Math.round((1 - (exportSettings.trainValSplit || 0.8)) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>Training</span>
                    <span>Validation</span>
                  </div>
                </div>
              )}

              {/* Color Coding */}
              {selectedFormat.hasColorCoding && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">Color-coded masks</p>
                    <p className="text-xs text-text-muted">Use distinct colors for each class</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSettings.colorCoding}
                      onChange={(e) => setExportSettings({ colorCoding: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-background-hover rounded-full peer peer-checked:bg-accent-primary transition-colors
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full
                      after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Export Error */}
      {exportError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-error/10 border border-accent-error/20">
          <AlertCircle className="w-4 h-4 text-accent-error" />
          <span className="text-sm text-accent-error">{exportError}</span>
        </div>
      )}

      {/* Export Progress */}
      {isExporting && (
        <div className="p-4 rounded-xl bg-background-tertiary/50 border border-border-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-primary">Exporting...</span>
            <span className="text-sm text-text-muted">{exportProgress}%</span>
          </div>
          <div className="h-2 bg-background-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex items-center justify-end pt-4 border-t border-border-subtle">
        <Button
          onClick={handleExport}
          disabled={isExporting || acceptedResults.length === 0}
          className="min-w-[200px]"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export {stats.accepted} Results
            </>
          )}
        </Button>
      </div>

      {/* Info Note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-background-tertiary/30">
        <Info className="w-4 h-4 text-text-muted mt-0.5" />
        <div className="text-xs text-text-muted">
          <p className="font-medium mb-1">Export Notes:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Only accepted results will be included in the export</li>
            <li>Large exports may take several minutes to complete</li>
            <li>Files will be organized by class/category when applicable</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default BatchExportSection;
