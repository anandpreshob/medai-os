/**
 * MultiSequenceViewport - Multi-sequence grid viewport for neuro workflows
 *
 * Displays 2x2 or 1x4 grid of synchronized viewports for viewing
 * T1/T2/FLAIR/DWI-ADC sequences at the same anatomical position.
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useNeuroSequenceStore } from '@medai/core';
import {
  ViewportSlot,
  SEQUENCE_COLORS,
} from '@medai/core/stores/neuroSequenceTypes';
import {
  createWorldPositionSynchronizer,
  applySyncState,
  type WorldPositionSynchronizer,
} from '../../lib/worldCoordinateSynchronizer';
import {
  createFusionController,
  type FusionController,
} from '../../lib/fusionController';
import { Loader2, AlertTriangle, Maximize2 } from 'lucide-react';

interface MultiSequenceViewportProps {
  className?: string;
  renderingEngineId: string;
  onSlotClick?: (slot: ViewportSlot) => void;
  onSlotDoubleClick?: (slot: ViewportSlot) => void;
}

interface ViewportSlotProps {
  slot: ViewportSlot;
  sequenceId: string | null;
  sequenceType: string | null;
  viewportId: string;
  renderingEngineId: string;
  synchronizer: WorldPositionSynchronizer;
  isLoading?: boolean;
  hasError?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

function ViewportSlotComponent({
  slot,
  sequenceId,
  sequenceType,
  viewportId,
  renderingEngineId,
  synchronizer,
  isLoading = false,
  hasError = false,
  onClick,
  onDoubleClick,
}: ViewportSlotProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const colorConfig = sequenceType ? SEQUENCE_COLORS[sequenceType as keyof typeof SEQUENCE_COLORS] : null;

  // Register viewport with synchronizer
  useEffect(() => {
    synchronizer.registerViewport({
      viewportId,
      renderingEngineId,
      syncPosition: true,
      syncZoom: true,
      syncWindowLevel: false,
    });

    // Subscribe to sync updates
    const unsubscribe = synchronizer.subscribe(viewportId, (state, sourceId) => {
      // In a real implementation, this would get the Cornerstone viewport
      // and apply the sync state
      // const viewport = getRenderingEngine(renderingEngineId)?.getViewport(viewportId);
      // if (viewport) applySyncState(viewport, state);
    });

    return () => {
      synchronizer.unregisterViewport(viewportId);
      unsubscribe();
    };
  }, [viewportId, renderingEngineId, synchronizer]);

  return (
    <div
      ref={viewportRef}
      className={`
        relative bg-black rounded-lg overflow-hidden border-2 transition-colors
        ${colorConfig ? colorConfig.bg.replace('/20', '/5') : 'bg-background-primary'}
        ${colorConfig ? colorConfig.text.replace('text-', 'border-').replace('-400', '-500/30') : 'border-border-subtle'}
        hover:border-white/30
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Viewport canvas placeholder */}
      <div
        id={viewportId}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Sequence label */}
      <div
        className={`
          absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold
          ${colorConfig ? `${colorConfig.bg} ${colorConfig.text}` : 'bg-background-hover text-text-muted'}
        `}
      >
        {sequenceType || 'Empty'}
      </div>

      {/* Slot label */}
      <div className="absolute bottom-2 left-2 text-xs text-text-muted/50">
        {slot}
      </div>

      {/* Maximize button */}
      <button
        className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white/50 hover:text-white hover:bg-black/70 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onDoubleClick?.();
        }}
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/20">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <span className="text-xs text-red-400">Load failed</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!sequenceId && !isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-text-muted text-sm">Drop sequence here</span>
        </div>
      )}
    </div>
  );
}

