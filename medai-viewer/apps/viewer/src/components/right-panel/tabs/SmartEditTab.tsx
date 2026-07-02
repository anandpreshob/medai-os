import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Minus, Loader2, Circle, Square, Pencil, Spline, Trash2, MousePointer, RefreshCw } from 'lucide-react';
import { Button, toast } from '@medai/ui';
import {
  resetInferenceSession,
  computeImageHash,
  getSessionManager,
  preInitializeSession,
} from '@medai/core';
import {
  activateProbeMonaiLabelTool,
  deactivateProbeMonaiLabelTool,
  getProbeMonaiLabelPoints,
  clearProbeMonaiLabelPoints,
  activateRectangleMonaiLabelTool,
  deactivateRectangleMonaiLabelTool,
  getRectangleMonaiLabelBoxes,
  clearRectangleMonaiLabelBoxes,
  activateFreehandMonaiLabelTool,
  deactivateFreehandMonaiLabelTool,
  getFreehandMonaiLabelAnnotations,
  clearFreehandMonaiLabelAnnotations,
  clearAllSmartEditAnnotations,
  deactivateAllSmartEditTools,
  worldToIJK,
  getRenderingEngine,
} from '../../../lib/cornerstone';
import type { SmartEditTabProps, InteractionMode, SegmentPrompts } from '../types';
import { createEmptySegmentPrompts } from '../types';

