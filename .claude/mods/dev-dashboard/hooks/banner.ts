export const BANNER_ROWS = 3

// Each glyph is 3 by 5 pixels ('#' is ink). Drawn two cell columns per pixel,
// every stem is a full cell wide, which is what keeps the letters readable at
// small font sizes; one column per pixel is the fallback for panes too narrow
// for that. Pixel rows pair up into cells with the upper and lower half
// blocks, which leaves one blank pixel row under the letters.
const PIXEL_GLYPHS: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '.#.', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ' ': ['..', '..', '..', '..', '..'],
}

export type ColumnsPerPixel = 1 | 2

function glyphCells(pixelRows: readonly string[], columnsPerPixel: ColumnsPerPixel): string[] {
  const width = (pixelRows[0]?.length ?? 0) * columnsPerPixel
  const cells: string[] = []

  for (let row = 0; row < BANNER_ROWS; row += 1) {
    let line = ''

    for (let column = 0; column < width; column += 1) {
      const pixelColumn = Math.floor(column / columnsPerPixel)
      const upper = pixelRows[row * 2]?.[pixelColumn] === '#'
      const lower = pixelRows[row * 2 + 1]?.[pixelColumn] === '#'

      line += upper && lower ? '█' : upper ? '▀' : lower ? '▄' : ' '
    }

    cells.push(line)
  }

  return cells
}

export function renderBanner(text: string, columnsPerPixel: ColumnsPerPixel = 2): string[] {
  const rows: string[] = ['', '', '']

  for (const char of text.toUpperCase()) {
    const glyph = PIXEL_GLYPHS[char]
    if (glyph === undefined) continue

    glyphCells(glyph, columnsPerPixel).forEach((part, index) => {
      rows[index] = rows[index] === '' ? part : `${rows[index]} ${part}`
    })
  }

  return rows[0] === '' ? [] : rows
}

export function bannerWidth(rows: readonly string[]): number {
  return rows.reduce((widest, row) => Math.max(widest, row.length), 0)
}
