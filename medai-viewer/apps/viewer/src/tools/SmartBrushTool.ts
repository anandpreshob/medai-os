/**
 * SmartBrushTool - AI Click-to-Segment Tool
 *
 * Provides click-to-segment functionality with integration to SAM and BiomedParse models.
 * Supports point prompts for automatic segmentation.
 *
 * Features:
 * - Single click to trigger AI segmentation
 * - Support for positive (include) and negative (exclude) points
 * - Integration with SAM, SAM2, MedSAM, and BiomedParse models
 * - Visual feedback for placed points
 * - Configurable point colors and sizes
 */

import { BaseTool, annotation, drawing } from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import type { Types as CoreTypes } from '@cornerstonejs/core';

const { getAnnotations } = annotation.state;

/**
 * Point prompt for AI segmentation
 */
export interface SmartBrushPoint {
  annotationUID: string;
  data: {
    handles: {
      points: CoreTypes.Point3[];
    };
    isPositive: boolean;
    label?: string;
  };
  metadata: {
    toolName: string;
    viewPlaneNormal?: CoreTypes.Point3;
    viewUp?: CoreTypes.Point3;
    referencedImageId?: string;
    sliceIndex?: number;
    FrameOfReferenceUID: string;
  };
  highlighted?: boolean;
}

/**
 * Configuration for SmartBrush tool
 */
interface SmartBrushConfiguration {
  /** Color for positive (include) points */
  positiveColor: string;
  /** Color for negative (exclude) points */
  negativeColor: string;
  /** Point radius for rendering */
  pointRadius: number;
  /** Whether new points are positive by default */
  defaultPositive: boolean;
  /** Auto-trigger inference after each point */
  autoTriggerInference: boolean;
  /** Maximum points allowed before inference */
  maxPoints: number;
  /** Model to use for inference */
  model: 'sam' | 'sam2' | 'medsam' | 'biomedparse' | 'nninteractive';
}

const DEFAULT_CONFIGURATION: SmartBrushConfiguration = {
  positiveColor: '#00ff00',
  negativeColor: '#ff0000',
  pointRadius: 8,
  defaultPositive: true,
  autoTriggerInference: true,
  maxPoints: 20,
  model: 'sam2',
};

// Store the current mode globally for access during annotation creation
let currentIsPositive = true;

/**
 * Set whether new points should be positive or negative
 */
export function setSmartBrushMode(isPositive: boolean): void {
  currentIsPositive = isPositive;
  (window as unknown as Record<string, unknown>).__smartBrushPositive = isPositive;
}

/**
 * Get current SmartBrush mode
 */
export function getSmartBrushMode(): boolean {
  const windowAny = window as unknown as Record<string, unknown>;
  return windowAny.__smartBrushPositive !== false;
}

export default class SmartBrushTool extends BaseTool {
  static toolName = 'SmartBrush';

  private smartBrushConfig: SmartBrushConfiguration;
  private inferenceCallback: ((points: SmartBrushPoint[]) => void) | null = null;

