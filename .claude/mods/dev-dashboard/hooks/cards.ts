import type { GitSnapshot, SessionFacts, TurnRecap, UpstreamStatus } from '../types'
import type { ChipTone } from './palette'
import { formatDuration, formatTokens, relativeAge } from './recap'
import { SIZE, cardInnerWidth, contextTone, drawCard, textWidth } from './svg'
import type { CardBlock, Cls, Drawing, TextSegment, Tone } from './svg'

export type PaneFacts = {
  snapshot: GitSnapshot
  turn: TurnRecap | null
  prior: TurnRecap | null
  facts: SessionFacts | null
  now: number
  home: string | null
}

export type Card = Drawing & { alt: string }

export type ChipPart = [text: string, kind: 'label' | 'value' | 'aside' | 'accent' | 'off']
export type Chip = { key: string; tone: ChipTone; parts: ChipPart[] }

const CHIP_BAR = 6
const BIG_SIZES = [SIZE.big, 18, 15]

export const UPSTREAM_NOTE: Record<UpstreamStatus, string | null> = {
  ok: null,
  mismatch: 'name differs, git push is refused',
  gone: 'remote branch was deleted',
  none: 'no upstream, first push sets it',
}

export const UPSTREAM_TONE: Record<UpstreamStatus, Tone | null> = {
  ok: 'green',
  mismatch: 'red',
  gone: 'yellow',
  none: null,
}

export function fit(text: string, width: number): string {
  if (width <= 1) return ''

  return text.length > width ? `${text.slice(0, width - 1)}…` : text
}

export function shortAge(age: string): string {
  return age.replace(/ ago$/, '').replace(/ (\w)\w+$/, '$1')
}

export function syncText(snapshot: GitSnapshot): string {
  return `↑${snapshot.ahead} ↓${snapshot.behind}`
}

export function isInSync(snapshot: GitSnapshot): boolean {
  return snapshot.dirty === 0 && snapshot.ahead === 0 && snapshot.behind === 0
}

export function changedText(snapshot: GitSnapshot): string {
  return snapshot.dirty === 0 ? 'clean' : `${snapshot.dirty} changed`
}

export function shortenHome(path: string, home: string | null): string {
  if (home === null || home === '' || !(path === home || path.startsWith(`${home}/`))) return path

  return `~${path.slice(home.length)}`
}

export function recapSummary(recap: TurnRecap, now: number): string[] {
  return [
    relativeAge(recap.endedAt, now),
    formatDuration(recap.durationMs),
    `${recap.toolCalls} tools`,
    recap.outputTokens === null ? null : `${formatTokens(recap.outputTokens)} out`,
    recap.reason === 'answer' ? null : recap.reason,
  ].filter((fact): fact is string => fact !== null)
}

function label(text: string): TextSegment {
  return { text, cls: 'lb', weight: 700, size: SIZE.label }
}

function bigSize(text: string, width: number): number {
  return BIG_SIZES.find(size => textWidth(text, size) <= cardInnerWidth(width)) ?? BIG_SIZES[BIG_SIZES.length - 1] ?? SIZE.big
}

