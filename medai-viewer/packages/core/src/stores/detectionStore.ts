import { create } from 'zustand';

/**
 * Color palette for detection bounding boxes based on confidence level
 */
const CONFIDENCE_COLORS = {
  high: '#22c55e',     // Green - confidence >= 80%
  medium: '#eab308',   // Yellow - confidence 50-80%
  low: '#ef4444',      // Red - confidence < 50%
};

/** Color for manual/user-drawn detections */
const MANUAL_DETECTION_COLOR = '#8b5cf6'; // Purple

/**
 * Single AI detection result with bounding box coordinates
 */
export interface Detection {
  /** Unique detection ID */
  id: string;
  /** Abnormality label (e.g., "Cardiomegaly", "Pleural Effusion") */
  label: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Bounding box coordinates */
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  /** Whether to show this detection on the viewport */
  visible: boolean;
  /** Display color based on confidence */
  color: string;
  /** Optional notes/description */
  description?: string;
  /** Whether user has verified/edited this detection */
  userVerified?: boolean;
  /** Whether to include in report */
  includeInReport: boolean;
  /** Source of the detection: AI-generated or manually drawn by user */
  source: 'ai' | 'manual';
}

/**
 * Detection state and actions
 */
export interface DetectionState {
  /** Map of imageId -> detections for that image */
  detections: Map<string, Detection[]>;

  /** Whether detection is currently running */
  isDetecting: boolean;

  /** Detection progress (0-100) */
  detectionProgress: number;

  /** Error message if detection failed */
  detectionError: string | null;

  /** Currently selected detection ID */
  selectedDetectionId: string | null;

  /** AI-generated description of the image */
  aiDescription: string | null;

  /** Processing time in ms */
  processingTimeMs: number | null;

  /** Whether drawing mode is active for manual box creation */
  isDrawingMode: boolean;

  // === Actions ===

  /** Start detection (sets loading state) */
  startDetection: () => void;

  /** Set detection progress */
  setDetectionProgress: (progress: number) => void;

  /** Set detection error */
  setDetectionError: (error: string | null) => void;

  /** Add detections for an image */
  setDetections: (imageId: string, detections: Detection[], description?: string, processingTimeMs?: number) => void;

  /** Add a manually drawn detection */
  addManualDetection: (imageId: string, detection: Omit<Detection, 'id' | 'color' | 'source'>) => void;

  /** Set drawing mode enabled/disabled */
  setDrawingMode: (enabled: boolean) => void;

  /** Clear detections for an image */
  clearDetections: (imageId: string) => void;

  /** Toggle visibility of a detection */
  toggleDetectionVisibility: (imageId: string, detectionId: string) => void;

  /** Toggle all detections visibility */
  toggleAllVisibility: (imageId: string, visible: boolean) => void;

  /** Select a detection */
  selectDetection: (detectionId: string | null) => void;

  /** Update detection label */
  updateDetectionLabel: (imageId: string, detectionId: string, newLabel: string) => void;

  /** Toggle include in report */
  toggleIncludeInReport: (imageId: string, detectionId: string) => void;

  /** Mark detection as user verified */
  markAsVerified: (imageId: string, detectionId: string) => void;

  /** Delete a detection */
  deleteDetection: (imageId: string, detectionId: string) => void;

  /** Update detection bounding box coordinates */
  updateDetectionBounds: (
    imageId: string,
    detectionId: string,
    bounds: { x_min: number; y_min: number; x_max: number; y_max: number }
  ) => void;

  /** Get detections for an image */
  getDetectionsForImage: (imageId: string) => Detection[];

  /** Get visible detections for an image */
  getVisibleDetections: (imageId: string) => Detection[];

  /** Get detections to include in report */
  getReportDetections: (imageId: string) => Detection[];

  /** Reset store */
  reset: () => void;
}

/**
 * Get color based on confidence level
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return CONFIDENCE_COLORS.high;
  if (confidence >= 0.5) return CONFIDENCE_COLORS.medium;
  return CONFIDENCE_COLORS.low;
}

/**
 * Generate unique detection ID
 */
