// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionManager,
  computeImageHash,
  getSessionManager,
  resetSessionManager,
} from '../SessionManager';
import type { LoadedImage } from '../../loaders/types';

// Mock LoadedImage for testing
function createMockImage(width: number, height: number, depth: number, fillValue = 100): LoadedImage {
  const pixelData = new ArrayBuffer(width * height * depth * 2); // uint16
  const view = new Uint16Array(pixelData);
  view.fill(fillValue);

  return {
    imageId: 'test-image-1',
    pixelData,
    metadata: {
      width,
      height,
      depth,
      spacingX: 1,
      spacingY: 1,
      spacingZ: 1,
      originX: 0,
      originY: 0,
      originZ: 0,
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      dataType: 'uint16',
      format: 'nifti',
      dimensionality: '3D',
    },
  };
}

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  describe('isInitialized', () => {
    it('should return false for non-initialized session', () => {
      expect(sessionManager.isInitialized('image-hash-1', 'nninteractive')).toBe(false);
    });

    it('should return true after marking initialized', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      expect(sessionManager.isInitialized('image-hash-1', 'nninteractive')).toBe(true);
    });

    it('should track sessions per model', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      expect(sessionManager.isInitialized('image-hash-1', 'nninteractive')).toBe(true);
      expect(sessionManager.isInitialized('image-hash-1', 'sam3')).toBe(false);
    });

    it('should track sessions per image', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      expect(sessionManager.isInitialized('image-hash-1', 'nninteractive')).toBe(true);
      expect(sessionManager.isInitialized('image-hash-2', 'nninteractive')).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should clear specific session', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      sessionManager.markInitialized('image-hash-2', 'nninteractive');

      sessionManager.clearSession('image-hash-1', 'nninteractive');

      expect(sessionManager.isInitialized('image-hash-1', 'nninteractive')).toBe(false);
      expect(sessionManager.isInitialized('image-hash-2', 'nninteractive')).toBe(true);
    });
  });

  describe('clearAllSessions', () => {
    it('should clear all sessions', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      sessionManager.markInitialized('image-hash-2', 'sam3');

      sessionManager.clearAllSessions();

      expect(sessionManager.isInitialized('image-hash-1', 'nninteractive')).toBe(false);
      expect(sessionManager.isInitialized('image-hash-2', 'sam3')).toBe(false);
    });
  });

  describe('getNninterMode', () => {
    it('should return "init" for non-initialized session', () => {
      expect(sessionManager.getNninterMode('image-hash-1', 'nninteractive')).toBe('init');
    });

    it('should return "sam3" for initialized session', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      expect(sessionManager.getNninterMode('image-hash-1', 'nninteractive')).toBe('sam3');
    });

    it('should return "init" when forceInit is true', () => {
      sessionManager.markInitialized('image-hash-1', 'nninteractive');
      expect(sessionManager.getNninterMode('image-hash-1', 'nninteractive', true)).toBe('init');
    });
  });

  describe('session timeout', () => {
    it('should expire sessions after timeout', async () => {
      // Create manager with 100ms timeout for testing
      const shortTimeoutManager = new SessionManager(100);
      shortTimeoutManager.markInitialized('image-hash-1', 'nninteractive');

      expect(shortTimeoutManager.isInitialized('image-hash-1', 'nninteractive')).toBe(true);

      // Wait for session to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(shortTimeoutManager.isInitialized('image-hash-1', 'nninteractive')).toBe(false);
    });
  });
});

describe('computeImageHash', () => {
  it('should generate consistent hash for same image', () => {
    const image = createMockImage(64, 64, 32);
    const hash1 = computeImageHash(image);
    const hash2 = computeImageHash(image);
    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different dimensions', () => {
    const image1 = createMockImage(64, 64, 32);
    const image2 = createMockImage(128, 128, 32);
    const hash1 = computeImageHash(image1);
    const hash2 = computeImageHash(image2);
    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different pixel data', () => {
    const image1 = createMockImage(64, 64, 32, 100);
    const image2 = createMockImage(64, 64, 32, 200);
    const hash1 = computeImageHash(image1);
    const hash2 = computeImageHash(image2);
    expect(hash1).not.toBe(hash2);
  });

  it('should include dimensions in hash format', () => {
    const image = createMockImage(64, 64, 32);
    const hash = computeImageHash(image);
    expect(hash).toContain('64x64x32');
  });
});

describe('getSessionManager (singleton)', () => {
  beforeEach(() => {
    resetSessionManager();
  });

  it('should return same instance on multiple calls', () => {
    const manager1 = getSessionManager();
    const manager2 = getSessionManager();
    expect(manager1).toBe(manager2);
  });

  it('should reset singleton on resetSessionManager', () => {
    const manager1 = getSessionManager();
    manager1.markInitialized('test', 'model');

    resetSessionManager();

    const manager2 = getSessionManager();
    expect(manager2.isInitialized('test', 'model')).toBe(false);
  });
});
