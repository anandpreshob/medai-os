/**
 * RectangleMONAILabel Tool - Custom rectangle tool for capturing bounding box prompts
 * Used for SmartEdit with nninteractive models
 */

import { RectangleROITool, annotation, drawing, Types } from '@cornerstonejs/tools';
import type { Types as CoreTypes } from '@cornerstonejs/core';

const { getAnnotations } = annotation.state;

interface StyleSpecifier {
  toolGroupId: string;
  toolName: string;
  viewportId: string;
  annotationUID?: string;
}

interface RectangleAnnotation {
  annotationUID: string;
  data: {
    handles: {
      points: CoreTypes.Point3[];
    };
    label?: string;
    isPositive?: boolean;
  };
  metadata?: {
    toolName: string;
  };
}

// Store positive/negative mode in window for access during annotation creation
let boxModePositive = true;

export default class RectangleMONAILabelTool extends RectangleROITool {
  static toolName = 'RectangleMONAILabel';

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {
        customColor: undefined,
        positiveColor: '#00ff00', // Green for positive boxes
        negativeColor: '#ff0000', // Red for negative boxes
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    // Override addNewAnnotation to set isPositive
    const originalAddNewAnnotation = this.addNewAnnotation;
    this.addNewAnnotation = (evt: any): any => {
      const newAnnotation = originalAddNewAnnotation.call(this, evt);

      if (newAnnotation) {
        // Set isPositive based on current mode
        (newAnnotation.data as any).isPositive = getBoxMode();
        console.log('[RectangleMONAILabel] New annotation created, isPositive:', (newAnnotation.data as any).isPositive);
      }

      return newAnnotation;
    };
  }

  renderAnnotation = (enabledElement: any, svgDrawingHelper: any): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    const filtered = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!filtered?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < filtered.length; i++) {
      const ann = filtered[i] as RectangleAnnotation;
      const annotationUID = ann.annotationUID;
      const data = ann.data;
      const handles = data.handles.points;

      if (handles.length < 4) continue;

      styleSpecifier.annotationUID = annotationUID;

      // Determine color based on box type (positive/negative)
      const isPositive = data.isPositive !== false; // Default to positive
      let color: string;

      if (this.configuration?.customColor) {
        color = this.configuration.customColor;
      } else if (isPositive) {
        color = this.configuration?.positiveColor || '#00ff00';
      } else {
        color = this.configuration?.negativeColor || '#ff0000';
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      // Convert world coordinates to canvas coordinates for all 4 corners
      const canvasCoordinates = handles.map((point: CoreTypes.Point3) =>
        viewport.worldToCanvas(point)
      );

      // Draw the rectangle as a polygon
      const points = [
        canvasCoordinates[0],
        canvasCoordinates[1],
        canvasCoordinates[3], // Note: corner order from RectangleROITool
        canvasCoordinates[2],
      ];

      drawing.drawPolyline(
        svgDrawingHelper,
        annotationUID,
        'rectangle',
        points,
        {
          color,
          lineWidth: 2,
          lineDash: isPositive ? undefined : '5,5', // Dashed for negative
          closePath: true,
        }
      );

      // Draw corner handles
      drawing.drawHandles(
        svgDrawingHelper,
        annotationUID,
        'handles',
        canvasCoordinates,
        { color, handleRadius: 4 }
      );

      renderStatus = true;
    }

    return renderStatus;
  };
}

/**
 * Get all rectangle annotations from the tool
 */
export function getBoxAnnotations(element: HTMLDivElement): RectangleAnnotation[] {
  return (getAnnotations('RectangleMONAILabel', element) || []) as RectangleAnnotation[];
}

/**
 * Clear all rectangle annotations
 */
export function clearBoxAnnotations(): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const boxAnnotations = allAnnotations.filter(
    (ann: any) => ann.metadata?.toolName === 'RectangleMONAILabel'
  );

  boxAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });
}

/**
 * Set whether new boxes should be positive or negative
 */
export function setBoxMode(isPositive: boolean): void {
  boxModePositive = isPositive;
  (window as any).__rectangleMONAILabelPositive = isPositive;
}

/**
 * Get current box mode
 */
export function getBoxMode(): boolean {
  return (window as any).__rectangleMONAILabelPositive !== false;
}
