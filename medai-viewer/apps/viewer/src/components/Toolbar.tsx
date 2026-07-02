import React, { useState, useEffect } from 'react';
import { Button, toast } from '@medai/ui';
import {
  FolderOpen,
  Save,
  ZoomIn,
  Hand,
  Ruler,
  RotateCcw,
  Crosshair,
  SunMedium,
  Paintbrush,
  Eraser,
  Lasso,
  SquareIcon,
  BoxSelect,
  Scan,
  Columns2,
  Columns3,
  LayoutGrid,
  GitCompare,
  Hexagon,
  Spline,
  Sparkles,
  Keyboard,
  Target,
  MoveHorizontal,
  Circle,
  ArrowUpRight,
  Trash2,
  Compass,
} from 'lucide-react';
import {
  useViewerStore,
  loaderRegistry,
  useRecentFilesStore,
  useSegmentationStore,
  useLongitudinalStore,
  useIsLongitudinalActive,
  LongitudinalLayoutMode,
} from '@medai/core';
import { FileBrowser } from './FileBrowser';
import { WindowPresetMenu } from './WindowPresetMenu';
import {
  setActivePrimaryTool,
  resetAllViewports,
  activateBrushTool,
  activateEraserTool,
  activateLassoFillTool,
  activateRectangleFillTool,
  activateRectangleOutlineTool,
  activatePolygonTool,
  activatePolylineTool,
  activateSmartBrushTool,
  deactivateEnhancedAnnotationTools,
  getBrushSize,
  setBrushSize,
  BRUSH_SIZE_MIN,
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_CHANGED_EVENT,
  type PrimaryToolName,
} from '../lib/cornerstone';
import { ShortcutHelpModal } from './annotation-tools/ShortcutHelpModal';
import { useShortcutsHelp } from '../hooks/useKeyboardShortcuts';

type AnnotationToolName = 'Brush' | 'Eraser' | 'Lasso' | 'RectFill' | 'RectOutline' | 'Polygon' | 'Polyline' | 'SmartBrush' | null;

// Layout mode options for longitudinal comparison
const LAYOUT_MODES: {
  mode: LongitudinalLayoutMode;
  icon: React.ReactNode;
  label: string;
  description: string;
}[] = [
  {
    mode: 'longitudinal-2',
    icon: <Columns2 className="h-4 w-4" />,
    label: '2-Up',
    description: 'Compare 2 timepoints side-by-side',
  },
  {
    mode: 'longitudinal-3',
    icon: <Columns3 className="h-4 w-4" />,
    label: '3-Up',
    description: 'Compare 3 timepoints side-by-side',
  },
];

