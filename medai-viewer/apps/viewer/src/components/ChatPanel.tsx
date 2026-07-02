/**
 * ChatPanel - Bottom panel for Ask MedAI chatbot
 *
 * A collapsible chat interface that sits below the viewport.
 * Provides RAG-powered clinical decision support with source citations.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  ChevronUp,
  ChevronDown,
  Send,
  Paperclip,
  X,
  FileText,
  ExternalLink,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useChatStore, ChatService, useViewerStore, useSuiteStore } from '@medai/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Chat service connects through the API gateway. Instantiated lazily so merely
// importing this module (with the chat feature disabled) creates no client.
const CHAT_SERVICE_URL = import.meta.env.VITE_MEDAI_SERVER_URL || import.meta.env.VITE_CHAT_SERVICE_URL || 'http://localhost:8002';
let chatServiceInstance: ChatService | null = null;
function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService(CHAT_SERVICE_URL);
  }
  return chatServiceInstance;
}

interface ChatPanelProps {
  defaultExpanded?: boolean;
  defaultHeight?: number;
}

export function ChatPanel({ defaultExpanded = false, defaultHeight = 280 }: ChatPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    conversations,
    activeConversationId,
    draftMessage,
    isLoading,
    isStreaming,
    error,
    selectedSource,
    createConversation,
    setServerSessionId,
    setDraftMessage,
    addUserMessage,
    addAssistantMessage,
    appendToStreaming,
    setLoading,
    setStreaming,
    setError,
    selectSource,
  } = useChatStore();

  const { activeImageId, images } = useViewerStore();
  const { activeSuiteId } = useSuiteStore();

  const activeConversation = activeConversationId
    ? conversations.get(activeConversationId)
    : null;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && isExpanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, isExpanded]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;
      setHeight(Math.max(150, Math.min(500, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Send message
  const handleSendMessage = async () => {
    if (!draftMessage.trim() || isLoading) return;

    const message = draftMessage.trim();
    setDraftMessage('');

    // Create local conversation if needed
    let localId = activeConversationId;
    if (!localId) {
      localId = createConversation();
    }

    // Check if we have a server-assigned session ID for this conversation
    const conversation = conversations.get(localId);
    const serverSessionId = conversation?.serverSessionId;

    // Add user message
    addUserMessage(message, false);
    setLoading(true);
    setError(null);

    try {
      // Build message with context if available
      let contextPrefix = '';
      if (activeImageId) {
        const image = images.get(activeImageId);
        if (image) {
          const modality = image.metadata.modality || 'Unknown';
          const bodyPart = image.metadata.bodyPartExamined || '';
          const series = image.metadata.seriesDescription || '';
          contextPrefix = `[Context: ${modality}${bodyPart ? ` - ${bodyPart}` : ''}${series ? ` (${series})` : ''}]\n\n`;
        }
      }

      // Send to chat service - omit sessionId on first message so server creates one
      const response = await getChatService().chat({
        sessionId: serverSessionId,
        message: contextPrefix + message,
        includeSources: true,
      });

      // Store the server-assigned session ID for future messages
      if (response.sessionId && localId && !serverSessionId) {
        setServerSessionId(localId, response.sessionId);
      }

      addAssistantMessage(response.message, response.sources);
    } catch (err) {
      console.error('[ChatPanel] Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Quick actions
  const quickActions = [
    { label: 'Summarize Findings', prompt: 'Summarize the key findings from this study.' },
    { label: 'Differential Diagnosis', prompt: 'What is the differential diagnosis based on the imaging findings?' },
    { label: 'Recommendations', prompt: 'What are the recommended next steps or follow-up?' },
  ];

  const handleQuickAction = (prompt: string) => {
    setDraftMessage(prompt);
    inputRef.current?.focus();
  };

  // Toggle expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      ref={panelRef}
      className={`
        border-t border-border-primary bg-background-secondary
        transition-all duration-200 ease-out
        ${isExpanded ? '' : 'h-10'}
      `}
      style={isExpanded ? { height } : undefined}
    >
      {/* Resize handle */}
      {isExpanded && (
        <div
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-accent-primary/50 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-10 cursor-pointer hover:bg-background-tertiary/50 transition-colors"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-medium text-text-primary">Ask MedAI</span>
          {activeSuiteId && (
            <span className="text-xs text-text-muted px-2 py-0.5 bg-background-tertiary rounded">
              {activeSuiteId}
            </span>
          )}
          <span className="text-xs text-text-muted">Clinical decision support</span>
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && activeConversation && activeConversation.messages.length > 0 && (
            <span className="text-xs text-text-muted">
              {activeConversation.messages.length} messages
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex flex-col h-[calc(100%-40px)]">
          {/* Disclaimer */}
          <div className="px-4 py-1.5 bg-amber-900/20 border-b border-amber-700/30">
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertCircle className="w-3 h-3" />
              <span>For clinical decision support only. Always verify with primary sources.</span>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {(!activeConversation || activeConversation.messages.length === 0) ? (
              <div className="text-center py-4">
                <Sparkles className="w-8 h-8 text-accent-primary/50 mx-auto mb-2" />
                <p className="text-sm text-text-muted mb-3">
                  Ask questions about the current study or request clinical guidance
                </p>
                {/* Quick actions */}
                <div className="flex flex-wrap justify-center gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickAction(action.prompt);
                      }}
                      className="px-3 py-1.5 text-xs bg-background-tertiary hover:bg-accent-primary/20
                               text-text-secondary hover:text-accent-primary rounded-full transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`
                      max-w-[80%] rounded-lg px-3 py-2 text-sm
                      ${msg.role === 'user'
                        ? 'bg-accent-primary text-white'
                        : 'bg-background-tertiary text-text-primary'
                      }
                    `}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <p className="text-xs text-text-muted mb-1">Sources:</p>
                        <div className="flex flex-wrap gap-1">
                          {msg.sources.map((source, idx) => (
                            <button
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectSource(source);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs
                                       bg-background-primary/50 hover:bg-accent-primary/20
                                       rounded transition-colors"
                            >
                              <FileText className="w-3 h-3" />
                              <span className="truncate max-w-[150px]">{source.title}</span>
                              {source.url && <ExternalLink className="w-3 h-3" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-background-tertiary rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-text-muted">MedAI is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex justify-center">
                <div className="bg-red-900/20 text-red-400 text-xs px-3 py-2 rounded">
                  {error}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="px-4 py-2 border-t border-border-primary">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about findings, differential diagnosis, recommendations..."
                  className="w-full px-3 py-2 pr-10 bg-background-tertiary border border-border-primary
                           rounded-lg text-sm text-text-primary placeholder-text-muted
                           focus:outline-none focus:border-accent-primary resize-none"
                  rows={1}
                  style={{ minHeight: '38px', maxHeight: '100px' }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!draftMessage.trim() || isLoading}
                className="p-2 bg-accent-primary hover:bg-accent-primary/80 disabled:bg-background-tertiary
                         disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Press <kbd className="px-1 py-0.5 bg-background-tertiary rounded text-xs">Cmd</kbd>+
              <kbd className="px-1 py-0.5 bg-background-tertiary rounded text-xs">Enter</kbd> to send
            </p>
          </div>
        </div>
      )}

      {/* Source detail panel */}
      {selectedSource && (
        <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 bg-background-secondary border border-border-primary rounded-lg shadow-lg p-4 z-50">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`
                px-2 py-0.5 text-xs rounded
                ${selectedSource.type === 'guideline' ? 'bg-blue-900/50 text-blue-400' : ''}
                ${selectedSource.type === 'pubmed' ? 'bg-green-900/50 text-green-400' : ''}
                ${selectedSource.type === 'semantic_scholar' ? 'bg-purple-900/50 text-purple-400' : ''}
              `}>
                {selectedSource.type}
              </span>
              {selectedSource.relevanceScore && (
                <span className="text-xs text-text-muted">
                  {Math.round(selectedSource.relevanceScore * 100)}% relevant
                </span>
              )}
            </div>
            <button
              onClick={() => selectSource(null)}
              className="p-1 hover:bg-background-tertiary rounded"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
          <h4 className="font-medium text-text-primary mb-1">{selectedSource.title}</h4>
          {selectedSource.authors && (
            <p className="text-xs text-text-muted mb-2">{selectedSource.authors.join(', ')}</p>
          )}
          {selectedSource.excerpt && (
            <p className="text-sm text-text-secondary mb-2">{selectedSource.excerpt}</p>
          )}
          {selectedSource.url && (
            <a
              href={selectedSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
            >
              View source <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
