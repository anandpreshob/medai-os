import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from '@medai/ui';
import { Stethoscope, Sparkles } from 'lucide-react';
import {
  useMonaiStore,
  useSegmentationStore,
  useViewerStore,
  useSuiteStore,
  useIsLongitudinalActive,
  useActiveSession,
  getSuite,
  isFeatureEnabled,
  usePanelVisibilityStore,
  runInference,
  Segment,
} from '@medai/core';
import {
  createSegmentationFromResult,
  setActiveSegmentationInCornerstone,
  setActiveSegmentIndex as setActiveSegmentIndexInCornerstone,
  activateBrushTool,
  activateEraserTool,
  clearAllSmartEditAnnotations,
  updateSegmentationFromResult,
  setSegmentVisibility,
  addInferenceResultToSegmentation,
} from '../../lib/cornerstone';

// Import sub-components
import { ServerConnectionPanel } from './panels/ServerConnectionPanel';
import { SegmentationToolsPanel } from './panels/SegmentationToolsPanel';
import { SegmentsPanel } from './panels/SegmentsPanel';
import { AnalyticsPanel } from './panels/AnalyticsPanel';
import { OncologyMetricsPanel } from './panels/OncologyMetricsPanel';
import { PETMetricsPanel } from './panels/PETMetricsPanel';
import { RTStructuresPanel } from './panels/RTStructuresPanel';
import { NeurologyMetricsPanel } from './panels/NeurologyMetricsPanel';
import { SurgicalPlanningPanel } from './panels/SurgicalPlanningPanel';
import { CardiacMetricsPanel } from './panels/CardiacMetricsPanel';
import { FindingsPanel } from './panels/FindingsPanel';
import { LongitudinalMetricsPanel } from './panels/LongitudinalMetricsPanel';
import { PanelSelector } from './PanelSelector';
import { TabNav } from './tabs/TabNav';
import { AutoSegmentationTab } from './tabs/AutoSegmentationTab';
import { SmartEditTab } from './tabs/SmartEditTab';
import { ChestXrayDetectionTab } from './tabs/ChestXrayDetectionTab';
import { LongitudinalReportTab } from './tabs/LongitudinalReportTab';
// AskMedAITab moved to bottom ChatPanel in ViewportArea
import { MergeReplaceDialog } from './components/MergeReplaceDialog';
import { DuplicateOrganDialog, DuplicateDialogChoice } from './components/DuplicateOrganDialog';

// Import hooks
import { useServerConnection } from './hooks/useServerConnection';
import { useToolActivation } from './hooks/useToolActivation';
import { useSegmentationHandlers } from './hooks/useSegmentationHandlers';
import { useAnalyticsHandlers } from './hooks/useAnalyticsHandlers';

