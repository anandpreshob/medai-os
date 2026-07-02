/**
 * SurgicalPlanningPanel - Surgical Planning Suite Panel
 *
 * Provides surgical planning tools including:
 * - 3D mesh export options (STL, OBJ, GLB, PLY)
 * - Structure overview with visibility controls
 * - Volume summaries per structure
 * - Export for 3D printing
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useSegmentationStore, useAnalyticsStore } from '@medai/core';
import type { SegmentVolumetrics } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  Scissors,
  Box,
  Download,
  Ruler,
  Move3D,
  Layers,
  Eye,
  EyeOff,
  FileBox,
  Printer,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface SurgicalPlanningPanelProps {
  activeSegmentationId: string | null;
}

type MeshExportFormat = 'stl' | 'obj' | 'glb' | 'ply';

const EXPORT_FORMATS: { value: MeshExportFormat; label: string; description: string }[] = [
  { value: 'stl', label: 'STL', description: '3D Printing (Binary)' },
  { value: 'obj', label: 'OBJ', description: 'Universal 3D Format' },
  { value: 'glb', label: 'GLB', description: 'Web 3D with Colors' },
  { value: 'ply', label: 'PLY', description: 'Point Cloud Format' },
];

/**
 * Formats a volume value to a readable string with appropriate units
 */
function formatVolume(volumeCm3: number): string {
  if (volumeCm3 < 0.001) {
    return `${(volumeCm3 * 1000).toFixed(3)} mm³`;
  }
  if (volumeCm3 < 1) {
    return `${volumeCm3.toFixed(3)} cm³`;
  }
  return `${volumeCm3.toFixed(2)} cm³`;
}

