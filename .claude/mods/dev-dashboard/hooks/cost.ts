import type { SessionFacts, TurnCost } from '../types'

export const COST_DAY_PREFIX = 'cost-day:'
export const COST_DAYS_KEPT = 7

const SPARK = '▁▂▃▄▅▆▇█'

export function dayKey(at: number): string {
  const day = new Date(at)

  return `${COST_DAY_PREFIX}${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

// Each bar is scaled to the dearest turn shown, so the line compares turns
// with each other, not against a fixed amount.
export function sparkline(values: readonly number[]): string {
  const top = Math.max(...values, 0)
  if (top <= 0) return SPARK[0]?.repeat(values.length) ?? ''

  return values.map(value => SPARK[Math.min(SPARK.length - 1, Math.round((Math.max(0, value) / top) * (SPARK.length - 1)))] ?? '').join('')
}

// Under three minutes the rate swings with every request, so none is given.
export function hourlyCost(facts: SessionFacts, now: number): number | null {
  if (facts.costUsd === null || facts.startedAt === null || facts.costUsd <= 0) return null

  const hours = (now - facts.startedAt) / 3_600_000

  return hours >= 0.05 ? facts.costUsd / hours : null
}

export function promptLabel(text: string): string {
  const firstLine = text.split('\n').map(line => line.trim()).find(line => line !== '')

  return firstLine === undefined ? '(continued turn)' : firstLine
}

export function dearestTurns(turns: readonly TurnCost[], count: number): TurnCost[] {
  return [...turns].sort((left, right) => right.usd - left.usd).slice(0, count)
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

// The day's ledger holds each session's running total under its id, so a
// session written again replaces its own figure instead of adding to it.
export function dayTotal(ledger: unknown): { usd: number; sessions: number } {
  if (ledger === null || typeof ledger !== 'object') return { usd: 0, sessions: 0 }

  const figures = Object.values(ledger as Record<string, unknown>).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  return { usd: figures.reduce((sum, value) => sum + value, 0), sessions: figures.length }
}

export function staleDayKeys(keys: readonly string[], now: number): string[] {
  const kept = new Set(Array.from({ length: COST_DAYS_KEPT }, (_, index) => dayKey(now - index * 24 * 3_600_000)))

  return keys.filter(key => key.startsWith(COST_DAY_PREFIX) && !kept.has(key))
}
