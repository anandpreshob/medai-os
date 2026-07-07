import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  User,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Activity,
} from 'lucide-react';
import { AgentService, getFeatureUrl, type AgentEvent } from '@medai/core';

/**
 * AgentChat - the conversational harness for the Agent window.
 *
 * Streams typed events from the MedAI agent (text, tool calls, batch progress)
 * and renders them as an ordered list of blocks: assistant/user text, tool
 * activity chips, and a live batch-progress card.
 */

type Block =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; open: boolean }
  | { kind: 'tool'; id: string; name: string; status: 'running' | 'done'; summary?: string }
  | {
      kind: 'batch';
      id: string;
      jobId: string;
      total?: number;
      model?: string;
      prompt?: string;
      status: string;
      pct: number;
      success?: number;
      failed?: number;
    }
  | { kind: 'error'; id: string; text: string };

let _seq = 0;
const uid = () => `b${Date.now()}_${_seq++}`;

const SUGGESTIONS = [
  'List the available patients',
  'Run liver segmentation with biomedparse on the first 3 patients',
  'What can you do?',
];

function summarizeTool(name: string, result: Record<string, unknown>): string {
  if (result?.error) return `Error: ${String(result.error)}`;
  switch (name) {
    case 'list_patients':
      return `Found ${result.total_patients ?? 0} patient(s), ${result.total_images ?? 0} image(s)`;
    case 'resolve_images':
      return `Resolved ${result.count ?? 0} image(s)`;
    case 'run_batch_segmentation':
      return `Started job on ${result.total ?? 0} image(s)`;
    case 'get_batch_status':
      return `Status: ${result.status ?? 'unknown'} (${Math.round(Number(result.progress_percentage) || 0)}%)`;
    case 'save_results_to_pacs':
      return `Pushed ${result.pushed ?? 0}/${result.total_completed ?? 0} result(s) to PACS`;
    default:
      return 'Done';
  }
}

