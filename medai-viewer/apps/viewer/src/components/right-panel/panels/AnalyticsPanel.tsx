import React from 'react';
import { BarChart2, Activity, Eye, Loader2 } from 'lucide-react';
import { Panel, Button } from '@medai/ui';

interface AnalyticsPanelProps {
  activeSegmentationId: string | null;
  hasSegments: boolean;
  isComputingVolumetrics: boolean;
  isComputingRadiomics: boolean;
  hasResults: boolean;
  onComputeVolumetrics: () => void;
  onComputeRadiomics: () => void;
  onViewResults: () => void;
}

export function AnalyticsPanel({
  activeSegmentationId,
  hasSegments,
  isComputingVolumetrics,
  isComputingRadiomics,
  hasResults,
  onComputeVolumetrics,
  onComputeRadiomics,
  onViewResults,
}: AnalyticsPanelProps) {
  // Only show when segmentation exists with segments
  if (!activeSegmentationId || !hasSegments) {
    return null;
  }

  return (
    <div className="mt-4">
      <Panel title="Analytics">
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            Compute volumetric measurements and radiomics features for your segmentation.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onComputeVolumetrics}
              disabled={isComputingVolumetrics || !activeSegmentationId}
              data-testid="compute-volumetrics-button"
            >
              {isComputingVolumetrics ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <BarChart2 className="h-4 w-4 mr-1" />
              )}
              Volumetrics
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onComputeRadiomics}
              disabled={isComputingRadiomics || !activeSegmentationId}
              data-testid="compute-radiomics-button"
            >
              {isComputingRadiomics ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Activity className="h-4 w-4 mr-1" />
              )}
              Radiomics
            </Button>
          </div>

          {/* Show "View Results" button if results exist */}
          {hasResults && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onViewResults}
              data-testid="view-analytics-button"
            >
              <Eye className="h-4 w-4 mr-1" />
              View Results
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
