import { create } from 'zustand';

/**
 * Source types for chat citations
 */
export type ChatSourceType = 'guideline' | 'pubmed' | 'semantic_scholar' | 'textbook';

/**
 * Citation source from RAG or external APIs
 */
export interface ChatSource {
  type: ChatSourceType;
  title: string;
  authors?: string[];
  url?: string;
  excerpt?: string;
  relevanceScore?: number;
}

/**
 * Segmentation label from AI inference
 */
export interface SegmentationLabel {
  labelId: number;
  labelName: string;
  color: string;
  voxelCount?: number;
  volumeMl?: number;
  confidence?: number;
}

/**
 * Action card types for annotation workflow
 */
export type ActionCardType = 'annotation_preview' | 'edit_preview' | 'batch_progress' | 'batch_confirmation';

/**
 * Action card for annotation workflow
 */
export interface ActionCard {
  type: ActionCardType;
  previewId?: string;
  labels?: SegmentationLabel[];
  thumbnailUrl?: string;
  actions: string[];
  // Batch-specific fields
  jobId?: string;
  totalImages?: number;
  completedCount?: number;
  failedCount?: number;
  status?: 'queued' | 'running' | 'paused' | 'completed' | 'cancelled';
  estimatedTimeS?: number;
}

/**
 * Single chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  hasContext?: boolean;
  timestamp: Date;
  // Annotation workflow
  actionCard?: ActionCard;
}

/**
 * Chat conversation with session tracking
 */
export interface ChatConversation {
  sessionId: string;
  serverSessionId?: string;
  viewerSessionId?: string;
  messages: ChatMessage[];
}

/**
 * Chat store state and actions
 */
export interface ChatState {
  // State
  conversations: Map<string, ChatConversation>;
  activeConversationId: string | null;
  draftMessage: string;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  selectedSource: ChatSource | null;
  streamingMessageId: string | null;

  // Annotation workflow state
  pendingPreviewId: string | null;
  activeBatchJobId: string | null;
  awaitingConfirmation: boolean;

  // Actions
  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  linkToViewer: (chatId: string, viewerId: string) => void;
  setDraftMessage: (message: string) => void;
  addUserMessage: (content: string, hasContext?: boolean) => string;
  addAssistantMessage: (content: string, sources?: ChatSource[], actionCard?: ActionCard) => void;
  startStreamingMessage: () => string;
  appendToStreaming: (chunk: string) => void;
  finalizeStreamingMessage: (sources?: ChatSource[], actionCard?: ActionCard) => void;
  setServerSessionId: (localId: string, serverSessionId: string) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  selectSource: (source: ChatSource | null) => void;
  clearConversation: (id: string) => void;
  getActiveConversation: () => ChatConversation | null;
  reset: () => void;

