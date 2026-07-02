/**
 * RECISTAssessmentTable - RECIST 1.1 response assessment summary table
 *
 * Features:
 * - Complete assessment overview with all components
 * - Visual response classification display
 * - SLD tracking with change indicators
 * - Save and export assessment functionality
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Save,
  Download,
  Copy,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Activity,
  Calendar,
  User,
  Lock,
  ClipboardCheck,
} from 'lucide-react';
import { Panel, Button } from '@medai/ui';
import {
  useRECISTStore,
  useTargetLesions,
  useNonTargetLesions,
  useNewLesions,
  useSLDMetrics,
  type RECISTAssessment,
  type RECISTOverallResponse,
  getResponseLabel,
  getResponseColorClass,
} from '@medai/core';

interface RECISTAssessmentTableProps {
  /** Current timepoint/study identifier */
  timepointId?: string;
  /** Assessment date */
  assessmentDate?: string;
}

/**
 * Get response badge component.
 */
function ResponseBadge({
  response,
  size = 'md',
}: {
  response: RECISTOverallResponse;
  size?: 'sm' | 'md' | 'lg';
}) {
  const colorClass = getResponseColorClass(response);
  const label = getResponseLabel(response);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${colorClass.text} ${colorClass.bg} ${colorClass.border} ${sizeClasses[size]}`}
    >
      {response}
      <span className="font-normal opacity-75">- {label}</span>
    </span>
  );
}

/**
 * SLD trend indicator.
 */
function SLDTrendIndicator({ changePercent }: { changePercent: number }) {
  if (changePercent <= -30) {
    return (
      <div className="flex items-center gap-1 text-green-400">
        <TrendingDown className="w-4 h-4" />
        <span className="font-mono">{changePercent.toFixed(1)}%</span>
      </div>
    );
  }
  if (changePercent >= 20) {
    return (
      <div className="flex items-center gap-1 text-red-400">
        <TrendingUp className="w-4 h-4" />
        <span className="font-mono">+{changePercent.toFixed(1)}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-yellow-400">
      <Minus className="w-4 h-4" />
      <span className="font-mono">{changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%</span>
    </div>
  );
}

/**
 * Assessment row component.
 */
function AssessmentRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'bg-accent-primary/5 -mx-3 px-3 rounded' : ''}`}>
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

/**
 * Target lesion summary table.
 */
