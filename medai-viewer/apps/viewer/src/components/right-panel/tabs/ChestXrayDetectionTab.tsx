import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scan,
  Loader2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Zap,
  RefreshCw,
  FileText,
  PenTool,
  X,
} from 'lucide-react';
import { Button, toast } from '@medai/ui';
import {
  useDetectionStore,
  useViewerStore,
  useReportStore,
  useFindingsStore,
  useIsLongitudinalActive,
  useActiveSession,
  useActiveTimepoints,
  ChestXrayDetectionService,
  isFeatureEnabled,
  Detection,
} from '@medai/core';
import { DetectionsListPanel } from '../panels/DetectionsListPanel';
import { capture2DViewportWithOverlay, capture2DViewport } from '../../../lib/viewportCapture';

// Server URL from environment or proxy
const MEDAI_SERVER_URL = '/monai';

interface ChestXrayDetectionTabProps {
  isConnected?: boolean;
  hasImage?: boolean;
  imageModality?: string;
}

/**
 * ChestXrayDetectionTab - AI detection controls for chest X-ray analysis
 *
 * Features:
 * - Run MedGemma detection to identify abnormalities
 * - Display detection results with confidence scores
 * - Toggle visibility of detection overlays
 * - Service health status indicator
 */
export function ChestXrayDetectionTab({
  isConnected = true,
  hasImage = false,
  imageModality,
}: ChestXrayDetectionTabProps) {
  const navigate = useNavigate();
  const [service] = useState(() => new ChestXrayDetectionService(MEDAI_SERVER_URL));
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'ready' | 'loading' | 'unavailable'>('checking');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);
  const [isCapturing, setIsCapturing] = useState(false);

  const { activeImageId, images } = useViewerStore();
  const { setCollectedData, resetCollectedData } = useReportStore();
  const { getRadiologistObservations, getImageFindings } = useFindingsStore();
  const {
    detections,
    isDetecting,
    detectionProgress,
    detectionError,
    aiDescription,
    processingTimeMs,
    isDrawingMode,
    startDetection,
    setDetectionProgress,
    setDetectionError,
    setDetections,
    toggleAllVisibility,
    getDetectionsForImage,
    setDrawingMode,
  } = useDetectionStore();

  const activeImage = activeImageId ? images.get(activeImageId) : undefined;
  const currentDetections = activeImageId ? getDetectionsForImage(activeImageId) : [];
  const hasDetections = currentDetections.length > 0;
  const allVisible = currentDetections.every((d) => d.visible);

  // Count AI vs Manual detections
  const aiDetections = currentDetections.filter((d) => d.source === 'ai');
  const manualDetections = currentDetections.filter((d) => d.source === 'manual');

  // Longitudinal session state
  const isLongitudinalActive = useIsLongitudinalActive();
  const activeSession = useActiveSession();
  const activeTimepoints = useActiveTimepoints();

  // Get current timepoint label for the active image
  const currentTimepoint = activeTimepoints.find(tp => tp.imageId === activeImageId);
  const currentTimepointLabel = currentTimepoint?.label || 'Current Study';

  // Check service health on mount
  useEffect(() => {
    const checkService = async () => {
      try {
        const health = await service.checkHealth();
        if (health.status === 'healthy') {
          setServiceStatus(health.model_loaded ? 'ready' : 'loading');
        } else {
          setServiceStatus('unavailable');
        }
      } catch {
        setServiceStatus('unavailable');
      }
    };

    checkService();
    // Check periodically
    const interval = setInterval(checkService, 30000);
    return () => clearInterval(interval);
  }, [service]);

  // Run detection
  const handleRunDetection = useCallback(async () => {
    if (!activeImage || !activeImageId) return;

    startDetection();
    setDetectionProgress(10);

    try {
      // Get the pixel data from the loaded image
      const rawPixelData = activeImage.pixelData;
      if (!rawPixelData) {
        throw new Error('No image data available');
      }

      setDetectionProgress(30);

      // Convert image data to base64 PNG
      const canvas = document.createElement('canvas');
      const width = activeImage.metadata.width;
      const height = activeImage.metadata.height;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      // Convert ArrayBuffer to typed array based on dataType
      const dataType = activeImage.metadata.dataType;
      let pixelData: Float32Array | Uint8Array | Int16Array | Uint16Array;

      switch (dataType) {
        case 'uint8':
          pixelData = new Uint8Array(rawPixelData);
          break;
        case 'int16':
          pixelData = new Int16Array(rawPixelData);
          break;
        case 'uint16':
          pixelData = new Uint16Array(rawPixelData);
          break;
        case 'float32':
          pixelData = new Float32Array(rawPixelData);
          break;
        default:
          pixelData = new Uint8Array(rawPixelData);
      }

      // Create ImageData for canvas (RGBA format)
      const imageDataArray = new Uint8ClampedArray(width * height * 4);

      // Find min/max for normalization
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < pixelData.length; i++) {
        if (pixelData[i] < min) min = pixelData[i];
        if (pixelData[i] > max) max = pixelData[i];
      }
      const range = max - min || 1;

      // Convert to RGBA (grayscale to RGB)
      for (let i = 0; i < pixelData.length; i++) {
        const normalized = Math.floor(((pixelData[i] - min) / range) * 255);
        imageDataArray[i * 4] = normalized;     // R
        imageDataArray[i * 4 + 1] = normalized; // G
        imageDataArray[i * 4 + 2] = normalized; // B
        imageDataArray[i * 4 + 3] = 255;        // A
      }

      const imgData = new ImageData(imageDataArray, width, height);
      ctx.putImageData(imgData, 0, 0);

      const base64Image = canvas.toDataURL('image/png');
      setDetectionProgress(50);

      // Call detection service
      console.log('[Detection] Running detection with threshold:', confidenceThreshold);
      const result = await service.runDetection(base64Image, confidenceThreshold);
      console.log('[Detection] Results:', result.detections.length, 'detections');
      setDetectionProgress(90);

      // Store results
      setDetections(
        activeImageId,
        result.detections,
        result.description,
        result.processingTimeMs
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Detection failed';
      setDetectionError(errorMessage);
    }
  }, [
    activeImage,
    activeImageId,
    service,
    confidenceThreshold,
    startDetection,
    setDetectionProgress,
    setDetections,
    setDetectionError,
  ]);

  // Toggle all visibility
  const handleToggleAll = useCallback(() => {
    if (activeImageId) {
      toggleAllVisibility(activeImageId, !allVisible);
    }
  }, [activeImageId, allVisible, toggleAllVisibility]);

  // Handle Draft Report - capture viewport with overlays and collect detection data
  const handleDraftReport = useCallback(async () => {
    if (!activeImageId || !hasDetections) {
      toast.error('No Detections', 'Run detection first before drafting a report');
      return;
    }

    setIsCapturing(true);

    try {
      // Reset collected data
      resetCollectedData();

      // Get the current image metadata
      const image = images.get(activeImageId);
      const modality = image?.metadata?.modality || 'CR';

      // Get radiologist findings for this image
      const findings = getRadiologistObservations(activeImageId);

      // Get clinical context
      const imageFindings = getImageFindings(activeImageId);
      const clinicalContext = imageFindings?.clinicalContext || '';

      // Capture viewport with bounding box overlay
      const overlaidImage = await capture2DViewportWithOverlay();

      // Also capture plain viewport as fallback
      const mosaicImage = await capture2DViewport();

      if (!overlaidImage && !mosaicImage) {
        toast.error('Capture Failed', 'Failed to capture viewport images');
        return;
      }

      // Convert detections to report format, including source
      const reportDetections = currentDetections.map((det) => ({
        label: det.label,
        confidence: det.confidence,
        x_min: det.x_min,
        y_min: det.y_min,
        x_max: det.x_max,
        y_max: det.y_max,
        source: det.source, // 'ai' or 'manual'
      }));

      // Collect all data for report generation
      setCollectedData({
        mosaicImage: mosaicImage || overlaidImage,
        overlaidImage: overlaidImage || mosaicImage,
        volumetrics: null,
        radiomics: null,
        findings: findings || '',
        modality,
        patientInfo: image?.metadata ? {
          patientName: image.metadata.patientName,
          studyDate: undefined,
          studyDescription: image.metadata.seriesDescription,
        } : undefined,
        clinicalContext,
        detections: reportDetections,
        // Include AI description in findings if no radiologist findings
        ...(aiDescription && !findings ? { findings: aiDescription } : {}),
      });

      // Navigate to report page
      navigate('/report');

    } catch (error) {
      console.error('[ChestXrayDetectionTab] Failed to prepare report data:', error);
      toast.error('Error', 'Failed to prepare report data');
    } finally {
      setIsCapturing(false);
    }
  }, [
    activeImageId,
    hasDetections,
    currentDetections,
    aiDescription,
    images,
    getRadiologistObservations,
    getImageFindings,
    setCollectedData,
    resetCollectedData,
    navigate,
  ]);

  // Get service status indicator
  const getStatusIndicator = () => {
    switch (serviceStatus) {
      case 'ready':
        return (
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            <span className="text-xs">MedGemma Ready</span>
          </div>
        );
      case 'loading':
        return (
          <div className="flex items-center gap-1.5 text-yellow-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Model Loading...</span>
          </div>
        );
      case 'unavailable':
        return (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-xs">Service Unavailable</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Checking...</span>
          </div>
        );
    }
  };

  // Allow running detection when service is healthy (ready or loading - lazy load)
  const canRunDetection = hasImage && (serviceStatus === 'ready' || serviceStatus === 'loading') && !isDetecting;

  return (
    <div className="space-y-4">
      {/* Longitudinal Timepoint Header */}
      {isLongitudinalActive && activeSession && (
        <div className="p-3 bg-gradient-to-r from-accent-primary/10 to-transparent border border-accent-primary/30 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-accent-primary uppercase tracking-wide">
              Active Timepoint
            </span>
            <span className="text-xs text-text-muted">
              {activeTimepoints.length} of {activeSession.timepoints.length} loaded
            </span>
          </div>
          <div className="text-sm font-medium text-text-primary">
            {currentTimepointLabel}
          </div>
          {currentTimepoint?.studyDate && (
            <div className="text-xs text-text-muted mt-0.5">
              {currentTimepoint.studyDate.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3/$1')}
            </div>
          )}
        </div>
      )}

      {/* Service Status */}
      <div className="flex items-center justify-between">
        {getStatusIndicator()}
        {serviceStatus === 'unavailable' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setServiceStatus('checking')}
            className="h-6 px-2"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Confidence Threshold */}
      <div>
        <label className="text-text-secondary text-xs mb-1.5 block">
          Confidence Threshold: {Math.round(confidenceThreshold * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={confidenceThreshold * 100}
          onChange={(e) => setConfidenceThreshold(Number(e.target.value) / 100)}
          className="w-full h-1.5 bg-background-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
          disabled={isDetecting}
        />
        <div className="flex justify-between text-xs text-text-muted mt-0.5">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-text-muted text-xs">
        {!hasImage
          ? 'Load a chest X-ray image to run AI detection.'
          : serviceStatus === 'unavailable'
          ? 'MedGemma service is unavailable. Check server connection.'
          : serviceStatus === 'loading'
          ? 'Model will load on first request (may take longer initially).'
          : 'Click Run Detection to identify abnormalities with bounding boxes.'}
      </p>

      {/* Error Display */}
      {detectionError && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-xs">{detectionError}</p>
        </div>
      )}

      {/* Drawing Mode Instructions */}
      {isDrawingMode && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-400 text-sm font-medium">Drawing Mode Active</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDrawingMode(false)}
              className="h-6 w-6 p-0 text-purple-400 hover:text-purple-300"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-purple-300/80 text-xs">
            Click and drag on the image to draw a bounding box around a finding.
          </p>
        </div>
      )}

      {/* Detection Buttons - Run AI Detection and Draw Finding */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!canRunDetection || isDrawingMode}
          onClick={handleRunDetection}
          data-testid="run-detection-button"
        >
          {isDetecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {detectionProgress}%
            </>
          ) : (
            <>
              <Scan className="h-4 w-4 mr-2" />
              Run AI
            </>
          )}
        </Button>
        <Button
          className={`flex-1 ${isDrawingMode ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
          variant={isDrawingMode ? 'default' : 'outline'}
          disabled={!hasImage || isDetecting}
          onClick={() => setDrawingMode(!isDrawingMode)}
          data-testid="draw-finding-button"
        >
          <PenTool className="h-4 w-4 mr-2" />
          {isDrawingMode ? 'Drawing...' : 'Draw Finding'}
        </Button>
      </div>

      {/* Detection Results Summary */}
      {hasDetections && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-text-primary">
              Results ({currentDetections.length})
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleAll}
              className="h-6 px-2"
            >
              {allVisible ? (
                <EyeOff className="h-3.5 w-3.5 mr-1" />
              ) : (
                <Eye className="h-3.5 w-3.5 mr-1" />
              )}
              {allVisible ? 'Hide All' : 'Show All'}
            </Button>
          </div>

          {/* AI vs Manual detection counts */}
          {(aiDetections.length > 0 || manualDetections.length > 0) && (
            <div className="flex gap-3 text-xs">
              {aiDetections.length > 0 && (
                <span className="text-text-muted">
                  <Scan className="h-3 w-3 inline mr-1" />
                  AI: {aiDetections.length}
                </span>
              )}
              {manualDetections.length > 0 && (
                <span className="text-purple-400">
                  <PenTool className="h-3 w-3 inline mr-1" />
                  Manual: {manualDetections.length}
                </span>
              )}
            </div>
          )}

          {/* Processing time */}
          {processingTimeMs && (
            <div className="flex items-center gap-1.5 text-text-muted text-xs">
              <Zap className="h-3 w-3" />
              <span>Processed in {(processingTimeMs / 1000).toFixed(1)}s</span>
            </div>
          )}

          {/* Detection count by confidence level */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
              <div className="text-lg font-bold text-green-400">
                {currentDetections.filter((d) => d.confidence >= 0.8).length}
              </div>
              <div className="text-xs text-green-400/70">High</div>
            </div>
            <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
              <div className="text-lg font-bold text-yellow-400">
                {currentDetections.filter((d) => d.confidence >= 0.5 && d.confidence < 0.8).length}
              </div>
              <div className="text-xs text-yellow-400/70">Medium</div>
            </div>
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
              <div className="text-lg font-bold text-red-400">
                {currentDetections.filter((d) => d.confidence < 0.5).length}
              </div>
              <div className="text-xs text-red-400/70">Low</div>
            </div>
          </div>

          {/* Detections List - Individual detection controls */}
          <div className="mt-3 border border-border-subtle rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-background-tertiary/50 border-b border-border-subtle">
              <h5 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Detections
              </h5>
              <p className="text-xs text-text-muted mt-0.5">
                Click to select • Drag to move • Use handles to resize
              </p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {activeImageId && <DetectionsListPanel imageId={activeImageId} />}
            </div>
          </div>
        </div>
      )}

      {/* AI Description Preview */}
      {aiDescription && (
        <div className="mt-4 p-3 bg-background-secondary/80 border border-border-subtle rounded-lg">
          <h4 className="text-xs font-semibold text-accent-primary mb-2">AI Findings</h4>
          <div className="text-sm text-text-primary space-y-2 ai-findings-content max-h-40 overflow-y-auto">
            {aiDescription.split('\n').map((line, idx) => {
              // Skip empty lines
              if (!line.trim()) return null;

              // Parse markdown-style formatting
              let formattedLine = line
                // Bold: **text** or __text__
                .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
                .replace(/__([^_]+)__/g, '<strong class="font-semibold text-text-primary">$1</strong>')
                // Italic: *text* or _text_
                .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic">$1</em>')
                .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em class="italic">$1</em>');

              // Check for headings (lines starting with **)
              const isHeading = line.trim().startsWith('**') && line.trim().endsWith('**');

              // Check for list items
              const isBullet = /^\s*[\*\-•]\s/.test(line);
              const isNumbered = /^\s*\d+\.\s/.test(line);

              if (isHeading) {
                const headingText = line.replace(/\*\*/g, '').trim();
                return (
                  <div key={idx} className="font-semibold text-text-primary mt-3 first:mt-0 border-b border-border-subtle pb-1">
                    {headingText}
                  </div>
                );
              }

              if (isBullet || isNumbered) {
                const cleanedLine = line.replace(/^\s*[\*\-•]\s*/, '').replace(/^\s*\d+\.\s*/, '');
                return (
                  <div
                    key={idx}
                    className="pl-3 text-text-secondary flex gap-2"
                    dangerouslySetInnerHTML={{
                      __html: `<span class="text-accent-primary">${isNumbered ? line.match(/^\s*(\d+)\./)?.[1] + '.' : '•'}</span> ${cleanedLine.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-medium text-text-primary">$1</strong>')}`
                    }}
                  />
                );
              }

              return (
                <div
                  key={idx}
                  className="text-text-secondary"
                  dangerouslySetInnerHTML={{ __html: formattedLine }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Draft Report Button - appears after detection (requires reports feature) */}
      {hasDetections && isFeatureEnabled('reports') && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <Button
            className="w-full bg-accent-primary hover:bg-accent-primary/90"
            onClick={handleDraftReport}
            disabled={isCapturing}
            data-testid="draft-report-button"
          >
            {isCapturing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Draft Report
              </>
            )}
          </Button>
          <p className="text-xs text-text-muted mt-2 text-center">
            Generate AI radiology report with {currentDetections.length} detection{currentDetections.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
