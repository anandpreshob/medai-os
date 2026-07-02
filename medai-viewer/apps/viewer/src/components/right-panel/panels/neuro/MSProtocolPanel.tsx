/**
 * MSProtocolPanel - Multiple Sclerosis workflow panel
 *
 * Provides MS-specific features:
 * - Lesion count and total volume
 * - New/enlarging lesion tracking
 * - Location breakdown (McDonald 2017 criteria)
 * - MS trial table export
 */

import React, { useMemo } from 'react';
import { useNeuroModeStore, useLesionCorrespondenceStore } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  Activity,
  Plus,
  TrendingUp,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface MSProtocolPanelProps {
  sessionId?: string;
  onExport?: () => void;
  className?: string;
}

export function MSProtocolPanel({
  sessionId,
  onExport,
  className,
}: MSProtocolPanelProps) {
  const {
    classifiedLesions,
    msLesionCounts,
    activeMode,
  } = useNeuroModeStore();

  // Get longitudinal data if available
  const correspondences = useLesionCorrespondenceStore((state) =>
    sessionId ? state.getCorrespondences(sessionId) : []
  );

  const statistics = useLesionCorrespondenceStore((state) =>
    sessionId ? state.getStatistics(sessionId) : null
  );

  // Compute MS-specific metrics
  const metrics = useMemo(() => {
    const totalLesions = classifiedLesions.length;
    const totalVolume = classifiedLesions.reduce((sum, l) => sum + l.volumeMl, 0);

    // Longitudinal metrics
    const newLesions = statistics?.newLesionCount || 0;
    const resolvedLesions = statistics?.resolvedLesionCount || 0;

    // Enlarging lesions from correspondences
    const enlargingLesions = correspondences.filter((c) => {
      const instances = Array.from(c.instances.values());
      if (instances.length < 2) return false;

      const sorted = [...instances].sort((a, b) => a.timepointId.localeCompare(b.timepointId));
      const baseline = sorted[0];
      const latest = sorted[sorted.length - 1];

      if (baseline.volumeMl && latest.volumeMl) {
        return (latest.volumeMl - baseline.volumeMl) / baseline.volumeMl > 0.2;
      }
      return false;
    }).length;

    return {
      totalLesions,
      totalVolume,
      newLesions,
      resolvedLesions,
      enlargingLesions,
      hasLongitudinal: statistics !== null,
    };
  }, [classifiedLesions, correspondences, statistics]);

  // McDonald 2017 DIS check
  const disCriteria = useMemo(() => {
    const locations = ['periventricular', 'juxtacortical', 'infratentorial'] as const;
    const presentLocations = locations.filter((loc) => msLesionCounts[loc] >= 1);
    return {
      met: presentLocations.length >= 2,
      locations: presentLocations,
    };
  }, [msLesionCounts]);

  if (activeMode !== 'ms_protocol') {
    return null;
  }

  return (
    <Panel
      title="MS Protocol"
      className={className}
      collapsible
      actions={<Activity className="h-4 w-4 text-orange-400" />}
    >
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="text-xs text-text-muted">Total Lesions</div>
          <div className="text-2xl font-bold text-orange-400">
            {metrics.totalLesions}
          </div>
        </div>
        <div className="p-3 bg-background-hover/50 rounded-lg border border-border-subtle">
          <div className="text-xs text-text-muted">Total Volume</div>
          <div className="text-2xl font-bold text-text-primary">
            {metrics.totalVolume.toFixed(2)}
            <span className="text-sm font-normal text-text-muted ml-1">mL</span>
          </div>
        </div>
      </div>

      {/* Longitudinal Metrics */}
      {metrics.hasLongitudinal && (
        <div className="mb-4 p-3 bg-background-hover/30 rounded-lg border border-border-subtle">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Interval Changes
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-green-400">
                <Plus className="h-3 w-3" />
                <span className="text-lg font-bold">{metrics.newLesions}</span>
              </div>
              <div className="text-xs text-text-muted">New</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <TrendingUp className="h-3 w-3" />
                <span className="text-lg font-bold">{metrics.enlargingLesions}</span>
              </div>
              <div className="text-xs text-text-muted">Enlarging</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-blue-400">
                <CheckCircle className="h-3 w-3" />
                <span className="text-lg font-bold">{metrics.resolvedLesions}</span>
              </div>
              <div className="text-xs text-text-muted">Resolved</div>
            </div>
          </div>
        </div>
      )}

      {/* McDonald DIS Criteria */}
      <div
        className={`
          mb-4 p-3 rounded-lg border
          ${disCriteria.met
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
          }
        `}
      >
        <div className="flex items-center gap-2 mb-2">
          {disCriteria.met ? (
            <CheckCircle className="h-5 w-5 text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-400" />
          )}
          <span className={`font-medium ${disCriteria.met ? 'text-green-400' : 'text-amber-400'}`}>
            McDonald 2017 DIS: {disCriteria.met ? 'Criteria Met' : 'Not Met'}
          </span>
        </div>
        <div className="text-xs text-text-muted">
          {disCriteria.locations.length > 0 ? (
            <>
              Present in: {disCriteria.locations.join(', ')}
              {disCriteria.locations.length < 2 && (
                <span className="text-amber-400">
                  {' '}(need ≥2 locations)
                </span>
              )}
            </>
          ) : (
            'No lesions in typical MS locations'
          )}
        </div>
      </div>

      {/* Location Summary */}
      <div className="mb-4 space-y-1">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Location Breakdown
        </div>
        {Object.entries(msLesionCounts)
          .filter(([_, count]) => count > 0)
          .map(([location, count]) => (
            <div
              key={location}
              className="flex items-center justify-between py-1 px-2 bg-background-hover/30 rounded"
            >
              <span className="text-sm text-text-primary capitalize">
                {location.replace('_', ' ')}
              </span>
              <span className="text-sm font-medium text-orange-400">{count}</span>
            </div>
          ))}
      </div>

      {/* Export Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onExport}
        >
          <FileSpreadsheet className="h-4 w-4 mr-1" />
          MS Trial Table
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
  );
}

export default MSProtocolPanel;
