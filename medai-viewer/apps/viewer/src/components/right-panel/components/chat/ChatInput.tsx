import React, { useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@medai/ui';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
}

/**
 * Chat input textarea with auto-resize and keyboard shortcuts
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  placeholder = 'Ask MedAI a question...',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSend();
      }
    }
  };

  const handleSend = () => {
    if (value.trim() && !isLoading) {
      onSend();
    }
  };

  const canSend = value.trim().length > 0 && !isLoading;

  return (
    <div className="flex flex-col gap-2 p-2 bg-background-tertiary/50 rounded-xl border border-border-subtle">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        rows={1}
        className="w-full bg-transparent text-text-primary text-sm placeholder-text-muted resize-none outline-none min-h-[24px] max-h-[150px]"
        data-testid="chat-input"
      />

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted">
          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Enter to send
        </span>

        <Button
          size="sm"
          onClick={handleSend}
          disabled={!canSend}
          className="h-7 px-3"
          data-testid="chat-send-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
