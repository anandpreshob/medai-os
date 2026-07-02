import type { FeatureId } from '@medai/core';

/**
 * The toggleable "windows" of the right panel.
 *
 * `feature` gates AVAILABILITY: a window only appears in the Panels dropdown
 * (and can only be shown) when its feature is enabled. Windows with no `feature`
 * are always available. The user's show/hide choice is stored separately in
 * usePanelVisibilityStore; default is hidden (panel starts empty).
 */
export interface PanelWindow {
  id: string;
  label: string;
  feature?: FeatureId;
}

export const RIGHT_PANEL_WINDOWS: PanelWindow[] = [
  { id: 'findings', label: 'Findings' },
  // Load / create / view / export a segmentation is a local, backend-free
  // operation - available in the basic viewer.
  { id: 'segmentation-tools', label: 'Segmentation Tools' },
  { id: 'segments', label: 'Segments' },
  // The AI server connection only matters for MONAI auto-segmentation.
  { id: 'server-connection', label: 'Server Connection', feature: 'monai-segmentation' },
  { id: 'analytics', label: 'Analytics', feature: 'analytics' },
];
