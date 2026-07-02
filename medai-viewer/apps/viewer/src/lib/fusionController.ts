/**
 * fusionController - Multi-volume overlay and fusion rendering
 *
 * Manages Cornerstone3D multi-volume rendering with:
 * - Per-volume opacity control
 * - Colormap assignment
 * - Blend modes (alpha, additive, MIP)
 * - Registration transform application
 */

import type { Types as CornerstoneTypes, volumeLoader } from '@cornerstonejs/core';
import type {
  BlendMode,
  ColorMapPreset,
  FusionSettings,
  RegistrationState,
} from '@medai/core/stores/neuroSequenceTypes';

export interface FusionVolume {
  volumeId: string;
  sequenceType: string;
  opacity: number;
  colormap: ColorMapPreset;
  visible: boolean;
}

export interface FusionConfig {
  volumes: FusionVolume[];
  blendMode: BlendMode;
  registrationTransform?: number[][] | null;
}

/**
 * Cornerstone3D colormap configurations
 */
const COLORMAP_CONFIGS: Record<ColorMapPreset, { name: string; preset?: string }> = {
  grayscale: { name: 'Grayscale', preset: 'Grayscale' },
  hot: { name: 'Hot Iron', preset: 'Hot Iron' },
  cool: { name: 'Cool', preset: 'Cool' },
  jet: { name: 'Jet', preset: 'Jet' },
  viridis: { name: 'Viridis', preset: 'Viridis' },
  plasma: { name: 'Plasma', preset: 'Plasma' },
};

/**
 * Blend mode configurations for Cornerstone3D
 */
const BLEND_MODE_CONFIGS: Record<BlendMode, number> = {
  alpha: 0, // Composite
  additive: 1, // Additive
  mip: 2, // Maximum Intensity Projection
};

/**
 * Creates a fusion controller for managing multi-volume rendering
 */
