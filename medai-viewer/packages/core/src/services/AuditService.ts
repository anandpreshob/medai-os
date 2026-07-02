/**
 * Audit Service - Client for audit logging
 *
 * Provides client-side interface for sending audit events to the server
 * and querying audit logs.
 */

import { isFeatureEnabled } from '../features/registry';

// ============================================================================
// Types
// ============================================================================

/**
 * Audit event types
 */
export type AuditEventType =
  // Segmentation events
  | 'segmentation.created'
  | 'segmentation.modified'
  | 'segmentation.deleted'
  | 'segmentation.finalized'
  | 'segmentation.unfinalzed'
  // Export events
  | 'export.dicomseg'
  | 'export.json'
  | 'export.csv'
  | 'export.session_artifact'
  // Import events
  | 'import.dicomseg'
  | 'import.session_artifact'
  // Inference events
  | 'inference.started'
  | 'inference.completed'
  | 'inference.failed'
  // Review events
  | 'review.status_changed'
  | 'review.signed'
  // Session events
  | 'session.created'
  | 'session.loaded'
  | 'session.exported'
  // Measurement events
  | 'measurement.created'
  | 'measurement.modified'
  | 'measurement.deleted'
  // Access events
  | 'access.study_opened'
  | 'access.series_opened'
  | 'access.report_generated';

/**
 * Audit event severity
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Audit event to be logged
 */
export interface AuditEvent {
  /** Event type */
  eventType: AuditEventType;

  /** Event severity */
  severity: AuditSeverity;

  /** ISO timestamp */
  timestamp: string;

  /** Username (if authenticated) */
  username?: string;

  /** Session ID */
  sessionId?: string;

  /** Patient ID (anonymized or hashed) */
  patientId?: string;

  /** Study Instance UID */
  studyUID?: string;

  /** Series Instance UID */
  seriesUID?: string;

  /** Segmentation ID */
  segmentationId?: string;

  /** Model name (for inference events) */
  modelName?: string;

  /** Event-specific details */
  details?: Record<string, unknown>;

  /** Client IP address (filled by server) */
  clientIp?: string;

  /** User agent */
  userAgent?: string;
}

/**
 * Audit log query parameters
 */
export interface AuditLogQuery {
  /** Filter by event types */
  eventTypes?: AuditEventType[];

  /** Filter by username */
  username?: string;

  /** Filter by patient ID */
  patientId?: string;

  /** Filter by study UID */
  studyUID?: string;

  /** Filter by segmentation ID */
  segmentationId?: string;

  /** Start time (ISO timestamp) */
  startTime?: string;

  /** End time (ISO timestamp) */
  endTime?: string;

  /** Severity levels to include */
  severities?: AuditSeverity[];

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit log entry from server
 */
export interface AuditLogEntry extends AuditEvent {
  /** Server-assigned unique ID */
  id: string;

  /** Server receive timestamp */
  serverTimestamp: string;
}

/**
 * Audit log query result
 */
export interface AuditLogQueryResult {
  /** Log entries */
  entries: AuditLogEntry[];

  /** Total count (for pagination) */
  totalCount: number;

  /** Query metadata */
  query: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// AuditService Class
// ============================================================================

export class AuditService {
  private readonly serverUrl: string;
  private currentUser?: string;
  private sessionId?: string;
  private readonly queue: AuditEvent[] = [];
  private readonly flushInterval: number = 5000; // 5 seconds
  private flushTimer?: ReturnType<typeof setInterval>;
  private readonly maxQueueSize: number = 100;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.startFlushTimer();
  }

  /**
   * Set current user for audit events
   */
  setCurrentUser(username: string | undefined): void {
    this.currentUser = username;
  }

  /**
   * Set session ID for audit events
   */
  setSessionId(sessionId: string | undefined): void {
    this.sessionId = sessionId;
  }

  /**
   * Log an audit event
   */
  log(
    eventType: AuditEventType,
    severity: AuditSeverity = 'info',
    details?: Record<string, unknown>,
    context?: Partial<Pick<AuditEvent, 'patientId' | 'studyUID' | 'seriesUID' | 'segmentationId' | 'modelName'>>
  ): void {
    if (!isFeatureEnabled('audit')) {
      return; // audit feature disabled - events are dropped silently
    }
    const event: AuditEvent = {
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      username: this.currentUser,
      sessionId: this.sessionId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      details,
      ...context,
    };

    this.queue.push(event);

    // Flush immediately if queue is large or event is critical
    if (this.queue.length >= this.maxQueueSize || severity === 'critical') {
      this.flush();
    }

    console.log('[AuditService] Event queued:', eventType, severity);
  }

  /**
   * Log segmentation created event
   */
  logSegmentationCreated(
    segmentationId: string,
    modelName?: string,
    context?: { patientId?: string; studyUID?: string }
  ): void {
    this.log('segmentation.created', 'info', { modelName }, {
      segmentationId,
      modelName,
      ...context,
    });
  }

