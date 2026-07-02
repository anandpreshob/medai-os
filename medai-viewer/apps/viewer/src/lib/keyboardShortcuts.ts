/**
 * Keyboard Shortcuts Manager
 *
 * Provides CVAT-style keyboard shortcuts for annotation tools.
 * Features:
 * - Configurable key bindings
 * - Conflict detection
 * - Context-aware shortcuts (global vs tool-specific)
 * - Modifier key support (Ctrl, Shift, Alt, Meta)
 */

/**
 * Modifier keys that can be combined with shortcuts
 */
export interface KeyModifiers {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/**
 * A single keyboard shortcut definition
 */
export interface ShortcutDefinition {
  /** Unique identifier for this shortcut */
  id: string;
  /** Primary key (e.g., 'b', 'p', 'escape', 'f1') */
  key: string;
  /** Modifier keys required */
  modifiers?: KeyModifiers;
  /** Human-readable description */
  description: string;
  /** Category for grouping in help UI */
  category: ShortcutCategory;
  /** Callback function to execute */
  action: () => void;
  /** Whether shortcut is currently enabled */
  enabled?: boolean;
  /** Whether shortcut works when input is focused */
  allowInInput?: boolean;
  /** Priority for conflict resolution (higher = wins) */
  priority?: number;
}

/**
 * Categories for organizing shortcuts
 */
export type ShortcutCategory =
  | 'navigation'
  | 'annotation'
  | 'segmentation'
  | 'view'
  | 'file'
  | 'edit'
  | 'general';

/**
 * Default CVAT-style shortcut bindings
 */
export const DEFAULT_SHORTCUTS: Omit<ShortcutDefinition, 'action'>[] = [
  // Navigation tools
  { id: 'tool-pan', key: 'h', description: 'Pan tool (Hand)', category: 'navigation' },
  { id: 'tool-zoom', key: 'z', description: 'Zoom tool', category: 'navigation' },
  { id: 'tool-window-level', key: 'w', description: 'Window/Level tool', category: 'navigation' },
  { id: 'tool-crosshairs', key: 'c', description: 'Crosshairs tool', category: 'navigation' },

  // Annotation tools
  { id: 'tool-brush', key: 'b', description: 'Brush tool', category: 'annotation' },
  { id: 'tool-eraser', key: 'e', description: 'Eraser tool', category: 'annotation' },
  { id: 'tool-polygon', key: 'p', description: 'Polygon tool', category: 'annotation' },
  { id: 'tool-polyline', key: 'l', description: 'Polyline tool', category: 'annotation' },
  { id: 'tool-rectangle', key: 'r', description: 'Rectangle tool', category: 'annotation' },
  { id: 'tool-lasso', key: 'a', description: 'Lasso fill tool', category: 'annotation' },
  { id: 'tool-smart-brush', key: 's', description: 'Smart Brush (AI)', category: 'annotation' },

  // Segmentation
  { id: 'toggle-positive', key: '1', description: 'Switch to positive/include mode', category: 'segmentation' },
  { id: 'toggle-negative', key: '2', description: 'Switch to negative/exclude mode', category: 'segmentation' },
  { id: 'increase-brush-size', key: ']', description: 'Increase brush size', category: 'segmentation' },
  { id: 'decrease-brush-size', key: '[', description: 'Decrease brush size', category: 'segmentation' },
  { id: 'next-segment', key: '.', description: 'Next segment', category: 'segmentation' },
  { id: 'prev-segment', key: ',', description: 'Previous segment', category: 'segmentation' },
  { id: 'toggle-segment-visibility', key: 'v', description: 'Toggle segment visibility', category: 'segmentation' },

  // View controls
  { id: 'reset-view', key: '0', description: 'Reset view', category: 'view' },
  { id: 'fit-to-window', key: 'f', description: 'Fit to window', category: 'view' },
  { id: 'toggle-fullscreen', key: 'f11', description: 'Toggle fullscreen', category: 'view' },
  { id: 'toggle-overlay', key: 'o', description: 'Toggle overlay visibility', category: 'view' },

  // Edit operations
  { id: 'undo', key: 'z', modifiers: { ctrl: true }, description: 'Undo', category: 'edit' },
  { id: 'redo', key: 'y', modifiers: { ctrl: true }, description: 'Redo', category: 'edit' },
  { id: 'redo-alt', key: 'z', modifiers: { ctrl: true, shift: true }, description: 'Redo (alternative)', category: 'edit' },
  { id: 'copy', key: 'c', modifiers: { ctrl: true }, description: 'Copy annotation', category: 'edit' },
  { id: 'paste', key: 'v', modifiers: { ctrl: true }, description: 'Paste annotation', category: 'edit' },
  { id: 'cut', key: 'x', modifiers: { ctrl: true }, description: 'Cut annotation', category: 'edit' },
  { id: 'delete', key: 'delete', description: 'Delete selected annotation', category: 'edit' },
  { id: 'delete-alt', key: 'backspace', description: 'Delete selected annotation', category: 'edit' },
  { id: 'select-all', key: 'a', modifiers: { ctrl: true }, description: 'Select all annotations', category: 'edit' },

  // File operations
  { id: 'save', key: 's', modifiers: { ctrl: true }, description: 'Save', category: 'file' },
  { id: 'open', key: 'o', modifiers: { ctrl: true }, description: 'Open file', category: 'file' },
  { id: 'export', key: 'e', modifiers: { ctrl: true }, description: 'Export', category: 'file' },

  // General
  { id: 'escape', key: 'escape', description: 'Cancel / Deselect', category: 'general' },
  { id: 'help', key: '?', modifiers: { shift: true }, description: 'Show keyboard shortcuts', category: 'general' },
  { id: 'help-alt', key: 'f1', description: 'Show keyboard shortcuts', category: 'general' },
];

/**
 * Keyboard Shortcuts Manager
 */
export class KeyboardShortcutsManager {
  private shortcuts: Map<string, ShortcutDefinition> = new Map();
  private enabled: boolean = true;
  private boundHandler: (e: KeyboardEvent) => void;
  private element: HTMLElement | Document;

