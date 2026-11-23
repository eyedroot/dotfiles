import type { AgentHistory, ExternalWrites, SessionFacts, Verification } from '../types'
import { groupRuns } from './agents'
import type { AgentGroup } from './agents'
import { contextTone } from './svg'
import type { Pill, PillItem } from './svg'

export type BandPill = Pill & { key: string; alt: string }

// A clock time rather than "2 minutes ago": the band is redrawn when a value
// changes, not as time passes, so an age would go stale on screen.
export function clockTime(at: number): string {
  const date = new Date(at)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// Whole minutes only: the agent history's `checkedAt` moves once a minute
// while an agent runs, which is what redraws the band.
export function elapsedText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return '<1분'
  if (minutes < 60) return `${minutes}분`

  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}

function groupText(group: AgentGroup): string {
  return group.count > 1 ? `${group.type} ×${group.count}` : group.type
}

function groupAlt(group: AgentGroup): string {
  const outcome = group.outcome === 'failed' ? ', 실패 포함' : group.outcome === 'stopped' ? ', 중단 포함' : ''

  return `${group.type} ${group.count}개${outcome} (${group.descriptions.join(', ')})`
}

export function agentsPill(history: AgentHistory): BandPill | null {
  if (history.runs.length === 0) return null

  const { active, past } = groupRuns(history)
  const runningCount = active.reduce((sum, group) => sum + group.count, 0)
  const finished = history.runs.filter(run => run.outcome !== 'running')
  const failedCount = finished.filter(run => run.outcome !== 'completed').length
  const items: PillItem[] = [
    ...active.map(group => ({ text: `${groupText(group)} ${elapsedText(history.checkedAt - group.startedAt)}`, tone: 'green' as const, hasDot: true })),
    ...past.map(group => ({ text: groupText(group), isDim: true, ...(group.outcome === 'completed' ? {} : { tone: 'red' as const }) })),
  ]
  const summary = finished.length === 0 ? null : failedCount === 0 ? `완료 ${finished.length}` : `완료 ${finished.length - failedCount} · 실패 ${failedCount}`
  const alt = [
    runningCount === 0 ? '실행 중인 서브에이전트 없음' : `실행 중 ${runningCount}개: ${active.map(groupAlt).join('; ')}`,
    past.length === 0 ? null : `이전에 쓴 서브에이전트: ${past.map(groupAlt).join('; ')}`,
  ]

  return {
    key: 'agents',
    tone: runningCount > 0 ? 'green' : null,
    label: '에이전트',
    value: runningCount > 0 ? `실행 ${runningCount}` : '대기',
    items,
    aside: summary,
    alt: alt.filter(part => part !== null).join('. '),
  }
}

function kiloTokens(tokens: number): string {
  return tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : `${Math.round(tokens / 1000)}k`
}

export function contextPill(facts: SessionFacts | null): BandPill | null {
  if (facts === null || facts.contextPercent === null) return null

  const percent = Math.round(facts.contextPercent)
  const used = facts.contextTokens === null ? null : facts.contextWindow === null ? kiloTokens(facts.contextTokens) : `${kiloTokens(facts.contextTokens)}/${kiloTokens(facts.contextWindow)}`

  return {
    key: 'context',
    tone: contextTone(percent),
    label: '컨텍스트',
    value: `${percent}%`,
    aside: used,
    alt: `컨텍스트 ${percent}% 사용${used === null ? '' : ` (${used} 토큰)`}`,
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

export function desktopPills(agents: AgentHistory, facts: SessionFacts | null, verification: Verification, writes: ExternalWrites): BandPill[] {
  return [agentsPill(agents), contextPill(facts), verificationPill(verification), externalWritesPill(writes)].filter((pill): pill is BandPill => pill !== null)
}
