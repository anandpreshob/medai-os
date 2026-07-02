/**
 * PolygonAnnotationTool - Closed Polygon Drawing Tool
 *
 * Extends Cornerstone's PlanarFreehandROITool to provide closed polygon
 * drawing capabilities with vertex editing support.
 *
 * Features:
 * - Click-to-add-point polygon drawing
 * - Automatic closure when near starting point
 * - Vertex editing (drag to move vertices)
 * - Visual feedback during drawing
 * - Area calculation for closed polygons
 */

import { PlanarFreehandROITool, annotation, drawing } from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import type { Types as CoreTypes } from '@cornerstonejs/core';

const { getAnnotations } = annotation.state;

export interface PolygonAnnotation {
  annotationUID: string;
  data: {
    handles: {
      points: CoreTypes.Point3[];
      activeHandleIndex?: number | null;
      textBox?: {
        hasMoved?: boolean;
        worldPosition?: CoreTypes.Point3;
        worldBoundingBox?: {
          topLeft: CoreTypes.Point3;
          topRight: CoreTypes.Point3;
          bottomLeft: CoreTypes.Point3;
          bottomRight: CoreTypes.Point3;
        };
      };
    };
    contour?: {
      polyline: CoreTypes.Point3[];
      closed: boolean;
    };
    label?: string;
    cachedStats?: {
      area?: number;
      perimeter?: number;
    };
    isComplete?: boolean;
  };
  metadata: {
    toolName: string;
    viewPlaneNormal?: CoreTypes.Point3;
    viewUp?: CoreTypes.Point3;
    referencedImageId?: string;
    FrameOfReferenceUID: string;
  };
  highlighted?: boolean;
  invalidated?: boolean;
}

// Configuration for polygon tool
interface PolygonToolConfiguration {
  /** Distance in canvas pixels to close polygon */
  closeContourProximity: number;
  /** Color for polygon stroke */
  strokeColor: string;
  /** Color when polygon is selected/active */
  activeColor: string;
  /** Fill color (with transparency) */
  fillColor: string;
  /** Stroke width */
  lineWidth: number;
  /** Handle radius for vertices */
  handleRadius: number;
  /** Whether to show area measurement */
  showArea: boolean;
  /** Whether to show perimeter measurement */
  showPerimeter: boolean;
}

const DEFAULT_CONFIGURATION: PolygonToolConfiguration = {
  closeContourProximity: 10,
  strokeColor: '#00ff00',
  activeColor: '#ffff00',
  fillColor: 'rgba(0, 255, 0, 0.1)',
  lineWidth: 2,
  handleRadius: 5,
  showArea: true,
  showPerimeter: false,
};

export default class PolygonAnnotationTool extends PlanarFreehandROITool {
  static toolName = 'PolygonAnnotation';

  private polygonConfig: PolygonToolConfiguration;
  private currentAnnotationUID: string | null = null;

  constructor(
    toolProps: Record<string, unknown> = {},
    defaultToolProps: Record<string, unknown> = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        ...DEFAULT_CONFIGURATION,
        allowOpenContours: false, // Force closed polygons
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.polygonConfig = {
      ...DEFAULT_CONFIGURATION,
      ...((this.configuration as Partial<PolygonToolConfiguration>) || {}),
    };
  }

  /**
   * Calculate polygon statistics (area, perimeter)
   */
  public calculateStats(ann: PolygonAnnotation): { area: number; perimeter: number } {
    const points = ann.data.contour?.polyline || ann.data.handles.points;
    if (!points || points.length < 3) {
      return { area: 0, perimeter: 0 };
    }

    // Calculate area using shoelace formula (2D projection)
    let area = 0;
    let perimeter = 0;

    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;

      // Area
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];

      // Perimeter
      const dx = points[j][0] - points[i][0];
      const dy = points[j][1] - points[i][1];
      const dz = points[j][2] - points[i][2];
      perimeter += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    area = Math.abs(area) / 2;

