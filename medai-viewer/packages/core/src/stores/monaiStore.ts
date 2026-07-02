import { create } from 'zustand';
import { MonaiLabelClient, ServerInfo, ModelInfo } from '../services/MonaiLabelClient';
import { isFeatureEnabled } from '../features/registry';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Model {
  name: string;
  type: string;
  labels: string[];
  description: string;
  // TotalSegmentator specific fields
  supportedModalities?: string[];
  ctLabels?: Record<string, number>;
  mrLabels?: Record<string, number>;
}

export interface MonaiState {
  // Connection
  serverUrl: string;
  connectionStatus: ConnectionStatus;
  client: MonaiLabelClient | null;
  error: string | null;

  // Server info
  serverInfo: ServerInfo | null;
  models: Model[];
  activeModel: string | null;

  // Inference state
  isInferring: boolean;

  // Actions
  setServerUrl: (url: string) => void;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  setActiveModel: (model: string) => void;
  setInferring: (isInferring: boolean) => void;
  reset: () => void;
}

const initialState = {
  serverUrl: '',
  connectionStatus: 'disconnected' as ConnectionStatus,
  client: null as MonaiLabelClient | null,
  error: null as string | null,
  serverInfo: null as ServerInfo | null,
  models: [] as Model[],
  activeModel: null as string | null,
  isInferring: false,
};

export const useMonaiStore = create<MonaiState>((set, get) => ({
  ...initialState,

  setServerUrl: (url: string) => {
    set({ serverUrl: url.trim() });
  },

  connect: async (url: string) => {
    if (!isFeatureEnabled('monai-segmentation')) {
      set({
        connectionStatus: 'error',
        error: 'MONAI segmentation feature is disabled (enable via VITE_FEATURES=monai-segmentation)',
      });
      return;
    }
    const trimmedUrl = url.trim();
    set({
      serverUrl: trimmedUrl,
      connectionStatus: 'connecting',
      error: null,
    });

    try {
      const client = new MonaiLabelClient(trimmedUrl);
      const serverInfo = await client.info();

      // Convert models from ServerInfo format to Model[]
      const models: Model[] = Object.entries(serverInfo.models).map(([name, info]) => ({
        name,
        type: info.type,
        labels: info.labels,
        description: info.description,
        // TotalSegmentator specific fields
        supportedModalities: info.supported_modalities,
        ctLabels: info.ct_labels,
        mrLabels: info.mr_labels,
      }));

      // Set first model as active if available
      const activeModel = models.length > 0 ? models[0].name : null;

      set({
        client,
        serverInfo,
        models,
        activeModel,
        connectionStatus: 'connected',
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({
        connectionStatus: 'error',
        error: errorMessage,
        client: null,
        serverInfo: null,
        models: [],
        activeModel: null,
      });
    }
  },

  disconnect: () => {
    set({
      connectionStatus: 'disconnected',
      client: null,
      serverInfo: null,
      models: [],
      activeModel: null,
      error: null,
    });
  },

  setActiveModel: (model: string) => {
    set({ activeModel: model });
  },

  setInferring: (isInferring: boolean) => {
    set({ isInferring });
  },

  reset: () => {
    set(initialState);
  },
}));

export default useMonaiStore;
