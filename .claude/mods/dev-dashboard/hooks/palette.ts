export type ThemeName = 'light' | 'dark'

export type Palette = {
  background: string
  accent: string
  text: string
  muted: string
  hash: string
  ok: string
  warning: string
  error: string
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    background: '#e6ebf3',
    accent: '#2563eb',
    text: '#0f172a',
    muted: '#64748b',
    hash: '#475569',
    ok: '#15803d',
    warning: '#b45309',
    error: '#b91c1c',
  },
  dark: {
    background: '#1e293b',
    accent: '#60a5fa',
    text: '#e2e8f0',
    muted: '#94a3b8',
    hash: '#cbd5e1',
    ok: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
  },
}

export function resolveTheme(option: unknown, settingsTheme: unknown): ThemeName {
  if (option === 'light' || option === 'dark') return option

  return typeof settingsTheme === 'string' && settingsTheme.startsWith('light') ? 'light' : 'dark'
}
