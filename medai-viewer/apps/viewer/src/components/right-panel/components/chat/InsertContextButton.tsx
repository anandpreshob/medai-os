import React, { useState } from 'react';
import { Paperclip, Check, Image, Layers, Activity, Info } from 'lucide-react';
import { Button } from '@medai/ui';

interface CaseContext {
  modality?: string;
  hasSegmentations: boolean;
  segmentationCount: number;
  hasDetections: boolean;
  detectionCount: number;
  hasVolumetrics: boolean;
}

interface InsertContextButtonProps {
  caseContext: CaseContext;
  onInsert: () => void;
  isActive: boolean;
  disabled?: boolean;
}

/**
 * Button to inject current case context into chat
 */
export function InsertContextButton({
  caseContext,
  onInsert,
  isActive,
  disabled = false,
}: InsertContextButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const hasContext =
    caseContext.hasSegmentations ||
    caseContext.hasDetections ||
    caseContext.hasVolumetrics;

  return (
    <div className="relative">
      <Button
        variant={isActive ? 'default' : 'outline'}
        size="sm"
        onClick={onInsert}
        disabled={disabled || !hasContext}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`h-8 ${
          isActive
            ? 'bg-accent-primary text-white'
            : 'border-border-default hover:border-accent-primary'
        }`}
        data-testid="insert-context-button"
      >
        {isActive ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Context Attached
          </>
        ) : (
          <>
            <Paperclip className="h-3.5 w-3.5 mr-1.5" />
            Insert Case Details
          </>
        )}
      </Button>

      {/* Tooltip showing what will be included */}
      {showTooltip && hasContext && (
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-background-primary border border-border-subtle rounded-lg shadow-lg z-10 min-w-[200px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary mb-2">
            <Info className="h-3.5 w-3.5 text-accent-primary" />
            Case context includes:
          </div>

          <div className="space-y-1.5">
            {caseContext.modality && (
              <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                <Image className="h-3 w-3" />
                <span>Modality: {caseContext.modality}</span>
              </div>
            )}

            {caseContext.hasSegmentations && (
              <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                <Layers className="h-3 w-3" />
                <span>
                  {caseContext.segmentationCount} segmentation
                  {caseContext.segmentationCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {caseContext.hasDetections && (
              <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                <Activity className="h-3 w-3" />
                <span>
                  {caseContext.detectionCount} detection
                  {caseContext.detectionCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {caseContext.hasVolumetrics && (
              <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                <Activity className="h-3 w-3" />
                <span>Volumetrics data</span>
              </div>
            )}
          </div>

          <p className="text-[10px] text-text-muted mt-2 pt-2 border-t border-border-subtle">
            This data helps MedAI provide context-aware answers.
          </p>
        </div>
      )}

      {/* Disabled state tooltip */}
      {showTooltip && !hasContext && (
        <div className="absolute bottom-full left-0 mb-2 p-2 bg-background-primary border border-border-subtle rounded-lg shadow-lg z-10 min-w-[180px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <p className="text-[11px] text-text-muted">
            No case data available. Load an image and run segmentation or detection first.
          </p>
        </div>
      )}
    </div>
  );
}