  /**
   * Log segmentation modified event
   */
  logSegmentationModified(
    segmentationId: string,
    editType: string,
    context?: { patientId?: string; studyUID?: string }
  ): void {
    this.log('segmentation.modified', 'info', { editType }, {
      segmentationId,
      ...context,
    });
  }

  /**
   * Log segmentation finalized event
   */
  logSegmentationFinalized(
    segmentationId: string,
    reviewerNotes?: string,
    context?: { patientId?: string; studyUID?: string }
  ): void {
    this.log('segmentation.finalized', 'info', { reviewerNotes }, {
      segmentationId,
      ...context,
    });
  }

  /**
   * Log export event
   */
  logExport(
    exportType: 'dicomseg' | 'json' | 'csv' | 'session_artifact',
    segmentationId?: string,
    context?: { patientId?: string; studyUID?: string }
  ): void {
    const eventType = `export.${exportType}` as AuditEventType;
    this.log(eventType, 'info', undefined, {
      segmentationId,
      ...context,
    });
  }

  /**
   * Log inference event
   */
  logInference(
    status: 'started' | 'completed' | 'failed',
    modelName: string,
    durationMs?: number,
    error?: string,
    context?: { patientId?: string; studyUID?: string }
  ): void {
    const eventType = `inference.${status}` as AuditEventType;
    const severity: AuditSeverity = status === 'failed' ? 'error' : 'info';
    this.log(eventType, severity, { durationMs, error }, {
      modelName,
      ...context,
    });
  }

  /**
   * Log study access event
   */
  logStudyAccess(
    studyUID: string,
    patientId?: string
  ): void {
    this.log('access.study_opened', 'info', undefined, {
      studyUID,
      patientId,
    });
  }

  /**
   * Flush queued events to server
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const events = [...this.queue];
    this.queue.length = 0;

    try {
      const response = await fetch(`${this.serverUrl}/audit/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        console.error('[AuditService] Failed to flush events:', response.status);
        // Put events back in queue
        this.queue.unshift(...events);
      } else {
        console.log('[AuditService] Flushed', events.length, 'events');
      }
    } catch (error) {
      console.error('[AuditService] Flush error:', error);
      // Put events back in queue
      this.queue.unshift(...events);
    }
  }

  /**
   * Query audit logs
   */
  async query(params: AuditLogQuery): Promise<AuditLogQueryResult> {
    const queryParams = new URLSearchParams();

    if (params.eventTypes?.length) {
      queryParams.set('event_types', params.eventTypes.join(','));
    }
    if (params.username) {
      queryParams.set('username', params.username);
    }
    if (params.patientId) {
      queryParams.set('patient_id', params.patientId);
    }
    if (params.studyUID) {
      queryParams.set('study_uid', params.studyUID);
    }
    if (params.segmentationId) {
      queryParams.set('segmentation_id', params.segmentationId);
    }
    if (params.startTime) {
      queryParams.set('start_time', params.startTime);
    }
    if (params.endTime) {
      queryParams.set('end_time', params.endTime);
    }
    if (params.severities?.length) {
      queryParams.set('severities', params.severities.join(','));
    }
    if (params.limit !== undefined) {
      queryParams.set('limit', params.limit.toString());
    }
    if (params.offset !== undefined) {
      queryParams.set('offset', params.offset.toString());
    }
    if (params.sortOrder) {
      queryParams.set('sort_order', params.sortOrder);
    }

    try {
      const response = await fetch(`${this.serverUrl}/audit/query?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[AuditService] Query error:', error);
      return {
        entries: [],
        totalCount: 0,
        query: {
          limit: params.limit || 100,
          offset: params.offset || 0,
          hasMore: false,
        },
      };
    }
  }

  /**
   * Get audit trail for a specific segmentation
   */
  async getSegmentationAuditTrail(segmentationId: string): Promise<AuditLogEntry[]> {
    const result = await this.query({
      segmentationId,
      sortOrder: 'asc',
      limit: 1000,
    });
    return result.entries;
  }

  /**
   * Get audit trail for a study
   */
  async getStudyAuditTrail(studyUID: string): Promise<AuditLogEntry[]> {
    const result = await this.query({
      studyUID,
      sortOrder: 'asc',
      limit: 1000,
    });
    return result.entries;
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushInterval);
  }

  /**
   * Stop flush timer and flush remaining events
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
    console.log('[AuditService] Shutdown complete');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let auditServiceInstance: AuditService | null = null;

/**
 * Get or create audit service instance
 */
export function getAuditService(serverUrl?: string): AuditService {
  if (!auditServiceInstance && serverUrl) {
    auditServiceInstance = new AuditService(serverUrl);
  }
  if (!auditServiceInstance) {
    throw new Error('[AuditService] Service not initialized. Call with serverUrl first.');
  }
  return auditServiceInstance;
}

/**
 * Initialize audit service
 */
export function initAuditService(serverUrl: string): AuditService {
  auditServiceInstance = new AuditService(serverUrl);
  return auditServiceInstance;
}

export default AuditService;
