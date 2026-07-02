import React, { useState, useRef, useEffect } from 'react';
import { LayoutList, ChevronDown, Check } from 'lucide-react';
import { isFeatureEnabled, usePanelVisibilityStore } from '@medai/core';
import { RIGHT_PANEL_WINDOWS } from './panelWindows';

/**
 * PanelSelector - "Panels" dropdown for the right panel.
 *
 * Lists every currently-available window (its feature enabled, or no feature
 * required) with a checkbox to show/hide it. Choices persist per-browser via
 * usePanelVisibilityStore. Windows whose feature is disabled never appear.
 */
export function PanelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const visible = usePanelVisibilityStore((s) => s.visible);
  const togglePanel = usePanelVisibilityStore((s) => s.togglePanel);

  const available = RIGHT_PANEL_WINDOWS.filter((w) => !w.feature || isFeatureEnabled(w.feature));
  const shownCount = available.filter((w) => visible[w.id] ?? false).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-background-tertiary/50 border border-border-subtle/50 hover:bg-background-hover/60 transition-colors"
        data-testid="panel-selector-trigger"
      >
        <LayoutList className="h-4 w-4 text-accent-primary" />
        <span className="text-sm font-medium text-text-primary flex-1 text-left">Panels</span>
        <span className="text-xs text-text-tertiary">
          {shownCount}/{available.length}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background-elevated border border-border-default rounded-lg shadow-lg z-[9999] py-1">
          <div className="px-3 py-1.5 text-xs text-text-tertiary font-medium uppercase tracking-wide">
            Show windows
          </div>
          <div className="h-px bg-border-subtle mx-2 my-1" />
          {available.map((w) => {
            const isShown = visible[w.id] ?? false;
            return (
              <button
                key={w.id}
                onClick={() => togglePanel(w.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-background-hover transition-colors"
                data-testid={`panel-toggle-${w.id}`}
              >
                <span
                  className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    isShown ? 'bg-accent-primary border-accent-primary' : 'border-border-default'
                  }`}
                >
                  {isShown && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="text-sm text-text-primary flex-1">{w.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
