/**
 * Batch Job Socket Types
 *
 * Type definitions for WebSocket communication with the batch processing server.
 * The actual React hook implementation is in the viewer app.
 */

import type { BatchResult } from '../stores/batchProcessingStore';

/**
 * WebSocket message types from the server
 */
export type BatchSocketMessageType =
  | 'connected'
  | 'progress'
  | 'result'
  | 'complete'
  | 'error'
  | 'cancelled';

/**
 * Progress update message
 */
export interface BatchProgressMessage {
  type: 'progress';
  jobId: string;
  progress: number;
  currentFileIndex: number;
  currentFileName?: string;
  estimatedTimeRemaining?: number;
}

/**
 * Result message for a single file
 */
export interface BatchResultMessage {
  type: 'result';
  jobId: string;
  result: BatchResult;
}

/**
 * Job completion message
 */
export interface BatchCompleteMessage {
  type: 'complete';
  jobId: string;
  totalProcessed: number;
  totalFailed: number;
  duration: number;
}

/**
 * Error message
 */
export interface BatchErrorMessage {
  type: 'error';
  jobId: string;
  error: string;
  fatal?: boolean;
}

/**
 * Cancellation message
 */
export interface BatchCancelledMessage {
  type: 'cancelled';
  jobId: string;
  reason?: string;
}

/**
 * Connection status message
 */
export interface BatchConnectedMessage {
  type: 'connected';
  jobId: string;
}

export type BatchSocketMessage =
  | BatchProgressMessage
  | BatchResultMessage
  | BatchCompleteMessage
  | BatchErrorMessage
  | BatchCancelledMessage
  | BatchConnectedMessage;

/**
 * WebSocket connection status for batch jobs
 */
export type BatchSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Hook options for useBatchJobSocket
 */
export interface UseBatchJobSocketOptions {
  baseUrl?: string;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  onMessage?: (message: BatchSocketMessage) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Hook return type for useBatchJobSocket
 */
export interface UseBatchJobSocketReturn {
  status: BatchSocketConnectionStatus;
  error: string | null;
  connect: (jobId: string) => void;
  disconnect: () => void;
  isConnected: boolean;
  reconnectAttempts: number;
}
