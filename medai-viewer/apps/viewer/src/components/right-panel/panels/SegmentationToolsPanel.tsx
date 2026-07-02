import React, { useRef } from 'react';
import { Plus, SquarePlus, Upload, Download, Loader2 } from 'lucide-react';
import { Panel, Button } from '@medai/ui';

interface SegmentationToolsPanelProps {
  hasImage: boolean;
  activeSegmentationId: string | null;
  isCreatingSegmentation: boolean;
  isLoadingLabel: boolean;
  onCreateSegmentation: () => void;
  onLabelFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportLabel: () => void;
}

export function SegmentationToolsPanel({
  hasImage,
  activeSegmentationId,
  isCreatingSegmentation,
  isLoadingLabel,
  onCreateSegmentation,
  onLabelFileSelect,
  onExportLabel,
}: SegmentationToolsPanelProps) {
  const labelInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-4">
      <Panel title="Segmentation Tools">
        <div className="space-y-3">
          {/* Create / Load / Export Buttons */}
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={onCreateSegmentation}
              disabled={!hasImage || isCreatingSegmentation}
              data-testid="create-segmentation-button"
              title={activeSegmentationId ? 'Add a new segment to the current segmentation' : 'Create a new segmentation'}
            >
              {isCreatingSegmentation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {activeSegmentationId ? (
                    <>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Seg
                    </>
                  ) : (
                    <>
                      <SquarePlus className="h-4 w-4 mr-1" />
                      Create
                    </>
                  )}
                </>
              )}
            </Button>
            {/* Note: Using * to show all files by default since .nii/.nrrd don't have registered MIME types
                and browsers show "Custom Files" which is confusing. File validation happens on load. */}
            <input
              ref={labelInputRef}
              type="file"
              accept="*"
              onChange={onLabelFileSelect}
              className="hidden"
              data-testid="label-file-input"
            />
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => labelInputRef.current?.click()}
              disabled={!hasImage || isLoadingLabel}
              data-testid="load-label-button"
            >
              {isLoadingLabel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Load
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!activeSegmentationId}
              onClick={onExportLabel}
              data-testid="export-label-button"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>

          {/* Tool Instructions */}
          <p className="text-text-muted text-xs">
            {!hasImage
              ? 'Load an image first.'
              : !activeSegmentationId
              ? 'Click "Create" to start a new segmentation, or load an existing label.'
              : 'Use the annotation tools in the toolbar above to edit segments.'}
          </p>
        </div>
      </Panel>
    </div>
  );
}
