/**
 * Registration Service
 *
 * Frontend client for image registration endpoints.
 * Handles rigid, affine, and deformable registration between timepoints.
 */

import {
  RegistrationRequest,
  RegistrationResult,
} from '../stores/lesionCorrespondenceTypes';

/**
 * Configuration for the registration service.
 */
export interface RegistrationServiceConfig {
  /** Base URL for the MONAI Label server */
  serverUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Registration types supported by the server.
 */
export type RegistrationType = 'rigid' | 'affine' | 'deformable';

/**
 * Status of a registration job.
 */
export interface RegistrationJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: RegistrationResult;
  error?: string;
}

/**
 * Registration Service for image alignment between timepoints.
 */
export class RegistrationService {
  private readonly serverUrl: string;
  private readonly timeout: number;

  constructor(config: RegistrationServiceConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 120000; // 2 minute default
  }

  /**
   * Perform rigid (6-DOF) registration between two images.
   * Rigid registration preserves distances and angles (rotation + translation only).
   *
   * @param fixedImageId - Reference/fixed image ID (typically baseline)
   * @param movingImageId - Image to be registered (typically follow-up)
   * @param initialTransform - Optional initial transform estimate
   * @returns Registration result with transformation matrix
   */
  async rigidRegistration(
    fixedImageId: string,
    movingImageId: string,
    initialTransform?: number[][]
  ): Promise<RegistrationResult> {
    return this.performRegistration({
      fixedImageId,
      movingImageId,
      registrationType: 'rigid',
      initialTransform,
    });
  }

  /**
   * Perform affine (12-DOF) registration between two images.
   * Affine registration includes scaling and shearing in addition to rotation/translation.
   *
   * @param fixedImageId - Reference/fixed image ID
   * @param movingImageId - Image to be registered
   * @param initialTransform - Optional initial transform estimate
   * @returns Registration result with transformation matrix
   */
  async affineRegistration(
    fixedImageId: string,
    movingImageId: string,
    initialTransform?: number[][]
  ): Promise<RegistrationResult> {
    return this.performRegistration({
      fixedImageId,
      movingImageId,
      registrationType: 'affine',
      initialTransform,
    });
  }

  /**
   * Perform deformable/non-rigid registration (not yet implemented on server).
   * This is a placeholder for future B-spline or demons registration.
   */
  async deformableRegistration(
    fixedImageId: string,
    movingImageId: string
  ): Promise<RegistrationResult> {
    console.warn('[RegistrationService] Deformable registration not yet implemented, falling back to affine');
    return this.affineRegistration(fixedImageId, movingImageId);
  }

