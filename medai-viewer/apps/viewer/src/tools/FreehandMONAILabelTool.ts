/**
 * FreehandMONAILabel Tool - Custom freehand tool for capturing scribble and lasso prompts
 * Used for SmartEdit with nninteractive models
 *
 * - Scribble: Open freehand line (for quick annotation strokes)
 * - Lasso: Closed freehand contour (for enclosing regions)
 */

import { PlanarFreehandROITool, annotation, drawing } from '@cornerstonejs/tools';
import type { Types as CoreTypes } from '@cornerstonejs/core';

const { getAnnotations } = annotation.state;

interface StyleSpecifier {
  toolGroupId: string;
  toolName: string;
  viewportId: string;
  annotationUID?: string;
}

interface FreehandAnnotation {
  annotationUID: string;
  data: {
    handles: {
      points: CoreTypes.Point3[];
    };
    contour?: {
      polyline: CoreTypes.Point3[];
      closed: boolean;
    };
    polyline?: CoreTypes.Point3[];
    label?: string;
    isPositive?: boolean;
    isLasso?: boolean; // true for closed contour (lasso), false for open line (scribble)
  };
  metadata?: {
    toolName: string;
  };
}

// Store positive/negative mode and lasso/scribble mode in window for access during annotation creation
let freehandModePositive = true;
let freehandModeLasso = false; // false = scribble (open), true = lasso (closed)

export default class FreehandMONAILabelTool extends PlanarFreehandROITool {
  static toolName = 'FreehandMONAILabel';

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {
        customColor: undefined,
        positiveColor: '#00ff00', // Green for positive
        negativeColor: '#ff0000', // Red for negative
        allowOpenContours: true, // Allow both scribbles and lassos
        closeContourProximity: 10, // Pixels to close the contour
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    // Override addNewAnnotation to set isPositive and isLasso
    const originalAddNewAnnotation = this.addNewAnnotation;
    this.addNewAnnotation = (evt: any): any => {
      console.log('[FreehandMONAILabel] addNewAnnotation called');
      const newAnnotation = originalAddNewAnnotation.call(this, evt);

      if (newAnnotation) {
        // Set isPositive and isLasso based on current mode
        (newAnnotation.data as any).isPositive = getFreehandMode();
        (newAnnotation.data as any).isLasso = getFreehandLassoMode();
        console.log('[FreehandMONAILabel] New annotation created:', {
          uid: newAnnotation.annotationUID,
          isPositive: (newAnnotation.data as any).isPositive,
          isLasso: (newAnnotation.data as any).isLasso,
          hasPolyline: !!(newAnnotation.data?.contour?.polyline),
          polylineLength: newAnnotation.data?.contour?.polyline?.length || 0,
        });
      } else {
        console.log('[FreehandMONAILabel] addNewAnnotation returned null/undefined');
      }

      return newAnnotation;
    };

    // Override endCallback to close contours when in lasso mode
    const originalEndCallback = (this as any).endCallback;
    if (originalEndCallback) {
      (this as any).endCallback = (evt: any): void => {
        // Get the annotation being completed
        const { annotation: ann } = (this as any).editData || {};
        const isLasso = getFreehandLassoMode();

        // Force close the contour if in lasso mode
        if (ann && isLasso && ann.data?.contour) {
          ann.data.contour.closed = true;
          console.log('[FreehandMONAILabel] Closing lasso contour');
        }

        // Call original endCallback
        originalEndCallback.call(this, evt);
      };
    }
  }

  // Let the parent PlanarFreehandROITool handle rendering during drag
  // Override getAnnotationStyle to apply custom colors based on positive/negative mode
  getAnnotationStyle(context: any): any {
    const baseStyle = super.getAnnotationStyle?.(context) || {};
    const ann = context?.annotation;
    const data = ann?.data;
    const isPositive = data?.isPositive !== false;

    // Set color based on positive (green) vs negative (red)
    const color = isPositive
      ? (this.configuration?.positiveColor || '#00ff00')
      : (this.configuration?.negativeColor || '#ff0000');

    return {
      ...baseStyle,
      color,
      colorHighlighted: color,
      colorSelected: color,
      lineWidth: data?.isLasso ? 2 : 3,
      lineDash: isPositive ? undefined : '4,4',
    };
  }
}

/**
 * Get all freehand annotations from the tool
 */
export function getFreehandAnnotations(element: HTMLDivElement): FreehandAnnotation[] {
  const annotations = (getAnnotations('FreehandMONAILabel', element) || []) as FreehandAnnotation[];
  // Only log when there are annotations to reduce noise in console
  if (annotations.length > 0) {
    console.log('[FreehandMONAILabel:getAnnotations] Found', annotations.length, 'annotations');
    annotations.forEach((ann, i) => {
      const points = ann.data?.contour?.polyline || ann.data?.polyline || ann.data?.handles?.points || [];
      console.log(`[FreehandMONAILabel:getAnnotations] Ann ${i}: uid=${ann.annotationUID}, points=${points.length}, isPositive=${ann.data?.isPositive}, isLasso=${ann.data?.isLasso}`);
    });
  }
  return annotations;
}

/**
 * Clear all freehand annotations
 */
export function clearFreehandAnnotations(): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const freehandAnnotations = allAnnotations.filter(
    (ann: any) => ann.metadata?.toolName === 'FreehandMONAILabel'
  );

  freehandAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });
}

/**
 * Set whether new freehand annotations should be positive or negative
 */
export function setFreehandMode(isPositive: boolean): void {
  freehandModePositive = isPositive;
  (window as any).__freehandMONAILabelPositive = isPositive;
}

/**
 * Get current freehand positive/negative mode
 */
export function getFreehandMode(): boolean {
  return (window as any).__freehandMONAILabelPositive !== false;
}

/**
 * Set whether new freehand annotations should be lasso (closed) or scribble (open)
 */
export function setFreehandLassoMode(isLasso: boolean): void {
  freehandModeLasso = isLasso;
  (window as any).__freehandMONAILabelLasso = isLasso;
}

/**
 * Get current lasso/scribble mode
 */
export function getFreehandLassoMode(): boolean {
  return (window as any).__freehandMONAILabelLasso === true;
}
