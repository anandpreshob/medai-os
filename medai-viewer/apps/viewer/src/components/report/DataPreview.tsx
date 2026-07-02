import React, { useState } from 'react';
import {
  BarChart3,
  Activity,
  FileText,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
  Info,
  User,
  Calendar,
  Scan,
  ClipboardList,
  Cpu,
} from 'lucide-react';
import { Button } from '@medai/ui';
import { CollectedReportData, VolumetricsResult, RadiomicsResult } from '@medai/core';
import { DetectionsReview } from './DetectionsReview';

interface DataPreviewProps {
  collectedData: CollectedReportData;
  onFindingsChange: (findings: string) => void;
  onToggleDetectionSelection?: (id: string) => void;
  onSelectAllDetections?: () => void;
  onDeselectAllDetections?: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden mb-4">
      <div
        className="flex items-center justify-between px-4 py-3 bg-background-secondary cursor-pointer hover:bg-background-hover transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-text-primary">{title}</span>
          {badge && (
            <span className="text-xs bg-accent-primary/20 text-accent-primary px-2 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-text-muted" />
        ) : (
          <ChevronDown className="h-5 w-5 text-text-muted" />
        )}
      </div>
      {isOpen && <div className="p-4 bg-background-primary">{children}</div>}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm text-text-primary font-medium">
        {value !== undefined && value !== null ? String(value) : 'N/A'}
      </span>
    </div>
  );
}

// Helper to extract volumetrics summary from the nested structure
function getVolumetricsSummary(volumetrics: VolumetricsResult | null) {
  if (!volumetrics?.volumetrics?.segments?.length) {
    return null;
  }

  const firstSegment = volumetrics.volumetrics.segments[0];
  const firstInstance = firstSegment.instances?.[0];

  return {
    totalVolume_mm3: firstSegment.total_volume_mm3,
    totalVolume_cc: firstSegment.total_volume_cm3,
    voxelCount: firstSegment.total_voxel_count,
    instanceCount: firstSegment.instance_count,
    centroid: firstInstance?.centroid_ijk,
    boundingBox: firstInstance?.bounding_box,
    label: firstSegment.label,
  };
}

// Helper to extract radiomics features from the nested structure
function getRadiomicsFeatures(radiomics: RadiomicsResult | null) {
  if (!radiomics?.segments?.length) {
    return null;
  }

  const firstSegment = radiomics.segments[0];
  return {
    shape: firstSegment.features?.shape,
    firstorder: firstSegment.features?.firstorder,
    glcm: firstSegment.features?.glcm,
    glrlm: firstSegment.features?.glrlm,
    glszm: firstSegment.features?.glszm,
    label: firstSegment.label,
  };
}

