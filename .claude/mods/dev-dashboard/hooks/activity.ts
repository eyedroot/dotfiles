import type { CheckRun, ExternalWrites, Verification } from '../types'

export type ToolCallFacts = { readonly tool: string; readonly [arg: string]: unknown }
export type ToolOutcome = { readonly isError?: boolean; readonly result?: unknown }

export type ToolActivity = {
  editedPaths: string[]
  check: { label: string; hasPassed: boolean } | null
  externalWrite: string | null
}

type BashOutcome = {
  interrupted?: boolean
  backgroundTaskId?: string
  bashEditDiff?: { changedFiles?: unknown }
}

export const NO_VERIFICATION: Verification = { editedSinceCheck: [], lastCheck: null }
export const NO_EXTERNAL_WRITES: ExternalWrites = { count: 0, lastLabel: null, lastAt: null }

const EDITED_FILES_KEPT = 50

// Notes, plans and scratch files need no test run, so editing them leaves
// nothing unverified.
const SCRATCH_PREFIXES = ['/tmp/', '/private/tmp/', '/private/var/folders/', '/var/folders/']
const DOC_EXTENSION = /\.(md|mdx|markdown|txt|rst|adoc)$/i

const WRAPPERS = new Set(['sudo', 'time', 'env', 'exec', 'command', 'nice', 'nohup', 'npx', 'bunx', 'xargs'])
const DOCKER_VALUE_FLAGS = new Set(['-w', '--workdir', '-u', '--user', '-e', '--env', '--env-file'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

const DIRECT_CHECKS = new Set(['pest', 'phpunit', 'paratest', 'phpstan', 'psalm', 'phpcs', 'tsc', 'vue-tsc', 'vitest', 'jest', 'mocha', 'pytest', 'mypy', 'eslint', 'stylelint', 'shellcheck'])
const SCRIPT_CHECK = /^(test|lint|typecheck|type-check|tsc|check)([:-].*)?$/
const COMPOSER_CHECK = /^(test|lint|analy[sz]e|check|phpstan|psalm|cs-check)([:-].*)?$/

const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])
const GH_VALUE_FLAGS = new Set(['-R', '--repo'])
const KUBECTL_VALUE_FLAGS = new Set(['--context', '-n', '--namespace', '--kubeconfig', '--cluster', '--user', '-s', '--server', '--as', '--token'])
const HELM_VALUE_FLAGS = new Set(['--kube-context', '-n', '--namespace', '--kubeconfig'])
// The changing commands of the kubectl-guard skill's table; exec, cp and
// port-forward stay out because they need not write anything.
const KUBECTL_WRITES = new Set(['apply', 'create', 'replace', 'patch', 'edit', 'delete', 'scale', 'autoscale', 'set', 'label', 'annotate', 'taint', 'cordon', 'drain', 'uncordon', 'expose', 'run', 'debug'])
const KUBECTL_ROLLOUT_WRITES = new Set(['restart', 'undo', 'pause', 'resume'])
const HELM_WRITES = new Set(['install', 'upgrade', 'rollback', 'uninstall', 'delete'])
const GH_WRITES: Readonly<Record<string, ReadonlySet<string>>> = {
  pr: new Set(['create', 'merge', 'close', 'reopen', 'comment', 'review', 'edit', 'ready', 'delete']),
  issue: new Set(['create', 'close', 'reopen', 'comment', 'edit', 'delete', 'transfer', 'lock', 'unlock', 'pin', 'unpin']),
  release: new Set(['create', 'edit', 'delete', 'upload']),
  label: new Set(['create', 'edit', 'delete', 'clone']),
  repo: new Set(['create', 'delete', 'edit', 'fork', 'rename', 'archive']),
  workflow: new Set(['run', 'enable', 'disable']),
  run: new Set(['rerun', 'cancel', 'delete']),
  secret: new Set(['set', 'delete']),
  variable: new Set(['set', 'delete']),
}
const GH_API_FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

