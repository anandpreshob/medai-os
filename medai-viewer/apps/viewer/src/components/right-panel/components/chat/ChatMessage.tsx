import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, FileText, ClipboardCopy, Check, Paperclip } from 'lucide-react';
import type { ChatMessage as ChatMessageType, ChatSource } from '@medai/core';
import { SourcesList } from './SourcesList';

interface ChatMessageProps {
  message: ChatMessageType;
  onSourceSelect: (source: ChatSource) => void;
  onInsertToReport?: (content: string) => void;
}

/**
 * Individual chat message component with markdown rendering and source citations
 */
export function ChatMessage({
  message,
  onSourceSelect,
  onInsertToReport,
}: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertToReport = () => {
    onInsertToReport?.(message.content);
  };

  return (
    <div
      className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-accent-primary/20 text-accent-primary'
            : 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-400'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message content */}
      <div
        className={`flex-1 min-w-0 ${
          isUser ? 'flex flex-col items-end' : ''
        }`}
      >
        {/* Context attached badge for user messages */}
        {isUser && message.hasContext && (
          <div className="flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary text-[10px] font-medium">
            <Paperclip className="h-2.5 w-2.5" />
            Case context attached
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`rounded-xl px-3 py-2 ${
            isUser
              ? 'bg-accent-primary/20 text-text-primary max-w-[85%]'
              : 'bg-background-tertiary text-text-primary'
          }`}
        >
          {/* Markdown content for assistant, plain text for user */}
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-sm prose prose-sm prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom renderers for markdown elements
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-text-secondary">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-text-primary">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-text-secondary">{children}</em>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="px-1 py-0.5 rounded bg-background-primary text-accent-primary text-xs font-mono">
                        {children}
                      </code>
                    ) : (
                      <code className="block p-2 rounded bg-background-primary text-text-secondary text-xs font-mono overflow-x-auto">
                        {children}
                      </code>
                    );
                  },
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold mt-3 mb-2 text-text-primary">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-bold mt-2 mb-1.5 text-text-primary">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold mt-2 mb-1 text-text-primary">
                      {children}
                    </h3>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-accent-primary/50 pl-3 my-2 text-text-secondary italic">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-primary hover:underline"
                    >
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full text-xs border-collapse">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border-subtle px-2 py-1 bg-background-primary text-left font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border-subtle px-2 py-1">
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Actions for assistant messages */}
        {!isUser && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-background-tertiary transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardCopy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>

            {onInsertToReport && (
              <button
                onClick={handleInsertToReport}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors"
                title="Insert into report"
              >
                <FileText className="h-3 w-3" />
                Insert into Report
              </button>
            )}
          </div>
        )}

        {/* Sources list for assistant messages */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesList
            sources={message.sources}
            onSourceSelect={onSourceSelect}
          />
        )}

        {/* Timestamp */}
        <p className="text-[10px] text-text-muted mt-1">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
