import type { PullRequest, PullRequestChecks } from '../types'

export const PR_FIELDS = 'number,title,url,state,isDraft,reviewDecision,mergeable,statusCheckRollup'

const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

type RollupItem = { name?: unknown; context?: unknown; conclusion?: unknown; state?: unknown }

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

// A CheckRun reports `conclusion` once finished (empty while it runs); a commit
// status reports `state`.
export function tallyChecks(rollup: unknown): PullRequestChecks {
  const tally: PullRequestChecks = { passed: 0, failed: 0, pending: 0, failedNames: [] }
  if (!Array.isArray(rollup)) return tally

  for (const item of rollup as RollupItem[]) {
    const outcome = text(item.conclusion) ?? text(item.state) ?? 'PENDING'

    if (PASSED.has(outcome)) tally.passed += 1
    else if (FAILED.has(outcome)) {
      tally.failed += 1
      tally.failedNames.push(text(item.name) ?? text(item.context) ?? 'check')
    } else tally.pending += 1
  }

  return tally
}

export function parsePullRequest(stdout: string, branch: string): PullRequest | null {
  let parsed: Record<string, unknown>

  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    return null
  }

  if (typeof parsed.number !== 'number') return null

  return {
    branch,
    number: parsed.number,
    title: text(parsed.title) ?? '',
    url: text(parsed.url) ?? '',
    state: text(parsed.state) ?? 'OPEN',
    isDraft: parsed.isDraft === true,
    reviewDecision: text(parsed.reviewDecision),
    mergeable: text(parsed.mergeable),
    checks: tallyChecks(parsed.statusCheckRollup),
  }
}