// MCP servers that act on this machine or inside the app, not on an outside service.
const LOCAL_SERVER_PREFIXES = ['ccd_', 'Claude_']
const LOCAL_SERVERS = new Set(['claude-in-chrome', 'Control_Chrome', 'visualize', 'terminal', 'plugin-authoring', 'phpstorm', 'rea', 'obsidian', 'Read_and_Write_Apple_Notes', 'scheduled-tasks', 'mcp-registry'])
const WRITE_WORDS = new Set([
  'send', 'create', 'update', 'edit', 'delete', 'add', 'transition', 'post', 'publish', 'reply', 'forward', 'share', 'unshare',
  'trash', 'untrash', 'upload', 'write', 'patch', 'schedule', 'respond', 'label', 'unlabel', 'mark', 'unmark', 'apply', 'move',
  'copy', 'certify', 'uncertify', 'set', 'remove', 'merge', 'comment', 'batch', 'destructive', 'rename', 'archive', 'submit', 'approve',
])
// addTeamworkGraphContext and its kin attach context to the conversation; they write nothing.
const CONTEXT_TOOL = /context$/i
const ARTIFACT_DATA_WRITES = new Set(['set', 'update', 'delete', 'batch', 'str_replace'])

function basename(word: string): string {
  return word.slice(word.lastIndexOf('/') + 1)
}

// Splits a shell command into simple commands at unquoted `&&`, `||`, `;`,
// `|`, `&`, parentheses and newlines, each as its words with quotes removed.
// Enough to find the program a segment runs; variables and substitutions
// are left unexpanded.
export function commandSegments(command: string): string[][] {
  const segments: string[][] = []
  let words: string[] = []
  let word = ''
  let hasWord = false
  let quote: '"' | "'" | null = null

  const endWord = () => {
    if (hasWord) words.push(word)
    word = ''
    hasWord = false
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) segments.push(words)
    words = []
  }

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? ''

    if (quote !== null) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && index + 1 < command.length) word += command[(index += 1)]
      else word += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      hasWord = true
    } else if (char === '\\' && index + 1 < command.length) {
      word += command[(index += 1)]
      hasWord = true
    } else if (';|&()\n'.includes(char)) {
      endSegment()
    } else if (/\s/.test(char)) {
      endWord()
    } else {
      word += char
      hasWord = true
    }
  }

  endSegment()

  return segments
}

// The words a segment runs once leading variable assignments and wrappers
// such as sudo, npx, `docker exec <container>` or sail are taken off.
export function programWords(words: readonly string[]): string[] {
  let rest = [...words]

  for (;;) {
    while (rest[0] !== undefined && ASSIGNMENT.test(rest[0])) rest = rest.slice(1)

    const head = rest[0]
    if (head === undefined) return rest

    const name = basename(head)

    if (WRAPPERS.has(name)) {
      rest = rest.slice(1)
      while (rest[0]?.startsWith('-')) rest = rest.slice(1)
      continue
    }

    if (name === 'timeout') {
      rest = rest.slice(2)
      continue
    }

    if (name === 'sail') {
      rest = rest[1] === 'test' ? ['artisan', ...rest.slice(1)] : rest.slice(1)
      continue
    }

    const execAt = name === 'docker' ? (rest[1] === 'exec' ? 1 : rest[1] === 'compose' && rest[2] === 'exec' ? 2 : -1) : name === 'docker-compose' && rest[1] === 'exec' ? 1 : -1
    if (execAt < 0) return rest

    let index = execAt + 1
    while (rest[index]?.startsWith('-')) index += DOCKER_VALUE_FLAGS.has(rest[index] ?? '') ? 2 : 1
    rest = rest.slice(index + 1)
  }
}

function afterFlags(words: readonly string[], valueFlags: ReadonlySet<string>): string[] {
  let index = 0

  while (words[index]?.startsWith('-')) index += valueFlags.has(words[index] ?? '') ? 2 : 1

  return words.slice(index)
}

