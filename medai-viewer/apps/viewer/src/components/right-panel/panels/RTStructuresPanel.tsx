/**
 * RTStructuresPanel Component
 *
 * Panel for managing RT (Radiation Therapy) structures in the MedAI RT Suite.
 * Displays structures grouped by type (Targets vs OARs) with visibility and
 * lock controls, and provides import/export functionality for RTSTRUCT files.
 *
 * @module RTStructuresPanel
 */

import React, { useState, useMemo } from 'react';
import { Panel } from '@medai/ui';
import { useSegmentationStore, RT_STRUCTURE_COLORS } from '@medai/core';
import type { Segment } from '@medai/core';
import {
  Layers,
  Download,
  Upload,
  FileCode,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronDown,
} from 'lucide-react';

/**
 * Props for the RTStructuresPanel component
 */
interface RTStructuresPanelProps {
  /** The currently active segmentation ID */
  activeSegmentationId: string | null;
}

/**
 * Target structure prefixes for grouping
 */
const TARGET_PREFIXES = ['GTV', 'CTV', 'PTV', 'ITV'];

/**
 * Determines if a structure is a target (GTV, CTV, PTV, ITV)
 */
function isTargetStructure(label: string): boolean {
  const upperLabel = label.toUpperCase();
  return TARGET_PREFIXES.some(
    (prefix) => upperLabel.startsWith(prefix) || upperLabel.includes(prefix)
  );
}

/**
 * Gets the RT structure color for a given label
 * Falls back to a default color if not found
 */
function getStructureColor(label: string): string {
  // Check exact match first
  if (RT_STRUCTURE_COLORS[label]) {
    return RT_STRUCTURE_COLORS[label];
  }

  // Check for prefix matches (e.g., GTV_Primary -> GTV color)
  for (const [key, color] of Object.entries(RT_STRUCTURE_COLORS)) {
    if (label.toUpperCase().startsWith(key.toUpperCase())) {
      return color;
    }
  }

  // Default color for unknown structures
  return '#808080';
}

/**
 * Props for a single structure row
 */
interface StructureRowProps {
  segment: Segment;
  segmentationId: string;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
}

/**
 * Individual structure row component
 */
