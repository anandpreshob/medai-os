import React from 'react';
import { cn } from '../utils/cn';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export function Skeleton({ className, variant = 'rect' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-shimmer',
        variant === 'circle' && 'rounded-full',
        variant === 'text' && 'h-4 rounded',
        variant === 'rect' && 'rounded-lg',
        className
      )}
    />
  );
}

// Preset skeleton for study items in left panel
export function StudyItemSkeleton() {
  return (
    <div className="p-3 rounded-xl bg-background-tertiary/30 animate-fade-in">
      <Skeleton className="w-full h-16 mb-3" />
      <Skeleton variant="text" className="w-3/4 h-4 mb-2" />
      <div className="flex gap-1.5">
        <Skeleton variant="text" className="w-12 h-4" />
        <Skeleton variant="text" className="w-8 h-4" />
        <Skeleton variant="text" className="w-16 h-4" />
      </div>
    </div>
  );
}

// Preset skeleton for segment items
export function SegmentItemSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-background-tertiary/30 animate-fade-in">
      <Skeleton variant="rect" className="w-5 h-5 rounded-md" />
      <Skeleton variant="text" className="flex-1 h-4" />
      <Skeleton variant="circle" className="w-6 h-6" />
    </div>
  );
}
