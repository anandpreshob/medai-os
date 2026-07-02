/**
 * PolylineAnnotationTool - Open Path Drawing Tool
 *
 * Extends Cornerstone's PlanarFreehandROITool to provide open polyline
 * drawing capabilities with measurement support.
 *
 * Features:
 * - Click-to-add-point polyline drawing
 * - Double-click to complete
 * - Length measurement along path
 * - Segment length display
 * - Vertex editing support
 */

import { PlanarFreehandROITool, annotation, drawing } from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import type { Types as CoreTypes } from '@cornerstonejs/core';

const { getAnnotations } = annotation.state;

export interface PolylineAnnotation {
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
      totalLength?: number;
      segmentLengths?: number[];
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

// Configuration for polyline tool
interface PolylineToolConfiguration {
  /** Color for polyline stroke */
  strokeColor: string;
  /** Color when polyline is selected/active */
  activeColor: string;
  /** Stroke width */
  lineWidth: number;
  /** Handle radius for vertices */
  handleRadius: number;
  /** Whether to show total length measurement */
  showTotalLength: boolean;
  /** Whether to show individual segment lengths */
  showSegmentLengths: boolean;
  /** Line dash pattern (null for solid) */
  lineDash?: string;
  /** Arrow at end of polyline */
  showArrow: boolean;
}

const DEFAULT_CONFIGURATION: PolylineToolConfiguration = {
  strokeColor: '#00ffff',
  activeColor: '#ffff00',
  lineWidth: 2,
  handleRadius: 5,
  showTotalLength: true,
  showSegmentLengths: false,
  lineDash: undefined,
  showArrow: false,
};

export default class PolylineAnnotationTool extends PlanarFreehandROITool {
  static toolName = 'PolylineAnnotation';

  private polylineConfig: PolylineToolConfiguration;
  private currentAnnotationUID: string | null = null;

  constructor(
    toolProps: Record<string, unknown> = {},
    defaultToolProps: Record<string, unknown> = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        ...DEFAULT_CONFIGURATION,
        allowOpenContours: true, // Allow open polylines
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.polylineConfig = {
      ...DEFAULT_CONFIGURATION,
      ...((this.configuration as Partial<PolylineToolConfiguration>) || {}),
    };
  }

  /**
   * Calculate polyline statistics (total length, segment lengths)
   */
  public calculateStats(ann: PolylineAnnotation): { totalLength: number; segmentLengths: number[] } {
    const points = ann.data.contour?.polyline || ann.data.handles.points;
    if (!points || points.length < 2) {
      return { totalLength: 0, segmentLengths: [] };
    }

    const segmentLengths: number[] = [];
    let totalLength = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1][0] - points[i][0];
      const dy = points[i + 1][1] - points[i][1];
      const dz = points[i + 1][2] - points[i][2];
      const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
      segmentLengths.push(segmentLength);
      totalLength += segmentLength;
    }

