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
    background: '#181825',
    accent: '#cba6f7',
    text: '#cdd6f4',
    muted: '#a6adc8',
    hash: '#b4befe',
    ok: '#a6e3a1',
    warning: '#fab387',
    error: '#f38ba8',
  },
}

export function resolveTheme(option: unknown, settingsTheme: unknown): ThemeName {
  if (option === 'light' || option === 'dark') return option

  return typeof settingsTheme === 'string' && settingsTheme.startsWith('light') ? 'light' : 'dark'
}
