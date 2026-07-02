/**
 * LesionLocationBreakdown - MS-style lesion location classification display
 *
 * Shows lesion counts and volumes by location:
 * - Periventricular
 * - Juxtacortical
 * - Infratentorial
 * - Deep white matter
 */

import React, { useMemo } from 'react';
import { useNeuroModeStore } from '@medai/core';
import { MSLesionLocation } from '@medai/core/stores/neuroModeTypes';
import { Panel } from '@medai/ui';
import { MapPin, Circle, Info } from 'lucide-react';

interface LesionLocationBreakdownProps {
  className?: string;
}

interface LocationConfig {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  description: string;
}

const LOCATION_CONFIG: Record<MSLesionLocation, LocationConfig> = {
  periventricular: {
    label: 'Periventricular',
    shortLabel: 'PV',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    description: 'Within 3mm of lateral ventricles',
  },
  juxtacortical: {
    label: 'Juxtacortical',
    shortLabel: 'JC',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    description: 'Within 3mm of cortical gray matter',
  },
  infratentorial: {
    label: 'Infratentorial',
    shortLabel: 'IT',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    description: 'Brainstem or cerebellum',
  },
  deep_white_matter: {
    label: 'Deep White Matter',
    shortLabel: 'DWM',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    description: 'Other white matter locations',
  },
  cortical: {
    label: 'Cortical',
    shortLabel: 'CX',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
    description: 'Within cortical gray matter',
  },
  spinal_cord: {
    label: 'Spinal Cord',
    shortLabel: 'SC',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    description: 'Spinal cord lesions',
  },
};

// McDonald 2017 criteria locations
const MCDONALD_LOCATIONS: MSLesionLocation[] = [
  'periventricular',
  'juxtacortical',
  'infratentorial',
];

export function LesionLocationBreakdown({ className }: LesionLocationBreakdownProps) {
  const { msLesionCounts, classifiedLesions, getLesionsByLocation } = useNeuroModeStore();

  const totalLesions = useMemo(
    () => Object.values(msLesionCounts).reduce((sum, count) => sum + count, 0),
    [msLesionCounts]
  );

  const volumeByLocation = useMemo(() => {
    const volumes: Record<MSLesionLocation, number> = {
      periventricular: 0,
      juxtacortical: 0,
      infratentorial: 0,
      deep_white_matter: 0,
      cortical: 0,
      spinal_cord: 0,
    };

    classifiedLesions.forEach((lesion) => {
      if (lesion.msLocation) {
        volumes[lesion.msLocation] += lesion.volumeMl;
      }
    });

    return volumes;
  }, [classifiedLesions]);

  // Check McDonald 2017 DIS criteria (≥1 lesion in ≥2 locations)
  const mcDonaldLocations = useMemo(() => {
    return MCDONALD_LOCATIONS.filter((loc) => msLesionCounts[loc] >= 1);
  }, [msLesionCounts]);

  const disCriteriaMet = mcDonaldLocations.length >= 2;

  if (totalLesions === 0) {
    return (
      <Panel
        title="Lesion Location"
        className={className}
        collapsible
        defaultCollapsed
        actions={<MapPin className="h-4 w-4 text-text-muted" />}
      >
        <div className="text-center py-4">
          <MapPin className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No lesions classified.</p>
          <p className="text-text-muted text-xs mt-1">
            Run lesion segmentation to classify by location.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Lesion Location"
      className={className}
      collapsible
      badge={totalLesions}
      actions={<MapPin className="h-4 w-4 text-orange-400" />}
    >
      {/* McDonald DIS criteria indicator */}
      <div
        className={`
          mb-3 p-2 rounded-lg border
          ${disCriteriaMet
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-amber-500/10 border-amber-500/20'
          }
        `}
      >
        <div className="flex items-center gap-2">
          <Info className={`h-4 w-4 ${disCriteriaMet ? 'text-green-400' : 'text-amber-400'}`} />
          <div className="flex-1">
            <div className={`text-sm font-medium ${disCriteriaMet ? 'text-green-400' : 'text-amber-400'}`}>
              McDonald 2017 DIS: {disCriteriaMet ? 'Met' : 'Not Met'}
            </div>
            <div className="text-xs text-text-muted">
              {mcDonaldLocations.length}/2 typical MS locations
            </div>
          </div>
        </div>
      </div>

      {/* Location breakdown */}
      <div className="space-y-2">
        {(Object.entries(msLesionCounts) as [MSLesionLocation, number][])
          .filter(([_, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([location, count]) => {
            const config = LOCATION_CONFIG[location];
            const volume = volumeByLocation[location];
            const percent = (count / totalLesions) * 100;

            return (
              <div
                key={location}
                className={`p-2 rounded-lg ${config.bgColor} border border-transparent hover:border-white/10 transition-colors`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Circle className={`h-3 w-3 ${config.color} fill-current`} />
                    <span className="text-sm font-medium text-text-primary">
                      {config.label}
                    </span>
                    {MCDONALD_LOCATIONS.includes(location) && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-text-muted">
                        DIS
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${config.color}`}>
                      {count}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 bg-black/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${config.color.replace('text-', 'bg-')}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                  <span>{config.description}</span>
                  <span>{volume.toFixed(2)} mL</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Summary */}
      <div className="mt-3 pt-3 border-t border-border-subtle">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 bg-background-hover/50 rounded-lg">
            <div className="text-xs text-text-muted">Total Lesions</div>
            <div className="text-lg font-bold text-text-primary">{totalLesions}</div>
          </div>
          <div className="p-2 bg-background-hover/50 rounded-lg">
            <div className="text-xs text-text-muted">Total Volume</div>
            <div className="text-lg font-bold text-text-primary">
              {Object.values(volumeByLocation).reduce((s, v) => s + v, 0).toFixed(2)} mL
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default LesionLocationBreakdown;
