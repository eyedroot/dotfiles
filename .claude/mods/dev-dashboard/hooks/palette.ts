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
    background: '#f7f7f7',
    accent: '#0f54d6',
    text: '#202020',
    muted: '#606060',
    hash: '#6b2fba',
    ok: '#1b6600',
    warning: '#826a00',
    error: '#ad0f00',
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

// A custom theme is stored as custom:<slug> and is a preset plus overrides;
// the slug names ~/.claude/themes/<slug>.json, whose "base" is that preset.
export function customThemeSlug(settingsTheme: unknown): string | null {
  if (typeof settingsTheme !== 'string' || !settingsTheme.startsWith('custom:')) return null

  const slug = settingsTheme.slice('custom:'.length)

  return /^[A-Za-z0-9_-]+$/.test(slug) ? slug : null
}
