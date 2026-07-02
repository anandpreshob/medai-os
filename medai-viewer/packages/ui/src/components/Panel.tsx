import React, { HTMLAttributes, forwardRef, ReactNode, useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  badge?: string | number;
  variant?: 'default' | 'elevated' | 'ghost';
  noPadding?: boolean;
  accentLine?: boolean;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({
    className,
    title,
    children,
    actions,
    collapsible = false,
    defaultCollapsed = false,
    badge,
    variant = 'default',
    noPadding = false,
    accentLine = false,
    ...props
  }, ref) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
    const contentRef = useRef<HTMLDivElement>(null);

    // Measure content height for smooth animation
    useEffect(() => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    }, [children]);

    const variantStyles = {
      default: 'bg-background-tertiary/40 border border-border-subtle',
      elevated: 'bg-background-elevated/80 border border-border-default shadow-md backdrop-blur-sm',
      ghost: 'bg-transparent border-none',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl overflow-hidden',
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {title && (
          <div
            className={cn(
              'relative flex items-center justify-between gap-3',
              'px-4 py-3',
              'border-b border-border-subtle',
              // Gradient header background
              'bg-gradient-to-r from-background-tertiary/50 via-background-tertiary/30 to-background-tertiary/50',
              collapsible && 'cursor-pointer select-none hover:bg-background-hover/30 transition-colors'
            )}
            onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
          >
            {/* Left accent line */}
            {accentLine && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-accent-primary to-transparent" />
            )}

            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary tracking-tight truncate">
                {title}
              </h3>
              {badge !== undefined && (
                <span className="flex-shrink-0 px-2 py-0.5 text-2xs font-medium text-text-secondary bg-background-hover rounded-full">
                  {badge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions && (
                <div onClick={(e) => e.stopPropagation()}>
                  {actions}
                </div>
              )}
              {collapsible && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-text-muted transition-transform duration-200',
                    isCollapsed && '-rotate-90'
                  )}
                />
              )}
            </div>
          </div>
        )}
        <div
          ref={contentRef}
          className={cn(
            'transition-all duration-300 ease-out',
            isCollapsed ? 'opacity-0 overflow-hidden' : noPadding ? '' : 'p-4'
          )}
          style={{
            maxHeight: isCollapsed ? 0 : contentHeight ? contentHeight + 32 : 'none',
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);

Panel.displayName = 'Panel';
