import type { Activity, CheckKind, CheckRun, CostLedger, EditedFile, GitSnapshot, JiraIssue, JiraState, PullRequest, SessionFacts, TurnRecap, UpstreamStatus } from '../types'
import { CHECK_ORDER, isStale } from './checks'
import { formatUsd, hourlyCost } from './cost'
import { isConnectorMissing, ticketKey } from './jira'
import { formatDuration, formatTokens, relativeAge } from './recap'
import type { Tone } from './svg'

export type PaneFacts = {
  snapshot: GitSnapshot
  turn: TurnRecap | null
  prior: TurnRecap | null
  facts: SessionFacts | null
  activity: Activity
  checks: Partial<Record<CheckKind, CheckRun>>
  edits: EditedFile[]
  pr: PullRequest | null
  jira: JiraState | null
  costs: CostLedger
  now: number
  home: string | null
}

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

export function compactAge(fromMs: number, nowMs: number): string {
  return relativeAge(fromMs, nowMs).replace(/ ago$/, '').replace('just now', 'now')
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

export function relativePath(path: string, root: string, home: string | null): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : shortenHome(path, home)
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

// mcp__claude_ai_Atlassian__getJiraIssue reads as getJiraIssue.
export function toolName(tool: string): string {
  return tool.startsWith('mcp__') ? tool.slice(tool.lastIndexOf('__') + 2) : tool
}

export function toolLabel(input: Record<string, unknown>): string {
  const field = (key: string) => (typeof input[key] === 'string' && input[key] !== '' ? (input[key] as string) : null)
  const path = field('file_path') ?? field('notebook_path')

  if (path !== null) return path.slice(path.lastIndexOf('/') + 1)

  return (field('description') ?? field('command') ?? field('pattern') ?? field('query') ?? field('url') ?? field('prompt') ?? '').split('\n')[0] ?? ''
}

export type ActivityLine = { isWorking: boolean; state: string; detail: string }

export function activityLine(view: PaneFacts): ActivityLine {
  const { activity, turn, now } = view

  if (activity.turnStartedAt !== null) {
    return { isWorking: true, state: 'WORKING', detail: `${formatDuration(now - activity.turnStartedAt)} · ${activity.toolCalls} tools` }
  }

  if (turn !== null) {
    return { isWorking: false, state: 'IDLE', detail: `last turn ${formatDuration(turn.durationMs)} · ${turn.toolCalls} tools · ${compactAge(turn.endedAt, now)}` }
  }

  return { isWorking: false, state: 'IDLE', detail: 'no turn yet' }
}

export type CheckState = CheckRun['status'] | 'stale'
export type CheckRow = { kind: CheckKind; state: CheckState; detail: string; age: string }

export const CHECK_TONE: Record<CheckState, Tone | null> = {
  pass: 'green',
  fail: 'red',
  stale: 'yellow',
  stopped: null,
}

export function checkRows(view: PaneFacts): CheckRow[] {
  return CHECK_ORDER.flatMap(kind => {
    const run = view.checks[kind]
    if (run === undefined) return []

    const state: CheckState = run.status === 'pass' && isStale(run, view.edits) ? 'stale' : run.status

    return [{
      kind,
      state,
      detail: run.summary === null ? run.label : `${run.label} · ${run.summary}`,
      age: compactAge(run.endedAt, view.now),
    }]
  })
}

export function currentPr(view: PaneFacts): PullRequest | null {
  return view.pr !== null && view.pr.branch === view.snapshot.branch ? view.pr : null
}

export function prSummary(pr: PullRequest): { text: string; tone: Tone | null } {
  const { checks } = pr
  const state = pr.state === 'OPEN' ? (pr.isDraft ? 'draft' : 'open') : pr.state.toLowerCase()
  const tally = [
    checks.passed > 0 ? `✓${checks.passed}` : null,
    checks.failed > 0 ? `✕${checks.failed}` : null,
    checks.pending > 0 ? `◌${checks.pending}` : null,
  ].filter((part): part is string => part !== null)
  const review = pr.reviewDecision === null ? null : pr.reviewDecision.toLowerCase().replace(/_/g, ' ')
  const text = [`#${pr.number} ${state}`, tally.length === 0 ? null : tally.join(' '), review].filter((part): part is string => part !== null).join(' · ')

  let tone: Tone | null = null
  if (checks.failed > 0 || pr.mergeable === 'CONFLICTING') tone = 'red'
  else if (checks.pending > 0 || pr.reviewDecision === 'CHANGES_REQUESTED') tone = 'yellow'
  else if (pr.state === 'MERGED' || (checks.passed > 0 && pr.reviewDecision === 'APPROVED')) tone = 'green'

  return { text, tone }
}

export function changeSummary(view: PaneFacts): string {
  const { snapshot, edits } = view
  const parts = [
    snapshot.dirty > 0 ? `${snapshot.dirty} uncommitted` : 'tree clean',
    edits.length > 0 ? `${edits.length} edited here` : null,
  ]

  return parts.filter((part): part is string => part !== null).join(' · ')
}

export function diffStat(snapshot: GitSnapshot): string | null {
  if (snapshot.insertions === 0 && snapshot.deletions === 0) return null

  return `+${snapshot.insertions} −${snapshot.deletions}`
}

// Jira groups every workflow status into one of three categories by key.
export const JIRA_STATUS_TONE: Record<string, Tone | null> = {
  new: null,
  indeterminate: 'blue',
  done: 'green',
}

export function todoProgress(issue: JiraIssue): { done: number; total: number } | null {
  if (issue.todos.length === 0) return null

  return { done: issue.todos.filter(todo => todo.isDone).length, total: issue.todos.length }
}

export function issueContext(issue: JiraIssue): string {
  const parent = issue.parentKey === null ? null : `↑ ${issue.parentKey}${issue.parentSummary === null ? '' : ` ${issue.parentSummary}`}`

  return [issue.type, issue.assignee, parent].filter((part): part is string => part !== null).join(' · ')
}

export function branchTicketKey(snapshot: GitSnapshot): string | null {
  return ticketKey(snapshot.branch, snapshot.worktree)
}

export function currentTicket(view: PaneFacts): JiraState | null {
  const key = branchTicketKey(view.snapshot)

  return view.jira !== null && view.jira.key === key ? view.jira : null
}

export function jiraWaitText(failure: string | null): string {
  if (failure === null) return 'reading the Jira issue…'
  if (isConnectorMissing(failure)) return 'waiting for the Atlassian connector…'

  return `Jira unavailable: ${failure}`
}

export function costSummary(view: PaneFacts): string[] {
  const { costs, facts, now } = view
  const hourly = facts === null ? null : hourlyCost(facts, now)
  const average = costs.turns.length === 0 ? null : costs.turns.reduce((sum, turn) => sum + turn.usd, 0) / costs.turns.length

  return [
    costs.todayUsd === null ? null : `today ${formatUsd(costs.todayUsd)}${costs.todaySessions > 1 ? ` · ${costs.todaySessions} sessions` : ''}`,
    hourly === null ? null : `${formatUsd(hourly)}/h`,
    average === null ? null : `avg ${formatUsd(average)}/turn`,
  ].filter((part): part is string => part !== null)
}

export function sessionLine(view: PaneFacts): string {
  const { facts, activity, now } = view
  if (facts === null) return ''

  return [
    facts.model,
    `${facts.turns} turns`,
    `${activity.sessionToolCalls ?? 0} tools`,
    facts.startedAt === null ? null : `session ${formatDuration(now - facts.startedAt)}`,
  ].filter((part): part is string => part !== null).join(' · ')
}

export type ChangeRow = { code: string; path: string; edits: number }

// Git's list first, each file marked with how often this session edited it;
// then the files edited here that git does not list (committed since, or
// outside the repository).
export function changeRows(view: PaneFacts): ChangeRow[] {
  const { snapshot, edits, home } = view
  const editsByPath = new Map(edits.map(file => [relativePath(file.path, snapshot.root, home), file.edits]))
  const listed = snapshot.changedFiles.map(file => ({ code: file.code === '??' ? 'new' : file.code, path: file.path, edits: editsByPath.get(file.path) ?? 0 }))
  const listedPaths = new Set(listed.map(file => file.path))
  const editedOnly = edits
    .map(file => ({ code: '·', path: relativePath(file.path, snapshot.root, home), edits: file.edits }))
    .filter(file => !listedPaths.has(file.path))

  return [...listed, ...editedOnly]
}

export const FILE_CODE_TONE: Record<string, Tone | null> = {
  M: 'yellow',
  MM: 'yellow',
  A: 'green',
  new: 'green',
  D: 'red',
  R: 'blue',
  UU: 'red',
}
