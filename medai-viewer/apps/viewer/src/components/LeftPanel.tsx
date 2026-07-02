import React, { useState } from 'react';
import { useViewerStore, useIsLongitudinalActive, useActiveSession } from '@medai/core';
import { Image, Layers, FileImage, FolderOpen, ChevronRight, ChevronDown, User, Calendar, Activity, GitCompare, Clock } from 'lucide-react';
import { TimePointPanel, PatientStudiesPanel } from './left-panel';

export function LeftPanel() {
  const { images, activeImageId, setActiveImage, pacsStudy, activeSeriesUID, setActiveSeries } = useViewerStore();
  const [expandedStudy, setExpandedStudy] = useState(true);
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);

  // Longitudinal session state
  const isLongitudinalActive = useIsLongitudinalActive();
  const activeSession = useActiveSession();

  // Check if we have a PACS study loaded
  const hasPacsStudy = pacsStudy !== null;

  // Get local files (images not part of PACS study)
  const localImages = Array.from(images.entries()).filter(([id]) => !id.startsWith('pacs:'));

  return (
    <aside className="w-72 bg-gradient-to-b from-background-secondary to-background-primary border-r border-border-subtle flex flex-col">
      {/* Longitudinal Session Header (when active) */}
      {activeSession && (
        <div className="relative px-4 py-3 border-b border-accent-primary/30 bg-gradient-to-r from-accent-primary/10 to-accent-primary/5 flex-shrink-0">
          {/* Left accent line */}
          <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-gradient-to-b from-accent-primary via-accent-primary to-accent-primary/50 rounded-full" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-primary/20 flex items-center justify-center">
                <GitCompare className="h-4 w-4 text-accent-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-accent-primary tracking-tight">Longitudinal</h3>
                <p className="text-2xs text-text-muted truncate max-w-[140px]">
                  {activeSession.patientName || activeSession.patientId}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 text-2xs font-semibold text-accent-primary bg-accent-primary/15 rounded-full border border-accent-primary/30">
              {activeSession.timepoints.length} pts
            </span>
          </div>
        </div>
      )}

      {/* Panel Header with accent line */}
      <div className="relative px-4 py-3.5 border-b border-border-subtle bg-gradient-to-r from-background-tertiary/50 to-background-tertiary/30 flex-shrink-0">
        {/* Left accent line */}
        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-gradient-to-b from-accent-primary via-accent-primary/50 to-transparent rounded-full" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent-primary/10 flex items-center justify-center">
              <FolderOpen className="h-4 w-4 text-accent-primary" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary tracking-tight">Studies</h3>
          </div>
          {(hasPacsStudy || images.size > 0) && (
            <span className="px-2.5 py-1 text-2xs font-semibold text-accent-primary bg-accent-primary/10 rounded-full border border-accent-primary/20">
              {hasPacsStudy ? pacsStudy.series.length : images.size}
            </span>
          )}
        </div>
      </div>

      {/* Study List */}
      <div className="flex-1 overflow-y-auto scrollbar-on-hover p-3 space-y-2">
        {/* Longitudinal Panels (when session is active) */}
        {activeSession && (
          <div className="space-y-4 mb-4">
            {/* Timepoints Panel */}
            <div className="bg-background-tertiary/30 rounded-xl p-3 border border-border-subtle">
              <TimePointPanel />
            </div>

            {/* Patient Studies Panel (for adding more timepoints) */}
            <div className="bg-background-tertiary/30 rounded-xl p-3 border border-border-subtle">
              <PatientStudiesPanel />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 h-px bg-border-subtle" />
              <span className="text-2xs text-text-muted uppercase tracking-wider">Current Study</span>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>
          </div>
        )}

        {!hasPacsStudy && images.size === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-xl bg-background-tertiary/50 flex items-center justify-center mb-4">
              <Image className="h-6 w-6 text-text-muted" />
            </div>
            <p className="text-sm text-text-muted">No images loaded</p>
            <p className="text-xs text-text-disabled mt-1">Drop files or use Open</p>
          </div>
        ) : (
          <>
            {/* PACS Study Hierarchy */}
            {hasPacsStudy && (
              <div className="space-y-1">
                {/* Study Header */}
                <div
                  onClick={() => setExpandedStudy(!expandedStudy)}
                  className="group p-3 rounded-xl cursor-pointer bg-background-tertiary/50 border border-border-subtle hover:bg-background-hover transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {expandedStudy ? (
                      <ChevronDown className="h-4 w-4 text-accent-primary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-text-muted" />
                    )}
                    <span className="text-sm font-semibold text-text-primary truncate">
                      {pacsStudy.patientName || 'Unknown Patient'}
                    </span>
                  </div>

                  <div className="ml-6 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <User className="h-3 w-3" />
                      <span>ID: {pacsStudy.patientID}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(pacsStudy.studyDate)}</span>
                    </div>
                    {pacsStudy.studyDescription && (
                      <p className="text-xs text-text-muted truncate">
                        {pacsStudy.studyDescription}
                      </p>
                    )}
                  </div>
                </div>

                {/* Series List with staggered animations */}
                {expandedStudy && pacsStudy.series.map((series, index) => {
                  const isActiveSeries = series.seriesInstanceUID === activeSeriesUID;
                  const isExpanded = expandedSeries === series.seriesInstanceUID;
                  const seriesImage = images.get(series.imageIds[0]);
                  const staggerDelay = Math.min(index, 5); // Cap at 5 for performance

                  return (
                    <div
                      key={series.seriesInstanceUID}
                      className={`ml-3 animate-stagger-fade-in stagger-${staggerDelay}`}
                    >
                      <div
                        onClick={() => {
                          setActiveSeries(series.seriesInstanceUID);
                          if (series.imageIds[0]) {
                            setActiveImage(series.imageIds[0]);
                          }
                        }}
                        className={`
                          group p-3 rounded-lg cursor-pointer
                          transition-all duration-200 ease-out
                          border relative overflow-hidden
                          ${isActiveSeries
                            ? 'bg-gradient-to-br from-accent-primary/15 to-accent-primary/5 border-accent-primary/40 shadow-glow-sm'
                            : 'bg-background-tertiary/30 border-transparent hover:bg-background-hover hover:border-border-subtle hover:translate-y-[-1px]'
                          }
                        `}
                      >
                        {/* Active indicator gradient line */}
                        {isActiveSeries && (
                          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent-primary to-transparent" />
                        )}
                        {/* Series Icon */}
                        <div className={`
                          w-full h-14 rounded-lg mb-2
                          flex items-center justify-center
                          bg-gradient-to-br from-background-tertiary to-background-secondary
                          border border-border-subtle
                          ${isActiveSeries ? 'border-accent-primary/30' : ''}
                        `}>
                          <Layers className={`h-6 w-6 ${isActiveSeries ? 'text-accent-primary' : 'text-text-muted'}`} />
                        </div>

                        {/* Series Info */}
                        <p className={`text-sm font-medium truncate mb-1 ${isActiveSeries ? 'text-accent-primary' : 'text-text-primary'}`}>
                          {series.seriesDescription || `Series ${series.seriesNumber}`}
                        </p>

                        {/* Series Metadata */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 bg-background-tertiary/80 rounded text-2xs font-medium text-text-secondary uppercase">
                            {series.modality}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-2xs font-semibold ${
                            seriesImage?.metadata.dimensionality === '2D'
                              ? 'bg-cyan-500/15 text-cyan-400'
                              : 'bg-purple-500/15 text-purple-400'
                          }`}>
                            {seriesImage?.metadata.dimensionality || '3D'}
                          </span>
                          <span className="text-2xs text-text-muted">
                            {series.instanceCount} {series.instanceCount === 1 ? 'slice' : 'slices'}
                          </span>
                        </div>

                        {/* Dimensions if available */}
                        {seriesImage && (
                          <div className="mt-1.5 text-2xs text-text-muted font-mono">
                            {seriesImage.metadata.width}×{seriesImage.metadata.height}×{seriesImage.metadata.depth}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Local Files (non-PACS) */}
            {localImages.length > 0 && (
              <>
                {hasPacsStudy && (
                  <div className="text-xs font-medium text-text-muted uppercase tracking-wider mt-4 mb-2 px-1">
                    Local Files
                  </div>
                )}
                {localImages.map(([id, image], index) => {
                  const isActive = id === activeImageId;
                  const is3D = image.metadata.dimensionality === '3D';
                  const fileName = id.split(':')[1] || id;
                  const staggerDelay = Math.min(index, 5); // Cap at 5 for performance

                  return (
                    <div
                      key={id}
                      onClick={() => setActiveImage(id)}
                      className={`
                        group p-3 rounded-xl cursor-pointer
                        transition-all duration-200 ease-out
                        border relative overflow-hidden
                        animate-stagger-fade-in stagger-${staggerDelay}
                        ${isActive
                          ? 'bg-gradient-to-br from-accent-primary/15 to-accent-primary/5 border-accent-primary/40 shadow-glow-sm'
                          : 'bg-background-tertiary/30 border-transparent hover:bg-background-hover hover:border-border-subtle hover:translate-y-[-1px]'
                        }
                      `}
                    >
                      {/* Active indicator gradient line */}
                      {isActive && (
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent-primary to-transparent" />
                      )}
                      <div className={`
                        w-full h-16 rounded-lg mb-3
                        flex items-center justify-center
                        bg-gradient-to-br from-background-tertiary to-background-secondary
                        border border-border-subtle
                        ${isActive ? 'border-accent-primary/30' : 'group-hover:border-border-emphasis'}
                      `}>
                        {is3D ? (
                          <Layers className={`h-6 w-6 ${isActive ? 'text-accent-primary' : 'text-text-muted'}`} />
                        ) : (
                          <FileImage className={`h-6 w-6 ${isActive ? 'text-accent-primary' : 'text-text-muted'}`} />
                        )}
                      </div>

                      <p className={`text-sm font-medium truncate mb-2 ${isActive ? 'text-accent-primary' : 'text-text-primary'}`}>
                        {fileName}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 bg-background-tertiary/80 rounded text-2xs font-medium text-text-secondary uppercase">
                          {image.metadata.format}
                        </span>
                        {image.metadata.modality && (
                          <span className={`px-1.5 py-0.5 rounded text-2xs font-semibold uppercase ${
                            image.metadata.modality === 'MR' ? 'bg-blue-500/15 text-blue-400' :
                            image.metadata.modality === 'CT' ? 'bg-purple-500/15 text-purple-400' :
                            image.metadata.modality === 'PT' ? 'bg-pink-500/15 text-pink-400' :
                            'bg-zinc-500/15 text-zinc-400'
                          }`}>
                            {image.metadata.modality}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-2xs font-semibold ${is3D ? 'bg-purple-500/15 text-purple-400' : 'bg-accent-info-muted text-accent-info'}`}>
                          {image.metadata.dimensionality}
                        </span>
                        <span className="text-2xs text-text-muted font-mono">
                          {image.metadata.width}x{image.metadata.height}
                          {is3D && `x${image.metadata.depth}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * Format DICOM date (YYYYMMDD) to readable format
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr || 'Unknown Date';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${month}/${day}/${year}`;
}
