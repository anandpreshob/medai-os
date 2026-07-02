import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  AlertTriangle,
  Loader2,
  Download,
  Send,
  Image,
  BarChart3,
  Stethoscope,
  Activity,
  GitCompare,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
} from 'lucide-react';
import { Button, toast } from '@medai/ui';
import {
  useReportStore,
  ReportGenerationService,
  ReportSections,
} from '@medai/core';
import { MosaicPreview } from '../components/report/MosaicPreview';
import { ReportEditor } from '../components/report/ReportEditor';
import { DataPreview } from '../components/report/DataPreview';

// Server URL - use proxy to avoid CORS issues (same proxy as MONAI Label)
const MEDAI_SERVER_URL = '/monai';

/**
 * Get classification display properties
 */
function getClassificationDisplay(classification: string) {
  switch (classification) {
    case 'complete_response':
      return { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', label: 'Complete Response', Icon: CheckCircle };
    case 'partial_response':
      return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Partial Response', Icon: TrendingDown };
    case 'stable_disease':
      return { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Stable Disease', Icon: Minus };
    case 'progressive_disease':
      return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Progressive Disease', Icon: TrendingUp };
    default:
      return { color: 'text-text-muted', bg: 'bg-background-tertiary', border: 'border-border-subtle', label: 'Not Evaluable', Icon: AlertTriangle };
  }
}

export function ReportPage() {
  const navigate = useNavigate();
  const [reportService] = useState(() => new ReportGenerationService(MEDAI_SERVER_URL));

  const {
    currentReport,
    isGenerating,
    generationError,
    generationProgress,
    collectedData,
    editedSections,
    setCurrentReport,
    setGenerating,
    setGenerationError,
    updateEditedSection,
    addToHistory,
    updateCollectedFindings,
    toggleDetectionSelection,
    setSelectedDetectionIds,
    getSelectedDetections,
  } = useReportStore();

  // Check if this is a longitudinal report
  const isLongitudinalReport = !!(collectedData as any).longitudinal;
  const longitudinalData = (collectedData as any).longitudinal;

  const generateReport = async () => {
    if (!collectedData.mosaicImage) {
      toast.error('Missing Data', 'No image data available. Please return to the viewer.');
      return;
    }

    setGenerating(true, 10);

    try {
      setGenerating(true, 30);

      // Use longitudinal agent for longitudinal reports, otherwise detect based on modality
      const recommendedAgent = isLongitudinalReport
        ? 'longitudinal'
        : reportService.getRecommendedAgent(collectedData.modality);

      // Get selected detections for the report
      const selectedDetections = getSelectedDetections();

      // Debug logging
      console.log('[ReportPage] Generating report:', {
        modality: collectedData.modality,
        recommendedAgent,
        detectionsCount: selectedDetections.length,
        hasFindings: !!collectedData.findings,
        hasClinicalContext: !!collectedData.clinicalContext,
        isLongitudinal: isLongitudinalReport,
        timepointCount: longitudinalData?.timepoints?.length,
      });

      const report = await reportService.generateReport({
        mosaicImage: collectedData.mosaicImage,
        volumetrics: collectedData.volumetrics,
        radiomics: collectedData.radiomics,
        findings: collectedData.findings || 'No specific findings provided.',
        modality: collectedData.modality,
        agentType: recommendedAgent,
        patientInfo: collectedData.patientInfo,
        clinicalContext: collectedData.clinicalContext,
        detections: selectedDetections.length > 0 ? selectedDetections : undefined,
        longitudinal: longitudinalData,
      });

      setGenerating(true, 90);

      setCurrentReport(report);
      addToHistory(report);
      setGenerating(false);

      toast.success('Report Generated', 'AI report has been generated successfully.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setGenerationError(errorMessage);
      toast.error('Generation Failed', errorMessage);
    }
  };

  const handleEditSection = (key: keyof ReportSections, content: string) => {
    updateEditedSection(key, content);
  };

  const handleBackToViewer = () => {
    navigate('/viewer');
  };

  const handleExportPDF = () => {
    toast.info('Export', 'PDF export coming soon. Use "Copy Full Report" for now.');
  };

  const handleDownloadReport = () => {
    if (!currentReport) return;

    const sections = currentReport.sections;
    const reportText = [
      '# RADIOLOGY REPORT',
      `Generated: ${new Date(currentReport.generatedAt).toLocaleString()}`,
      `Agent: ${currentReport.agentType}`,
      '',
      '## CLINICAL HISTORY',
      (editedSections.clinicalHistory ?? sections.clinicalHistory) || 'N/A',
      '',
      '## TECHNIQUE',
      (editedSections.technique ?? sections.technique) || 'N/A',
      '',
      '## COMPARISON',
      (editedSections.comparison ?? sections.comparison) || 'N/A',
      '',
      '## RADIOLOGIST FINDINGS',
      (editedSections.findings ?? sections.findings) || 'N/A',
      '',
      '## AI FINDINGS',
      (editedSections.aiFindings ?? sections.aiFindings) || 'N/A',
      '',
      '## IMPRESSION',
      (editedSections.impression ?? sections.impression) || 'N/A',
      '',
      '## RECOMMENDATIONS',
      (editedSections.recommendations ?? sections.recommendations) || 'N/A',
      '',
      '---',
      'This report was generated with AI assistance and must be reviewed by a qualified radiologist.',
    ].join('\n');

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `radiology-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Downloaded', 'Report downloaded as text file');
  };

  const handleFindingsChange = (newFindings: string) => {
    updateCollectedFindings(newFindings);
  };

  const handleSelectAllDetections = () => {
    const allIds = (collectedData.detections || []).map((_, i) => `detection-${i}`);
    setSelectedDetectionIds(allIds);
  };

  const handleDeselectAllDetections = () => {
    setSelectedDetectionIds([]);
  };

  // Show loading state while generating
  if (isGenerating) {
    return (
      <div className="h-screen bg-background-primary flex items-center justify-center animate-fade-in">
        <div className="text-center max-w-md">
          <div className="relative mx-auto mb-6">
            <div className="w-16 h-16 border-2 border-accent-primary/20 rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-2 border-accent-primary border-t-transparent rounded-full animate-spin-smooth" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Generating Report</h2>
          <p className="text-text-secondary mb-6">
            The AI is analyzing your imaging data and generating a structured report...
          </p>
          <div className="w-full bg-background-tertiary rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-accent-primary to-accent-secondary h-2 rounded-full transition-all duration-300"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          <p className="text-sm text-text-muted mt-3 font-mono">{generationProgress}% complete</p>
        </div>
      </div>
    );
  }

  // Show empty state if no data
  if (!collectedData.mosaicImage && !currentReport) {
    return (
      <div className="h-screen bg-background-primary flex items-center justify-center animate-page-reveal">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-background-tertiary to-background-secondary flex items-center justify-center border border-border-subtle">
            <FileText className="h-10 w-10 text-text-muted" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">No Data Available</h2>
          <p className="text-text-secondary mb-6">
            Please return to the viewer, load an image with segmentation, and click "Generate Report".
          </p>
          <Button variant="default" onClick={handleBackToViewer} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go to Viewer
          </Button>
        </div>
      </div>
    );
  }

  // If we have a report, show the report editor view
  if (currentReport) {
    return (
      <div className="h-screen bg-background-primary flex flex-col animate-page-reveal">
        {/* Header */}
        <header className="h-16 bg-gradient-to-r from-background-secondary to-background-tertiary/80 border-b border-border-subtle flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBackToViewer} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Viewer
            </Button>
            <div className="w-px h-6 bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-accent-primary" />
              </div>
              <span className="font-semibold text-text-primary">AI Report</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={generateReport} disabled={isGenerating} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadReport} disabled={!currentReport} className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button variant="default" size="sm" onClick={handleExportPDF} disabled={!currentReport}>
              Export PDF
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex">
          {/* Left Panel - Mosaic Preview */}
          <div className="w-96 border-r border-border-subtle p-5 overflow-y-auto bg-gradient-to-b from-background-secondary to-background-primary">
            {/* Prefer overlaid image (with bounding boxes) over plain mosaic */}
            <MosaicPreview imageDataUrl={collectedData.overlaidImage || collectedData.mosaicImage} />

            {/* Report Metadata */}
            <div className="mt-5 p-4 bg-gradient-to-br from-background-tertiary/60 to-background-tertiary/30 rounded-xl border border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Report Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Generated</span>
                  <span className="text-text-secondary font-mono text-xs">
                    {new Date(currentReport.generatedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Agent</span>
                  <span className="text-text-secondary">{currentReport.agentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Modality</span>
                  <span className="text-text-secondary">{collectedData.modality}</span>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-5 p-4 bg-accent-warning-muted border border-accent-warning/30 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-warning/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-4 w-4 text-accent-warning" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-accent-warning">AI-Generated Content</p>
                  <p className="text-xs text-text-muted mt-1">
                    This report was generated by AI and must be reviewed and finalized by a qualified radiologist before clinical use.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Report Editor */}
          <div className="flex-1 p-6 overflow-y-auto">
            <ReportEditor
              sections={currentReport.sections}
              editedSections={editedSections}
              onEditSection={handleEditSection}
            />
          </div>
        </main>
      </div>
    );
  }

  // Show data preview mode - user can review data before generating
  return (
    <div className="h-screen bg-background-primary flex flex-col animate-page-reveal">
      {/* Header */}
      <header className="h-16 bg-gradient-to-r from-background-secondary to-background-tertiary/80 border-b border-border-subtle flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBackToViewer} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Viewer
          </Button>
          <div className="w-px h-6 bg-gradient-to-b from-transparent via-border-emphasis to-transparent" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-accent-primary" />
            </div>
            <span className="font-semibold text-text-primary">Report Generation</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={generateReport}
            disabled={isGenerating || !collectedData.mosaicImage}
            className="gap-2 btn-shine"
          >
            <Send className="h-4 w-4" />
            Generate AI Report
          </Button>
        </div>
      </header>

      {/* Main Content - Data Preview */}
      <main className="flex-1 overflow-hidden flex">
        {/* Left Panel - Mosaic Preview */}
        <div className="w-[450px] border-r border-border-subtle p-5 overflow-y-auto bg-gradient-to-b from-background-secondary to-background-primary">
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                <Image className="h-4 w-4 text-accent-primary" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Captured Image</h2>
            </div>
            {/* Prefer overlaid image (with bounding boxes) over plain mosaic */}
            <MosaicPreview imageDataUrl={collectedData.overlaidImage || collectedData.mosaicImage} />
          </div>

          {/* Error display */}
          {generationError && (
            <div className="mt-5 p-4 bg-accent-error-muted border border-accent-error/30 rounded-xl animate-slide-up">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-error/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-4 w-4 text-accent-error" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-accent-error">Generation Failed</p>
                  <p className="text-xs text-text-muted mt-1">{generationError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Longitudinal Summary (if applicable) */}
          {isLongitudinalReport && longitudinalData && (
            <div className="mt-5 p-4 bg-gradient-to-br from-accent-primary/10 to-accent-secondary/5 border border-accent-primary/30 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
                  <GitCompare className="h-4 w-4 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-accent-primary">Longitudinal Comparison</p>
                  <p className="text-xs text-text-muted">
                    {longitudinalData.timepoints?.length || 0} timepoints
                  </p>
                </div>
              </div>

              {/* Overall Classification */}
              {longitudinalData.overallClassification && (
                <div className="mb-3">
                  {(() => {
                    const display = getClassificationDisplay(longitudinalData.overallClassification);
                    return (
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${display.bg} border ${display.border}`}>
                        <display.Icon className={`w-4 h-4 ${display.color}`} />
                        <span className={`text-sm font-semibold ${display.color}`}>{display.label}</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Timepoint List */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Timepoints</span>
                {(longitudinalData.timepoints || []).map((tp: any, index: number) => (
                  <div key={tp.timepointId} className="flex items-center justify-between p-2 bg-background-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-sm text-text-primary">{tp.label}</span>
                      {index === 0 && (
                        <span className="px-1.5 py-0.5 text-2xs font-semibold bg-accent-info/20 text-accent-info rounded">
                          Baseline
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-text-muted">
                      {tp.studyDate?.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3/$1') || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-5 p-4 bg-accent-primary-muted border border-accent-primary/30 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
                <Stethoscope className="h-4 w-4 text-accent-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-accent-primary">Review & Generate</p>
                <p className="text-xs text-text-muted mt-1">
                  {isLongitudinalReport
                    ? 'Review the timepoint data below, then click "Generate AI Report" to create a comprehensive comparison report.'
                    : 'Review the captured data below. Edit your findings if needed, then click "Generate AI Report" to create a structured radiology report.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Data to be sent */}
        <div className="flex-1 p-6 overflow-y-auto">
          <DataPreview
            collectedData={collectedData}
            onFindingsChange={handleFindingsChange}
            onToggleDetectionSelection={toggleDetectionSelection}
            onSelectAllDetections={handleSelectAllDetections}
            onDeselectAllDetections={handleDeselectAllDetections}
          />
        </div>
      </main>
    </div>
  );
}
