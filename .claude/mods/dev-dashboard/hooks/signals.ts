import type { RateLimit } from '../types'
import type { PaneFacts } from './view'
import { checkRows, currentPr } from './view'

export type SignalLevel = 'error' | 'warn' | 'info'
export type Signal = { key: string; level: SignalLevel; text: string }

const LEVEL_ORDER: Record<SignalLevel, number> = { error: 0, warn: 1, info: 2 }

const RATE_LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export function protectedBranchMatcher(patterns: string): (branch: string) => boolean {
  const expressions = patterns
    .split(',')
    .map(pattern => pattern.trim())
    .filter(pattern => pattern !== '')
    .map(pattern => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`))

  return branch => expressions.some(expression => expression.test(branch))
}

function rateLimitSignal(limit: RateLimit): Signal | null {
  if (limit.percentUsed < 75) return null

  const name = RATE_LIMIT_NAMES[limit.kind] ?? limit.kind

  return { key: `limit:${limit.kind}`, level: limit.percentUsed >= 90 ? 'error' : 'warn', text: `${name} limit ${Math.round(limit.percentUsed)}% used` }
}

// Only what asks for an action now: a fact that is fine stays out of the list,
// so an empty list means the session can go on as it is.
export function buildSignals(view: PaneFacts, isProtected: (branch: string) => boolean): Signal[] {
  const { snapshot, facts, turn } = view
  const signals: Signal[] = []
  const add = (key: string, level: SignalLevel, text: string) => signals.push({ key, level, text })

  if (snapshot.isRepo) {
    const conflicts = snapshot.conflicts > 0 ? ` · ${snapshot.conflicts} conflicted` : ''

    if (snapshot.operation !== null) add('operation', 'error', `${snapshot.operation} in progress${conflicts}`)
    else if (snapshot.conflicts > 0) add('conflicts', 'error', `${snapshot.conflicts} conflicted files`)
    else if (snapshot.branch === null) add('detached', 'warn', 'detached HEAD')

    if (snapshot.upstreamStatus === 'mismatch') add('upstream', 'error', `push refused: upstream is ${snapshot.upstream ?? 'another branch'}`)
    if (snapshot.upstreamStatus === 'gone') add('upstream', 'warn', 'upstream branch was deleted on the remote')

    if (snapshot.branch !== null && isProtected(snapshot.branch)) {
      if (snapshot.dirty > 0) add('protected:dirty', 'warn', `${snapshot.dirty} uncommitted on shared ${snapshot.branch}`)
      if (snapshot.ahead > 0) add('protected:ahead', 'warn', `${snapshot.ahead} local commits on shared ${snapshot.branch}`)
    } else if (snapshot.ahead > 0) {
      add('ahead', 'info', `↑${snapshot.ahead} not pushed`)
    }

    if (snapshot.behind > 0) add('behind', 'warn', `↓${snapshot.behind} behind upstream, pull before pushing`)

    for (const worktree of snapshot.worktrees) {
      if (worktree.isCurrent || worktree.status === 'ok' || worktree.status === 'none') continue
      add(`worktree:${worktree.path}`, worktree.status === 'mismatch' ? 'warn' : 'info', `worktree ${worktree.name}: upstream ${worktree.status}`)
    }
  }

  for (const row of checkRows(view)) {
    if (row.state === 'fail') add(`check:${row.kind}`, 'error', `${row.kind} failing · ${row.detail}`)
    if (row.state === 'stale') add(`check:${row.kind}`, 'warn', `${row.kind} not rerun since the last edit`)
  }

  const pr = currentPr(view)
  if (pr !== null && pr.state === 'OPEN') {
    if (pr.checks.failed > 0) add('pr:checks', 'error', `PR #${pr.number} checks failing · ${pr.checks.failedNames.slice(0, 2).join(', ')}`)
    if (pr.mergeable === 'CONFLICTING') add('pr:conflicts', 'error', `PR #${pr.number} conflicts with its base`)
    if (pr.reviewDecision === 'CHANGES_REQUESTED') add('pr:review', 'warn', `PR #${pr.number} changes requested`)
  }

  if (turn !== null && (turn.reason === 'error' || turn.reason === 'refusal')) add('turn', 'error', `last turn ended on ${turn.reason === 'error' ? 'an API error' : 'a refusal'}`)

  if (facts !== null) {
    const percent = facts.contextPercent === null ? null : Math.round(facts.contextPercent)
    if (percent !== null && percent >= 70) add('context', percent >= 85 ? 'error' : 'warn', `context ${percent}% · /compact soon`)

    for (const limit of facts.rateLimits) {
      const signal = rateLimitSignal(limit)
      if (signal !== null) signals.push(signal)
    }
  }

  return signals.sort((left, right) => LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level])
}
