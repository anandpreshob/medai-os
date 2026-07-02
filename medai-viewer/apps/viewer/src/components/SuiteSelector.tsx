import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@medai/ui';
import { useSuiteStore, SUITES_REGISTRY, getEnabledSuites, SuiteId } from '@medai/core';
import { ChevronDown, Wand2, Target, Zap, Brain, Heart, Scissors, Stethoscope, PenTool, Check } from 'lucide-react';

/**
 * Icon mapping for each suite
 */
const SUITE_ICONS: Record<SuiteId, React.ElementType> = {
  auto: Wand2,
  oncology: Target,
  rt: Zap,
  neurology: Brain,
  cardiology: Heart,
  surgical: Scissors,
  chestxray: Stethoscope,
  annotation: PenTool,
};

/**
 * SuiteSelector - Dropdown component for selecting clinical workflow suites
 *
 * Displays the current suite with its icon and provides a dropdown
 * to switch between enabled suites or auto-detect mode.
 */
export function SuiteSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { activeSuiteId, mode, setActiveSuite, setMode } = useSuiteStore();

  const enabledSuites = getEnabledSuites();
  const currentSuite = SUITES_REGISTRY[activeSuiteId];
  const CurrentIcon = SUITE_ICONS[activeSuiteId] || Wand2;

  // Handle click outside to close dropdown
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

  /**
   * Handle suite selection
   * Sets mode to 'manual' when user explicitly selects a suite
   */
  const handleSelect = (suiteId: SuiteId) => {
    if (suiteId === 'auto') {
      setMode('auto');
    } else {
      setActiveSuite(suiteId);
      setMode('manual');
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 hover:bg-background-hover hover:border-border-emphasis transition-colors"
      >
        <CurrentIcon className="h-4 w-4 text-accent-primary" />
        <span className="text-text-primary text-sm font-medium">
          {currentSuite?.name || 'Auto-Detect'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-tertiary transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-background-elevated border border-border-default rounded-lg shadow-lg z-[9999] py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Auto-Detect Option */}
          <button
            onClick={() => handleSelect('auto')}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-background-hover transition-colors"
          >
            <Wand2 className="h-4 w-4 text-accent-secondary" />
            <span className="flex-1 text-text-primary text-sm font-medium">Auto-Detect</span>
            {mode === 'auto' && (
              <Check className="h-4 w-4 text-accent-success" />
            )}
          </button>

          {/* Divider */}
          <div className="h-px bg-border-subtle mx-2 my-1" />

          {/* Enabled Suites */}
          {enabledSuites.map((suite) => {
            const SuiteIcon = SUITE_ICONS[suite.id] || Wand2;
            const isSelected = mode === 'manual' && activeSuiteId === suite.id;

            return (
              <button
                key={suite.id}
                onClick={() => handleSelect(suite.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-background-hover transition-colors"
              >
                <SuiteIcon className="h-4 w-4 text-text-secondary" />
                <div className="flex-1 min-w-0">
                  <span className="text-text-primary text-sm font-medium block">
                    {suite.name}
                  </span>
                  {suite.description && (
                    <span className="text-text-tertiary text-xs truncate block">
                      {suite.description}
                    </span>
                  )}
                </div>
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
