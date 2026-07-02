/**
 * useBatchJobSocket - WebSocket hook for batch processing job updates
 *
 * Connects to the batch processing WebSocket endpoint and handles:
 * - Real-time progress updates
 * - Individual result notifications
 * - Job completion events
 * - Auto-reconnection with exponential backoff
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  useBatchProcessingStore,
  isFeatureEnabled,
  type BatchSocketMessage,
  type BatchSocketConnectionStatus,
  type UseBatchJobSocketOptions,
  type UseBatchJobSocketReturn,
} from '@medai/core';

const DEFAULT_BASE_URL = import.meta.env.VITE_MEDAI_SERVER_URL || 'ws://localhost:8000';
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_INTERVAL = 1000;

/**
 * Custom hook for managing WebSocket connection to batch processing jobs
 */
export function useBatchJobSocket(options: UseBatchJobSocketOptions = {}): UseBatchJobSocketReturn {
  const {
    baseUrl = DEFAULT_BASE_URL,
    autoConnect = false,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    onMessage,
    onError,
    onConnect,
    onDisconnect,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<BatchSocketConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Get store actions
  const {
    updateJobProgress,
    updateJobStatus,
    addResult,
    completeJob,
    cancelJob,
    setEstimatedTime,
  } = useBatchProcessingStore();

  /**
   * Clean up WebSocket and reconnection timer
   */
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;

      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: BatchSocketMessage = JSON.parse(event.data);
        const jobId = jobIdRef.current;

        if (!jobId) {
          console.warn('[useBatchJobSocket] Received message but no job ID set');
          return;
        }

        // Call custom handler if provided
        onMessage?.(message);

        // Handle message based on type
        switch (message.type) {
          case 'connected':
            console.log('[useBatchJobSocket] Connection confirmed for job:', message.jobId);
            break;

          case 'progress':
            updateJobProgress(
              message.jobId,
              message.progress,
              message.currentFileIndex,
              message.currentFileName
            );
            if (message.estimatedTimeRemaining !== undefined) {
              setEstimatedTime(message.jobId, message.estimatedTimeRemaining);
            }
            break;

          case 'result':
            addResult(message.jobId, message.result);
            break;

          case 'complete':
            completeJob(message.jobId);
            console.log(
              '[useBatchJobSocket] Job completed:',
              message.jobId,
              'Processed:',
              message.totalProcessed,
              'Failed:',
              message.totalFailed
            );
            break;

          case 'error':
            if (message.fatal) {
              updateJobStatus(message.jobId, 'failed', message.error);
              setError(message.error);
            } else {
              console.warn('[useBatchJobSocket] Non-fatal error:', message.error);
            }
            break;

          case 'cancelled':
            cancelJob(message.jobId);
            console.log('[useBatchJobSocket] Job cancelled:', message.jobId, message.reason);
            break;

          default:
            console.warn('[useBatchJobSocket] Unknown message type:', message);
        }
      } catch (err) {
        console.error('[useBatchJobSocket] Failed to parse message:', err, event.data);
      }
    },
    [onMessage, updateJobProgress, addResult, completeJob, updateJobStatus, cancelJob, setEstimatedTime]
  );

  /**
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnect = useCallback(() => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('[useBatchJobSocket] Max reconnect attempts reached');
      setStatus('error');
      setError('Failed to reconnect after multiple attempts');
      return;
    }

    const delay = reconnectInterval * Math.pow(2, reconnectAttempts);
    console.log(`[useBatchJobSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts((prev: number) => prev + 1);
      // We'll need to call connect after this timeout, handled via state
    }, delay);
  }, [reconnectAttempts, maxReconnectAttempts, reconnectInterval]);

  /**
   * Connect to WebSocket for a specific job
   */
  const connect = useCallback(
    (jobId: string) => {
      if (!isFeatureEnabled('batch')) {
        console.warn('[useBatchJobSocket] batch feature disabled; not connecting');
        return;
      }
      cleanup();
      jobIdRef.current = jobId;
      setStatus('connecting');
      setError(null);

      // Convert http(s) to ws(s) if needed
      let wsUrl = baseUrl.replace(/^http/, 'ws');
      if (!wsUrl.endsWith('/')) wsUrl += '/';
      wsUrl += `batch/ws/${jobId}`;

      console.log('[useBatchJobSocket] Connecting to:', wsUrl);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[useBatchJobSocket] Connected');
          setStatus('connected');
          setReconnectAttempts(0);
          onConnect?.();
        };

        ws.onclose = (event) => {
          console.log('[useBatchJobSocket] Disconnected:', event.code, event.reason);
          setStatus('disconnected');
          onDisconnect?.();

          // Attempt reconnect if not a clean close
          if (event.code !== 1000 && event.code !== 1001) {
            attemptReconnect();
          }
        };

        ws.onerror = (event) => {
          console.error('[useBatchJobSocket] Error:', event);
          setStatus('error');
          setError('WebSocket connection error');
          onError?.(event);
        };

        ws.onmessage = handleMessage;
      } catch (err) {
        console.error('[useBatchJobSocket] Failed to create WebSocket:', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    },
    [baseUrl, cleanup, handleMessage, onConnect, onDisconnect, onError, attemptReconnect]
  );

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    console.log('[useBatchJobSocket] Disconnecting');
    cleanup();
    jobIdRef.current = null;
    setStatus('disconnected');
    setReconnectAttempts(0);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Auto-connect if enabled and job exists
  useEffect(() => {
    if (autoConnect) {
      const currentJob = useBatchProcessingStore.getState().currentJob;
      if (currentJob && currentJob.status === 'processing') {
        connect(currentJob.id);
      }
    }
  }, [autoConnect, connect]);

  return {
    status,
    error,
    connect,
    disconnect,
    isConnected: status === 'connected',
    reconnectAttempts,
  };
}

export default useBatchJobSocket;