export function AgentChat() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const service = useMemo(() => {
    const url = getFeatureUrl('chatServiceUrl') || 'http://localhost:8002';
    return new AgentService(url);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [blocks]);

  // Helpers to mutate the block list immutably
  const appendText = useCallback((text: string) => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.kind === 'assistant' && last.open) {
        const updated = { ...last, text: last.text + text };
        return [...prev.slice(0, -1), updated];
      }
      return [...prev, { kind: 'assistant', id: uid(), text, open: true }];
    });
  }, []);

  const closeAssistant = useCallback(() => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.kind === 'assistant' && last.open) {
        return [...prev.slice(0, -1), { ...last, open: false }];
      }
      return prev;
    });
  }, []);

  const handleEvent = useCallback(
    (ev: AgentEvent) => {
      switch (ev.type) {
        case 'session':
          sessionRef.current = ev.session_id;
          break;
        case 'text':
          appendText(ev.text);
          break;
        case 'tool_call':
          closeAssistant();
          setBlocks((prev) => [
            ...prev,
            { kind: 'tool', id: uid(), name: ev.name, status: 'running' },
          ]);
          break;
        case 'tool_result':
          setBlocks((prev) => {
            // Update the most recent running tool block with this name
            for (let i = prev.length - 1; i >= 0; i--) {
              const b = prev[i];
              if (b.kind === 'tool' && b.name === ev.name && b.status === 'running') {
                const updated: Block = {
                  ...b,
                  status: 'done',
                  summary: summarizeTool(ev.name, ev.result),
                };
                return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
              }
            }
            return prev;
          });
          break;
        case 'batch_job':
          closeAssistant();
          setBlocks((prev) => [
            ...prev,
            {
              kind: 'batch',
              id: uid(),
              jobId: ev.job_id,
              total: ev.total,
              model: ev.model,
              prompt: ev.prompt,
              status: 'running',
              pct: 0,
            },
          ]);
          break;
        case 'batch_progress':
          setBlocks((prev) => {
            for (let i = prev.length - 1; i >= 0; i--) {
              const b = prev[i];
              if (b.kind === 'batch' && b.jobId === ev.job_id) {
                const updated: Block = {
                  ...b,
                  status: ev.status || b.status,
                  pct: typeof ev.progress_percentage === 'number' ? ev.progress_percentage : b.pct,
                  success: ev.success ?? b.success,
                  failed: ev.failed ?? b.failed,
                  total: ev.total ?? b.total,
                };
                return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
              }
            }
            return prev;
          });
          break;
        case 'error':
          closeAssistant();
          setBlocks((prev) => [...prev, { kind: 'error', id: uid(), text: ev.error }]);
          break;
        case 'done':
          closeAssistant();
          break;
      }
    },
    [appendText, closeAssistant]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput('');
      setBusy(true);
      setBlocks((prev) => [...prev, { kind: 'user', id: uid(), text: trimmed }]);
      try {
        await service.streamMessage(sessionRef.current, trimmed, handleEvent);
      } catch (e) {
        setBlocks((prev) => [
          ...prev,
          { kind: 'error', id: uid(), text: e instanceof Error ? e.message : String(e) },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, service, handleEvent]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {blocks.length === 0 && (
            <div className="mt-10 text-center text-zinc-500">
              <Bot className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
              <p className="text-sm">
                Ask me to run batch segmentation. For example:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-full border border-zinc-700/70 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-500/60 hover:text-cyan-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {blocks.map((b) => (
            <BlockView key={b.id} block={b} />
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working…
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Message the agent…  (e.g. run liver segmentation with biomedparse on patients 1-5)"
            className="max-h-40 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500/60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2">
          <div className="rounded-2xl rounded-tr-sm bg-cyan-600/90 px-4 py-2.5 text-sm text-white">
            {block.text}
          </div>
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    );
  }

  if (block.kind === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[90%] items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
            <Bot className="h-4 w-4" />
          </div>
          <div className="prose prose-invert prose-sm max-w-none rounded-2xl rounded-tl-sm bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text || '…'}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (block.kind === 'tool') {
    return (
      <div className="ml-9 flex items-center gap-2 text-xs">
        {block.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
        ) : block.summary?.startsWith('Error') ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        )}
        <span className="inline-flex items-center gap-1 text-zinc-400">
          <Wrench className="h-3 w-3" />
          <code className="text-zinc-300">{block.name}</code>
          {block.summary && <span className="text-zinc-500">— {block.summary}</span>}
        </span>
      </div>
    );
  }

  if (block.kind === 'batch') {
    const done = block.status === 'completed' || block.status === 'failed' || block.status === 'cancelled';
    return (
      <div className="ml-9 rounded-xl border border-zinc-700/70 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Activity className="h-4 w-4 text-cyan-400" />
            Batch job
            {block.prompt && (
              <span className="text-zinc-500">
                · {block.model || 'model'} · “{block.prompt}”
              </span>
            )}
          </span>
          <span className="text-xs uppercase tracking-wide text-zinc-400">{block.status}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all ${
              block.status === 'failed' ? 'bg-red-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.max(2, Math.min(100, block.pct))}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {Math.round(block.pct)}%
            {typeof block.total === 'number' ? ` of ${block.total}` : ''}
          </span>
          <span className="flex gap-3">
            {typeof block.success === 'number' && (
              <span className="text-emerald-400">✓ {block.success}</span>
            )}
            {typeof block.failed === 'number' && block.failed > 0 && (
              <span className="text-red-400">✕ {block.failed}</span>
            )}
          </span>
        </div>
        {done && block.status === 'completed' && (
          <p className="mt-2 text-xs text-zinc-500">
            Done. Ask me to save the results to PACS, then open a study in the Viewer to refine.
          </p>
        )}
      </div>
    );
  }

  // error
  return (
    <div className="ml-9 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{block.text}</span>
    </div>
  );
}

export default AgentChat;
