export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  bgHover: string;
  bgActive: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentPrimaryMuted: string;
  accentSecondary: string;
  accentSuccess: string;
  accentSuccessMuted: string;
  accentWarning: string;
  accentWarningMuted: string;
  accentError: string;
  accentErrorMuted: string;
  accentInfo: string;
  accentInfoMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  borderSubtle: string;
  borderDefault: string;
  borderEmphasis: string;
  borderActive: string;
  seg1: string;
  seg2: string;
  seg3: string;
  seg4: string;
  seg5: string;
  seg6: string;
  seg7: string;
  seg8: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    // Background Hierarchy - Navy-influenced darks
    bgPrimary: '#060910',
    bgSecondary: '#0c1018',
    bgTertiary: '#141a24',
    bgElevated: '#1a2230',
    bgHover: '#1e2738',
    bgActive: '#252f42',
    // Primary Accent - Medical Teal
    accentPrimary: '#00d4ff',
    accentPrimaryHover: '#33ddff',
    accentPrimaryMuted: 'rgba(0, 212, 255, 0.12)',
    accentSecondary: '#0099cc',
    // Semantic Colors
    accentSuccess: '#00e5a0',
    accentSuccessMuted: 'rgba(0, 229, 160, 0.12)',
    accentWarning: '#ffb020',
    accentWarningMuted: 'rgba(255, 176, 32, 0.12)',
    accentError: '#ff6b6b',
    accentErrorMuted: 'rgba(255, 107, 107, 0.12)',
    accentInfo: '#64b5f6',
    accentInfoMuted: 'rgba(100, 181, 246, 0.12)',
    // Text Hierarchy
    textPrimary: '#f0f4f8',
    textSecondary: '#8899a8',
    textMuted: '#5c6b7a',
    textDisabled: '#3d4854',
    // Border System
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
    borderDefault: 'rgba(255, 255, 255, 0.1)',
    borderEmphasis: 'rgba(255, 255, 255, 0.15)',
    borderActive: '#00d4ff',
    // Segmentation Colors
    seg1: '#ff6b6b',
    seg2: '#4dabf7',
    seg3: '#51cf66',
    seg4: '#ffd43b',
    seg5: '#da77f2',
    seg6: '#22d3ee',
    seg7: '#f472b6',
    seg8: '#a3e635',
  },
};

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    // Background Hierarchy - Clean whites with subtle blue tint
    bgPrimary: '#f8fafc',
    bgSecondary: '#f1f5f9',
    bgTertiary: '#e8eef4',
    bgElevated: '#ffffff',
    bgHover: '#dce4ec',
    bgActive: '#c8d4e0',
    // Primary Accent - Deeper teal for light mode
    accentPrimary: '#0099cc',
    accentPrimaryHover: '#007aa3',
    accentPrimaryMuted: 'rgba(0, 153, 204, 0.12)',
    accentSecondary: '#006080',
    // Semantic Colors - Adjusted for light mode contrast
    accentSuccess: '#00a870',
    accentSuccessMuted: 'rgba(0, 168, 112, 0.12)',
    accentWarning: '#cc8800',
    accentWarningMuted: 'rgba(204, 136, 0, 0.12)',
    accentError: '#dc3545',
    accentErrorMuted: 'rgba(220, 53, 69, 0.12)',
    accentInfo: '#2196f3',
    accentInfoMuted: 'rgba(33, 150, 243, 0.12)',
    // Text Hierarchy
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    textDisabled: '#94a3b8',
    // Border System
    borderSubtle: 'rgba(0, 0, 0, 0.06)',
    borderDefault: 'rgba(0, 0, 0, 0.1)',
    borderEmphasis: 'rgba(0, 0, 0, 0.15)',
    borderActive: '#0099cc',
    // Segmentation Colors - Adjusted for light mode
    seg1: '#dc3545',
    seg2: '#2196f3',
    seg3: '#28a745',
    seg4: '#ffc107',
    seg5: '#9c27b0',
    seg6: '#00bcd4',
    seg7: '#e91e63',
    seg8: '#8bc34a',
  },
};
