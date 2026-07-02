/**
 * RECISTNonTargetPanel - Non-target lesion tracking for RECIST 1.1
 *
 * Features:
 * - Track non-target lesions with status (present/absent/progression)
 * - Track new lesions appearing after baseline
 * - Overall non-target status summary
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Circle,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  MinusCircle,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Panel, Button } from '@medai/ui';
import {
  useRECISTStore,
  useNonTargetLesions,
  useNewLesions,
  useSegmentationStore,
  ANATOMICAL_REGIONS,
  type RECISTLesion,
  type NonTargetStatus,
} from '@medai/core';

interface RECISTNonTargetPanelProps {
  /** The ID of the currently active segmentation */
  activeSegmentationId: string | null;
}

/**
 * Get status display config.
 */
function getStatusConfig(status: NonTargetStatus): {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'absent':
      return {
        label: 'Absent (CR)',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        icon: <CheckCircle className="w-4 h-4" />,
      };
    case 'present':
      return {
        label: 'Present',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        icon: <MinusCircle className="w-4 h-4" />,
      };
    case 'unequivocal_progression':
      return {
        label: 'Progression',
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        icon: <TrendingUp className="w-4 h-4" />,
      };
  }
}

/**
 * Non-target lesion row component.
 */
function NonTargetLesionRow({
  lesion,
  onRemove,
  onStatusChange,
}: {
  lesion: RECISTLesion;
  onRemove: () => void;
  onStatusChange: (status: NonTargetStatus) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const status = lesion.nonTargetStatus ?? 'present';
  const statusConfig = getStatusConfig(status);

  return (
    <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted bg-background-hover px-1.5 py-0.5 rounded">
            NT
          </span>
          <span className="text-sm font-medium text-text-primary truncate max-w-[140px]">
            {lesion.label || lesion.anatomicalRegion}
          </span>
          {lesion.isLymphNode && (
            <span className="text-2xs text-text-muted bg-background-hover px-1.5 py-0.5 rounded">
              LN
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          className="p-1 hover:bg-red-500/10 rounded transition-colors"
          title="Remove lesion"
        >
          <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-red-400" />
        </button>
      </div>

      {/* Status Selector */}
      <div className="relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded ${statusConfig.bgColor} border border-transparent hover:border-border-subtle transition-colors`}
        >
          <div className={`flex items-center gap-2 ${statusConfig.color}`}>
            {statusConfig.icon}
            <span className="text-sm font-medium">{statusConfig.label}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} />
        </button>

        {showStatusMenu && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-background-secondary border border-border-subtle rounded-lg shadow-lg z-10 overflow-hidden">
            {(['present', 'absent', 'unequivocal_progression'] as NonTargetStatus[]).map((s) => {
              const config = getStatusConfig(s);
              return (
                <button
                  key={s}
                  onClick={() => {
                    onStatusChange(s);
                    setShowStatusMenu(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-background-hover transition-colors ${
                    s === status ? config.bgColor : ''
                  }`}
                >
                  <span className={config.color}>{config.icon}</span>
                  <span className={`text-sm ${config.color}`}>{config.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 text-2xs text-text-muted truncate">
        {lesion.anatomicalRegion}
      </div>
    </div>
  );
}

/**
 * New lesion row component.
 */
function NewLesionRow({
  lesion,
  index,
  onRemove,
}: {
  lesion: RECISTLesion;
  index: number;
  onRemove: () => void;
}) {
  return (
    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
            NEW
          </span>
          <span className="text-sm font-medium text-text-primary truncate max-w-[140px]">
            {lesion.label || `New Lesion ${index + 1}`}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="p-1 hover:bg-red-500/10 rounded transition-colors"
          title="Remove lesion"
        >
          <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-red-400" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-red-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Indicates Progressive Disease (PD)</span>
      </div>

      <div className="mt-2 text-2xs text-text-muted truncate">
        {lesion.anatomicalRegion}
      </div>
    </div>
  );
}

/**
 * Add lesion form.
 */
function AddLesionForm({
  type,
  segments,
  onAdd,
  onCancel,
}: {
  type: 'non_target' | 'new';
  segments: Array<{ segmentIndex: number; label: string }>;
  onAdd: (params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode: boolean;
    longestDiameterMm: number;
    shortAxisMm?: number;
    label?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [anatomicalRegion, setAnatomicalRegion] = useState<string>(ANATOMICAL_REGIONS[0]);
  const [isLymphNode, setIsLymphNode] = useState(false);
  const [diameter, setDiameter] = useState('');
  const [shortAxis, setShortAxis] = useState('');
  const [label, setLabel] = useState('');

  React.useEffect(() => {
    setIsLymphNode(anatomicalRegion.toLowerCase().startsWith('lymph node'));
  }, [anatomicalRegion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedSegment === null) return;

    const diameterMm = diameter ? parseFloat(diameter) : 0;

    onAdd({
      segmentIndex: selectedSegment,
      anatomicalRegion,
      isLymphNode,
      longestDiameterMm: diameterMm,
      shortAxisMm: shortAxis ? parseFloat(shortAxis) : undefined,
      label: label || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-background-tertiary/50 rounded-lg border border-border-subtle">
      <div className="text-sm font-medium text-text-primary mb-2">
        Add {type === 'new' ? 'New' : 'Non-Target'} Lesion
      </div>

      <div>
        <label className="text-xs text-text-muted block mb-1">Segment</label>
        <select
          value={selectedSegment ?? ''}
          onChange={(e) => setSelectedSegment(parseInt(e.target.value))}
          className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
          required
        >
          <option value="">Select segment...</option>
          {segments.map((seg) => (
            <option key={seg.segmentIndex} value={seg.segmentIndex}>
              {seg.label || `Segment ${seg.segmentIndex}`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-text-muted block mb-1">Anatomical Region</label>
        <select
          value={anatomicalRegion}
          onChange={(e) => setAnatomicalRegion(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
        >
          {ANATOMICAL_REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-text-muted block mb-1">
            Diameter (mm, optional)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
            placeholder="Optional"
          />
        </div>
        {isLymphNode && (
          <div>
            <label className="text-xs text-text-muted block mb-1">
              Short Axis (mm)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={shortAxis}
              onChange={(e) => setShortAxis(e.target.value)}
              className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
              placeholder="Optional"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-text-muted block mb-1">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
          placeholder="e.g., Peritoneal implant"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button size="sm" type="submit">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add
        </Button>
      </div>
    </form>
  );
}

/**
 * RECISTNonTargetPanel component.
 */
export function RECISTNonTargetPanel({
  activeSegmentationId,
}: RECISTNonTargetPanelProps) {
  const [showNonTargetForm, setShowNonTargetForm] = useState(false);
  const [showNewLesionForm, setShowNewLesionForm] = useState(false);
  const [nonTargetExpanded, setNonTargetExpanded] = useState(true);
  const [newLesionsExpanded, setNewLesionsExpanded] = useState(true);

  // RECIST store
  const nonTargetLesions = useNonTargetLesions();
  const newLesions = useNewLesions();
  const addNonTargetLesion = useRECISTStore((state) => state.addNonTargetLesion);
  const addNewLesion = useRECISTStore((state) => state.addNewLesion);
  const removeLesion = useRECISTStore((state) => state.removeLesion);
  const setNonTargetStatus = useRECISTStore((state) => state.setNonTargetStatus);

  // Segmentation store
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  // Compute overall non-target status
  const overallNonTargetStatus = useMemo(() => {
    if (nonTargetLesions.length === 0) return 'absent' as NonTargetStatus;
    if (nonTargetLesions.some((l) => l.nonTargetStatus === 'unequivocal_progression')) {
      return 'unequivocal_progression' as NonTargetStatus;
    }
    if (nonTargetLesions.every((l) => l.nonTargetStatus === 'absent')) {
      return 'absent' as NonTargetStatus;
    }
    return 'present' as NonTargetStatus;
  }, [nonTargetLesions]);

  const overallStatusConfig = getStatusConfig(overallNonTargetStatus);

  const handleAddNonTarget = useCallback((params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode: boolean;
    longestDiameterMm: number;
    shortAxisMm?: number;
    label?: string;
  }) => {
    addNonTargetLesion({
      segmentIndex: params.segmentIndex,
      anatomicalRegion: params.anatomicalRegion,
      isLymphNode: params.isLymphNode,
      baselineLongestDiameterMm: params.longestDiameterMm,
      baselineShortAxisMm: params.shortAxisMm,
      label: params.label,
    });
    setShowNonTargetForm(false);
  }, [addNonTargetLesion]);

  const handleAddNewLesion = useCallback((params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode: boolean;
    longestDiameterMm: number;
    shortAxisMm?: number;
    label?: string;
  }) => {
    addNewLesion({
      segmentIndex: params.segmentIndex,
      anatomicalRegion: params.anatomicalRegion,
      isLymphNode: params.isLymphNode,
      currentLongestDiameterMm: params.longestDiameterMm,
      currentShortAxisMm: params.shortAxisMm,
      label: params.label,
    });
    setShowNewLesionForm(false);
  }, [addNewLesion]);

  return (
    <div className="mt-4 space-y-4">
      {/* Non-Target Lesions Panel */}
      <Panel
        title="Non-Target Lesions"
        collapsible
        badge={nonTargetLesions.length > 0 ? nonTargetLesions.length : undefined}
        actions={
          <Circle className="h-4 w-4 text-text-muted" />
        }
      >
        {/* Overall Status Summary */}
        {nonTargetLesions.length > 0 && (
          <div className={`mb-4 p-3 rounded-lg border ${overallStatusConfig.bgColor} border-opacity-30`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                Overall Non-Target Status
              </span>
              <div className={`flex items-center gap-1 ${overallStatusConfig.color}`}>
                {overallStatusConfig.icon}
                <span className="text-sm font-semibold">{overallStatusConfig.label}</span>
              </div>
            </div>
          </div>
        )}

        {/* Non-Target Lesions List */}
        {nonTargetLesions.length > 0 ? (
          <div className="space-y-2 mb-3">
            {nonTargetLesions.map((lesion) => (
              <NonTargetLesionRow
                key={lesion.id}
                lesion={lesion}
                onRemove={() => removeLesion(lesion.id)}
                onStatusChange={(status) => setNonTargetStatus(lesion.id, status)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 mb-3">
            <Circle className="w-8 h-8 mx-auto text-text-muted mb-2" />
            <p className="text-sm text-text-muted">No non-target lesions</p>
            <p className="text-xs text-text-disabled mt-1">
              Track non-measurable disease sites
            </p>
          </div>
        )}

        {/* Add Non-Target Form or Button */}
        {showNonTargetForm ? (
          <AddLesionForm
            type="non_target"
            segments={activeSegmentation?.segments ?? []}
            onAdd={handleAddNonTarget}
            onCancel={() => setShowNonTargetForm(false)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowNonTargetForm(true)}
            disabled={!activeSegmentationId}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Non-Target Lesion
          </Button>
        )}
      </Panel>

      {/* New Lesions Panel */}
      <Panel
        title="New Lesions"
        collapsible
        badge={newLesions.length > 0 ? newLesions.length : undefined}
        actions={
          newLesions.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-red-400" />
          ) : (
            <AlertCircle className="h-4 w-4 text-text-muted" />
          )
        }
      >
        {/* Warning Banner */}
        {newLesions.length > 0 && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">
                {newLesions.length} new lesion{newLesions.length > 1 ? 's' : ''} detected
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 ml-6">
              New lesions indicate Progressive Disease (PD) regardless of other findings
            </p>
          </div>
        )}

        {/* New Lesions List */}
        {newLesions.length > 0 ? (
          <div className="space-y-2 mb-3">
            {newLesions.map((lesion, index) => (
              <NewLesionRow
                key={lesion.id}
                lesion={lesion}
                index={index}
                onRemove={() => removeLesion(lesion.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 mb-3">
            <CheckCircle className="w-8 h-8 mx-auto text-green-400/50 mb-2" />
            <p className="text-sm text-text-muted">No new lesions</p>
            <p className="text-xs text-text-disabled mt-1">
              Good - no new disease detected
            </p>
          </div>
        )}

        {/* Add New Lesion Form or Button */}
        {showNewLesionForm ? (
          <AddLesionForm
            type="new"
            segments={activeSegmentation?.segments ?? []}
            onAdd={handleAddNewLesion}
            onCancel={() => setShowNewLesionForm(false)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowNewLesionForm(true)}
            disabled={!activeSegmentationId}
          >
            <Plus className="w-4 h-4 mr-1" />
            Report New Lesion
          </Button>
        )}
      </Panel>
    </div>
  );
}

export default RECISTNonTargetPanel;
