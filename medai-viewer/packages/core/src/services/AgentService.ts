/**
 * AgentService
 *
 * Client for the MedAI Agent — a Claude tool-use harness that orchestrates
 * batch segmentation workflows from natural language. Talks to the agent
 * endpoints on the chat service (mounted at /chat/agent), streaming Server-Sent
 * Events for one conversational turn.
 *
 * This is intentionally separate from ChatService (the RAG Q&A assistant): the
 * agent protocol carries typed tool-call / batch-progress events, not just text.
 */

/** Discrete events streamed during one agent turn. */
export type AgentEvent =
  | { type: 'session'; session_id: string }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: Record<string, unknown> }
  | {
      type: 'batch_job';
      job_id: string;
      total?: number;
      model?: string;
      prompt?: string;
    }
  | {
      type: 'batch_progress';
      job_id: string;
      status?: string;
      progress_percentage?: number;
      success?: number;
      failed?: number;
      total?: number;
      error?: string;
    }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface AgentHealth {
  status: string;
  configured: boolean;
  model: string;
  sse_available: boolean;
}

export class AgentService {
  private baseUrl: string;

  constructor(serverUrl: string) {
    const normalized = serverUrl.replace(/\/$/, '');
    this.baseUrl = `${normalized}/chat/agent`;
  }

  /** Create a new agent session; returns the session ID. */
  async createSession(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to create agent session: ${res.status}`);
    }
    const data = await res.json();
    return data.session_id;
  }

  /** Check whether the agent backend is configured (ANTHROPIC_API_KEY present). */
  async health(): Promise<AgentHealth | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) return null;
      return (await res.json()) as AgentHealth;
    } catch {
      return null;
    }
  }

  /**
   * Send one message and stream the agent's turn.
   *
   * @param sessionId  existing session id (or undefined to let the server create one)
   * @param message    the user's message
   * @param onEvent    called for every parsed event (including the initial `session`)
   * @param signal     optional AbortSignal to cancel the stream
   */
  async streamMessage(
    sessionId: string | undefined,
    message: string,
    onEvent: (event: AgentEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Agent request failed: ${res.status} ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. sse-starlette uses CRLF by
        // default, so match \n\n or \r\n\r\n.
        const boundary = /\r?\n\r?\n/;
        let match: RegExpMatchArray | null;
        while ((match = boundary.exec(buffer)) !== null) {
          const end = match.index! + match[0].length;
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(end);
          const event = parseSseFrame(frame);
          if (event) onEvent(event);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/** Parse one SSE frame ("event: <name>\ndata: <json>") into an AgentEvent. */
function parseSseFrame(frame: string): AgentEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join('\n');
  if (dataStr === '[DONE]') return { type: 'done' };

  try {
    const payload = JSON.parse(dataStr);
    // Backend sets both the SSE event name and a `type` field; prefer `type`.
    const type = (payload.type as string) || eventName;
    return { ...payload, type } as AgentEvent;
  } catch {
    return null;
  }
}
