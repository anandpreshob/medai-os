import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@medai/ui';

type ConnectionStatus = 'connected' | 'connecting' | 'error' | 'disconnected';

interface ServerConnectionPanelProps {
  connectionStatus: ConnectionStatus;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onConnect: () => void;
  error: string | null;
}

function getStatusText(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Error';
    default:
      return 'Disconnected';
  }
}

export function ServerConnectionPanel({
  connectionStatus,
  serverUrl,
  onServerUrlChange,
  onConnect,
  error,
}: ServerConnectionPanelProps) {
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="bg-background-tertiary/40 rounded-xl p-4 border border-border-subtle">
      <div className="flex items-center gap-2 mb-4">
        <Wifi className="h-4 w-4 text-accent-primary" />
        <h3 className="text-sm font-semibold text-text-primary tracking-tight">Label Server</h3>
      </div>
      <div className="space-y-3">
        {/* Connection Status */}
        <div className="flex items-center gap-2 p-2 bg-background-secondary/50 rounded-lg">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-accent-success shadow-[0_0_8px_rgba(0,229,160,0.5)]' :
            isConnecting ? 'bg-accent-warning animate-pulse' :
            connectionStatus === 'error' ? 'bg-accent-error' : 'bg-text-muted'
          }`} />
          <span className="text-text-secondary text-sm flex-1" data-testid="connection-status">
            {getStatusText(connectionStatus)}
          </span>
        </div>

        {/* Server URL Input */}
        <div>
          <label className="text-text-muted text-2xs uppercase tracking-wide mb-1.5 block">Server URL</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            placeholder="http://localhost:8002"
            className="w-full bg-background-tertiary text-text-primary rounded-lg px-3 py-2.5 text-sm border border-border-default focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30 focus:outline-none transition-all placeholder:text-text-disabled"
            data-testid="server-url-input"
            disabled={isConnected || isConnecting}
          />
        </div>

        {/* Connect Button */}
        <Button
          variant={isConnected ? 'outline' : 'default'}
          size="sm"
          onClick={onConnect}
          disabled={isConnecting}
          className="w-full"
          data-testid={isConnected ? 'disconnect-button' : 'connect-button'}
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isConnected ? (
            <>
              <WifiOff className="h-4 w-4" />
              Disconnect
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4" />
              Connect
            </>
          )}
        </Button>

        {/* Error Message */}
        {error && (
          <p className="text-accent-error text-xs bg-accent-error-muted p-2 rounded-lg">{error}</p>
        )}
      </div>
    </div>
  );
}
