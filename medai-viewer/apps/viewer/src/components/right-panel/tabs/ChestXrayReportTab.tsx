import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Send,
  Camera,
  CheckCircle,
  AlertCircle,
  Scan,
  ClipboardList,
} from 'lucide-react';
import { Button, toast } from '@medai/ui';
import {
  useDetectionStore,
  useViewerStore,
  useFindingsStore,
  useReportStore,
} from '@medai/core';

/**
 * ChestXrayReportTab - Report generation controls for chest X-ray suite
 *
 * Shows summary of collected data and allows navigation to report generation:
 * - AI detections count and summary
 * - Radiologist findings
 * - Viewport capture preview
 * - "Generate Report" button to navigate to ReportPage
 */
export function ChestXrayReportTab() {
  const navigate = useNavigate();
  const { activeImageId, images } = useViewerStore();
  const { getFindings, getImageFindings } = useFindingsStore();
  const { getReportDetections } = useDetectionStore();
  const {
    setCollectedData,
    setMosaicImage,
    collectedData,
  } = useReportStore();

  const activeImage = activeImageId ? images.get(activeImageId) : undefined;
  const findings = activeImageId ? getFindings(activeImageId) : '';
  const imageFindings = activeImageId ? getImageFindings(activeImageId) : undefined;
  const clinicalContext = imageFindings?.clinicalContext || '';

  // Get detections marked for report
  const reportDetections = useMemo(() => {
    return activeImageId ? getReportDetections(activeImageId) : [];
  }, [activeImageId, getReportDetections]);

  // Check readiness for report generation
  const hasDetections = reportDetections.length > 0;
  const hasFindings = !!findings && findings.trim().length > 0;
  const hasImage = !!activeImage;

  // Capture viewport as base64 image
  const captureViewport = useCallback(async (): Promise<string | null> => {
    if (!activeImage) return null;

    try {
      // Get the viewport canvas element
      const viewportElement = document.querySelector('[data-testid="viewport-2d-canvas"]') as HTMLCanvasElement;

      if (viewportElement && viewportElement.tagName === 'CANVAS') {
        return viewportElement.toDataURL('image/png');
      }

      // Fallback: create image from raw data
      const imageData = activeImage.pixelData;
      if (!imageData) return null;

      const canvas = document.createElement('canvas');
      const width = activeImage.metadata.width;
      const height = activeImage.metadata.height;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const imageDataArray = new Uint8ClampedArray(width * height * 4);
      const pixelData = imageData instanceof Float32Array ? imageData : new Float32Array(imageData);

      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < pixelData.length; i++) {
        if (pixelData[i] < min) min = pixelData[i];
        if (pixelData[i] > max) max = pixelData[i];
      }
      const range = max - min || 1;

      for (let i = 0; i < pixelData.length; i++) {
        const normalized = Math.floor(((pixelData[i] - min) / range) * 255);
        imageDataArray[i * 4] = normalized;
        imageDataArray[i * 4 + 1] = normalized;
        imageDataArray[i * 4 + 2] = normalized;
        imageDataArray[i * 4 + 3] = 255;
      }

      const imgData = new ImageData(imageDataArray, width, height);
      ctx.putImageData(imgData, 0, 0);

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to capture viewport:', error);
      return null;
    }
  }, [activeImage]);

  // Handle draft report button click
  const handleDraftReport = useCallback(async () => {
    if (!activeImage || !activeImageId) {
      toast.error('No Image', 'Please load a chest X-ray image first.');
      return;
    }

    // Capture viewport image
    const mosaicImage = await captureViewport();
    if (!mosaicImage) {
      toast.error('Capture Failed', 'Failed to capture viewport image.');
      return;
    }

    // Prepare report data
    setMosaicImage(mosaicImage);
    setCollectedData({
      mosaicImage,
      findings: findings || '',
      modality: activeImage.metadata.modality || 'CR',
      patientInfo: {
        studyDescription: activeImage.metadata.studyDescription,
      },
      clinicalContext: clinicalContext || undefined,
    });

    // Navigate to report page
    navigate('/report');
    toast.success('Data Collected', 'Navigate to report page to generate AI report.');
  }, [
    activeImage,
    activeImageId,
    captureViewport,
    findings,
    clinicalContext,
    setMosaicImage,
    setCollectedData,
    navigate,
  ]);

  // Status item component
  const StatusItem = ({
    icon: Icon,
    label,
    ready,
    count,
    description,
  }: {
    icon: React.ElementType;
    label: string;
    ready: boolean;
    count?: number;
    description?: string;
  }) => (
    <div
      className={`
        flex items-start gap-2 p-2.5 rounded-lg border transition-colors
        ${ready
          ? 'bg-green-500/5 border-green-500/30'
          : 'bg-background-tertiary/50 border-border-subtle'
        }
      `}
    >
      <div
        className={`
          w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
          ${ready ? 'bg-green-500/20' : 'bg-background-tertiary'}
        `}
      >
        <Icon
          className={`h-3.5 w-3.5 ${ready ? 'text-green-400' : 'text-text-muted'}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              ready ? 'text-green-400' : 'text-text-secondary'
            }`}
          >
            {label}
          </span>
          {count !== undefined && (
            <span
              className={`
                text-xs px-1.5 py-0.5 rounded
                ${ready ? 'bg-green-500/20 text-green-400' : 'bg-background-tertiary text-text-muted'}
              `}
            >
              {count}
            </span>
          )}
          {ready && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
        </div>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
          <ClipboardList className="h-4 w-4 text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Report Data</h3>
          <p className="text-xs text-text-muted">Review before generating</p>
        </div>
      </div>

      {/* Status checklist */}
      <div className="space-y-2">
        <StatusItem
          icon={Camera}
          label="Image Loaded"
          ready={hasImage}
          description={
            hasImage
              ? `${activeImage?.metadata.width}x${activeImage?.metadata.height} ${activeImage?.metadata.modality || 'X-ray'}`
              : 'Load a chest X-ray image'
          }
        />

        <StatusItem
          icon={Scan}
          label="AI Detections"
          ready={hasDetections}
          count={reportDetections.length}
          description={
            hasDetections
              ? `${reportDetections.length} finding(s) to include`
              : 'Run detection to identify abnormalities'
          }
        />

        <StatusItem
          icon={FileText}
          label="Radiologist Findings"
          ready={hasFindings}
          description={
            hasFindings
              ? `${findings?.split('\n').filter(Boolean).length || 0} observation(s)`
              : 'Add your observations in Findings tab'
          }
        />
      </div>

      {/* Detection summary */}
      {hasDetections && (
        <div className="p-3 bg-background-tertiary rounded-lg">
          <p className="text-xs font-medium text-text-secondary mb-2">
            Detections to include:
          </p>
          <div className="flex flex-wrap gap-1">
            {reportDetections.slice(0, 5).map((det) => (
              <span
                key={det.id}
                className="text-xs px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary"
              >
                {det.label}
              </span>
            ))}
            {reportDetections.length > 5 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-background-secondary text-text-muted">
                +{reportDetections.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="p-3 bg-accent-primary/5 border border-accent-primary/30 rounded-lg">
        <p className="text-xs text-text-muted">
          <span className="font-medium text-accent-primary">Next:</span>{' '}
          Click "Draft Report" to capture the current view and navigate to the
          report generation page where you can review and generate an AI-powered
          radiology report.
        </p>
      </div>

      {/* Generate button */}
      <Button
        className="w-full btn-shine"
        disabled={!hasImage}
        onClick={handleDraftReport}
        data-testid="draft-report-button"
      >
        <Send className="h-4 w-4 mr-2" />
        Draft Report
      </Button>

      {/* Readiness indicator */}
      <div className="flex items-center justify-center gap-2 text-xs">
        {hasImage && hasDetections && hasFindings ? (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            <span className="text-green-400">Ready for report generation</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-text-muted">
              {!hasImage
                ? 'Load an image to continue'
                : !hasDetections
                ? 'Run AI detection (optional)'
                : 'Add findings (optional)'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
