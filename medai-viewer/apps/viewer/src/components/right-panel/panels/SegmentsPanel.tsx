import React, { useState, useCallback } from 'react';
import { Download, Lock, Unlock, FileCheck, Loader2 } from 'lucide-react';
import { Panel, Button, toast } from '@medai/ui';
import type { Segment, SegmentationStatus } from '@medai/core';
import { SegmentItem } from '../components/SegmentItem';

interface SegmentsPanelProps {
  segments: Segment[];
  activeSegmentationId: string | null;
  activeSegmentIndex: number | null;
  segmentationStatus?: SegmentationStatus;
  onSegmentSelect: (segment: Segment) => void;
  onUpdateLabel: (segmentIndex: number, newLabel: string) => void;
  onToggleVisibility: (segment: Segment) => void;
  onExportDicomSeg?: () => Promise<void>;
  onExportJson?: () => Promise<void>;
  onStatusChange?: (status: SegmentationStatus) => void;
}

export function SegmentsPanel({
  segments,
  activeSegmentationId,
  activeSegmentIndex,
  segmentationStatus = 'draft',
  onSegmentSelect,
  onUpdateLabel,
  onToggleVisibility,
  onExportDicomSeg,
  onExportJson,
  onStatusChange,
}: SegmentsPanelProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<'dicomseg' | 'json' | null>(null);

  const isFinal = segmentationStatus === 'final';
  const hasSegments = segments.length > 0;

  const handleExportDicomSeg = useCallback(async () => {
    if (!onExportDicomSeg || !hasSegments) return;

    setIsExporting(true);
    setExportType('dicomseg');
    try {
      await onExportDicomSeg();
      toast.success('Export Complete', 'DICOM-SEG file downloaded');
    } catch (error) {
      console.error('[SegmentsPanel] DICOM-SEG export failed:', error);
      toast.error('Export Failed', 'Failed to export DICOM-SEG');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  }, [onExportDicomSeg, hasSegments]);

  const handleExportJson = useCallback(async () => {
    if (!onExportJson || !hasSegments) return;

    setIsExporting(true);
    setExportType('json');
    try {
      await onExportJson();
      toast.success('Export Complete', 'JSON measurements file downloaded');
    } catch (error) {
      console.error('[SegmentsPanel] JSON export failed:', error);
      toast.error('Export Failed', 'Failed to export measurements');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  }, [onExportJson, hasSegments]);

  const handleToggleStatus = useCallback(() => {
    if (!onStatusChange) return;

    const newStatus: SegmentationStatus = isFinal ? 'draft' : 'final';

    if (newStatus === 'final') {
      // Confirm before finalizing
      if (!window.confirm('Finalize this segmentation? Once finalized, it cannot be edited.')) {
        return;
      }
    }

    onStatusChange(newStatus);
    toast.success(
      newStatus === 'final' ? 'Segmentation Finalized' : 'Segmentation Unlocked',
      newStatus === 'final'
        ? 'This segmentation is now locked for editing'
        : 'This segmentation can now be edited'
    );
  }, [isFinal, onStatusChange]);

  return (
    <div className="mt-4">
      <Panel title="Segments">
        {/* Status badge and actions */}
        {hasSegments && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-border-subtle">
            {/* Status badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                isFinal
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-yellow-500/10 text-yellow-400'
              }`}
            >
              {isFinal ? (
                <>
                  <Lock className="w-3 h-3" />
                  Final
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  Draft
                </>
              )}
            </div>

            {/* Status toggle button */}
            {onStatusChange && (
              <button
                onClick={handleToggleStatus}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  isFinal
                    ? 'text-yellow-400 hover:bg-yellow-500/10'
                    : 'text-green-400 hover:bg-green-500/10'
                }`}
                title={isFinal ? 'Unlock for editing' : 'Finalize segmentation'}
              >
                {isFinal ? 'Unlock' : 'Finalize'}
              </button>
            )}
          </div>
        )}

        {/* Segments list */}
        {segments.length === 0 ? (
          <p className="text-text-muted text-sm">No segments yet. Click "Create" or "Add Seg" to create segments.</p>
        ) : (
          <div className="space-y-2">
            {segments.map((segment) => (
              <SegmentItem
                key={segment.segmentIndex}
                segment={segment}
                segmentationId={activeSegmentationId!}
                isActive={activeSegmentIndex === segment.segmentIndex}
                onSelect={() => onSegmentSelect(segment)}
                onUpdateLabel={(newLabel) => {
                  if (isFinal) {
                    toast.warning('Locked', 'Cannot edit finalized segmentation');
                    return;
                  }
                  onUpdateLabel(segment.segmentIndex, newLabel);
                }}
                onToggleVisibility={() => onToggleVisibility(segment)}
              />
            ))}
          </div>
        )}

        {/* Export buttons */}
        {hasSegments && (onExportDicomSeg || onExportJson) && (
          <div className="mt-4 pt-3 border-t border-border-subtle space-y-2">
            <p className="text-xs text-text-muted font-medium uppercase tracking-wide mb-2">
              Export
            </p>

            <div className="flex gap-2">
              {onExportDicomSeg && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportDicomSeg}
                  disabled={isExporting}
                  className="flex-1"
                >
                  {isExporting && exportType === 'dicomseg' ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  DICOM-SEG
                </Button>
              )}

              {onExportJson && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportJson}
                  disabled={isExporting}
                  className="flex-1"
                >
                  {isExporting && exportType === 'json' ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  JSON
                </Button>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
