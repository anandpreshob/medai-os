import React, { useState, useRef } from 'react';
import { Pencil, Check, X, Eye } from 'lucide-react';
import type { SegmentItemProps } from '../types';

export function SegmentItem({
  segment,
  isActive,
  onSelect,
  onUpdateLabel,
  onToggleVisibility
}: SegmentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(segment.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger selection when editing
    setEditValue(segment.label);
    setIsEditing(true);
    // Focus input after render
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSave = () => {
    if (editValue.trim()) {
      onUpdateLabel(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(segment.label);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
        isActive
          ? 'bg-accent-primary-muted border-accent-primary/30 shadow-glow-sm'
          : 'bg-background-tertiary/40 border-transparent hover:bg-background-hover hover:border-border-subtle'
      }`}
      data-testid={`segment-${segment.segmentIndex}`}
      onClick={onSelect}
      title="Click to select this segment for painting"
    >
      {/* Color swatch with ring */}
      <div
        className={`w-5 h-5 rounded-md shadow-inner-soft flex-shrink-0 ${isActive ? 'ring-2 ring-white/50' : ''}`}
        style={{ backgroundColor: segment.color }}
        title={`Segment color: ${segment.color}`}
      />

      {isEditing ? (
        <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="flex-1 bg-background-secondary text-text-primary text-sm px-2 py-1 rounded-lg border border-border-default focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            className="text-accent-success hover:text-accent-success/80 p-1 hover:bg-background-hover rounded transition-colors"
            title="Save"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancel(); }}
            className="text-accent-error hover:text-accent-error/80 p-1 hover:bg-background-hover rounded transition-colors"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span
            className={`text-sm flex-1 truncate ${isActive ? 'text-accent-primary font-medium' : 'text-text-primary'}`}
          >
            {segment.label}
          </span>
          <button
            onClick={handleStartEdit}
            className="text-text-muted hover:text-text-secondary p-1 hover:bg-background-hover rounded transition-colors"
            title="Rename segment"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {/* Visibility toggle with icon */}
      <button
        className={`p-1.5 rounded-lg transition-colors ${
          segment.visible
            ? 'text-text-secondary hover:bg-background-hover'
            : 'text-text-muted bg-background-tertiary/50'
        }`}
        title={segment.visible ? 'Hide segment' : 'Show segment'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
      >
        {segment.visible ? <Eye className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 opacity-50" />}
      </button>
    </div>
  );
}
