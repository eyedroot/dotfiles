export type PixelArt = {
  width: number
  height: number
  pixels: string
}

export type RasterCells = {
  columns: number
  rows: number
  cells: string
}

const UPPER_HALF_BLOCK = 0x2580
const BACKGROUND_LUMA_LIMIT = 40
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function parseHexColor(hex: string): number {
  return Number.parseInt(hex.replace(/^#/, ''), 16)
}

function luma(color: number): number {
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff

  return (red * 299 + green * 587 + blue * 114) / 1000
}

function pixelAt(art: PixelArt, x: number, y: number, background: number): number {
  if (y >= art.height) return background

  const offset = (y * art.width + x) * 6
  const color = Number.parseInt(art.pixels.slice(offset, offset + 6), 16)

  return luma(color) < BACKGROUND_LUMA_LIMIT ? background : color
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)

    out += BASE64[(triple >> 18) & 63]
    out += BASE64[(triple >> 12) & 63]
    out += second === undefined ? '=' : BASE64[(triple >> 6) & 63]
    out += third === undefined ? '=' : BASE64[triple & 63]
  }

  return out
}

export function makeHalfBlockCells(art: PixelArt, backgroundHex: string): RasterCells {
  const background = parseHexColor(backgroundHex)
  const columns = art.width
  const rows = Math.ceil(art.height / 2)
  const words = new Uint32Array(columns * rows * 3)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = (row * columns + column) * 3

      words[cell] = UPPER_HALF_BLOCK
      words[cell + 1] = pixelAt(art, column, row * 2, background)
      words[cell + 2] = pixelAt(art, column, row * 2 + 1, background)
    }
  }

  return { columns, rows, cells: encodeBase64(new Uint8Array(words.buffer)) }
}
