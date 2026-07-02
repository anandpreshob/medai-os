/**
 * useKeyboardShortcuts - React Hook for Keyboard Shortcuts
 *
 * Provides a React-friendly interface for registering and managing keyboard shortcuts.
 * Handles automatic cleanup on unmount and supports dynamic shortcut registration.
 *
 * Features:
 * - Automatic registration/unregistration on mount/unmount
 * - Support for context-specific shortcuts
 * - Focus management integration
 * - Dynamic shortcut updates
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  KeyboardShortcutsManager,
  ShortcutDefinition,
  ShortcutCategory,
  KeyModifiers,
  getKeyboardShortcutsManager,
  initializeKeyboardShortcuts,
  destroyKeyboardShortcuts,
} from '../lib/keyboardShortcuts';

/**
 * Simplified shortcut definition for the hook
 */
export interface UseShortcutOptions {
  /** Unique identifier for this shortcut */
  id: string;
  /** Primary key (e.g., 'b', 'p', 'escape') */
  key: string;
  /** Modifier keys (ctrl, shift, alt, meta) */
  modifiers?: KeyModifiers;
  /** Human-readable description */
  description: string;
  /** Category for organizing shortcuts */
  category?: ShortcutCategory;
  /** Whether the shortcut is enabled */
  enabled?: boolean;
  /** Whether shortcut works when input is focused */
  allowInInput?: boolean;
  /** Priority for conflict resolution */
  priority?: number;
}

/**
 * Hook to initialize the global keyboard shortcuts manager
 * Should be called once at the app root level
 */
export function useKeyboardShortcutsManager(): KeyboardShortcutsManager {
  const [manager] = useState(() => {
    return initializeKeyboardShortcuts();
  });

  useEffect(() => {
    return () => {
      // Only destroy on app unmount, not on re-renders
      // destroyKeyboardShortcuts();
    };
  }, []);

  return manager;
}

/**
 * Hook to register a single keyboard shortcut
 *
 * @param options - Shortcut configuration
 * @param callback - Function to call when shortcut is triggered
 * @param deps - Dependencies array for callback updates
 *
 * @example
 * ```tsx
 * useKeyboardShortcut(
 *   { id: 'tool-brush', key: 'b', description: 'Brush tool' },
 *   () => setActiveTool('brush'),
 *   [setActiveTool]
 * );
 * ```
 */
export function useKeyboardShortcut(
  options: UseShortcutOptions,
  callback: () => void,
  deps: React.DependencyList = []
): void {
  const callbackRef = useRef(callback);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);

  useEffect(() => {
    const manager = getKeyboardShortcutsManager();

    const shortcut: ShortcutDefinition = {
      id: options.id,
      key: options.key,
      modifiers: options.modifiers,
      description: options.description,
      category: options.category || 'general',
      action: () => callbackRef.current(),
      enabled: options.enabled ?? true,
      allowInInput: options.allowInInput,
      priority: options.priority,
    };

    manager.register(shortcut);

    return () => {
      manager.unregister(options.id);
    };
  }, [
    options.id,
    options.key,
    options.modifiers?.ctrl,
    options.modifiers?.alt,
    options.modifiers?.shift,
    options.modifiers?.meta,
    options.description,
    options.category,
    options.enabled,
    options.allowInInput,
    options.priority,
  ]);
}

/**
 * Hook to register multiple keyboard shortcuts at once
 *
 * @param shortcuts - Array of shortcut configurations with callbacks
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { id: 'tool-brush', key: 'b', description: 'Brush', callback: () => setTool('brush') },
 *   { id: 'tool-eraser', key: 'e', description: 'Eraser', callback: () => setTool('eraser') },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: Array<UseShortcutOptions & { callback: () => void }>
): void {
  const callbackRefs = useRef<Map<string, () => void>>(new Map());

  // Update callback refs
  useEffect(() => {
    shortcuts.forEach((shortcut) => {
      callbackRefs.current.set(shortcut.id, shortcut.callback);
    });
  }, [shortcuts]);

  useEffect(() => {
    const manager = getKeyboardShortcutsManager();
    const registeredIds: string[] = [];

    shortcuts.forEach((options) => {
      const shortcut: ShortcutDefinition = {
        id: options.id,
        key: options.key,
        modifiers: options.modifiers,
        description: options.description,
        category: options.category || 'general',
        action: () => {
          const cb = callbackRefs.current.get(options.id);
          if (cb) cb();
        },
        enabled: options.enabled ?? true,
        allowInInput: options.allowInInput,
        priority: options.priority,
      };

      manager.register(shortcut);
      registeredIds.push(options.id);
    });

    return () => {
      registeredIds.forEach((id) => {
        manager.unregister(id);
      });
    };
  }, [shortcuts.map((s) => `${s.id}:${s.key}`).join(',')]);
}

/**
 * Hook to temporarily disable all shortcuts (e.g., when a modal is open)
 *
 * @param disabled - Whether shortcuts should be disabled
 *
 * @example
 * ```tsx
 * useDisableShortcuts(isModalOpen);
 * ```
 */
