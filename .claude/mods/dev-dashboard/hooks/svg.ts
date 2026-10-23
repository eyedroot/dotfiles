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
  | { kind: 'bar'; percent: number; tone: Tone }
  | { kind: 'row'; segments: Segment[]; right?: TextSegment }
  | { kind: 'gap'; px: number }

export type Drawing = { source: string; width: number; height: number }

const FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
const ADVANCE = 0.62
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


const LABEL_TRACKING = 0.8

const CARD_PAD = 12
const CARD_RADIUS = 11
const TITLE_BASELINE = 19
const BODY_TOP = 30
const ROW_HEIGHT = 14
const BIG_HEIGHT = 24

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function textWidth(text: string, size: number, tracking = 0): number {
  return [...text].length * (size * ADVANCE + tracking)
}

export function fitText(text: string, size: number, room: number): string {
  const max = Math.floor(room / (size * ADVANCE))
  const glyphs = [...text]

  if (glyphs.length <= max) return text
  if (max <= 1) return ''

  return `${glyphs.slice(0, max - 1).join('')}…`
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
  if ('dot' in segment) return 7

  return textWidth(segment.text, segment.size ?? 9.5)
}

function segment(segment: Segment, x: number, baseline: number, room: number): string {
  if ('dot' in segment) return `<circle class="${segment.dot}" cx="${x + 3}" cy="${baseline - 3.2}" r="2.6"/>`

  const size = segment.size ?? 9.5

  return text(x, baseline, fitText(segment.text, size, room), { size, weight: segment.weight, cls: segment.cls ?? 'mu' })
}

function blockHeight(block: CardBlock): number {
  if (block.kind === 'big') return BIG_HEIGHT
  if (block.kind === 'gap') return block.px

  return ROW_HEIGHT
}

function block(block: CardBlock, y: number, width: number): string {
  const inner = width - 2 * CARD_PAD
  const left = CARD_PAD

  if (block.kind === 'gap') return ''

  if (block.kind === 'big') {
    const size = block.size ?? 19
    const main = fitText(block.text, size, block.side === undefined ? inner : inner * 0.6)
    let drawn = text(left, y + 17, main, { size, weight: 700, cls: block.cls ?? 'fg' })

    if (block.side !== undefined) {
      const sideX = left + textWidth(main, size) + 6
      drawn += text(sideX, y + 17, fitText(block.side, 9.5, width - CARD_PAD - sideX), { size: 9.5, cls: block.sideCls ?? 'mu' })
    }

    return drawn
  }

  if (block.kind === 'line') {
    const size = block.size ?? 9.5

    return text(left, y + 10, fitText(block.text, size, inner), { size, cls: block.cls ?? 'mu' })
  }

  if (block.kind === 'bar') {
    const fill = block.percent > 0 ? Math.max(3, (block.percent / 100) * inner) : 0
    const track = `<rect class="track" x="${left}" y="${y + 3}" width="${inner}" height="6" rx="3"/>`

    return fill === 0 ? track : `${track}<rect class="${block.tone}" x="${left}" y="${y + 3}" width="${fill.toFixed(1)}" height="6" rx="3"/>`
  }

  const baseline = y + 10
  const rightWidth = block.right === undefined ? 0 : segmentWidth(block.right) + 8
  let x = left
  let drawn = ''

  block.segments.forEach((part, index) => {
    const isLast = index === block.segments.length - 1
    const room = isLast ? width - CARD_PAD - rightWidth - x : segmentWidth(part)

    if (room <= 0) return

    drawn += segment(part, x, baseline, room)
    x += ('dot' in part ? 7 : textWidth(fitText(part.text, part.size ?? 9.5, room), part.size ?? 9.5)) + 6
  })

  if (block.right !== undefined) {
    const size = block.right.size ?? 9.5
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
  const titleSize = 8.5
  let body = text(CARD_PAD, TITLE_BASELINE, options.title, { size: titleSize, weight: 700, cls: options.tone ?? 'lb', tracking: LABEL_TRACKING })

  if (options.titleRight !== undefined) {
    const room = width - 2 * CARD_PAD - textWidth(options.title, titleSize, LABEL_TRACKING) - 10
    body += text(width - CARD_PAD, TITLE_BASELINE, fitText(options.titleRight.text, 9.5, room), { size: 9.5, cls: options.titleRight.cls ?? 'mu', anchor: 'end' })
  }

  let y = BODY_TOP

  for (const part of options.blocks) {
    body += block(part, y, width)
    y += blockHeight(part)
  }

  const height = Math.max(y + 6, BODY_TOP + 10)
  const frame = `<rect class="card-${options.tone ?? 'none'}" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${CARD_RADIUS}"/>`

  return { source: document(width, height, frame + body), width, height }
}
