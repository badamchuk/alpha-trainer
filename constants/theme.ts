export const Colors = {
  background: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceElevated: '#242424',
  border: '#2E2E2E',
  primary: '#E63946',
  primaryDark: '#B52D38',
  accent: '#F4A261',
  success: '#2EC4B6',
  warning: '#F4A261',
  error: '#E63946',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#606060',
  cardBackground: '#1A1A1A',
  tabBar: '#111111',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: '#FFFFFF' },
  h2: { fontSize: 22, fontWeight: '700' as const, color: '#FFFFFF' },
  h3: { fontSize: 18, fontWeight: '600' as const, color: '#FFFFFF' },
  body: { fontSize: 15, fontWeight: '400' as const, color: '#FFFFFF' },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, color: '#A0A0A0' },
  label: { fontSize: 12, fontWeight: '600' as const, color: '#A0A0A0', textTransform: 'uppercase' as const, letterSpacing: 0.8 },
};
