export type ThemeName = 'light' | 'dark'

export type ChipTone = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'cyan' | 'slate'

// tint is the chip's background; text, accent and muted are drawn on it
export type Chip = {
  tint: string
  text: string
  accent: string
  muted: string
}

export type Palette = {
  background: string
  accent: string
  text: string
  muted: string
  hash: string
  ok: string
  warning: string
  error: string
  chips: Record<ChipTone, Chip>
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
    chips: {
      green: { tint: '#dcf1e4', text: '#123f28', accent: '#1b7f4b', muted: '#4f7d62' },
      yellow: { tint: '#f6ebc4', text: '#4a3700', accent: '#9a6b00', muted: '#857449' },
      red: { tint: '#f9dad6', text: '#5e160d', accent: '#c4402b', muted: '#9a6a65' },
      blue: { tint: '#dbe5fb', text: '#17295e', accent: '#3563d1', muted: '#6775a3' },
      purple: { tint: '#e5dffa', text: '#2a2064', accent: '#6a52cc', muted: '#7d76a6' },
      cyan: { tint: '#d4ecf0', text: '#0d4148', accent: '#167f8c', muted: '#5b8b91' },
      slate: { tint: '#e5e5e9', text: '#26262c', accent: '#5b5b66', muted: '#787884' },
    },
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
    chips: {
      green: { tint: '#1c3328', text: '#d6f2e1', accent: '#5fcf9a', muted: '#7fa892' },
      yellow: { tint: '#372f15', text: '#f5e8b8', accent: '#e6b830', muted: '#ad9b62' },
      red: { tint: '#432020', text: '#fadad4', accent: '#f47563', muted: '#b8837b' },
      blue: { tint: '#1f2a46', text: '#d9e3fa', accent: '#7b9cf2', muted: '#8190b3' },
      purple: { tint: '#2b2645', text: '#e0daf8', accent: '#a996ff', muted: '#8f88b3' },
      cyan: { tint: '#16323a', text: '#d0eef2', accent: '#5cc9d6', muted: '#76a3a9' },
      slate: { tint: '#29292f', text: '#e2e2e8', accent: '#a3a3b0', muted: '#82828e' },
    },
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
