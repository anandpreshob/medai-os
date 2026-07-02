import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-lg text-sm font-medium',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:scale-[0.97]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-gradient-to-r from-accent-primary to-accent-secondary text-white',
          'hover:shadow-glow-sm hover:brightness-110',
          'shadow-sm',
          // Inner highlight for depth
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-1px_0_rgba(0,0,0,0.1)]',
          // Shimmer effect container
          'relative overflow-hidden',
        ].join(' '),
        // New premium variant with animated shine
        premium: [
          'bg-gradient-to-r from-accent-primary via-accent-primary-bright to-accent-primary text-white',
          'hover:shadow-glow hover:brightness-110',
          'shadow-md',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.15)]',
          'relative overflow-hidden',
          'btn-shine',
        ].join(' '),
        secondary: [
          'bg-background-tertiary text-text-primary',
          'border border-border-default',
          'hover:bg-background-hover hover:border-border-emphasis',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        ].join(' '),
        outline: [
          'border border-border-default bg-transparent',
          'text-text-primary',
          'hover:bg-background-hover hover:border-accent-primary/40 hover:text-accent-primary',
        ].join(' '),
        ghost: [
          'text-text-secondary',
          'hover:bg-background-hover hover:text-text-primary',
        ].join(' '),
        destructive: [
          'bg-accent-error text-white',
          'hover:bg-accent-error/90 hover:shadow-sm',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        ].join(' '),
        success: [
          'bg-accent-success text-white',
          'hover:bg-accent-success/90 hover:shadow-sm',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        ].join(' '),
        // New: subtle variant for less prominent actions
        subtle: [
          'bg-background-hover/50 text-text-secondary',
          'border border-transparent',
          'hover:bg-background-hover hover:text-text-primary hover:border-border-subtle',
        ].join(' '),
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-xs': 'h-6 w-6 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="sr-only">Loading...</span>
          </>
        ) : (
          children
        )}
        {/* Shimmer overlay for default/premium buttons */}
        {(variant === 'default' || variant === 'premium') && !isLoading && (
          <span className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
            <span className="absolute inset-0 opacity-0 hover:opacity-100 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
