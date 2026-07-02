/**
 * RECISTTargetSelectionPanel - Target lesion selection and management for RECIST 1.1
 *
 * Features:
 * - Add target lesions from segmented regions
 * - Constraint validation (max 5/organ, max 10 total)
 * - Lymph node handling with short axis measurements
 * - Real-time SLD calculation
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Target,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Edit2,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { Panel, Button } from '@medai/ui';
import {
  useRECISTStore,
  useTargetLesions,
  useSLDMetrics,
  useSegmentationStore,
  RECIST_CONSTRAINTS,
  ANATOMICAL_REGIONS,
  type RECISTLesion,
} from '@medai/core';

interface RECISTTargetSelectionPanelProps {
  /** The ID of the currently active segmentation */
  activeSegmentationId: string | null;
}

/**
 * Format measurement for display.
 */
function formatMeasurement(mm: number | undefined, isLymphNode: boolean): string {
  if (mm === undefined) return '--';
  return `${mm.toFixed(1)} mm${isLymphNode ? ' (SA)' : ''}`;
}

/**
 * Target lesion row component.
 */
function TargetLesionRow({
  lesion,
  index,
  onRemove,
  onUpdate,
}: {
  lesion: RECISTLesion;
  index: number;
  onRemove: () => void;
  onUpdate: (updates: Partial<RECISTLesion>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDiameter, setEditDiameter] = useState(lesion.currentLongestDiameterMm?.toString() ?? lesion.baselineLongestDiameterMm.toString());
  const [editShortAxis, setEditShortAxis] = useState(lesion.currentShortAxisMm?.toString() ?? lesion.baselineShortAxisMm?.toString() ?? '');

  const handleSave = () => {
    const updates: Partial<RECISTLesion> = {};

    if (lesion.isLymphNode && editShortAxis) {
      updates.currentShortAxisMm = parseFloat(editShortAxis);
    }
    if (editDiameter) {
      updates.currentLongestDiameterMm = parseFloat(editDiameter);
    }

    onUpdate(updates);
    setIsEditing(false);
  };

  const sldContribution = lesion.isLymphNode
    ? (lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm ?? 0)
    : (lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm);

  return (
    <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded">
            T{index + 1}
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1 hover:bg-background-hover rounded transition-colors"
            title="Edit measurement"
          >
            <Edit2 className="w-3.5 h-3.5 text-text-muted hover:text-text-primary" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-red-500/10 rounded transition-colors"
            title="Remove lesion"
          >
            <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-red-400" />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2 mt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted w-20">Diameter:</label>
            <input
              type="number"
              step="0.1"
              value={editDiameter}
              onChange={(e) => setEditDiameter(e.target.value)}
              className="flex-1 px-2 py-1 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
              placeholder="mm"
            />
          </div>
          {lesion.isLymphNode && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted w-20">Short Axis:</label>
              <input
                type="number"
                step="0.1"
                value={editShortAxis}
                onChange={(e) => setEditShortAxis(e.target.value)}
                className="flex-1 px-2 py-1 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
                placeholder="mm"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-text-muted block">Baseline</span>
            <span className="text-text-secondary font-mono">
              {formatMeasurement(
                lesion.isLymphNode ? lesion.baselineShortAxisMm : lesion.baselineLongestDiameterMm,
                lesion.isLymphNode
              )}
            </span>
          </div>
          <div>
            <span className="text-text-muted block">Current</span>
            <span className="text-text-secondary font-mono">
              {formatMeasurement(
                lesion.isLymphNode
                  ? (lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm)
                  : (lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm),
                lesion.isLymphNode
              )}
            </span>
          </div>
          <div>
            <span className="text-text-muted block">SLD</span>
            <span className="text-text-primary font-mono font-medium">
              {sldContribution.toFixed(1)} mm
            </span>
          </div>
        </div>
      )}

      <div className="mt-2 text-2xs text-text-muted truncate">
        {lesion.anatomicalRegion}
      </div>
    </div>
  );
}

