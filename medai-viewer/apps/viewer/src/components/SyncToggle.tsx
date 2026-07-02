/**
 * SyncToggle - Viewport Synchronization Controls
 *
 * Toggle button for sync on/off with dropdown options for fine-grained control.
 * Controls: pan, zoom, window/level, slice index, camera sync.
 * Uses useLongitudinalStore for sync settings persistence.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useLongitudinalStore } from '@medai/core';
import {
  Link2,
  Unlink2,
  ChevronDown,
  Move,
  ZoomIn,
  SunMedium,
  Layers,
  Camera,
} from 'lucide-react';

interface SyncOption {
  key: keyof ReturnType<typeof useLongitudinalStore.getState>['syncSettings'];
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SYNC_OPTIONS: SyncOption[] = [
  {
    key: 'syncPan',
    label: 'Pan',
    icon: <Move className="h-4 w-4" />,
    description: 'Sync pan position across viewports',
  },
  {
    key: 'syncZoom',
    label: 'Zoom',
    icon: <ZoomIn className="h-4 w-4" />,
    description: 'Sync zoom level across viewports',
  },
  {
    key: 'syncWindowLevel',
    label: 'Window/Level',
    icon: <SunMedium className="h-4 w-4" />,
    description: 'Sync brightness/contrast across viewports',
  },
  {
    key: 'syncSliceIndex',
    label: 'Slice Index',
    icon: <Layers className="h-4 w-4" />,
    description: 'Sync slice scrolling across viewports (3D only)',
  },
  {
    key: 'syncCamera',
    label: 'Camera',
    icon: <Camera className="h-4 w-4" />,
    description: 'Sync full camera position/orientation',
  },
];

export function SyncToggle() {
  const { syncEnabled, syncSettings, toggleSync, setSyncSettings } = useLongitudinalStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleOption = (key: SyncOption['key']) => {
    setSyncSettings({ [key]: !syncSettings[key] });
  };

  const activeCount = Object.values(syncSettings).filter(Boolean).length;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-1">
        {/* Main sync toggle button */}
        <button
          onClick={toggleSync}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
            transition-all duration-200 border
            ${
              syncEnabled
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30 hover:bg-accent-primary/30'
                : 'bg-background-tertiary text-text-secondary border-border-subtle hover:bg-background-hover'
            }
          `}
          title={syncEnabled ? 'Disable viewport synchronization' : 'Enable viewport synchronization'}
        >
          {syncEnabled ? (
            <Link2 className="h-4 w-4" />
          ) : (
            <Unlink2 className="h-4 w-4" />
          )}
          <span>{syncEnabled ? 'Synced' : 'Unsynced'}</span>
          {syncEnabled && activeCount > 0 && (
            <span className="text-xs bg-accent-primary/30 px-1.5 py-0.5 rounded">
              {activeCount}
            </span>
          )}
        </button>

        {/* Dropdown toggle */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`
            p-1.5 rounded-lg border transition-all duration-200
            ${
              isDropdownOpen
                ? 'bg-background-hover border-border-emphasis'
                : 'bg-background-tertiary border-border-subtle hover:bg-background-hover'
            }
          `}
          title="Sync options"
        >
          <ChevronDown
            className={`h-4 w-4 text-text-secondary transition-transform ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-background-secondary border border-border-subtle rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 bg-background-tertiary/50 border-b border-border-subtle">
            <h3 className="text-sm font-medium text-text-primary">Sync Options</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Choose which properties to synchronize
            </p>
          </div>

          <div className="p-2 space-y-1">
            {SYNC_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => handleToggleOption(option.key)}
                disabled={!syncEnabled}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
                  transition-all duration-150
                  ${
                    !syncEnabled
                      ? 'opacity-50 cursor-not-allowed'
                      : syncSettings[option.key]
                      ? 'bg-accent-primary/10 hover:bg-accent-primary/20'
                      : 'hover:bg-background-hover'
                  }
                `}
              >
                <div
                  className={`
                    flex items-center justify-center w-8 h-8 rounded-lg
                    ${
                      syncSettings[option.key] && syncEnabled
                        ? 'bg-accent-primary/20 text-accent-primary'
                        : 'bg-background-tertiary text-text-muted'
                    }
                  `}
                >
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        syncSettings[option.key] && syncEnabled
                          ? 'text-text-primary'
                          : 'text-text-secondary'
                      }`}
                    >
                      {option.label}
                    </span>
                    {syncSettings[option.key] && syncEnabled && (
                      <span className="text-xs text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded">
                        On
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">{option.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 bg-background-tertiary/50 border-t border-border-subtle flex gap-2">
            <button
              onClick={() => {
                setSyncSettings({
                  syncPan: true,
                  syncZoom: true,
                  syncWindowLevel: true,
                  syncSliceIndex: true,
                  syncCamera: true,
                });
              }}
              disabled={!syncEnabled}
              className={`
                flex-1 text-xs py-1.5 rounded
                ${
                  syncEnabled
                    ? 'bg-background-hover hover:bg-background-tertiary text-text-secondary'
                    : 'opacity-50 cursor-not-allowed text-text-muted'
                }
              `}
            >
              Enable All
            </button>
            <button
              onClick={() => {
                setSyncSettings({
                  syncPan: false,
                  syncZoom: false,
                  syncWindowLevel: false,
                  syncSliceIndex: false,
                  syncCamera: false,
                });
              }}
              disabled={!syncEnabled}
              className={`
                flex-1 text-xs py-1.5 rounded
                ${
                  syncEnabled
                    ? 'bg-background-hover hover:bg-background-tertiary text-text-secondary'
                    : 'opacity-50 cursor-not-allowed text-text-muted'
                }
              `}
            >
              Disable All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
