import React from 'react';
import { useViewerStore, useMonaiStore } from '@medai/core';
import { Circle, Server } from 'lucide-react';

export function StatusBar() {
  const { activeImageId, images } = useViewerStore();
  const { connectionStatus } = useMonaiStore();
  const image = activeImageId ? images.get(activeImageId) : null;

  const serverStatusConfig = {
    connected: { color: 'bg-accent-success', glow: 'shadow-[0_0_6px_rgba(0,229,160,0.5)]', text: 'Connected', textColor: 'text-accent-success' },
    connecting: { color: 'bg-accent-warning', glow: '', text: 'Connecting...', textColor: 'text-accent-warning' },
    error: { color: 'bg-accent-error', glow: '', text: 'Error', textColor: 'text-accent-error' },
    disconnected: { color: 'bg-text-muted', glow: '', text: 'Disconnected', textColor: 'text-text-muted' },
  };

  const serverConfig = serverStatusConfig[connectionStatus] || serverStatusConfig.disconnected;

  return (
    <footer className="h-8 bg-background-secondary/80 backdrop-blur-sm border-t border-border-subtle flex items-center px-5 text-xs status-bar-line">
      {/* Ready status with glow */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-accent-success shadow-[0_0_6px_rgba(0,229,160,0.5)]" />
        <span className="text-text-secondary font-medium">Ready</span>
      </div>

      {image && (
        <>
          {/* Divider */}
          <div className="mx-4 h-4 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />

          {/* Dimensionality badge */}
          <span className={`
            px-2 py-0.5 rounded-md text-2xs font-semibold tracking-wide
            ${image.metadata.dimensionality === '2D'
              ? 'bg-accent-info-muted text-accent-info'
              : 'bg-purple-500/15 text-purple-400'
            }
          `}>
            {image.metadata.dimensionality}
          </span>

          {/* Divider */}
          <div className="mx-4 h-4 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />

          {/* Dimensions - monospace */}
          <div className="flex items-center gap-1.5">
            <span className="text-text-disabled text-2xs font-medium">Size</span>
            <span className="text-text-secondary font-mono text-xs">
              {image.metadata.width}
              <span className="text-text-muted mx-0.5">×</span>
              {image.metadata.height}
              {image.metadata.dimensionality === '3D' && (
                <>
                  <span className="text-text-muted mx-0.5">×</span>
                  {image.metadata.depth}
                </>
              )}
            </span>
          </div>

          {/* Divider */}
          <div className="mx-4 h-4 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />

          {/* Spacing info */}
          <div className="flex items-center gap-1.5">
            <span className="text-text-disabled text-2xs font-medium">Spacing</span>
            <span className="text-text-secondary font-mono text-xs">
              {image.metadata.spacingX.toFixed(2)}
              <span className="text-text-muted mx-0.5">×</span>
              {image.metadata.spacingY.toFixed(2)}
              {image.metadata.dimensionality === '3D' && (
                <>
                  <span className="text-text-muted mx-0.5">×</span>
                  {image.metadata.spacingZ.toFixed(2)}
                </>
              )}
              <span className="text-text-disabled ml-1">mm</span>
            </span>
          </div>

          {/* Divider */}
          <div className="mx-4 h-4 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />

          {/* Format badge */}
          <span className="px-2 py-0.5 bg-background-tertiary/60 rounded-md text-2xs font-medium text-text-secondary uppercase tracking-wide border border-border-subtle/50">
            {image.metadata.format}
          </span>

          {/* Modality if present */}
          {image.metadata.modality && (
            <>
              <div className="mx-4 h-4 w-px bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />
              <span className="text-text-secondary text-xs font-medium">{image.metadata.modality}</span>
            </>
          )}
        </>
      )}

      <div className="flex-1" />

      {/* Server status */}
      <div className="flex items-center gap-2 bg-background-tertiary/30 px-3 py-1 rounded-lg">
        <Server className="h-3 w-3 text-text-disabled" />
        <div className={`w-1.5 h-1.5 rounded-full ${serverConfig.color} ${serverConfig.glow}`} />
        <span className={`text-xs font-medium ${serverConfig.textColor}`}>
          {serverConfig.text}
        </span>
      </div>
    </footer>
  );
}
