// The desktop pane is drawn as SVG so it can follow the host's light or dark
// appearance through prefers-color-scheme: the mods API exposes no appearance,
// and an opaque Box background cannot follow it. Fills are translucent tints
// over the host's own pane background, the way the usage-bar mod draws its band.

export type Tone = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'cyan'
export type Cls = Tone | 'fg' | 'mu' | 'lb'

export type TextSegment = { text: string; cls?: Cls; weight?: number; size?: number }
export type Segment = TextSegment | { dot: Tone }

export type CardBlock =
  | { kind: 'big'; text: string; cls?: Cls; side?: string; sideCls?: Cls; size?: number }
  | { kind: 'line'; text: string; cls?: Cls; size?: number }
  | { kind: 'wrap'; text: string; cls?: Cls; size?: number; weight?: number; maxLines?: number }
  | { kind: 'bar'; percent: number; tone: Tone }
  | { kind: 'row'; segments: Segment[]; right?: TextSegment }
  | { kind: 'gap'; px: number }

export type Drawing = { source: string; width: number; height: number }

const FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
// A monospace glyph is about 0.62em wide; Hangul, kana, han and other
// East Asian wide glyphs take a full em.
const ADVANCE = 0.62
const WIDE_GLYPH = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/
const TONES: readonly Tone[] = ['green', 'yellow', 'red', 'blue', 'purple', 'cyan']

// [light, dark]
const PALETTE: Record<Cls | 'track', readonly [string, string]> = {
  fg: ['#1f1f24', '#ececf1'],
  mu: ['#74747f', '#9b9ba8'],
  lb: ['#8b8b96', '#7d7d8a'],
  track: ['#0000001a', '#ffffff1f'],
  green: ['#23875a', '#5fd19c'],
  yellow: ['#a87708', '#e8bd3f'],
  red: ['#c4402b', '#ff7b67'],
  blue: ['#3563d1', '#86a6ff'],
  purple: ['#6a52cc', '#a996ff'],
  cyan: ['#167f8c', '#5cc9d6'],
}

// CSS pixels. The desktop host draws its own pane text at about 13px, so body
// text sits just under that and the small-caps labels one step below it.
export const SIZE = { label: 10, body: 12, value: 13, big: 22 }
const LABEL_TRACKING = 0.8

const CARD_PAD = 14
const CARD_RADIUS = 11
const TITLE_BASELINE = 21
const BODY_TOP = 34
const ROW_HEIGHT = 18
const ROW_BASELINE = 13
const BIG_HEIGHT = 30
const BREAK_AFTER: readonly (readonly string[])[] = [[' '], ['/'], ['_', '-'], ['.']]

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function glyphWidth(glyph: string, size: number): number {
  return size * (WIDE_GLYPH.test(glyph) ? 1 : ADVANCE)
}

export function textWidth(text: string, size: number, tracking = 0): number {
  return [...text].reduce((width, glyph) => width + glyphWidth(glyph, size) + tracking, 0)
}

function fitCount(glyphs: readonly string[], size: number, room: number): number {
  let width = 0
  let count = 0

  for (const glyph of glyphs) {
    width += glyphWidth(glyph, size)
    if (width > room + 0.001) break
    count += 1
  }

  return count
}

export function cardInnerWidth(width: number): number {
  return width - 2 * CARD_PAD
}

export function fitText(text: string, size: number, room: number): string {
  const glyphs = [...text]

  if (fitCount(glyphs, size, room) === glyphs.length) return text

  const kept = fitCount(glyphs, size, room - glyphWidth('…', size))
  if (kept === 0) return ''

  return `${glyphs.slice(0, kept).join('')}…`
}

// Breaks after a separator in the back half of the line where there is one,
// so `feature/NX-1_long-name` splits at a word, not mid-word. A space is
// taken before a `/`, that before `_` or `-`, and those before a `.`, so prose
// breaks at a word, a path at a folder and a branch outside a version number.
function breakAt(glyphs: readonly string[], max: number): number {
  for (const separators of BREAK_AFTER) {
    for (let index = max; index > Math.floor(max / 2); index -= 1) {
      if (separators.includes(glyphs[index - 1] ?? '')) return index
    }
  }

  return max
}

export function wrapText(text: string, size: number, room: number, maxLines: number): string[] {
  const glyphs = [...text]
  const lines: string[] = []
  let start = 0

  if (glyphs.length === 0 || fitCount(glyphs.slice(0, 2), size, room) < 2) return lines

  while (start < glyphs.length) {
    const rest = glyphs.slice(start)
    const max = fitCount(rest, size, room)

    if (max === rest.length) {
      lines.push(rest.join(''))
      break
    }

    if (lines.length === maxLines - 1) {
      lines.push(fitText(rest.join(''), size, room))
      break
    }

    const cut = breakAt(rest, max)

    lines.push(rest.slice(0, cut).join('').trimEnd())
    start += cut
  }

  return lines
}

function styles(mode: 0 | 1): string {
  const fills = (Object.keys(PALETTE) as (keyof typeof PALETTE)[]).map(name => `.${name}{fill:${PALETTE[name][mode]}}`).join('')
  const cards = TONES.map(tone => `.card-${tone}{fill:${PALETTE[tone][mode]};fill-opacity:${mode ? 0.07 : 0.05};stroke:${PALETTE[tone][mode]};stroke-opacity:${mode ? 0.2 : 0.18}}`).join('')
  const neutral = `.card-none{fill:${PALETTE.fg[mode]};fill-opacity:${mode ? 0.04 : 0.03};stroke:${PALETTE.fg[mode]};stroke-opacity:${mode ? 0.12 : 0.1}}`

  return fills + cards + neutral
}