function checkOf(words: readonly string[]): string | null {
  const [head, sub, third] = words
  if (head === undefined) return null

  const name = basename(head)
  if (DIRECT_CHECKS.has(name)) return name

  switch (name) {
    case 'php':
      if (sub === '-l') return 'php -l'

      return sub !== undefined && !sub.startsWith('-') ? checkOf(words.slice(1)) : null
    case 'artisan':
      return sub === 'test' ? 'artisan test' : null
    case 'pint':
      return words.includes('--test') ? 'pint --test' : null
    case 'php-cs-fixer':
      return words.includes('--dry-run') ? 'php-cs-fixer' : null
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      const script = sub === 'run' ? third : sub

      return script !== undefined && SCRIPT_CHECK.test(script) ? `${name} ${sub === 'run' ? 'run ' : ''}${script}` : null
    }
    case 'composer':
      return sub !== undefined && COMPOSER_CHECK.test(sub) ? `composer ${sub}` : null
    case 'make':
      return sub !== undefined && SCRIPT_CHECK.test(sub) ? `make ${sub}` : null
    case 'go':
      return sub === 'test' || sub === 'vet' ? `go ${sub}` : null
    case 'cargo':
      return sub === 'test' || sub === 'clippy' || sub === 'check' ? `cargo ${sub}` : null
    case 'ruff':
      return sub === 'check' ? 'ruff check' : null
    case 'python':
    case 'python3':
      return sub === '-m' && (third === 'pytest' || third === 'unittest' || third === 'mypy') ? third : null
    case 'playwright':
      return sub === 'test' ? 'playwright test' : null
    case 'claude':
      return sub === 'plugin' && (third === 'test' || third === 'validate') ? `claude plugin ${third}` : null
    case 'bash':
    case 'zsh':
    case 'sh':
      return words.includes('-n') ? `${name} -n` : null
    default:
      return null
  }
}

function ghApiWrites(args: readonly string[]): boolean {
  const methodAt = args.findIndex(arg => arg === '-X' || arg === '--method')
  const method = methodAt >= 0 ? args[methodAt + 1] : args.find(arg => arg.startsWith('--method='))?.slice('--method='.length)

  if (method !== undefined) return method.toUpperCase() !== 'GET'

  return args.some(arg => GH_API_FIELD_FLAGS.has(arg) || arg.startsWith('--field=') || arg.startsWith('--raw-field='))
}

function writeOf(words: readonly string[]): string | null {
  const [head, ...args] = words
  if (head === undefined) return null

  const name = basename(head)
  const isDryRun = args.some(arg => arg === '--dry-run' || arg.startsWith('--dry-run='))

  switch (name) {
    case 'git':
      return afterFlags(args, GIT_VALUE_FLAGS)[0] === 'push' ? 'git push' : null
    case 'kubectl': {
      if (isDryRun) return null

      const [verb, action] = afterFlags(args, KUBECTL_VALUE_FLAGS)
      if (verb === 'rollout') return action !== undefined && KUBECTL_ROLLOUT_WRITES.has(action) ? `kubectl rollout ${action}` : null
      if (verb === 'certificate') return action === 'approve' || action === 'deny' ? `kubectl certificate ${action}` : null

      return verb !== undefined && KUBECTL_WRITES.has(verb) ? `kubectl ${verb}` : null
    }
    case 'helm': {
      const [verb] = afterFlags(args, HELM_VALUE_FLAGS)

      return !isDryRun && verb !== undefined && HELM_WRITES.has(verb) ? `helm ${verb}` : null
    }
    case 'gh': {
      const [group, action] = afterFlags(args, GH_VALUE_FLAGS)
      if (group === 'api') return ghApiWrites(args) ? 'gh api' : null

      return group !== undefined && action !== undefined && GH_WRITES[group]?.has(action) === true ? `gh ${group} ${action}` : null
    }
    case 'docker':
      return args[0] === 'push' ? 'docker push' : null
    case 'npm':
    case 'pnpm':
    case 'yarn':
      return args[0] === 'publish' ? `${name} publish` : null
    default:
      return null
  }
}

function firstOfSegments(command: string, classify: (words: readonly string[]) => string | null): string | null {
  for (const words of commandSegments(command)) {
    const label = classify(programWords(words))
    if (label !== null) return label
  }

  return null
}

