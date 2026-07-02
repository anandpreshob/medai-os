/**
 * NeuroQCPanel - Neuro-specific quality control display
 *
 * Shows QC findings for:
 * - Image quality (motion, SNR, coverage)
 * - Skull strip quality
 * - Segmentation quality
 */

import React, { useMemo } from 'react';
import { useQCStore } from '@medai/core';
import { Panel, Button } from '@medai/ui';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Eye,
  RefreshCw,
} from 'lucide-react';

interface NeuroQCPanelProps {
  className?: string;
  onRerunQC?: () => void;
}

interface QCSeverityConfig {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  label: string;
}

const SEVERITY_CONFIG: Record<string, QCSeverityConfig> = {
  pass: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Pass',
  },
  warning: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Warning',
  },
  critical: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: <XCircle className="h-4 w-4" />,
    label: 'Critical',
  },
};

function QCMetricRow({
  label,
  value,
  severity,
  details,
}: {
  label: string;
  value: string | number;
  severity: 'pass' | 'warning' | 'critical';
  details?: string;
}) {
  const config = SEVERITY_CONFIG[severity];

  return (
    <div className={`p-2 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={config.color}>{config.icon}</span>
          <span className="text-sm text-text-primary">{label}</span>
        </div>
        <div className={`text-sm font-medium ${config.color}`}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </div>
      </div>
      {details && (
        <div className="mt-1 text-xs text-text-muted pl-6">{details}</div>
      )}
    </div>
  );
}

export function NeuroQCPanel({ className, onRerunQC }: NeuroQCPanelProps) {
  const { imageQC, segmentationQC, hasWarnings, hasCritical } = useQCStore();

  // Compute overall status
  const overallStatus = useMemo(() => {
    if (hasCritical()) return 'critical';
    if (hasWarnings()) return 'warning';
    return 'pass';
  }, [hasWarnings, hasCritical]);

  const overallConfig = SEVERITY_CONFIG[overallStatus];

  // Count issues
  const issueCount = useMemo(() => {
    let warnings = 0;
    let critical = 0;

    if (imageQC) {
      imageQC.findings.forEach((f) => {
        if (f.severity === 'warning') warnings++;
        if (f.severity === 'critical') critical++;
      });
    }

    segmentationQC.forEach((sqc) => {
      sqc.findings.forEach((f) => {
        if (f.severity === 'warning') warnings++;
        if (f.severity === 'critical') critical++;
      });
    });

    return { warnings, critical };
  }, [imageQC, segmentationQC]);

  if (!imageQC && segmentationQC.length === 0) {
    return (
      <Panel
        title="Quality Control"
        className={className}
        collapsible
        defaultCollapsed
        actions={<ShieldCheck className="h-4 w-4 text-text-muted" />}
      >
        <div className="text-center py-4">
          <ShieldCheck className="h-8 w-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No QC data available.</p>
          <p className="text-text-muted text-xs mt-1">
            Run segmentation to assess quality.
          </p>
          {onRerunQC && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRerunQC}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Run QC Assessment
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Quality Control"
      className={className}
      collapsible
      badge={
        issueCount.critical > 0
          ? issueCount.critical
          : issueCount.warnings > 0
          ? issueCount.warnings
          : undefined
      }
      actions={
        overallStatus === 'pass' ? (
          <ShieldCheck className="h-4 w-4 text-green-400" />
        ) : (
          <ShieldAlert className={`h-4 w-4 ${overallConfig.color}`} />
        )
      }
    >
      {/* Overall Status */}
      <div
        className={`mb-4 p-3 rounded-lg border ${overallConfig.bgColor} ${overallConfig.borderColor}`}
      >
        <div className="flex items-center gap-2">
          <span className={overallConfig.color}>{overallConfig.icon}</span>
          <span className={`font-medium ${overallConfig.color}`}>
            {overallStatus === 'pass'
              ? 'All Quality Checks Passed'
              : overallStatus === 'warning'
              ? `${issueCount.warnings} Warning${issueCount.warnings !== 1 ? 's' : ''}`
              : `${issueCount.critical} Critical Issue${issueCount.critical !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Image QC */}
      {imageQC && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-text-muted" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Image Quality
            </span>
          </div>
          <div className="space-y-2">
            <QCMetricRow
              label="Motion"
              value={imageQC.motionScore}
              severity={
                imageQC.motionScore > 70
                  ? 'critical'
                  : imageQC.motionScore > 40
                  ? 'warning'
                  : 'pass'
              }
              details={
                imageQC.motionScore > 70
                  ? 'Significant motion artifacts detected'
                  : imageQC.motionScore > 40
                  ? 'Mild motion artifacts present'
                  : 'No significant motion'
              }
            />
            <QCMetricRow
              label="SNR"
              value={imageQC.snrEstimate}
              severity={
                imageQC.snrEstimate < 8
                  ? 'critical'
                  : imageQC.snrEstimate < 15
                  ? 'warning'
                  : 'pass'
              }
              details={
                imageQC.snrEstimate >= 25
                  ? 'Excellent signal quality'
                  : imageQC.snrEstimate >= 15
                  ? 'Good signal quality'
                  : imageQC.snrEstimate >= 8
                  ? 'Marginal signal quality'
                  : 'Poor signal quality'
              }
            />
            <QCMetricRow
              label="Coverage"
              value={imageQC.coveragePercent + '%'}
              severity={
                imageQC.coveragePercent < 90
                  ? 'critical'
                  : imageQC.coveragePercent < 95
                  ? 'warning'
                  : 'pass'
              }
              details={
                imageQC.coveragePercent < 90
                  ? 'Incomplete brain coverage'
                  : imageQC.coveragePercent < 95
                  ? 'Minor truncation detected'
                  : 'Full brain coverage'
              }
            />
            {imageQC.skullStripQuality !== undefined && (
              <QCMetricRow
                label="Skull Strip"
                value={imageQC.skullStripQuality}
                severity={
                  imageQC.skullStripQuality < 60
                    ? 'critical'
                    : imageQC.skullStripQuality < 80
                    ? 'warning'
                    : 'pass'
                }
                details={
                  imageQC.skullStripQuality < 60
                    ? 'Poor skull stripping - manual review needed'
                    : imageQC.skullStripQuality < 80
                    ? 'Acceptable skull stripping'
                    : 'Good skull stripping'
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Segmentation QC */}
      {segmentationQC.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-text-muted" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Segmentation Quality
            </span>
          </div>
          <div className="space-y-2">
            {segmentationQC.map((sqc) => {
              const hasCriticalFinding = sqc.findings.some(
                (f) => f.severity === 'critical'
              );
              const hasWarningFinding = sqc.findings.some(
                (f) => f.severity === 'warning'
              );
              const severity = hasCriticalFinding
                ? 'critical'
                : hasWarningFinding
                ? 'warning'
                : 'pass';
              const config = SEVERITY_CONFIG[severity];

              return (
                <div
                  key={sqc.segmentId}
                  className={`p-2 rounded-lg ${config.bgColor} border ${config.borderColor}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <span className="text-sm text-text-primary">
                        {sqc.segmentLabel}
                      </span>
                    </div>
                    <span className={`text-xs ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  {sqc.findings.length > 0 && (
                    <ul className="mt-1 pl-6 space-y-0.5">
                      {sqc.findings.map((finding, idx) => (
                        <li
                          key={idx}
                          className={`text-xs ${
                            finding.severity === 'critical'
                              ? 'text-red-400'
                              : finding.severity === 'warning'
                              ? 'text-amber-400'
                              : 'text-text-muted'
                          }`}
                        >
                          {finding.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QC Legend */}
      <div className="pt-3 border-t border-border-subtle">
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
            <div key={key} className={`flex items-center gap-1 ${config.color}`}>
              {config.icon}
              <span>{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rerun QC */}
      {onRerunQC && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3"
          onClick={onRerunQC}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Rerun QC Assessment
        </Button>
      )}
    </Panel>
  );
}

export default NeuroQCPanel;
