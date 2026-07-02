import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Theme, darkTheme, lightTheme } from '../themes';

type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement;
  const { colors } = theme;

  // Background colors
  root.style.setProperty('--bg-primary', colors.bgPrimary);
  root.style.setProperty('--bg-secondary', colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--bg-elevated', colors.bgElevated);
  root.style.setProperty('--bg-hover', colors.bgHover);
  root.style.setProperty('--bg-active', colors.bgActive);

  // Accent colors
  root.style.setProperty('--accent-primary', colors.accentPrimary);
  root.style.setProperty('--accent-primary-hover', colors.accentPrimaryHover);
  root.style.setProperty('--accent-primary-muted', colors.accentPrimaryMuted);
  root.style.setProperty('--accent-secondary', colors.accentSecondary);
  root.style.setProperty('--accent-success', colors.accentSuccess);
  root.style.setProperty('--accent-success-muted', colors.accentSuccessMuted);
  root.style.setProperty('--accent-warning', colors.accentWarning);
  root.style.setProperty('--accent-warning-muted', colors.accentWarningMuted);
  root.style.setProperty('--accent-error', colors.accentError);
  root.style.setProperty('--accent-error-muted', colors.accentErrorMuted);
  root.style.setProperty('--accent-info', colors.accentInfo);
  root.style.setProperty('--accent-info-muted', colors.accentInfoMuted);

  // Text colors
  root.style.setProperty('--text-primary', colors.textPrimary);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-muted', colors.textMuted);
  root.style.setProperty('--text-disabled', colors.textDisabled);

  // Border colors
  root.style.setProperty('--border-subtle', colors.borderSubtle);
  root.style.setProperty('--border-default', colors.borderDefault);
  root.style.setProperty('--border-emphasis', colors.borderEmphasis);
  root.style.setProperty('--border-active', colors.borderActive);

  // Segmentation colors
  root.style.setProperty('--seg-1', colors.seg1);
  root.style.setProperty('--seg-2', colors.seg2);
  root.style.setProperty('--seg-3', colors.seg3);
  root.style.setProperty('--seg-4', colors.seg4);
  root.style.setProperty('--seg-5', colors.seg5);
  root.style.setProperty('--seg-6', colors.seg6);
  root.style.setProperty('--seg-7', colors.seg7);
  root.style.setProperty('--seg-8', colors.seg8);

  root.classList.toggle('dark', theme.name === 'dark');
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultMode = 'dark',
  storageKey = 'medai-theme-mode',
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey) as ThemeMode | null;
      return stored || defaultMode;
    }
    return defaultMode;
  });

  const theme = React.useMemo(() => {
    if (mode === 'system') {
      const prefersDark = typeof window !== 'undefined'
        && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? darkTheme : lightTheme;
    }
    return mode === 'dark' ? darkTheme : lightTheme;
  }, [mode]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setMode = (newMode: ThemeMode) => {
    localStorage.setItem(storageKey, newMode);
    setModeState(newMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