  // Annotation workflow actions
  setPendingPreview: (previewId: string | null) => void;
  setActiveBatchJob: (jobId: string | null) => void;
  setAwaitingConfirmation: (awaiting: boolean) => void;
  updateBatchProgress: (jobId: string, progress: Partial<ActionCard>) => void;
  handleActionCardResponse: (action: string, previewId?: string) => void;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const initialState = {
  conversations: new Map<string, ChatConversation>(),
  activeConversationId: null as string | null,
  draftMessage: '',
  isLoading: false,
  isStreaming: false,
  error: null as string | null,
  selectedSource: null as ChatSource | null,
  streamingMessageId: null as string | null,
  // Annotation workflow state
  pendingPreviewId: null as string | null,
  activeBatchJobId: null as string | null,
  awaitingConfirmation: false,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  createConversation: () => {
    const sessionId = generateId();
    const conversation: ChatConversation = {
      sessionId,
      messages: [],
    };

    set((state) => {
      const newConversations = new Map(state.conversations);
      newConversations.set(sessionId, conversation);
      return {
        conversations: newConversations,
        activeConversationId: sessionId,
      };
    });

    return sessionId;
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
  },

  linkToViewer: (chatId, viewerId) => {
    set((state) => {
      const conversation = state.conversations.get(chatId);
      if (!conversation) return state;

      const updated: ChatConversation = {
        ...conversation,
        viewerSessionId: viewerId,
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(chatId, updated);
      return { conversations: newConversations };
    });
  },

  setDraftMessage: (message) => {
    set({ draftMessage: message });
  },

  addUserMessage: (content, hasContext = false) => {
    const messageId = generateId();
    const message: ChatMessage = {
      id: messageId,
      role: 'user',
      content,
      hasContext,
      timestamp: new Date(),
    };

    set((state) => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return state;

      const conversation = state.conversations.get(conversationId);
      if (!conversation) return state;

      const updated: ChatConversation = {
        ...conversation,
        messages: [...conversation.messages, message],
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(conversationId, updated);

      return {
        conversations: newConversations,
        draftMessage: '',
      };
    });

    return messageId;
  },

  addAssistantMessage: (content, sources, actionCard) => {
    const messageId = generateId();
    const message: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content,
      sources,
      actionCard,
      timestamp: new Date(),
    };

    set((state) => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return state;

      const conversation = state.conversations.get(conversationId);
      if (!conversation) return state;

      const updated: ChatConversation = {
        ...conversation,
        messages: [...conversation.messages, message],
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(conversationId, updated);

      // Update annotation workflow state based on action card
      const newState: Partial<ChatState> = {
        conversations: newConversations,
        isLoading: false,
        isStreaming: false,
      };

      if (actionCard) {
        if (actionCard.type === 'annotation_preview' || actionCard.type === 'edit_preview') {
          newState.pendingPreviewId = actionCard.previewId || null;
          newState.awaitingConfirmation = true;
        } else if (actionCard.type === 'batch_progress') {
          newState.activeBatchJobId = actionCard.jobId || null;
        }
      }

      return newState as ChatState;
    });
  },

  startStreamingMessage: () => {
    const messageId = generateId();
    const message: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    set((state) => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return { ...state, streamingMessageId: messageId };

      const conversation = state.conversations.get(conversationId);
      if (!conversation) return { ...state, streamingMessageId: messageId };

      const updated: ChatConversation = {
        ...conversation,
        messages: [...conversation.messages, message],
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(conversationId, updated);

      return {
        conversations: newConversations,
        streamingMessageId: messageId,
        isStreaming: true,
      };
    });

    return messageId;
  },

  appendToStreaming: (chunk) => {
    set((state) => {
      const conversationId = state.activeConversationId;
      const streamingId = state.streamingMessageId;
      if (!conversationId || !streamingId) return state;

      const conversation = state.conversations.get(conversationId);
      if (!conversation) return state;

      const messages = conversation.messages.map((msg) => {
        if (msg.id === streamingId) {
          return { ...msg, content: msg.content + chunk };
        }
        return msg;
      });

      const updated: ChatConversation = {
        ...conversation,
        messages,
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(conversationId, updated);

      return { conversations: newConversations };
    });
  },

  finalizeStreamingMessage: (sources, actionCard) => {
    set((state) => {
      const conversationId = state.activeConversationId;
      const streamingId = state.streamingMessageId;
      if (!conversationId || !streamingId) {
        return {
          ...state,
          isStreaming: false,
          isLoading: false,
          streamingMessageId: null,
        };
      }

      const conversation = state.conversations.get(conversationId);
      if (!conversation) {
        return {
          ...state,
          isStreaming: false,
          isLoading: false,
          streamingMessageId: null,
        };
      }

      const messages = conversation.messages.map((msg) => {
        if (msg.id === streamingId) {
          return { ...msg, sources, actionCard };
        }
        return msg;
      });

      const updated: ChatConversation = {
        ...conversation,
        messages,
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(conversationId, updated);

      // Update annotation workflow state based on action card
      const newState: Partial<ChatState> = {
        conversations: newConversations,
        isStreaming: false,
        isLoading: false,
        streamingMessageId: null,
      };

      if (actionCard) {
        if (actionCard.type === 'annotation_preview' || actionCard.type === 'edit_preview') {
          newState.pendingPreviewId = actionCard.previewId || null;
          newState.awaitingConfirmation = true;
        } else if (actionCard.type === 'batch_progress') {
          newState.activeBatchJobId = actionCard.jobId || null;
        }
      }

      return newState as ChatState;
    });
  },

  setServerSessionId: (localId, serverSessionId) => {
    const conversations = new Map(get().conversations);
    const conv = conversations.get(localId);
    if (conv) {
      conversations.set(localId, { ...conv, serverSessionId });
      set({ conversations });
    }
  },

  setLoading: (loading) => {
    set({ isLoading: loading, error: loading ? null : get().error });
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },

  setError: (error) => {
    set({ error, isLoading: false, isStreaming: false });
  },

  selectSource: (source) => {
    set({ selectedSource: source });
  },

  clearConversation: (id) => {
    set((state) => {
      const conversation = state.conversations.get(id);
      if (!conversation) return state;

      const updated: ChatConversation = {
        ...conversation,
        messages: [],
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(id, updated);

      return { conversations: newConversations };
    });
  },

  getActiveConversation: () => {
    const state = get();
    if (!state.activeConversationId) return null;
    return state.conversations.get(state.activeConversationId) || null;
  },

  // Annotation workflow actions
  setPendingPreview: (previewId) => {
    set({ pendingPreviewId: previewId });
  },

  setActiveBatchJob: (jobId) => {
    set({ activeBatchJobId: jobId });
  },

  setAwaitingConfirmation: (awaiting) => {
    set({ awaitingConfirmation: awaiting });
  },

  updateBatchProgress: (jobId, progress) => {
    set((state) => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return state;

      const conversation = state.conversations.get(conversationId);
      if (!conversation) return state;

      // Find and update the message with this batch job
      const messages = conversation.messages.map((msg) => {
        if (msg.actionCard?.jobId === jobId && msg.actionCard?.type === 'batch_progress') {
          return {
            ...msg,
            actionCard: { ...msg.actionCard, ...progress },
          };
        }
        return msg;
      });

      const updated: ChatConversation = {
        ...conversation,
        messages,
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(conversationId, updated);

      // Clear batch job if completed or cancelled
      const newActiveBatchJob =
        progress.status === 'completed' || progress.status === 'cancelled'
          ? null
          : state.activeBatchJobId;

      return {
        conversations: newConversations,
        activeBatchJobId: newActiveBatchJob,
      };
    });
  },

  handleActionCardResponse: (action, previewId) => {
    set((state) => {
      // Clear pending state when user responds to action card
      if (action === 'accept' || action === 'reject') {
        return {
          pendingPreviewId: action === 'accept' ? state.pendingPreviewId : null,
          awaitingConfirmation: false,
        };
      }
      return state;
    });
  },

  reset: () => set(initialState),
}));