export function placeCard(view: PaneFacts, width: number): Card {
  const { snapshot, home } = view
  const status = snapshot.upstreamStatus
  const statusTone = UPSTREAM_TONE[status]
  const note = UPSTREAM_NOTE[status]
  const isWorktree = snapshot.worktree !== null
  const name = snapshot.worktree ?? snapshot.projectName
  const path = shortenHome(snapshot.root, home)
  const blocks: CardBlock[] = [
    { kind: 'big', text: name, cls: isWorktree ? 'purple' : 'cyan', size: bigSize(name, width) },
    { kind: 'wrap', text: path, cls: 'mu' },
  ]

  if (isWorktree) {
    blocks.push({ kind: 'row', segments: [label('PROJECT'), { text: snapshot.projectName, cls: 'fg', weight: 650, size: SIZE.value }] })
  }

  if (snapshot.isRepo) {
    const changedCls: Cls = snapshot.dirty === 0 ? 'green' : 'yellow'
    const isOk = status === 'ok'
    const syncCls: Cls = isOk ? (snapshot.ahead === 0 && snapshot.behind === 0 ? 'green' : 'mu') : statusTone ?? 'mu'

    blocks.push(
      { kind: 'gap', px: 6 },
      { kind: 'row', segments: [label('BRANCH')], right: { text: changedText(snapshot), cls: changedCls, weight: 700, size: SIZE.value } },
      { kind: 'wrap', text: snapshot.branch ?? 'HEAD (detached)', cls: snapshot.branch === null ? 'yellow' : 'fg', weight: 650, size: SIZE.value },
      { kind: 'gap', px: 6 },
      {
        kind: 'row',
        segments: [label('UPSTREAM')],
        right: { text: isOk ? (snapshot.ahead === 0 && snapshot.behind === 0 ? 'in sync' : syncText(snapshot)) : status, cls: syncCls, weight: 650 },
      },
      { kind: 'wrap', text: snapshot.upstream ?? 'none', cls: statusTone ?? 'mu', weight: 600 },
    )

    if (note !== null) blocks.push({ kind: 'line', text: `! ${note}`, cls: statusTone ?? 'mu' })
    if (snapshot.pushTarget !== null) blocks.push({ kind: 'line', text: `push → ${snapshot.pushTarget}`, cls: 'yellow' })
  }

  const drawing = drawCard({
    width,
    tone: isWorktree ? 'purple' : 'cyan',
    title: isWorktree ? 'WORKTREE' : 'PROJECT',
    titleRight: snapshot.remoteName === null ? undefined : { text: snapshot.remoteName },
    blocks,
  })
  const gitAlt = snapshot.isRepo
    ? `, branch ${snapshot.branch ?? 'detached'}, ${changedText(snapshot)}, ${syncText(snapshot)}, upstream ${snapshot.upstream ?? 'none'} ${status}`
    : ''

  return {
    ...drawing,
    alt: `${isWorktree ? 'worktree' : 'project'} ${name} at ${path}${isWorktree ? `, project ${snapshot.projectName}` : ''}${gitAlt}`,
  }
}

export function contextCard(view: PaneFacts, width: number): Card | null {
  const { facts } = view
  if (facts === null) return null

  const percent = facts.contextPercent === null ? null : Math.round(facts.contextPercent)
  const tone = percent === null ? 'blue' : contextTone(percent)
  const blocks: CardBlock[] = [
    { kind: 'big', text: percent === null ? '—' : `${percent}%`, cls: tone, side: `${facts.turns} turns` },
    { kind: 'bar', percent: percent ?? 0, tone },
    { kind: 'line', text: facts.model },
  ]
  const tokens = facts.contextTokens !== null && facts.contextWindow !== null ? `${formatTokens(facts.contextTokens)}/${formatTokens(facts.contextWindow)}` : null
  const drawing = drawCard({ width, tone: 'blue', title: 'CONTEXT', titleRight: tokens === null ? undefined : { text: tokens }, blocks })

  return { ...drawing, alt: `context ${percent === null ? 'unknown' : `${percent}%`}, ${facts.model}, ${facts.turns} turns` }
}

export function recapCard(title: string, recap: TurnRecap, now: number, width: number, tone: Tone | null): Card {
  const summary = recapSummary(recap, now)
  const [age = ''] = summary
  const blocks: CardBlock[] = [
    { kind: 'big', text: formatDuration(recap.durationMs), cls: tone ?? 'fg', side: summary.slice(2).join(' · ') },
    ...recap.lines.map((line): CardBlock => ({ kind: 'line', text: line, cls: 'fg' })),
  ]
  const drawing = drawCard({ width, tone, title, titleRight: { text: age }, blocks })

  return { ...drawing, alt: `${title.toLowerCase()}: ${summary.join(', ')}. ${recap.lines.join(' ')}` }
}