export function useDisableShortcuts(disabled: boolean): void {
  useEffect(() => {
    const manager = getKeyboardShortcutsManager();
    manager.setGlobalEnabled(!disabled);

    return () => {
      manager.setGlobalEnabled(true);
    };
  }, [disabled]);
}

/**
 * Hook to get all registered shortcuts for display in help UI
 *
 * @returns Array of all registered shortcuts
 */
export function useShortcutsList(): ShortcutDefinition[] {
  const [shortcuts, setShortcuts] = useState<ShortcutDefinition[]>([]);

  useEffect(() => {
    const manager = getKeyboardShortcutsManager();
    setShortcuts(manager.getShortcuts());

    // Update when shortcuts change (simplified - could use event listener)
    const interval = setInterval(() => {
      setShortcuts(manager.getShortcuts());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return shortcuts;
}

/**
 * Hook to get shortcuts filtered by category
 *
 * @param category - Category to filter by
 * @returns Array of shortcuts in the specified category
 */
export function useShortcutsByCategory(category: ShortcutCategory): ShortcutDefinition[] {
  const [shortcuts, setShortcuts] = useState<ShortcutDefinition[]>([]);

  useEffect(() => {
    const manager = getKeyboardShortcutsManager();
    setShortcuts(manager.getShortcutsByCategory(category));
  }, [category]);

  return shortcuts;
}

/**
 * Hook to format a shortcut key combination for display
 *
 * @param id - Shortcut ID
 * @returns Formatted string (e.g., "Ctrl+Z")
 */
export function useShortcutDisplay(id: string): string {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    const manager = getKeyboardShortcutsManager();
    setDisplay(manager.formatShortcut(id));
  }, [id]);

  return display;
}

/**
 * Hook to enable/disable a specific shortcut
 *
 * @param id - Shortcut ID
 * @returns [isEnabled, setEnabled] tuple
 */
export function useShortcutEnabled(id: string): [boolean, (enabled: boolean) => void] {
  const [isEnabled, setIsEnabled] = useState(true);

  const setEnabled = useCallback((enabled: boolean) => {
    const manager = getKeyboardShortcutsManager();
    manager.setEnabled(id, enabled);
    setIsEnabled(enabled);
  }, [id]);

  useEffect(() => {
    const manager = getKeyboardShortcutsManager();
    const shortcut = manager.getShortcut(id);
    if (shortcut) {
      setIsEnabled(shortcut.enabled ?? true);
    }
  }, [id]);

  return [isEnabled, setEnabled];
}

/**
 * Hook to handle focus-based shortcut context
 *
 * When the ref element is focused, registers the shortcuts.
 * When blurred, unregisters them.
 *
 * @param shortcuts - Context-specific shortcuts
 * @returns Ref to attach to the focusable element
 *
 * @example
 * ```tsx
 * const viewportRef = useContextShortcuts([
 *   { id: 'viewport-zoom-in', key: '+', callback: () => zoomIn() },
 * ]);
 *
 * return <div ref={viewportRef} tabIndex={0}>...</div>;
 * ```
 */
export function useContextShortcuts(
  shortcuts: Array<UseShortcutOptions & { callback: () => void }>
): React.RefObject<HTMLElement> {
  const ref = useRef<HTMLElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);

    return () => {
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    const manager = getKeyboardShortcutsManager();
    const callbackMap = new Map<string, () => void>();

    shortcuts.forEach((options) => {
      callbackMap.set(options.id, options.callback);

      const shortcut: ShortcutDefinition = {
        ...options,
        category: options.category || 'general',
        action: () => {
          const cb = callbackMap.get(options.id);
          if (cb) cb();
        },
        priority: (options.priority ?? 0) + 100, // Context shortcuts have higher priority
      };

      manager.register(shortcut);
    });

    return () => {
      shortcuts.forEach((s) => {
        manager.unregister(s.id);
      });
    };
  }, [isFocused, shortcuts]);

  return ref as React.RefObject<HTMLElement>;
}

/**
 * Hook to show the shortcuts help modal
 *
 * @returns [isOpen, open, close] functions
 */
export function useShortcutsHelp(): {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
} {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Register shortcut to open help
  useKeyboardShortcut(
    {
      id: 'shortcuts-help-modal',
      key: '?',
      modifiers: { shift: true },
      description: 'Show keyboard shortcuts help',
      category: 'general',
      priority: 1000, // High priority
    },
    toggle,
    [toggle]
  );

  return { isOpen, open, close, toggle };
}
