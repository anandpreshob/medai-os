import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Eye, ArrowRight, Sparkles, Layers } from 'lucide-react';
import { isFeatureEnabled } from '@medai/core';

/**
 * LauncherPage - entry screen offering two ways into MedAI:
 *
 *  - Agent window: a chat harness that orchestrates batch workflows
 *    (e.g. "run liver segmentation with biomedparse on patients 1-5").
 *  - Viewer window: the standard study browser + viewer.
 *
 * The Agent card is only active when the `agent` feature is enabled (chat
 * service configured). Otherwise it renders disabled with a hint.
 */
export function LauncherPage() {
  const navigate = useNavigate();
  const agentEnabled = isFeatureEnabled('agent');

  return (
    <div className="h-screen w-screen overflow-auto bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-800/40 px-4 py-1.5 text-sm text-zinc-300">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            MedAI OS
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            How do you want to work today?
          </h1>
          <p className="mt-3 max-w-xl text-zinc-400">
            Open the <span className="text-zinc-200">Agent</span> to orchestrate
            batch segmentation from plain language, or open the{' '}
            <span className="text-zinc-200">Viewer</span> to load and edit studies
            one at a time.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
          {/* Agent card */}
          <button
            type="button"
            disabled={!agentEnabled}
            onClick={() => agentEnabled && navigate('/agent')}
            className={[
              'group relative flex flex-col rounded-2xl border p-8 text-left transition-all',
              agentEnabled
                ? 'cursor-pointer border-zinc-700/70 bg-zinc-900/70 hover:border-cyan-500/60 hover:bg-zinc-900'
                : 'cursor-not-allowed border-zinc-800/60 bg-zinc-900/40 opacity-60',
            ].join(' ')}
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
              <Bot className="h-7 w-7" />
            </div>
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-semibold">
              Agent
            </h2>
            <p className="mb-6 flex-1 text-sm leading-relaxed text-zinc-400">
              Talk to MedAI. Ask it to run a segmentation model across many
              patients — it reads the images, runs the model, and saves the
              results back to PACS for review.
            </p>
            {agentEnabled ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-400">
                Open agent
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            ) : (
              <span className="text-xs text-zinc-500">
                Requires the AI backend (chat service) — enable the{' '}
                <code className="text-zinc-400">agent</code> feature.
              </span>
            )}
          </button>

          {/* Viewer card */}
          <button
            type="button"
            onClick={() => navigate('/studies')}
            className="group relative flex cursor-pointer flex-col rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-8 text-left transition-all hover:border-violet-500/60 hover:bg-zinc-900"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
              <Eye className="h-7 w-7" />
            </div>
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-semibold">
              Viewer
            </h2>
            <p className="mb-6 flex-1 text-sm leading-relaxed text-zinc-400">
              Browse studies, load a case, and use the full viewer with
              measurement and segmentation-editing tools.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400">
              Browse studies
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        <div className="mt-10 flex items-center gap-2 text-xs text-zinc-600">
          <Layers className="h-3.5 w-3.5" />
          Batch segmentation runs in the Agent; final touch-ups happen in the Viewer.
        </div>
      </div>
    </div>
  );
}

export default LauncherPage;
