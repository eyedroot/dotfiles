export const BANNER_ROWS = 3

const GLYPHS: Record<string, readonly [string, string, string]> = {
  A: ['▄▀▄', '█▀█', '█ █'],
  B: ['█▀▄', '█▀▄', '█▄▀'],
  C: ['▄▀▀', '█  ', '▀▄▄'],
  D: ['█▀▄', '█ █', '█▄▀'],
  E: ['█▀▀', '█▀ ', '█▄▄'],
  F: ['█▀▀', '█▀ ', '█  '],
  G: ['▄▀▀', '█▄▄', '▀▄█'],
  H: ['█ █', '█▀█', '█ █'],
  I: ['▀█▀', ' █ ', '▄█▄'],
  J: ['▀▀█', '  █', '▀▄▀'],
  K: ['█ █', '█▀▄', '█ █'],
  L: ['█  ', '█  ', '█▄▄'],
  M: ['█▄█', '█▀█', '█ █'],
  N: ['█▀▄', '█ █', '█ █'],
  O: ['▄▀▄', '█ █', '▀▄▀'],
  P: ['█▀▄', '█▀ ', '█  '],
  Q: ['▄▀▄', '█ █', '▀▄█'],
  R: ['█▀▄', '█▀▄', '█ █'],
  S: ['▄▀▀', '▀▀▄', '▄▄▀'],
  T: ['▀█▀', ' █ ', ' █ '],
  U: ['█ █', '█ █', '▀▄▀'],
  V: ['█ █', '█ █', ' ▀ '],
  W: ['█ █', '█▄█', '▀ ▀'],
  X: ['█ █', '▄█▄', '█ █'],
  Y: ['█ █', '▀█▀', ' █ '],
  Z: ['▀▀█', '▄▀ ', '█▄▄'],
  '0': ['▄▀▄', '█ █', '▀▄▀'],
  '1': ['▄█ ', ' █ ', '▄█▄'],
  '2': ['▀▀▄', '▄▀ ', '█▄▄'],
  '3': ['▀▀▄', '▀▀▄', '▄▄▀'],
  '4': ['█ █', '▀▀█', '  █'],
  '5': ['█▀▀', '▀▀▄', '▄▄▀'],
  '6': ['▄▀▀', '█▀▄', '▀▄▀'],
  '7': ['▀▀█', ' ▄▀', ' █ '],
  '8': ['▄▀▄', '▄▀▄', '▀▄▀'],
  '9': ['▄▀▄', '▀▀█', '▄▄▀'],
  '-': ['   ', '▀▀▀', '   '],
  '.': ['   ', '   ', ' ▄ '],
  ' ': ['  ', '  ', '  '],
}

export function renderBanner(text: string): string[] {
  const rows: string[] = ['', '', '']

  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char]
    if (glyph === undefined) continue

    glyph.forEach((part, index) => {
      rows[index] = rows[index] === '' ? part : `${rows[index]} ${part}`
    })
  }

  return rows[0] === '' ? [] : rows
}

export function bannerWidth(rows: readonly string[]): number {
  return rows.reduce((widest, row) => Math.max(widest, row.length), 0)
}