export function MultiSequenceViewport({
  className,
  renderingEngineId,
  onSlotClick,
  onSlotDoubleClick,
}: MultiSequenceViewportProps) {
  const {
    sequences,
    slotAssignments,
    layoutPreset,
    syncState,
  } = useNeuroSequenceStore();

  // Create synchronizer and fusion controller
  const synchronizerRef = useRef<WorldPositionSynchronizer | null>(null);
  const fusionControllerRef = useRef<FusionController | null>(null);

  useEffect(() => {
    synchronizerRef.current = createWorldPositionSynchronizer();
    fusionControllerRef.current = createFusionController();

    return () => {
      synchronizerRef.current?.destroy();
      fusionControllerRef.current?.destroy();
    };
  }, []);

  // Update synchronizer enabled state
  useEffect(() => {
    if (synchronizerRef.current) {
      synchronizerRef.current.setEnabled(syncState.enabled);
    }
  }, [syncState.enabled]);

  // Determine grid layout based on preset
  const gridClass = useMemo(() => {
    switch (layoutPreset) {
      case 'sequence-1x4':
        return 'grid-cols-4 grid-rows-1';
      case 'dwi-adc-compare':
        return 'grid-cols-2 grid-rows-1';
      case 'fusion-main':
        return 'grid-cols-3 grid-rows-2';
      case 'sequence-2x2':
      default:
        return 'grid-cols-2 grid-rows-2';
    }
  }, [layoutPreset]);

  // Get slots to render based on layout
  const slotsToRender = useMemo((): ViewportSlot[] => {
    switch (layoutPreset) {
      case 'sequence-1x4':
        return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      case 'dwi-adc-compare':
        return ['main', 'secondary'];
      case 'fusion-main':
        return ['main', 'top-right', 'bottom-right'];
      case 'sequence-2x2':
      default:
        return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    }
  }, [layoutPreset]);

  // Get sequence for a slot
  const getSlotSequence = useCallback(
    (slot: ViewportSlot) => {
      const sequenceId = slotAssignments[slot];
      return sequenceId ? sequences.find((s) => s.id === sequenceId) : null;
    },
    [slotAssignments, sequences]
  );

  if (!synchronizerRef.current) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Grid container */}
      <div className={`grid gap-2 h-full ${gridClass}`}>
        {slotsToRender.map((slot) => {
          const sequence = getSlotSequence(slot);
          const viewportId = `neuro-viewport-${slot}`;

          // Handle fusion-main layout special case
          if (layoutPreset === 'fusion-main' && slot === 'main') {
            return (
              <div
                key={slot}
                className="col-span-2 row-span-2"
              >
                <ViewportSlotComponent
                  slot={slot}
                  sequenceId={sequence?.id || null}
                  sequenceType={sequence?.type || null}
                  viewportId={viewportId}
                  renderingEngineId={renderingEngineId}
                  synchronizer={synchronizerRef.current!}
                  onClick={() => onSlotClick?.(slot)}
                  onDoubleClick={() => onSlotDoubleClick?.(slot)}
                />
              </div>
            );
          }

          return (
            <ViewportSlotComponent
              key={slot}
              slot={slot}
              sequenceId={sequence?.id || null}
              sequenceType={sequence?.type || null}
              viewportId={viewportId}
              renderingEngineId={renderingEngineId}
              synchronizer={synchronizerRef.current!}
              onClick={() => onSlotClick?.(slot)}
              onDoubleClick={() => onSlotDoubleClick?.(slot)}
            />
          );
        })}
      </div>

      {/* Crosshair overlay (when sync enabled) */}
      {syncState.enabled && syncState.crosshairVisible && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Vertical crosshair line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-yellow-400/50"
            style={{ left: '50%' }}
          />
          {/* Horizontal crosshair line */}
          <div
            className="absolute left-0 right-0 h-px bg-yellow-400/50"
            style={{ top: '50%' }}
          />
        </div>
      )}

      {/* Sync status indicator */}
      <div
        className={`
          absolute bottom-4 right-4 px-2 py-1 rounded text-xs
          ${syncState.enabled
            ? 'bg-green-500/20 text-green-400'
            : 'bg-gray-500/20 text-gray-400'}
        `}
      >
        Sync: {syncState.enabled ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}

export default MultiSequenceViewport;
