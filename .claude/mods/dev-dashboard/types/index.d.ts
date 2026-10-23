export type UpstreamStatus = 'ok' | 'mismatch' | 'none' | 'gone'

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

export type Commit = {
  hash: string
  age: string
  subject: string
}

export type ChangedFile = {
  code: string
  path: string
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
  changedFiles: ChangedFile[]
  conflicts: number
  insertions: number
  deletions: number
  operation: GitOperation | null
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

export type RunningTool = {
  id: string
  tool: string
  label: string
  startedAt: number
}

export type Activity = {
  turnStartedAt: number | null
  toolCalls: number
  sessionToolCalls: number
  running: RunningTool[]
}

export type CheckKind = 'test' | 'types' | 'lint' | 'build'

export type CheckStatus = 'pass' | 'fail' | 'stopped'

export type CheckRun = {
  kind: CheckKind
  status: CheckStatus
  label: string
  summary: string | null
  endedAt: number
  durationMs: number
}

export type EditedFile = {
  path: string
  edits: number
  lastAt: number
}

export type PullRequestChecks = {
  passed: number
  failed: number
  pending: number
  failedNames: string[]
}

export type PullRequest = {
  branch: string
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  reviewDecision: string | null
  mergeable: string | null
  checks: PullRequestChecks
}

export type JiraTodo = {
  text: string
  isDone: boolean
}

export type JiraIssue = {
  key: string
  summary: string
  status: string
  statusCategory: string
  type: string | null
  priority: string | null
  assignee: string | null
  parentKey: string | null
  parentSummary: string | null
  url: string | null
  todos: JiraTodo[]
  excerpt: string[]
  readAt: number
}

export type JiraState = {
  key: string
  issue: JiraIssue | null
  failure: string | null
  readAt: number
}

export type TurnCost = {
  endedAt: number
  usd: number
  durationMs: number
  prompt: string
}

export type CostLedger = {
  turns: TurnCost[]
  todayUsd: number | null
  todaySessions: number
  startUsd: number | null
  startPrompt: string
}

declare module 'claude-code' {
  interface PluginState {
    'dev-dashboard': {
      git: Shaped<GitSnapshot | null>
      lastTurn: TurnRecap | null
      previous: TurnRecap | null
      session: Shaped<SessionFacts | null>
      isDismissed: boolean
      activity: Activity
      checks: Partial<Record<CheckKind, CheckRun>>
      edits: EditedFile[]
      pr: PullRequest | null
      jira: JiraState | null
      costs: CostLedger
      tick: number
    }
  }
}
