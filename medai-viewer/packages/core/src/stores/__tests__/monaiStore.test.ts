import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMonaiStore, ConnectionStatus } from '../monaiStore';
import { MonaiLabelClient } from '../../services/MonaiLabelClient';

// Mock MonaiLabelClient
vi.mock('../../services/MonaiLabelClient', () => ({
  MonaiLabelClient: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    getModelList: vi.fn(),
    infer: vi.fn(),
  })),
}));

describe('monaiStore', () => {
  const defaultServerUrl = 'http://localhost:8002';
  const mockServerInfo = {
    name: 'MONAI Label',
    version: '0.8.0',
    models: {
      sam3: { type: 'segmentation', labels: ['organ'], description: 'SAM3' },
      nninteractive: { type: 'deepedit', labels: ['spleen'], description: 'NN' },
    },
  };

  beforeEach(() => {
    // Reset store to initial state before each test
    useMonaiStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with disconnected status', () => {
      const state = useMonaiStore.getState();
      expect(state.connectionStatus).toBe('disconnected');
    });

    it('should have empty server URL by default', () => {
      const state = useMonaiStore.getState();
      expect(state.serverUrl).toBe('');
    });

    it('should have null serverInfo', () => {
      const state = useMonaiStore.getState();
      expect(state.serverInfo).toBeNull();
    });

    it('should have empty models array', () => {
      const state = useMonaiStore.getState();
      expect(state.models).toEqual([]);
    });

    it('should have null activeModel', () => {
      const state = useMonaiStore.getState();
      expect(state.activeModel).toBeNull();
    });

    it('should not be inferring', () => {
      const state = useMonaiStore.getState();
      expect(state.isInferring).toBe(false);
    });
  });

  describe('setServerUrl()', () => {
    it('should update server URL', () => {
      useMonaiStore.getState().setServerUrl(defaultServerUrl);
      expect(useMonaiStore.getState().serverUrl).toBe(defaultServerUrl);
    });

    it('should trim whitespace from URL', () => {
      useMonaiStore.getState().setServerUrl('  http://localhost:8002  ');
      expect(useMonaiStore.getState().serverUrl).toBe('http://localhost:8002');
    });
  });

  describe('connect()', () => {
    it('should set status to connecting during connection', async () => {
      const mockClient = {
        info: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      // Start connection but don't await
      useMonaiStore.getState().connect(defaultServerUrl);

      // Check status is connecting
      expect(useMonaiStore.getState().connectionStatus).toBe('connecting');
    });

    it('should set status to connected on successful connection', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      expect(useMonaiStore.getState().connectionStatus).toBe('connected');
    });

    it('should populate serverInfo on successful connection', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      expect(useMonaiStore.getState().serverInfo).toEqual(mockServerInfo);
    });

    it('should populate models from server info', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      const models = useMonaiStore.getState().models;
      expect(models.length).toBe(2);
      expect(models.map((m) => m.name)).toContain('sam3');
      expect(models.map((m) => m.name)).toContain('nninteractive');
    });

    it('should set first model as active by default', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      expect(useMonaiStore.getState().activeModel).not.toBeNull();
    });

    it('should set status to error on connection failure', async () => {
      const mockClient = {
        info: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      expect(useMonaiStore.getState().connectionStatus).toBe('error');
    });

    it('should store error message on failure', async () => {
      const mockClient = {
        info: vi.fn().mockRejectedValue(new Error('Network error')),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      expect(useMonaiStore.getState().error).toContain('Network error');
    });

    it('should store client instance', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);

      await useMonaiStore.getState().connect(defaultServerUrl);

      expect(useMonaiStore.getState().client).toBe(mockClient);
    });
  });

  describe('disconnect()', () => {
    it('should set status to disconnected', async () => {
      // First connect
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
      await useMonaiStore.getState().connect(defaultServerUrl);

      // Then disconnect
      useMonaiStore.getState().disconnect();

      expect(useMonaiStore.getState().connectionStatus).toBe('disconnected');
    });

    it('should clear serverInfo', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
      await useMonaiStore.getState().connect(defaultServerUrl);

      useMonaiStore.getState().disconnect();

      expect(useMonaiStore.getState().serverInfo).toBeNull();
    });

    it('should clear models', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
      await useMonaiStore.getState().connect(defaultServerUrl);

      useMonaiStore.getState().disconnect();

      expect(useMonaiStore.getState().models).toEqual([]);
    });

    it('should clear client instance', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
      await useMonaiStore.getState().connect(defaultServerUrl);

      useMonaiStore.getState().disconnect();

      expect(useMonaiStore.getState().client).toBeNull();
    });
  });

  describe('setActiveModel()', () => {
    it('should update active model', async () => {
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
      await useMonaiStore.getState().connect(defaultServerUrl);

      useMonaiStore.getState().setActiveModel('nninteractive');

      expect(useMonaiStore.getState().activeModel).toBe('nninteractive');
    });
  });

  describe('setInferring()', () => {
    it('should update inferring state', () => {
      useMonaiStore.getState().setInferring(true);
      expect(useMonaiStore.getState().isInferring).toBe(true);

      useMonaiStore.getState().setInferring(false);
      expect(useMonaiStore.getState().isInferring).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should reset all state to initial values', async () => {
      // First modify state
      const mockClient = {
        info: vi.fn().mockResolvedValue(mockServerInfo),
      };
      (MonaiLabelClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
      await useMonaiStore.getState().connect(defaultServerUrl);
      useMonaiStore.getState().setInferring(true);

      // Then reset
      useMonaiStore.getState().reset();

      const state = useMonaiStore.getState();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.serverInfo).toBeNull();
      expect(state.models).toEqual([]);
      expect(state.activeModel).toBeNull();
      expect(state.isInferring).toBe(false);
      expect(state.client).toBeNull();
    });
  });
});