export function DataPreview({
  collectedData,
  onFindingsChange,
  onToggleDetectionSelection,
  onSelectAllDetections,
  onDeselectAllDetections,
}: DataPreviewProps) {
  const [isEditingFindings, setIsEditingFindings] = useState(false);
  const [localFindings, setLocalFindings] = useState(collectedData.findings || '');

  const handleSaveFindings = () => {
    onFindingsChange(localFindings);
    setIsEditingFindings(false);
  };

  const handleCancelEdit = () => {
    setLocalFindings(collectedData.findings || '');
    setIsEditingFindings(false);
  };

  const volumetricsSummary = getVolumetricsSummary(collectedData.volumetrics);
  const radiomicsFeatures = getRadiomicsFeatures(collectedData.radiomics);

  const hasVolumetrics = volumetricsSummary !== null;
  const hasRadiomics = radiomicsFeatures !== null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">Data to be Sent to AI</h2>
      </div>

      <p className="text-sm text-text-muted mb-6">
        The following data will be sent to the AI for report generation. Review and edit as needed.
      </p>

      {/* Patient Info */}
      {collectedData.patientInfo && (
        <CollapsibleSection
          title="Patient Information"
          icon={<User className="h-5 w-5 text-blue-400" />}
          defaultOpen={true}
        >
          <div className="space-y-1">
            <DataRow label="Patient Name" value={collectedData.patientInfo.patientName} />
            <DataRow label="Patient ID" value={collectedData.patientInfo.patientId} />
            <DataRow label="Study Date" value={collectedData.patientInfo.studyDate} />
            <DataRow label="Study Description" value={collectedData.patientInfo.studyDescription} />
          </div>
        </CollapsibleSection>
      )}

      {/* Modality */}
      <CollapsibleSection
        title="Imaging Modality"
        icon={<Scan className="h-5 w-5 text-purple-400" />}
        defaultOpen={true}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-accent-primary">{collectedData.modality || 'Unknown'}</span>
          <span className="text-sm text-text-muted">
            {collectedData.modality === 'MR' && 'Magnetic Resonance Imaging'}
            {collectedData.modality === 'CT' && 'Computed Tomography'}
            {collectedData.modality === 'US' && 'Ultrasound'}
            {collectedData.modality === 'MG' && 'Mammography'}
            {collectedData.modality === 'XR' && 'X-Ray'}
            {collectedData.modality === 'CR' && 'Computed Radiography (Chest X-Ray)'}
            {collectedData.modality === 'DX' && 'Digital X-Ray'}
            {collectedData.modality === 'PT' && 'PET Scan'}
            {collectedData.modality === 'NM' && 'Nuclear Medicine'}
          </span>
        </div>
      </CollapsibleSection>

      {/* Clinical Context */}
      {collectedData.clinicalContext !== undefined && (
        <CollapsibleSection
          title="Clinical Context"
          icon={<ClipboardList className="h-5 w-5 text-yellow-400" />}
          badge={collectedData.clinicalContext ? 'Provided' : 'Empty'}
          defaultOpen={true}
        >
          {collectedData.clinicalContext ? (
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {collectedData.clinicalContext}
            </p>
          ) : (
            <div className="flex items-start gap-2 text-text-muted">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                No clinical context provided. Add patient history and indication in the Findings panel.
              </p>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Findings */}
      <CollapsibleSection
        title="Radiologist Findings"
        icon={<FileText className="h-5 w-5 text-green-400" />}
        badge={collectedData.findings ? 'Provided' : 'Empty'}
        defaultOpen={true}
      >
        {isEditingFindings ? (
          <div className="space-y-3">
            <textarea
              value={localFindings}
              onChange={(e) => setLocalFindings(e.target.value)}
              className="w-full h-32 px-3 py-2 bg-background-secondary border border-border-subtle rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Enter your clinical findings, observations, and any relevant notes..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSaveFindings}>
                <Check className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative group">
            {collectedData.findings ? (
              <p className="text-sm text-text-secondary whitespace-pre-wrap pr-16">
                {collectedData.findings}
              </p>
            ) : (
              <p className="text-sm text-text-muted italic">
                No findings provided. Click edit to add your clinical observations.
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingFindings(true)}
              className="absolute top-0 right-0"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </div>
        )}
      </CollapsibleSection>

      {/* Detections (AI and Manual) */}
      {(collectedData.detections?.length || 0) > 0 && (
        <CollapsibleSection
          title="Detections"
          icon={<Scan className="h-5 w-5 text-violet-400" />}
          badge={`${collectedData.selectedDetectionIds?.length || 0} selected`}
          defaultOpen={true}
        >
          <DetectionsReview
            detections={collectedData.detections || []}
            selectedIds={collectedData.selectedDetectionIds || []}
            onToggleSelection={onToggleDetectionSelection || (() => {})}
            onSelectAll={onSelectAllDetections || (() => {})}
            onDeselectAll={onDeselectAllDetections || (() => {})}
          />
        </CollapsibleSection>
      )}

      {/* Volumetrics */}
      <CollapsibleSection
        title="Volumetric Analysis"
        icon={<BarChart3 className="h-5 w-5 text-orange-400" />}
        badge={hasVolumetrics ? 'Computed' : 'Not Available'}
        defaultOpen={hasVolumetrics}
      >
        {hasVolumetrics && volumetricsSummary ? (
          <div className="space-y-1">
            {volumetricsSummary.label && (
              <DataRow label="Segment Label" value={volumetricsSummary.label} />
            )}
            {volumetricsSummary.totalVolume_cc !== undefined && (
              <DataRow
                label="Total Volume"
                value={`${volumetricsSummary.totalVolume_cc.toFixed(2)} cc`}
              />
            )}
            {volumetricsSummary.totalVolume_mm3 !== undefined && (
              <DataRow
                label="Total Volume (mm³)"
                value={`${volumetricsSummary.totalVolume_mm3.toFixed(2)} mm³`}
              />
            )}
            {volumetricsSummary.voxelCount !== undefined && (
              <DataRow label="Voxel Count" value={volumetricsSummary.voxelCount.toLocaleString()} />
            )}
            {volumetricsSummary.instanceCount !== undefined && (
              <DataRow label="Instance Count" value={volumetricsSummary.instanceCount} />
            )}
            {volumetricsSummary.centroid && (
              <DataRow
                label="Centroid (IJK)"
                value={volumetricsSummary.centroid.map((c: number) => Math.round(c)).join(', ')}
              />
            )}
            {volumetricsSummary.boundingBox && (
              <DataRow
                label="Bounding Box Min"
                value={volumetricsSummary.boundingBox[0].map((v: number) => Math.round(v)).join(', ')}
              />
            )}
            {volumetricsSummary.boundingBox && (
              <DataRow
                label="Bounding Box Max"
                value={volumetricsSummary.boundingBox[1].map((v: number) => Math.round(v)).join(', ')}
              />
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-text-muted">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">
              No volumetric data available. Compute volumetrics in the viewer to include measurements in the report.
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* Radiomics */}
      <CollapsibleSection
        title="Radiomics Features"
        icon={<Activity className="h-5 w-5 text-cyan-400" />}
        badge={hasRadiomics ? 'Computed' : 'Not Available'}
        defaultOpen={false}
      >
        {hasRadiomics && radiomicsFeatures ? (
          <div className="space-y-4">
            {radiomicsFeatures.label && (
              <DataRow label="Segment Label" value={radiomicsFeatures.label} />
            )}

            {/* Shape Features */}
            {radiomicsFeatures.shape && Object.keys(radiomicsFeatures.shape).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Shape Features</h4>
                <div className="space-y-1 pl-2 border-l-2 border-cyan-400/30">
                  {Object.entries(radiomicsFeatures.shape).slice(0, 5).map(([key, value]) => (
                    <DataRow
                      key={key}
                      label={key.replace(/([A-Z])/g, ' $1').trim()}
                      value={typeof value === 'number' ? value.toFixed(4) : String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* First Order Features */}
            {radiomicsFeatures.firstorder && Object.keys(radiomicsFeatures.firstorder).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">First Order Features</h4>
                <div className="space-y-1 pl-2 border-l-2 border-cyan-400/30">
                  {Object.entries(radiomicsFeatures.firstorder).slice(0, 5).map(([key, value]) => (
                    <DataRow
                      key={key}
                      label={key.replace(/([A-Z])/g, ' $1').trim()}
                      value={typeof value === 'number' ? value.toFixed(4) : String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* GLCM Features */}
            {radiomicsFeatures.glcm && Object.keys(radiomicsFeatures.glcm).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">GLCM Features</h4>
                <div className="space-y-1 pl-2 border-l-2 border-cyan-400/30">
                  {Object.entries(radiomicsFeatures.glcm).slice(0, 5).map(([key, value]) => (
                    <DataRow
                      key={key}
                      label={key.replace(/([A-Z])/g, ' $1').trim()}
                      value={typeof value === 'number' ? value.toFixed(4) : String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-text-muted mt-2">
              Showing first 5 features per category. Full radiomics data will be sent to the AI.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-text-muted">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">
              No radiomics data available. Compute radiomics in the viewer to include texture features in the report.
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* Summary */}
      <div className="mt-6 p-4 bg-background-secondary rounded-lg">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Data Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${collectedData.mosaicImage ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-text-secondary">Image Capture</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${collectedData.findings ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-text-secondary">Radiologist Observations</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${collectedData.clinicalContext ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-text-secondary">Clinical Context</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${(collectedData.detections?.length || 0) > 0 ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-text-secondary">Detections</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${hasVolumetrics ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-text-secondary">Volumetrics</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${hasRadiomics ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-text-secondary">Radiomics</span>
          </div>
        </div>
      </div>
    </div>
  );
}
