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

export type SessionFacts = {
  model: string
  turns: number
  contextPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'dev-dashboard': {
      git: GitSnapshot | null
      lastTurn: TurnRecap | null
      previous: TurnRecap | null
      session: SessionFacts | null
      isDismissed: boolean
    }
  }
}