  /**
   * Internal method to perform registration request.
   */
  private async performRegistration(request: RegistrationRequest): Promise<RegistrationResult> {
    const url = `${this.serverUrl}/registration/${request.registrationType}`;

    console.log('[RegistrationService] Starting registration:', {
      type: request.registrationType,
      fixedImage: request.fixedImageId,
      movingImage: request.movingImageId,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fixed_image_id: request.fixedImageId,
          moving_image_id: request.movingImageId,
          initial_transform: request.initialTransform,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Registration failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      console.log('[RegistrationService] Registration complete:', {
        success: result.success,
        metrics: result.metrics,
      });

      return {
        success: result.success,
        transformMatrix: result.transform_matrix,
        inverseTransformMatrix: result.inverse_transform_matrix,
        metrics: {
          mutualInformation: result.metrics?.mutual_information,
          mse: result.metrics?.mse,
          ncc: result.metrics?.ncc,
        },
        error: result.error,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[RegistrationService] Registration timeout');
        return {
          success: false,
          transformMatrix: this.identityMatrix(),
          inverseTransformMatrix: this.identityMatrix(),
          metrics: {},
          error: 'Registration timed out',
        };
      }

      console.error('[RegistrationService] Registration error:', error);
      return {
        success: false,
        transformMatrix: this.identityMatrix(),
        inverseTransformMatrix: this.identityMatrix(),
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Start an async registration job (for long-running registrations).
   * Returns a job ID that can be polled for status.
   */
  async startRegistrationJob(
    fixedImageId: string,
    movingImageId: string,
    registrationType: RegistrationType = 'affine'
  ): Promise<string> {
    const url = `${this.serverUrl}/registration/async`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fixed_image_id: fixedImageId,
        moving_image_id: movingImageId,
        registration_type: registrationType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start registration job: ${response.statusText}`);
    }

    const result = await response.json();
    return result.job_id;
  }

  /**
   * Get status of an async registration job.
   */
  async getJobStatus(jobId: string): Promise<RegistrationJobStatus> {
    const url = `${this.serverUrl}/registration/status/${jobId}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    const result = await response.json();

    return {
      jobId: result.job_id,
      status: result.status,
      progress: result.progress,
      result: result.result
        ? {
            success: result.result.success,
            transformMatrix: result.result.transform_matrix,
            inverseTransformMatrix: result.result.inverse_transform_matrix,
            metrics: result.result.metrics || {},
          }
        : undefined,
      error: result.error,
    };
  }

  /**
   * Cancel an async registration job.
   */
  async cancelJob(jobId: string): Promise<void> {
    const url = `${this.serverUrl}/registration/cancel/${jobId}`;

    await fetch(url, { method: 'DELETE' });
  }

  /**
   * Apply a transformation to a point in world coordinates.
   */
  transformPoint(
    point: [number, number, number],
    transformMatrix: number[][]
  ): [number, number, number] {
    const [x, y, z] = point;

    const newX =
      transformMatrix[0][0] * x +
      transformMatrix[0][1] * y +
      transformMatrix[0][2] * z +
      transformMatrix[0][3];
    const newY =
      transformMatrix[1][0] * x +
      transformMatrix[1][1] * y +
      transformMatrix[1][2] * z +
      transformMatrix[1][3];
    const newZ =
      transformMatrix[2][0] * x +
      transformMatrix[2][1] * y +
      transformMatrix[2][2] * z +
      transformMatrix[2][3];

    return [newX, newY, newZ];
  }

  /**
   * Apply transformation to multiple points.
   */
  transformPoints(
    points: [number, number, number][],
    transformMatrix: number[][]
  ): [number, number, number][] {
    return points.map((p) => this.transformPoint(p, transformMatrix));
  }

  /**
   * Compose two transformation matrices.
   */
  composeTransforms(t1: number[][], t2: number[][]): number[][] {
    const result: number[][] = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 1],
    ];

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          result[i][j] += t1[i][k] * t2[k][j];
        }
      }
    }

    return result;
  }

  /**
   * Get identity transformation matrix.
   */
  identityMatrix(): number[][] {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
  }

  /**
   * Validate a transformation matrix.
   */
  isValidTransform(matrix: number[][] | undefined): boolean {
    if (!matrix) return false;
    if (matrix.length !== 4) return false;

    for (const row of matrix) {
      if (row.length !== 4) return false;
      for (const val of row) {
        if (typeof val !== 'number' || isNaN(val)) return false;
      }
    }

    return true;
  }

  /**
   * Calculate the determinant of the rotation part (3x3 upper-left).
   * Should be close to 1 for valid rigid transformations.
   */
  calculateRotationDeterminant(matrix: number[][]): number {
    const a = matrix[0][0];
    const b = matrix[0][1];
    const c = matrix[0][2];
    const d = matrix[1][0];
    const e = matrix[1][1];
    const f = matrix[1][2];
    const g = matrix[2][0];
    const h = matrix[2][1];
    const i = matrix[2][2];

    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }
}

/**
 * Singleton instance factory.
 */
let registrationServiceInstance: RegistrationService | null = null;

export function getRegistrationService(serverUrl?: string): RegistrationService {
  if (!registrationServiceInstance && serverUrl) {
    registrationServiceInstance = new RegistrationService({ serverUrl });
  }

  if (!registrationServiceInstance) {
    throw new Error('RegistrationService not initialized. Provide serverUrl.');
  }

  return registrationServiceInstance;
}

export function initRegistrationService(serverUrl: string): RegistrationService {
  registrationServiceInstance = new RegistrationService({ serverUrl });
  return registrationServiceInstance;
}

export default RegistrationService;
