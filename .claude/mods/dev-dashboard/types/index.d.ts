export type UpstreamStatus = 'ok' | 'mismatch' | 'none' | 'gone'

export type Commit = {
  hash: string
  age: string
  subject: string
}

export type WorktreeRow = {
  path: string
  name: string
  branch: string | null
  upstream: string | null
  status: UpstreamStatus
  isCurrent: boolean
}

export type GitSnapshot = {
  isRepo: boolean
  cwd: string
  root: string
  mainRoot: string | null
  projectName: string
  remoteName: string | null
  branch: string | null
  worktree: string | null
  upstream: string | null
  upstreamStatus: UpstreamStatus
  pushTarget: string | null
  ahead: number
  behind: number
  dirty: number
  commits: Commit[]
  worktrees: WorktreeRow[]
  readAt: number
}

export type TurnRecap = {
  repoRoot: string | null
  endedAt: number
  durationMs: number
  toolCalls: number
  outputTokens: number | null
  reason: string
  lines: string[]
}

export type RateLimit = {
  kind: string
  percentUsed: number
  resetsAt: string | null
}

export type SessionFacts = {
  model: string
  turns: number
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number | null
  contextDelta: number | null
  rateLimits: RateLimit[]
  costUsd: number | null
  startedAt: number | null
}

export type TurnCost = {
  endedAt: number
  usd: number
}

export type TurnCosts = {
  turns: TurnCost[]
  startUsd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'dev-dashboard': {
      git: Shaped<GitSnapshot | null>
      lastTurn: Shaped<TurnRecap | null>
      previous: Shaped<TurnRecap | null>
      session: Shaped<SessionFacts | null>
      isDismissed: boolean
      costs: TurnCosts
    }
  }
}
