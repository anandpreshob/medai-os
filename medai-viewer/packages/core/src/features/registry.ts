/**
 * MedAI Features - Registry
 *
 * Boot-time feature flags. The app calls initFeatures() once (before render)
 * with values parsed from VITE_FEATURES / server URLs / optional config.json;
 * everything else queries isFeatureEnabled().
 *
 * Default state (initFeatures never called, or called with nothing enabled)
 * is the basic viewer: all optional features OFF.
 */

import type {
  FeatureConfig,
  FeatureId,
  FeatureUrlKey,
  InitFeaturesOptions,
} from './types';

export const FEATURE_REGISTRY: Record<FeatureId, FeatureConfig> = {
  'monai-segmentation': {
    id: 'monai-segmentation',
    name: 'MONAI Segmentation',
    description: 'Auto-segmentation and interactive smart-edit via a MONAI Label server',
    requiresUrl: 'monaiServerUrl',
    composeProfile: 'segmentation',
  },
  chat: {
    id: 'chat',
    name: 'Ask MedAI Chat',
    description: 'Chat/RAG assistant grounded in the current study',
    requiresUrl: 'chatServiceUrl',
    composeProfile: 'chat',
  },
  chestxray: {
    id: 'chestxray',
    name: 'Chest X-ray AI',
    description: 'MedGemma chest X-ray detection and description',
    requiresUrl: 'medaiServerUrl',
    composeProfile: 'ai',
  },
  triage: {
    id: 'triage',
    name: 'Triage',
    description: 'AI study prioritization',
    requiresUrl: 'medaiServerUrl',
    composeProfile: 'ai',
  },
  analytics: {
    id: 'analytics',
    name: 'Advanced Analytics',
    description: 'Volumetrics, radiomics, and SUV computation',
    requiresUrl: 'monaiServerUrl',
    composeProfile: 'segmentation',
  },
  audit: {
    id: 'audit',
    name: 'Audit Logging',
    description: 'Regulatory hash-chain audit trail',
    requiresUrl: 'medaiServerUrl',
    composeProfile: 'ai',
  },
  batch: {
    id: 'batch',
    name: 'Batch Processing',
    description: 'Batch inference jobs with live progress',
    requiresUrl: 'medaiServerUrl',
    composeProfile: 'ai',
  },
  reports: {
    id: 'reports',
    name: 'AI Reports',
    description: 'AI-assisted report generation',
    requiresUrl: 'medaiServerUrl',
    composeProfile: 'ai',
  },
  registration: {
    id: 'registration',
    name: 'Registration',
    description: 'Image registration and segmentation propagation',
    requiresUrl: 'monaiServerUrl',
    composeProfile: 'segmentation',
  },
  agent: {
    id: 'agent',
    name: 'Agent Window',
    description: 'Natural-language batch-orchestration harness (Claude tool-use)',
    requiresUrl: 'chatServiceUrl',
    composeProfile: 'ai',
  },
};

export const ALL_FEATURE_IDS = Object.keys(FEATURE_REGISTRY) as FeatureId[];

/**
 * Type guard for parsing untrusted flag strings (env vars, config.json)
 */
export function isFeatureId(value: string): value is FeatureId {
  return value in FEATURE_REGISTRY;
}

interface FeatureState {
  initialized: boolean;
  enabled: Set<FeatureId>;
  urls: Partial<Record<FeatureUrlKey, string>>;
}

const state: FeatureState = {
  initialized: false,
  enabled: new Set(),
  urls: {},
};

/**
 * Initialize feature flags. Call once at app boot, before render.
 *
 * A feature ends up enabled iff:
 *  1. it is listed in `enabled` (from VITE_FEATURES), or force-enabled via
 *     `runtimeConfig` (config.json) - and not force-disabled there, AND
 *  2. its `requiresUrl` server URL is configured (when it declares one).
 */
export function initFeatures(opts: InitFeaturesOptions): void {
  if (state.initialized) {
    console.warn('[features] initFeatures called more than once; re-initializing');
  }

  const requested = new Set<FeatureId>(opts.enabled);

  // Runtime config overrides env flags in both directions
  if (opts.runtimeConfig) {
    for (const [id, on] of Object.entries(opts.runtimeConfig)) {
      if (!isFeatureId(id)) {
        console.warn(`[features] Unknown feature in runtime config: "${id}"`);
        continue;
      }
      if (on) requested.add(id);
      else requested.delete(id);
    }
  }

  state.enabled.clear();
  state.urls = { ...opts.urls };

  for (const id of requested) {
    const config = FEATURE_REGISTRY[id];
    if (config.requiresUrl && !opts.urls[config.requiresUrl]) {
      console.warn(
        `[features] "${id}" requested but ${config.requiresUrl} is not configured; feature stays disabled`
      );
      continue;
    }
    state.enabled.add(id);
  }

  state.initialized = true;

  if (state.enabled.size > 0) {
    console.info(`[features] Enabled: ${[...state.enabled].join(', ')}`);
  } else {
    console.info('[features] Basic viewer mode (no optional features enabled)');
  }
}

/**
 * Whether a feature is enabled. Safe to call before initFeatures (returns false).
 */
export function isFeatureEnabled(id: FeatureId): boolean {
  return state.enabled.has(id);
}

/**
 * List of currently enabled features
 */
export function getEnabledFeatures(): FeatureId[] {
  return [...state.enabled];
}

/**
 * Configured server URL for a feature dependency (for diagnostics UI)
 */
export function getFeatureUrl(key: FeatureUrlKey): string | undefined {
  return state.urls[key];
}

/**
 * Parse a comma-separated flag string (e.g. VITE_FEATURES) into feature IDs,
 * warning on unknown entries. "all" enables everything.
 */
export function parseFeatureFlags(raw: string | undefined | null): FeatureId[] {
  if (!raw) return [];
  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.includes('all')) return [...ALL_FEATURE_IDS];
  const ids: FeatureId[] = [];
  for (const entry of entries) {
    if (isFeatureId(entry)) {
      ids.push(entry);
    } else {
      console.warn(`[features] Unknown feature flag "${entry}" ignored`);
    }
  }
  return ids;
}

/**
 * Test-only: reset registry state
 */
export function __resetFeatures(): void {
  state.initialized = false;
  state.enabled.clear();
  state.urls = {};
}