export function createFusionController() {
  let currentConfig: FusionConfig = {
    volumes: [],
    blendMode: 'alpha',
    registrationTransform: null,
  };

  let viewportId: string | null = null;
  let renderingEngineId: string | null = null;

  /**
   * Initialize the fusion controller with a viewport
   */
  function initialize(
    targetViewportId: string,
    targetRenderingEngineId: string
  ): void {
    viewportId = targetViewportId;
    renderingEngineId = targetRenderingEngineId;
  }

  /**
   * Add a volume to the fusion
   */
  function addVolume(volume: FusionVolume): void {
    const existingIndex = currentConfig.volumes.findIndex(
      (v) => v.volumeId === volume.volumeId
    );

    if (existingIndex >= 0) {
      currentConfig.volumes[existingIndex] = volume;
    } else {
      currentConfig.volumes.push(volume);
    }
  }

  /**
   * Remove a volume from the fusion
   */
  function removeVolume(volumeId: string): void {
    currentConfig.volumes = currentConfig.volumes.filter(
      (v) => v.volumeId !== volumeId
    );
  }

  /**
   * Update volume opacity
   */
  function setVolumeOpacity(volumeId: string, opacity: number): void {
    const volume = currentConfig.volumes.find((v) => v.volumeId === volumeId);
    if (volume) {
      volume.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * Update volume colormap
   */
  function setVolumeColormap(volumeId: string, colormap: ColorMapPreset): void {
    const volume = currentConfig.volumes.find((v) => v.volumeId === volumeId);
    if (volume) {
      volume.colormap = colormap;
    }
  }

  /**
   * Toggle volume visibility
   */
  function setVolumeVisibility(volumeId: string, visible: boolean): void {
    const volume = currentConfig.volumes.find((v) => v.volumeId === volumeId);
    if (volume) {
      volume.visible = visible;
    }
  }

  /**
   * Set the blend mode
   */
  function setBlendMode(mode: BlendMode): void {
    currentConfig.blendMode = mode;
  }

  /**
   * Set registration transform
   */
  function setRegistrationTransform(transform: number[][] | null): void {
    currentConfig.registrationTransform = transform;
  }

  /**
   * Get the current fusion configuration
   */
  function getConfig(): FusionConfig {
    return { ...currentConfig };
  }

  /**
   * Build the volume actors configuration for Cornerstone3D
   *
   * This returns the configuration needed to set up multi-volume rendering
   * in a Cornerstone3D viewport.
   */
  function buildVolumeActorsConfig(): Array<{
    volumeId: string;
    callback?: (params: { volumeActor: unknown }) => void;
  }> {
    return currentConfig.volumes
      .filter((v) => v.visible)
      .map((volume) => ({
        volumeId: volume.volumeId,
        callback: ({ volumeActor }: { volumeActor: unknown }) => {
          // Apply opacity
          const actor = volumeActor as { getProperty: () => { setOpacity: (o: number) => void } };
          if (actor && typeof actor.getProperty === 'function') {
            const property = actor.getProperty();
            if (property && typeof property.setOpacity === 'function') {
              property.setOpacity(volume.opacity);
            }
          }
        },
      }));
  }

  /**
   * Get the colormap preset for Cornerstone3D
   */
  function getColormapPreset(colormap: ColorMapPreset): string {
    return COLORMAP_CONFIGS[colormap]?.preset || 'Grayscale';
  }

  /**
   * Get the blend mode value for Cornerstone3D
   */
  function getBlendModeValue(): number {
    return BLEND_MODE_CONFIGS[currentConfig.blendMode];
  }

  /**
   * Apply a 4x4 registration transform to a volume
   *
   * In practice, this would be applied through the volume loader or
   * viewport transformation matrix.
   */
  function applyRegistrationTransform(
    volumeId: string,
    transform: number[][]
  ): void {
    // Store the transform for the volume
    currentConfig.registrationTransform = transform;

    // In a real implementation, this would:
    // 1. Get the volume from Cornerstone's volume cache
    // 2. Apply the transform matrix to the volume's imageData
    // 3. Or apply it as a viewport transformation
    console.log(`Registration transform applied to volume ${volumeId}`);
  }

  /**
   * Create a checkerboard pattern for registration quality assessment
   */
  function createCheckerboardView(
    volumeId1: string,
    volumeId2: string,
    checkerSize: number = 20
  ): void {
    // This would create an alternating checkerboard of two volumes
    // Useful for visually assessing registration quality
    console.log(
      `Checkerboard view: ${volumeId1} + ${volumeId2}, size: ${checkerSize}`
    );
  }

  /**
   * Reset the fusion controller
   */
  function reset(): void {
    currentConfig = {
      volumes: [],
      blendMode: 'alpha',
      registrationTransform: null,
    };
  }

  /**
   * Destroy the fusion controller
   */
  function destroy(): void {
    reset();
    viewportId = null;
    renderingEngineId = null;
  }

  return {
    initialize,
    addVolume,
    removeVolume,
    setVolumeOpacity,
    setVolumeColormap,
    setVolumeVisibility,
    setBlendMode,
    setRegistrationTransform,
    getConfig,
    buildVolumeActorsConfig,
    getColormapPreset,
    getBlendModeValue,
    applyRegistrationTransform,
    createCheckerboardView,
    reset,
    destroy,
  };
}

/**
 * Helper to convert FusionSettings from the store to FusionConfig
 */
export function fusionSettingsToConfig(
  settings: FusionSettings,
  sequences: Array<{ id: string; type: string }>
): FusionConfig {
  const volumes: FusionVolume[] = sequences
    .filter((seq) => settings.volumeIds.includes(seq.id))
    .map((seq) => ({
      volumeId: seq.id,
      sequenceType: seq.type,
      opacity: settings.opacities[seq.id] ?? 1,
      colormap: settings.colormaps[seq.id] ?? 'grayscale',
      visible: true,
    }));

  return {
    volumes,
    blendMode: settings.blendMode,
    registrationTransform: null,
  };
}

/**
 * Helper to apply registration state to fusion config
 */
export function applyRegistrationToConfig(
  config: FusionConfig,
  registration: RegistrationState
): FusionConfig {
  if (!registration.isRegistered || !registration.enabled) {
    return config;
  }

  return {
    ...config,
    registrationTransform: registration.transformMatrix,
  };
}

export type FusionController = ReturnType<typeof createFusionController>;
