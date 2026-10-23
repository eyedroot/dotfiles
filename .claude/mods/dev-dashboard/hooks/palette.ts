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
    accent: '#cc6480',
    text: '#cdd6f4',
    muted: '#b4a5aa',
    hash: '#fab387',
    ok: '#a3c9a8',
    warning: '#f9e2af',
    error: '#e78284',
    chips: {
      green: { tint: '#1f3128', text: '#dcefe0', accent: '#a3c9a8', muted: '#88a58d' },
      yellow: { tint: '#382f1c', text: '#faefd0', accent: '#f9e2af', muted: '#b3a47d' },
      red: { tint: '#431f24', text: '#f8dcdc', accent: '#e78284', muted: '#b78c8f' },
      blue: { tint: '#1f2a46', text: '#d9e3fa', accent: '#89b4fa', muted: '#8b9ac0' },
      purple: { tint: '#4a1a2c', text: '#f5dbe3', accent: '#e48aa3', muted: '#b98e9b' },
      cyan: { tint: '#16323a', text: '#d0eef2', accent: '#89dceb', muted: '#7eaab0' },
      slate: { tint: '#2b2428', text: '#e6dade', accent: '#b4a5aa', muted: '#a0939a' },
    },
  },
}

// The status line's colors (~/.claude/statusline.sh), so the band above the
// prompt reads as the same family as the lines under it. Change both together.
export type BandPalette = {
  separator: string
  label: string
  value: string
  spark: string
  bars: Record<'low' | 'mid' | 'high' | 'crit' | 'context', string>
}

export const BAND_PALETTES: Record<ThemeName, BandPalette> = {
  light: {
    separator: '#adadad',
    label: '#606060',
    value: '#202020',
    spark: '#6b2fba',
    bars: { low: '#005c43', mid: '#826a00', high: '#a14916', crit: '#ad0f00', context: '#ad0f00' },
  },
  dark: {
    separator: '#7f849c',
    label: '#bac2de',
    value: '#cdd6f4',
    spark: '#b4befe',
    bars: { low: '#94e2d5', mid: '#f9e2af', high: '#fab387', crit: '#f38ba8', context: '#f38ba8' },
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
