import type { ExternalWrites, SessionFacts, TurnCost, Verification } from '../types'
import { SPARK_MIN_TURNS, SPARK_TURNS } from './band'
import { formatUsd, recentSpend } from './cost'
import type { Pill } from './svg'

export type BandPill = Pill & { key: string; alt: string }

// A clock time rather than "2 minutes ago": the band is redrawn when a value
// changes, not as time passes, so an age would go stale on screen.
export function clockTime(at: number): string {
  const date = new Date(at)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function costPill(facts: SessionFacts | null, turns: readonly TurnCost[], now: number): BandPill | null {
  if (facts === null || facts.costUsd === null) return null

  const total = formatUsd(facts.costUsd)
  const lastHourSpend = recentSpend(turns, now)
  const lastHour = lastHourSpend === null ? null : formatUsd(lastHourSpend)
  const turnCosts = turns.length < SPARK_MIN_TURNS ? [] : turns.slice(-SPARK_TURNS).map(turn => turn.usd)
  const alt = [`이 세션 비용 ${total}`, lastHour === null ? null : `최근 1시간 ${lastHour}`, turnCosts.length === 0 ? null : `최근 ${turnCosts.length}턴의 턴별 비용 막대`]

  return {
    key: 'cost',
    tone: 'blue',
    label: '세션 비용',
    value: total,
    bars: turnCosts,
    aside: lastHour === null ? null : `1시간 ${lastHour}`,
    alt: alt.filter(part => part !== null).join(', '),
  }
}

export function verificationPill(verification: Verification): BandPill | null {
  const editedCount = verification.editedSinceCheck.length
  const check = verification.lastCheck

  if (editedCount > 0) {
    const after = check === null ? '' : `, 직전 검증은 ${check.label} ${check.hasPassed ? '통과' : '실패'}`

    return { key: 'verification', tone: 'yellow', label: '검증', value: '미실행', aside: `${editedCount}파일 수정 후`, alt: `검증: ${editedCount}개 파일을 고친 뒤 테스트나 검사를 돌리지 않음${after}` }
  }

  if (check === null) return null

  const result = check.hasPassed ? '통과' : '실패'

  return { key: 'verification', tone: check.hasPassed ? 'green' : 'red', label: '검증', value: `${check.label} ${result}`, aside: clockTime(check.endedAt), alt: `검증: ${check.label} ${result} (${clockTime(check.endedAt)})` }
}

export function externalWritesPill(writes: ExternalWrites): BandPill | null {
  if (writes.count === 0 || writes.lastLabel === null) return null

  const last = writes.lastAt === null ? writes.lastLabel : `${writes.lastLabel} ${clockTime(writes.lastAt)}`

  return { key: 'externalWrites', tone: 'purple', label: '외부 쓰기', value: String(writes.count), aside: last, alt: `이 세션의 외부 쓰기 ${writes.count}회, 마지막은 ${last}` }
}

export function desktopPills(cost: BandPill | null, verification: Verification, writes: ExternalWrites): BandPill[] {
  return [cost, verificationPill(verification), externalWritesPill(writes)].filter((pill): pill is BandPill => pill !== null)
}
