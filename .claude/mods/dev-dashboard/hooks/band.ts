import type { RateLimit, SessionFacts } from '../types'
import { formatUsd, hourlyCost, sparkline } from './cost'
import { formatTokens } from './recap'

export type BandTone = 'ok' | 'warn' | 'crit'
export type BarCell = 'on' | 'off' | 'mark'

// The status line's four steps for a rate-limit bar, plus the context bar's own color.
export type BarColor = 'low' | 'mid' | 'high' | 'crit' | 'context'

export type BandGroup = {
  key: string
  label: string
  percent: number | null
  elapsedShare: number | null
  tone: BandTone
  barColor: BarColor
  value: string
  spark: string | null
  asides: string[]
}

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 24 * 3_600_000 }
const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MS = 24 * 3_600_000
const BAR_GLYPH: Record<BarCell, string> = { on: '■', off: '□', mark: '▣' }

export function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)))
}

// Read the way the status line prints a reset: local clock time, with the
// weekday once the reset is more than a day away.
export function resetClock(resetsAt: number, now: number): string {
  const at = new Date(resetsAt)
  const hours = at.getHours()
  const time = `${hours % 12 === 0 ? 12 : hours % 12}:${String(at.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`

  return resetsAt - now < DAY_MS ? time : `${WEEKDAYS[at.getDay()] ?? ''} ${time}`
}

export function shortTokens(count: number): string {
  return count >= 1_000_000 ? `${+(count / 1_000_000).toFixed(1)}M` : formatTokens(count)
}

export function windowElapsed(limit: RateLimit, now: number): number | null {
  const span = WINDOW_MS[limit.kind]
  const resetsAt = limit.resetsAt === null ? Number.NaN : Date.parse(limit.resetsAt)
  if (span === undefined || Number.isNaN(resetsAt)) return null

  return Math.min(1, Math.max(0, 1 - Math.max(0, resetsAt - now) / span))
}

// A window is judged by its level and by its pace: 40% used a tenth into the
// window runs out long before the reset.
export function limitTone(limit: RateLimit, now: number): BandTone {
  const percent = clampPercent(limit.percentUsed)
  const elapsed = windowElapsed(limit, now)
  const projected = elapsed === null || elapsed < 0.1 ? null : percent / elapsed

  if (percent >= 90 || (projected !== null && projected >= 150 && percent >= 30)) return 'crit'
  if (percent >= 70 || (projected !== null && projected >= 100 && percent >= 20)) return 'warn'

  return 'ok'
}

// The status line steps by level alone; a fast pace lifts the step here too.
export function limitBarColor(percent: number, tone: BandTone): BarColor {
  if (percent >= 90 || tone === 'crit') return 'crit'
  if (percent >= 70) return 'high'
  if (percent >= 50 || tone === 'warn') return 'mid'

  return 'low'
}

export function contextTone(percent: number): BandTone {
  if (percent >= 85) return 'crit'
  if (percent >= 70) return 'warn'

  return 'ok'
}

export function barRuns(percent: number, elapsedShare: number | null, width: number): [text: string, cell: BarCell][] {
  const filled = Math.round((percent / 100) * width)
  const markAt = elapsedShare === null ? -1 : Math.min(width - 1, Math.floor(elapsedShare * width))
  const runs: [string, BarCell][] = []

  for (let index = 0; index < width; index += 1) {
    const cell: BarCell = index === markAt ? 'mark' : index < filled ? 'on' : 'off'
    const last = runs[runs.length - 1]

    if (last !== undefined && last[1] === cell) last[0] += BAR_GLYPH[cell]
    else runs.push([BAR_GLYPH[cell], cell])
  }

  return runs
}

export function bandGroups(facts: SessionFacts, now: number, isWide: boolean, turnCosts: readonly number[]): BandGroup[] {
  const groups: BandGroup[] = facts.rateLimits.map(limit => {
    const percent = clampPercent(limit.percentUsed)
    const tone = limitTone(limit, now)
    const resetsAt = limit.resetsAt === null ? Number.NaN : Date.parse(limit.resetsAt)

    return {
      key: `limit:${limit.kind}`,
      label: LIMIT_LABEL[limit.kind] ?? limit.kind,
      percent,
      elapsedShare: windowElapsed(limit, now),
      tone,
      barColor: limitBarColor(percent, tone),
      value: `${percent}%`,
      spark: null,
      asides: Number.isNaN(resetsAt) || resetsAt <= now ? [] : [`→ ${resetClock(resetsAt, now)}`],
    }
  })

  if (facts.contextPercent !== null) {
    const percent = clampPercent(facts.contextPercent)
    const asides = [
      isWide && facts.contextTokens !== null && facts.contextWindow !== null ? `${shortTokens(facts.contextTokens)}/${shortTokens(facts.contextWindow)}` : null,
      facts.contextDelta !== null && facts.contextDelta !== 0 ? `${facts.contextDelta > 0 ? '+' : '−'}${shortTokens(Math.abs(facts.contextDelta))}` : null,
    ].filter((aside): aside is string => aside !== null)

    groups.push({ key: 'context', label: 'ctx', percent, elapsedShare: null, tone: contextTone(percent), barColor: 'context', value: `${percent}%`, spark: null, asides })
  }

  if (facts.costUsd !== null) {
    const hourly = hourlyCost(facts, now)

    groups.push({
      key: 'cost',
      label: 'cost',
      percent: null,
      elapsedShare: null,
      tone: 'ok',
      barColor: 'low',
      value: formatUsd(facts.costUsd),
      spark: turnCosts.length < 2 ? null : sparkline(turnCosts),
      asides: isWide && hourly !== null ? [`${formatUsd(hourly)}/h`] : [],
    })
  }

  return groups
}