// Tool button with enhanced active state
function ToolButton({
  isActive,
  onClick,
  disabled,
  title,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        relative h-9 w-9 rounded-lg flex items-center justify-center
        transition-all duration-200 ease-out
        disabled:opacity-40 disabled:pointer-events-none
        border
        ${isActive
          ? 'bg-gradient-to-br from-accent-primary to-accent-secondary text-white shadow-glow-sm border-accent-primary/50'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:bg-background-hover hover:border-border-subtle'
        }
        active:scale-95
      `}
    >
      {children}
      {isActive && (
        <div className="absolute inset-0 rounded-lg bg-accent-primary/20 animate-pulse-subtle pointer-events-none" />
      )}
    </button>
  );
}

export function Toolbar() {
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<PrimaryToolName>('WindowLevel');
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationToolName>(null);
  const [brushSize, setBrushSizeState] = useState(10);
  const {
    addImage,
    setLoading,
    isLoading,
    images,
    activeImageId,
    persistImage,
    showOrientationMarker,
    setShowOrientationMarker,
    showScaleOverlay,
    setShowScaleOverlay,
  } = useViewerStore();
  const { addRecentFile } = useRecentFilesStore();
  const { activeSegmentIndex, activeSegmentationId, getActiveSegmentation } = useSegmentationStore();
  const { layoutMode, setLayoutMode, activeSessionId } = useLongitudinalStore();
  const isLongitudinalActive = useIsLongitudinalActive();
  const hasImages = images.size > 0;
  const shortcutsHelp = useShortcutsHelp();

  // Determine if current image is 2D to use correct tool group
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;
  const is2DImage = activeImage?.metadata.dimensionality === '2D';

  // Check if there's an active segmentation for annotation tools
  const activeSegmentation = getActiveSegmentation();
  const canAnnotate = hasImages && activeSegmentation && activeSegmentIndex !== null;

  // Sync brush size from cornerstone on mount and when tool changes
  useEffect(() => {
    const toolGroupId = is2DImage ? 'medai2DToolGroup' : 'medaiToolGroup';
    const currentSize = getBrushSize(toolGroupId);
    if (currentSize > 0) {
      setBrushSizeState(currentSize);
    }
  }, [is2DImage]);

  // Listen for external brush size changes (e.g., from scroll wheel)
  useEffect(() => {
    const handleBrushSizeChange = (e: CustomEvent<{ toolGroupId: string; size: number }>) => {
      setBrushSizeState(e.detail.size);
    };

    window.addEventListener(BRUSH_SIZE_CHANGED_EVENT, handleBrushSizeChange as EventListener);
    return () => {
      window.removeEventListener(BRUSH_SIZE_CHANGED_EVENT, handleBrushSizeChange as EventListener);
    };
  }, []);

  const handleToolChange = (toolName: PrimaryToolName) => {
    const toolGroupId = is2DImage ? 'medai2DToolGroup' : 'medaiToolGroup';
    setActivePrimaryTool(toolGroupId, toolName);
    setActiveTool(toolName);
    // Deactivate annotation tool when switching to navigation tools
    setActiveAnnotationTool(null);

    // Show toast with tool info
    const toolMessages: Record<PrimaryToolName, { title: string; description: string }> = {
      WindowLevel: { title: 'Window/Level', description: 'Drag to adjust brightness/contrast' },
      Pan: { title: 'Pan', description: 'Drag to pan the image' },
      Zoom: { title: 'Zoom', description: 'Drag up/down to zoom in/out' },
      Crosshairs: { title: 'Crosshairs', description: 'Click to sync all viewports to same point' },
      Length: { title: 'Ruler', description: 'Click and drag to measure distance' },
      RectangleROI: { title: 'Bounding Box', description: 'Draw a rectangle region of interest' },
      Probe: { title: 'Probe', description: 'Click to see pixel/HU values' },
      Angle: { title: 'Angle', description: 'Click 3 points to measure angle' },
      Bidirectional: { title: 'Bidirectional', description: 'RECIST measurement - length and width' },
      EllipticalROI: { title: 'Ellipse', description: 'Draw ellipse for region statistics' },
      ArrowAnnotate: { title: 'Arrow', description: 'Draw arrow with text annotation' },
    };
    const msg = toolMessages[toolName];
    if (msg) {
      toast.info(msg.title, msg.description);
    }
  };

  const handleAnnotationToolChange = (toolName: AnnotationToolName) => {
    if (!canAnnotate || !activeSegmentationId) {
      toast.warning('No active segment', 'Select a segment in the right panel first');
      return;
    }

    const toolGroupId = is2DImage ? 'medai2DToolGroup' : 'medaiToolGroup';
    const segmentIndex = activeSegmentIndex ?? 1;

    // Get the cornerstone segmentation ID for the active segment
    // First try per-segment ID, then fall back to the active segmentation ID
    const activeSegmentData = useSegmentationStore.getState().getSegmentVolume(
      activeSegmentationId,
      segmentIndex
    );
    const segmentationId = activeSegmentData?.cornerstoneSegmentationId || activeSegmentationId;

    setActiveAnnotationTool(toolName);

    switch (toolName) {
      case 'Brush':
        activateBrushTool(toolGroupId, segmentIndex, segmentationId);
        toast.info('Brush Tool', 'Click and drag to paint. Use scroll wheel to adjust size.');
        break;
      case 'Eraser':
        activateEraserTool(toolGroupId, segmentIndex, segmentationId);
        toast.info('Eraser Tool', 'Click and drag to erase. Use scroll wheel to adjust size.');
        break;
      case 'Lasso':
        activateLassoFillTool(toolGroupId, segmentIndex, segmentationId);
        toast.info('Lasso Tool', 'Draw a region and release to fill');
        break;
      case 'RectFill':
        activateRectangleFillTool(toolGroupId, segmentIndex, segmentationId);
        toast.info('Rectangle Fill', 'Draw a rectangle to fill the region');
        break;
      case 'RectOutline':
        activateRectangleOutlineTool(toolGroupId, segmentIndex, segmentationId);
        toast.info('Rectangle Outline', 'Draw a bounding box (outline only)');
        break;
      case 'Polygon':
        activatePolygonTool(toolGroupId);
        toast.info('Polygon Tool', 'Click to add points, double-click to close');
        break;
      case 'Polyline':
        activatePolylineTool(toolGroupId);
        toast.info('Polyline Tool', 'Click to add points, double-click to finish');
        break;
      case 'SmartBrush':
        activateSmartBrushTool(toolGroupId, true);
        toast.info('Smart Brush (AI)', 'Click to segment with AI. Green=include, Red=exclude');
        break;
    }
  };

  const handleBrushSizeChange = (newSize: number) => {
    const toolGroupId = is2DImage ? 'medai2DToolGroup' : 'medaiToolGroup';
    setBrushSize(toolGroupId, newSize);
    setBrushSizeState(newSize);
  };

  const handleResetView = () => {
    resetAllViewports();
    toast.info('Reset View', 'All viewports reset to default');
  };

  const handleFileSelect = async (files: FileList) => {
    setLoading(true);
    let loadedCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Find appropriate loader
        const loader = loaderRegistry.getLoaderForFile(file);

        if (!loader) {
          toast.warning('Unsupported format', `Cannot load ${file.name}`);
          continue;
        }

        try {
          // Load the image
          const loadedImage = await loader.loadFromFile(file);

          // Add to store
          addImage(loadedImage);

          // Persist image to IndexedDB
          await persistImage(loadedImage);
          loadedCount++;

          // Add to recent files
          addRecentFile({
            name: file.name,
            path: file.name, // For File objects, we only have the name
            format: loadedImage.metadata.format,
            timestamp: Date.now(),
            dimensions: {
              width: loadedImage.metadata.width,
              height: loadedImage.metadata.height,
              depth: loadedImage.metadata.depth,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          toast.error('Load failed', `Failed to load ${file.name}: ${message}`);
        }
      }

      if (loadedCount > 0) {
        toast.success('Image loaded', `Successfully loaded ${loadedCount} image${loadedCount > 1 ? 's' : ''}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="h-14 bg-background-secondary/80 backdrop-blur-sm border-b border-border-subtle flex items-center px-5 gap-4 relative z-50 overflow-visible">
        {/* File Actions Group */}
        <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFileBrowserOpen(true)}
            disabled={isLoading}
            className="gap-2 rounded-lg hover:bg-background-hover"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="text-xs font-medium">Open</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="gap-2 rounded-lg hover:bg-background-hover"
          >
            <Save className="h-4 w-4" />
            <span className="text-xs font-medium">Save</span>
          </Button>
        </div>

        {/* Gradient divider */}
        <div className="h-7 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />

        {/* Navigation Tools Group */}
        <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
          <ToolButton
            isActive={activeTool === 'WindowLevel'}
            onClick={() => handleToolChange('WindowLevel')}
            disabled={!hasImages}
            title="Window/Level - Adjust brightness and contrast"
          >
            <SunMedium className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeTool === 'Zoom'}
            onClick={() => handleToolChange('Zoom')}
            disabled={!hasImages}
            title="Zoom - Drag up/down to zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeTool === 'Pan'}
            onClick={() => handleToolChange('Pan')}
            disabled={!hasImages}
            title="Pan - Drag to move the image"
          >
            <Hand className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeTool === 'Crosshairs'}
            onClick={() => handleToolChange('Crosshairs')}
            disabled={!hasImages}
            title="Crosshairs - Click to sync all viewports"
          >
            <Crosshair className="h-4 w-4" />
          </ToolButton>

          <div className="w-px h-6 bg-border-subtle mx-1" />

          <ToolButton
            isActive={activeTool === 'Length'}
            onClick={() => handleToolChange('Length')}
            disabled={!hasImages}
            title="Ruler - Measure distance"
          >
            <Ruler className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeTool === 'RectangleROI'}
            onClick={() => handleToolChange('RectangleROI')}
            disabled={!hasImages}
            title="Rectangle ROI - Draw rectangle for measurement (outline)"
          >
            <BoxSelect className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={false}
            onClick={handleResetView}
            disabled={!hasImages}
            title="Reset View - Reset all viewports to default"
          >
            <RotateCcw className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Measurement Tools */}
        <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
          <ToolButton isActive={activeTool === 'Probe'} onClick={() => handleToolChange('Probe')} disabled={!hasImages} title="Probe - Show pixel/HU value">
            <Target className="h-4 w-4" />
          </ToolButton>
          <ToolButton isActive={activeTool === 'Angle'} onClick={() => handleToolChange('Angle')} disabled={!hasImages} title="Angle - Measure angle">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20 L4 10 L14 20" /><path d="M4 16 A6 6 0 0 1 8 20" /></svg>
          </ToolButton>
          <ToolButton isActive={activeTool === 'Bidirectional'} onClick={() => handleToolChange('Bidirectional')} disabled={!hasImages} title="Bidirectional - RECIST measurement">
            <MoveHorizontal className="h-4 w-4" />
          </ToolButton>
          <ToolButton isActive={activeTool === 'EllipticalROI'} onClick={() => handleToolChange('EllipticalROI')} disabled={!hasImages} title="Ellipse - Elliptical ROI">
            <Circle className="h-4 w-4" />
          </ToolButton>
          <ToolButton isActive={activeTool === 'ArrowAnnotate'} onClick={() => handleToolChange('ArrowAnnotate')} disabled={!hasImages} title="Arrow - Arrow annotation">
            <ArrowUpRight className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Window Preset Menu */}
        {hasImages && (
          <>
            <div className="h-7 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />
            <WindowPresetMenu />
          </>
        )}

        {/* Gradient divider */}
        <div className="h-7 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />

        {/* Annotation Tools Group */}
        <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
          <ToolButton
            isActive={activeAnnotationTool === 'Brush'}
            onClick={() => handleAnnotationToolChange('Brush')}
            disabled={!hasImages}
            title={canAnnotate ? 'Brush - Paint on the image' : 'Brush - Create a segment first'}
          >
            <Paintbrush className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeAnnotationTool === 'Eraser'}
            onClick={() => handleAnnotationToolChange('Eraser')}
            disabled={!hasImages}
            title={canAnnotate ? 'Eraser - Erase painted regions' : 'Eraser - Create a segment first'}
          >
            <Eraser className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeAnnotationTool === 'Lasso'}
            onClick={() => handleAnnotationToolChange('Lasso')}
            disabled={!hasImages}
            title={canAnnotate ? 'Lasso - Draw to fill a region' : 'Lasso - Create a segment first'}
          >
            <Lasso className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeAnnotationTool === 'RectFill'}
            onClick={() => handleAnnotationToolChange('RectFill')}
            disabled={!hasImages}
            title={canAnnotate ? 'Rectangle Fill - Draw rectangle to fill region' : 'Rectangle Fill - Create a segment first'}
          >
            <SquareIcon className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeAnnotationTool === 'RectOutline'}
            onClick={() => handleAnnotationToolChange('RectOutline')}
            disabled={!hasImages}
            title={canAnnotate ? 'Rectangle Outline - Draw bounding box (no fill)' : 'Rectangle Outline - Create a segment first'}
          >
            <Scan className="h-4 w-4" />
          </ToolButton>

          <div className="w-px h-6 bg-border-subtle mx-1" />

          {/* Enhanced Annotation Tools (Module 1) */}
          <ToolButton
            isActive={activeAnnotationTool === 'Polygon'}
            onClick={() => handleAnnotationToolChange('Polygon')}
            disabled={!hasImages}
            title="Polygon (P) - Draw closed polygon annotation"
          >
            <Hexagon className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeAnnotationTool === 'Polyline'}
            onClick={() => handleAnnotationToolChange('Polyline')}
            disabled={!hasImages}
            title="Polyline (L) - Draw open path with measurements"
          >
            <Spline className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            isActive={activeAnnotationTool === 'SmartBrush'}
            onClick={() => handleAnnotationToolChange('SmartBrush')}
            disabled={!hasImages}
            title="Smart Brush (S) - AI click-to-segment"
          >
            <Sparkles className="h-4 w-4" />
          </ToolButton>

          <div className="w-px h-6 bg-border-subtle mx-1" />

          <ToolButton
            isActive={false}
            onClick={() => {
              const { deleteSelectedAnnotations } = require('@/lib/cornerstone');
              const deleted = deleteSelectedAnnotations();
              if (deleted > 0) {
                // Show success notification if available
              }
            }}
            disabled={!hasImages}
            title="Delete Selected Annotation"
          >
            <Trash2 className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Overlay Controls */}
        <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
          <ToolButton isActive={showOrientationMarker} onClick={() => setShowOrientationMarker(!showOrientationMarker)} disabled={false} title="Toggle orientation labels">
            <Compass className="h-4 w-4" />
          </ToolButton>
          <ToolButton isActive={showScaleOverlay} onClick={() => setShowScaleOverlay(!showScaleOverlay)} disabled={false} title="Toggle scale ruler">
            <Ruler className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Brush Size Slider - Only visible when Brush or Eraser is active */}
        {(activeAnnotationTool === 'Brush' || activeAnnotationTool === 'Eraser') && (
          <div
            className="flex items-center gap-3 bg-background-tertiary/50 rounded-xl px-4 py-2 border border-border-subtle/50"
            title="Brush size in mm. May appear elliptical on non-axial views due to anisotropic voxel spacing."
          >
            <span className="text-xs text-text-secondary font-medium whitespace-nowrap">Size</span>
            <input
              type="range"
              min={BRUSH_SIZE_MIN}
              max={BRUSH_SIZE_MAX}
              value={brushSize}
              onChange={(e) => handleBrushSizeChange(Number(e.target.value))}
              className="w-24 h-1.5 bg-background-hover rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
            <span className="text-xs text-text-primary font-mono font-medium w-6 text-center">{brushSize}</span>
          </div>
        )}

        {/* Longitudinal Layout Mode Switcher - Only visible when longitudinal session is active */}
        {isLongitudinalActive && (
          <>
            <div className="h-7 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />
            <div className="flex items-center gap-1 bg-background-tertiary/40 rounded-xl p-1.5 border border-border-subtle/50">
              <div className="flex items-center gap-1 px-2">
                <GitCompare className="h-4 w-4 text-accent-primary" />
                <span className="text-xs text-text-secondary font-medium">Compare</span>
              </div>
              <div className="w-px h-6 bg-border-subtle" />
              {LAYOUT_MODES.map((layoutOption) => (
                <ToolButton
                  key={layoutOption.mode}
                  isActive={layoutMode === layoutOption.mode}
                  onClick={() => {
                    setLayoutMode(layoutOption.mode);
                    toast.info(
                      `${layoutOption.label} Layout`,
                      layoutOption.description
                    );
                  }}
                  disabled={false}
                  title={`${layoutOption.label} - ${layoutOption.description}`}
                >
                  {layoutOption.icon}
                </ToolButton>
              ))}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Keyboard Shortcuts Help Button */}
        <ToolButton
          isActive={shortcutsHelp.isOpen}
          onClick={shortcutsHelp.toggle}
          disabled={false}
          title="Keyboard Shortcuts (Shift+?)"
        >
          <Keyboard className="h-4 w-4" />
        </ToolButton>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 px-4 py-2 bg-accent-primary-muted rounded-xl border border-accent-primary/20">
            <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin-smooth" />
            <span className="text-xs text-accent-primary font-medium">Loading...</span>
          </div>
        )}
      </div>

      {/* File Browser Modal */}
      <FileBrowser
        isOpen={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
        onFileSelect={handleFileSelect}
      />

      {/* Keyboard Shortcuts Help Modal */}
      <ShortcutHelpModal
        isOpen={shortcutsHelp.isOpen}
        onClose={shortcutsHelp.close}
      />
    </>
  );
}