  constructor(element: HTMLElement | Document = document) {
    this.element = element;
    this.boundHandler = this.handleKeyDown.bind(this);
  }

  /**
   * Initialize the manager and start listening for keyboard events
   */
  public initialize(): void {
    this.element.addEventListener('keydown', this.boundHandler as EventListener);
    console.log('[KeyboardShortcuts] Initialized');
  }

  /**
   * Cleanup and stop listening for keyboard events
   */
  public destroy(): void {
    this.element.removeEventListener('keydown', this.boundHandler as EventListener);
    this.shortcuts.clear();
    console.log('[KeyboardShortcuts] Destroyed');
  }

  /**
   * Register a shortcut
   */
  public register(shortcut: ShortcutDefinition): void {
    const key = this.generateKey(shortcut.key, shortcut.modifiers);

    // Check for conflicts
    const existing = this.shortcuts.get(key);
    if (existing && existing.id !== shortcut.id) {
      const existingPriority = existing.priority ?? 0;
      const newPriority = shortcut.priority ?? 0;

      if (newPriority <= existingPriority) {
        console.warn(
          `[KeyboardShortcuts] Conflict: "${shortcut.id}" conflicts with "${existing.id}" for key "${key}". Keeping existing.`
        );
        return;
      }

      console.warn(
        `[KeyboardShortcuts] Conflict: "${shortcut.id}" overrides "${existing.id}" for key "${key}".`
      );
    }

    this.shortcuts.set(key, { ...shortcut, enabled: shortcut.enabled ?? true });
    console.log(`[KeyboardShortcuts] Registered: ${shortcut.id} -> ${key}`);
  }

  /**
   * Register multiple shortcuts at once
   */
  public registerAll(shortcuts: ShortcutDefinition[]): void {
    for (const shortcut of shortcuts) {
      this.register(shortcut);
    }
  }

  /**
   * Unregister a shortcut by ID
   */
  public unregister(id: string): void {
    for (const [key, shortcut] of this.shortcuts.entries()) {
      if (shortcut.id === id) {
        this.shortcuts.delete(key);
        console.log(`[KeyboardShortcuts] Unregistered: ${id}`);
        return;
      }
    }
  }

