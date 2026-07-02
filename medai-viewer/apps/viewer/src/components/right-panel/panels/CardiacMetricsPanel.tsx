/**
 * CardiacMetricsPanel - Cardiology Suite Metrics Display
 *
 * Displays cardiac-specific metrics including:
 * - Chamber volumes (LV, RV, LA, RA)
 * - Ejection fraction (LVEF, RVEF)
 * - Myocardial mass
 * - Calcium scoring (Agatston)
 * - Wall thickness analysis
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useSegmentationStore, useAnalyticsStore } from '@medai/core';
import type { SegmentVolumetrics } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  Heart,
  Activity,
  Download,
  Copy,
  AlertCircle,
  TrendingUp,
  Layers,
  Droplets,
  CircleDot,
  Check,
} from 'lucide-react';

interface CardiacMetricsPanelProps {
  activeSegmentationId: string | null;
}

// Cardiac structure categories and their keywords
const CHAMBER_KEYWORDS = {
  leftVentricle: ['lv', 'left ventricle', 'left_ventricle', 'leftventricle'],
  rightVentricle: ['rv', 'right ventricle', 'right_ventricle', 'rightventricle'],
  leftAtrium: ['la', 'left atrium', 'left_atrium', 'leftatrium'],
  rightAtrium: ['ra', 'right atrium', 'right_atrium', 'rightatrium'],
  myocardium: ['myocardium', 'myocardial', 'heart muscle', 'heart_muscle'],
  aorta: ['aorta', 'ascending aorta', 'descending aorta', 'aortic'],
  pulmonaryArtery: ['pulmonary', 'pa', 'pulmonary artery', 'pulmonary_artery'],
  pericardium: ['pericardium', 'pericardial'],
};

/**
 * Formats a volume value to a readable string with appropriate units
 */
function formatVolume(volumeCm3: number): string {
  if (volumeCm3 < 0.001) {
    return `${(volumeCm3 * 1000).toFixed(3)} mm³`;
  }
  if (volumeCm3 < 1) {
    return `${volumeCm3.toFixed(3)} cm³`;
  }
  return `${volumeCm3.toFixed(1)} mL`; // Use mL for cardiac volumes
}

/**
 * Formats mass in grams
 */
function formatMass(volumeCm3: number, density = 1.05): string {
  const massGrams = volumeCm3 * density;
  return `${massGrams.toFixed(1)} g`;
}