  constructor(
    toolProps: Record<string, unknown> = {},
    defaultToolProps: Record<string, unknown> = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: DEFAULT_CONFIGURATION,
    }
  ) {
    super(toolProps, defaultToolProps);
    this.smartBrushConfig = {
      ...DEFAULT_CONFIGURATION,
      ...((this.configuration as Partial<SmartBrushConfiguration>) || {}),
    };
  }

  /**
   * Set callback for when inference should be triggered
   */
  public setInferenceCallback(callback: (points: SmartBrushPoint[]) => void): void {
    this.inferenceCallback = callback;
  }

  /**
   * Mouse down handler - add a point and optionally trigger inference
   */
  preMouseDownCallback = (
    evt: ToolsTypes.EventTypes.MouseDownActivateEventType
  ): boolean => {
    return false; // Let mouseDownCallback handle it
  };

  mouseDownCallback = (
    evt: ToolsTypes.EventTypes.MouseDownActivateEventType
  ): void => {
    const eventDetail = evt.detail as any;
    const { element } = eventDetail;
    const currentPoints = eventDetail.currentPoints as { world: CoreTypes.Point3 } | undefined;

    if (!currentPoints || !currentPoints.world) {
      return;
    }

    const worldPoint = currentPoints.world;
    const isPositive = getSmartBrushMode();

    // Get viewport from element to access camera
    const enabledElement = (eventDetail as any).viewportId || '';

    // Create point annotation
    const point = this.createPointAnnotation(worldPoint, isPositive, element, enabledElement);

    if (point) {
      // Check if we should trigger inference
      if (this.smartBrushConfig.autoTriggerInference) {
        const allPoints = getSmartBrushPoints(element);
        if (this.inferenceCallback) {
          this.inferenceCallback(allPoints);
        }
        this.triggerInferenceEvent(allPoints, element);
      }
    }
  };

  /**
   * Create a point annotation
   */
  private createPointAnnotation(
    worldPoint: CoreTypes.Point3,
    isPositive: boolean,
    element: HTMLDivElement,
    enabledElementId: string | undefined
  ): SmartBrushPoint | null {
    const annotationUID = `smartbrush_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const point: SmartBrushPoint = {
      annotationUID,
      data: {
        handles: {
          points: [worldPoint],
        },
        isPositive,
        label: isPositive ? 'Include' : 'Exclude',
      },
      metadata: {
        toolName: SmartBrushTool.toolName,
        FrameOfReferenceUID: enabledElementId || '',
      },
      highlighted: false,
    };

    // Add to annotation state using the state function which accepts element
    annotation.state.addAnnotation(point as unknown as ToolsTypes.Annotation, element);

    console.log(
      '[SmartBrushTool] Added point:',
      isPositive ? 'positive' : 'negative',
      'at',
      worldPoint
    );

    return point;
  }

  /**
   * Trigger a custom event for inference
   */
  private triggerInferenceEvent(points: SmartBrushPoint[], element: HTMLDivElement): void {
    const event = new CustomEvent('smartbrush:inference', {
      detail: {
        points: points.map((p) => ({
          worldPoint: p.data.handles.points[0],
          isPositive: p.data.isPositive,
          annotationUID: p.annotationUID,
        })),
        model: this.smartBrushConfig.model,
      },
      bubbles: true,
    });

    element.dispatchEvent(event);
    console.log('[SmartBrushTool] Triggered inference event with', points.length, 'points');
  }

  /**
   * Render point annotations
   */
  renderAnnotation = (
    enabledElement: any,
    svgDrawingHelper: any
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    const allAnnotations = getAnnotations(this.getToolName(), element);

    if (!allAnnotations?.length) {
      return renderStatus;
    }

    // Filter annotations
    const annotations = allAnnotations as unknown as SmartBrushPoint[];

    for (const ann of annotations) {
      const annotationUID = ann.annotationUID;
      const point = ann.data.handles.points[0];

      if (!point) continue;

      // Convert world coordinates to canvas coordinates
      const canvasPoint = viewport.worldToCanvas(point);

      // Determine color based on positive/negative
      const color = ann.data.isPositive
        ? this.smartBrushConfig.positiveColor
        : this.smartBrushConfig.negativeColor;

      // Draw the point with a circle and inner marker
      this.drawSmartBrushPoint(
        svgDrawingHelper,
        annotationUID,
        canvasPoint,
        color,
        ann.data.isPositive,
        ann.highlighted || false
      );

      renderStatus = true;
    }

    return renderStatus;
  };

  /**
   * Draw a SmartBrush point with visual indicator
   */
  private drawSmartBrushPoint(
    svgDrawingHelper: any,
    annotationUID: string,
    canvasPoint: CoreTypes.Point2,
    color: string,
    isPositive: boolean,
    highlighted: boolean
  ): void {
    const radius = highlighted
      ? this.smartBrushConfig.pointRadius * 1.3
      : this.smartBrushConfig.pointRadius;

    // Outer circle
    drawing.drawCircle(
      svgDrawingHelper,
      annotationUID,
      'smartbrush-point-outer',
      [canvasPoint[0], canvasPoint[1]],
      radius,
      {
        color,
        lineWidth: 2,
        fill: 'rgba(0, 0, 0, 0.3)',
      }
    );

    // Inner marker (+ for positive, - for negative)
    const markerSize = radius * 0.6;

    if (isPositive) {
      // Draw + symbol
      // Horizontal line
      drawing.drawLine(
        svgDrawingHelper,
        annotationUID,
        'smartbrush-plus-h',
        [canvasPoint[0] - markerSize, canvasPoint[1]],
        [canvasPoint[0] + markerSize, canvasPoint[1]],
        {
          color,
          lineWidth: 2,
        }
      );
      // Vertical line
      drawing.drawLine(
        svgDrawingHelper,
        annotationUID,
        'smartbrush-plus-v',
        [canvasPoint[0], canvasPoint[1] - markerSize],
        [canvasPoint[0], canvasPoint[1] + markerSize],
        {
          color,
          lineWidth: 2,
        }
      );
    } else {
      // Draw - symbol
      drawing.drawLine(
        svgDrawingHelper,
        annotationUID,
        'smartbrush-minus',
        [canvasPoint[0] - markerSize, canvasPoint[1]],
        [canvasPoint[0] + markerSize, canvasPoint[1]],
        {
          color,
          lineWidth: 2,
        }
      );
    }
  }

  /**
   * Handle mouse move for highlighting
   */
  mouseMoveCallback = (evt: ToolsTypes.EventTypes.MouseMoveEventType): boolean => {
    const eventDetail = evt.detail as any;
    const { element } = eventDetail;
    const currentPoints = eventDetail.currentPoints as { world: CoreTypes.Point3 } | undefined;

    if (!currentPoints || !currentPoints.world) {
      return false;
    }

    const allAnnotations = getAnnotations(this.getToolName(), element);
    if (!allAnnotations) return false;

    const annotations = allAnnotations as unknown as SmartBrushPoint[];
    let needsRender = false;

    for (const ann of annotations) {
      const point = ann.data.handles.points[0];
      const distance = this.distance3D(currentPoints.world, point);

      const wasHighlighted = ann.highlighted;
      ann.highlighted = distance < 10; // Highlight threshold in world units

      if (wasHighlighted !== ann.highlighted) {
        needsRender = true;
      }
    }

    return needsRender;
  };

  /**
   * Calculate 3D distance between two points
   */
  private distance3D(p1: CoreTypes.Point3, p2: CoreTypes.Point3): number {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

/**
 * Get all SmartBrush points from the tool
 */
export function getSmartBrushPoints(element: HTMLDivElement): SmartBrushPoint[] {
  const annotations = getAnnotations('SmartBrush', element);
  return (annotations || []) as unknown as SmartBrushPoint[];
}

/**
 * Get positive SmartBrush points
 */
export function getPositiveSmartBrushPoints(element: HTMLDivElement): SmartBrushPoint[] {
  return getSmartBrushPoints(element).filter((p) => p.data.isPositive);
}

/**
 * Get negative SmartBrush points
 */
export function getNegativeSmartBrushPoints(element: HTMLDivElement): SmartBrushPoint[] {
  return getSmartBrushPoints(element).filter((p) => !p.data.isPositive);
}

/**
 * Clear all SmartBrush points
 */
export function clearSmartBrushPoints(): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const smartBrushAnnotations = allAnnotations.filter(
    (ann: any) => ann.metadata?.toolName === 'SmartBrush'
  );

  smartBrushAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });

  console.log('[SmartBrushTool] Cleared', smartBrushAnnotations.length, 'points');
}

/**
 * Clear points by polarity
 */
export function clearSmartBrushPointsByPolarity(isPositive: boolean): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const matchingAnnotations = allAnnotations.filter(
    (ann: any) => {
      const smartAnn = ann as unknown as SmartBrushPoint;
      return ann.metadata?.toolName === 'SmartBrush' && smartAnn.data?.isPositive === isPositive;
    }
  );

  matchingAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });

  console.log(
    '[SmartBrushTool] Cleared',
    matchingAnnotations.length,
    isPositive ? 'positive' : 'negative',
    'points'
  );
}

/**
 * Convert SmartBrush points to inference prompt format
 */
export function pointsToPromptFormat(
  points: SmartBrushPoint[],
  worldToIJK: (point: CoreTypes.Point3) => [number, number, number] | null
): {
  posPoints: number[][];
  negPoints: number[][];
} {
  const posPoints: number[][] = [];
  const negPoints: number[][] = [];

  for (const point of points) {
    const worldPoint = point.data.handles.points[0];
    const ijkPoint = worldToIJK(worldPoint);

    if (ijkPoint) {
      if (point.data.isPositive) {
        posPoints.push(ijkPoint);
      } else {
        negPoints.push(ijkPoint);
      }
    }
  }

  return { posPoints, negPoints };
}

/**
 * Remove the last added point
 */
export function undoLastSmartBrushPoint(element: HTMLDivElement): SmartBrushPoint | null {
  const points = getSmartBrushPoints(element);

  if (points.length === 0) {
    return null;
  }

  // Sort by annotationUID (which includes timestamp)
  const sorted = [...points].sort((a, b) => {
    return b.annotationUID.localeCompare(a.annotationUID);
  });

  const lastPoint = sorted[0];

  const annotationManager = annotation.state.getAnnotationManager();
  annotationManager.removeAnnotation(lastPoint.annotationUID);

  console.log('[SmartBrushTool] Removed last point:', lastPoint.annotationUID);

  return lastPoint;
}