export function SmartEditTab({
  isConnected,
  hasImage,
  models,
  activeModel,
  onModelChange,
  isInferring,
  error,
  is2DImage,
  activeImageId,
  activeImage,
  client,
  activeSegmentIndex,
  onRunWithPrompts,
}: SmartEditTabProps) {
  // Interaction mode: point, box, scribble, lasso
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('point');
  // Positive (include) or negative (exclude)
  const [isPositive, setIsPositive] = useState(true);
  // Use ref to ensure handleModeChange always gets the latest isPositive value
  const isPositiveRef = useRef(isPositive);
  isPositiveRef.current = isPositive;
  // Whether the tool is currently active
  const [toolActive, setToolActive] = useState(false);
  // Annotation counts
  const [annotationCounts, setAnnotationCounts] = useState({
    posPoints: 0, negPoints: 0,
    posBoxes: 0, negBoxes: 0,
    posScribbles: 0, negScribbles: 0,
    posLassos: 0, negLassos: 0,
  });
  const lastTotalCountRef = useRef(0);
  // Session state
  const [sessionInitialized, setSessionInitialized] = useState(false);
  // Track previous inference state to detect completion
  const prevInferringRef = useRef(isInferring);

  // Store prompts per segment for persistence across segment switches
  const segmentPromptsRef = useRef<Map<number, SegmentPrompts>>(new Map());

  // Get prompts for current segment (or empty if none)
  const getSegmentPrompts = useCallback((segmentIndex: number | null): SegmentPrompts => {
    if (segmentIndex === null) return createEmptySegmentPrompts();
    return segmentPromptsRef.current.get(segmentIndex) || createEmptySegmentPrompts();
  }, []);

  // Save prompts for a segment (accumulates with existing)
  const saveSegmentPrompts = useCallback((segmentIndex: number | null, newPrompts: Partial<SegmentPrompts>) => {
    if (segmentIndex === null) return;
    const existing = getSegmentPrompts(segmentIndex);
    const updated: SegmentPrompts = {
      posPoints: [...existing.posPoints, ...(newPrompts.posPoints || [])],
      negPoints: [...existing.negPoints, ...(newPrompts.negPoints || [])],
      posBoxes: [...existing.posBoxes, ...(newPrompts.posBoxes || [])],
      negBoxes: [...existing.negBoxes, ...(newPrompts.negBoxes || [])],
      posScribbles: [...existing.posScribbles, ...(newPrompts.posScribbles || [])],
      negScribbles: [...existing.negScribbles, ...(newPrompts.negScribbles || [])],
      posLassos: [...existing.posLassos, ...(newPrompts.posLassos || [])],
      negLassos: [...existing.negLassos, ...(newPrompts.negLassos || [])],
    };
    segmentPromptsRef.current.set(segmentIndex, updated);
    console.log('[SmartEdit] Saved prompts for segment', segmentIndex, ':', updated);
  }, [getSegmentPrompts]);

  // When inference completes, reset annotation counter and clear visual annotations
  useEffect(() => {
    console.log('[SmartEdit:InferState] isInferring changed:', isInferring, 'prev:', prevInferringRef.current);
    if (prevInferringRef.current && !isInferring) {
      console.log('[SmartEdit:InferState] Inference completed! (true -> false)');
      const isInteractiveModel = activeModel?.toLowerCase().includes('nninter') ||
                                  activeModel?.toLowerCase().includes('sam3');

      if (isInteractiveModel) {
        console.log('[SmartEdit:InferState] Clearing annotations (server accumulates prompts)');
        clearAllSmartEditAnnotations();
        console.log('[SmartEdit:InferState] Resetting counter from', lastTotalCountRef.current, 'to 0');
        lastTotalCountRef.current = 0;
        setAnnotationCounts({
          posPoints: 0, negPoints: 0,
          posBoxes: 0, negBoxes: 0,
          posScribbles: 0, negScribbles: 0,
          posLassos: 0, negLassos: 0,
        });
      }
    }
    prevInferringRef.current = isInferring;
  }, [isInferring, activeModel]);

  // Check session state when image or model changes
  useEffect(() => {
    if (activeImage && activeModel) {
      const imageHash = computeImageHash(activeImage);
      const sessionManager = getSessionManager();
      const isInit = sessionManager.isInitialized(imageHash, activeModel);
      setSessionInitialized(isInit);
    } else {
      setSessionInitialized(false);
    }
  }, [activeImage, activeModel]);

  // Track previous segment index to detect changes
  const prevSegmentIndexRef = useRef<number | null>(null);

  // Reset server session when active segment changes
  useEffect(() => {
    const isInteractiveModel = activeModel?.toLowerCase().includes('nninter') ||
                                activeModel?.toLowerCase().includes('sam3');

    if (isInteractiveModel &&
        prevSegmentIndexRef.current !== null &&
        prevSegmentIndexRef.current !== activeSegmentIndex &&
        client && activeImage && activeModel) {
      console.log('[SmartEdit] Segment changed from', prevSegmentIndexRef.current, 'to', activeSegmentIndex, '- resetting session');

      // Save current annotations for the PREVIOUS segment before clearing
      try {
        const engine = getRenderingEngine();
        const volumeId = `localVolume:${activeImage.id}`;
        const viewportIds = is2DImage ? ['main2d'] : ['axial', 'sagittal', 'coronal'];
        let allPoints: ReturnType<typeof getProbeMonaiLabelPoints> = [];
        let allBoxes: ReturnType<typeof getRectangleMonaiLabelBoxes> = [];
        let allFreehand: ReturnType<typeof getFreehandMonaiLabelAnnotations> = [];

        for (const vpId of viewportIds) {
          const viewport = engine.getViewport(vpId);
          if (!viewport) continue;
          const element = viewport.element as HTMLDivElement;
          allPoints = [...allPoints, ...getProbeMonaiLabelPoints(element)];
          allBoxes = [...allBoxes, ...getRectangleMonaiLabelBoxes(element)];
          allFreehand = [...allFreehand, ...getFreehandMonaiLabelAnnotations(element)];
        }

        // Dedupe and convert to IJK for saving
        const points = allPoints.filter((p, i, arr) => arr.findIndex(x => x.annotationUID === p.annotationUID) === i);
        const boxes = allBoxes.filter((b, i, arr) => arr.findIndex(x => x.annotationUID === b.annotationUID) === i)
          .filter(b => !b.highlighted);
        const freehand = allFreehand.filter((f, i, arr) => arr.findIndex(x => x.annotationUID === f.annotationUID) === i)
          .filter(f => f.worldPoints.length >= 2);

        // Convert to IJK coordinates
        const posPoints: number[][] = [];
        const negPoints: number[][] = [];
        points.forEach(point => {
          const ijk = worldToIJK(volumeId, point.worldPoint);
          if (ijk) {
            if (point.isPositive) posPoints.push(ijk); else negPoints.push(ijk);
          }
        });

        const posBoxes: number[][][] = [];
        const negBoxes: number[][][] = [];
        boxes.forEach(box => {
          const ijkPoints = box.worldPoints.map(p => worldToIJK(volumeId, p)).filter(Boolean) as [number, number, number][];
          if (ijkPoints.length >= 2) {
            const xs = ijkPoints.map(p => p[0]);
            const ys = ijkPoints.map(p => p[1]);
            const zs = ijkPoints.map(p => p[2]);
            const boxPrompt = [[Math.min(...xs), Math.min(...ys), Math.min(...zs)], [Math.max(...xs), Math.max(...ys), Math.max(...zs)]];
            if (box.isPositive) posBoxes.push(boxPrompt); else negBoxes.push(boxPrompt);
          }
        });

        const posScribbles: number[][][] = [];
        const negScribbles: number[][][] = [];
        const posLassos: number[][][] = [];
        const negLassos: number[][][] = [];
        freehand.forEach(ann => {
          const ijkPoints = ann.worldPoints.map(p => worldToIJK(volumeId, p)).filter(Boolean) as [number, number, number][];
          if (ijkPoints.length >= 2) {
            if (ann.isLasso) {
              if (ann.isPositive) posLassos.push(ijkPoints); else negLassos.push(ijkPoints);
            } else {
              if (ann.isPositive) posScribbles.push(ijkPoints); else negScribbles.push(ijkPoints);
            }
          }
        });

        // Save for the previous segment
        if (posPoints.length > 0 || negPoints.length > 0 || posBoxes.length > 0 || negBoxes.length > 0 ||
            posScribbles.length > 0 || negScribbles.length > 0 || posLassos.length > 0 || negLassos.length > 0) {
          console.log('[SmartEdit] Saving prompts for previous segment', prevSegmentIndexRef.current);
          saveSegmentPrompts(prevSegmentIndexRef.current, {
            posPoints, negPoints, posBoxes, negBoxes, posScribbles, negScribbles, posLassos, negLassos,
          });
        }
      } catch (err) {
        console.error('[SmartEdit] Error saving prompts for previous segment:', err);
      }

      // Check if new segment has saved prompts
      const savedPrompts = getSegmentPrompts(activeSegmentIndex);
      const hasPrompts = savedPrompts.posPoints.length > 0 || savedPrompts.negPoints.length > 0 ||
                         savedPrompts.posBoxes.length > 0 || savedPrompts.negBoxes.length > 0 ||
                         savedPrompts.posScribbles.length > 0 || savedPrompts.negScribbles.length > 0 ||
                         savedPrompts.posLassos.length > 0 || savedPrompts.negLassos.length > 0;

      // Reset server session
      resetInferenceSession(client, activeImage, activeModel)
        .then(() => {
          if (hasPrompts) {
            console.log('[SmartEdit] Restoring saved prompts for segment', activeSegmentIndex);
            const hasNegativePrompts = savedPrompts.negPoints.length > 0 || savedPrompts.negBoxes.length > 0 ||
                                        savedPrompts.negScribbles.length > 0 || savedPrompts.negLassos.length > 0;
            const promptPayload = {
              posPoints: savedPrompts.posPoints.length > 0 ? savedPrompts.posPoints : undefined,
              negPoints: savedPrompts.negPoints.length > 0 ? savedPrompts.negPoints : undefined,
              posBoxes: savedPrompts.posBoxes.length > 0 ? savedPrompts.posBoxes : undefined,
              negBoxes: savedPrompts.negBoxes.length > 0 ? savedPrompts.negBoxes : undefined,
              posScribbles: savedPrompts.posScribbles.length > 0 ? savedPrompts.posScribbles : undefined,
              negScribbles: savedPrompts.negScribbles.length > 0 ? savedPrompts.negScribbles : undefined,
              posLassos: savedPrompts.posLassos.length > 0 ? savedPrompts.posLassos : undefined,
              negLassos: savedPrompts.negLassos.length > 0 ? savedPrompts.negLassos : undefined,
              isSubtractive: hasNegativePrompts,
            };
            onRunWithPrompts(promptPayload);
          }
        })
        .catch(err => console.error('[SmartEdit] Failed to reset session:', err));

      clearAllSmartEditAnnotations();
      setSessionInitialized(false);
      lastTotalCountRef.current = 0;
      setAnnotationCounts({
        posPoints: 0, negPoints: 0,
        posBoxes: 0, negBoxes: 0,
        posScribbles: 0, negScribbles: 0,
        posLassos: 0, negLassos: 0,
      });
    }

    prevSegmentIndexRef.current = activeSegmentIndex;
  }, [activeSegmentIndex, activeModel, client, activeImage, getSegmentPrompts, onRunWithPrompts, is2DImage, saveSegmentPrompts]);

  // State for pre-initialization
  const [isPreInitializing, setIsPreInitializing] = useState(false);
  const preInitStartedRef = useRef<boolean>(false);
  const preInitToastShownRef = useRef<boolean>(false);

  // Pre-initialize nnInteractive session when conditions are met
  useEffect(() => {
    const isNnInteractiveModel = activeModel?.toLowerCase().includes('nninter');
    if (!isNnInteractiveModel) {
      preInitStartedRef.current = false;
      preInitToastShownRef.current = false;
      return;
    }

    if (!isConnected || !hasImage || !activeImage || !client) return;
    if (sessionInitialized) return;
    if (preInitStartedRef.current || isPreInitializing) return;

    console.log('[SmartEdit] Starting pre-initialization for nnInteractive');
    preInitStartedRef.current = true;
    setIsPreInitializing(true);

    const doPreInit = async () => {
      try {
        if (!preInitToastShownRef.current) {
          preInitToastShownRef.current = true;
          toast.info('Preparing AI model', 'Uploading image to server for fast inference...');
        }
        const success = await preInitializeSession(client, activeImage, activeModel || 'segmentation');

        if (success) {
          setSessionInitialized(true);
          toast.success('AI ready', 'Session initialized. Click to segment!');
        } else {
          toast.warning('Pre-init skipped', 'Could not pre-initialize. First click may be slow.');
        }
      } catch (err) {
        console.error('[SmartEdit] Pre-initialization error:', err);
        preInitStartedRef.current = false;
      } finally {
        setIsPreInitializing(false);
      }
    };

    doPreInit();
  }, [isConnected, hasImage, activeImage, activeModel, client, sessionInitialized, isPreInitializing]);

  // Handle reset session
  const handleResetSession = useCallback(async () => {
    if (!client || !activeModel || !activeImage) return;

    try {
      await resetInferenceSession(client, activeImage, activeModel);
      setSessionInitialized(false);
      toast.info('Session reset', 'Server cache cleared. Next inference will send full image.');
    } catch (err) {
      console.error('[SmartEdit] Failed to reset session:', err);
      toast.error('Reset failed', 'Could not reset server session.');
    }
  }, [client, activeModel, activeImage]);

  // Virtual interactive models
  const hasSegmentationModel = models.some((m) => m.name === 'segmentation');

  const allVirtualInteractiveModels = [
    { name: 'nnInteractive', type: 'interactive', description: 'nnUNet Interactive segmentation', dimensionality: '3D' as const },
    { name: 'SAM2', type: 'interactive', description: 'Segment Anything Model 2', dimensionality: '3D' as const },
    { name: 'MedSAM2', type: 'interactive', description: 'Medical SAM2', dimensionality: '3D' as const },
    { name: 'SAM3', type: 'interactive', description: 'SAM3 via HuggingFace', dimensionality: 'both' as const },
  ];

  const virtualInteractiveModels = hasSegmentationModel
    ? allVirtualInteractiveModels.filter((m) => {
        if (!is2DImage) return true;
        return m.dimensionality === 'both';
      })
    : [];

  const interactiveModels = [...virtualInteractiveModels];
  const isModelInteractive = interactiveModels.some((m) => m.name === activeModel);

  // Auto-select first interactive model if current is not interactive
  useEffect(() => {
    if (isConnected && interactiveModels.length > 0 && !isModelInteractive) {
      onModelChange(interactiveModels[0].name);
    }
  }, [isConnected, interactiveModels, isModelInteractive, onModelChange]);

  const isNnInteractive = activeModel?.toLowerCase().includes('nninter') ||
                          activeModel?.toLowerCase().includes('sam3');

  // Collect all annotations and run inference
  const runInferenceWithAllPrompts = useCallback(() => {
    if (!activeImageId || isInferring) return;

    try {
      const engine = getRenderingEngine();
      const volumeId = `localVolume:${activeImageId}`;
      const viewportIds = is2DImage ? ['main2d'] : ['axial', 'sagittal', 'coronal'];
      let allPoints: ReturnType<typeof getProbeMonaiLabelPoints> = [];
      let allBoxes: ReturnType<typeof getRectangleMonaiLabelBoxes> = [];
      let allFreehand: ReturnType<typeof getFreehandMonaiLabelAnnotations> = [];

      for (const vpId of viewportIds) {
        const viewport = engine.getViewport(vpId);
        if (!viewport) continue;
        const element = viewport.element as HTMLDivElement;
        allPoints = [...allPoints, ...getProbeMonaiLabelPoints(element)];
        allBoxes = [...allBoxes, ...getRectangleMonaiLabelBoxes(element)];
        allFreehand = [...allFreehand, ...getFreehandMonaiLabelAnnotations(element)];
      }

      // Deduplicate
      const points = allPoints.filter((p, i, arr) => arr.findIndex(x => x.annotationUID === p.annotationUID) === i);
      const boxes = allBoxes.filter((b, i, arr) => arr.findIndex(x => x.annotationUID === b.annotationUID) === i);
      const freehandAnnotations = allFreehand.filter((f, i, arr) => arr.findIndex(x => x.annotationUID === f.annotationUID) === i)
        .filter(ann => ann.worldPoints.length >= 2);

      // Collect point prompts
      const posPoints: number[][] = [];
      const negPoints: number[][] = [];
      points.forEach(point => {
        const ijk = worldToIJK(volumeId, point.worldPoint);
        if (ijk) {
          if (point.isPositive) posPoints.push([ijk[0], ijk[1], ijk[2]]);
          else negPoints.push([ijk[0], ijk[1], ijk[2]]);
        }
      });

      // Collect box prompts
      const posBoxes: number[][][] = [];
      const negBoxes: number[][][] = [];
      boxes.forEach(box => {
        if (box.worldPoints.length >= 2) {
          const ijkPoints = box.worldPoints.map(p => worldToIJK(volumeId, p)).filter(Boolean) as [number, number, number][];
          if (ijkPoints.length >= 2) {
            const xs = ijkPoints.map(p => p[0]);
            const ys = ijkPoints.map(p => p[1]);
            const zs = ijkPoints.map(p => p[2]);
            const minPt = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
            const maxPt = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
            if (box.isPositive) posBoxes.push([minPt, maxPt]);
            else negBoxes.push([minPt, maxPt]);
          }
        }
      });

      // Collect freehand prompts
      const posScribbles: number[][][] = [];
      const negScribbles: number[][][] = [];
      const posLassos: number[][][] = [];
      const negLassos: number[][][] = [];
      freehandAnnotations.forEach(ann => {
        const ijkPoints = ann.worldPoints.map(p => worldToIJK(volumeId, p)).filter(Boolean) as [number, number, number][];
        if (ijkPoints.length >= 2) {
          if (ann.isLasso) {
            if (ann.isPositive) posLassos.push(ijkPoints);
            else negLassos.push(ijkPoints);
          } else {
            if (ann.isPositive) posScribbles.push(ijkPoints);
            else negScribbles.push(ijkPoints);
          }
        }
      });

      const hasPrompts = posPoints.length > 0 || negPoints.length > 0 ||
                         posBoxes.length > 0 || negBoxes.length > 0 ||
                         posScribbles.length > 0 || negScribbles.length > 0 ||
                         posLassos.length > 0 || negLassos.length > 0;

      if (!hasPrompts) return;

      const hasNegativePrompts = negPoints.length > 0 || negBoxes.length > 0 ||
                                  negScribbles.length > 0 || negLassos.length > 0;

      const promptPayload = {
        posPoints: posPoints.length > 0 ? posPoints : undefined,
        negPoints: negPoints.length > 0 ? negPoints : undefined,
        posBoxes: posBoxes.length > 0 ? posBoxes : undefined,
        negBoxes: negBoxes.length > 0 ? negBoxes : undefined,
        posScribbles: posScribbles.length > 0 ? posScribbles : undefined,
        negScribbles: negScribbles.length > 0 ? negScribbles : undefined,
        posLassos: posLassos.length > 0 ? posLassos : undefined,
        negLassos: negLassos.length > 0 ? negLassos : undefined,
        isSubtractive: hasNegativePrompts,
      };

      const segmentToSave = activeSegmentIndex ?? 1;
      saveSegmentPrompts(segmentToSave, {
        posPoints, negPoints, posBoxes, negBoxes, posScribbles, negScribbles, posLassos, negLassos,
      });

      onRunWithPrompts(promptPayload);
    } catch (err) {
      console.error('[SmartEdit] Error running inference:', err);
    }
  }, [activeImageId, isInferring, onRunWithPrompts, is2DImage, activeSegmentIndex, saveSegmentPrompts]);

  // Poll for new annotations
  useEffect(() => {
    if (!hasImage || !toolActive || !activeModel || isInferring) return;

    const checkForNewAnnotations = () => {
      try {
        const engine = getRenderingEngine();
        const viewportIds = is2DImage ? ['main2d'] : ['axial', 'sagittal', 'coronal'];
        let allPoints: ReturnType<typeof getProbeMonaiLabelPoints> = [];
        let allBoxes: ReturnType<typeof getRectangleMonaiLabelBoxes> = [];
        let allFreehand: ReturnType<typeof getFreehandMonaiLabelAnnotations> = [];

        for (const vpId of viewportIds) {
          const viewport = engine.getViewport(vpId);
          if (!viewport) continue;
          const element = viewport.element as HTMLDivElement;
          allPoints = [...allPoints, ...getProbeMonaiLabelPoints(element)];
          allBoxes = [...allBoxes, ...getRectangleMonaiLabelBoxes(element)];
          allFreehand = [...allFreehand, ...getFreehandMonaiLabelAnnotations(element)];
        }

        const uniquePoints = allPoints.filter((p, i, arr) => arr.findIndex(x => x.annotationUID === p.annotationUID) === i);
        const uniqueBoxes = allBoxes.filter((b, i, arr) => arr.findIndex(x => x.annotationUID === b.annotationUID) === i);
        const uniqueFreehand = allFreehand.filter((f, i, arr) => arr.findIndex(x => x.annotationUID === f.annotationUID) === i);

        const completeFreehand = uniqueFreehand.filter(f => f.worldPoints.length >= 2);
        const completeBoxes = uniqueBoxes.filter(b => b.worldPoints.length >= 4 && !b.highlighted);

        const counts = {
          posPoints: uniquePoints.filter(p => p.isPositive).length,
          negPoints: uniquePoints.filter(p => !p.isPositive).length,
          posBoxes: completeBoxes.filter(b => b.isPositive).length,
          negBoxes: completeBoxes.filter(b => !b.isPositive).length,
          posScribbles: completeFreehand.filter(f => !f.isLasso && f.isPositive).length,
          negScribbles: completeFreehand.filter(f => !f.isLasso && !f.isPositive).length,
          posLassos: completeFreehand.filter(f => f.isLasso && f.isPositive).length,
          negLassos: completeFreehand.filter(f => f.isLasso && !f.isPositive).length,
        };
        setAnnotationCounts(counts);

        const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

        if (totalCount > lastTotalCountRef.current && totalCount > 0) {
          runInferenceWithAllPrompts();
          setSessionInitialized(true);
        }
        lastTotalCountRef.current = totalCount;
      } catch (e) {
        console.error('[SmartEdit:Poll] Error:', e);
      }
    };

    const interval = setInterval(checkForNewAnnotations, 200);
    return () => clearInterval(interval);
  }, [toolActive, hasImage, activeModel, isInferring, runInferenceWithAllPrompts, is2DImage]);

  // Helper to get tool group ID
  const getToolGroupId = useCallback(() => {
    return is2DImage ? 'medai2DToolGroup' : 'medaiToolGroup';
  }, [is2DImage]);

  // Activate tool based on mode and polarity
  const activateTool = useCallback((mode: InteractionMode, positive: boolean) => {
    const currentToolGroupId = getToolGroupId();
    deactivateAllSmartEditTools(currentToolGroupId);

    switch (mode) {
      case 'point':
        activateProbeMonaiLabelTool(currentToolGroupId, positive);
        break;
      case 'box':
        activateRectangleMonaiLabelTool(currentToolGroupId, positive);
        break;
      case 'scribble':
        activateFreehandMonaiLabelTool(currentToolGroupId, positive, false);
        break;
      case 'lasso':
        activateFreehandMonaiLabelTool(currentToolGroupId, positive, true);
        break;
    }

    // Sync lastTotalCountRef
    try {
      const engine = getRenderingEngine();
      const viewportIds = is2DImage ? ['main2d'] : ['axial', 'sagittal', 'coronal'];
      let currentCount = 0;

      for (const vpId of viewportIds) {
        const viewport = engine.getViewport(vpId);
        if (!viewport) continue;
        const element = viewport.element as HTMLDivElement;

        currentCount += getProbeMonaiLabelPoints(element).length;
        currentCount += getRectangleMonaiLabelBoxes(element).filter(b => b.worldPoints.length >= 4 && !b.highlighted).length;
        currentCount += getFreehandMonaiLabelAnnotations(element).filter(f => f.worldPoints.length >= 2).length;
      }

      lastTotalCountRef.current = currentCount;
    } catch (e) {
      console.error('[SmartEdit] Error syncing annotation count:', e);
    }

    setInteractionMode(mode);
    setIsPositive(positive);
    setToolActive(true);
  }, [getToolGroupId, is2DImage]);

  const deactivateTool = useCallback(() => {
    deactivateAllSmartEditTools(getToolGroupId());
    setToolActive(false);
  }, [getToolGroupId]);

  const handleModeChange = useCallback((mode: InteractionMode) => {
    const currentIsPositive = isPositiveRef.current;
    if (toolActive && interactionMode === mode) {
      deactivateTool();
    } else {
      activateTool(mode, currentIsPositive);
    }
  }, [toolActive, interactionMode, activateTool, deactivateTool]);

  const handlePolarityChange = useCallback((positive: boolean) => {
    setIsPositive(positive);
    if (toolActive) {
      activateTool(interactionMode, positive);
    }
  }, [toolActive, interactionMode, activateTool]);

  const handleClearAll = useCallback(() => {
    clearAllSmartEditAnnotations();
    setAnnotationCounts({
      posPoints: 0, negPoints: 0,
      posBoxes: 0, negBoxes: 0,
      posScribbles: 0, negScribbles: 0,
      posLassos: 0, negLassos: 0,
    });
    lastTotalCountRef.current = 0;
    toast.info('Prompts cleared', 'All SmartEdit prompts have been cleared.');
  }, []);

  const totalAnnotations = Object.values(annotationCounts).reduce((a, b) => a + b, 0);
  const isNnInteractiveModel = activeModel?.toLowerCase().includes('nninter');
  const canUseTools = isConnected && hasImage && activeModel && !(isNnInteractiveModel && isPreInitializing);

  const getModeCount = (mode: InteractionMode) => {
    switch (mode) {
      case 'point': return annotationCounts.posPoints + annotationCounts.negPoints;
      case 'box': return annotationCounts.posBoxes + annotationCounts.negBoxes;
      case 'scribble': return annotationCounts.posScribbles + annotationCounts.negScribbles;
      case 'lasso': return annotationCounts.posLassos + annotationCounts.negLassos;
      default: return 0;
    }
  };

  return (
    <div className="space-y-4">
      {/* 2D Image Info */}
      {is2DImage && isConnected && (
        <div className="p-3 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs">
          <strong>2D Image:</strong> Using SAM3 for point/box prompted segmentation.
        </div>
      )}

      {/* Model Selection */}
      <div>
        <label className="text-text-secondary text-xs mb-1 block">Model</label>
        <select
          className="w-full bg-background-tertiary text-text-primary rounded px-3 py-2 text-sm border border-border-default disabled:opacity-50 disabled:cursor-not-allowed"
          value={activeModel || ''}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!isConnected || interactiveModels.length === 0}
          data-testid="model-select-smartedit"
        >
          {!isConnected && <option value="">Connect to server first</option>}
          {isConnected && interactiveModels.length === 0 && <option value="">No segmentation model on server</option>}
          {interactiveModels.map((model) => (
            <option key={model.name} value={model.name}>{model.name}</option>
          ))}
        </select>
      </div>

      {/* Session Status */}
      {isNnInteractive && activeModel && hasImage && (
        <div className="flex items-center justify-between p-2 rounded bg-background-tertiary text-xs">
          <div className="flex items-center gap-2">
            {isPreInitializing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span className="text-text-secondary">Preparing AI model...</span>
              </>
            ) : (
              <>
                <div className={`w-2 h-2 rounded-full ${sessionInitialized ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-text-secondary">
                  {sessionInitialized ? 'Session ready (fast inference)' : 'Waiting for connection...'}
                </span>
              </>
            )}
          </div>
          {sessionInitialized && !isPreInitializing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-text-muted hover:text-text-secondary"
              onClick={handleResetSession}
              disabled={isInferring}
              title="Reset server cache"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      )}

      {/* Interaction Mode Selector */}
      <div>
        <label className="text-text-secondary text-xs mb-2 block">Interaction Mode</label>
        <div className="grid grid-cols-4 gap-1">
          <button
            data-testid="smartedit-point-tool"
            className={`flex flex-col items-center p-2 rounded text-xs transition-colors ${
              toolActive && interactionMode === 'point'
                ? 'bg-accent-primary text-background-primary'
                : 'bg-background-tertiary text-text-secondary hover:bg-background-tertiary/80'
            } ${!canUseTools ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => handleModeChange('point')}
            disabled={!canUseTools}
            title="Point prompts"
          >
            <Circle className="h-4 w-4 mb-1" />
            Point
            {getModeCount('point') > 0 && (
              <span className="text-[10px] bg-accent-primary/20 px-1 rounded mt-0.5">{getModeCount('point')}</span>
            )}
          </button>
          <button
            data-testid="smartedit-box-tool"
            className={`flex flex-col items-center p-2 rounded text-xs transition-colors ${
              toolActive && interactionMode === 'box'
                ? 'bg-accent-primary text-background-primary'
                : 'bg-background-tertiary text-text-secondary hover:bg-background-tertiary/80'
            } ${!canUseTools || !isNnInteractive ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => handleModeChange('box')}
            disabled={!canUseTools || !isNnInteractive}
            title={isNnInteractive ? 'Bounding box prompts' : 'Only available for nnInteractive'}
          >
            <Square className="h-4 w-4 mb-1" />
            Box
            {getModeCount('box') > 0 && (
              <span className="text-[10px] bg-accent-primary/20 px-1 rounded mt-0.5">{getModeCount('box')}</span>
            )}
          </button>
          <button
            className={`flex flex-col items-center p-2 rounded text-xs transition-colors ${
              toolActive && interactionMode === 'scribble'
                ? 'bg-accent-primary text-background-primary'
                : 'bg-background-tertiary text-text-secondary hover:bg-background-tertiary/80'
            } ${!canUseTools || !isNnInteractive ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => handleModeChange('scribble')}
            disabled={!canUseTools || !isNnInteractive}
            title={isNnInteractive ? 'Scribble prompts' : 'Only available for nnInteractive'}
          >
            <Pencil className="h-4 w-4 mb-1" />
            Scribble
            {getModeCount('scribble') > 0 && (
              <span className="text-[10px] bg-accent-primary/20 px-1 rounded mt-0.5">{getModeCount('scribble')}</span>
            )}
          </button>
          <button
            className={`flex flex-col items-center p-2 rounded text-xs transition-colors ${
              toolActive && interactionMode === 'lasso'
                ? 'bg-accent-primary text-background-primary'
                : 'bg-background-tertiary text-text-secondary hover:bg-background-tertiary/80'
            } ${!canUseTools || !isNnInteractive ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => handleModeChange('lasso')}
            disabled={!canUseTools || !isNnInteractive}
            title={isNnInteractive ? 'Lasso prompts' : 'Only available for nnInteractive'}
          >
            <Spline className="h-4 w-4 mb-1" />
            Lasso
            {getModeCount('lasso') > 0 && (
              <span className="text-[10px] bg-accent-primary/20 px-1 rounded mt-0.5">{getModeCount('lasso')}</span>
            )}
          </button>
        </div>
      </div>

      {/* Polarity Selector */}
      <div>
        <label className="text-text-secondary text-xs mb-2 block">Polarity</label>
        <div className="flex gap-2">
          <Button
            variant={isPositive ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => handlePolarityChange(true)}
            disabled={!canUseTools}
            data-testid="polarity-positive"
            title="Include regions"
          >
            <Plus className="h-3 w-3 mr-1 text-green-500" />
            <span className={isPositive ? '' : 'text-green-500'}>Include</span>
          </Button>
          <Button
            variant={!isPositive ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => handlePolarityChange(false)}
            disabled={!canUseTools}
            data-testid="polarity-negative"
            title="Exclude regions"
          >
            <Minus className="h-3 w-3 mr-1 text-red-500" />
            <span className={!isPositive ? '' : 'text-red-500'}>Exclude</span>
          </Button>
        </div>
      </div>

      {/* Clear All Button */}
      {totalAnnotations > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-text-muted hover:text-text-secondary"
          onClick={handleClearAll}
          disabled={isInferring}
          data-testid="clear-all-button"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear All ({totalAnnotations})
        </Button>
      )}

      {/* Status Indicator */}
      {isPreInitializing ? (
        <div className="flex items-center gap-2 p-2 rounded text-xs bg-yellow-500/10 text-yellow-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Preparing AI model... Please wait.</span>
        </div>
      ) : isInferring ? (
        <div className="flex items-center gap-2 p-2 rounded text-xs bg-blue-500/10 text-blue-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Processing...</span>
        </div>
      ) : toolActive ? (
        <div className={`flex items-center gap-2 p-2 rounded text-xs ${
          isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          <MousePointer className="h-3 w-3" />
          <span>
            {interactionMode === 'point' && (isPositive ? 'Click to add include points' : 'Click to add exclude points')}
            {interactionMode === 'box' && (isPositive ? 'Draw boxes to include regions' : 'Draw boxes to exclude regions')}
            {interactionMode === 'scribble' && (isPositive ? 'Draw scribbles to include' : 'Draw scribbles to exclude')}
            {interactionMode === 'lasso' && (isPositive ? 'Draw lasso to include region' : 'Draw lasso to exclude region')}
          </span>
        </div>
      ) : null}

      {/* Instructions */}
      <p className="text-text-muted text-xs">
        {!hasImage
          ? 'Load an image first.'
          : !activeModel
          ? 'Select a model to start.'
          : !toolActive
          ? `Select an interaction mode above. ${isNnInteractive ? 'All modes available.' : 'Only Point mode available for SAM.'}`
          : 'Each annotation triggers automatic segmentation.'}
      </p>

      {/* Error Message */}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