export function checkLabel(command: string): string | null {
  return firstOfSegments(command, checkOf)
}

export function bashWriteLabel(command: string): string | null {
  return firstOfSegments(command, writeOf)
}

export function mcpWriteLabel(tool: string): string | null {
  const [prefix, server, ...nameParts] = tool.split('__')
  const name = nameParts.join('__')

  if (prefix !== 'mcp' || server === undefined || name === '') return null
  if (LOCAL_SERVERS.has(server) || LOCAL_SERVER_PREFIXES.some(local => server.startsWith(local))) return null
  if (CONTEXT_TOOL.test(name)) return null

  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/)

  return words.some(word => WRITE_WORDS.has(word)) ? name : null
}

function builtinWriteLabel(call: ToolCallFacts): string | null {
  const action = typeof call.action === 'string' ? call.action : undefined

  switch (call.tool) {
    case 'Artifact':
      return action === undefined || action === 'publish' || action === 'delete' ? `Artifact ${action ?? 'publish'}` : null
    case 'ArtifactData':
      return action !== undefined && ARTIFACT_DATA_WRITES.has(action) ? `ArtifactData ${action}` : null
    case 'ArtifactComments':
      return action === 'reply' || action === 'resolve' ? `ArtifactComments ${action}` : null
    case 'PublishPlugin':
    case 'ShareOnboardingGuide':
      return call.tool
    default:
      return null
  }
}

export function isProjectEdit(path: string): boolean {
  return !SCRATCH_PREFIXES.some(prefix => path.startsWith(prefix)) && !DOC_EXTENSION.test(path)
}

// A Bash command's own diff is what it changed, so it counts whatever the
// exit code; a failed Edit or Write changed nothing.
function editedPathsOf(call: ToolCallFacts, outcome: ToolOutcome, bash: BashOutcome | null): string[] {
  if (bash !== null) {
    const changed = bash.bashEditDiff?.changedFiles

    return Array.isArray(changed) ? changed.filter((path): path is string => typeof path === 'string') : []
  }

  if (outcome.isError === true) return []

  const path = call.tool === 'NotebookEdit' ? call.notebook_path : call.tool === 'Edit' || call.tool === 'Write' ? call.file_path : undefined

  return typeof path === 'string' ? [path] : []
}

export function describeToolCall(call: ToolCallFacts, outcome: ToolOutcome): ToolActivity {
  const hasFailed = outcome.isError === true
  const command = call.tool === 'Bash' && typeof call.command === 'string' ? call.command : null
  const bash = command === null ? null : typeof outcome.result === 'object' && outcome.result !== null ? (outcome.result as BashOutcome) : {}
  // A command still running in the background has no result to judge yet.
  const hasFinished = bash !== null && bash.interrupted !== true && bash.backgroundTaskId === undefined
  const checkName = command !== null && hasFinished ? checkLabel(command) : null

  return {
    editedPaths: editedPathsOf(call, outcome, bash).filter(isProjectEdit),
    check: checkName === null ? null : { label: checkName, hasPassed: !hasFailed },
    externalWrite: hasFailed ? null : command !== null ? bashWriteLabel(command) : (mcpWriteLabel(call.tool) ?? builtinWriteLabel(call)),
  }
}

export function withEdits(verification: Verification, paths: readonly string[]): Verification {
  const added = paths.filter(path => !verification.editedSinceCheck.includes(path))
  if (added.length === 0) return verification

  return { ...verification, editedSinceCheck: [...verification.editedSinceCheck, ...added].slice(-EDITED_FILES_KEPT) }
}

// A finished check covers every edit before it, pass or fail: a failure shows
// as the check's result, and edits after it count as unverified again.
export function withCheck(run: CheckRun): Verification {
  return { editedSinceCheck: [], lastCheck: run }
}

export function withExternalWrite(writes: ExternalWrites, label: string, at: number): ExternalWrites {
  return { count: writes.count + 1, lastLabel: label, lastAt: at }
}
