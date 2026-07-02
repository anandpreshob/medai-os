/**
 * SortableStudyCard - Draggable study card for triaged worklist
 *
 * Provides:
 * - Drag handle for reordering
 * - Priority badge showing triage level
 * - Hover tooltip with AI reasoning
 * - Visual feedback during drag
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  User,
  Calendar,
  Layers,
  FileText,
  ArrowRight,
  Info,
} from 'lucide-react';
import type { TriagedStudy } from '@medai/core';
import { PriorityBadge, PriorityRank } from './PriorityBadge';

// Modality badge colors (same as StudyBrowserPage)
const MODALITY_COLORS: Record<string, string> = {
  CT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  MR: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  US: 'bg-green-500/20 text-green-400 border-green-500/30',
  XR: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  PT: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  NM: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CR: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  DX: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  MG: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  default: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

interface SortableStudyCardProps {
  study: TriagedStudy;
  onClick: () => void;
  showTriageInfo?: boolean;
}

export function SortableStudyCard({
  study,
  onClick,
  showTriageInfo = true,
}: SortableStudyCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: study.studyUID });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDate = (date: string) => {
    if (!date || date.length !== 8) return date;
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    return `${month}/${day}/${year}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative
        bg-gradient-to-br from-background-tertiary/50 to-background-secondary/30
        border border-border-subtle rounded-2xl p-5
        cursor-pointer
        transition-all duration-300
        hover:border-accent-primary/40 hover:shadow-lg hover:shadow-accent-primary/5
        ${isDragging
          ? 'opacity-75 scale-105 shadow-2xl z-50 border-accent-primary/60'
          : 'hover:-translate-y-0.5'
        }
        study-card-accent
      `}
      onClick={onClick}
    >
      {/* Drag handle */}
      {showTriageInfo && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-text-muted hover:text-text-primary" />
        </div>
      )}

      {/* Content with left padding for drag handle */}
      <div className={showTriageInfo ? 'pl-6' : ''}>
        {/* Top row: Patient info + Priority badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Priority rank */}
            {showTriageInfo && (
              <PriorityRank
                rank={study.priorityRank}
                level={study.triageLevel}
              />
            )}

            {/* Patient avatar */}
            <div className="w-10 h-10 rounded-xl bg-background-hover/50 flex items-center justify-center flex-shrink-0 border border-border-subtle group-hover:border-accent-primary/30 transition-colors">
              <User className="w-5 h-5 text-text-muted group-hover:text-accent-primary transition-colors" />
            </div>

            {/* Patient name & ID */}
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-text-primary truncate group-hover:text-accent-primary transition-colors">
                {(study.patientName || 'Unknown Patient').replace('^', ' ')}
              </h3>
              <p className="text-xs text-text-muted font-mono">
                ID: {study.patientID || 'Unknown'}
              </p>
            </div>
          </div>

          {/* Priority badge + Modality */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {showTriageInfo && (
              <PriorityBadge level={study.triageLevel} size="sm" />
            )}
            {study.modality && (
              <span
                className={`px-2 py-1 text-[10px] font-bold uppercase rounded-lg border ${MODALITY_COLORS[study.modality] || MODALITY_COLORS.default}`}
              >
                {study.modality}
              </span>
            )}
          </div>
        </div>

        {/* Study description */}
        <p className="text-sm text-text-secondary mb-3 line-clamp-2 min-h-[2.5rem]">
          {study.studyDescription || 'No description available'}
        </p>


        {/* Bottom row: Metadata + AI rationale tooltip + Action */}
        <div className="flex items-center justify-between">
          {/* Metadata chips */}
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {study.studyDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(study.studyDate)}
              </span>
            )}
          </div>

          {/* AI Rationale tooltip trigger */}
          {showTriageInfo && study.rationale && (
            <div className="relative group/tooltip">
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-accent-primary bg-background-tertiary/50 rounded-lg transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="w-3.5 h-3.5" />
                <span>AI Reasoning</span>
              </button>

              {/* Tooltip */}
              <div className="absolute bottom-full right-0 mb-2 w-72 p-3 bg-background-secondary border border-border-emphasis rounded-xl shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 z-50">
                <h4 className="text-xs font-semibold text-text-primary mb-2">
                  Priority Rationale
                </h4>
                <p className="text-xs text-text-secondary mb-2">
                  {study.rationale}
                </p>
                {study.keyFactors.length > 0 && (
                  <>
                    <h5 className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">
                      Key Factors
                    </h5>
                    <ul className="space-y-0.5">
                      {study.keyFactors.slice(0, 4).map((factor, i) => (
                        <li key={i} className="text-[11px] text-text-secondary">
                          • {factor}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="mt-2 pt-2 border-t border-border-subtle">
                  <span className="text-[10px] text-text-muted">
                    Score: {study.priorityScore.toFixed(1)} / 100
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action button */}
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent-primary bg-accent-primary/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-accent-primary/20"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            Open
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Non-sortable version for date order view
 */
export function StudyCardSimple({
  study,
  onClick,
}: {
  study: TriagedStudy;
  onClick: () => void;
}) {
  return (
    <SortableStudyCard
      study={study}
      onClick={onClick}
      showTriageInfo={false}
    />
  );
}

export default SortableStudyCard;
