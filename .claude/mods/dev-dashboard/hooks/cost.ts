import type { TurnCost } from '../types'

export const RECENT_SPEND_MS = 3_600_000

const SPARK = '▁▂▃▄▅▆▇█'

// Each bar is scaled to the dearest turn shown, so the line compares turns
// with each other, not against a fixed amount.
export function sparkline(values: readonly number[]): string {
  const top = Math.max(...values, 0)
  if (top <= 0) return SPARK[0]?.repeat(values.length) ?? ''

  return values.map(value => SPARK[Math.min(SPARK.length - 1, Math.round((Math.max(0, value) / top) * (SPARK.length - 1)))] ?? '').join('')
}

// What the turns that ended in the last hour cost. A session left open for a
// day makes its lifetime average per hour meaningless; this stays current.
export function recentSpend(turns: readonly TurnCost[], now: number): number | null {
  const recent = turns.filter(turn => now - turn.endedAt <= RECENT_SPEND_MS)

  return recent.length === 0 ? null : recent.reduce((sum, turn) => sum + turn.usd, 0)
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}