  /**
   * Update a shortcut's action
   */
  public updateAction(id: string, action: () => void): void {
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.id === id) {
        shortcut.action = action;
        return;
      }
    }
    console.warn(`[KeyboardShortcuts] Shortcut not found: ${id}`);
  }

  /**
   * Enable/disable a specific shortcut
   */
  public setEnabled(id: string, enabled: boolean): void {
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.id === id) {
        shortcut.enabled = enabled;
        return;
      }
    }
  }

  /**
   * Enable/disable all shortcuts
   */
  public setGlobalEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get all registered shortcuts
   */
  public getShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts by category
   */
  public getShortcutsByCategory(category: ShortcutCategory): ShortcutDefinition[] {
    return this.getShortcuts().filter((s) => s.category === category);
  }

  /**
   * Get a shortcut by ID
   */
  public getShortcut(id: string): ShortcutDefinition | undefined {
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.id === id) {
        return shortcut;
      }
    }
    return undefined;
  }

  /**
   * Check if a key combination is already registered
   */
  public hasConflict(key: string, modifiers?: KeyModifiers): boolean {
    const generatedKey = this.generateKey(key, modifiers);
    return this.shortcuts.has(generatedKey);
  }

  /**
   * Get the shortcut key string for display
   */
  public formatShortcut(id: string): string {
    const shortcut = this.getShortcut(id);
    if (!shortcut) return '';

    return this.formatKeyCombo(shortcut.key, shortcut.modifiers);
  }

  /**
   * Format a key combination for display
   */
  public formatKeyCombo(key: string, modifiers?: KeyModifiers): string {
    const parts: string[] = [];

    if (modifiers?.ctrl) parts.push('Ctrl');
    if (modifiers?.alt) parts.push('Alt');
    if (modifiers?.shift) parts.push('Shift');
    if (modifiers?.meta) parts.push('Cmd');

    // Format key for display
    let displayKey = key.toUpperCase();
    if (key === ' ') displayKey = 'Space';
    if (key === 'escape') displayKey = 'Esc';
    if (key === 'arrowup') displayKey = '';
    if (key === 'arrowdown') displayKey = '';
    if (key === 'arrowleft') displayKey = '';
    if (key === 'arrowright') displayKey = '';
    if (key === 'delete') displayKey = 'Del';
    if (key === 'backspace') displayKey = '';

    parts.push(displayKey);

    return parts.join('+');
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Ignore if typing in an input
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Check if shortcut allows input
      const key = this.generateKey(event.key.toLowerCase(), this.extractModifiers(event));
      const shortcut = this.shortcuts.get(key);
      if (!shortcut?.allowInInput) {
        return;
      }
    }

    const key = this.generateKey(event.key.toLowerCase(), this.extractModifiers(event));
    const shortcut = this.shortcuts.get(key);

    if (shortcut && shortcut.enabled !== false) {
      event.preventDefault();
      event.stopPropagation();

      try {
        shortcut.action();
        console.log(`[KeyboardShortcuts] Executed: ${shortcut.id}`);
      } catch (err) {
        console.error(`[KeyboardShortcuts] Error executing ${shortcut.id}:`, err);
      }
    }
  }

  /**
   * Generate a unique key for the shortcut map
   */
  private generateKey(key: string, modifiers?: KeyModifiers): string {
    const parts: string[] = [];

    if (modifiers?.ctrl) parts.push('ctrl');
    if (modifiers?.alt) parts.push('alt');
    if (modifiers?.shift) parts.push('shift');
    if (modifiers?.meta) parts.push('meta');

    parts.push(key.toLowerCase());

    return parts.join('+');
  }

  /**
   * Extract modifiers from a keyboard event
   */
  private extractModifiers(event: KeyboardEvent): KeyModifiers {
    return {
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    };
  }
}

// Global instance for convenience
let globalManager: KeyboardShortcutsManager | null = null;

/**
 * Get or create the global keyboard shortcuts manager
 */
export function getKeyboardShortcutsManager(): KeyboardShortcutsManager {
  if (!globalManager) {
    globalManager = new KeyboardShortcutsManager();
  }
  return globalManager;
}

/**
 * Initialize the global keyboard shortcuts manager
 */
export function initializeKeyboardShortcuts(): KeyboardShortcutsManager {
  const manager = getKeyboardShortcutsManager();
  manager.initialize();
  return manager;
}

/**
 * Destroy the global keyboard shortcuts manager
 */
export function destroyKeyboardShortcuts(): void {
  if (globalManager) {
    globalManager.destroy();
    globalManager = null;
  }
}

/**
 * Register a shortcut on the global manager
 */
export function registerShortcut(shortcut: ShortcutDefinition): void {
  getKeyboardShortcutsManager().register(shortcut);
}

/**
 * Unregister a shortcut from the global manager
 */
export function unregisterShortcut(id: string): void {
  getKeyboardShortcutsManager().unregister(id);
}
