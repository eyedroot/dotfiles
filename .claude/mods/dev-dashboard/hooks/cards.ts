import type { TurnRecap } from '../types'
import { dearestTurns, formatUsd, sparkline } from './cost'
import { formatDuration } from './recap'
import type { Signal, SignalLevel } from './signals'
import { drawCard } from './svg'
import type { CardBlock, Drawing, Tone } from './svg'
import { CHECK_TONE, JIRA_STATUS_TONE, costSummary, jiraWaitText, UPSTREAM_NOTE, UPSTREAM_TONE, activityLine, changeSummary, checkRows, currentPr, currentTicket, diffStat, isInSync, issueContext, prSummary, recapSummary, relativePath, shortAge, shortenHome, syncText, todoProgress, toolName } from './view'
import type { PaneFacts } from './view'

export type Card = Drawing & { alt: string }

export const SIGNAL_TONE: Record<SignalLevel, Tone> = { error: 'red', warn: 'yellow', info: 'blue' }

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

export function ticketCard(view: PaneFacts, width: number): Card | null {
  const ticket = currentTicket(view)
  if (ticket === null) return null

  const { issue } = ticket

  if (issue === null) {
    const drawing = drawCard({ width, tone: null, title: ticket.key, blocks: [{ kind: 'line', text: jiraWaitText(ticket.failure) }] })

    return { ...drawing, alt: `jira ${ticket.key}: ${ticket.failure ?? 'reading'}` }
  }

  const tone = JIRA_STATUS_TONE[issue.statusCategory] ?? null
  const progress = todoProgress(issue)
  const context = issueContext(issue)
  const openTodos = issue.todos.filter(todo => !todo.isDone)
  const blocks: CardBlock[] = [{ kind: 'big', text: issue.summary, size: issue.summary.length > 24 ? 13 : 16 }]

  if (context !== '') blocks.push({ kind: 'line', text: context })
  if (progress !== null) {
    blocks.push({ kind: 'gap', px: 4 }, { kind: 'bar', percent: (progress.done / progress.total) * 100, tone: tone ?? 'blue' })
    blocks.push(...openTodos.slice(0, 3).map((todo): CardBlock => ({ kind: 'row', segments: [{ text: '□', cls: 'lb' }, { text: todo.text, cls: 'fg' }] })))
  } else {
    blocks.push(...issue.excerpt.slice(0, 2).map((line): CardBlock => ({ kind: 'line', text: line })))
  }

  const drawing = drawCard({
    width,
    tone,
    title: issue.key,
    titleRight: { text: progress === null ? issue.status : `${issue.status} · ${progress.done}/${progress.total}`, cls: tone ?? 'mu' },
    blocks,
  })

  return { ...drawing, alt: `jira ${issue.key} ${issue.status}: ${issue.summary}${progress === null ? '' : `, todo ${progress.done}/${progress.total}`}` }
}

export function nowCard(view: PaneFacts, signals: readonly Signal[], width: number): Card {
  const line = activityLine(view)
  const isAllClear = !signals.some(signal => signal.level !== 'info')
  const blocks: CardBlock[] = [{ kind: 'big', text: line.state.toLowerCase(), cls: line.isWorking ? 'blue' : 'fg', side: line.detail }]

  for (const running of view.activity.running.slice(0, 4)) {
    blocks.push({
      kind: 'row',
      segments: [{ dot: 'blue' }, { text: toolName(running.tool), cls: 'blue', weight: 650 }, { text: running.label, cls: 'fg' }],
      right: { text: formatDuration(view.now - running.startedAt) },
    })
  }

  if (isAllClear) blocks.push({ kind: 'row', segments: [{ dot: 'green' }, { text: 'all clear', cls: 'green', weight: 650 }] })

  const drawing = drawCard({ width, tone: line.isWorking ? 'blue' : null, title: 'NOW', blocks })
  const running = view.activity.running.map(tool => `${toolName(tool.tool)} ${tool.label}`.trim())

  return { ...drawing, alt: `now: ${line.state.toLowerCase()}, ${line.detail}${running.length === 0 ? '' : `; running ${running.join(', ')}`}${isAllClear ? '; all clear' : ''}` }
}

