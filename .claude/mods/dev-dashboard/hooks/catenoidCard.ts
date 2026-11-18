import { cardRows, head } from './catenoid'
import type { CardRow, Match } from './catenoid'
import type { Card } from './cards'
import { SIZE, drawCard } from './svg'
import type { CardBlock, Cls } from './svg'

const MAX_CARDS = 3
const LABEL_WIDTH = 9
// A value past this many characters gets its own wrapped lines under its label.
const INLINE_MAX = 30
// The note in parentheses after a value (the clusters it runs on) goes on a dim line of its own.
const NOTE_AFTER_VALUE = /^(.*?)\s*(\([^()]+\))$/s

const ROW_CLS: Record<CardRow['color'], Cls> = {
  suggestion: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  subtle: 'mu',
  text: 'fg',
}

function rowBlocks(row: CardRow): CardBlock[] {
  const cls = ROW_CLS[row.color]
  // Every image sits in the same registry; the label already says it is an image.
  const shown = row.label === 'image' ? row.value.replace(/^catenoidhub\//, '') : row.value
  const split = NOTE_AFTER_VALUE.exec(shown)
  const main = split?.[1] ? split[1] : shown
  const note = split?.[1] ? split[2] : undefined
  const blocks: CardBlock[] =
    main.length <= INLINE_MAX
      ? [{ kind: 'row', segments: [{ text: row.label.padEnd(LABEL_WIDTH), cls: 'lb', size: 11 }, { text: main, cls }] }]
      : [
          { kind: 'line', text: row.label, cls: 'lb', size: 11 },
          { kind: 'wrap', text: main, cls, maxLines: 3 },
        ]
  if (note !== undefined) {
    blocks.push(
      main.length <= INLINE_MAX
        ? { kind: 'row', segments: [{ text: ' '.repeat(LABEL_WIDTH), size: 11 }, { text: note, cls: 'mu', size: 11 }] }
        : { kind: 'wrap', text: note, cls: 'mu', size: 11, maxLines: 2 },
    )
  }

  return blocks
}

// The desktop pane's card for one repository, drawn the way the other cards are.
export function catenoidCard(m: Match, width: number): Card {
  const { entry, app } = m
  const rows = cardRows(m)
  const blocks: CardBlock[] = [
    { kind: 'row', segments: [{ text: app ? `${entry.folder}/${app.app}` : entry.folder, cls: 'fg', weight: 650, size: SIZE.value }] },
    ...rows.flatMap(rowBlocks),
  ]
  const alias = (app ?? entry).alias
  const drawing = drawCard({ width, tone: 'blue', title: 'CATENOID', titleRight: alias ? { text: alias, cls: 'blue' } : undefined, blocks })

  return { ...drawing, alt: `${head(m)}: ${rows.map(row => `${row.label} ${row.value}`).join(', ')}` }
}

export function catenoidCards(matches: Match[], width: number): Card[] {
  return matches.slice(0, MAX_CARDS).map(m => catenoidCard(m, width))
}
