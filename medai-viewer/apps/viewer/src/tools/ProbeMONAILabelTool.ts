/**
 * ProbeMONAILabel Tool - Custom probe tool for capturing point prompts
 * Used for SmartEdit with SAM and nninteractive models
 */

import { ProbeTool, annotation, drawing } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';

const { getAnnotations } = annotation.state;

interface StyleSpecifier {
  toolGroupId: string;
  toolName: string;
  viewportId: string;
  annotationUID?: string;
}

interface ProbeAnnotation {
  annotationUID: string;
  data: {
    handles: {
      points: Types.Point3[];
    };
    label?: string;
    isPositive?: boolean;
  };
  metadata?: {
    toolName: string;
  };
}

export default class ProbeMONAILabelTool extends ProbeTool {
  static toolName = 'ProbeMONAILabel';

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {
        customColor: undefined,
        positiveColor: '#00ff00', // Green for positive points
        negativeColor: '#ff0000', // Red for negative points
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    // Override addNewAnnotation to set isPositive
    const originalAddNewAnnotation = this.addNewAnnotation;
    this.addNewAnnotation = (evt: any): any => {
      const newAnnotation = originalAddNewAnnotation.call(this, evt);

      if (newAnnotation) {
        // Set isPositive based on current mode (extend the data object)
        (newAnnotation.data as any).isPositive = getPointMode();
        console.log('[ProbeMONAILabel] New annotation created, isPositive:', (newAnnotation.data as any).isPositive);
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
      const ann = filtered[i] as ProbeAnnotation;
      const annotationUID = ann.annotationUID;
      const data = ann.data;
      const point = data.handles.points[0];
      const canvasCoordinates = viewport.worldToCanvas(point);

      styleSpecifier.annotationUID = annotationUID;

      // Determine color based on point type (positive/negative)
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

      const handleGroupUID = '0';

      drawing.drawHandles(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        [canvasCoordinates],
        { color }
      );

      renderStatus = true;
    }

    return renderStatus;
  };
}

/**
 * Get all point annotations from the tool
 */
export function getPointAnnotations(element: HTMLDivElement): ProbeAnnotation[] {
  return (getAnnotations('ProbeMONAILabel', element) || []) as ProbeAnnotation[];
}

/**
 * Clear all point annotations
 */
export function clearPointAnnotations(): void {
  const annotationManager = annotation.state.getAnnotationManager();
  const allAnnotations = annotationManager.getAllAnnotations();

  const probeAnnotations = allAnnotations.filter(
    (ann: any) => ann.metadata?.toolName === 'ProbeMONAILabel'
  );

  probeAnnotations.forEach((ann: any) => {
    annotationManager.removeAnnotation(ann.annotationUID);
  });
}

/**
 * Set whether new points should be positive or negative
 */
export function setPointMode(isPositive: boolean): void {
  // Store in window for access during annotation creation
  (window as any).__probeMONAILabelPositive = isPositive;
}

/**
 * Get current point mode
 */
export function getPointMode(): boolean {
  return (window as any).__probeMONAILabelPositive !== false;
}