    return { area, perimeter };
  }

  /**
   * Custom rendering for polygon annotations - override parent
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

    // Filter using parent's method and cast result
    const filtered = this.filterInteractableAnnotationsForElement(
      element,
      allAnnotations as unknown as ToolsTypes.Annotation[]
    );

    if (!filtered?.length) {
      return renderStatus;
    }

    for (const ann of filtered) {
      const polygonAnn = ann as unknown as PolygonAnnotation;
      const annotationUID = polygonAnn.annotationUID;
      const points = polygonAnn.data.contour?.polyline || polygonAnn.data.handles.points;

      if (!points || points.length === 0) continue;

      // Convert world coordinates to canvas coordinates
      const canvasPoints = points.map((p: CoreTypes.Point3) =>
        viewport.worldToCanvas(p)
      );

      // Determine color based on state
      const isActive = polygonAnn.highlighted || annotationUID === this.currentAnnotationUID;
      const strokeColor = isActive ? this.polygonConfig.activeColor : this.polygonConfig.strokeColor;

      // Draw the polygon
      const isClosed = polygonAnn.data.contour?.closed ?? polygonAnn.data.isComplete ?? points.length >= 3;

      if (canvasPoints.length >= 2) {
        // Draw polygon outline
        drawing.drawPolyline(
          svgDrawingHelper,
          annotationUID,
          'polygon-outline',
          canvasPoints,
          {
            color: strokeColor,
            lineWidth: this.polygonConfig.lineWidth,
            lineDash: polygonAnn.data.isComplete ? undefined : '5,5',
            closePath: isClosed,
          }
        );

        // Draw vertex handles
        drawing.drawHandles(
          svgDrawingHelper,
          annotationUID,
          'polygon-handles',
          canvasPoints,
          {
            color: strokeColor,
            handleRadius: this.polygonConfig.handleRadius,
          }
        );

        // Draw statistics if polygon is complete
        if (isClosed && (this.polygonConfig.showArea || this.polygonConfig.showPerimeter)) {
          const stats = this.calculateStats(polygonAnn);
          polygonAnn.data.cachedStats = stats;

          // Find centroid for text placement
          const centroid = this.calculateCentroid(canvasPoints);

          const textLines: string[] = [];
          if (this.polygonConfig.showArea) {
            textLines.push(`Area: ${stats.area.toFixed(2)} mm\u00B2`);
          }
          if (this.polygonConfig.showPerimeter) {
            textLines.push(`Perimeter: ${stats.perimeter.toFixed(2)} mm`);
          }

          if (textLines.length > 0) {
            drawing.drawTextBox(
              svgDrawingHelper,
              annotationUID,
              'polygon-stats',
              textLines,
              [centroid.x, centroid.y],
              {
                color: strokeColor,
                fontFamily: 'Arial',
                fontSize: '12px',
                background: 'rgba(0, 0, 0, 0.6)',
                padding: 4,
              }
            );
          }
        }
      }

      renderStatus = true;
    }

    return renderStatus;
  };

  /**
   * Calculate centroid of canvas points
   */
  private calculateCentroid(points: CoreTypes.Point2[]): { x: number; y: number } {
    let cx = 0;
    let cy = 0;

    for (const p of points) {
      cx += p[0];
      cy += p[1];
    }

    return {
      x: cx / points.length,
      y: cy / points.length,
    };
  }
}

/**
 * Get all polygon annotations from the tool
 */
export function getPolygonAnnotations(element: HTMLDivElement): PolygonAnnotation[] {
  const annotations = getAnnotations('PolygonAnnotation', element);
  return (annotations || []) as unknown as PolygonAnnotation[];
}

/**
 * Get completed polygon annotations
 */
export function getCompletedPolygonAnnotations(element: HTMLDivElement): PolygonAnnotation[] {
  return getPolygonAnnotations(element).filter((ann) => ann.data.isComplete);
}

/**
 * Clear all polygon annotations
 */
export function clearPolygonAnnotations(): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const polygonAnnotations = allAnnotations.filter(
    (ann: any) => ann.metadata?.toolName === 'PolygonAnnotation'
  );

  polygonAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });

  console.log('[PolygonAnnotationTool] Cleared', polygonAnnotations.length, 'annotations');
}

/**
 * Convert polygon annotation to mask
 */
export function polygonToMask(
  ann: PolygonAnnotation,
  width: number,
  height: number,
  worldToImage: (point: CoreTypes.Point3) => [number, number]
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const points = ann.data.contour?.polyline || ann.data.handles.points;

  if (!points || points.length < 3) {
    return mask;
  }

  // Convert world points to image coordinates
  const imagePoints = points.map((p) => worldToImage(p));

  // Fill polygon using scanline algorithm
  const minY = Math.max(0, Math.floor(Math.min(...imagePoints.map((p) => p[1]))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...imagePoints.map((p) => p[1]))));

  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];

    for (let i = 0; i < imagePoints.length; i++) {
      const j = (i + 1) % imagePoints.length;
      const y1 = imagePoints[i][1];
      const y2 = imagePoints[j][1];

      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const x1 = imagePoints[i][0];
        const x2 = imagePoints[j][0];
        const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length; i += 2) {
      const x1 = Math.max(0, Math.floor(intersections[i]));
      const x2 = Math.min(width - 1, Math.ceil(intersections[i + 1] || intersections[i]));

      for (let x = x1; x <= x2; x++) {
        mask[y * width + x] = 1;
      }
    }
  }

  return mask;
}