export function SurgicalPlanningPanel({ activeSegmentationId }: SurgicalPlanningPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<MeshExportFormat>('stl');
  const [selectedSegmentIndices, setSelectedSegmentIndices] = useState<Set<number>>(new Set());
  const [copySuccess, setCopySuccess] = useState(false);

  // Get segmentation data
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  // Get analytics data
  const volumetricsResult = useAnalyticsStore((state) => state.volumetricsResult);

  // Derive volume data from volumetrics result
  const volumeData: SegmentVolumetrics[] = useMemo(() => {
    if (!volumetricsResult?.volumetrics?.segments) {
      return [];
    }
    return volumetricsResult.volumetrics.segments;
  }, [volumetricsResult]);

  // Categorize structures by type (bones, vessels, organs, other)
  const categorizedStructures = useMemo(() => {
    const boneKeywords = ['bone', 'vertebra', 'rib', 'hip', 'femur', 'sacrum', 'clavicula', 'scapula', 'humerus', 'sternum'];
    const vesselKeywords = ['aorta', 'vena', 'artery', 'vein', 'portal', 'hepatic', 'pulmonary', 'iliac', 'carotid', 'subclavian'];
    const organKeywords = ['liver', 'kidney', 'spleen', 'pancreas', 'bladder', 'adrenal', 'stomach', 'colon'];

    const bones: SegmentVolumetrics[] = [];
    const vessels: SegmentVolumetrics[] = [];
    const organs: SegmentVolumetrics[] = [];
    const other: SegmentVolumetrics[] = [];

    volumeData.forEach((seg) => {
      const labelLower = seg.label.toLowerCase();
      if (boneKeywords.some((kw) => labelLower.includes(kw))) {
        bones.push(seg);
      } else if (vesselKeywords.some((kw) => labelLower.includes(kw))) {
        vessels.push(seg);
      } else if (organKeywords.some((kw) => labelLower.includes(kw))) {
        organs.push(seg);
      } else {
        other.push(seg);
      }
    });

    return { bones, vessels, organs, other };
  }, [volumeData]);

  // Calculate metrics
  const totalVolume = useMemo(
    () => volumeData.reduce((sum, seg) => sum + seg.total_volume_cm3, 0),
    [volumeData]
  );
  const structureCount = volumeData.length;

  // Toggle segment selection for export
  const toggleSegmentSelection = useCallback((segmentIndex: number) => {
    setSelectedSegmentIndices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(segmentIndex)) {
        newSet.delete(segmentIndex);
      } else {
        newSet.add(segmentIndex);
      }
      return newSet;
    });
  }, []);

  // Select all segments
  const selectAllSegments = useCallback(() => {
    setSelectedSegmentIndices(new Set(volumeData.map((seg) => seg.segment_index)));
  }, [volumeData]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedSegmentIndices(new Set());
  }, []);

  // Export mesh (placeholder - requires backend integration)
  const handleExportMesh = useCallback(() => {
    const segmentsToExport =
      selectedSegmentIndices.size > 0
        ? volumeData.filter((seg) => selectedSegmentIndices.has(seg.segment_index))
        : volumeData;

    if (segmentsToExport.length === 0) {
      console.warn('No segments selected for export');
      return;
    }

    // TODO: Implement actual mesh export via backend
    console.log(`Exporting ${segmentsToExport.length} segments as ${selectedFormat}`);
    console.log('Segments:', segmentsToExport.map((s) => s.label));

    // For now, show a placeholder message
    alert(
      `Mesh export would generate ${selectedFormat.toUpperCase()} file for ${segmentsToExport.length} segment(s).\n\nThis feature requires backend integration.`
    );
  }, [selectedFormat, selectedSegmentIndices, volumeData]);

  // Copy structure list to clipboard
  const handleCopyStructures = useCallback(async () => {
    try {
      const data = {
        segmentationId: activeSegmentationId,
        exportDate: new Date().toISOString(),
        structureCount,
        totalVolumeCm3: totalVolume,
        structures: volumeData.map((seg) => ({
          label: seg.label,
          volumeCm3: seg.total_volume_cm3,
          segmentIndex: seg.segment_index,
        })),
      };
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [activeSegmentationId, structureCount, totalVolume, volumeData]);

  if (!activeSegmentationId) {
    return (
      <div className="mt-4">
        <Panel title="Surgical Planning">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Scissors className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-muted text-sm">No active segmentation.</p>
            <p className="text-text-muted text-xs mt-1">
              Create or load a segmentation for surgical planning.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const hasVolumeData = volumeData.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* Overview Section */}
      <Panel
        title="3D Planning Overview"
        collapsible
        actions={<Move3D className="h-4 w-4 text-blue-500" />}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
            <div className="text-xs text-text-muted">Structures</div>
            <div className="text-lg font-bold text-blue-500">{structureCount}</div>
          </div>
          <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
            <div className="text-xs text-text-muted">Total Volume</div>
            <div className="text-lg font-bold text-text-primary">
              {hasVolumeData ? formatVolume(totalVolume) : '—'}
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        {hasVolumeData && (
          <div className="mt-3 space-y-1">
            {categorizedStructures.bones.length > 0 && (
              <div className="flex justify-between text-xs py-1 px-2 bg-amber-500/10 rounded">
                <span className="text-text-muted">Bone Structures</span>
                <span className="text-amber-500 font-medium">{categorizedStructures.bones.length}</span>
              </div>
            )}
            {categorizedStructures.vessels.length > 0 && (
              <div className="flex justify-between text-xs py-1 px-2 bg-red-500/10 rounded">
                <span className="text-text-muted">Blood Vessels</span>
                <span className="text-red-500 font-medium">{categorizedStructures.vessels.length}</span>
              </div>
            )}
            {categorizedStructures.organs.length > 0 && (
              <div className="flex justify-between text-xs py-1 px-2 bg-purple-500/10 rounded">
                <span className="text-text-muted">Organs</span>
                <span className="text-purple-500 font-medium">{categorizedStructures.organs.length}</span>
              </div>
            )}
            {categorizedStructures.other.length > 0 && (
              <div className="flex justify-between text-xs py-1 px-2 bg-gray-500/10 rounded">
                <span className="text-text-muted">Other</span>
                <span className="text-gray-500 font-medium">{categorizedStructures.other.length}</span>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Structure Selection for Export */}
      <Panel
        title="Select for Export"
        collapsible
        badge={selectedSegmentIndices.size > 0 ? selectedSegmentIndices.size : undefined}
        actions={
          <div className="flex gap-1">
            <button
              onClick={selectAllSegments}
              className="text-xs px-2 py-0.5 hover:bg-background-hover rounded"
            >
              All
            </button>
            <button
              onClick={clearSelection}
              className="text-xs px-2 py-0.5 hover:bg-background-hover rounded"
            >
              None
            </button>
          </div>
        }
      >
        {!hasVolumeData ? (
          <div className="text-center py-4">
            <Layers className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No volume data available.</p>
            <p className="text-text-muted text-xs mt-1">
              Run volumetrics analysis to see structures.
            </p>
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {volumeData.map((seg) => {
              const isSelected = selectedSegmentIndices.has(seg.segment_index);
              const segmentColor =
                activeSegmentation?.segments.find((s) => s.segmentIndex === seg.segment_index)
                  ?.color || '#808080';

              return (
                <div
                  key={seg.segment_index}
                  className={`flex items-center justify-between text-sm py-1.5 px-2 rounded cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-500/20 border border-blue-500/50'
                      : 'hover:bg-background-hover border border-transparent'
                  }`}
                  onClick={() => toggleSegmentSelection(seg.segment_index)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="h-3 w-3 rounded"
                    />
                    <div
                      className="w-3 h-3 rounded flex-shrink-0"
                      style={{ backgroundColor: segmentColor }}
                    />
                    <span className="text-text-primary truncate">{seg.label}</span>
                  </div>
                  <span className="text-text-muted text-xs">
                    {formatVolume(seg.total_volume_cm3)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {selectedSegmentIndices.size > 0 && (
          <div className="mt-2 text-xs text-text-muted text-right">
            {selectedSegmentIndices.size} of {volumeData.length} selected
          </div>
        )}
      </Panel>

      {/* 3D Mesh Export Section */}
      <Panel
        title="3D Mesh Export"
        collapsible
        actions={<FileBox className="h-4 w-4 text-green-500" />}
      >
        <div className="space-y-3">
          {/* Format Selection */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-muted">Export Format</div>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_FORMATS.map((format) => (
                <button
                  key={format.value}
                  onClick={() => setSelectedFormat(format.value)}
                  className={`p-2 rounded border text-left transition-colors ${
                    selectedFormat === format.value
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-border-subtle hover:border-text-muted'
                  }`}
                >
                  <div className="text-xs font-medium text-text-primary">{format.label}</div>
                  <div className="text-[10px] text-text-muted">{format.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <Button
            onClick={handleExportMesh}
            variant="default"
            size="sm"
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={!hasVolumeData}
          >
            <Download className="h-4 w-4 mr-2" />
            Export as {selectedFormat.toUpperCase()}
          </Button>

          {/* 3D Print Info */}
          <div className="flex items-start gap-2 p-2 bg-background-hover/50 rounded text-xs border border-border-subtle">
            <Printer className="h-4 w-4 text-text-muted flex-shrink-0 mt-0.5" />
            <div className="text-text-muted">
              <p className="font-medium text-text-primary">3D Printing Ready</p>
              <p>STL format is recommended for most 3D printers. GLB supports colors.</p>
            </div>
          </div>
        </div>
      </Panel>

      {/* Quick Actions */}
      <Panel
        title="Quick Actions"
        collapsible
        defaultCollapsed
        actions={<Ruler className="h-4 w-4 text-yellow-500" />}
      >
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            Export structure data or use measurement tools in the toolbar.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyStructures}
              disabled={!hasVolumeData}
            >
              {copySuccess ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>

          {!hasVolumeData && (
            <p className="text-text-muted text-xs italic">
              Run volumetrics analysis to enable export options.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default SurgicalPlanningPanel;
