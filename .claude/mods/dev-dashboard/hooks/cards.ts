import type { GitSnapshot, SessionFacts, TurnRecap, UpstreamStatus } from '../types'
import type { ChipTone } from './palette'
import { formatDuration, formatTokens, relativeAge } from './recap'
import { contextTone, drawCard } from './svg'
import type { CardBlock, Drawing, PillItem, Tone } from './svg'

export type PaneFacts = {
  snapshot: GitSnapshot
  turn: TurnRecap | null
  prior: TurnRecap | null
  facts: SessionFacts | null
  now: number
  home: string | null
}

export type Pill = { key: string; tone: Tone | null; items: PillItem[]; alt: string }
export type Card = Drawing & { alt: string }

export type ChipPart = [text: string, kind: 'label' | 'value' | 'aside' | 'accent' | 'off']
export type Chip = { key: string; tone: ChipTone; parts: ChipPart[] }

const CHIP_BAR = 6

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

export function pills(view: PaneFacts): Pill[] {
  const { snapshot, facts } = view
  const list: Pill[] = []
  const status = snapshot.upstreamStatus

  if (snapshot.isRepo) {
    const branch: PillItem[] = [{ label: 'BRANCH' }, { value: snapshot.branch ?? 'HEAD (detached)', cls: snapshot.branch === null ? 'yellow' : undefined }]
    if (snapshot.dirty > 0) branch.push({ aside: `±${snapshot.dirty}`, cls: 'yellow' })
    else branch.push({ aside: 'clean', cls: 'green' })
    if (snapshot.ahead > 0 || snapshot.behind > 0) branch.push({ aside: syncText(snapshot) })
    list.push({ key: 'branch', tone: UPSTREAM_TONE[status], items: branch, alt: `branch ${snapshot.branch ?? 'detached'}, ${snapshot.dirty} changed, ${syncText(snapshot)}` })

    const upstream: PillItem[] = [{ label: 'UPSTREAM' }, { value: snapshot.upstream ?? 'none', cls: UPSTREAM_TONE[status] ?? undefined }]
    if (status !== 'ok') upstream.push({ aside: status, cls: UPSTREAM_TONE[status] ?? undefined })
    list.push({ key: 'upstream', tone: UPSTREAM_TONE[status], items: upstream, alt: `upstream ${snapshot.upstream ?? 'none'} ${status}` })
  }

  if (facts !== null && facts.contextPercent !== null) {
    const percent = Math.round(facts.contextPercent)
    const tone = contextTone(percent)
    const context: PillItem[] = [{ label: 'CTX' }, { bar: { percent, tone } }, { value: `${percent}%`, cls: tone }]
    if (facts.contextTokens !== null && facts.contextWindow !== null) context.push({ aside: `${formatTokens(facts.contextTokens)}/${formatTokens(facts.contextWindow)}` })
    list.push({ key: 'ctx', tone, items: context, alt: `context ${percent}%` })
  }

  if (facts !== null) {
    list.push({ key: 'model', tone: null, items: [{ aside: `${facts.model} · ${facts.turns} turns` }], alt: `${facts.model}, ${facts.turns} turns` })
  }

  return list
}

export function placeCard(view: PaneFacts, width: number): Card {
  const { snapshot, home } = view
  const status = snapshot.upstreamStatus
  const statusTone = UPSTREAM_TONE[status]
  const isWorktree = snapshot.worktree !== null
  const name = snapshot.worktree ?? snapshot.projectName
  const path = shortenHome(snapshot.root, home)
  const blocks: CardBlock[] = [
    { kind: 'big', text: name, cls: isWorktree ? 'purple' : 'cyan', size: name.length > 28 ? 15 : 19 },
    { kind: 'line', text: path, cls: 'mu' },
  ]

  if (isWorktree) {
    blocks.push({
      kind: 'row',
      segments: [{ text: 'PROJECT', cls: 'lb', weight: 700, size: 8.5 }, { text: snapshot.projectName, cls: 'fg', weight: 650 }],
      right: snapshot.remoteName === null ? undefined : { text: snapshot.remoteName },
    })
  }

  if (snapshot.isRepo) {
    const isOk = status === 'ok'
    blocks.push({
      kind: 'row',
      segments: [{ text: 'BRANCH', cls: 'lb', weight: 700, size: 8.5 }, { text: snapshot.branch ?? 'HEAD (detached)', cls: snapshot.branch === null ? 'yellow' : 'fg', weight: 650 }],
      right: {
        text: isOk ? (isInSync(snapshot) ? 'in sync' : syncText(snapshot)) : status,
        cls: isOk ? (isInSync(snapshot) ? 'green' : 'mu') : statusTone ?? 'mu',
        weight: 650,
      },
    })
  }

  const drawing = drawCard({
    width,
    tone: isWorktree ? 'purple' : 'cyan',
    title: isWorktree ? 'WORKTREE' : 'PROJECT',
    titleRight: isWorktree || snapshot.remoteName === null ? undefined : { text: snapshot.remoteName },
    blocks,
  })

  return {
    ...drawing,
    alt: `${isWorktree ? 'worktree' : 'project'} ${name} at ${path}${isWorktree ? `, project ${snapshot.projectName}` : ''}${snapshot.branch === null ? '' : `, branch ${snapshot.branch}`}`,
  }
}

export function gitCard(view: PaneFacts, width: number): Card {
  const { snapshot } = view
  const status = snapshot.upstreamStatus
  const tone = UPSTREAM_TONE[status]
  const note = UPSTREAM_NOTE[status]
  const branch = snapshot.branch ?? 'HEAD (detached)'
  const blocks: CardBlock[] = [
    { kind: 'big', text: branch, cls: snapshot.branch === null ? 'yellow' : 'fg', size: branch.length > 16 ? 15 : 19 },
    {
      kind: 'row',
      segments: [{ text: '→', cls: 'lb' }, { text: snapshot.upstream ?? 'no upstream', cls: tone ?? 'mu', weight: 600 }],
      right: status === 'ok' ? undefined : { text: status, cls: tone ?? 'mu', weight: 650 },
    },
  ]

  if (note !== null) blocks.push({ kind: 'line', text: note, cls: tone ?? 'mu' })
  if (snapshot.pushTarget !== null) blocks.push({ kind: 'line', text: `push → ${snapshot.pushTarget}`, cls: 'yellow' })

  const facts = [snapshot.dirty === 0 ? 'clean' : `${snapshot.dirty} changed`, snapshot.worktree === null ? null : `worktree ${snapshot.worktree}`].filter((fact): fact is string => fact !== null)
  blocks.push({ kind: 'line', text: facts.join(' · '), cls: isInSync(snapshot) ? 'green' : 'mu' })

  const drawing = drawCard({
    width,
    tone,
    title: 'GIT',
    titleRight: { text: isInSync(snapshot) ? 'in sync' : syncText(snapshot), cls: isInSync(snapshot) ? 'green' : 'mu' },
    blocks,
  })

  return { ...drawing, alt: `git: branch ${snapshot.branch ?? 'detached'}, upstream ${snapshot.upstream ?? 'none'} ${status}, ${syncText(snapshot)}, ${snapshot.dirty} changed` }
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
      segments: [{ dot: UPSTREAM_TONE[worktree.status] ?? 'purple' }, { text: worktree.name, cls: 'fg', weight: 650 }],
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
          { text: commit.hash.slice(0, 7), cls: 'purple', weight: 650, size: 9 },
          { text: shortAge(commit.age).padStart(3), cls: 'lb', size: 9 },
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
