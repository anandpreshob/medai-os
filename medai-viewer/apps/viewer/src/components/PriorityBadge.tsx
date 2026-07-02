/**
 * PriorityBadge - Visual indicator for study triage priority level
 *
 * Displays colored badges for STAT, URGENT, SEMI-URGENT, and ROUTINE studies
 * with appropriate icons and hover tooltips.
 */

import React from 'react';
import { AlertTriangle, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import type { TriageLevel } from '@medai/core';

interface PriorityBadgeProps {
  level: TriageLevel;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const BADGE_CONFIG: Record<TriageLevel, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
  borderColor: string;
  glowColor: string;
}> = {
  STAT: {
    label: 'STAT',
    icon: AlertTriangle,
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/40',
    glowColor: 'shadow-red-500/20',
  },
  URGENT: {
    label: 'Urgent',
    icon: Clock,
    bgColor: 'bg-orange-500/20',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-500/40',
    glowColor: 'shadow-orange-500/20',
  },
  SEMI_URGENT: {
    label: 'Semi-Urgent',
    icon: AlertCircle,
    bgColor: 'bg-yellow-500/20',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/40',
    glowColor: 'shadow-yellow-500/20',
  },
  ROUTINE: {
    label: 'Routine',
    icon: CheckCircle,
    bgColor: 'bg-green-500/20',
    textColor: 'text-green-400',
    borderColor: 'border-green-500/40',
    glowColor: 'shadow-green-500/20',
  },
};

const SIZE_CONFIG = {
  sm: {
    container: 'px-1.5 py-0.5 text-[10px]',
    icon: 'w-3 h-3',
    gap: 'gap-1',
  },
  md: {
    container: 'px-2 py-1 text-xs',
    icon: 'w-3.5 h-3.5',
    gap: 'gap-1.5',
  },
  lg: {
    container: 'px-3 py-1.5 text-sm',
    icon: 'w-4 h-4',
    gap: 'gap-2',
  },
};

export function PriorityBadge({
  level,
  showLabel = true,
  size = 'md',
  className = '',
}: PriorityBadgeProps) {
  const config = BADGE_CONFIG[level];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex items-center ${sizeConfig.gap}
        ${sizeConfig.container}
        ${config.bgColor} ${config.textColor}
        border ${config.borderColor}
        rounded-lg font-semibold uppercase tracking-wide
        shadow-sm ${config.glowColor}
        transition-all duration-200
        ${className}
      `}
      title={`Priority: ${config.label}`}
    >
      <Icon className={sizeConfig.icon} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

/**
 * Compact priority indicator (just colored dot)
 */
interface PriorityDotProps {
  level: TriageLevel;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

const DOT_SIZE = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const DOT_COLORS: Record<TriageLevel, string> = {
  STAT: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
  URGENT: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]',
  SEMI_URGENT: 'bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.4)]',
  ROUTINE: 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]',
};

export function PriorityDot({
  level,
  size = 'md',
  pulse = false,
  className = '',
}: PriorityDotProps) {
  const shouldPulse = pulse || level === 'STAT';

  return (
    <span
      className={`
        inline-block rounded-full
        ${DOT_SIZE[size]}
        ${DOT_COLORS[level]}
        ${shouldPulse ? 'animate-pulse' : ''}
        ${className}
      `}
      title={BADGE_CONFIG[level].label}
    />
  );
}

/**
 * Priority rank number badge
 */
interface PriorityRankProps {
  rank: number;
  level: TriageLevel;
  className?: string;
}

export function PriorityRank({ rank, level, className = '' }: PriorityRankProps) {
  const config = BADGE_CONFIG[level];

  return (
    <span
      className={`
        inline-flex items-center justify-center
        w-6 h-6 text-xs font-bold
        ${config.bgColor} ${config.textColor}
        border ${config.borderColor}
        rounded-full
        ${className}
      `}
      title={`Priority Rank: ${rank}`}
    >
      {rank}
    </span>
  );
}

export default PriorityBadge;
