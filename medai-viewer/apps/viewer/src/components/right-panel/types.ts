import type { Segment, SuiteTabConfig } from '@medai/core';

// Tab types - includes base tabs and suite-specific tabs
// Note: 'ask-medai' moved to bottom ChatPanel in ViewportArea
export type TabId =
  | 'auto-segmentation'
  | 'smart-edit'
  | 'oncology-metrics'
  | 'rt-structures'
  | 'neuro-metrics'
  | 'surgical-planning'
  | 'cardiac-metrics'
  | 'detection'
  | 'longitudinal-metrics'
  | 'longitudinal-report';

// Interaction mode types for SmartEdit
export type InteractionMode = 'point' | 'box' | 'scribble' | 'lasso';

// Tool types for segmentation editing
export type SegmentationTool = 'brush' | 'eraser' | 'lasso' | 'lasso-eraser' | null;

// Model info type
export interface ModelInfo {
  name: string;
  type: string;
  labels: string[];
  description: string;
  supportedModalities?: string[];
  ctLabels?: Record<string, number>;
  mrLabels?: Record<string, number>;
}

// Props for tab components
export interface TabProps {
  isConnected: boolean;
  hasImage: boolean;
  models: ModelInfo[];
  activeModel: string | null;
  onModelChange: (model: string) => void;
  onRun: (options?: { textPrompt?: string; modality?: string; roi_subset?: string[] }) => void;
  isInferring: boolean;
  error: string | null;
  is2DImage?: boolean;
  imageModality?: string;
  textPrompt: string;
  setTextPrompt: (value: string) => void;
}

// Extended props for SmartEdit tab
export interface SmartEditTabProps extends TabProps {
  activeImageId: string | null;
  activeImage: any; // LoadedImage | undefined
  client: any; // MonaiLabelClient | null
  activeSegmentIndex: number | null;
  activeSegmentationId: string | null;
  toolGroupId: string;
  onRunWithPrompts: (prompts: PromptPayload) => void;
}

// Prompt payload for interactive segmentation
export interface PromptPayload {
  posPoints?: number[][];
  negPoints?: number[][];
  posBoxes?: number[][][];
  negBoxes?: number[][][];
  posScribbles?: number[][][];
  negScribbles?: number[][][];
  posLassos?: number[][][];
  negLassos?: number[][][];
  isSubtractive?: boolean;
}

// Stored prompts per segment for SmartEdit
export interface SegmentPrompts {
  posPoints: number[][];
  negPoints: number[][];
  posBoxes: number[][][];
  negBoxes: number[][][];
  posScribbles: number[][][];
  negScribbles: number[][][];
  posLassos: number[][][];
  negLassos: number[][][];
}

// Props for SegmentItem component
export interface SegmentItemProps {
  segment: Segment;
  segmentationId: string;
  isActive: boolean;
  onSelect: () => void;
  onUpdateLabel: (newLabel: string) => void;
  onToggleVisibility: () => void;
}

// Segment colors palette
export const SEGMENT_COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
  '#00ffff', '#ff8000', '#8000ff', '#00ff80', '#ff8080',
];

// Helper to convert hex color to RGBA array
export function hexToRgba(hex: string, alpha = 180): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
}

// Helper to determine if a model supports 2D or 3D images
export function getModelDimensionality(modelName: string): '2D' | '3D' | 'both' {
  const name = modelName.toLowerCase();
  // BiomedParse V2 supports both 2D and 3D - it wraps 2D images as 3D with depth=1
  // and uses neighboring slice context in RGB channels (single slice gets replicated)
  if (name.includes('biomedparse')) return 'both';
  // TotalSegmentator is for 3D volumes only (CT/MR)
  if (name.includes('totalsegmentator')) return '3D';
  // SAM3 is for 3D volumes only
  if (name.includes('sam3')) return '3D';
  // nninteractive is for 3D volumes only
  if (name.includes('nninter')) return '3D';
  // Standard segmentation models are 3D
  if (name === 'segmentation') return '3D';
  // Default to 3D for unknown models (most medical imaging models are 3D)
  return '3D';
}

// Check if a model is compatible with the image modality
export function isModelCompatibleWithModality(
  model: { supportedModalities?: string[] },
  modality?: string
): boolean {
  // If model has no modality restriction, it's compatible with everything
  if (!model.supportedModalities || model.supportedModalities.length === 0) {
    return true;
  }
  // If image has no modality info, show all models
  if (!modality) {
    return true;
  }
  // Check if model supports this modality (case-insensitive)
  return model.supportedModalities.some(
    (m) => m.toLowerCase() === modality.toLowerCase()
  );
}

// Create empty segment prompts
export function createEmptySegmentPrompts(): SegmentPrompts {
  return {
    posPoints: [],
    negPoints: [],
    posBoxes: [],
    negBoxes: [],
    posScribbles: [],
    negScribbles: [],
    posLassos: [],
    negLassos: [],
  };
}
