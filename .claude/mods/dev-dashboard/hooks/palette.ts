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
  // Herdr's paper theme: the pane sits on its sidebar chrome, and the accents
  // are its ANSI colors. A chip's tint is its color at 12% over chrome, and its
  // accent and muted are darkened just enough to keep 4.5:1 on that tint.
  light: {
    background: '#f1f1ee',
    accent: '#1f62d0',
    text: '#1b1b1e',
    muted: '#69696b',
    hash: '#7a45c8',
    ok: '#1a7f37',
    warning: '#8f5d00',
    error: '#c62a2a',
    chips: {
      green: { tint: '#d7e3d8', text: '#0c3919', accent: '#177232', muted: '#416b4d' },
      yellow: { tint: '#e5dfd1', text: '#402a00', accent: '#895900', muted: '#745f37' },
      red: { tint: '#ecd9d6', text: '#591313', accent: '#ba2727', muted: '#914c4c' },
      blue: { tint: '#d8e0ea', text: '#0e2c5e', accent: '#1e5ec8', muted: '#466392' },
      purple: { tint: '#e3dce9', text: '#371f5a', accent: '#7844c4', muted: '#6d568f' },
      cyan: { tint: '#d6e1df', text: '#073234', accent: '#0f6d72', muted: '#3f696b' },
      slate: { tint: '#dfe0de', text: '#2b2b2f', accent: '#5f6068', muted: '#626266' },
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
    separator: '#969698',
    label: '#69696b',
    value: '#1b1b1e',
    spark: '#7a45c8',
    bars: { low: '#1a7f37', mid: '#9a6700', high: '#c93c2c', crit: '#c62a2a', context: '#c62a2a' },
  },
  dark: {
    separator: '#7f849c',
    label: '#bac2de',
    value: '#cdd6f4',
    spark: '#b4befe',
    bars: { low: '#94e2d5', mid: '#f9e2af', high: '#fab387', crit: '#f38ba8', context: '#f38ba8' },
  },
}

// Claude Code resolves its "auto" theme by asking the terminal for its
// background; the shell that started the session asked the same and exported
// the answer as TERMINAL_APPEARANCE (.zshrc.shared).
export function resolveTheme(option: unknown, settingsTheme: unknown, terminalAppearance?: string): ThemeName {
  if (option === 'light' || option === 'dark') return option
  if (settingsTheme === 'auto') return terminalAppearance === 'light' ? 'light' : 'dark'

  return typeof settingsTheme === 'string' && settingsTheme.startsWith('light') ? 'light' : 'dark'
}

// A custom theme is stored as custom:<slug> and is a preset plus overrides;
// the slug names ~/.claude/themes/<slug>.json, whose "base" is that preset.
export function customThemeSlug(settingsTheme: unknown): string | null {
  if (typeof settingsTheme !== 'string' || !settingsTheme.startsWith('custom:')) return null

  const slug = settingsTheme.slice('custom:'.length)

  return /^[A-Za-z0-9_-]+$/.test(slug) ? slug : null
}
