import type { TurnRecap } from '../types'

export const RECAP_ROOTS_KEY = 'recap-roots'
export const RECAP_ROOTS_LIMIT = 20

export function recapKey(repoRoot: string): string {
  return `recap:${repoRoot}`
}

export function firstLines(answer: string, count: number): string[] {
  return answer
    .split('\n')
    .map(line => line.replace(/^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+|>\s*)/, '').replace(/[`*]/g, '').trim())
    .filter(line => line !== '' && !/^[-=]{3,}$/.test(line))
    .slice(0, count)
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`

  return `${Math.round(count / 1000)}k`
}

export function relativeAge(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}

export function makeRecap(input: {
  answer: string
  durationMs: number
  toolCalls: number
  outputTokens: number | null
  reason: string
  repoRoot: string | null
  endedAt: number
  lineCount: number
}): TurnRecap {
  return {
    repoRoot: input.repoRoot,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    toolCalls: input.toolCalls,
    outputTokens: input.outputTokens,
    reason: input.reason,
    lines: firstLines(input.answer, input.lineCount),
  }
}

export function rememberRoot(roots: readonly string[], repoRoot: string): string[] {
  return [repoRoot, ...roots.filter(root => root !== repoRoot)].slice(0, RECAP_ROOTS_LIMIT)
}
