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
  // Herdr's soft-paper theme (~/.config/herdr-app/themes/soft-paper.json): the
  // pane sits on its sidebar chrome, and the accents are its ANSI colors. A
  // chip's tint is its color at 12% over chrome, and its accent and muted are
  // darkened just enough to keep 4.5:1 on that tint.
  light: {
    background: '#ebe9e3',
    accent: '#2f64c2',
    text: '#2f3136',
    muted: '#5c5e64',
    hash: '#7a4fb8',
    ok: '#2c7737',
    warning: '#88630d',
    error: '#b73e37',
    chips: {
      green: { tint: '#d4dbce', text: '#123516', accent: '#206d2d', muted: '#466648' },
      yellow: { tint: '#dfd9c9', text: '#3d2b06', accent: '#7d5900', muted: '#6f5d3d' },
      red: { tint: '#e5d4ce', text: '#541a17', accent: '#ab322d', muted: '#884e48' },
      blue: { tint: '#d4d9df', text: '#132c59', accent: '#265bb8', muted: '#455f8b' },
      purple: { tint: '#ddd7de', text: '#362254', accent: '#7347b0', muted: '#685687' },
      cyan: { tint: '#d3dbd6', text: '#0c3335', accent: '#0e696e', muted: '#436466' },
      slate: { tint: '#dbd9d5', text: '#2b2c2f', accent: '#5c5e65', muted: '#5d5e62' },
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
    separator: '#848589',
    label: '#5c5e64',
    value: '#2f3136',
    spark: '#7a4fb8',
    bars: { low: '#2c7737', mid: '#88630d', high: '#ad4a13', crit: '#b73e37', context: '#b73e37' },
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
