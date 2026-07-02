/**
 * Orthanc Attachment Service
 *
 * Manages custom attachments stored alongside DICOM instances in Orthanc.
 * Used for storing AI detection results, annotations, and other metadata.
 */

export interface AttachmentInfo {
  /** Size of the attachment in bytes */
  size: number;
  /** MD5 hash of the attachment content */
  md5: string;
  /** UUID of the attachment */
  uuid: string;
  /** Content type (if available) */
  contentType?: string;
}

export class OrthancAttachmentService {
  private orthancUrl: string;

  constructor(orthancUrl = '/proxy/orthanc') {
    this.orthancUrl = orthancUrl;
  }

  /**
   * Check if an attachment exists for an instance
   *
   * @param instanceId - Orthanc instance ID
   * @param name - Attachment name (e.g., 'ai-detection')
   * @returns True if attachment exists
   */
  async hasAttachment(instanceId: string, name: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.orthancUrl}/instances/${instanceId}/attachments/${name}`,
        { method: 'HEAD' }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get an attachment from an instance
   *
   * @param instanceId - Orthanc instance ID
   * @param name - Attachment name
   * @returns Parsed attachment data or null if not found
   */
  async getAttachment<T>(instanceId: string, name: string): Promise<T | null> {
    try {
      const response = await fetch(
        `${this.orthancUrl}/instances/${instanceId}/attachments/${name}/data`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get attachment: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn(`[OrthancAttachment] Failed to get attachment ${name}:`, error);
      return null;
    }
  }

  /**
   * Save an attachment to an instance
   *
   * @param instanceId - Orthanc instance ID
   * @param name - Attachment name (e.g., 'ai-detection')
   * @param data - Data to store (will be JSON serialized)
   */
  async saveAttachment<T>(instanceId: string, name: string, data: T): Promise<void> {
    const response = await fetch(
      `${this.orthancUrl}/instances/${instanceId}/attachments/${name}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save attachment: ${response.status} ${errorText}`);
    }
  }

  /**
   * Delete an attachment from an instance
   *
   * @param instanceId - Orthanc instance ID
   * @param name - Attachment name
   */
  async deleteAttachment(instanceId: string, name: string): Promise<void> {
    const response = await fetch(
      `${this.orthancUrl}/instances/${instanceId}/attachments/${name}`,
      { method: 'DELETE' }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete attachment: ${response.status}`);
    }
  }

  /**
   * List all attachments for an instance
   *
   * @param instanceId - Orthanc instance ID
   * @returns Array of attachment names
   */
  async listAttachments(instanceId: string): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.orthancUrl}/instances/${instanceId}/attachments`
      );

      if (!response.ok) {
        throw new Error(`Failed to list attachments: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('[OrthancAttachment] Failed to list attachments:', error);
      return [];
    }
  }

  /**
   * Get attachment info (size, hash, etc.)
   *
   * @param instanceId - Orthanc instance ID
   * @param name - Attachment name
   * @returns Attachment info or null if not found
   */
  async getAttachmentInfo(instanceId: string, name: string): Promise<AttachmentInfo | null> {
    try {
      const response = await fetch(
        `${this.orthancUrl}/instances/${instanceId}/attachments/${name}/info`
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const orthancAttachmentService = new OrthancAttachmentService();