function StructureRow({
  segment,
  onToggleVisibility,
  onToggleLock,
}: StructureRowProps) {
  const displayColor = segment.color || getStructureColor(segment.label);

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg bg-background-tertiary/30 hover:bg-background-hover transition-colors"
      data-testid={`rt-structure-${segment.segmentIndex}`}
    >
      {/* Color indicator */}
      <div
        className="w-4 h-4 rounded-sm flex-shrink-0 shadow-inner-soft"
        style={{ backgroundColor: displayColor }}
        title={`Structure color: ${displayColor}`}
      />

      {/* Structure name */}
      <span className="text-sm text-text-primary flex-1 truncate">
        {segment.label}
      </span>

      {/* Lock toggle */}
      <button
        className={`p-1.5 rounded-lg transition-colors ${
          segment.locked
            ? 'text-accent-warning bg-accent-warning/10'
            : 'text-text-muted hover:bg-background-hover'
        }`}
        title={segment.locked ? 'Unlock structure' : 'Lock structure'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock();
        }}
      >
        {segment.locked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Unlock className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Visibility toggle */}
      <button
        className={`p-1.5 rounded-lg transition-colors ${
          segment.visible
            ? 'text-text-secondary hover:bg-background-hover'
            : 'text-text-muted bg-background-tertiary/50'
        }`}
        title={segment.visible ? 'Hide structure' : 'Show structure'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
      >
        {segment.visible ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

/**
 * Props for a collapsible structure group
 */
interface StructureGroupProps {
  title: string;
  icon: React.ReactNode;
  structures: Segment[];
  segmentationId: string;
  defaultExpanded?: boolean;
  onToggleVisibility: (segment: Segment) => void;
  onToggleLock: (segment: Segment) => void;
}

/**
 * Collapsible group of structures
 */
function StructureGroup({
  title,
  icon,
  structures,
  segmentationId,
  defaultExpanded = true,
  onToggleVisibility,
  onToggleLock,
}: StructureGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (structures.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      {/* Group header */}
      <button
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-background-hover/50 rounded-lg transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronDown
          className={`h-4 w-4 text-text-muted transition-transform duration-200 ${
            isExpanded ? '' : '-rotate-90'
          }`}
        />
        {icon}
        <span className="text-sm font-medium text-text-primary flex-1">
          {title}
        </span>
        <span className="text-2xs text-text-muted px-1.5 py-0.5 bg-background-tertiary rounded-full">
          {structures.length}
        </span>
      </button>

      {/* Group content */}
      {isExpanded && (
        <div className="mt-1.5 ml-6 space-y-1.5">
          {structures.map((segment) => (
            <StructureRow
              key={segment.segmentIndex}
              segment={segment}
              segmentationId={segmentationId}
              onToggleVisibility={() => onToggleVisibility(segment)}
              onToggleLock={() => onToggleLock(segment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * RTStructuresPanel Component
 *
 * Displays RT structures organized by type (Targets vs OARs) with controls
 * for visibility, locking, and import/export of RTSTRUCT files.
 *
 * @param props - Component props
 * @returns The RTStructuresPanel component
 *
 * @example
 * ```tsx
 * <RTStructuresPanel activeSegmentationId="seg-123" />
 * ```
 */
export function RTStructuresPanel({ activeSegmentationId }: RTStructuresPanelProps) {
  const { segmentations, toggleSegmentVisibility, toggleSegmentLock } =
    useSegmentationStore();

  // Get the active segmentation
  const activeSegmentation = useMemo(() => {
    return segmentations.find((s) => s.id === activeSegmentationId);
  }, [segmentations, activeSegmentationId]);

  // Get segments from active segmentation
  const segments = activeSegmentation?.segments || [];

  // Group structures into Targets and OARs
  const { targets, oars } = useMemo(() => {
    const targetStructures: Segment[] = [];
    const oarStructures: Segment[] = [];

    segments.forEach((segment) => {
      if (isTargetStructure(segment.label)) {
        targetStructures.push(segment);
      } else {
        oarStructures.push(segment);
      }
    });

    // Sort targets by hierarchy: GTV -> CTV -> PTV -> ITV
    const targetOrder = ['GTV', 'CTV', 'PTV', 'ITV'];
    targetStructures.sort((a, b) => {
      const aOrder = targetOrder.findIndex((p) =>
        a.label.toUpperCase().startsWith(p)
      );
      const bOrder = targetOrder.findIndex((p) =>
        b.label.toUpperCase().startsWith(p)
      );
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.label.localeCompare(b.label);
    });

    // Sort OARs alphabetically
    oarStructures.sort((a, b) => a.label.localeCompare(b.label));

    return { targets: targetStructures, oars: oarStructures };
  }, [segments]);

  /**
   * Handle visibility toggle for a segment
   */
  const handleToggleVisibility = (segment: Segment) => {
    if (activeSegmentationId) {
      toggleSegmentVisibility(activeSegmentationId, segment.segmentIndex);
    }
  };

  /**
   * Handle lock toggle for a segment
   */
  const handleToggleLock = (segment: Segment) => {
    if (activeSegmentationId) {
      toggleSegmentLock(activeSegmentationId, segment.segmentIndex);
    }
  };

  /**
   * Handle import RTSTRUCT button click
   */
  const handleImportRTStruct = () => {
    console.log('[RTStructuresPanel] Import RTSTRUCT clicked - placeholder');
    // TODO: Implement RTSTRUCT import functionality
  };

  /**
   * Handle export RTSTRUCT button click
   */
  const handleExportRTStruct = () => {
    console.log('[RTStructuresPanel] Export RTSTRUCT clicked - placeholder');
    // TODO: Implement RTSTRUCT export functionality
  };

  // Panel actions for import/export
  const panelActions = (
    <div className="flex items-center gap-1">
      <button
        className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-background-hover transition-colors"
        title="Import RTSTRUCT"
        onClick={handleImportRTStruct}
      >
        <Upload className="h-4 w-4" />
      </button>
      <button
        className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-background-hover transition-colors"
        title="Export RTSTRUCT"
        onClick={handleExportRTStruct}
        disabled={segments.length === 0}
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="mt-4">
      <Panel
        title="RT Structures"
        actions={panelActions}
        badge={segments.length > 0 ? segments.length : undefined}
      >
        {segments.length === 0 ? (
          // Empty state
          <div className="text-center py-6">
            <div className="mx-auto w-12 h-12 rounded-xl bg-background-tertiary/50 flex items-center justify-center mb-3">
              <FileCode className="h-6 w-6 text-text-muted" />
            </div>
            <p className="text-text-muted text-sm mb-2">
              No RT structures loaded
            </p>
            <p className="text-text-muted text-xs leading-relaxed max-w-[200px] mx-auto">
              Import an RTSTRUCT file or create structures using the
              segmentation tools.
            </p>
            <button
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-sm text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors"
              onClick={handleImportRTStruct}
            >
              <Upload className="h-4 w-4" />
              Import RTSTRUCT
            </button>
          </div>
        ) : (
          // Structure list grouped by type
          <div>
            {/* Targets group */}
            <StructureGroup
              title="Targets"
              icon={<Layers className="h-4 w-4 text-accent-error" />}
              structures={targets}
              segmentationId={activeSegmentationId!}
              defaultExpanded={true}
              onToggleVisibility={handleToggleVisibility}
              onToggleLock={handleToggleLock}
            />

            {/* OARs group */}
            <StructureGroup
              title="Organs at Risk (OARs)"
              icon={<Layers className="h-4 w-4 text-accent-info" />}
              structures={oars}
              segmentationId={activeSegmentationId!}
              defaultExpanded={true}
              onToggleVisibility={handleToggleVisibility}
              onToggleLock={handleToggleLock}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}

export default RTStructuresPanel;
