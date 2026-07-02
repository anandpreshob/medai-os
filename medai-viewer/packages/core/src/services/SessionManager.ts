/**
 * SessionManager - Client-side session tracking for MONAI Label inference
 *
 * Tracks which images have been initialized on the server to avoid re-sending
 * full image data for every prompt. Uses the server's nninter parameter:
 * - "init": First request with image, server caches it
 * - "sam3": Subsequent requests using cached image, only prompts needed
 * - "reset": Clear server cache for this session
 */

import { LoadedImage } from '../loaders/types';

export interface SessionState {
  imageHash: string;           // Hash identifying the initialized image
  isInitialized: boolean;      // Whether session was created for this image
  model: string;               // Model that was initialized with
  initTime: number;            // Timestamp of initialization
  serverSessionId?: string;    // Server-side session ID from /session/ API
}

/**
 * Compute a fast hash for an image based on dimensions and pixel samples
 * Used to detect when the loaded image has changed
 */
export function computeImageHash(image: LoadedImage): string {
  const { metadata, pixelData } = image;
  const { width, height, depth } = metadata;

  // Sample size for hashing (use first and last chunks)
  const sampleSize = Math.min(1024, pixelData.byteLength);
  const uint8View = new Uint8Array(pixelData);

  // Simple hash combining dimensions + first/last byte samples
  let hash = 0;

  // Include dimensions in hash
  hash = (hash * 31 + width) >>> 0;
  hash = (hash * 31 + height) >>> 0;
  hash = (hash * 31 + depth) >>> 0;

  // Sample from beginning
  for (let i = 0; i < sampleSize && i < uint8View.length; i++) {
    hash = (hash * 31 + uint8View[i]) >>> 0;
  }

  // Sample from end
  const startFromEnd = Math.max(0, uint8View.length - sampleSize);
  for (let i = startFromEnd; i < uint8View.length; i++) {
    hash = (hash * 31 + uint8View[i]) >>> 0;
  }

  // Include byte length for additional uniqueness
  hash = (hash * 31 + pixelData.byteLength) >>> 0;

  return `${width}x${height}x${depth}-${hash.toString(16)}`;
}

/**
 * SessionManager class for tracking server-side image cache state
 */
export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();

  // Session timeout (30 minutes by default)
  private sessionTimeoutMs: number;

  constructor(sessionTimeoutMs: number = 30 * 60 * 1000) {
    this.sessionTimeoutMs = sessionTimeoutMs;
  }

  /**
   * Check if an image is initialized for a specific model
   */
  isInitialized(imageHash: string, model: string): boolean {
    const key = this.getSessionKey(imageHash, model);
    const session = this.sessions.get(key);

    if (!session || !session.isInitialized) {
      return false;
    }

    // Check if session has expired
    const now = Date.now();
    if (now - session.initTime > this.sessionTimeoutMs) {
      this.sessions.delete(key);
      console.log('[SessionManager] Session expired for', key);
      return false;
    }

    return true;
  }

  /**
   * Mark an image as initialized for a model
   */
  markInitialized(imageHash: string, model: string, serverSessionId?: string): void {
    const key = this.getSessionKey(imageHash, model);
    this.sessions.set(key, {
      imageHash,
      model,
      isInitialized: true,
      initTime: Date.now(),
      serverSessionId,
    });
    console.log('[SessionManager] Marked initialized:', key, serverSessionId ? `sessionId=${serverSessionId}` : '');
  }

  /**
   * Get the server session ID for an image/model combination
   */
  getServerSessionId(imageHash: string, model: string): string | undefined {
    const key = this.getSessionKey(imageHash, model);
    const session = this.sessions.get(key);
    return session?.serverSessionId;
  }

  /**
   * Clear session for a specific image/model combination
   */
  clearSession(imageHash: string, model: string): void {
    const key = this.getSessionKey(imageHash, model);
    this.sessions.delete(key);
    console.log('[SessionManager] Cleared session:', key);
  }

  /**
   * Clear all sessions (e.g., on server disconnect)
   */
  clearAllSessions(): void {
    this.sessions.clear();
    console.log('[SessionManager] Cleared all sessions');
  }

  /**
   * Get the nninter mode to use based on session state
   * Returns "init" if not initialized, "sam3" if already initialized
   */
  getNninterMode(imageHash: string, model: string, forceInit: boolean = false): 'init' | 'sam3' {
    if (forceInit) {
      return 'init';
    }
    return this.isInitialized(imageHash, model) ? 'sam3' : 'init';
  }

  /**
   * Get session state for debugging
   */
  getSession(imageHash: string, model: string): SessionState | undefined {
    return this.sessions.get(this.getSessionKey(imageHash, model));
  }

  /**
   * Get all active sessions (for debugging)
   */
  getAllSessions(): Map<string, SessionState> {
    return new Map(this.sessions);
  }

  private getSessionKey(imageHash: string, model: string): string {
    return `${model}:${imageHash}`;
  }
}

// Global singleton instance
let globalSessionManager: SessionManager | null = null;

/**
 * Get the global SessionManager instance
 */
export function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager();
  }
  return globalSessionManager;
}

/**
 * Reset the global SessionManager (useful for testing)
 */
export function resetSessionManager(): void {
  if (globalSessionManager) {
    globalSessionManager.clearAllSessions();
  }
  globalSessionManager = null;
}

export default SessionManager;