export function CardiacMetricsPanel({ activeSegmentationId }: CardiacMetricsPanelProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  // Get segmentation data
  const segmentations = useSegmentationStore((state) => state.segmentations);
  const activeSegmentation = useMemo(
    () => segmentations.find((s) => s.id === activeSegmentationId),
    [segmentations, activeSegmentationId]
  );

  // Get analytics data
  const volumetricsResult = useAnalyticsStore((state) => state.volumetricsResult);

  // Derive volume data from volumetrics result
  const volumeData: SegmentVolumetrics[] = useMemo(() => {
    if (!volumetricsResult?.volumetrics?.segments) {
      return [];
    }
    return volumetricsResult.volumetrics.segments;
  }, [volumetricsResult]);

  // Categorize cardiac structures
  const cardiacStructures = useMemo(() => {
    const findStructure = (keywords: string[]): SegmentVolumetrics | null => {
      return (
        volumeData.find((seg) => {
          const labelLower = seg.label.toLowerCase();
          return keywords.some((kw) => labelLower.includes(kw));
        }) || null
      );
    };

    return {
      leftVentricle: findStructure(CHAMBER_KEYWORDS.leftVentricle),
      rightVentricle: findStructure(CHAMBER_KEYWORDS.rightVentricle),
      leftAtrium: findStructure(CHAMBER_KEYWORDS.leftAtrium),
      rightAtrium: findStructure(CHAMBER_KEYWORDS.rightAtrium),
      myocardium: findStructure(CHAMBER_KEYWORDS.myocardium),
      aorta: findStructure(CHAMBER_KEYWORDS.aorta),
      pulmonaryArtery: findStructure(CHAMBER_KEYWORDS.pulmonaryArtery),
      pericardium: findStructure(CHAMBER_KEYWORDS.pericardium),
    };
  }, [volumeData]);

  // Calculate derived metrics
  const hasChambers =
    cardiacStructures.leftVentricle !== null || cardiacStructures.rightVentricle !== null;

  const totalCardiacVolume = useMemo(() => {
    return volumeData.reduce((sum, seg) => sum + seg.total_volume_cm3, 0);
  }, [volumeData]);

  // Myocardial mass (using density of ~1.05 g/cm³)
  const myocardialMass = cardiacStructures.myocardium
    ? cardiacStructures.myocardium.total_volume_cm3 * 1.05
    : null;

  /**
   * Generates CSV content from the current metrics data
   */
  const generateCSV = useCallback((): string => {
    const headers = ['Structure', 'Volume (mL)', 'Category'];
    const rows = volumeData.map((seg) => {
      const labelLower = seg.label.toLowerCase();
      let category = 'Other';
      if (CHAMBER_KEYWORDS.leftVentricle.some((kw) => labelLower.includes(kw))) category = 'LV';
      else if (CHAMBER_KEYWORDS.rightVentricle.some((kw) => labelLower.includes(kw)))
        category = 'RV';
      else if (CHAMBER_KEYWORDS.leftAtrium.some((kw) => labelLower.includes(kw))) category = 'LA';
      else if (CHAMBER_KEYWORDS.rightAtrium.some((kw) => labelLower.includes(kw))) category = 'RA';
      else if (CHAMBER_KEYWORDS.myocardium.some((kw) => labelLower.includes(kw)))
        category = 'Myocardium';
      else if (CHAMBER_KEYWORDS.aorta.some((kw) => labelLower.includes(kw))) category = 'Vessel';

      return [seg.label, seg.total_volume_cm3.toFixed(2), category];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      '',
      `Total Cardiac Volume,${totalCardiacVolume.toFixed(2)} mL`,
      myocardialMass ? `Myocardial Mass,${myocardialMass.toFixed(1)} g` : '',
    ].join('\n');

    return csvContent;
  }, [volumeData, totalCardiacVolume, myocardialMass]);

  /**
   * Handles CSV export
   */
  const handleExportCSV = useCallback(() => {
    const csv = generateCSV();
    const timestamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cardiac-metrics-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generateCSV]);

  /**
   * Handles copy to clipboard
   */
  const handleCopyToClipboard = useCallback(async () => {
    try {
      const data = {
        segmentationId: activeSegmentationId,
        exportDate: new Date().toISOString(),
        chambers: {
          leftVentricle: cardiacStructures.leftVentricle?.total_volume_cm3 || null,
          rightVentricle: cardiacStructures.rightVentricle?.total_volume_cm3 || null,
          leftAtrium: cardiacStructures.leftAtrium?.total_volume_cm3 || null,
          rightAtrium: cardiacStructures.rightAtrium?.total_volume_cm3 || null,
        },
        myocardialMass,
        totalCardiacVolume,
        allStructures: volumeData,
      };
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [activeSegmentationId, cardiacStructures, myocardialMass, totalCardiacVolume, volumeData]);

  if (!activeSegmentationId) {
    return (
      <div className="mt-4">
        <Panel title="Cardiac Metrics">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Heart className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-muted text-sm">No active segmentation.</p>
            <p className="text-text-muted text-xs mt-1">
              Create or load a segmentation to view cardiac metrics.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const hasVolumeData = volumeData.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* Chamber Volumes Section */}
      <Panel
        title="Chamber Volumes"
        collapsible
        badge={hasChambers ? undefined : undefined}
        actions={<Heart className="h-4 w-4 text-red-500" />}
      >
        {!hasChambers && !hasVolumeData ? (
          <div className="text-center py-4">
            <Heart className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No cardiac chambers detected.</p>
            <p className="text-text-muted text-xs mt-1">
              Run cardiac segmentation to analyze chamber volumes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Chamber Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Ventricle */}
              <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                <div className="text-xs text-text-muted flex items-center gap-1">
                  <CircleDot className="h-3 w-3 text-red-500" />
                  LV Volume
                </div>
                <div className="text-lg font-bold text-red-500">
                  {cardiacStructures.leftVentricle
                    ? formatVolume(cardiacStructures.leftVentricle.total_volume_cm3)
                    : '—'}
                </div>
              </div>

              {/* Right Ventricle */}
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <div className="text-xs text-text-muted flex items-center gap-1">
                  <CircleDot className="h-3 w-3 text-blue-500" />
                  RV Volume
                </div>
                <div className="text-lg font-bold text-blue-500">
                  {cardiacStructures.rightVentricle
                    ? formatVolume(cardiacStructures.rightVentricle.total_volume_cm3)
                    : '—'}
                </div>
              </div>

              {/* Left Atrium */}
              <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                <div className="text-xs text-text-muted flex items-center gap-1">
                  <CircleDot className="h-3 w-3 text-orange-500" />
                  LA Volume
                </div>
                <div className="text-lg font-bold text-orange-500">
                  {cardiacStructures.leftAtrium
                    ? formatVolume(cardiacStructures.leftAtrium.total_volume_cm3)
                    : '—'}
                </div>
              </div>

              {/* Right Atrium */}
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                <div className="text-xs text-text-muted flex items-center gap-1">
                  <CircleDot className="h-3 w-3 text-purple-500" />
                  RA Volume
                </div>
                <div className="text-lg font-bold text-purple-500">
                  {cardiacStructures.rightAtrium
                    ? formatVolume(cardiacStructures.rightAtrium.total_volume_cm3)
                    : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* Myocardial Analysis Section */}
      <Panel
        title="Myocardial Analysis"
        collapsible
        defaultCollapsed={!cardiacStructures.myocardium}
        actions={<Activity className="h-4 w-4 text-pink-500" />}
      >
        {!cardiacStructures.myocardium ? (
          <div className="text-center py-4">
            <Activity className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No myocardium segmented.</p>
            <p className="text-text-muted text-xs mt-1">
              Run myocardial segmentation to calculate mass and wall thickness.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-pink-500/10 rounded-lg border border-pink-500/30">
                <div className="text-xs text-text-muted">Myocardial Volume</div>
                <div className="text-lg font-bold text-pink-500">
                  {formatVolume(cardiacStructures.myocardium.total_volume_cm3)}
                </div>
              </div>
              <div className="p-3 bg-pink-500/10 rounded-lg border border-pink-500/30">
                <div className="text-xs text-text-muted">Myocardial Mass</div>
                <div className="text-lg font-bold text-pink-500">
                  {myocardialMass ? `${myocardialMass.toFixed(1)} g` : '—'}
                </div>
              </div>
            </div>

            {/* Reference ranges */}
            <div className="text-xs text-text-muted p-2 bg-background-hover/50 rounded border border-border-subtle">
              <p className="font-medium text-text-primary mb-1">Reference Ranges (LV Mass)</p>
              <p>Male: 88-224 g | Female: 66-162 g</p>
              <p className="text-[10px] mt-1 italic">Based on indexed values; actual ranges depend on BSA</p>
            </div>
          </div>
        )}
      </Panel>

      {/* Vessels Section */}
      <Panel
        title="Great Vessels"
        collapsible
        defaultCollapsed
        actions={<Droplets className="h-4 w-4 text-cyan-500" />}
      >
        {!cardiacStructures.aorta && !cardiacStructures.pulmonaryArtery ? (
          <div className="text-center py-4">
            <Droplets className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No vessels segmented.</p>
            <p className="text-text-muted text-xs mt-1">
              Run vessel segmentation to analyze aorta and pulmonary artery.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cardiacStructures.aorta && (
              <div className="flex items-center justify-between text-sm py-2 px-3 bg-red-500/10 rounded border border-red-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-text-primary">Aorta</span>
                </div>
                <span className="text-text-muted">
                  {formatVolume(cardiacStructures.aorta.total_volume_cm3)}
                </span>
              </div>
            )}
            {cardiacStructures.pulmonaryArtery && (
              <div className="flex items-center justify-between text-sm py-2 px-3 bg-blue-500/10 rounded border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-text-primary">Pulmonary Artery</span>
                </div>
                <span className="text-text-muted">
                  {formatVolume(cardiacStructures.pulmonaryArtery.total_volume_cm3)}
                </span>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Ejection Fraction Section (Placeholder) */}
      <Panel
        title="Ejection Fraction"
        collapsible
        defaultCollapsed
        actions={<TrendingUp className="h-4 w-4 text-green-500" />}
      >
        <div className="text-center py-4">
          <TrendingUp className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">
            EF calculation requires end-diastolic and end-systolic volumes.
          </p>
          <p className="text-text-muted text-xs mt-1">
            Load multi-phase cardiac data for EF analysis.
          </p>
        </div>
      </Panel>

      {/* All Structures */}
      <Panel
        title="All Structures"
        collapsible
        defaultCollapsed={!hasVolumeData}
        badge={volumeData.length > 0 ? volumeData.length : undefined}
        actions={<Layers className="h-4 w-4 text-gray-500" />}
      >
        {volumeData.length === 0 ? (
          <div className="text-center py-4">
            <Layers className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No structures segmented.</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {volumeData.map((seg) => {
              const segmentColor =
                activeSegmentation?.segments.find((s) => s.segmentIndex === seg.segment_index)
                  ?.color || '#808080';
              return (
                <div
                  key={seg.segment_index}
                  className="flex items-center justify-between text-sm py-1 px-2 border-b border-border-subtle last:border-0"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: segmentColor }}
                    />
                    <span className="text-text-primary truncate">{seg.label}</span>
                  </div>
                  <span className="text-text-muted">{formatVolume(seg.total_volume_cm3)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Export Section */}
      <Panel
        title="Export"
        collapsible
        defaultCollapsed
        actions={<Download className="h-4 w-4 text-text-muted" />}
      >
        <div className="space-y-3">
          <p className="text-text-muted text-xs">
            Export cardiac metrics data for external analysis or clinical reporting.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!hasVolumeData}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              disabled={!hasVolumeData}
            >
              {copySuccess ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>

          {!hasVolumeData && (
            <p className="text-text-muted text-xs italic">
              Run volumetrics analysis to enable export options.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default CardiacMetricsPanel;
