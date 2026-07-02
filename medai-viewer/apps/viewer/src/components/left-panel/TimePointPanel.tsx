/**
 * TimePointPanel - Displays and manages timepoints in a longitudinal session
 *
 * Features:
 * - Shows current session's timepoints in a visual timeline
 * - Drag-and-drop reordering
 * - Click to activate timepoint
 * - Delete timepoint option
 * - Displays: label, date, thumbnail
 */

import React, { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Clock,
  Calendar,
  GripVertical,
  Trash2,
  Check,
  Eye,
  EyeOff,
  Edit2,
  X,
} from 'lucide-react';
import {
  useLongitudinalStore,
  useActiveSession,
  useActiveTimepoints,
  type LongitudinalTimepoint,
} from '@medai/core';

/**
 * Format date string (YYYYMMDD or ISO) to readable format
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return 'Unknown Date';

  // Handle YYYYMMDD format
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${month}/${day}/${year}`;
  }

  // Handle ISO date
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    // Fall through
  }

  return dateStr;
}

/**
 * Individual sortable timepoint card
 */
interface SortableTimepointItemProps {
  timepoint: LongitudinalTimepoint;
  isActive: boolean;
  isBaseline: boolean;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newLabel: string) => void;
}

function SortableTimepointItem({
  timepoint,
  isActive,
  isBaseline,
  onToggleActive,
  onDelete,
  onRename,
}: SortableTimepointItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(timepoint.label);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: timepoint.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSaveLabel = () => {
    if (editLabel.trim() && editLabel !== timepoint.label) {
      onRename(timepoint.id, editLabel.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setEditLabel(timepoint.label);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative p-3 rounded-xl border transition-all duration-200
        ${isActive
          ? 'bg-gradient-to-br from-accent-primary/15 to-accent-primary/5 border-accent-primary/40 shadow-glow-sm'
          : 'bg-background-tertiary/30 border-border-subtle hover:bg-background-hover hover:border-border-emphasis'
        }
        ${isDragging ? 'z-50 shadow-lg' : ''}
      `}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent-primary to-transparent rounded-t-xl" />
      )}

      {/* Drag handle + content row */}
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          className="mt-1 p-1 rounded cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary hover:bg-background-hover transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Label row */}
          <div className="flex items-center gap-2 mb-1">
            {isEditing ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveLabel}
                  autoFocus
                  className="flex-1 px-2 py-1 text-sm bg-background-secondary border border-accent-primary/40 rounded focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
                <button
                  onClick={handleSaveLabel}
                  className="p-1 text-accent-success hover:bg-accent-success/10 rounded"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditLabel(timepoint.label);
                    setIsEditing(false);
                  }}
                  className="p-1 text-text-muted hover:bg-background-hover rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span
                  className={`text-sm font-semibold truncate ${
                    isActive ? 'text-accent-primary' : 'text-text-primary'
                  }`}
                >
                  {timepoint.label}
                </span>
                {isBaseline && (
                  <span className="px-1.5 py-0.5 text-2xs font-semibold bg-accent-info/20 text-accent-info rounded">
                    Baseline
                  </span>
                )}
              </>
            )}
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(timepoint.acquisitionDateTime || timepoint.studyDate || '')}</span>
          </div>

          {/* Study description if available */}
          {timepoint.studyDescription && (
            <p className="text-xs text-text-secondary truncate mb-2">
              {timepoint.studyDescription}
            </p>
          )}

          {/* Notes if available */}
          {timepoint.notes && (
            <p className="text-xs text-text-muted italic truncate">
              {timepoint.notes}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Toggle active/visible */}
          <button
            onClick={() => onToggleActive(timepoint.id)}
            className={`p-1.5 rounded transition-colors ${
              isActive
                ? 'text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20'
                : 'text-text-muted hover:text-text-primary hover:bg-background-hover'
            }`}
            title={isActive ? 'Hide timepoint' : 'Show timepoint'}
          >
            {isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Edit label */}
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-background-hover rounded transition-colors"
            title="Edit label"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          {/* Delete (disabled for baseline) */}
          <button
            onClick={() => !isBaseline && onDelete(timepoint.id)}
            disabled={isBaseline}
            className={`p-1.5 rounded transition-colors ${
              isBaseline
                ? 'text-text-disabled cursor-not-allowed'
                : 'text-text-muted hover:text-accent-error hover:bg-accent-error/10'
            }`}
            title={isBaseline ? 'Cannot delete baseline' : 'Delete timepoint'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * TimePointPanel - Main panel component
 */
export function TimePointPanel() {
  const session = useActiveSession();
  const activeTimepoints = useActiveTimepoints();
  const {
    setActiveTimepoints,
    removeTimepoint,
    reorderTimepoints,
    updateTimepoint,
    layoutMode,
  } = useLongitudinalStore();

  const activeTimepointIds = useLongitudinalStore((s) => s.activeTimepointIds);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!session) return;

      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = session.timepoints.findIndex((tp) => tp.id === active.id);
        const newIndex = session.timepoints.findIndex((tp) => tp.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(
            session.timepoints.map((tp) => tp.id),
            oldIndex,
            newIndex
          );
          reorderTimepoints(session.id, newOrder);
        }
      }
    },
    [session, reorderTimepoints]
  );

  // Toggle timepoint active state
  const handleToggleActive = useCallback(
    (timepointId: string) => {
      const maxTimepoints = layoutMode === 'longitudinal-3' ? 3 : layoutMode === 'longitudinal-4' ? 4 : 2;

      if (activeTimepointIds.includes(timepointId)) {
        // Remove from active (minimum 1 must remain)
        if (activeTimepointIds.length > 1) {
          setActiveTimepoints(activeTimepointIds.filter((id) => id !== timepointId));
        }
      } else {
        // Add to active (up to max)
        if (activeTimepointIds.length < maxTimepoints) {
          setActiveTimepoints([...activeTimepointIds, timepointId]);
        } else {
          // Replace the last one
          setActiveTimepoints([...activeTimepointIds.slice(0, -1), timepointId]);
        }
      }
    },
    [activeTimepointIds, layoutMode, setActiveTimepoints]
  );

  // Delete timepoint
  const handleDelete = useCallback(
    (timepointId: string) => {
      if (!session) return;
      removeTimepoint(session.id, timepointId);
    },
    [session, removeTimepoint]
  );

  // Rename timepoint
  const handleRename = useCallback(
    (timepointId: string, newLabel: string) => {
      if (!session) return;
      updateTimepoint(session.id, timepointId, { label: newLabel });
    },
    [session, updateTimepoint]
  );

  if (!session) {
    return null;
  }

  const maxTimepoints = layoutMode === 'longitudinal-3' ? 3 : layoutMode === 'longitudinal-4' ? 4 : 2;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">Timepoints</span>
        </div>
        <span className="text-xs text-text-muted">
          {activeTimepointIds.length}/{maxTimepoints} active
        </span>
      </div>

      {/* Timepoint list with drag & drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={session.timepoints.map((tp) => tp.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {session.timepoints.map((timepoint, index) => (
              <SortableTimepointItem
                key={timepoint.id}
                timepoint={timepoint}
                isActive={activeTimepointIds.includes(timepoint.id)}
                isBaseline={index === 0}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {session.timepoints.length === 0 && (
        <div className="py-8 text-center">
          <Clock className="w-10 h-10 mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No timepoints yet</p>
          <p className="text-xs text-text-disabled mt-1">
            Add studies from the Patient Studies panel
          </p>
        </div>
      )}

      {/* Hint */}
      {session.timepoints.length > 0 && session.timepoints.length < 2 && (
        <p className="text-xs text-text-muted text-center py-2">
          Add more timepoints to enable comparison
        </p>
      )}
    </div>
  );
}
