/**
 * MedAI Features - Type Definitions
 *
 * Features are optional capabilities that layer on top of the basic viewer
 * (local file loading + Orthanc/DICOMweb viewing + measurement tools).
 * Each feature maps to a backend service tier; a feature is only usable
 * when it is explicitly enabled AND its required server URL is configured.
 */

/**
 * Feature identifiers for all optional capabilities
 */
export type FeatureId =
  | 'monai-segmentation' // MONAI Label: auto-seg, smart-edit, interactive models
  | 'chat' // Ask MedAI chat/RAG assistant
  | 'chestxray' // MedGemma chest X-ray detection + reporting
  | 'triage' // Study triage/prioritization
  | 'analytics' // Volumetrics, radiomics, SUV
  | 'audit' // Regulatory audit logging (hash-chain)
  | 'batch' // Batch inference jobs (WebSocket progress)
  | 'reports' // AI report generation + report page
  | 'registration'; // Image registration + segmentation propagation

/**
 * Server URL keys a feature may depend on (populated at boot from env/config)
 */
export type FeatureUrlKey = 'monaiServerUrl' | 'medaiServerUrl' | 'chatServiceUrl';

/**
 * Backend docker-compose profile that must be running for a feature to work.
 * Documentation/diagnostics only - the frontend never starts backends.
 */
export type ComposeProfile = 'segmentation' | 'ai' | 'chat';

/**
 * Static configuration for a feature
 */
export interface FeatureConfig {
  id: FeatureId;
  /** Display name for settings/diagnostics UI */
  name: string;
  /** Brief description */
  description: string;
  /** Server URL that must be non-empty for the feature to be usable */
  requiresUrl?: FeatureUrlKey;
  /** Backend compose profile that provides this feature */
  composeProfile: ComposeProfile;
}

/**
 * Options for initializing the feature registry at app boot
 */
export interface InitFeaturesOptions {
  /** Feature IDs requested via VITE_FEATURES (comma-separated, parsed by the app) */
  enabled: FeatureId[];
  /** Server URLs from env vars; a feature with requiresUrl unset here stays disabled */
  urls: Partial<Record<FeatureUrlKey, string>>;
  /** Optional runtime overrides from public/config.json (true=force on, false=force off) */
  runtimeConfig?: Partial<Record<FeatureId, boolean>>;
}
