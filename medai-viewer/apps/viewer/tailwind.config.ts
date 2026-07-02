import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    './index.html',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          'primary-hover': 'var(--accent-primary-hover)',
          'primary-muted': 'var(--accent-primary-muted)',
          secondary: 'var(--accent-secondary)',
          success: 'var(--accent-success)',
          'success-muted': 'var(--accent-success-muted)',
          warning: 'var(--accent-warning)',
          'warning-muted': 'var(--accent-warning-muted)',
          error: 'var(--accent-error)',
          'error-muted': 'var(--accent-error-muted)',
          info: 'var(--accent-info)',
          'info-muted': 'var(--accent-info-muted)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          disabled: 'var(--text-disabled)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          emphasis: 'var(--border-emphasis)',
          active: 'var(--border-active)',
        },
        segment: {
          1: 'var(--seg-1)',
          2: 'var(--seg-2)',
          3: 'var(--seg-3)',
          4: 'var(--seg-4)',
          5: 'var(--seg-5)',
          6: 'var(--seg-6)',
          7: 'var(--seg-7)',
          8: 'var(--seg-8)',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1' }],
        xs: ['0.6875rem', { lineHeight: '1.25' }],
        sm: ['0.75rem', { lineHeight: '1.25' }],
        base: ['0.875rem', { lineHeight: '1.5' }],
        lg: ['1rem', { lineHeight: '1.5' }],
        xl: ['1.125rem', { lineHeight: '1.4' }],
        '2xl': ['1.25rem', { lineHeight: '1.3' }],
      },
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'glow': 'var(--shadow-glow)',
        'glow-sm': 'var(--shadow-glow-sm)',
        'inner-soft': 'var(--shadow-inner)',
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-surface': 'var(--gradient-surface)',
        'gradient-glow': 'var(--gradient-glow)',
        'gradient-header': 'var(--gradient-header)',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'spin-smooth': 'spin-smooth 1s linear infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'float': 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [typography],
};

export default config;
