import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button, toast } from '@medai/ui';
import { useViewerStore, WL_PRESETS, WLPreset } from '@medai/core';
import { ChevronDown, Check, SunMedium } from 'lucide-react';
import { setWindowLevel as setCornerstoneWindowLevel } from '../lib/cornerstone';

/**
 * Check if modality supports HU-based window presets (only CT)
 */
function isCTModality(modality: string | undefined): boolean {
  if (!modality) return false;
  return modality.toUpperCase() === 'CT';
}

/**
 * Get display name for a preset (removes modality prefix)
 */
function getPresetDisplayName(preset: WLPreset): string {
  // If the preset already has a clean name, use it
  if (!preset.name.includes('-')) return preset.name;
  return preset.name;
}

/**
 * WindowPresetMenu - Dropdown for selecting CT window/level presets
 *
 * Only shows for CT modality since HU-based window presets are CT-specific.
 * Allows quick switching between common settings like Soft Tissue, Lung, Bone, etc.
 */
export function WindowPresetMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    windowWidth,
    windowCenter,
    activePresetId,
    applyPreset,
    pacsStudy,
    images,
    activeImageId
  } = useViewerStore();

  // Check if current image is 2D
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;
  const is2DImage = activeImage?.metadata.dimensionality === '2D';

  // Get modality from PACS study
  const modality = pacsStudy?.modality || pacsStudy?.series?.[0]?.modality;
  const isCT = isCTModality(modality);

  // CT presets (HU-based window/level only applies to CT)
  const ctPresets = useMemo(() => {
    return Object.values(WL_PRESETS).filter(p => p.id.startsWith('ct-'));
  }, []);

  // Get current preset info
  const currentPreset = activePresetId ? WL_PRESETS[activePresetId] : null;

  // Handle preset selection
  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = WL_PRESETS[presetId];
    if (preset) {
      // Update store state
      applyPreset(presetId);

      // Apply to Cornerstone viewports
      const viewportIds = is2DImage ? ['main2d'] : ['axial', 'sagittal', 'coronal'];
      setCornerstoneWindowLevel(viewportIds, preset.windowWidth, preset.windowCenter);

      toast.info('Window Preset', `Applied: ${preset.name} (W:${preset.windowWidth} C:${preset.windowCenter})`);
    }
    setIsOpen(false);
  }, [applyPreset, is2DImage]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen && isCT) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, isCT]);

  // Handle keyboard shortcuts (Cmd/Ctrl + 1-6) - only for CT
  useEffect(() => {
    if (!isCT) return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        const num = parseInt(event.key, 10);
        if (num >= 1 && num <= 6 && num <= ctPresets.length) {
          event.preventDefault();
          const preset = ctPresets[num - 1];
          handlePresetSelect(preset.id);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [ctPresets, isCT, handlePresetSelect]);

  // Don't render if not CT modality
  if (!isCT) {
    return null;
  }

  // Determine trigger label
  const triggerLabel = currentPreset?.name || 'W/L';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 h-9 hover:bg-background-hover transition-colors"
      >
        <SunMedium className="h-4 w-4 text-accent-primary" />
        <span className="text-text-primary text-sm font-medium">
          {triggerLabel}
        </span>
        <span className="text-text-tertiary text-xs font-mono">
          W:{windowWidth} C:{windowCenter}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-tertiary transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[220px] bg-background-elevated border border-border-default rounded-lg shadow-lg z-[9999] py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-3 py-1.5 text-xs text-text-tertiary font-medium uppercase tracking-wide">
            CT Window Presets
          </div>

          {/* Divider */}
          <div className="h-px bg-border-subtle mx-2 my-1" />

          {/* Presets */}
          {ctPresets.map((preset, index) => {
            const isSelected = activePresetId === preset.id;
            const shortcut = index < 6 ? `\u2318${index + 1}` : null;

            return (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                  ${isSelected
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'hover:bg-background-hover text-text-primary'
                  }
                `}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium block">
                    {getPresetDisplayName(preset)}
                  </span>
                  <span className="text-text-tertiary text-xs font-mono">
                    W:{preset.windowWidth} C:{preset.windowCenter}
                  </span>
                </div>
                {shortcut && (
                  <span className="text-text-tertiary text-xs font-mono">
                    {shortcut}
                  </span>
                )}
                {isSelected && (
                  <Check className="h-4 w-4 text-accent-success flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