function TargetLesionSummary() {
  const targetLesions = useTargetLesions();
  const sldMetrics = useSLDMetrics();

  if (targetLesions.length === 0) {
    return (
      <div className="text-center py-4 text-text-muted text-sm">
        No target lesions selected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border-subtle">
            <th className="py-1 text-left font-medium">Lesion</th>
            <th className="py-1 text-right font-medium">Baseline</th>
            <th className="py-1 text-right font-medium">Current</th>
            <th className="py-1 text-right font-medium">SLD</th>
          </tr>
        </thead>
        <tbody>
          {targetLesions.map((lesion, index) => {
            const baseline = lesion.isLymphNode
              ? (lesion.baselineShortAxisMm ?? 0)
              : lesion.baselineLongestDiameterMm;
            const current = lesion.isLymphNode
              ? (lesion.currentShortAxisMm ?? lesion.baselineShortAxisMm ?? 0)
              : (lesion.currentLongestDiameterMm ?? lesion.baselineLongestDiameterMm);

            return (
              <tr key={lesion.id} className="border-b border-border-subtle/50">
                <td className="py-1.5">
                  <span className="text-accent-primary font-mono">T{index + 1}</span>
                  <span className="ml-1 text-text-secondary truncate max-w-[100px] inline-block align-middle">
                    {lesion.label || lesion.anatomicalRegion}
                  </span>
                  {lesion.isLymphNode && (
                    <span className="ml-1 text-2xs text-text-muted">(LN)</span>
                  )}
                </td>
                <td className="py-1.5 text-right font-mono text-text-secondary">
                  {baseline.toFixed(1)}
                </td>
                <td className="py-1.5 text-right font-mono text-text-secondary">
                  {current.toFixed(1)}
                </td>
                <td className="py-1.5 text-right font-mono text-text-primary font-medium">
                  {current.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="py-2 text-text-primary">Total SLD</td>
            <td className="py-2 text-right font-mono text-text-secondary">
              {sldMetrics.baselineSLD.toFixed(1)} mm
            </td>
            <td className="py-2 text-right font-mono text-text-primary">
              {sldMetrics.currentSLD.toFixed(1)} mm
            </td>
            <td className="py-2 text-right">
              <SLDTrendIndicator changePercent={sldMetrics.changeFromBaseline} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * RECISTAssessmentTable component.
 */
export function RECISTAssessmentTable({
  timepointId,
  assessmentDate,
}: RECISTAssessmentTableProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  // RECIST store
  const targetLesions = useTargetLesions();
  const nonTargetLesions = useNonTargetLesions();
  const newLesions = useNewLesions();
  const sldMetrics = useSLDMetrics();
  const computeAssessment = useRECISTStore((state) => state.computeAssessment);
  const saveAssessment = useRECISTStore((state) => state.saveAssessment);
  const setBaseline = useRECISTStore((state) => state.setBaseline);
  const isRECISTModeActive = useRECISTStore((state) => state.isRECISTModeActive);
  const baselineSLD = useRECISTStore((state) => state.baselineSLD);

  // Compute current assessment
  const assessment = useMemo(() => computeAssessment(), [computeAssessment, targetLesions, nonTargetLesions, newLesions]);

  // Get non-target overall status display
  const nonTargetStatusDisplay = useMemo(() => {
    if (!assessment) return 'N/A';
    switch (assessment.nonTargetOverallStatus) {
      case 'absent':
        return 'Absent (CR)';
      case 'present':
        return 'Present';
      case 'unequivocal_progression':
        return 'Progression';
      default:
        return 'N/A';
    }
  }, [assessment]);

  const handleSaveAssessment = useCallback(() => {
    if (!assessment) return;

    const id = saveAssessment({
      timepointId: timepointId || `tp-${Date.now()}`,
      assessmentDate: assessmentDate || new Date().toISOString().split('T')[0],
      notes: assessmentNotes || undefined,
      isBaseline: baselineSLD === 0,
      reviewedBy: reviewerName || undefined,
    });

    if (id) {
      setShowSaveForm(false);
      setAssessmentNotes('');
      setReviewerName('');
    }
  }, [assessment, saveAssessment, timepointId, assessmentDate, assessmentNotes, baselineSLD, reviewerName]);

  const handleSetBaseline = useCallback(() => {
    setBaseline();
  }, [setBaseline]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!assessment) return;

    const text = `
RECIST 1.1 Assessment
=====================
Date: ${assessmentDate || new Date().toISOString().split('T')[0]}

OVERALL RESPONSE: ${assessment.overallResponse} - ${getResponseLabel(assessment.overallResponse)}

Target Lesions: ${assessment.targetLesions.length}
Sum of Longest Diameters: ${assessment.sumOfLongestDiameters.toFixed(1)} mm
Baseline SLD: ${assessment.baselineSLD.toFixed(1)} mm
Change from Baseline: ${assessment.sldChangeFromBaseline.toFixed(1)}%
Target Response: ${assessment.targetResponse}

Non-Target Lesions: ${assessment.nonTargetLesions.length}
Non-Target Status: ${nonTargetStatusDisplay}
Non-Target Response: ${assessment.nonTargetResponse}

New Lesions: ${assessment.newLesions.length}
${assessment.hasNewLesions ? '*** NEW LESIONS DETECTED - INDICATES PROGRESSIVE DISEASE ***' : 'No new lesions detected'}

${assessmentNotes ? `Notes: ${assessmentNotes}` : ''}
    `.trim();

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [assessment, assessmentDate, nonTargetStatusDisplay, assessmentNotes]);

  const handleExportJSON = useCallback(() => {
    if (!assessment) return;

    const data = {
      ...assessment,
      exportDate: new Date().toISOString(),
      notes: assessmentNotes,
      reviewedBy: reviewerName,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recist-assessment-${assessmentDate || new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [assessment, assessmentDate, assessmentNotes, reviewerName]);

  if (!isRECISTModeActive) {
    return null;
  }

  const hasData = targetLesions.length > 0 || nonTargetLesions.length > 0 || newLesions.length > 0;

  return (
    <div className="mt-4">
      <Panel
        title="RECIST Assessment"
        collapsible
        actions={
          <Activity className="h-4 w-4 text-accent-primary" />
        }
      >
        {!hasData ? (
          <div className="text-center py-8">
            <ClipboardCheck className="w-12 h-12 mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-muted">No lesions tracked yet</p>
            <p className="text-xs text-text-disabled mt-1">
              Add target or non-target lesions to generate assessment
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overall Response Banner */}
            {assessment && (
              <div className="p-4 bg-background-tertiary/50 rounded-xl border border-border-subtle">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-muted">Overall Response</span>
                  {assessment.isBaseline && (
                    <span className="text-2xs text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded">
                      BASELINE
                    </span>
                  )}
                </div>
                <ResponseBadge response={assessment.overallResponse} size="lg" />
              </div>
            )}

            {/* Target Lesion Summary */}
            <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-text-primary">Target Lesions</span>
                <span className="text-xs text-text-muted">{targetLesions.length} lesion{targetLesions.length !== 1 ? 's' : ''}</span>
              </div>
              <TargetLesionSummary />

              {assessment && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <AssessmentRow
                    label="Target Response"
                    value={
                      <span className={`font-semibold ${getResponseColorClass(assessment.targetResponse as RECISTOverallResponse).text}`}>
                        {assessment.targetResponse}
                      </span>
                    }
                  />
                </div>
              )}
            </div>

            {/* Non-Target Summary */}
            <div className="p-3 bg-background-tertiary/30 rounded-lg border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary">Non-Target Lesions</span>
                <span className="text-xs text-text-muted">{nonTargetLesions.length} lesion{nonTargetLesions.length !== 1 ? 's' : ''}</span>
              </div>
              {assessment && (
                <>
                  <AssessmentRow label="Overall Status" value={nonTargetStatusDisplay} />
                  <AssessmentRow
                    label="Non-Target Response"
                    value={
                      <span className={assessment.nonTargetResponse === 'PD' ? 'text-red-400' : 'text-text-primary'}>
                        {assessment.nonTargetResponse}
                      </span>
                    }
                  />
                </>
              )}
            </div>

            {/* New Lesions */}
            <div className={`p-3 rounded-lg border ${newLesions.length > 0 ? 'bg-red-500/5 border-red-500/30' : 'bg-background-tertiary/30 border-border-subtle'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary">New Lesions</span>
                <span className={`text-xs ${newLesions.length > 0 ? 'text-red-400 font-medium' : 'text-text-muted'}`}>
                  {newLesions.length} detected
                </span>
              </div>
              {newLesions.length > 0 && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>New lesions indicate Progressive Disease (PD)</span>
                </div>
              )}
              {newLesions.length === 0 && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>No new lesions detected</span>
                </div>
              )}
            </div>

            {/* Save/Export Actions */}
            {showSaveForm ? (
              <div className="p-3 bg-background-tertiary/50 rounded-lg border border-border-subtle space-y-3">
                <div className="text-sm font-medium text-text-primary">Save Assessment</div>

                <div>
                  <label className="text-xs text-text-muted block mb-1">Reviewer Name</label>
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none"
                    placeholder="Dr. Smith"
                  />
                </div>

                <div>
                  <label className="text-xs text-text-muted block mb-1">Notes</label>
                  <textarea
                    value={assessmentNotes}
                    onChange={(e) => setAssessmentNotes(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-background-secondary border border-border-subtle rounded focus:border-accent-primary focus:outline-none resize-none"
                    rows={3}
                    placeholder="Additional assessment notes..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowSaveForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveAssessment}>
                    <Save className="w-3.5 h-3.5 mr-1" />
                    Save Assessment
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {baselineSLD === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSetBaseline}
                    className="flex-1"
                  >
                    <Lock className="w-3.5 h-3.5 mr-1" />
                    Set as Baseline
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveForm(true)}
                  className="flex-1"
                  disabled={!hasData}
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyToClipboard}
                  disabled={!hasData}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  {copySuccess ? 'Copied!' : 'Copy'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  disabled={!hasData}
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  JSON
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default RECISTAssessmentTable;
