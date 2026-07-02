import React, { useState } from 'react';
import { Button } from '@medai/ui';
import { X, Download, ChevronDown, ChevronRight, BarChart2, Activity, FileDown, FileJson } from 'lucide-react';
import {
  useAnalyticsStore,
  VolumetricsResult,
  RadiomicsResult,
  SegmentVolumetrics,
  SegmentRadiomics,
} from '@medai/core';

export function AnalyticsModal() {
  const {
    isModalOpen,
    closeModal,
    activeTab,
    setActiveTab,
    volumetricsResult,
    radiomicsResult,
    volumetricsError,
    radiomicsError,
  } = useAnalyticsStore();

  if (!isModalOpen) return null;

  const handleExportCSV = () => {
    if (activeTab === 'volumetrics' && volumetricsResult) {
      exportVolumetricsCSV(volumetricsResult);
    } else if (activeTab === 'radiomics' && radiomicsResult) {
      exportRadiomicsCSV(radiomicsResult);
    }
  };

  const handleExportJSON = () => {
    const data = activeTab === 'volumetrics' ? volumetricsResult : radiomicsResult;
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${activeTab}_results.json`);
    }
  };

  const hasData = activeTab === 'volumetrics' ? volumetricsResult : radiomicsResult;
  const error = activeTab === 'volumetrics' ? volumetricsError : radiomicsError;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-gradient-to-br from-background-secondary to-background-primary rounded-2xl shadow-2xl border border-border-subtle max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col animate-modal-entrance overflow-hidden">
        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-gradient-to-r from-background-tertiary/50 via-background-tertiary/30 to-background-tertiary/50">
          {/* Left accent */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-accent-primary to-transparent" />

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-accent-primary" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">Analytics Results</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasData && (
              <>
                <Button variant="ghost" size="sm" onClick={handleExportCSV} className="gap-2">
                  <FileDown className="h-4 w-4" />
                  CSV
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportJSON} className="gap-2">
                  <FileJson className="h-4 w-4" />
                  JSON
                </Button>
              </>
            )}
            <div className="w-px h-6 bg-border-subtle mx-1" />
            <Button variant="ghost" size="icon" onClick={closeModal}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-background-tertiary/30 border-b border-border-subtle">
          <button
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'volumetrics'
                ? 'text-accent-primary bg-background-secondary/50'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover/30'
            }`}
            onClick={() => setActiveTab('volumetrics')}
          >
            <BarChart2 className="h-4 w-4" />
            Volumetrics
            {activeTab === 'volumetrics' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
            )}
          </button>
          <button
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'radiomics'
                ? 'text-accent-primary bg-background-secondary/50'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover/30'
            }`}
            onClick={() => setActiveTab('radiomics')}
          >
            <Activity className="h-4 w-4" />
            Radiomics
            {activeTab === 'radiomics' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-accent-error-muted border border-accent-error/30 rounded-xl p-4 mb-4 animate-slide-up">
              <p className="text-accent-error text-sm">{error}</p>
            </div>
          )}
          {activeTab === 'volumetrics' ? (
            <VolumetricsTab data={volumetricsResult} />
          ) : (
            <RadiomicsTab data={radiomicsResult} />
          )}
        </div>
      </div>
    </div>
  );
}

function VolumetricsTab({ data }: { data: VolumetricsResult | null }) {
  if (!data) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-background-tertiary/50 flex items-center justify-center">
          <BarChart2 className="h-8 w-8 text-text-muted" />
        </div>
        <p className="text-text-secondary font-medium">No volumetrics data available.</p>
        <p className="text-text-muted text-sm mt-1">Click "Volumetrics" to compute measurements.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metadata Summary */}
      <div className="bg-gradient-to-br from-background-tertiary/60 to-background-tertiary/30 rounded-xl p-5 border border-border-subtle">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Image Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">Dimensions</span>
            <span className="text-text-primary font-mono font-medium">{data.metadata.image_dimensions.join(' × ')}</span>
          </div>
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">Voxel Spacing</span>
            <span className="text-text-primary font-mono font-medium">{data.metadata.voxel_spacing_mm.map(s => s.toFixed(2)).join(' × ')} mm</span>
          </div>
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">Voxel Volume</span>
            <span className="text-text-primary font-mono font-medium">{data.metadata.voxel_volume_mm3.toFixed(4)} mm³</span>
          </div>
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">Total Mask Voxels</span>
            <span className="text-text-primary font-mono font-medium">{data.metadata.total_mask_voxels.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Segments */}
      {data.volumetrics.segments.map((segment, index) => (
        <div key={segment.segment_index} className={`animate-stagger-fade-in stagger-${Math.min(index + 1, 8)}`}>
          <SegmentVolumetricsCard segment={segment} />
        </div>
      ))}
    </div>
  );
}

function SegmentVolumetricsCard({ segment }: { segment: SegmentVolumetrics }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-background-tertiary/20">
      <div
        className="flex items-center justify-between p-4 bg-gradient-to-r from-background-tertiary/50 to-transparent cursor-pointer hover:bg-background-hover/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </div>
          <span className="font-semibold text-text-primary">{segment.label}</span>
          <span className="text-xs text-text-muted px-2 py-0.5 bg-background-hover rounded-full">(Index: {segment.segment_index})</span>
        </div>
        <div className="text-right">
          <div className="text-text-primary font-semibold font-mono">{segment.total_volume_cm3.toFixed(2)} cm³</div>
          {segment.longest_axis_mm && (
            <div className="text-xs text-accent-primary font-medium">Longest: {segment.longest_axis_mm.toFixed(1)} mm</div>
          )}
          <div className="text-xs text-text-muted">{segment.instance_count} instance(s)</div>
        </div>
      </div>

      {/* Dimension summary when expanded */}
      {expanded && segment.dimensions_mm && (
        <div className="px-4 py-3 border-t border-border-subtle bg-background-secondary/30">
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-text-muted block mb-1">Dimensions (mm)</span>
              <span className="text-text-primary font-mono">{segment.dimensions_mm.map(d => d.toFixed(1)).join(' × ')}</span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">Longest Axis</span>
              <span className="text-text-primary font-mono font-medium">{segment.longest_axis_mm?.toFixed(1)} mm</span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">Max Diameter</span>
              <span className="text-text-primary font-mono">{segment.max_diameter_mm?.toFixed(1)} mm</span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">Volume</span>
              <span className="text-text-primary font-mono">{segment.total_volume_cm3.toFixed(3)} cm³</span>
            </div>
          </div>
        </div>
      )}

      {expanded && segment.instances.length > 0 && (
        <div className="p-4 border-t border-border-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border-subtle">
                <th className="pb-2 font-medium">Instance</th>
                <th className="pb-2 font-medium">Volume (cm³)</th>
                <th className="pb-2 font-medium">Voxels</th>
                <th className="pb-2 font-medium">Centroid (i, j, k)</th>
              </tr>
            </thead>
            <tbody>
              {segment.instances.map((instance) => (
                <tr key={instance.instance_id} className="text-text-primary border-b border-border-subtle/50 last:border-0">
                  <td className="py-2.5">{instance.instance_id}</td>
                  <td className="py-2.5 font-mono">{instance.volume_cm3.toFixed(4)}</td>
                  <td className="py-2.5 font-mono">{instance.voxel_count.toLocaleString()}</td>
                  <td className="py-2.5 font-mono text-xs text-text-secondary">{instance.centroid_ijk.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RadiomicsTab({ data }: { data: RadiomicsResult | null }) {
  if (!data) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-background-tertiary/50 flex items-center justify-center">
          <Activity className="h-8 w-8 text-text-muted" />
        </div>
        <p className="text-text-secondary font-medium">No radiomics data available.</p>
        <p className="text-text-muted text-sm mt-1">Click "Radiomics" to compute features.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metadata */}
      <div className="bg-gradient-to-br from-background-tertiary/60 to-background-tertiary/30 rounded-xl p-5 border border-border-subtle">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Computation Info</h3>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">PyRadiomics</span>
            <span className="text-text-primary font-mono font-medium">v{data.metadata.pyradiomics_version}</span>
          </div>
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">Features</span>
            <span className="text-text-primary font-mono font-medium">{data.metadata.feature_count}</span>
          </div>
          <div className="bg-background-secondary/50 rounded-lg p-3">
            <span className="text-text-muted block mb-1">Computation Time</span>
            <span className="text-text-primary font-mono font-medium">{data.metadata.computation_time_seconds.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* Segments */}
      {data.segments.map((segment, index) => (
        <div key={segment.segment_index} className={`animate-stagger-fade-in stagger-${Math.min(index + 1, 8)}`}>
          <SegmentRadiomicsCard segment={segment} />
        </div>
      ))}
    </div>
  );
}

function SegmentRadiomicsCard({ segment }: { segment: SegmentRadiomics }) {
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  const toggleClass = (className: string) => {
    const newSet = new Set(expandedClasses);
    if (newSet.has(className)) {
      newSet.delete(className);
    } else {
      newSet.add(className);
    }
    setExpandedClasses(newSet);
  };

  const featureClasses = [
    { key: 'firstorder', label: 'First Order Statistics', description: 'Intensity distribution metrics' },
    { key: 'shape', label: 'Shape (3D)', description: 'Geometric properties' },
    { key: 'glcm', label: 'GLCM', description: 'Gray Level Co-occurrence Matrix' },
    { key: 'glrlm', label: 'GLRLM', description: 'Gray Level Run Length Matrix' },
    { key: 'glszm', label: 'GLSZM', description: 'Gray Level Size Zone Matrix' },
    { key: 'ngtdm', label: 'NGTDM', description: 'Neighbouring Gray Tone Difference Matrix' },
    { key: 'gldm', label: 'GLDM', description: 'Gray Level Dependence Matrix' },
  ];

  if (segment.error) {
    return (
      <div className="border border-accent-error/30 rounded-xl p-4 bg-accent-error-muted">
        <span className="font-semibold text-text-primary">{segment.label}</span>
        <span className="text-xs text-text-muted ml-2">(Index: {segment.segment_index})</span>
        <p className="text-accent-error text-sm mt-2">Error: {segment.error}</p>
      </div>
    );
  }

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-background-tertiary/20">
      <div className="p-4 bg-gradient-to-r from-background-tertiary/50 to-transparent border-b border-border-subtle">
        <span className="font-semibold text-text-primary">{segment.label}</span>
        <span className="text-xs text-text-muted ml-2 px-2 py-0.5 bg-background-hover rounded-full">(Index: {segment.segment_index})</span>
      </div>

      <div className="p-4 space-y-2">
        {featureClasses.map(({ key, label, description }) => {
          const features = segment.features[key as keyof typeof segment.features];
          if (!features || Object.keys(features).length === 0) return null;

          const featureCount = Object.keys(features).length;
          const isExpanded = expandedClasses.has(key);

          return (
            <div key={key} className="border border-border-subtle rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-background-hover/30 transition-colors"
                onClick={() => toggleClass(key)}
              >
                <div className="flex items-center gap-2">
                  <div className={`transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                    <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{label}</span>
                  <span className="text-xs text-text-muted hidden sm:inline">- {description}</span>
                </div>
                <span className="text-xs text-text-muted px-2 py-0.5 bg-background-hover/50 rounded-full">{featureCount} features</span>
              </div>

              {isExpanded && (
                <div className="p-3 pt-0 border-t border-border-subtle bg-background-secondary/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    {Object.entries(features).map(([name, value]) => (
                      <div key={name} className="flex justify-between py-1.5 border-b border-border-subtle/30 last:border-0">
                        <span className="text-text-secondary truncate pr-2">{name}</span>
                        <span className="text-text-primary font-mono">
                          {typeof value === 'number' ? formatNumber(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper functions
function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000000 || (Math.abs(value) < 0.001 && value !== 0)) {
    return value.toExponential(4);
  }
  return value.toFixed(4);
}

function exportVolumetricsCSV(data: VolumetricsResult) {
  const rows: string[] = [
    'Segment Index,Label,Total Volume (cm³),Instance Count,Instance ID,Instance Volume (cm³),Voxel Count,Centroid I,Centroid J,Centroid K'
  ];

  data.volumetrics.segments.forEach(seg => {
    seg.instances.forEach(inst => {
      rows.push([
        seg.segment_index,
        `"${seg.label}"`,
        seg.total_volume_cm3.toFixed(4),
        seg.instance_count,
        inst.instance_id,
        inst.volume_cm3.toFixed(4),
        inst.voxel_count,
        inst.centroid_ijk[0],
        inst.centroid_ijk[1],
        inst.centroid_ijk[2],
      ].join(','));
    });
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  downloadBlob(blob, 'volumetrics_results.csv');
}

function exportRadiomicsCSV(data: RadiomicsResult) {
  // Collect all feature names
  const allFeatures: string[] = [];
  if (data.segments.length > 0) {
    Object.entries(data.segments[0].features).forEach(([className, features]) => {
      if (features) {
        Object.keys(features).forEach(featureName => {
          allFeatures.push(`${className}_${featureName}`);
        });
      }
    });
  }

  const rows: string[] = [`Segment Index,Label,${allFeatures.join(',')}`];

  data.segments.forEach(seg => {
    const values: string[] = [seg.segment_index.toString(), `"${seg.label}"`];
    Object.entries(seg.features).forEach(([, features]) => {
      if (features) {
        Object.values(features).forEach(value => {
          values.push(typeof value === 'number' ? value.toFixed(6) : String(value));
        });
      }
    });
    rows.push(values.join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  downloadBlob(blob, 'radiomics_results.csv');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
