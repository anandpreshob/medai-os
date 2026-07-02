/**
 * ShortcutHelpModal - Keyboard Shortcuts Help Modal
 *
 * Displays all available keyboard shortcuts organized by category.
 * Supports search/filter and customization.
 *
 * Features:
 * - Organized by category (navigation, annotation, etc.)
 * - Search/filter shortcuts
 * - Key combination display
 * - Accessible design
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@medai/ui';
import {
  X,
  Search,
  Keyboard,
  Navigation,
  Edit3,
  Eye,
  FolderOpen,
  Scissors,
  HelpCircle,
} from 'lucide-react';
import {
  ShortcutDefinition,
  ShortcutCategory,
  getKeyboardShortcutsManager,
} from '../../lib/keyboardShortcuts';
import { useShortcutsList, useDisableShortcuts } from '../../hooks/useKeyboardShortcuts';

interface ShortcutHelpModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

// Category icons and labels
const CATEGORY_CONFIG: Record<
  ShortcutCategory,
  { icon: React.ReactNode; label: string; description: string }
> = {
  navigation: {
    icon: <Navigation className="h-4 w-4" />,
    label: 'Navigation',
    description: 'Tools for navigating and viewing images',
  },
  annotation: {
    icon: <Edit3 className="h-4 w-4" />,
    label: 'Annotation',
    description: 'Drawing and editing annotations',
  },
  segmentation: {
    icon: <Scissors className="h-4 w-4" />,
    label: 'Segmentation',
    description: 'Segmentation tools and settings',
  },
  view: {
    icon: <Eye className="h-4 w-4" />,
    label: 'View',
    description: 'View controls and display options',
  },
  file: {
    icon: <FolderOpen className="h-4 w-4" />,
    label: 'File',
    description: 'File operations',
  },
  edit: {
    icon: <Edit3 className="h-4 w-4" />,
    label: 'Edit',
    description: 'Editing operations',
  },
  general: {
    icon: <HelpCircle className="h-4 w-4" />,
    label: 'General',
    description: 'General shortcuts',
  },
};

// Category display order
const CATEGORY_ORDER: ShortcutCategory[] = [
  'navigation',
  'annotation',
  'segmentation',
  'view',
  'edit',
  'file',
  'general',
];

/**
 * Format a shortcut key combination for display
 */
function formatKeyCombo(shortcut: ShortcutDefinition): React.ReactNode {
  const parts: string[] = [];

  if (shortcut.modifiers?.ctrl) parts.push('Ctrl');
  if (shortcut.modifiers?.alt) parts.push('Alt');
  if (shortcut.modifiers?.shift) parts.push('Shift');
  if (shortcut.modifiers?.meta) parts.push('Cmd');

  // Format key for display
  let displayKey = shortcut.key.toUpperCase();
  if (shortcut.key === ' ') displayKey = 'Space';
  if (shortcut.key === 'escape') displayKey = 'Esc';
  if (shortcut.key === 'arrowup') displayKey = '';
  if (shortcut.key === 'arrowdown') displayKey = '';
  if (shortcut.key === 'arrowleft') displayKey = '';
  if (shortcut.key === 'arrowright') displayKey = '';
  if (shortcut.key === 'delete') displayKey = 'Del';
  if (shortcut.key === 'backspace') displayKey = '';
  if (shortcut.key === 'f1') displayKey = 'F1';
  if (shortcut.key === 'f11') displayKey = 'F11';

  parts.push(displayKey);

  return (
    <div className="flex items-center gap-1">
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          <kbd className="px-2 py-1 text-xs font-mono bg-background-primary rounded border border-border-subtle text-text-primary">
            {part}
          </kbd>
          {index < parts.length - 1 && <span className="text-text-muted">+</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ShortcutCategory | 'all'>('all');

  // Get all shortcuts
  const allShortcuts = useShortcutsList();

  // Disable shortcuts while modal is open
  useDisableShortcuts(isOpen);

  // Filter shortcuts based on search and category
  const filteredShortcuts = useMemo(() => {
    let filtered = allShortcuts;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.description.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query) ||
          s.key.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allShortcuts, selectedCategory, searchQuery]);

  // Group shortcuts by category
  const shortcutsByCategory = useMemo(() => {
    const grouped = new Map<ShortcutCategory, ShortcutDefinition[]>();

    for (const shortcut of filteredShortcuts) {
      const category = shortcut.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(shortcut);
    }

    return grouped;
  }, [filteredShortcuts]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-background-secondary rounded-xl shadow-2xl border border-border-subtle overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-background-tertiary">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-primary/20">
              <Keyboard className="h-5 w-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Keyboard Shortcuts</h2>
              <p className="text-xs text-text-muted">
                Press any key combination to perform actions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-background-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search and filter bar */}
        <div className="p-4 border-b border-border-subtle bg-background-tertiary/50">
          <div className="flex items-center gap-4">
            {/* Search input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search shortcuts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-background-primary rounded-lg border border-border-subtle focus:border-accent-primary focus:outline-none text-text-primary placeholder:text-text-muted"
                autoFocus
              />
            </div>

            {/* Category filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ShortcutCategory | 'all')}
              className="px-3 py-2 text-sm bg-background-primary rounded-lg border border-border-subtle focus:border-accent-primary focus:outline-none text-text-primary"
            >
              <option value="all">All Categories</option>
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_CONFIG[category].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredShortcuts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-text-muted mb-4" />
              <p className="text-text-secondary">No shortcuts found</p>
              <p className="text-text-muted text-sm mt-1">
                Try a different search term or category
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {CATEGORY_ORDER.map((category) => {
                const shortcuts = shortcutsByCategory.get(category);
                if (!shortcuts || shortcuts.length === 0) return null;

                const config = CATEGORY_CONFIG[category];

                return (
                  <div key={category}>
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded bg-background-tertiary text-accent-primary">
                        {config.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-text-primary">{config.label}</h3>
                        <p className="text-xs text-text-muted">{config.description}</p>
                      </div>
                    </div>

                    {/* Shortcuts table */}
                    <div className="bg-background-tertiary rounded-lg overflow-hidden border border-border-subtle">
                      <table className="w-full">
                        <tbody>
                          {shortcuts.map((shortcut, index) => (
                            <tr
                              key={shortcut.id}
                              className={`${
                                index !== shortcuts.length - 1 ? 'border-b border-border-subtle' : ''
                              } hover:bg-background-hover transition-colors`}
                            >
                              <td className="px-4 py-3 text-sm text-text-primary">
                                {shortcut.description}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {formatKeyCombo(shortcut)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle bg-background-tertiary/50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Press{' '}
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background-primary rounded border border-border-subtle">
                ?
              </kbd>{' '}
              anytime to open this help
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShortcutHelpModal;
