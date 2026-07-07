import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, ArrowLeft, Eye } from 'lucide-react';
import { isFeatureEnabled } from '@medai/core';
import { AgentChat } from '../components/agent/AgentChat';

/**
 * AgentPage - full-window host for the Agent chat harness.
 *
 * If the `agent` feature is disabled (chat service not configured), it redirects
 * back to the study browser so the standalone viewer stays usable.
 */
export function AgentPage() {
  const navigate = useNavigate();
  const enabled = isFeatureEnabled('agent');

  useEffect(() => {
    if (!enabled) navigate('/studies', { replace: true });
  }, [enabled, navigate]);

  if (!enabled) return null;

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Back to launcher"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">MedAI Agent</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/studies')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-500/60 hover:text-violet-300"
        >
          <Eye className="h-3.5 w-3.5" />
          Open Viewer
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <AgentChat />
      </div>
    </div>
  );
}

export default AgentPage;
