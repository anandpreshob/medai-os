import React from 'react';

/**
 * Animated typing indicator shown while MedAI is processing
 */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-text-muted text-sm">
      <div className="flex gap-1">
        <span
          className="w-2 h-2 rounded-full bg-accent-primary/60 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-accent-primary/60 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-accent-primary/60 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span className="text-xs">MedAI is thinking...</span>
    </div>
  );
}
