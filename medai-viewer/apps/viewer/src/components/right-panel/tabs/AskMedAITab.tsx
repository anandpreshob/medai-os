import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AlertTriangle, MessageSquare, Sparkles, RefreshCw } from 'lucide-react';
import { Button, toast } from '@medai/ui';
import {
  useChatStore,
  useSuiteStore,
  useViewerStore,
  useSegmentationStore,
  useDetectionStore,
  useAnalyticsStore,
  ChatService,
  getSuite,
  type ChatSource,
  type ActionCard,
} from '@medai/core';
import {
  ChatMessageList,
  ChatInput,
  InsertContextButton,
  QuickActions,
  SourceDetailPanel,
} from '../components/chat';
import { AnnotationActionCard } from '../components/chat/AnnotationActionCard';
import { BatchProgressCard } from '../components/chat/BatchProgressCard';

/**
 * Main "Ask MedAI" chat panel tab
 */
export function AskMedAITab() {
  // Chat store state
  const {
    activeConversationId,
    draftMessage,
    isLoading,
    isStreaming,
    error,
    selectedSource,
    pendingPreviewId,
    activeBatchJobId,
    awaitingConfirmation,
    createConversation,
    setDraftMessage,
    addUserMessage,
    startStreamingMessage,
    appendToStreaming,
    finalizeStreamingMessage,
    setLoading,
    setError,
    selectSource,
    getActiveConversation,
    handleActionCardResponse,
    updateBatchProgress,
  } = useChatStore();

  // Suite context
  const { activeSuiteId } = useSuiteStore();
  const activeSuiteConfig = useMemo(() => getSuite(activeSuiteId), [activeSuiteId]);

  // Viewer state for case context
  const { images, activeImageId } = useViewerStore();
  const { segmentations } = useSegmentationStore();
  const detections = useDetectionStore((state) => state.detections);
  const volumetricsResult = useAnalyticsStore((state) => state.volumetricsResult);

  // Case context state
  const [contextAttached, setContextAttached] = useState(false);

  // Chat service instance
  const [chatService] = useState(() => {
    const serverUrl = import.meta.env.VITE_MEDAI_SERVER_URL || 'http://localhost:8000';
    return new ChatService(serverUrl);
  });

  // Initialize conversation on mount
  useEffect(() => {
    if (!activeConversationId) {
      createConversation();
    }
  }, [activeConversationId, createConversation]);

  // Get active conversation
  const conversation = getActiveConversation();
  const messages = conversation?.messages || [];

  // Get active image metadata
  const activeImage = activeImageId ? images.get(activeImageId) : undefined;

  // Build case context summary
  const caseContext = useMemo(() => {
    const hasSegmentations = segmentations.length > 0;
    // Detections is a Map<string, Detection[]>, count total detections
    const allDetections = activeImageId ? detections.get(activeImageId) || [] : [];
    const hasDetections = allDetections.length > 0;
    const hasVolumetrics = volumetricsResult !== null;

    return {
      modality: activeImage?.metadata.modality,
      hasSegmentations,
      segmentationCount: segmentations.reduce(
        (count, seg) => count + seg.segments.length,
        0
      ),
      hasDetections,
      detectionCount: allDetections.length,
      hasVolumetrics,
    };
  }, [activeImage, activeImageId, segmentations, detections, volumetricsResult]);

  // Handle context toggle
  const handleToggleContext = useCallback(() => {
    setContextAttached(!contextAttached);
  }, [contextAttached]);

  // Handle send message
  const handleSendMessage = useCallback(async () => {
    if (!draftMessage.trim() || isLoading || isStreaming) return;

    const messageContent = draftMessage.trim();

    // Add user message to conversation
    addUserMessage(messageContent, contextAttached);

    // Reset context attachment
    setContextAttached(false);

    // Start streaming response
    setLoading(true);
    startStreamingMessage();

    try {
      const response = await chatService.chatStream(
        {
          sessionId: activeConversationId || undefined,
          message: messageContent,
          includeSources: true,
          stream: true,
        },
        (chunk) => {
          appendToStreaming(chunk);
        },
        (sources) => {
          finalizeStreamingMessage(sources);
        }
      );

      // Finalize with sources if not already done
      if (response.sources) {
        finalizeStreamingMessage(response.sources);
      }
    } catch (err) {
      console.error('[AskMedAITab] Chat error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      toast.error('Chat Error', errorMessage);

      // Finalize the streaming message even on error
      finalizeStreamingMessage();
    }
  }, [
    draftMessage,
    isLoading,
    isStreaming,
    contextAttached,
    activeConversationId,
    chatService,
    addUserMessage,
    startStreamingMessage,
    appendToStreaming,
    finalizeStreamingMessage,
    setLoading,
    setError,
  ]);

  // Handle quick action selection
  const handleQuickAction = useCallback(
    (prompt: string) => {
      setDraftMessage(prompt);
    },
    [setDraftMessage]
  );

  // Handle source selection
  const handleSourceSelect = useCallback(
    (source: ChatSource) => {
      selectSource(source);
    },
    [selectSource]
  );

  // Handle insert to report
  const handleInsertToReport = useCallback((content: string) => {
    // TODO: Integrate with report store
    toast.success('Inserted', 'Content added to report draft');
  }, []);

  // Handle start new conversation
  const handleNewConversation = useCallback(() => {
    createConversation();
    setContextAttached(false);
  }, [createConversation]);

  // Handle annotation action card accept
  const handleAcceptAnnotation = useCallback(
    async (previewId: string) => {
      handleActionCardResponse('accept', previewId);
      setDraftMessage('accept');
      // Trigger a message to confirm
      addUserMessage('Accept the segmentation', false);
      setLoading(true);
      startStreamingMessage();

      try {
        const response = await chatService.chatStream(
          {
            sessionId: activeConversationId || undefined,
            message: 'yes, accept',
            includeSources: false,
            stream: true,
          },
          (chunk) => appendToStreaming(chunk),
          () => finalizeStreamingMessage()
        );
        finalizeStreamingMessage();
      } catch (err) {
        console.error('[AskMedAITab] Accept error:', err);
        setError('Failed to accept annotation');
        finalizeStreamingMessage();
      }
    },
    [
      activeConversationId,
      chatService,
      handleActionCardResponse,
      setDraftMessage,
      addUserMessage,
      setLoading,
      startStreamingMessage,
      appendToStreaming,
      finalizeStreamingMessage,
      setError,
    ]
  );

  // Handle annotation action card reject
  const handleRejectAnnotation = useCallback(
    async (previewId: string) => {
      handleActionCardResponse('reject', previewId);
      addUserMessage('Reject the segmentation', false);
      setLoading(true);
      startStreamingMessage();

      try {
        const response = await chatService.chatStream(
          {
            sessionId: activeConversationId || undefined,
            message: 'no, reject',
            includeSources: false,
            stream: true,
          },
          (chunk) => appendToStreaming(chunk),
          () => finalizeStreamingMessage()
        );
        finalizeStreamingMessage();
      } catch (err) {
        console.error('[AskMedAITab] Reject error:', err);
        setError('Failed to reject annotation');
        finalizeStreamingMessage();
      }
    },
    [
      activeConversationId,
      chatService,
      handleActionCardResponse,
      addUserMessage,
      setLoading,
      startStreamingMessage,
      appendToStreaming,
      finalizeStreamingMessage,
      setError,
    ]
  );

  // Handle annotation edit request
  const handleEditAnnotation = useCallback(
    (previewId: string) => {
      setDraftMessage('Edit the segmentation - ');
      toast.info('Edit Mode', 'Describe how you want to edit (e.g., "grow by 5 pixels")');
    },
    [setDraftMessage]
  );

  // Handle batch job start
  const handleStartBatchJob = useCallback(
    async (jobId: string) => {
      addUserMessage('Start the batch processing', false);
      setLoading(true);
      startStreamingMessage();

      try {
        await chatService.chatStream(
          {
            sessionId: activeConversationId || undefined,
            message: 'yes, start the batch job',
            includeSources: false,
            stream: true,
          },
          (chunk) => appendToStreaming(chunk),
          () => finalizeStreamingMessage()
        );
        finalizeStreamingMessage();
      } catch (err) {
        console.error('[AskMedAITab] Batch start error:', err);
        setError('Failed to start batch job');
        finalizeStreamingMessage();
      }
    },
    [
      activeConversationId,
      chatService,
      addUserMessage,
      setLoading,
      startStreamingMessage,
      appendToStreaming,
      finalizeStreamingMessage,
      setError,
    ]
  );

  // Handle batch job cancel
  const handleCancelBatchJob = useCallback(
    async (jobId: string) => {
      addUserMessage('Cancel the batch processing', false);
      updateBatchProgress(jobId, { status: 'cancelled' });
      toast.info('Cancelled', 'Batch processing has been cancelled');
    },
    [addUserMessage, updateBatchProgress]
  );

  // Render action card based on type
  const renderActionCard = useCallback(
    (actionCard: ActionCard) => {
      if (actionCard.type === 'annotation_preview' || actionCard.type === 'edit_preview') {
        return (
          <AnnotationActionCard
            actionCard={actionCard}
            onAccept={handleAcceptAnnotation}
            onReject={handleRejectAnnotation}
            onEdit={handleEditAnnotation}
            isLoading={isLoading}
          />
        );
      }

      if (actionCard.type === 'batch_progress' || actionCard.type === 'batch_confirmation') {
        return (
          <BatchProgressCard
            actionCard={actionCard}
            onStart={handleStartBatchJob}
            onCancel={handleCancelBatchJob}
          />
        );
      }

      return null;
    },
    [
      handleAcceptAnnotation,
      handleRejectAnnotation,
      handleEditAnnotation,
      handleStartBatchJob,
      handleCancelBatchJob,
      isLoading,
    ]
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* Header with suite badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30">
            <MessageSquare className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] font-medium text-purple-300">
              Ask MedAI
            </span>
            <Sparkles className="h-2.5 w-2.5 text-purple-400" />
          </div>

          {activeSuiteConfig && (
            <span className="text-[10px] text-text-muted">
              {activeSuiteConfig.name} Suite
            </span>
          )}
        </div>

        <button
          onClick={handleNewConversation}
          className="p-1.5 rounded-lg hover:bg-background-tertiary transition-colors"
          title="Start new conversation"
        >
          <RefreshCw className="h-3.5 w-3.5 text-text-muted" />
        </button>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-300/80 leading-relaxed">
          For clinical decision support only. Always verify AI-generated content
          with clinical judgment and authoritative sources.
        </p>
      </div>

      {/* Messages list */}
      <div className="flex-1 min-h-0 -mx-2">
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSourceSelect={handleSourceSelect}
          onInsertToReport={handleInsertToReport}
          renderActionCard={renderActionCard}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="px-2 py-1.5 mb-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-3 mb-2">
        <QuickActions onActionSelect={handleQuickAction} disabled={isLoading} />
      </div>

      {/* Context button */}
      <div className="mb-2">
        <InsertContextButton
          caseContext={caseContext}
          onInsert={handleToggleContext}
          isActive={contextAttached}
          disabled={isLoading}
        />
      </div>

      {/* Input */}
      <ChatInput
        value={draftMessage}
        onChange={setDraftMessage}
        onSend={handleSendMessage}
        isLoading={isLoading || isStreaming}
      />

      {/* Source detail panel overlay */}
      {selectedSource && (
        <SourceDetailPanel
          source={selectedSource}
          onClose={() => selectSource(null)}
        />
      )}
    </div>
  );
}
