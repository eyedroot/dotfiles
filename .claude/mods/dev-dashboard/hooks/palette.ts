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
    background: '#f2e9e1',
    accent: '#6b5b7e',
    text: '#575279',
    muted: '#635f78',
    hash: '#286983',
    ok: '#3d6970',
    warning: '#85591d',
    error: '#8f4f61',
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
