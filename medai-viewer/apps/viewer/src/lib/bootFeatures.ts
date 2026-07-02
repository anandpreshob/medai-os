/**
 * Feature-flag boot sequence.
 *
 * Reads VITE_FEATURES (comma-separated feature IDs, or "all") and an optional
 * runtime override file at /config.json:
 *
 *   { "features": { "chat": true, "monai-segmentation": false } }
 *
 * config.json lets deployments flip features without rebuilding. With neither
 * configured, the app runs as the basic viewer (no optional features).
 */

import { initFeatures, parseFeatureFlags, type FeatureId } from '@medai/core';

async function fetchRuntimeConfig(): Promise<Partial<Record<FeatureId, boolean>> | undefined> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok) return undefined;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) return undefined; // SPA fallback served index.html
    const json = await res.json();
    return json?.features && typeof json.features === 'object' ? json.features : undefined;
  } catch {
    return undefined; // no config.json is the normal case
  }
}

export async function bootFeatures(): Promise<void> {
  const runtimeConfig = await fetchRuntimeConfig();

  initFeatures({
    enabled: parseFeatureFlags(import.meta.env.VITE_FEATURES),
    urls: {
      // Defaults mirror the dev-proxy / service defaults used across the app
      monaiServerUrl: import.meta.env.VITE_MONAI_SERVER_URL || 'http://localhost:8002',
      medaiServerUrl: import.meta.env.VITE_MEDAI_SERVER_URL || 'http://localhost:8002',
      chatServiceUrl:
        import.meta.env.VITE_CHAT_SERVICE_URL ||
        import.meta.env.VITE_MEDAI_SERVER_URL ||
        'http://localhost:8002',
    },
    runtimeConfig,
  });
}
