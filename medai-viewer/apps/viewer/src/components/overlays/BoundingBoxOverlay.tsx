import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useDetectionStore, Detection } from '@medai/core';

/** Common finding labels for chest X-rays */
const COMMON_FINDINGS = [
  'Opacity',
  'Nodule',
  'Cardiomegaly',
  'Effusion',
  'Consolidation',
  'Pneumothorax',
  'Atelectasis',
  'Mass',
  'Other',
];

interface BoundingBoxOverlayProps {
  /** ID of the image these detections belong to */
  imageId: string;
  /** Original image width in pixels */
  imageWidth: number;
  /** Original image height in pixels */
  imageHeight: number;
  /** Viewport display width in pixels */
  viewportWidth: number;
  /** Viewport display height in pixels */
  viewportHeight: number;
  /** Optional callback when a detection is clicked */
  onDetectionClick?: (detection: Detection) => void;
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

/**
 * BoundingBoxOverlay - Interactive SVG overlay for displaying and editing AI detection bounding boxes
 *
 * Features:
 * - Color-coded rectangles based on confidence
 * - Labels with confidence percentages
 * - Click to select/highlight detections
 * - Drag corners/edges to resize boxes
 * - Hover to show detailed info
 */
export function BoundingBoxOverlay({
  imageId,
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  onDetectionClick,
}: BoundingBoxOverlayProps) {
  const {
    detections,
    selectedDetectionId,
    selectDetection,
    getVisibleDetections,
    updateDetectionBounds,
    updateDetectionLabel,
    isDrawingMode,
    addManualDetection,
    setDrawingMode,
  } = useDetectionStore();

  // Resize state
  const [resizing, setResizing] = useState<{
    detectionId: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    originalBounds: { x_min: number; y_min: number; x_max: number; y_max: number };
  } | null>(null);

  // Drag-to-move state
  const [dragging, setDragging] = useState<{
    detectionId: string;
    startX: number;
    startY: number;
    originalBounds: { x_min: number; y_min: number; x_max: number; y_max: number };
  } | null>(null);

  // Drawing new box state
  const [drawing, setDrawing] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Label input modal state
  const [pendingBox, setPendingBox] = useState<{
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
    viewportPosition: { x: number; y: number };
  } | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Edit existing detection state
  const [editingDetection, setEditingDetection] = useState<{
    id: string;
    label: string;
    viewportPosition: { x: number; y: number };
  } | null>(null);
  const [editLabelInput, setEditLabelInput] = useState('');
  const editLabelInputRef = useRef<HTMLInputElement>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Get visible detections for this image
  const visibleDetections = useMemo(() => {
    return getVisibleDetections(imageId);
  }, [getVisibleDetections, imageId, detections]);

  // Calculate scale factors to map image coordinates to viewport coordinates
  const scaleFactors = useMemo(() => {
    if (!imageWidth || !imageHeight || !viewportWidth || !viewportHeight) {
      return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    }

    const imageAspect = imageWidth / imageHeight;
    const viewportAspect = viewportWidth / viewportHeight;

    let displayWidth: number;
    let displayHeight: number;
    let offsetX = 0;
    let offsetY = 0;

    if (imageAspect > viewportAspect) {
      displayWidth = viewportWidth;
      displayHeight = viewportWidth / imageAspect;
      offsetY = (viewportHeight - displayHeight) / 2;
    } else {
      displayHeight = viewportHeight;
      displayWidth = viewportHeight * imageAspect;
      offsetX = (viewportWidth - displayWidth) / 2;
    }

    return {
      scaleX: displayWidth / imageWidth,
      scaleY: displayHeight / imageHeight,
      offsetX,
      offsetY,
    };
  }, [imageWidth, imageHeight, viewportWidth, viewportHeight]);

  // Transform image coordinates to viewport coordinates
  const transformCoords = useCallback(
    (x: number, y: number) => ({
      x: x * scaleFactors.scaleX + scaleFactors.offsetX,
      y: y * scaleFactors.scaleY + scaleFactors.offsetY,
    }),
    [scaleFactors]
  );

  // Transform viewport coordinates back to image coordinates
  const inverseTransformCoords = useCallback(
    (x: number, y: number) => ({
      x: (x - scaleFactors.offsetX) / scaleFactors.scaleX,
      y: (y - scaleFactors.offsetY) / scaleFactors.scaleY,
    }),
    [scaleFactors]
  );

  // Focus label input when pending box appears
  useEffect(() => {
    if (pendingBox && labelInputRef.current) {
      labelInputRef.current.focus();
    }
  }, [pendingBox]);

  // Start drawing a new box
  const handleDrawStart = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawingMode || !svgRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setDrawing({
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
    },
    [isDrawingMode]
  );

  // Cancel pending box label input
  const handleCancelLabel = useCallback(() => {
    setPendingBox(null);
    setLabelInput('');
    setShowDropdown(false);
  }, []);

  // Confirm label and create manual detection
  const handleConfirmLabel = useCallback(() => {
    if (!pendingBox || !labelInput.trim()) return;

    addManualDetection(imageId, {
      label: labelInput.trim(),
      confidence: 1.0, // Manual detections have 100% confidence
      x_min: pendingBox.x_min,
      y_min: pendingBox.y_min,
      x_max: pendingBox.x_max,
      y_max: pendingBox.y_max,
      visible: true,
      userVerified: true,
      includeInReport: true,
    });

    setPendingBox(null);
    setLabelInput('');
    setShowDropdown(false);
  }, [pendingBox, labelInput, imageId, addManualDetection]);

  // Handle label input key events
  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmLabel();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelLabel();
      }
    },
    [handleConfirmLabel, handleCancelLabel]
  );

  // Select a finding from dropdown and immediately add the detection
  const handleSelectFinding = useCallback((finding: string) => {
    if (!pendingBox) return;

    // Immediately add the detection with the selected finding
    addManualDetection(imageId, {
      label: finding,
      confidence: 1.0,
      x_min: pendingBox.x_min,
      y_min: pendingBox.y_min,
      x_max: pendingBox.x_max,
      y_max: pendingBox.y_max,
      visible: true,
      userVerified: true,
      includeInReport: true,
    });

    setPendingBox(null);
    setLabelInput('');
    setShowDropdown(false);
  }, [pendingBox, imageId, addManualDetection]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingDetection && editLabelInputRef.current) {
      editLabelInputRef.current.focus();
      editLabelInputRef.current.select();
    }
  }, [editingDetection]);

  // Start editing a detection label (double-click)
  const handleStartEdit = useCallback(
    (detection: Detection, viewportX: number, viewportY: number) => {
      setEditingDetection({
        id: detection.id,
        label: detection.label,
        viewportPosition: { x: viewportX, y: viewportY },
      });
      setEditLabelInput(detection.label);
    },
    []
  );

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingDetection(null);
    setEditLabelInput('');
  }, []);

  // Confirm edit and update detection label
  const handleConfirmEdit = useCallback(() => {
    if (!editingDetection || !editLabelInput.trim()) return;

    updateDetectionLabel(imageId, editingDetection.id, editLabelInput.trim());
    setEditingDetection(null);
    setEditLabelInput('');
  }, [editingDetection, editLabelInput, imageId, updateDetectionLabel]);

  // Handle edit input key events
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleConfirmEdit, handleCancelEdit]
  );

  // Select finding for edit
  const handleSelectFindingForEdit = useCallback((finding: string) => {
    if (!editingDetection) return;

    updateDetectionLabel(imageId, editingDetection.id, finding);
    setEditingDetection(null);
    setEditLabelInput('');
  }, [editingDetection, imageId, updateDetectionLabel]);

  // Handle detection click (just for selection, not drag)
  const handleDetectionClick = useCallback(
    (detection: Detection, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!resizing && !dragging) {
        selectDetection(detection.id === selectedDetectionId ? null : detection.id);
        onDetectionClick?.(detection);
      }
    },
    [selectDetection, selectedDetectionId, onDetectionClick, resizing, dragging]
  );

  // Start dragging to move box
  const handleDragStart = useCallback(
    (detection: Detection, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      setDragging({
        detectionId: detection.id,
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        originalBounds: {
          x_min: detection.x_min,
          y_min: detection.y_min,
          x_max: detection.x_max,
          y_max: detection.y_max,
        },
      });

      // Select this detection while dragging
      selectDetection(detection.id);
    },
    [selectDetection]
  );

  // Start resizing
  const handleResizeStart = useCallback(
    (detection: Detection, handle: ResizeHandle, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      setResizing({
        detectionId: detection.id,
        handle,
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        originalBounds: {
          x_min: detection.x_min,
          y_min: detection.y_min,
          x_max: detection.x_max,
          y_max: detection.y_max,
        },
      });

      // Select this detection while resizing
      selectDetection(detection.id);
    },
    [selectDetection]
  );

  // Handle mouse move during resize
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current || !resizing) return;

      const rect = svgRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      // Convert to image coordinates
      const currentImageCoords = inverseTransformCoords(currentX, currentY);
      const startImageCoords = inverseTransformCoords(resizing.startX, resizing.startY);

      const deltaX = currentImageCoords.x - startImageCoords.x;
      const deltaY = currentImageCoords.y - startImageCoords.y;

      const { originalBounds, handle } = resizing;
      let newBounds = { ...originalBounds };

      // Update bounds based on which handle is being dragged
      switch (handle) {
        case 'nw':
          newBounds.x_min = Math.min(originalBounds.x_min + deltaX, originalBounds.x_max - 10);
          newBounds.y_min = Math.min(originalBounds.y_min + deltaY, originalBounds.y_max - 10);
          break;
        case 'ne':
          newBounds.x_max = Math.max(originalBounds.x_max + deltaX, originalBounds.x_min + 10);
          newBounds.y_min = Math.min(originalBounds.y_min + deltaY, originalBounds.y_max - 10);
          break;
        case 'sw':
          newBounds.x_min = Math.min(originalBounds.x_min + deltaX, originalBounds.x_max - 10);
          newBounds.y_max = Math.max(originalBounds.y_max + deltaY, originalBounds.y_min + 10);
          break;
        case 'se':
          newBounds.x_max = Math.max(originalBounds.x_max + deltaX, originalBounds.x_min + 10);
          newBounds.y_max = Math.max(originalBounds.y_max + deltaY, originalBounds.y_min + 10);
          break;
        case 'n':
          newBounds.y_min = Math.min(originalBounds.y_min + deltaY, originalBounds.y_max - 10);
          break;
        case 's':
          newBounds.y_max = Math.max(originalBounds.y_max + deltaY, originalBounds.y_min + 10);
          break;
        case 'e':
          newBounds.x_max = Math.max(originalBounds.x_max + deltaX, originalBounds.x_min + 10);
          break;
        case 'w':
          newBounds.x_min = Math.min(originalBounds.x_min + deltaX, originalBounds.x_max - 10);
          break;
      }

      // Clamp to image bounds
      newBounds.x_min = Math.max(0, newBounds.x_min);
      newBounds.y_min = Math.max(0, newBounds.y_min);
      newBounds.x_max = Math.min(imageWidth, newBounds.x_max);
      newBounds.y_max = Math.min(imageHeight, newBounds.y_max);

      // Update the detection bounds
      updateDetectionBounds(imageId, resizing.detectionId, newBounds);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, inverseTransformCoords, updateDetectionBounds, imageId, imageWidth, imageHeight]);

  // Handle mouse move during drag-to-move
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current || !dragging) return;

      const rect = svgRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      // Convert to image coordinates
      const currentImageCoords = inverseTransformCoords(currentX, currentY);
      const startImageCoords = inverseTransformCoords(dragging.startX, dragging.startY);

      const deltaX = currentImageCoords.x - startImageCoords.x;
      const deltaY = currentImageCoords.y - startImageCoords.y;

      const { originalBounds } = dragging;
      const boxWidth = originalBounds.x_max - originalBounds.x_min;
      const boxHeight = originalBounds.y_max - originalBounds.y_min;

      // Calculate new position
      let newX_min = originalBounds.x_min + deltaX;
      let newY_min = originalBounds.y_min + deltaY;
      let newX_max = newX_min + boxWidth;
      let newY_max = newY_min + boxHeight;

      // Clamp to image bounds
      if (newX_min < 0) {
        newX_min = 0;
        newX_max = boxWidth;
      }
      if (newY_min < 0) {
        newY_min = 0;
        newY_max = boxHeight;
      }
      if (newX_max > imageWidth) {
        newX_max = imageWidth;
        newX_min = imageWidth - boxWidth;
      }
      if (newY_max > imageHeight) {
        newY_max = imageHeight;
        newY_min = imageHeight - boxHeight;
      }

      // Update the detection bounds
      updateDetectionBounds(imageId, dragging.detectionId, {
        x_min: newX_min,
        y_min: newY_min,
        x_max: newX_max,
        y_max: newY_max,
      });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, inverseTransformCoords, updateDetectionBounds, imageId, imageWidth, imageHeight]);

  // Handle mouse move and mouse up during new box drawing
  useEffect(() => {
    if (!drawing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current || !drawing) return;

      const rect = svgRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      setDrawing((prev) =>
        prev ? { ...prev, currentX, currentY } : null
      );
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!svgRef.current || !drawing) return;

      const rect = svgRef.current.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      // Get the drawn rectangle bounds in viewport coordinates
      const viewportX1 = Math.min(drawing.startX, endX);
      const viewportY1 = Math.min(drawing.startY, endY);
      const viewportX2 = Math.max(drawing.startX, endX);
      const viewportY2 = Math.max(drawing.startY, endY);

      // Convert to image coordinates
      const topLeft = inverseTransformCoords(viewportX1, viewportY1);
      const bottomRight = inverseTransformCoords(viewportX2, viewportY2);

      // Check minimum size (at least 20x20 pixels in image space)
      const boxWidth = bottomRight.x - topLeft.x;
      const boxHeight = bottomRight.y - topLeft.y;

      if (boxWidth >= 20 && boxHeight >= 20) {
        // Clamp to image bounds
        const x_min = Math.max(0, Math.min(topLeft.x, imageWidth));
        const y_min = Math.max(0, Math.min(topLeft.y, imageHeight));
        const x_max = Math.max(0, Math.min(bottomRight.x, imageWidth));
        const y_max = Math.max(0, Math.min(bottomRight.y, imageHeight));

        // Set pending box and show label input
        setPendingBox({
          x_min,
          y_min,
          x_max,
          y_max,
          viewportPosition: {
            x: viewportX2,
            y: viewportY1,
          },
        });
      }

      setDrawing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [drawing, inverseTransformCoords, imageWidth, imageHeight]);

  // Get cursor style based on handle
  const getCursor = (handle: ResizeHandle): string => {
    switch (handle) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      default:
        return 'pointer';
    }
  };

  // Calculate ghost rectangle bounds while drawing
  const ghostRect = useMemo(() => {
    if (!drawing) return null;

    const x = Math.min(drawing.startX, drawing.currentX);
    const y = Math.min(drawing.startY, drawing.currentY);
    const width = Math.abs(drawing.currentX - drawing.startX);
    const height = Math.abs(drawing.currentY - drawing.startY);

    return { x, y, width, height };
  }, [drawing]);

  // Calculate pending box viewport position
  const pendingBoxViewport = useMemo(() => {
    if (!pendingBox) return null;

    const topLeft = transformCoords(pendingBox.x_min, pendingBox.y_min);
    const bottomRight = transformCoords(pendingBox.x_max, pendingBox.y_max);

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }, [pendingBox, transformCoords]);

  // Always render in drawing mode, even without detections
  const shouldRender = visibleDetections.length > 0 || isDrawingMode || drawing || pendingBox;
  if (!shouldRender) {
    return null;
  }

  const handleSize = 8;
  const handleOffset = handleSize / 2;

  return (
    <>
    <svg
      ref={svgRef}
      className="absolute inset-0 z-20"
      width={viewportWidth}
      height={viewportHeight}
      style={{
        overflow: 'visible',
        pointerEvents: (resizing || dragging || isDrawingMode || drawing) ? 'all' : 'none',
        cursor: isDrawingMode ? 'crosshair' : undefined,
      }}
      onMouseDown={handleDrawStart}
    >
      {visibleDetections.map((detection) => {
        const topLeft = transformCoords(detection.x_min, detection.y_min);
        const bottomRight = transformCoords(detection.x_max, detection.y_max);

        const boxWidth = bottomRight.x - topLeft.x;
        const boxHeight = bottomRight.y - topLeft.y;
        const isSelected = detection.id === selectedDetectionId;
        const isResizingThis = resizing?.detectionId === detection.id;

        const confidencePercent = Math.round(detection.confidence * 100);

        // Resize handles for selected detection
        const handles: { handle: ResizeHandle; x: number; y: number }[] = isSelected
          ? [
              { handle: 'nw', x: topLeft.x - handleOffset, y: topLeft.y - handleOffset },
              { handle: 'n', x: topLeft.x + boxWidth / 2 - handleOffset, y: topLeft.y - handleOffset },
              { handle: 'ne', x: bottomRight.x - handleOffset, y: topLeft.y - handleOffset },
              { handle: 'e', x: bottomRight.x - handleOffset, y: topLeft.y + boxHeight / 2 - handleOffset },
              { handle: 'se', x: bottomRight.x - handleOffset, y: bottomRight.y - handleOffset },
              { handle: 's', x: topLeft.x + boxWidth / 2 - handleOffset, y: bottomRight.y - handleOffset },
              { handle: 'sw', x: topLeft.x - handleOffset, y: bottomRight.y - handleOffset },
              { handle: 'w', x: topLeft.x - handleOffset, y: topLeft.y + boxHeight / 2 - handleOffset },
            ]
          : [];

        return (
          <g key={detection.id} className="detection-box">
            {/* Bounding box rectangle - click to select, drag to move when selected */}
            <rect
              x={topLeft.x}
              y={topLeft.y}
              width={boxWidth}
              height={boxHeight}
              fill={isSelected ? 'rgba(255,255,255,0.05)' : 'transparent'}
              stroke={detection.color}
              strokeWidth={isSelected ? 3 : 2}
              strokeDasharray={detection.confidence < 0.5 ? '4,4' : undefined}
              opacity={isSelected ? 1 : 0.8}
              className="transition-all duration-200"
              style={{
                pointerEvents: 'all',
                cursor: isSelected ? 'move' : 'pointer',
                filter: isSelected ? 'drop-shadow(0 0 4px rgba(255,255,255,0.5))' : undefined,
              }}
              onClick={(e) => !isSelected && handleDetectionClick(detection, e)}
              onMouseDown={(e) => isSelected && handleDragStart(detection, e)}
            />

            {/* Selected highlight border */}
            {isSelected && (
              <rect
                x={topLeft.x - 2}
                y={topLeft.y - 2}
                width={boxWidth + 4}
                height={boxHeight + 4}
                fill="none"
                stroke="white"
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.6}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Label background - double-click to edit */}
            <rect
              x={topLeft.x}
              y={topLeft.y - 24}
              width={Math.max(boxWidth, 140)}
              height={22}
              fill={detection.color}
              opacity={isSelected ? 0.95 : 0.85}
              rx={3}
              className="cursor-pointer"
              style={{ pointerEvents: 'all' }}
              onClick={(e) => handleDetectionClick(detection, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleStartEdit(detection, topLeft.x + Math.max(boxWidth, 140), topLeft.y - 24);
              }}
            />

            {/* Label text */}
            <text
              x={topLeft.x + 6}
              y={topLeft.y - 8}
              fill="white"
              fontSize="12"
              fontWeight={isSelected ? 'bold' : '500'}
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {detection.source === 'manual' ? '✏️ ' : ''}{detection.label} {detection.source === 'ai' ? `(${confidencePercent}%)` : ''}
            </text>
            {/* Edit hint for selected detection */}
            {isSelected && (
              <text
                x={topLeft.x + Math.max(boxWidth, 140) - 4}
                y={topLeft.y - 8}
                fill="white"
                fontSize="10"
                opacity={0.7}
                textAnchor="end"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                dbl-click to edit
              </text>
            )}

            {/* User verified indicator */}
            {detection.userVerified && (
              <circle
                cx={topLeft.x + Math.max(boxWidth, 120) - 12}
                cy={topLeft.y - 13}
                r={7}
                fill="#22c55e"
                stroke="white"
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Resize handles (only shown when selected) */}
            {handles.map(({ handle, x, y }) => (
              <rect
                key={handle}
                x={x}
                y={y}
                width={handleSize}
                height={handleSize}
                fill={isResizingThis && resizing?.handle === handle ? 'white' : detection.color}
                stroke="white"
                strokeWidth={1}
                rx={1}
                className="transition-colors duration-100"
                style={{
                  pointerEvents: 'all',
                  cursor: getCursor(handle),
                }}
                onMouseDown={(e) => handleResizeStart(detection, handle, e)}
              />
            ))}
          </g>
        );
      })}

      {/* Ghost rectangle while drawing */}
      {ghostRect && ghostRect.width > 0 && ghostRect.height > 0 && (
        <rect
          x={ghostRect.x}
          y={ghostRect.y}
          width={ghostRect.width}
          height={ghostRect.height}
          fill="rgba(139, 92, 246, 0.1)"
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray="6,4"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Pending box waiting for label */}
      {pendingBoxViewport && (
        <g>
          <rect
            x={pendingBoxViewport.x}
            y={pendingBoxViewport.y}
            width={pendingBoxViewport.width}
            height={pendingBoxViewport.height}
            fill="rgba(139, 92, 246, 0.15)"
            stroke="#8b5cf6"
            strokeWidth={3}
            strokeDasharray="8,4"
          />
          {/* Corner markers */}
          {[
            { cx: pendingBoxViewport.x, cy: pendingBoxViewport.y },
            { cx: pendingBoxViewport.x + pendingBoxViewport.width, cy: pendingBoxViewport.y },
            { cx: pendingBoxViewport.x, cy: pendingBoxViewport.y + pendingBoxViewport.height },
            { cx: pendingBoxViewport.x + pendingBoxViewport.width, cy: pendingBoxViewport.y + pendingBoxViewport.height },
          ].map((pos, i) => (
            <circle
              key={i}
              cx={pos.cx}
              cy={pos.cy}
              r={5}
              fill="#8b5cf6"
              stroke="white"
              strokeWidth={2}
            />
          ))}
        </g>
      )}
    </svg>

    {/* Label input modal */}
    {pendingBox && pendingBoxViewport && (
      <div
        className="absolute z-30 bg-background-secondary border border-border-subtle rounded-lg shadow-xl p-3 min-w-[240px]"
        style={{
          left: Math.min(pendingBoxViewport.x + pendingBoxViewport.width + 8, viewportWidth - 260),
          top: Math.max(pendingBoxViewport.y, 8),
        }}
      >
        <div className="text-xs text-text-muted mb-3 font-medium uppercase tracking-wide">
          Label Finding
        </div>

        {/* Quick select buttons */}
        <div className="mb-3">
          <div className="text-xs text-text-muted mb-1.5">Quick select:</div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_FINDINGS.slice(0, 6).map((finding) => (
              <button
                key={finding}
                type="button"
                className="px-2 py-1 text-xs bg-background-tertiary text-text-primary border border-border-subtle rounded hover:bg-purple-500/20 hover:border-purple-500/50 transition-colors"
                onClick={() => handleSelectFinding(finding)}
              >
                {finding}
              </button>
            ))}
          </div>
        </div>

        {/* Custom label input */}
        <div className="mb-3">
          <div className="text-xs text-text-muted mb-1.5">Or type custom label:</div>
          <input
            ref={labelInputRef}
            type="text"
            value={labelInput}
            onChange={(e) => {
              setLabelInput(e.target.value);
              setShowDropdown(false);
            }}
            onKeyDown={handleLabelKeyDown}
            placeholder="Type finding name..."
            className="w-full px-2 py-1.5 text-sm bg-background-tertiary border border-border-subtle rounded focus:outline-none focus:border-purple-500 text-text-primary"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleConfirmLabel}
            disabled={!labelInput.trim()}
          >
            Add Finding
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm bg-background-tertiary text-text-secondary rounded hover:bg-background-tertiary/80 transition-colors border border-border-subtle"
            onClick={handleCancelLabel}
          >
            Cancel
          </button>
        </div>
        <div className="text-xs text-text-muted mt-2 text-center">
          Enter to add • Escape to cancel
        </div>
      </div>
    )}

    {/* Edit detection label modal */}
    {editingDetection && (
      <div
        className="absolute z-30 bg-background-secondary border border-border-subtle rounded-lg shadow-xl p-3 min-w-[240px]"
        style={{
          left: Math.min(editingDetection.viewportPosition.x + 8, viewportWidth - 260),
          top: Math.max(editingDetection.viewportPosition.y, 8),
        }}
      >
        <div className="text-xs text-text-muted mb-3 font-medium uppercase tracking-wide">
          Edit Label
        </div>

        {/* Quick select buttons */}
        <div className="mb-3">
          <div className="text-xs text-text-muted mb-1.5">Quick select:</div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_FINDINGS.slice(0, 6).map((finding) => (
              <button
                key={finding}
                type="button"
                className={`px-2 py-1 text-xs border rounded transition-colors ${
                  editLabelInput === finding
                    ? 'bg-purple-500/30 border-purple-500 text-purple-300'
                    : 'bg-background-tertiary text-text-primary border-border-subtle hover:bg-purple-500/20 hover:border-purple-500/50'
                }`}
                onClick={() => handleSelectFindingForEdit(finding)}
              >
                {finding}
              </button>
            ))}
          </div>
        </div>

        {/* Custom label input */}
        <div className="mb-3">
          <div className="text-xs text-text-muted mb-1.5">Or type custom label:</div>
          <input
            ref={editLabelInputRef}
            type="text"
            value={editLabelInput}
            onChange={(e) => setEditLabelInput(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder="Type finding name..."
            className="w-full px-2 py-1.5 text-sm bg-background-tertiary border border-border-subtle rounded focus:outline-none focus:border-purple-500 text-text-primary"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleConfirmEdit}
            disabled={!editLabelInput.trim()}
          >
            Update
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm bg-background-tertiary text-text-secondary rounded hover:bg-background-tertiary/80 transition-colors border border-border-subtle"
            onClick={handleCancelEdit}
          >
            Cancel
          </button>
        </div>
        <div className="text-xs text-text-muted mt-2 text-center">
          Enter to update • Escape to cancel
        </div>
      </div>
    )}
    </>
  );
}

/**
 * Format confidence level for display
 */
export function getConfidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (confidence >= 0.5) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

/**
 * Get confidence level label
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}