export function worktreesCard(view: PaneFacts, width: number): Card | null {
  const others = view.snapshot.worktrees.filter(worktree => !worktree.isCurrent)
  if (others.length === 0) return null

  const blocks: CardBlock[] = others.flatMap((worktree): CardBlock[] => [
    {
      kind: 'row',
      segments: [{ dot: UPSTREAM_TONE[worktree.status] ?? 'purple' }, { text: worktree.name, cls: 'fg', weight: 650, size: SIZE.value }],
      right: worktree.branch === null ? { text: 'detached', cls: 'yellow' } : worktree.status === 'ok' ? undefined : { text: worktree.status, cls: UPSTREAM_TONE[worktree.status] ?? 'mu' },
    },
    { kind: 'row', segments: [{ text: '  →', cls: 'lb' }, { text: worktree.upstream ?? 'none', cls: UPSTREAM_TONE[worktree.status] ?? 'mu' }] },
  ])
  const drawing = drawCard({ width, tone: 'cyan', title: 'WORKTREES', titleRight: { text: String(others.length) }, blocks })

  return { ...drawing, alt: `worktrees: ${others.map(worktree => `${worktree.name} → ${worktree.upstream ?? 'none'} ${worktree.status}`).join(', ')}` }
}

export function commitsCard(view: PaneFacts, width: number): Card {
  const { commits } = view.snapshot
  const blocks: CardBlock[] = commits.length === 0
    ? [{ kind: 'line', text: 'no commits yet', cls: 'lb' }]
    : commits.map((commit): CardBlock => ({
        kind: 'row',
        segments: [
          { text: commit.hash.slice(0, 7), cls: 'purple', weight: 650, size: 11 },
          { text: shortAge(commit.age).padStart(3), cls: 'lb', size: 11 },
          { text: commit.subject, cls: 'fg' },
        ],
      }))
  const drawing = drawCard({ width, tone: 'yellow', title: 'COMMITS', titleRight: { text: String(commits.length) }, blocks })

  return { ...drawing, alt: `commits: ${commits.map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`).join(', ')}` }
}

function chipBar(percent: number, width = CHIP_BAR): ChipPart[] {
  const filled = Math.round((percent / 100) * width)
  const parts: ChipPart[] = [
    ['━'.repeat(filled), 'accent'],
    ['━'.repeat(width - filled), 'off'],
  ]

  return parts.filter(part => part[0] !== '')
}

export function chips(view: PaneFacts): Chip[] {
  const { snapshot, facts } = view
  const list: Chip[] = []
  const status = snapshot.upstreamStatus
  const statusTone: ChipTone = UPSTREAM_TONE[status] ?? 'slate'

  if (facts !== null && facts.contextPercent !== null) {
    const percent = Math.round(facts.contextPercent)
    list.push({ key: 'ctx', tone: contextTone(percent), parts: [['ctx ', 'label'], ...chipBar(percent), [` ${percent}%`, 'value']] })
  }

  if (snapshot.isRepo) {
    const parts: ChipPart[] = [['git ', 'label'], [fit(snapshot.branch ?? 'detached', 24), 'value']]
    if (snapshot.dirty > 0) parts.push([` ±${snapshot.dirty}`, 'accent'])
    if (snapshot.ahead > 0 || snapshot.behind > 0) parts.push([` ${syncText(snapshot)}`, 'aside'])
    list.push({ key: 'git', tone: 'cyan', parts })
    list.push({ key: 'upstream', tone: statusTone, parts: [['up ', 'label'], [status, 'value']] })
  }

  if (facts !== null) list.push({ key: 'model', tone: 'slate', parts: [[`${facts.model} · ${facts.turns} turns`, 'aside']] })

  return list
}