    return { totalLength, segmentLengths };
  }

  /**
   * Custom rendering for polyline annotations
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

    const filtered = this.filterInteractableAnnotationsForElement(
      element,
      allAnnotations as unknown as ToolsTypes.Annotation[]
    );

    if (!filtered?.length) {
      return renderStatus;
    }

    for (const ann of filtered) {
      const polylineAnn = ann as unknown as PolylineAnnotation;
      const annotationUID = polylineAnn.annotationUID;
      const points = polylineAnn.data.contour?.polyline || polylineAnn.data.handles.points;

      if (!points || points.length === 0) continue;

      // Convert world coordinates to canvas coordinates
      const canvasPoints = points.map((p: CoreTypes.Point3) =>
        viewport.worldToCanvas(p)
      );

      // Determine color based on state
      const isActive = polylineAnn.highlighted || annotationUID === this.currentAnnotationUID;
      const strokeColor = isActive ? this.polylineConfig.activeColor : this.polylineConfig.strokeColor;

      if (canvasPoints.length >= 2) {
        // Draw polyline (open path, no closePath)
        drawing.drawPolyline(
          svgDrawingHelper,
          annotationUID,
          'polyline-path',
          canvasPoints,
          {
            color: strokeColor,
            lineWidth: this.polylineConfig.lineWidth,
            lineDash: polylineAnn.data.isComplete ? this.polylineConfig.lineDash : '5,5',
            closePath: false, // Never close polylines
          }
        );

        // Draw arrow at end if enabled
        if (this.polylineConfig.showArrow && canvasPoints.length >= 2) {
          this.drawArrowHead(
            svgDrawingHelper,
            annotationUID,
            canvasPoints[canvasPoints.length - 2],
            canvasPoints[canvasPoints.length - 1],
            strokeColor
          );
        }

        // Draw vertex handles
        drawing.drawHandles(
          svgDrawingHelper,
          annotationUID,
          'polyline-handles',
          canvasPoints,
          {
            color: strokeColor,
            handleRadius: this.polylineConfig.handleRadius,
          }
        );

        // Calculate and display measurements
        const stats = this.calculateStats(polylineAnn);
        polylineAnn.data.cachedStats = stats;

        // Draw total length at the end of the polyline
        if (this.polylineConfig.showTotalLength && polylineAnn.data.isComplete && canvasPoints.length >= 2) {
          const lastPoint = canvasPoints[canvasPoints.length - 1];

          drawing.drawTextBox(
            svgDrawingHelper,
            annotationUID,
            'polyline-total-length',
            [`${stats.totalLength.toFixed(2)} mm`],
            [lastPoint[0] + 10, lastPoint[1] - 10],
            {
              color: strokeColor,
              fontFamily: 'Arial',
              fontSize: '12px',
              background: 'rgba(0, 0, 0, 0.6)',
              padding: 4,
            }
          );
        }

        // Draw individual segment lengths if enabled
        if (this.polylineConfig.showSegmentLengths && polylineAnn.data.isComplete) {
          for (let i = 0; i < stats.segmentLengths.length; i++) {
            const midX = (canvasPoints[i][0] + canvasPoints[i + 1][0]) / 2;
            const midY = (canvasPoints[i][1] + canvasPoints[i + 1][1]) / 2;

            drawing.drawTextBox(
              svgDrawingHelper,
              annotationUID,
              `polyline-segment-${i}`,
              [`${stats.segmentLengths[i].toFixed(1)}`],
              [midX, midY - 15],
              {
                color: strokeColor,
                fontFamily: 'Arial',
                fontSize: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: 2,
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
   * Draw an arrow head at the end of the polyline
   */
  private drawArrowHead(
    svgDrawingHelper: ToolsTypes.SVGDrawingHelper,
    annotationUID: string,
    fromPoint: CoreTypes.Point2,
    toPoint: CoreTypes.Point2,
    color: string
  ): void {
    const arrowLength = 15;
    const arrowWidth = 8;

    // Calculate direction vector
    const dx = toPoint[0] - fromPoint[0];
    const dy = toPoint[1] - fromPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return;

    // Normalize
    const nx = dx / length;
    const ny = dy / length;

    // Perpendicular vector
    const px = -ny;
    const py = nx;

    // Arrow points
    const arrowBase: CoreTypes.Point2 = [
      toPoint[0] - nx * arrowLength,
      toPoint[1] - ny * arrowLength,
    ];

    const arrowLeft: CoreTypes.Point2 = [
      arrowBase[0] + px * arrowWidth / 2,
      arrowBase[1] + py * arrowWidth / 2,
    ];

    const arrowRight: CoreTypes.Point2 = [
      arrowBase[0] - px * arrowWidth / 2,
      arrowBase[1] - py * arrowWidth / 2,
    ];

    // Draw arrow as filled triangle
    drawing.drawPolyline(
      svgDrawingHelper,
      annotationUID,
      'polyline-arrow',
      [arrowLeft, toPoint, arrowRight],
      {
        color,
        lineWidth: 1,
        closePath: true,
        fillColor: color,
      }
    );
  }
}

/**
 * Get all polyline annotations from the tool
 */