export function signalsCard(signals: readonly Signal[], width: number): Card | null {
  if (signals.length === 0) return null

  const tone = SIGNAL_TONE[signals[0]?.level ?? 'info']
  const blocks: CardBlock[] = signals.map((signal): CardBlock => ({
    kind: 'row',
    segments: [{ dot: SIGNAL_TONE[signal.level] }, { text: signal.text, cls: signal.level === 'info' ? 'mu' : 'fg', weight: signal.level === 'error' ? 650 : undefined }],
  }))
  const drawing = drawCard({ width, tone, title: 'SIGNALS', titleRight: { text: String(signals.length) }, blocks })

  return { ...drawing, alt: `signals: ${signals.map(signal => `${signal.level} ${signal.text}`).join('; ')}` }
}

export function checksCard(view: PaneFacts, width: number): Card | null {
  const rows = checkRows(view)
  if (rows.length === 0) return null

  const blocks: CardBlock[] = rows.map((row): CardBlock => ({
    kind: 'row',
    segments: [
      { dot: CHECK_TONE[row.state] ?? 'purple' },
      { text: row.kind.toUpperCase().padEnd(5), cls: 'lb', weight: 700, size: 8.5 },
      { text: row.detail, cls: 'fg' },
    ],
    right: { text: `${row.state} · ${row.age}`, cls: CHECK_TONE[row.state] ?? 'mu', weight: 650 },
  }))
  const tone = rows.some(row => row.state === 'fail') ? 'red' : rows.some(row => row.state === 'stale') ? 'yellow' : 'green'
  const drawing = drawCard({ width, tone, title: 'CHECKS', blocks })

  return { ...drawing, alt: `checks: ${rows.map(row => `${row.kind} ${row.state} ${row.detail}`).join(', ')}` }
}

export function changesCard(view: PaneFacts, width: number, fileCount: number): Card | null {
  const { snapshot, edits, home } = view
  if (snapshot.dirty === 0 && edits.length === 0) return null

  const stat = diffStat(snapshot)
  const blocks: CardBlock[] = [
    { kind: 'line', text: changeSummary(view) },
    ...edits.slice(0, fileCount).map((file): CardBlock => ({
      kind: 'row',
      segments: [{ text: relativePath(file.path, snapshot.root, home), cls: 'fg' }],
      right: { text: `×${file.edits}` },
    })),
  ]
  const drawing = drawCard({ width, tone: null, title: 'CHANGES', titleRight: stat === null ? undefined : { text: stat }, blocks })

  return { ...drawing, alt: `changes: ${changeSummary(view)}${stat === null ? '' : `, ${stat}`}` }
}

export function costCard(view: PaneFacts, width: number, sparkTurns: number, dearestCount: number): Card | null {
  const total = view.facts?.costUsd ?? null
  if (total === null) return null

  const { turns } = view.costs
  const summary = costSummary(view).join(' · ')
  const blocks: CardBlock[] = [{ kind: 'big', text: formatUsd(total), side: summary }]

  if (turns.length > 1) blocks.push({ kind: 'line', text: sparkline(turns.slice(-sparkTurns).map(turn => turn.usd)), cls: 'purple', size: 12 })
  blocks.push(...dearestTurns(turns, dearestCount).map((turn): CardBlock => ({
    kind: 'row',
    segments: [{ text: formatUsd(turn.usd), cls: 'fg', weight: 650 }, { text: turn.prompt, cls: 'mu' }],
    right: { text: formatDuration(turn.durationMs) },
  })))

  const drawing = drawCard({ width, tone: 'purple', title: 'COST', blocks })

  return { ...drawing, alt: `cost ${formatUsd(total)}${summary === '' ? '' : `, ${summary}`}${turns.length === 0 ? '' : `; dearest ${dearestTurns(turns, dearestCount).map(turn => `${formatUsd(turn.usd)} ${turn.prompt}`).join(', ')}`}` }
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

  const pr = currentPr(view)
  const prLine = pr === null ? null : prSummary(pr)
  if (prLine !== null) blocks.push({ kind: 'row', segments: [{ text: 'PR', cls: 'lb', weight: 700, size: 8.5 }, { text: prLine.text, cls: prLine.tone ?? 'fg', weight: 600 }] })

  const others = snapshot.worktrees.filter(worktree => !worktree.isCurrent).length
  if (others > 0) blocks.push({ kind: 'line', text: `${others} other worktrees` })

  const drawing = drawCard({
    width,
    tone,
    title: 'GIT',
    titleRight: { text: isInSync(snapshot) ? 'in sync' : syncText(snapshot), cls: isInSync(snapshot) ? 'green' : 'mu' },
    blocks,
  })

  return { ...drawing, alt: `git: branch ${snapshot.branch ?? 'detached'}, upstream ${snapshot.upstream ?? 'none'} ${status}, ${syncText(snapshot)}${prLine === null ? '' : `, PR ${prLine.text}`}` }
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