function generateDetectionId(): string {
  return `det_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const initialState = {
  detections: new Map<string, Detection[]>(),
  isDetecting: false,
  detectionProgress: 0,
  detectionError: null as string | null,
  selectedDetectionId: null as string | null,
  aiDescription: null as string | null,
  processingTimeMs: null as number | null,
  isDrawingMode: false,
};

/**
 * Detection store for managing AI detection results
 */
export const useDetectionStore = create<DetectionState>((set, get) => ({
  ...initialState,

  startDetection: () =>
    set({
      isDetecting: true,
      detectionProgress: 0,
      detectionError: null,
    }),

  setDetectionProgress: (progress) =>
    set({ detectionProgress: progress }),

  setDetectionError: (error) =>
    set({
      isDetecting: false,
      detectionProgress: 0,
      detectionError: error,
    }),

  setDetections: (imageId, rawDetections, description, processingTimeMs) => {
    // Process raw detections and add IDs, colors, etc.
    // Mark all detections from setDetections as AI-generated
    const processedDetections: Detection[] = rawDetections.map((det, index) => ({
      id: det.id || generateDetectionId(),
      label: det.label,
      confidence: det.confidence,
      x_min: det.x_min,
      y_min: det.y_min,
      x_max: det.x_max,
      y_max: det.y_max,
      visible: true,
      color: det.color || getConfidenceColor(det.confidence),
      description: det.description,
      userVerified: det.userVerified || false,
      includeInReport: det.includeInReport !== undefined ? det.includeInReport : true,
      source: 'ai' as const,
    }));

    set((state) => {
      const newDetections = new Map(state.detections);
      // Preserve manual detections when replacing AI detections
      const existingDetections = newDetections.get(imageId) || [];
      const manualDetections = existingDetections.filter((d) => d.source === 'manual');
      // Combine new AI detections with existing manual detections
      newDetections.set(imageId, [...processedDetections, ...manualDetections]);
      return {
        detections: newDetections,
        isDetecting: false,
        detectionProgress: 100,
        aiDescription: description || null,
        processingTimeMs: processingTimeMs || null,
      };
    });
  },

  addManualDetection: (imageId, detection) => {
    const newDetection: Detection = {
      id: generateDetectionId(),
      label: detection.label,
      confidence: detection.confidence,
      x_min: detection.x_min,
      y_min: detection.y_min,
      x_max: detection.x_max,
      y_max: detection.y_max,
      visible: detection.visible,
      color: MANUAL_DETECTION_COLOR, // Purple for manual detections
      description: detection.description,
      userVerified: detection.userVerified,
      includeInReport: detection.includeInReport,
      source: 'manual',
    };

    set((state) => {
      const newDetections = new Map(state.detections);
      const existing = newDetections.get(imageId) || [];
      newDetections.set(imageId, [...existing, newDetection]);
      return {
        detections: newDetections,
        selectedDetectionId: newDetection.id, // Select the newly created detection
        isDrawingMode: false, // Exit drawing mode after adding
      };
    });
  },

  setDrawingMode: (enabled) =>
    set({ isDrawingMode: enabled, selectedDetectionId: null }),

  clearDetections: (imageId) =>
    set((state) => {
      const newDetections = new Map(state.detections);
      newDetections.delete(imageId);
      return {
        detections: newDetections,
        selectedDetectionId: null,
        aiDescription: null,
      };
    }),

  toggleDetectionVisibility: (imageId, detectionId) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.map((det) =>
        det.id === detectionId ? { ...det, visible: !det.visible } : det
      );

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);
      return { detections: newDetections };
    }),

  toggleAllVisibility: (imageId, visible) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.map((det) => ({
        ...det,
        visible,
      }));

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);
      return { detections: newDetections };
    }),

  selectDetection: (detectionId) =>
    set({ selectedDetectionId: detectionId }),

  updateDetectionLabel: (imageId, detectionId, newLabel) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.map((det) =>
        det.id === detectionId
          ? { ...det, label: newLabel, userVerified: true }
          : det
      );

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);
      return { detections: newDetections };
    }),

  toggleIncludeInReport: (imageId, detectionId) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.map((det) =>
        det.id === detectionId
          ? { ...det, includeInReport: !det.includeInReport }
          : det
      );

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);
      return { detections: newDetections };
    }),

  markAsVerified: (imageId, detectionId) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.map((det) =>
        det.id === detectionId ? { ...det, userVerified: true } : det
      );

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);
      return { detections: newDetections };
    }),

  deleteDetection: (imageId, detectionId) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.filter((det) => det.id !== detectionId);

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);

      // Clear selection if deleted detection was selected
      const newSelectedId = state.selectedDetectionId === detectionId ? null : state.selectedDetectionId;

      return { detections: newDetections, selectedDetectionId: newSelectedId };
    }),

  updateDetectionBounds: (imageId, detectionId, bounds) =>
    set((state) => {
      const imageDetections = state.detections.get(imageId);
      if (!imageDetections) return state;

      const updatedDetections = imageDetections.map((det) =>
        det.id === detectionId
          ? {
              ...det,
              x_min: bounds.x_min,
              y_min: bounds.y_min,
              x_max: bounds.x_max,
              y_max: bounds.y_max,
              userVerified: true, // Mark as verified since user edited it
            }
          : det
      );

      const newDetections = new Map(state.detections);
      newDetections.set(imageId, updatedDetections);
      return { detections: newDetections };
    }),

  getDetectionsForImage: (imageId) => {
    return get().detections.get(imageId) || [];
  },

  getVisibleDetections: (imageId) => {
    const imageDetections = get().detections.get(imageId) || [];
    return imageDetections.filter((det) => det.visible);
  },

  getReportDetections: (imageId) => {
    const imageDetections = get().detections.get(imageId) || [];
    return imageDetections.filter((det) => det.includeInReport);
  },

  reset: () => set(initialState),
}));