function document(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">` +
    `<style>${styles(0)}@media (prefers-color-scheme:dark){${styles(1)}}</style>${body}</svg>`
}

function text(x: number, baseline: number, content: string, options: { size: number; weight?: number; cls?: Cls; anchor?: 'end'; tracking?: number }): string {
  const anchor = options.anchor === undefined ? '' : ` text-anchor="${options.anchor}"`
  const tracking = options.tracking === undefined ? '' : ` letter-spacing="${options.tracking}"`

  return `<text class="${options.cls ?? 'fg'}" x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" font-size="${options.size}" font-weight="${options.weight ?? 500}"${anchor}${tracking}>${escapeXml(content)}</text>`
}

function segmentWidth(segment: Segment): number {
  if ('dot' in segment) return 8

  return textWidth(segment.text, segment.size ?? SIZE.body)
}

function segment(segment: Segment, x: number, baseline: number, room: number): string {
  if ('dot' in segment) return `<circle class="${segment.dot}" cx="${x + 3.5}" cy="${baseline - 4}" r="3"/>`

  const size = segment.size ?? SIZE.body

  return text(x, baseline, fitText(segment.text, size, room), { size, weight: segment.weight, cls: segment.cls ?? 'mu' })
}

function wrapLines(block: Extract<CardBlock, { kind: 'wrap' }>, width: number): string[] {
  return wrapText(block.text, block.size ?? SIZE.body, cardInnerWidth(width), block.maxLines ?? 2)
}

function blockHeight(block: CardBlock, width: number): number {
  if (block.kind === 'big') return BIG_HEIGHT
  if (block.kind === 'gap') return block.px
  if (block.kind === 'wrap') return Math.max(1, wrapLines(block, width).length) * ROW_HEIGHT

  return ROW_HEIGHT
}

function block(block: CardBlock, y: number, width: number): string {
  const inner = cardInnerWidth(width)
  const left = CARD_PAD

  if (block.kind === 'gap') return ''

  if (block.kind === 'big') {
    const size = block.size ?? SIZE.big
    const main = fitText(block.text, size, block.side === undefined ? inner : inner * 0.6)
    let drawn = text(left, y + size, main, { size, weight: 700, cls: block.cls ?? 'fg' })

    if (block.side !== undefined) {
      const sideX = left + textWidth(main, size) + 8
      drawn += text(sideX, y + size, fitText(block.side, SIZE.body, width - CARD_PAD - sideX), { size: SIZE.body, cls: block.sideCls ?? 'mu' })
    }

    return drawn
  }

  if (block.kind === 'line') {
    const size = block.size ?? SIZE.body

    return text(left, y + ROW_BASELINE, fitText(block.text, size, inner), { size, cls: block.cls ?? 'mu' })
  }

  if (block.kind === 'wrap') {
    const size = block.size ?? SIZE.body

    return wrapLines(block, width)
      .map((line, index) => text(left, y + ROW_BASELINE + index * ROW_HEIGHT, line, { size, weight: block.weight, cls: block.cls ?? 'mu' }))
      .join('')
  }

  if (block.kind === 'bar') {
    const fill = block.percent > 0 ? Math.max(3, (block.percent / 100) * inner) : 0
    const track = `<rect class="track" x="${left}" y="${y + 5}" width="${inner}" height="6" rx="3"/>`

    return fill === 0 ? track : `${track}<rect class="${block.tone}" x="${left}" y="${y + 5}" width="${fill.toFixed(1)}" height="6" rx="3"/>`
  }

  const baseline = y + ROW_BASELINE
  const rightWidth = block.right === undefined ? 0 : segmentWidth(block.right) + 8
  let x = left
  let drawn = ''

  block.segments.forEach((part, index) => {
    const isLast = index === block.segments.length - 1
    const room = isLast ? width - CARD_PAD - rightWidth - x : segmentWidth(part)

    if (room <= 0) return

    drawn += segment(part, x, baseline, room)
    x += ('dot' in part ? 8 : textWidth(fitText(part.text, part.size ?? SIZE.body, room), part.size ?? SIZE.body)) + 7
  })

  if (block.right !== undefined) {
    const size = block.right.size ?? SIZE.body
    drawn += text(width - CARD_PAD, baseline, block.right.text, { size, weight: block.right.weight, cls: block.right.cls ?? 'mu', anchor: 'end' })
  }

  return drawn
}

export function drawCard(options: {
  width: number
  tone: Tone | null
  title: string
  titleRight?: { text: string; cls?: Cls }
  blocks: readonly CardBlock[]
}): Drawing {
  const { width } = options
  let body = text(CARD_PAD, TITLE_BASELINE, options.title, { size: SIZE.label, weight: 700, cls: options.tone ?? 'lb', tracking: LABEL_TRACKING })

  if (options.titleRight !== undefined) {
    const room = cardInnerWidth(width) - textWidth(options.title, SIZE.label, LABEL_TRACKING) - 10
    body += text(width - CARD_PAD, TITLE_BASELINE, fitText(options.titleRight.text, SIZE.body, room), { size: SIZE.body, cls: options.titleRight.cls ?? 'mu', anchor: 'end' })
  }

  let y = BODY_TOP

  for (const part of options.blocks) {
    body += block(part, y, width)
    y += blockHeight(part, width)
  }

  const height = Math.max(y + 8, BODY_TOP + 12)
  const frame = `<rect class="card-${options.tone ?? 'none'}" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${CARD_RADIUS}"/>`

  return { source: document(width, height, frame + body), width, height }
}

export function contextTone(percent: number): Tone {
  if (percent < 50) return 'blue'
  if (percent < 75) return 'yellow'

  return 'red'
}