// Import types
import type { TabId, PromptPayload } from './types';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('auto-segmentation');
  // Separate model states for each tab
  const [autoSegModel, setAutoSegModel] = useState<string | null>(null);
  const [smartEditModel, setSmartEditModel] = useState<string | null>(null);
  // BiomedParse text prompt (persists across tabs)
  const [biomedParseTextPrompt, setBiomedParseTextPrompt] = useState('');
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  // Track current SmartEdit segmentation
  const smartEditSegmentationRef = useRef<{ segmentationId: string; volumeId: string } | null>(null);

  // Duplicate organ detection state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateOrgans, setDuplicateOrgans] = useState<string[]>([]);
  const pendingInferenceRef = useRef<{
    result: Awaited<ReturnType<typeof runInference>>;
    referenceVolumeId: string;
    duplicates: string[];
    allLabels: { index: number; name: string; color: string }[];
  } | null>(null);

  // Suite store access
  const { activeSuiteId } = useSuiteStore();
  const activeSuiteConfig = useMemo(() => getSuite(activeSuiteId), [activeSuiteId]);
  // activeTab may reference a tab that feature-filtering removed (e.g. the
  // 'auto-segmentation' default in basic viewer mode) - never render those
  const isActiveTabVisible = useMemo(
    () => activeSuiteConfig?.tabs?.some((t) => t.id === activeTab) ?? false,
    [activeSuiteConfig, activeTab]
  );
  const hasVisibleTabs = (activeSuiteConfig?.tabs?.length ?? 0) > 0;
  // Segmentation UI (tab strip, tools, segment list) belongs to the
  // monai-segmentation feature; the basic viewer shows none of it.
  const segmentationEnabled = isFeatureEnabled('monai-segmentation');

  // Per-user window visibility (Panels dropdown). A window shows only when the
  // user has enabled it AND (implicitly) its feature is on. Default: hidden.
  const panelVisible = usePanelVisibilityStore((s) => s.visible);
  const showWindow = (id: string) => panelVisible[id] ?? false;

  // Longitudinal session state
  const isLongitudinalActive = useIsLongitudinalActive();
  const longitudinalSession = useActiveSession();

  // Store access
  const {
    connectionStatus,
    models,
    activeModel,
    isInferring,
    error,
    client,
    setActiveModel,
    setInferring,
  } = useMonaiStore();

  const {
    segmentations,
    activeSegmentationId,
    addSegmentation,
    addSegment,
    setActiveSegmentation,
    updateSegment,
    activeSegmentIndex,
    setActiveSegmentIndex,
  } = useSegmentationStore();

  const { images, activeImageId } = useViewerStore();

  // Computed values
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;
  const is2DImage = activeImage?.metadata.dimensionality === '2D';
  const toolGroupId = is2DImage ? 'medai2DToolGroup' : 'medaiToolGroup';
  const hasImage = !!activeImage;
  const isConnected = connectionStatus === 'connected';

  // Get active segmentation and segments
  const activeSegmentation = segmentations.find((s) => s.id === activeSegmentationId);
  const segments = activeSegmentation?.segments || [];

  // Custom hooks
  const { handleConnect } = useServerConnection();

  const { activeTool, handleToolChange } = useToolActivation({
    toolGroupId,
    activeSegmentIndex,
    activeSegmentationId,
  });

  const {
    isLoadingLabel,
    isCreatingSegmentation,
    showMergeDialog,
    handleCreateSegmentation,
    handleLabelFileSelect,
    handleExportLabel,
    handleMergeDialogChoice,
  } = useSegmentationHandlers({ toolGroupId });

  const {
    isComputingVolumetrics,
    isComputingRadiomics,
    hasResults,
    handleComputeVolumetrics,
    handleComputeRadiomics,
    openAnalyticsModal,
  } = useAnalyticsHandlers();

  // Server URL state
  const defaultServerUrl = import.meta.env.VITE_MONAI_SERVER_URL || '';
  const [serverUrlInput, setServerUrlInput] = useState(defaultServerUrl);

  // Initialize tab-specific models when models are loaded
  useEffect(() => {
    if (models.length > 0) {
      if (!autoSegModel) {
        const segModels = models.filter((m) =>
          m.type === 'segmentation' || m.type === 'deepgrow' || m.type === 'deepedit'
        );
        if (segModels.length > 0) {
          setAutoSegModel(segModels[0].name);
        }
      }
      if (!smartEditModel) {
        setSmartEditModel('nnInteractive');
      }
    }
  }, [models, autoSegModel, smartEditModel]);

  // Update activeTab when suite changes to show the suite's first tab
  useEffect(() => {
    if (activeSuiteConfig?.tabs && activeSuiteConfig.tabs.length > 0) {
      const firstTabId = activeSuiteConfig.tabs[0].id as TabId;
      setActiveTab(firstTabId);
    }
  }, [activeSuiteId, activeSuiteConfig]);


  /**
   * Apply inference result to the segmentation state.
   * This is called after the user has made a choice in the duplicate dialog (or when there are no duplicates).
   */
  const applyInferenceResult = useCallback(async (
    result: Awaited<ReturnType<typeof runInference>>,
    referenceVolumeId: string,
    labelsToApply: { index: number; name: string; color: string }[],
    replaceExisting: boolean
  ) => {
    if (!activeSegmentation) {
      // Create new segmentation
      addSegmentation({
        id: result.segmentationId,
        label: `${autoSegModel} - ${new Date().toLocaleTimeString()}`,
        volumeId: result.volumeId,
        segments: [],
        status: 'draft',
      });

      labelsToApply.forEach((label) => {
        const segment: Segment = {
          segmentIndex: label.index,
          label: label.name,
          color: label.color,
          visible: true,
          locked: false,
        };
        addSegment(result.segmentationId, segment);
      });

      await createSegmentationFromResult(
        result.segmentationId,
        result.volumeId,
        result.labelData,
        labelsToApply,
        referenceVolumeId,
        toolGroupId
      );

      setActiveSegmentation(result.segmentationId);
      setActiveSegmentationInCornerstone(result.segmentationId);
      if (labelsToApply.length > 0) {
        setActiveSegmentIndex(labelsToApply[0].index);
      }
    } else {
      // Merge into existing segmentation
      const canMerge = activeSegmentation.volumeId && !activeSegmentation.segments.some(s => s.volumeId);

      if (canMerge) {
        // Find the max existing segment index
        const existingMaxIndex = activeSegmentation.segments.reduce(
          (max, seg) => Math.max(max, seg.segmentIndex),
          0
        );

        // Add inference result with remapped indices
        const remappedLabels = await addInferenceResultToSegmentation(
          activeSegmentation.id,
          result.labelData,
          labelsToApply,
          existingMaxIndex,
          toolGroupId
        );

        // Add new segments to the store
        remappedLabels.forEach((label) => {
          const segment: Segment = {
            segmentIndex: label.index,
            label: label.name,
            color: label.color,
            visible: true,
            locked: false,
          };
          addSegment(activeSegmentation.id, segment);
        });

        toast.success('Segments added', `Added ${remappedLabels.length} new segment(s) to existing segmentation.`);
        if (remappedLabels.length > 0) {
          setActiveSegmentIndex(remappedLabels[0].index);
        }
      } else {
        // Can't merge - create new
        addSegmentation({
          id: result.segmentationId,
          label: `${autoSegModel} - ${new Date().toLocaleTimeString()}`,
          volumeId: result.volumeId,
          segments: [],
          status: 'draft',
        });

        labelsToApply.forEach((label) => {
          const segment: Segment = {
            segmentIndex: label.index,
            label: label.name,
            color: label.color,
            visible: true,
            locked: false,
          };
          addSegment(result.segmentationId, segment);
        });

        await createSegmentationFromResult(
          result.segmentationId,
          result.volumeId,
          result.labelData,
          labelsToApply,
          referenceVolumeId,
          toolGroupId
        );

        setActiveSegmentation(result.segmentationId);
        setActiveSegmentationInCornerstone(result.segmentationId);
        if (labelsToApply.length > 0) {
          setActiveSegmentIndex(labelsToApply[0].index);
        }
      }
    }
  }, [activeSegmentation, autoSegModel, addSegmentation, addSegment, setActiveSegmentation, setActiveSegmentIndex, toolGroupId]);

  // Handle duplicate dialog choice
  const handleDuplicateDialogChoice = useCallback(async (choice: DuplicateDialogChoice) => {
    setShowDuplicateDialog(false);

    if (choice === 'cancel' || !pendingInferenceRef.current) {
      pendingInferenceRef.current = null;
      setInferring(false);
      return;
    }

    const { result, referenceVolumeId, duplicates, allLabels } = pendingInferenceRef.current;
    pendingInferenceRef.current = null;

    try {
      if (choice === 'skip') {
        // Filter out duplicate labels
        const filteredLabels = allLabels.filter(
          label => !duplicates.some(d => d.toLowerCase() === label.name.toLowerCase())
        );

        if (filteredLabels.length === 0) {
          toast.info('No new segments', 'All requested organs already exist in the segmentation.');
          return;
        }

        await applyInferenceResult(result, referenceVolumeId, filteredLabels, false);
      } else if (choice === 'replace') {
        // Apply all labels (will replace via addInferenceResultToSegmentation)
        await applyInferenceResult(result, referenceVolumeId, allLabels, true);
      }
    } catch (err) {
      console.error('[RightPanel] Failed to apply inference result:', err);
      setInferenceError(err instanceof Error ? err.message : 'Failed to apply result');
    } finally {
      setInferring(false);
    }
  }, [applyInferenceResult, setInferring]);

  // Handle running segmentation (auto-seg without prompts)
  const handleRunSegmentation = useCallback(async (options?: { textPrompt?: string; modality?: string; roi_subset?: string[] }) => {
    if (!client || !autoSegModel || !activeImage) return;

    setInferenceError(null);
    setInferring(true);

    try {
      const inferenceOptions: { model: string; params?: Record<string, unknown> } = {
        model: autoSegModel,
      };

      if (options?.textPrompt) {
        inferenceOptions.params = { text_prompt: options.textPrompt };
      } else if (options?.modality || options?.roi_subset) {
        inferenceOptions.params = {
          ...(options.modality && { modality: options.modality }),
          ...(options.roi_subset && { roi_subset: options.roi_subset }),
        };
      }

      const result = await runInference(client, activeImage, inferenceOptions);
      const referenceVolumeId = `localVolume:${activeImage.imageId}`;

      // Check for duplicate labels in existing segmentation
      if (activeSegmentation && activeSegmentation.segments.length > 0) {
        const existingLabels = activeSegmentation.segments.map(s => s.label.toLowerCase());
        const incomingLabels = result.labels.map(l => l.name);
        const duplicates = incomingLabels.filter(
          label => existingLabels.includes(label.toLowerCase())
        );

        if (duplicates.length > 0) {
          // Store pending result and show dialog
          pendingInferenceRef.current = {
            result,
            referenceVolumeId,
            duplicates,
            allLabels: result.labels,
          };
          setDuplicateOrgans(duplicates);
          setShowDuplicateDialog(true);
          return; // Wait for dialog choice
        }
      }

      // No duplicates - apply result directly
      await applyInferenceResult(result, referenceVolumeId, result.labels, false);
    } catch (err) {
      console.error('[RightPanel] Inference failed:', err);
      setInferenceError(err instanceof Error ? err.message : 'Inference failed');
    } finally {
      // Only set inferring false if we're not waiting for dialog
      if (!showDuplicateDialog) {
        setInferring(false);
      }
    }
  }, [client, autoSegModel, activeImage, setInferring, activeSegmentation, applyInferenceResult, showDuplicateDialog]);

  // Handle running inference with prompts (SmartEdit)
  const handleRunWithPrompts = useCallback(async (prompts: PromptPayload) => {
    if (!client || !smartEditModel || !activeImage) return;

    setInferenceError(null);
    setInferring(true);

    try {
      const virtualModelMap: Record<string, { model: string; params: Record<string, unknown> }> = {
        'nnInteractive': { model: 'segmentation', params: { nninter: true } },
        'SAM2': { model: 'segmentation', params: { medsam2: 'sam2' } },
        'MedSAM2': { model: 'segmentation', params: { medsam2: 'medsam2' } },
        'SAM3': { model: 'segmentation', params: { medsam2: 'sam3' } },
      };

      const virtualConfig = virtualModelMap[smartEditModel];
      const actualModel = virtualConfig?.model || smartEditModel;
      const extraParams = virtualConfig?.params || {};

      const result = await runInference(client, activeImage, {
        model: actualModel,
        params: extraParams,
        posPoints: prompts.posPoints,
        negPoints: prompts.negPoints,
        posBoxes: prompts.posBoxes,
        negBoxes: prompts.negBoxes,
        posScribbles: prompts.posScribbles,
        negScribbles: prompts.negScribbles,
        posLassos: prompts.posLassos,
        negLassos: prompts.negLassos,
      });

      if (!result.labelData || result.labelData.byteLength === 0) {
        throw new Error('No segmentation data returned from server');
      }

      // Clear annotations for nnInteractive (server accumulates prompts)
      const isNnInteractiveOnly = extraParams.nninter === true && !extraParams.medsam2;
      if (isNnInteractiveOnly) {
        clearAllSmartEditAnnotations();
      }

      const referenceVolumeId = `localVolume:${activeImage.imageId}`;
      const targetSegmentIndex = activeSegmentIndex ?? 1;
      const isSubtractive = prompts.isSubtractive ?? false;

      // Check for multi-layer mode
      const activeSegment = activeSegmentation?.segments.find((s) => s.segmentIndex === targetSegmentIndex);
      const isMultiLayerMode = !!(activeSegment?.volumeId && activeSegment?.cornerstoneSegmentationId);

      if (isMultiLayerMode && activeSegment?.volumeId && activeSegment?.cornerstoneSegmentationId) {
        await updateSegmentationFromResult(
          activeSegment.cornerstoneSegmentationId,
          activeSegment.volumeId,
          result.labelData,
          referenceVolumeId,
          toolGroupId,
          1,
          isSubtractive,
          true
        );
        smartEditSegmentationRef.current = {
          segmentationId: activeSegment.cornerstoneSegmentationId,
          volumeId: activeSegment.volumeId,
        };
      } else if (activeSegmentation && activeSegmentation.volumeId) {
        await updateSegmentationFromResult(
          activeSegmentation.id,
          activeSegmentation.volumeId,
          result.labelData,
          referenceVolumeId,
          toolGroupId,
          targetSegmentIndex,
          isSubtractive
        );
        smartEditSegmentationRef.current = {
          segmentationId: activeSegmentation.id,
          volumeId: activeSegmentation.volumeId,
        };
      } else if (smartEditSegmentationRef.current) {
        await updateSegmentationFromResult(
          smartEditSegmentationRef.current.segmentationId,
          smartEditSegmentationRef.current.volumeId,
          result.labelData,
          referenceVolumeId,
          toolGroupId,
          targetSegmentIndex,
          isSubtractive
        );
      } else {
        // Create new segmentation
        addSegmentation({
          id: result.segmentationId,
          label: `${activeModel} - ${new Date().toLocaleTimeString()}`,
          volumeId: result.volumeId,
          segments: [],
          status: 'draft',
        });

        result.labels.forEach((label) => {
          const segment: Segment = {
            segmentIndex: label.index,
            label: label.name,
            color: label.color,
            visible: true,
            locked: false,
          };
          addSegment(result.segmentationId, segment);
        });

        await createSegmentationFromResult(
          result.segmentationId,
          result.volumeId,
          result.labelData,
          result.labels,
          referenceVolumeId,
          toolGroupId
        );

        setActiveSegmentation(result.segmentationId);
        setActiveSegmentationInCornerstone(result.segmentationId);
        smartEditSegmentationRef.current = {
          segmentationId: result.segmentationId,
          volumeId: result.volumeId,
        };
      }
    } catch (err) {
      console.error('[RightPanel] Inference failed:', err);
      setInferenceError(err instanceof Error ? err.message : 'Inference failed');
    } finally {
      setInferring(false);
    }
  }, [client, smartEditModel, activeImage, setInferring, addSegmentation, addSegment, activeSegmentationId, activeSegmentation, setActiveSegmentation, activeSegmentIndex, toolGroupId, activeModel]);

  // Handle segment selection
  const handleSegmentSelect = useCallback((segment: Segment) => {
    setActiveSegmentIndex(segment.segmentIndex);

    if (segment.cornerstoneSegmentationId) {
      setActiveSegmentationInCornerstone(segment.cornerstoneSegmentationId, toolGroupId);
      setActiveSegmentIndexInCornerstone(segment.cornerstoneSegmentationId, 1);
    } else if (activeSegmentationId) {
      setActiveSegmentIndexInCornerstone(activeSegmentationId, segment.segmentIndex);
    }

    // Reactivate tool with new segment
    const segIdForTool = segment.cornerstoneSegmentationId || activeSegmentationId;
    const segIdxForTool = segment.cornerstoneSegmentationId ? 1 : segment.segmentIndex;
    if (activeTool === 'brush' && segIdForTool) {
      activateBrushTool(toolGroupId, segIdxForTool, segIdForTool);
    } else if (activeTool === 'eraser' && segIdForTool) {
      activateEraserTool(toolGroupId, segIdxForTool, segIdForTool);
    }
  }, [toolGroupId, activeSegmentationId, activeTool, setActiveSegmentIndex]);

  // Handle segment visibility toggle
  const handleToggleVisibility = useCallback((segment: Segment) => {
    const newVisibility = !segment.visible;
    updateSegment(activeSegmentationId!, segment.segmentIndex, { visible: newVisibility });
    setSegmentVisibility(toolGroupId, activeSegmentationId!, segment.segmentIndex, newVisibility);
  }, [toolGroupId, activeSegmentationId, updateSegment]);

  // Handle segment label update
  const handleUpdateLabel = useCallback((segmentIndex: number, newLabel: string) => {
    if (activeSegmentationId) {
      updateSegment(activeSegmentationId, segmentIndex, { label: newLabel });
    }
  }, [activeSegmentationId, updateSegment]);

  return (
    <aside
      className="w-80 bg-gradient-to-b from-background-secondary to-background-primary border-l border-border-subtle flex flex-col overflow-hidden"
      data-testid="right-panel"
    >
      {/* Subtle top accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent" />

      <div className="flex-1 overflow-y-auto scrollbar-on-hover p-4 space-y-5">
        {/* Panels dropdown - choose which windows to show */}
        <PanelSelector />

        {/* Server Connection - MONAI segmentation feature + user-selected */}
        {segmentationEnabled && showWindow('server-connection') && (
          <ServerConnectionPanel
            connectionStatus={connectionStatus}
            serverUrl={serverUrlInput}
            onServerUrlChange={setServerUrlInput}
            onConnect={handleConnect}
            error={error}
          />
        )}

        {/* Findings Panel - for radiologist dictation/notes */}
        {showWindow('findings') && <FindingsPanel />}

        {/* Chest X-Ray AI Header - shown only for chestxray suite */}
        {activeSuiteId === 'chestxray' && isFeatureEnabled('chestxray') && (
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-accent-primary/10 to-transparent border border-accent-primary/20 rounded-lg mb-4">
            <div className="w-10 h-10 rounded-lg bg-accent-primary/20 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-accent-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-text-primary">Chest X-Ray AI</h3>
                <Sparkles className="h-3.5 w-3.5 text-accent-primary" />
              </div>
              <p className="text-xs text-text-muted">MedGemma-powered detection</p>
            </div>
          </div>
        )}

        {/* Tabs with refined styling - only when the suite has visible tabs */}
        {hasVisibleTabs && (
        <div className="relative">
          {/* Section divider */}
          <div className="absolute -left-4 -right-4 -top-2.5 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />

          <TabNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={activeSuiteConfig?.tabs}
          />

          {/* Tab Content with fade transition */}
          {isActiveTabVisible && (
          <div className="mt-5 animate-stagger-fade-in stagger-0">
            {activeTab === 'auto-segmentation' && (
              <AutoSegmentationTab
                isConnected={isConnected}
                hasImage={hasImage}
                models={models}
                activeModel={autoSegModel}
                onModelChange={setAutoSegModel}
                onRun={handleRunSegmentation}
                isInferring={isInferring}
                error={inferenceError}
                is2DImage={is2DImage}
                imageModality={activeImage?.metadata.modality}
                textPrompt={biomedParseTextPrompt}
                setTextPrompt={setBiomedParseTextPrompt}
              />
            )}
            {activeTab === 'smart-edit' && (
              <SmartEditTab
                isConnected={isConnected}
                hasImage={hasImage}
                models={models}
                activeModel={smartEditModel}
                onModelChange={setSmartEditModel}
                onRun={handleRunSegmentation}
                isInferring={isInferring}
                error={inferenceError}
                is2DImage={is2DImage}
                textPrompt={biomedParseTextPrompt}
                setTextPrompt={setBiomedParseTextPrompt}
                activeImageId={activeImageId}
                activeImage={activeImage}
                client={client}
                activeSegmentIndex={activeSegmentIndex}
                activeSegmentationId={activeSegmentationId}
                toolGroupId={toolGroupId}
                onRunWithPrompts={handleRunWithPrompts}
              />
            )}
            {activeTab === 'oncology-metrics' && (
              <OncologyMetricsPanel
                activeSegmentationId={activeSegmentationId}
              />
            )}
            {activeTab === 'rt-structures' && (
              <RTStructuresPanel
                activeSegmentationId={activeSegmentationId}
              />
            )}
            {activeTab === 'neuro-metrics' && (
              <NeurologyMetricsPanel
                activeSegmentationId={activeSegmentationId}
              />
            )}
            {activeTab === 'surgical-planning' && (
              <SurgicalPlanningPanel
                activeSegmentationId={activeSegmentationId}
              />
            )}
            {activeTab === 'cardiac-metrics' && (
              <CardiacMetricsPanel
                activeSegmentationId={activeSegmentationId}
              />
            )}
            {activeTab === 'detection' && (
              <ChestXrayDetectionTab
                isConnected={isConnected}
                hasImage={hasImage}
              />
            )}
            {/* AskMedAI moved to bottom ChatPanel */}
          </div>
          )}
        </div>
        )}

        {/* Segmentation Tools + Segments - local (no backend); user-selected */}
        {showWindow('segmentation-tools') && (
          <SegmentationToolsPanel
            hasImage={hasImage}
            activeSegmentationId={activeSegmentationId}
            isCreatingSegmentation={isCreatingSegmentation}
            isLoadingLabel={isLoadingLabel}
            onCreateSegmentation={handleCreateSegmentation}
            onLabelFileSelect={handleLabelFileSelect}
            onExportLabel={handleExportLabel}
          />
        )}

        {showWindow('segments') && (
          <SegmentsPanel
            segments={segments}
            activeSegmentationId={activeSegmentationId}
            activeSegmentIndex={activeSegmentIndex}
            onSegmentSelect={handleSegmentSelect}
            onUpdateLabel={handleUpdateLabel}
            onToggleVisibility={handleToggleVisibility}
          />
        )}

        {/* Suite-specific panels */}
        {activeSuiteId === 'oncology' && activeTab !== 'oncology-metrics' && (
          <OncologyMetricsPanel
            activeSegmentationId={activeSegmentationId}
          />
        )}

        {activeSuiteId === 'rt' && activeTab !== 'rt-structures' && (
          <RTStructuresPanel
            activeSegmentationId={activeSegmentationId}
          />
        )}

        {activeSuiteId === 'neurology' && activeTab !== 'neuro-metrics' && (
          <NeurologyMetricsPanel
            activeSegmentationId={activeSegmentationId}
          />
        )}

        {activeSuiteId === 'surgical' && activeTab !== 'surgical-planning' && (
          <SurgicalPlanningPanel
            activeSegmentationId={activeSegmentationId}
          />
        )}

        {activeSuiteId === 'cardiology' && activeTab !== 'cardiac-metrics' && (
          <CardiacMetricsPanel
            activeSegmentationId={activeSegmentationId}
          />
        )}

        {/* Longitudinal Panels - show when session is active and suite supports it */}
        {isLongitudinalActive && longitudinalSession && activeSuiteConfig?.supportsLongitudinal && (
          <>
            {/* Longitudinal Metrics Panel */}
            <LongitudinalMetricsPanel />

            {/* Longitudinal Report Tab (requires reports feature) */}
            {isFeatureEnabled('reports') && (
              <div className="mt-4 p-4 bg-gradient-to-br from-background-tertiary/60 to-background-tertiary/30 rounded-xl border border-border-subtle">
                <LongitudinalReportTab />
              </div>
            )}
          </>
        )}

        {/* Analytics Panel - analytics feature + user-selected */}
        {activeSuiteId === 'auto' && isFeatureEnabled('analytics') && showWindow('analytics') && (
          <AnalyticsPanel
            activeSegmentationId={activeSegmentationId}
            hasSegments={segments.length > 0}
            isComputingVolumetrics={isComputingVolumetrics}
            isComputingRadiomics={isComputingRadiomics}
            hasResults={hasResults}
            onComputeVolumetrics={handleComputeVolumetrics}
            onComputeRadiomics={handleComputeRadiomics}
            onViewResults={() => openAnalyticsModal()}
          />
        )}

        {/* Merge/Replace Dialog */}
        <MergeReplaceDialog
          isOpen={showMergeDialog}
          onChoice={handleMergeDialogChoice}
        />

        {/* Duplicate Organ Dialog */}
        <DuplicateOrganDialog
          isOpen={showDuplicateDialog}
          duplicateOrgans={duplicateOrgans}
          onChoice={handleDuplicateDialogChoice}
        />
      </div>
    </aside>
  );
}
