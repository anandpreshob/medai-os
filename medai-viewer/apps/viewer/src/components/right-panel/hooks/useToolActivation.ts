import { useState, useCallback, useEffect } from 'react';
import {
  activateBrushTool,
  activateEraserTool,
  activateLassoFillTool,
  activateLassoEraserTool,
  deactivateSegmentationTools,
  getBrushSize,
  setBrushSize,
  BRUSH_SIZE_CHANGED_EVENT,
} from '../../../lib/cornerstone';
import type { SegmentationTool } from '../types';

interface UseToolActivationProps {
  toolGroupId: string;
  activeSegmentIndex: number | null;
  activeSegmentationId: string | null;
}

export function useToolActivation({
  toolGroupId,
  activeSegmentIndex,
  activeSegmentationId,
}: UseToolActivationProps) {
  const [activeTool, setActiveTool] = useState<SegmentationTool>(null);
  const [brushSize, setBrushSizeState] = useState(15);

  // Sync brush size from cornerstone on mount and when tool changes
  useEffect(() => {
    if (activeTool) {
      const size = getBrushSize(toolGroupId);
      setBrushSizeState(size);
    }
  }, [activeTool, toolGroupId]);

  // Listen for brush size changes from Ctrl+scroll
  useEffect(() => {
    const handleBrushSizeChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ toolGroupId: string; size: number }>;
      // Accept events from either 2D or 3D tool group
      if (customEvent.detail.toolGroupId === toolGroupId) {
        setBrushSizeState(customEvent.detail.size);
      }
    };

    window.addEventListener(BRUSH_SIZE_CHANGED_EVENT, handleBrushSizeChanged);
    return () => {
      window.removeEventListener(BRUSH_SIZE_CHANGED_EVENT, handleBrushSizeChanged);
    };
  }, [toolGroupId]);

  // Handle brush size change
  const handleBrushSizeChange = useCallback((size: number) => {
    setBrushSizeState(size);
    setBrushSize(toolGroupId, size);
  }, [toolGroupId]);

  // Handle tool activation
  const handleToolChange = useCallback((tool: SegmentationTool) => {
    if (tool === activeTool) {
      // Toggle off
      deactivateSegmentationTools(toolGroupId);
      setActiveTool(null);
    } else if (tool === 'brush') {
      // Use the active segment index from the store, or default to 1
      const segmentIdx = activeSegmentIndex ?? 1;
      // Pass the active segmentation ID so brush paints on the correct segmentation
      activateBrushTool(toolGroupId, segmentIdx, activeSegmentationId || undefined);
      setActiveTool('brush');
    } else if (tool === 'eraser') {
      // Use the active segment index - eraser should ONLY erase voxels of this segment
      const segmentIdx = activeSegmentIndex ?? 1;
      activateEraserTool(toolGroupId, segmentIdx, activeSegmentationId || undefined);
      setActiveTool('eraser');
    } else if (tool === 'lasso') {
      // Activate lasso fill tool
      const segmentIdx = activeSegmentIndex ?? 1;
      activateLassoFillTool(toolGroupId, segmentIdx, activeSegmentationId || undefined);
      setActiveTool('lasso');
    } else if (tool === 'lasso-eraser') {
      // Activate lasso eraser tool
      const segmentIdx = activeSegmentIndex ?? 1;
      activateLassoEraserTool(toolGroupId, segmentIdx, activeSegmentationId || undefined);
      setActiveTool('lasso-eraser');
    } else {
      deactivateSegmentationTools(toolGroupId);
      setActiveTool(null);
    }
  }, [toolGroupId, activeTool, activeSegmentIndex, activeSegmentationId]);

  return {
    activeTool,
    brushSize,
    handleToolChange,
    handleBrushSizeChange,
  };
}