/**
 * Add target lesion form.
 */
function AddTargetLesionForm({
  segments,
  onAdd,
  onCancel,
}: {
  segments: Array<{ segmentIndex: number; label: string }>;
  onAdd: (params: {
    segmentIndex: number;
    anatomicalRegion: string;
    isLymphNode: boolean;
    baselineLongestDiameterMm: number;
    baselineShortAxisMm?: number;
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

  // Auto-detect lymph node from region
  React.useEffect(() => {
    setIsLymphNode(anatomicalRegion.toLowerCase().startsWith('lymph node'));
  }, [anatomicalRegion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedSegment === null || !diameter) return;

    const diameterMm = parseFloat(diameter);
    if (isNaN(diameterMm) || diameterMm <= 0) return;

    // Validate minimum size
    if (isLymphNode) {
      const shortAxisMm = parseFloat(shortAxis);
      if (isNaN(shortAxisMm) || shortAxisMm < RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM) {
        alert(`Lymph node target lesion requires short axis >= ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM}mm`);
        return;
      }
    } else {
      if (diameterMm < RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM) {
        alert(`Target lesion requires diameter >= ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM}mm`);
        return;
      }
    }

    onAdd({
      segmentIndex: selectedSegment,
      anatomicalRegion,
      isLymphNode,
      baselineLongestDiameterMm: diameterMm,
      baselineShortAxisMm: shortAxis ? parseFloat(shortAxis) : undefined,
      label: label || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-background-tertiary/50 rounded-lg border border-border-subtle">
      <div className="text-sm font-medium text-text-primary mb-2">Add Target Lesion</div>

      {/* Segment Selection */}
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

      {/* Anatomical Region */}
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

      {/* Measurements */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-text-muted block mb-1">
            Longest Diameter (mm)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
            placeholder={`>= ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM}`}
            required
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
              placeholder={`>= ${RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM}`}
              required
            />
          </div>
        )}
      </div>

      {/* Optional Label */}
      <div>
        <label className="text-xs text-text-muted block mb-1">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
          placeholder="e.g., Lung nodule RUL"
        />
      </div>

      {/* Actions */}
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
 * RECISTTargetSelectionPanel component.
 */
export function RECISTTargetSelectionPanel({
  activeSegmentationId,
}: RECISTTargetSelectionPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showConstraints, setShowConstraints] = useState(false);

  // RECIST store
  const targetLesions = useTargetLesions();
  const sldMetrics = useSLDMetrics();
  const addTargetLesion = useRECISTStore((state) => state.addTargetLesion);
  const removeLesion = useRECISTStore((state) => state.removeLesion);
  const updateLesionMeasurement = useRECISTStore((state) => state.updateLesionMeasurement);
  const getRemainingTargetSlots = useRECISTStore((state) => state.getRemainingTargetSlots);
  const getValidation = useRECISTStore((state) => state.getValidation);

  // Segmentation store
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  // Validation and remaining slots
  const validation = getValidation();
  const remainingSlots = getRemainingTargetSlots();

  const handleAddLesion = useCallback((params: Parameters<typeof addTargetLesion>[0]) => {
    const result = addTargetLesion(params);
    if (result.success) {
      setShowAddForm(false);
    } else {
      alert(result.error);
    }
  }, [addTargetLesion]);

  const handleUpdateLesion = useCallback((lesionId: string, updates: Partial<RECISTLesion>) => {
    if (updates.currentLongestDiameterMm !== undefined || updates.currentShortAxisMm !== undefined) {
      updateLesionMeasurement(lesionId, {
        currentLongestDiameterMm: updates.currentLongestDiameterMm,
        currentShortAxisMm: updates.currentShortAxisMm,
      });
    }
  }, [updateLesionMeasurement]);

  const canAddMore = remainingSlots.total > 0;

  return (
    <div className="mt-4">
      <Panel
        title="RECIST Target Lesions"
        collapsible
        badge={targetLesions.length > 0 ? targetLesions.length : undefined}
        actions={
          <Target className="h-4 w-4 text-accent-primary" />
        }
      >
        {/* SLD Summary */}
        {targetLesions.length > 0 && (
          <div className="mb-4 p-3 bg-accent-primary/5 border border-accent-primary/20 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">
                Sum of Longest Diameters (SLD)
              </span>
              <span className="text-lg font-bold text-accent-primary">
                {sldMetrics.currentSLD.toFixed(1)} mm
              </span>
            </div>
            {sldMetrics.baselineSLD > 0 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-muted">Baseline:</span>
                  <span className="ml-1 text-text-secondary font-mono">
                    {sldMetrics.baselineSLD.toFixed(1)} mm
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Change:</span>
                  <span className={`ml-1 font-mono ${
                    sldMetrics.changeFromBaseline < -30
                      ? 'text-green-400'
                      : sldMetrics.changeFromBaseline > 20
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}>
                    {sldMetrics.changeFromBaseline >= 0 ? '+' : ''}
                    {sldMetrics.changeFromBaseline.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Constraints Info */}
        <button
          onClick={() => setShowConstraints(!showConstraints)}
          className="w-full flex items-center justify-between p-2 mb-3 text-xs text-text-muted hover:bg-background-hover/30 rounded transition-colors"
        >
          <div className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            <span>RECIST 1.1 Constraints</span>
          </div>
          {showConstraints ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {showConstraints && (
          <div className="mb-3 p-2 text-xs text-text-muted bg-background-tertiary/30 rounded border border-border-subtle">
            <ul className="space-y-1">
              <li>Max {RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL} target lesions total ({remainingSlots.total} remaining)</li>
              <li>Max {RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_PER_ORGAN} per organ</li>
              <li>Minimum lesion size: {RECIST_CONSTRAINTS.MIN_MEASURABLE_LESION_MM}mm</li>
              <li>Lymph node minimum short axis: {RECIST_CONSTRAINTS.MIN_MEASURABLE_LYMPH_NODE_SHORT_AXIS_MM}mm</li>
            </ul>
          </div>
        )}

        {/* Validation Messages */}
        {validation.errors.length > 0 && (
          <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded">
            {validation.errors.map((error, i) => (
              <div key={i} className="flex items-start gap-1 text-xs text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error.message}</span>
              </div>
            ))}
          </div>
        )}

        {validation.warnings.length > 0 && (
          <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
            {validation.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-1 text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Target Lesions List */}
        {targetLesions.length > 0 ? (
          <div className="space-y-2 mb-3">
            {targetLesions.map((lesion, index) => (
              <TargetLesionRow
                key={lesion.id}
                lesion={lesion}
                index={index}
                onRemove={() => removeLesion(lesion.id)}
                onUpdate={(updates) => handleUpdateLesion(lesion.id, updates)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 mb-3">
            <Target className="w-10 h-10 mx-auto text-text-muted mb-2" />
            <p className="text-sm text-text-muted">No target lesions selected</p>
            <p className="text-xs text-text-disabled mt-1">
              Select up to {RECIST_CONSTRAINTS.MAX_TARGET_LESIONS_TOTAL} target lesions for tracking
            </p>
          </div>
        )}

        {/* Add Form or Button */}
        {showAddForm ? (
          <AddTargetLesionForm
            segments={activeSegmentation?.segments ?? []}
            onAdd={handleAddLesion}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAddForm(true)}
            disabled={!canAddMore || !activeSegmentationId}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Target Lesion
            {!canAddMore && ' (Maximum reached)'}
          </Button>
        )}

        {!activeSegmentationId && (
          <p className="text-xs text-text-muted mt-2 text-center">
            Load a segmentation to add target lesions
          </p>
        )}
      </Panel>
    </div>
  );
}

export default RECISTTargetSelectionPanel;
