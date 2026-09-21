export const theme = {
  colors: {
    background: '#0F172A',
    surface: '#1E293B',
    surfaceMuted: '#334155',
    border: '#334155',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    accent: '#38BDF8',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
  },
  spacing: (units: number): number => units * 8,
  radius: { sm: 8, md: 14, lg: 22 },
} as const;
