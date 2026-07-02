import { useCallback } from 'react';
import { useMonaiStore, clearAllInferenceSessions } from '@medai/core';

export function useServerConnection() {
  const { connectionStatus, connect, disconnect } = useMonaiStore();

  const handleConnect = useCallback(async () => {
    if (connectionStatus === 'connected') {
      // Clear all inference sessions when disconnecting
      clearAllInferenceSessions();
      disconnect();
    } else {
      // Use proxy path to bypass CORS in development
      // The Vite proxy at /monai forwards to VITE_MONAI_SERVER_URL/monai
      const proxyUrl = '/monai';
      await connect(proxyUrl);
    }
  }, [connectionStatus, connect, disconnect]);

  return {
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    handleConnect,
  };
}
