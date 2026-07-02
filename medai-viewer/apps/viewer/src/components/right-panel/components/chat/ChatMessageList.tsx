import React, { useRef, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import type { ChatMessage as ChatMessageType, ChatSource, ActionCard } from '@medai/core';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';

interface ChatMessageListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  isStreaming: boolean;
  onSourceSelect: (source: ChatSource) => void;
  onInsertToReport?: (content: string) => void;
  renderActionCard?: (actionCard: ActionCard) => React.ReactNode;
}

/**
 * Group messages by date
 */
function groupMessagesByDate(messages: ChatMessageType[]): Map<string, ChatMessageType[]> {
  const groups = new Map<string, ChatMessageType[]>();

  messages.forEach((message) => {
    const dateKey = message.timestamp.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const existing = groups.get(dateKey) || [];
    existing.push(message);
    groups.set(dateKey, existing);
  });

  return groups;
}

/**
 * Scrollable container for chat messages with auto-scroll
 */
export function ChatMessageList({
  messages,
  isLoading,
  isStreaming,
  onSourceSelect,
  onInsertToReport,
  renderActionCard,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isStreaming]);

  const messageGroups = groupMessagesByDate(messages);

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center mb-3">
          <MessageSquare className="h-6 w-6 text-purple-400" />
        </div>
        <h3 className="text-sm font-medium text-text-primary mb-1">
          Ask MedAI
        </h3>
        <p className="text-xs text-text-muted max-w-[200px]">
          Ask questions about your case, get evidence-backed answers, or request summaries.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto scrollbar-on-hover space-y-4 p-2"
    >
      {Array.from(messageGroups.entries()).map(([date, dateMessages]) => (
        <div key={date}>
          {/* Date separator */}
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-[10px] text-text-muted font-medium px-2">
              {date}
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          {/* Messages for this date */}
          <div className="space-y-4">
            {dateMessages.map((message) => (
              <div key={message.id}>
                <ChatMessage
                  message={message}
                  onSourceSelect={onSourceSelect}
                  onInsertToReport={onInsertToReport}
                />
                {/* Render action card if present */}
                {message.actionCard && renderActionCard && (
                  <div className="ml-10 mt-1">
                    {renderActionCard(message.actionCard)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Typing indicator */}
      {(isLoading || isStreaming) && <TypingIndicator />}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
