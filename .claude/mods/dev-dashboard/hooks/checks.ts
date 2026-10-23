import type { CheckKind, CheckRun, CheckStatus, EditedFile } from '../types'

export const CHECK_ORDER: readonly CheckKind[] = ['test', 'types', 'lint', 'build']

// Earlier entries win, so `npm run lint && npm test` counts as a test run.
const CHECK_PATTERNS: readonly (readonly [CheckKind, RegExp])[] = [
  ['test', /\b(phpunit|pest|paratest|jest|vitest|pytest|playwright|cypress|mocha|rspec|artisan\s+test|go\s+test|cargo\s+test|(?:npm|pnpm|yarn|bun|composer)\s+(?:run\s+)?test|make\s+test|plugin\s+test)\b/],
  ['types', /\b(tsc|vue-tsc|phpstan|larastan|psalm|mypy|pyright|(?:npm|pnpm|yarn|bun)\s+run\s+(?:typecheck|type-check))\b/],
  ['lint', /\b(eslint|biome|pint|php-cs-fixer|phpcs|ruff|rubocop|golangci-lint|stylelint|prettier\s+(?:--check|-c)|plugin\s+validate|(?:npm|pnpm|yarn|bun)\s+run\s+lint)\b/],
  ['build', /\b((?:npm|pnpm|yarn|bun)\s+run\s+build|vite\s+build|next\s+build|cargo\s+build|go\s+build|docker\s+(?:compose\s+)?build)\b/],
]

// Commands that only name a runner (reading its config, looking it up) are not runs of it.
const NOT_A_RUN = /^\s*(cat|less|head|tail|grep|rg|ls|find|which|type|echo|printf|sed|awk|git|open|code|vim?)\b|\s--(help|version)\b/

export function classifyCommand(command: string): { kind: CheckKind; label: string } | null {
  if (NOT_A_RUN.test(command)) return null

  for (const [kind, pattern] of CHECK_PATTERNS) {
    const match = pattern.exec(command)
    if (match !== null) return { kind, label: match[0].replace(/\s+/g, ' ') }
  }

  return null
}

export type OutputSummary = { text: string; hasFailures: boolean }

// Runners print their tally near the end; a piped `| tail` keeps the exit code 0
// while the tally still says the run failed, so the tally decides too.
export function summarizeOutput(output: string): OutputSummary | null {
  const lines = output.slice(-6000).split('\n').reverse()

  const tally = lines.find(line => /\d+ (passed|failed)/.test(line))
  if (tally !== undefined) {
    const failed = Number(/(\d+) failed/.exec(tally)?.[1] ?? 0)
    const passed = Number(/(\d+) passed/.exec(tally)?.[1] ?? 0)
    const parts = [failed > 0 ? `${failed} failed` : null, passed > 0 ? `${passed} passed` : null].filter((part): part is string => part !== null)

    return { text: parts.join(', '), hasFailures: failed > 0 }
  }

  const phpunitOk = lines.map(line => /^OK \((\d+) tests?/.exec(line.trim())).find(match => match !== null)
  if (phpunitOk !== undefined && phpunitOk !== null) return { text: `${phpunitOk[1]} tests`, hasFailures: false }

  const phpunitFailed = lines.find(line => /^Tests: \d+, Assertions: \d+/.test(line.trim()))
  if (phpunitFailed !== undefined) {
    const total = Number(/Tests: (\d+)/.exec(phpunitFailed)?.[1] ?? 0)
    const broken = Number(/Failures: (\d+)/.exec(phpunitFailed)?.[1] ?? 0) + Number(/Errors: (\d+)/.exec(phpunitFailed)?.[1] ?? 0)

    return { text: `${broken} failed of ${total}`, hasFailures: broken > 0 }
  }

  const found = lines.map(line => /Found (\d+) errors?/.exec(line)).find(match => match !== null)
  if (found !== undefined && found !== null) return { text: `${found[1]} errors`, hasFailures: Number(found[1]) > 0 }

  const problems = lines.map(line => /(\d+) problems? \((\d+) errors?/.exec(line)).find(match => match !== null)
  if (problems !== undefined && problems !== null) return { text: `${problems[1]} problems`, hasFailures: Number(problems[2]) > 0 }

  return null
}

export function makeCheckRun(input: {
  kind: CheckKind
  label: string
  output: string
  isError: boolean
  isInterrupted: boolean
  startedAt: number
  endedAt: number
}): CheckRun {
  const summary = summarizeOutput(input.output)
  let status: CheckStatus = 'pass'

  if (input.isInterrupted) status = 'stopped'
  else if (input.isError || summary?.hasFailures === true) status = 'fail'

  return {
    kind: input.kind,
    status,
    label: input.label,
    summary: summary?.text ?? null,
    endedAt: input.endedAt,
    durationMs: input.endedAt - input.startedAt,
  }
}

export function isStale(run: CheckRun, edits: readonly EditedFile[]): boolean {
  return edits.some(file => file.lastAt > run.endedAt)
}

export function recordEdit(edits: readonly EditedFile[], path: string, at: number, limit = 40): EditedFile[] {
  const earlier = edits.find(file => file.path === path)
  const edited: EditedFile = { path, edits: (earlier?.edits ?? 0) + 1, lastAt: at }

  return [edited, ...edits.filter(file => file.path !== path)].slice(0, limit)
}
