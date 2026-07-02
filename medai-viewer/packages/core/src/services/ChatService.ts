/**
 * Chat Service
 * API client for MedAI Chat service with RAG-powered responses.
 */

import type { ChatSource, ChatMessage } from '../stores/chatStore';

/**
 * Request payload for chat API
 */
export interface ChatRequest {
  sessionId?: string;
  message: string;
  includeSources?: boolean;
  stream?: boolean;
}

/**
 * Response from chat API
 */
export interface ChatResponse {
  sessionId: string;
  message: string;
  sources: ChatSource[];
  caseContextUsed: boolean;
}

/**
 * Streaming chunk from chat API
 */
export interface ChatStreamChunk {
  type: 'content' | 'sources' | 'done' | 'error';
  content?: string;
  sources?: ChatSource[];
  error?: string;
}

/**
 * Evidence request parameters
 */
export interface EvidenceRequest {
  finding: string;
  modality?: string;
  maxResults?: number;
}

/**
 * Session link request
 */
export interface SessionLinkRequest {
  chatSessionId: string;
  viewerSessionId: string;
}

/**
 * Chat Service class for communicating with the MedAI chat backend
 */
export class ChatService {
  private baseUrl: string;

  constructor(serverUrl: string) {
    // Normalize URL and append chat path
    const normalizedUrl = serverUrl.replace(/\/$/, '');
    this.baseUrl = `${normalizedUrl}/chat`;
  }

  /**
   * Create a new chat session
   * @returns Session ID
   */
  async createSession(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }

    const data = await response.json();
    return data.sessionId;
  }

  /**
   * Link a chat session to a viewer session for case context
   */
  async linkSession(chatSessionId: string, viewerSessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/session/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_session_id: chatSessionId,
        viewer_session_id: viewerSessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to link session: ${response.status}`);
    }
  }

  /**
   * Send a chat message and get a response
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: request.sessionId,
        message: request.message,
        include_sources: request.includeSources ?? true,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return {
      sessionId: data.session_id,
      message: data.message,
      sources: this.transformSources(data.sources || []),
      caseContextUsed: data.case_context_used ?? false,
    };
  }

  /**
   * Send a chat message and stream the response
   */
  async chatStream(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onSources?: (sources: ChatSource[]) => void
  ): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: request.sessionId,
        message: request.message,
        include_sources: request.includeSources ?? true,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat stream failed: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let fullMessage = '';
    let sources: ChatSource[] = [];
    let sessionId = request.sessionId || '';
    let caseContextUsed = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') continue;

            try {
              const chunk: ChatStreamChunk = JSON.parse(data);

              switch (chunk.type) {
                case 'content':
                  if (chunk.content) {
                    fullMessage += chunk.content;
                    onChunk(chunk.content);
                  }
                  break;
                case 'sources':
                  if (chunk.sources) {
                    sources = this.transformSources(chunk.sources);
                    onSources?.(sources);
                  }
                  break;
                case 'error':
                  throw new Error(chunk.error || 'Stream error');
              }
            } catch (e) {
              // Skip invalid JSON lines (might be partial)
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      sessionId,
      message: fullMessage,
      sources,
      caseContextUsed,
    };
  }

  /**
   * Fetch evidence for a specific finding
   */
  async fetchEvidence(finding: string, modality?: string): Promise<ChatSource[]> {
    const params = new URLSearchParams({ finding });
    if (modality) {
      params.append('modality', modality);
    }

    const response = await fetch(`${this.baseUrl}/evidence?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch evidence: ${response.status}`);
    }

    const data = await response.json();
    return this.transformSources(data.sources || []);
  }

  /**
   * Get chat history for a session
   */
  async getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get session history: ${response.status}`);
    }

    const data = await response.json();

    return (data.messages || []).map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      sources: msg.sources ? this.transformSources(msg.sources) : undefined,
      hasContext: msg.has_context,
      timestamp: new Date(msg.timestamp),
    }));
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Transform API sources to ChatSource format
   */
  private transformSources(apiSources: any[]): ChatSource[] {
    return apiSources.map((source) => ({
      type: source.type || 'guideline',
      title: source.title || 'Unknown Source',
      authors: source.authors,
      url: source.url,
      excerpt: source.excerpt || source.snippet,
      relevanceScore: source.relevance_score ?? source.score,
    }));
  }
}