export function getPolylineAnnotations(element: HTMLDivElement): PolylineAnnotation[] {
  const annotations = getAnnotations('PolylineAnnotation', element);
  return (annotations || []) as unknown as PolylineAnnotation[];
}

/**
 * Get completed polyline annotations
 */
export function getCompletedPolylineAnnotations(element: HTMLDivElement): PolylineAnnotation[] {
  return getPolylineAnnotations(element).filter((ann) => ann.data.isComplete);
}

/**
 * Clear all polyline annotations
 */
export function clearPolylineAnnotations(): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const polylineAnnotations = allAnnotations.filter(
    (ann: any) => ann.metadata?.toolName === 'PolylineAnnotation'
  );

  polylineAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });

  console.log('[PolylineAnnotationTool] Cleared', polylineAnnotations.length, 'annotations');
}

/**
 * Calculate cumulative distance along a polyline to a specific point
 */
export function getDistanceAlongPolyline(
  ann: PolylineAnnotation,
  targetIndex: number
): number {
  const points = ann.data.contour?.polyline || ann.data.handles.points;
  if (!points || points.length < 2 || targetIndex < 0) {
    return 0;
  }

  let distance = 0;
  const maxIndex = Math.min(targetIndex, points.length - 1);

  for (let i = 0; i < maxIndex; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const dz = points[i + 1][2] - points[i][2];
    distance += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return distance;
}

/**
 * Get the point on the polyline at a specific distance from the start
 */
export function getPointAtDistance(
  ann: PolylineAnnotation,
  distance: number
): CoreTypes.Point3 | null {
  const points = ann.data.contour?.polyline || ann.data.handles.points;
  if (!points || points.length < 2) {
    return null;
  }

  let accumulatedDistance = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const dz = points[i + 1][2] - points[i][2];
    const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (accumulatedDistance + segmentLength >= distance) {
      // Point is on this segment
      const t = (distance - accumulatedDistance) / segmentLength;
      return [
        points[i][0] + t * dx,
        points[i][1] + t * dy,
        points[i][2] + t * dz,
      ];
    }

    accumulatedDistance += segmentLength;
  }

  // Return last point if distance exceeds polyline length
  return points[points.length - 1];
}

/**
 * Simplify a polyline using the Douglas-Peucker algorithm
 */
export function simplifyPolyline(
  points: CoreTypes.Point3[],
  tolerance: number
): CoreTypes.Point3[] {
  if (points.length < 3) {
    return [...points];
  }

  // Find the point with maximum distance from the line between first and last points
  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const firstHalf = simplifyPolyline(points.slice(0, maxIndex + 1), tolerance);
    const secondHalf = simplifyPolyline(points.slice(maxIndex), tolerance);

    // Combine results (remove duplicate point at the join)
    return [...firstHalf.slice(0, -1), ...secondHalf];
  }

  // Otherwise, return just the endpoints
  return [first, last];
}

/**
 * Calculate perpendicular distance from a point to a line defined by two points
 */
function perpendicularDistance(
  point: CoreTypes.Point3,
  lineStart: CoreTypes.Point3,
  lineEnd: CoreTypes.Point3
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const dz = lineEnd[2] - lineStart[2];
  const lineLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (lineLength === 0) {
    // Line start and end are the same point
    const pdx = point[0] - lineStart[0];
    const pdy = point[1] - lineStart[1];
    const pdz = point[2] - lineStart[2];
    return Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
  }

  // Calculate distance using cross product
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - lineStart[0]) * dx +
        (point[1] - lineStart[1]) * dy +
        (point[2] - lineStart[2]) * dz) /
        (lineLength * lineLength)
    )
  );

  const nearestX = lineStart[0] + t * dx;
  const nearestY = lineStart[1] + t * dy;
  const nearestZ = lineStart[2] + t * dz;

  const distX = point[0] - nearestX;
  const distY = point[1] - nearestY;
  const distZ = point[2] - nearestZ;

  return Math.sqrt(distX * distX + distY * distY + distZ * distZ);
}
