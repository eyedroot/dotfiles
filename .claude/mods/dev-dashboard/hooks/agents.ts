import type { AgentInfo } from 'claude-code'

import type { AgentHistory, AgentOutcome, AgentRun } from '../types'

export const NO_AGENTS: AgentHistory = { runs: [], checkedAt: 0 }

// Finished runs beyond this are dropped oldest first; the band shows a handful
// at most and folds the rest into a count.
const RUNS_KEPT = 40

type ListedAgent = Pick<AgentInfo, 'id' | 'type' | 'description' | 'startTime' | 'taskStatus'>
type Report = { agentId: string; status: 'completed' | 'failed' | 'stopped' }

// taskStatus, not status: a teammate waiting for a message is `idle` in
// status but still holds its task, and the band counts it as running.
function outcomeOf(taskStatus: AgentInfo['taskStatus']): AgentOutcome {
  if (taskStatus === 'completed') return 'completed'
  if (taskStatus === 'failed') return 'failed'
  if (taskStatus === 'killed') return 'stopped'

  return 'running'
}

function keepRecent(runs: AgentRun[]): AgentRun[] {
  const finished = runs.filter(run => run.outcome !== 'running')
  const dropCount = Math.max(0, runs.length - RUNS_KEPT)
  const dropped = new Set(finished.sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0)).slice(0, dropCount).map(run => run.id))

  return runs.filter(run => !dropped.has(run.id))
}

// The engine drops a finished agent's task after a while, so $.agent.list()
// alone cannot say which agents ran earlier in the session; the history keeps
// them. A running run that left the list ended without a report reaching us.
export function mergeListed(history: AgentHistory, listed: readonly ListedAgent[], now: number): AgentHistory {
  const byId = new Map(listed.map(agent => [agent.id, agent]))
  const runs = history.runs.map(run => {
    const agent = byId.get(run.id)
    if (agent === undefined) return run.outcome === 'running' ? { ...run, outcome: 'completed' as const, endedAt: now } : run

    const outcome = outcomeOf(agent.taskStatus)
    const endedAt = outcome === 'running' ? null : (run.endedAt ?? now)

    return { ...run, type: agent.type, description: agent.description, outcome, endedAt }
  })
  const known = new Set(runs.map(run => run.id))
  const added = listed
    .filter(agent => !known.has(agent.id))
    .map(agent => {
      const outcome = outcomeOf(agent.taskStatus)

      return { id: agent.id, type: agent.type, description: agent.description, startedAt: agent.startTime, endedAt: outcome === 'running' ? null : now, outcome }
    })

  return { runs: keepRecent([...runs, ...added]), checkedAt: minuteOf(now) }
}

// Elapsed times are drawn in whole minutes, so the history only moves to a new
// minute: a poll inside the same minute leaves it equal and redraws nothing.
function minuteOf(at: number): number {
  return Math.floor(at / 60_000) * 60_000
}

export function withReport(history: AgentHistory, report: Report, now: number): AgentHistory {
  return {
    ...history,
    runs: history.runs.map(run => (run.id === report.agentId ? { ...run, outcome: report.status, endedAt: run.endedAt ?? now } : run)),
  }
}

export function hasRunning(history: AgentHistory): boolean {
  return history.runs.some(run => run.outcome === 'running')
}

export type AgentGroup = {
  type: string
  count: number
  outcome: AgentOutcome
  startedAt: number
  descriptions: string[]
}

// One entry per agent type, so three code_explorer runs read as one name with
// a count. Running types come first in the order they started; finished ones
// follow, the most recently ended first. A type both running and finished
// shows in both places.
export function groupRuns(history: AgentHistory): { active: AgentGroup[]; past: AgentGroup[] } {
  const group = (runs: readonly AgentRun[]) => {
    const groups: AgentGroup[] = []

    for (const run of runs) {
      const found = groups.find(entry => entry.type === run.type)

      if (found === undefined) {
        groups.push({ type: run.type, count: 1, outcome: run.outcome, startedAt: run.startedAt, descriptions: [run.description] })
        continue
      }

      found.count += 1
      found.startedAt = Math.min(found.startedAt, run.startedAt)
      found.descriptions.push(run.description)
      // A failed or stopped run marks its group so a failure is not hidden behind
      // a later success of the same type.
      if (found.outcome === 'completed') found.outcome = run.outcome
    }

    return groups
  }

  const active = history.runs.filter(run => run.outcome === 'running').sort((a, b) => a.startedAt - b.startedAt)
  const past = history.runs.filter(run => run.outcome !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))

  return { active: group(active), past: group(past) }
}
