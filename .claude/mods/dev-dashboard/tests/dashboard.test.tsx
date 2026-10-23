import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

import { bandGroups, barRuns, limitBarColor, limitTone, resetClock } from '../hooks/band'
import { classifyCommand, makeCheckRun, summarizeOutput } from '../hooks/checks'
import { dayKey, dayTotal, dearestTurns, hourlyCost, promptLabel, sparkline, staleDayKeys } from '../hooks/cost'
import { descriptionExcerpt, parseJiraIssue, parseTodos, pickJiraSite, ticketKey } from '../hooks/jira'
import { countConflicts, judgeUpstream, parseRemoteName, parseRefs, parseShortstat, parseTrack, parseWorktrees } from '../hooks/git'
import { customThemeSlug, resolveTheme } from '../hooks/palette'
import { parsePullRequest } from '../hooks/pr'
import { firstLines, rememberRoot } from '../hooks/recap'
import { protectedBranchMatcher } from '../hooks/signals'
import { drawCard, fitText } from '../hooks/svg'

const MAIN_ROOT = '/home/dev/repo'
const WORKTREE = `${MAIN_ROOT}/.claude/worktrees/NX-1_feature`
const START = 1_000_000

type TestEngine = Parameters<TestBody>[0]
type CommandAnswer = { exitCode: number; stdout: string }

type Found = { text?: string; props?: Record<string, unknown> }
type Mounted = {
  find: (query: { type: string; text?: RegExp }) => Promise<Found | undefined>
  findAll: (query: { type: string; text?: RegExp }) => Promise<Found[]>
}

const headings = async (ui: Mounted) =>
  (await ui.findAll({ type: 'Text', text: /^(SIGNALS|CHECKS|LAST TURN|CHANGES|COST|GIT|PREVIOUS SESSION)$/ })).map(found => found.text)

const svgAlts = async (ui: Mounted) => (await ui.findAll({ type: 'Svg' })).map(found => String(found.props?.alt ?? ''))

const REFS = [
  'develop\torigin/develop\trefs/heads/develop\t\torigin/develop',
  'feature/NX-1_feature\torigin/develop\trefs/heads/develop\t[ahead 2, behind 1]\torigin/develop',
  'feature/NX-2_other\torigin/feature/NX-2_other\trefs/heads/feature/NX-2_other\t[gone]\torigin/feature/NX-2_other',
].join('\n')

const WORKTREES = [
  `worktree ${MAIN_ROOT}`,
  'HEAD aaaa',
  'branch refs/heads/develop',
  '',
  `worktree ${WORKTREE}`,
  'HEAD bbbb',
  'branch refs/heads/feature/NX-1_feature',
  '',
  `worktree ${MAIN_ROOT}/.claude/worktrees/NX-2_other`,
  'HEAD cccc',
  'branch refs/heads/feature/NX-2_other',
  '',
].join('\n')

const PULL_REQUEST = JSON.stringify({
  number: 7,
  title: 'Add the feature',
  url: 'https://github.com/eyedroot/repo/pull/7',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  mergeable: 'MERGEABLE',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'phpunit', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' },
  ],
})

const JIRA_DESCRIPTION = '## Plan\n\n* <custom data-type="smartlink" data-id="id-0">https://wiki.example/pages/1</custom> \n\nShip the page behind a flag.\n\n## Todo\n\n- [x] first item\n- [ ] second item\n'

const JIRA_ISSUE = JSON.stringify({
  issues: {
    nodes: [{
      key: 'NX-1',
      webUrl: 'https://example.atlassian.net/browse/NX-1',
      fields: {
        summary: 'Add the feature page',
        status: { name: 'In Dev', statusCategory: { key: 'indeterminate' } },
        issuetype: { name: 'Sub-task' },
        priority: { name: 'Major' },
        assignee: { displayName: 'Dev' },
        parent: { key: 'NX-0', fields: { summary: 'Feature epic' } },
        description: JIRA_DESCRIPTION,
      },
    }],
  },
})

const JIRA_SITES = JSON.stringify([
  { id: 'wiki-only', scopes: ['read:page:confluence'] },
  { id: 'site-1', scopes: ['read:jira-work', 'write:jira-work'] },
])

const PANE_PROPS = {
  title: 'Dashboard',
  isFocused: false,
  bodyColumns: 44,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

const DESKTOP_PANE_PROPS = { ...PANE_PROPS, bodyColumns: 100 } as const

function commandAnswer(argv: readonly string[]): CommandAnswer {
  const [program = '', verb = '', flag = ''] = argv

  if (program === 'gh') return { exitCode: 0, stdout: PULL_REQUEST }
  if (verb === 'rev-parse') return { exitCode: 0, stdout: `${WORKTREE}\n${MAIN_ROOT}/.git\n${MAIN_ROOT}/.git/worktrees/NX-1_feature\nfeature/NX-1_feature\n` }
  if (verb === 'config') return { exitCode: 0, stdout: 'git@github.com:eyedroot/repo.git\n' }
  if (verb === 'for-each-ref') return { exitCode: 0, stdout: `${REFS}\n` }
  if (verb === 'status') return { exitCode: 0, stdout: ' M a.ts\n?? b.ts\n' }
  if (verb === 'log') return { exitCode: 0, stdout: 'bbbb1111\t2 hours ago\tAdd the feature\naaaa2222\t3 days ago\tMerge develop\n' }
  if (verb === 'worktree' && flag === 'list') return { exitCode: 0, stdout: WORKTREES }
  if (verb === 'diff') return { exitCode: 0, stdout: ' 2 files changed, 12 insertions(+), 3 deletions(-)\n' }

  return { exitCode: 1, stdout: '' }
}

type ToolAnswer = { result: unknown; text?: string; isError?: true } | { deny: string }

type World = {
  settings?: Record<string, unknown>
  tool?: (e: { tool: string; command?: string }) => ToolAnswer | Promise<ToolAnswer>
  answer?: (argv: readonly string[]) => CommandAnswer
  usage?: unknown
  usageAt?: () => unknown
  exists?: (path: string) => boolean
}

function mockWorld(on: On, world: World = {}) {
  const answer = world.answer ?? commandAnswer
  const store = new Map<string, unknown>()
  const clock = mock.clock(on, { now: START })

  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => ({
    value: { ...answer(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.exists', (_, e) => ({ value: world.exists?.(e.path) ?? false }))
  on('settings.read', () => ({ value: world.settings ?? { theme: 'light' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/dev' : undefined }))
  on('session.cwd', () => ({ value: WORKTREE }))
  on('session.model', () => ({ value: 'Fable 5.1' }))
  on('session.turns', () => ({ value: 3 }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.usage', () => ({ value: (world.usageAt?.() ?? world.usage ?? { startedAt: 0, context: { window: 200000, percent: 18, tokens: 36000 }, rateLimits: [] }) as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('tool.call', async (_, e) => {
    if (String(e.tool) === 'mcp__claude_ai_Atlassian__getAccessibleAtlassianResources') return { result: JIRA_SITES, text: JIRA_SITES }
    if (String(e.tool) === 'mcp__claude_ai_Atlassian__getJiraIssue') return { result: JIRA_ISSUE, text: JIRA_ISSUE }

    return ((await world.tool?.(e as { tool: string; command?: string })) ?? { result: {} }) as never
  })

  return { store, clock }
}

const mountTerminal = ($: TestEngine, bodyColumns = 44) =>
  $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: { ...PANE_PROPS, bodyColumns } })

const mountDesktop = ($: TestEngine) =>
  $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'Pane', requestId: 'dev-dashboard', props: DESKTOP_PANE_PROPS })

test('upstream judgement tells a 1:1 upstream from a mismatched, gone or missing one', () => {
  expect(judgeUpstream('feature/x', 'refs/heads/feature/x', '')).toBe('ok')
  expect(judgeUpstream('feature/x', 'refs/heads/develop', '[ahead 2]')).toBe('mismatch')
  expect(judgeUpstream('feature/x', 'refs/heads/feature/x', '[gone]')).toBe('gone')
  expect(judgeUpstream('feature/x', '', '')).toBe('none')
  expect(judgeUpstream(null, 'refs/heads/develop', '')).toBe('none')
  expect(parseTrack('[ahead 2, behind 1]')).toEqual({ ahead: 2, behind: 1 })
  expect(parseTrack('')).toEqual({ ahead: 0, behind: 0 })
})

test('remote names come out as owner/name for ssh, ssh aliases and https', () => {
  expect(parseRemoteName('git@github.com:eyedroot/repo.git')).toBe('eyedroot/repo')
  expect(parseRemoteName('git@github.com-eyedroot:eyedroot/marketplace.git')).toBe('eyedroot/marketplace')
  expect(parseRemoteName('https://github.com/catenoid-company/kollus-www-v2.git')).toBe('catenoid-company/kollus-www-v2')
  expect(parseRemoteName('https://github.com/catenoid-company/kollus-www-v2')).toBe('catenoid-company/kollus-www-v2')
  expect(parseRemoteName(null)).toBe(null)
})

test('worktree rows carry each branch upstream status and mark the current one', () => {
  const rows = parseWorktrees(WORKTREES, parseRefs(REFS), WORKTREE)

  expect(rows.map(row => row.name)).toEqual(['repo', 'NX-1_feature', 'NX-2_other'])
  expect(rows.map(row => row.status)).toEqual(['ok', 'mismatch', 'gone'])
  expect(rows.map(row => row.isCurrent)).toEqual([false, true, false])
  expect(rows[1]?.upstream).toBe('origin/develop')
})

test('conflicted paths and the diff size come out of git status and --shortstat', () => {
  expect(countConflicts('UU a.ts\nAA b.ts\n M c.ts\n?? d.ts\nDU e.ts\n')).toBe(3)
  expect(parseShortstat(' 3 files changed, 40 insertions(+), 1 deletion(-)')).toEqual({ insertions: 40, deletions: 1 })
  expect(parseShortstat(' 1 file changed, 1 insertion(+)')).toEqual({ insertions: 1, deletions: 0 })
  expect(parseShortstat('')).toEqual({ insertions: 0, deletions: 0 })
})

test('test, type, lint and build runs are told apart from commands that only name a runner', () => {
  expect(classifyCommand('docker exec php81 vendor/bin/phpunit --filter Foo')).toEqual({ kind: 'test', label: 'phpunit' })
  expect(classifyCommand('npm run lint && npm test')).toEqual({ kind: 'test', label: 'npm test' })
  expect(classifyCommand('npx tsc --noEmit -p .')).toEqual({ kind: 'types', label: 'tsc' })
  expect(classifyCommand('vendor/bin/phpstan analyse')).toEqual({ kind: 'types', label: 'phpstan' })
  expect(classifyCommand('./vendor/bin/pint --test')).toEqual({ kind: 'lint', label: 'pint' })
  expect(classifyCommand('claude plugin validate ~/.claude/mods/dev-dashboard')).toEqual({ kind: 'lint', label: 'plugin validate' })
  expect(classifyCommand('pnpm run build')).toEqual({ kind: 'build', label: 'pnpm run build' })
  expect(classifyCommand('cat phpunit.xml')).toBeNull()
  expect(classifyCommand('grep -rn jest src')).toBeNull()
  expect(classifyCommand('tsc --version')).toBeNull()
  expect(classifyCommand('ls -la')).toBeNull()
})

test('a runner tally names the result, and a failing tally fails a run whose exit code was hidden by a pipe', () => {
  expect(summarizeOutput('Test Suites: 1 failed, 2 passed, 3 total\nTests:       1 failed, 11 passed, 12 total')).toEqual({ text: '1 failed, 11 passed', hasFailures: true })
  expect(summarizeOutput('====== 4 passed in 0.12s ======')).toEqual({ text: '4 passed', hasFailures: false })
  expect(summarizeOutput('PHPUnit 10\n\nOK (12 tests, 30 assertions)')).toEqual({ text: '12 tests', hasFailures: false })
  expect(summarizeOutput('FAILURES!\nTests: 12, Assertions: 30, Errors: 1, Failures: 2.')).toEqual({ text: '3 failed of 12', hasFailures: true })
  expect(summarizeOutput('src/a.ts(3,1): error TS1005\nFound 2 errors in 1 file.')).toEqual({ text: '2 errors', hasFailures: true })
  expect(summarizeOutput('✖ 5 problems (3 errors, 2 warnings)')).toEqual({ text: '5 problems', hasFailures: true })
  expect(summarizeOutput('done')).toBeNull()

  const piped = makeCheckRun({ kind: 'test', label: 'phpunit', output: 'Tests: 5, Assertions: 9, Failures: 1.', isError: false, isInterrupted: false, startedAt: 0, endedAt: 1500 })
  expect(piped).toMatchObject({ status: 'fail', summary: '1 failed of 5', durationMs: 1500 })
  expect(makeCheckRun({ kind: 'test', label: 'jest', output: '', isError: true, isInterrupted: true, startedAt: 0, endedAt: 1 }).status).toBe('stopped')
})

test('a pull request reads its checks from the rollup, a CheckRun by conclusion and a commit status by state', () => {
  const pr = parsePullRequest(JSON.stringify({
    number: 3,
    state: 'OPEN',
    isDraft: true,
    reviewDecision: null,
    mergeable: 'CONFLICTING',
    statusCheckRollup: [
      { name: 'a', conclusion: 'SUCCESS' },
      { name: 'b', conclusion: '', status: 'IN_PROGRESS' },
      { context: 'ci/legacy', state: 'FAILURE' },
      { name: 'd', conclusion: 'SKIPPED' },
    ],
  }), 'feature/x')

  expect(pr).toMatchObject({ number: 3, branch: 'feature/x', isDraft: true, mergeable: 'CONFLICTING', checks: { passed: 2, failed: 1, pending: 1, failedNames: ['ci/legacy'] } })
  expect(parsePullRequest('no pull requests found', 'feature/x')).toBeNull()
})

test('shared branch patterns match whole names with * as any text', () => {
  const isProtected = protectedBranchMatcher('main, develop,pre_release*,release/*')

  expect(['main', 'develop', 'pre_release', 'pre_release_1.2', 'release/1.2.5'].every(isProtected)).toBe(true)
  expect(['feature/pre_release_tdev', 'mainline', 'feature/NX-1'].some(isProtected)).toBe(false)
})

test('the ticket key comes from the branch or worktree name, uppercase only', () => {
  expect(ticketKey('feature/NX-454_video_page', null)).toBe('NX-454')
  expect(ticketKey('feature/pre_release_tdev_1.2.5-hotfix-1', null)).toBeNull()
  expect(ticketKey('develop', 'NX-12_other')).toBe('NX-12')
  expect(ticketKey(null, null)).toBeNull()
  expect(pickJiraSite(JIRA_SITES)).toBe('site-1')
  expect(pickJiraSite('[]')).toBeNull()
})

test('a Jira issue keeps its summary, status, parent and the checklist and prose of its description', () => {
  const issue = parseJiraIssue(JIRA_ISSUE, 5)

  expect(issue).toMatchObject({
    key: 'NX-1',
    summary: 'Add the feature page',
    status: 'In Dev',
    statusCategory: 'indeterminate',
    type: 'Sub-task',
    assignee: 'Dev',
    parentKey: 'NX-0',
    parentSummary: 'Feature epic',
    url: 'https://example.atlassian.net/browse/NX-1',
    todos: [{ text: 'first item', isDone: true }, { text: 'second item', isDone: false }],
    excerpt: ['Ship the page behind a flag.'],
    readAt: 5,
  })
  expect(parseTodos('* [X] **bold** done\n- [ ] see [the page](https://x)')).toEqual([{ text: 'bold done', isDone: true }, { text: 'see the page', isDone: false }])
  expect(descriptionExcerpt('# Head\nhttps://only.link\n---\nreal line', 2)).toEqual(['real line'])
  expect(parseJiraIssue('not json', 1)).toBeNull()
})

test('the palette follows the theme setting unless the option forces one', () => {
  expect(resolveTheme('auto', 'light')).toBe('light')
  expect(resolveTheme('auto', 'light-daltonized')).toBe('light')
  expect(resolveTheme('auto', 'dark')).toBe('dark')
  expect(resolveTheme('auto', undefined)).toBe('dark')
  expect(resolveTheme('dark', 'light')).toBe('dark')
  expect(resolveTheme('light', 'dark')).toBe('light')
  expect(customThemeSlug('custom:gruvbox-light')).toBe('gruvbox-light')
  expect(customThemeSlug('custom:../escape')).toBeNull()
  expect(customThemeSlug('light')).toBeNull()
})

test('cards are self-contained SVG documents that restyle themselves for a dark appearance', () => {
  const card = drawCard({ width: 300, tone: 'purple', title: 'WORKTREE', blocks: [{ kind: 'big', text: 'NX-1_feature' }, { kind: 'line', text: '~/repo/.claude/worktrees/NX-1_feature' }] })
  expect(card.width).toBe(300)
  expect(card.height).toBeGreaterThan(60)
  expect(card.source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(card.source).toContain('@media (prefers-color-scheme:dark)')
  expect(card.source).toContain('class="card-purple"')
  expect(card.source).toContain('>NX-1_feature<')
  expect(drawCard({ width: 200, tone: null, title: 'A <B> & C', blocks: [] }).source).toContain('A &lt;B&gt; &amp; C')
  expect(fitText('a very long branch name indeed', 10, 60)).toBe('a very l…')
  expect(fitText('short', 10, 60)).toBe('short')
})

test('a custom theme is read as the preset it is based on', async ($, on) => {
  mockWorld(on, { settings: { theme: 'custom:paper' } })
  on('fs.read', (_, e) => ({ value: e.path === '/home/dev/.claude/themes/paper.json' ? '{"base":"light"}' : '{}' }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  expect((await ui.find({ type: 'Box' }))?.props, 'light base of the custom theme').toMatchObject({ backgroundColor: '#f7f7f7' })
  await ui.unmount()
})

test('recap lines drop markdown marks and empty lines, and the root list stays bounded', () => {
  expect(firstLines('# Title\n\n- **done** the thing\n```\ncode\n```\n---\nnext line', 3)).toEqual(['Title', 'done the thing', 'code'])
  expect(firstLines('`CLAUDE_CODE_PLUGIN_DIRS` 를 settings_json 에 넣습니다', 1)).toEqual(['CLAUDE_CODE_PLUGIN_DIRS 를 settings_json 에 넣습니다'])
  expect(rememberRoot(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
  expect(rememberRoot(Array.from({ length: 20 }, (_, index) => `/r${index}`), '/new')).toHaveLength(20)
})

test('the terminal pane leads with the place, then what is going on, then only the signals that need action', async ($, on) => {
  mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  const shows = async (text: RegExp) => expect(await ui.find({ type: 'Text', text }), `terminal: ${text}`).toBeDefined()

  await shows(/^NX-1$/)
  await shows(/^ IN DEV $/)
  await shows(/^Add the feature page$/)
  await shows(/^Sub-task · Dev · ↑ NX-0 Feature epic$/)
  await shows(/^ 1\/2$/)
  await shows(/^□ second item$/)
  await shows(/^repo$/)
  await shows(/^↳ NX-1_feature$/)
  await shows(/^⑃ feature\/NX-1_feature$/)
  await shows(/^eyedroot\/repo$/)
  await shows(/^~\/repo\/\.claude\/worktrees\/NX-1_feature$/)
  await shows(/^Fable 5\.1 · 3 turns · 0 tools · session 16m 40s$/)
  await shows(/^M {3}$/)
  await shows(/^a\.ts$/)
  await shows(/^new $/)
  await shows(/^b\.ts$/)
  await shows(/^origin\/develop {2}\(mismatch\)$/)
  await shows(/^worktrees \(2\)$/)
  await shows(/^NX-2_other$/)
  await shows(/^ gone$/)
  await shows(/^ ok$/)
  await shows(/^ IDLE $/)
  await shows(/^ no turn yet$/)
  await shows(/^✕ push refused: upstream is origin\/develop$/)
  await shows(/^✕ PR #7 checks failing · lint$/)
  await shows(/^▲ ↓1 behind upstream, pull before pushing$/)
  await shows(/^· ↑2 not pushed$/)
  await shows(/^· worktree NX-2_other: upstream gone$/)
  await shows(/^\+12 −3$/)
  await shows(/^2 uncommitted$/)
  await shows(/^↑2 ↓1 · 2 changed$/)
  await shows(/^#7 open · ✓1 ✕1 · review required$/)
  await shows(/Add the feature/)
  expect(await headings(ui), 'terminal: section order').toEqual(['SIGNALS', 'CHANGES', 'GIT'])
  expect(await ui.find({ type: 'Text', text: /all clear/ }), 'terminal: signals stand in for all clear').toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /ctx|18%/ }), 'terminal: the band above the prompt already shows the context').toBeUndefined()
  expect((await ui.find({ type: 'Box' }))?.props, 'terminal: light background').toMatchObject({ backgroundColor: '#f7f7f7' })
  expect(await ui.find({ type: 'Text', text: /□ first item/ }), 'terminal: a done item stays out').toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Ship the page/ }), 'terminal: a checklist stands in for the prose').toBeUndefined()
  await ui.unmount()
})

test('while a turn runs the pane shows the running tool, then the check it ran and the files edited after it', async ($, on) => {
  let release: () => void = () => {}
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  const { clock } = mockWorld(on, {
    tool: async e => {
      if (e.tool !== 'Bash') return { result: {} }
      if (e.command?.includes('phpunit') === true) {
        await held

        return { isError: true, result: undefined, text: 'Exit code 1\nFAILURES!\nTests: 12, Assertions: 30, Failures: 1.' }
      }

      return { result: { stdout: '', stderr: '', interrupted: false }, text: '' }
    },
  })

  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'run the tests', turnId: 'turn-1' })

  const running = $.tool.call({ tool: 'Bash', command: 'docker exec php81 vendor/bin/phpunit', description: 'Run the unit tests' })
  await clock.advance(42000)

  const during = await mountTerminal($)
  expect(await during.find({ type: 'Text', text: /^ WORKING $/ })).toBeDefined()
  expect(await during.find({ type: 'Text', text: /^ 42s · 1 tools$/ })).toBeDefined()
  expect(await during.find({ type: 'Text', text: /^▸ Bash $/ })).toBeDefined()
  expect(await during.find({ type: 'Text', text: /^Run the unit tests$/ })).toBeDefined()
  await during.unmount()

  release()
  await running
  await $.tool.call({ tool: 'Bash', command: 'npx tsc --noEmit' })
  await clock.advance(5000)
  await $.tool.call({ tool: 'Edit', file_path: `${WORKTREE}/src/a.ts`, old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: `${WORKTREE}/src/a.ts`, old_string: 'b', new_string: 'c' })

  const after = await mountTerminal($)
  const shows = async (text: RegExp) => expect(await after.find({ type: 'Text', text }), `after: ${text}`).toBeDefined()

  expect(await headings(after)).toEqual(['SIGNALS', 'CHECKS', 'CHANGES', 'GIT'])
  await shows(/^ FAIL  $/)
  await shows(/^ STALE $/)
  await shows(/^phpunit · 1 failed of 12$/)
  await shows(/^tsc$/)
  await shows(/^✕ test failing · phpunit · 1 failed of 12$/)
  await shows(/^▲ types not rerun since the last edit$/)
  await shows(/^src\/a\.ts$/)
  await shows(/^ ×2$/)
  await shows(/^2 uncommitted · 1 edited here$/)
  expect(await after.find({ type: 'Text', text: /^▸ / }), 'after: nothing runs').toBeUndefined()
  await after.unmount()

  const desktop = await mountDesktop($)
  const alts = await svgAlts(desktop)
  expect(alts.some(alt => alt === 'checks: test fail phpunit · 1 failed of 12, types stale tsc'), alts.join('\n')).toBe(true)
  expect(alts.some(alt => alt === 'changes: 2 uncommitted · 1 edited here, +12 −3'), alts.join('\n')).toBe(true)
  await desktop.unmount()
})

test('the desktop pane is SVG cards on the host background, the ticket card first and the signals beside what is going on', async ($, on) => {
  mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  const ui = await mountDesktop($)
  const alts = await svgAlts(ui)
  const has = (pattern: RegExp) => expect(alts.some(alt => pattern.test(alt)), `desktop: ${pattern}\n${alts.join('\n')}`).toBe(true)

  has(/^jira NX-1 In Dev: Add the feature page, todo 1\/2$/)
  has(/^worktree NX-1_feature at ~\/repo\/\.claude\/worktrees\/NX-1_feature, project repo, branch feature\/NX-1_feature$/)
  has(/^now: idle, no turn yet$/)
  has(/^signals: error push refused: upstream is origin\/develop; error PR #7 checks failing · lint; warn ↓1 behind upstream, pull before pushing; info ↑2 not pushed; info worktree NX-2_other: upstream gone$/)
  has(/^changes: 2 uncommitted, \+12 −3$/)
  has(/^git: branch feature\/NX-1_feature, upstream origin\/develop mismatch, ↑2 ↓1, PR #7 open · ✓1 ✕1 · review required$/)
  has(/^commits: bbbb111 Add the feature, aaaa222 Merge develop$/)
  has(/^worktrees: repo → origin\/develop ok, NX-2_other → origin\/feature\/NX-2_other gone$/)
  has(/^changes: 2 uncommitted, \+12 −3$/)
  expect(alts[0], 'desktop: the ticket card comes first').toMatch(/^jira NX-1 /)
  expect(alts[1], 'desktop: then the place').toMatch(/^worktree NX-1_feature at /)
  expect(alts[2], 'desktop: then what is going on').toMatch(/^now: /)
  expect(alts.some(alt => alt.startsWith('checks:')), 'desktop: no checks before a run').toBe(false)

  const place = (await ui.findAll({ type: 'Svg' })).find(found => String(found.props?.alt).startsWith('worktree NX-1'))
  expect(String(place?.props?.source)).toContain('@media (prefers-color-scheme:dark)')
  expect(place?.props?.width, 'desktop: the place card spans two columns').toBeGreaterThan(400)
  expect((await ui.findAll({ type: 'Box' })).some(box => box.props?.backgroundColor !== undefined), 'desktop: no painted background').toBe(false)
  expect(await ui.find({ type: 'Button', text: /Refresh/ }), 'desktop: refresh button').toBeDefined()
  await ui.unmount()
})

test('without gh or a PR for the branch the pane leaves the PR out', async ($, on) => {
  mockWorld(on, { answer: argv => (argv[0] === 'gh' ? { exitCode: 1, stdout: '' } : commandAnswer(argv)) })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  expect(await ui.find({ type: 'Text', text: /#7|PR / })).toBeUndefined()
  await ui.unmount()
})

test('a finished turn becomes the idle line and is kept for the next session in that repository', async ($, on) => {
  const { store, clock } = mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'rename it', turnId: 'turn-1' })
  await clock.advance(12000)
  await $.turn.complete({
    answer: '## Done\n\nRenamed the helper and **added** a test.\n\nNext: run the suite.',
    durationMs: 11000,
    isAborted: false,
    turnId: 'turn-1',
    reason: 'answer',
    usage: { input_tokens: 10, output_tokens: 1234, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude' },
  })

  const ui = await mountTerminal($)
  expect(await ui.find({ type: 'Text', text: /^ last turn 12s · 0 tools · now$/ })).toBeDefined()
  expect(await headings(ui)).toContain('LAST TURN')
  expect(await ui.find({ type: 'Text', text: /^12s · 0 tools · 1\.2k out$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Renamed the helper and added a test\.$/ }))?.props, 'the recap lines wrap').toMatchObject({ wrap: 'wrap' })
  expect(await ui.find({ type: 'Text', text: /PREVIOUS SESSION/ })).toBeUndefined()
  await ui.unmount()

  const desktop = await mountDesktop($)
  expect((await svgAlts(desktop)).some(alt => alt.startsWith('last turn: just now, 12s, 0 tools, 1.2k out. Done Renamed the helper')), 'desktop: the last turn card').toBe(true)
  await desktop.unmount()

  expect(store.get(`recap:${MAIN_ROOT}`)).toMatchObject({ toolCalls: 0, outputTokens: 1234, durationMs: 12000, lines: ['Done', 'Renamed the helper and added a test.', 'Next: run the suite.'] })
  expect(store.get('recap-roots')).toEqual([MAIN_ROOT])
})

test('the previous recap of the repository is shown until the first turn of the session', async ($, on) => {
  const { store } = mockWorld(on)
  store.set(`recap:${MAIN_ROOT}`, {
    repoRoot: MAIN_ROOT,
    endedAt: START - 3 * 60 * 60 * 1000,
    durationMs: 65000,
    toolCalls: 7,
    outputTokens: 900,
    reason: 'answer',
    lines: ['Moved the upstream check into git.ts'],
  })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  expect(await ui.find({ type: 'Text', text: /PREVIOUS SESSION/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /3h ago · 1m 5s · 7 tools · 900 out/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Moved the upstream check/ })).toBeDefined()
  await ui.unmount()

  const desktop = await mountDesktop($)
  const alts = await svgAlts(desktop)
  expect(alts.some(alt => /^previous session: 3h ago, 1m 5s, 7 tools, 900 out\. Moved the upstream check into git\.ts$/.test(alt)), alts.join('\n')).toBe(true)
  await desktop.unmount()

  await $.turn.start({ text: 'go on', turnId: 'turn-1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 'turn-1', reason: 'answer' })

  const later = await mountTerminal($)
  expect(await later.find({ type: 'Text', text: /PREVIOUS SESSION/ })).toBeUndefined()
  await later.unmount()
})

test('a clean feature branch with nothing to act on reads all clear', async ($, on) => {
  mockWorld(on, {
    answer: argv => {
      const [program = '', verb = ''] = argv
      let answer = commandAnswer(argv)

      if (program === 'gh') answer = { exitCode: 1, stdout: '' }
      if (verb === 'for-each-ref') answer = { exitCode: 0, stdout: 'feature/NX-1_feature\torigin/feature/NX-1_feature\trefs/heads/feature/NX-1_feature\t\torigin/feature/NX-1_feature\n' }
      if (verb === 'status' || verb === 'diff') answer = { exitCode: 0, stdout: '' }
      if (verb === 'worktree') answer = { exitCode: 0, stdout: '' }

      return answer
    },
  })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  expect(await ui.find({ type: 'Text', text: /^● all clear$/ })).toBeDefined()
  expect(await headings(ui)).toEqual(['GIT'])
  await ui.unmount()
})

test('uncommitted work on a shared branch and a context near full raise signals', async ($, on) => {
  mockWorld(on, {
    answer: argv => {
      const [program = '', verb = ''] = argv
      let answer = commandAnswer(argv)

      if (program === 'gh') answer = { exitCode: 1, stdout: '' }
      if (verb === 'rev-parse') answer = { exitCode: 0, stdout: `${MAIN_ROOT}\n${MAIN_ROOT}/.git\n${MAIN_ROOT}/.git\ndevelop\n` }
      if (verb === 'worktree') answer = { exitCode: 0, stdout: '' }

      return answer
    },
    usage: { startedAt: 0, context: { window: 200000, percent: 78, tokens: 156000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 92 }] },
    exists: path => path === `${MAIN_ROOT}/.git/MERGE_HEAD`,
  })
  await $.session.start({ cwd: MAIN_ROOT, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  const shows = async (text: RegExp) => expect(await ui.find({ type: 'Text', text }), `shared: ${text}`).toBeDefined()

  await shows(/^repo$/)
  await shows(/^develop$/)
  expect(await ui.find({ type: 'Text', text: /Add the feature page/ }), 'shared: no ticket in the branch name').toBeUndefined()
  await shows(/^✕ merge in progress$/)
  await shows(/^▲ 2 uncommitted on shared develop$/)
  await shows(/^▲ context 78% · \/compact soon$/)
  await shows(/^✕ 5h limit 92% used$/)
  await ui.unmount()
})

test('a Jira read that is refused leaves the key with the reason, and the pane counts none of its own calls as the turn\'s tools', async ($, on) => {
  mockWorld(on)
  on('tool.check', () => ({ decision: 'deny', reason: 'blocked by policy' }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await mountTerminal($)
  expect(await ui.find({ type: 'Text', text: /^NX-1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Jira unavailable: / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ no turn yet$/ })).toBeDefined()
  await ui.unmount()
})

const HOUR = 3_600_000

test('a rate-limit window is judged by its level and by how fast it is being used', () => {
  const fiveHour = (percentUsed: number, resetsInMs: number) => ({ kind: 'five_hour', percentUsed, resetsAt: new Date(START + resetsInMs).toISOString() })

  const local = (hours: number, minutes: number, dayOffset = 0) => new Date(2026, 9, 23 + dayOffset, hours, minutes).getTime()

  expect(resetClock(local(14, 19), local(11, 0))).toBe('2:19pm')
  expect(resetClock(local(0, 5), local(23, 0, -1))).toBe('12:05am')
  expect(resetClock(local(9, 30, 2), local(11, 0)), 'more than a day away names the weekday').toBe('Sun 9:30am')
  expect([limitBarColor(14, 'ok'), limitBarColor(54, 'ok'), limitBarColor(75, 'warn'), limitBarColor(92, 'crit')]).toEqual(['low', 'mid', 'high', 'crit'])
  expect(limitBarColor(30, 'crit'), 'a fast pace lifts a low level').toBe('crit')
  expect(limitTone(fiveHour(13, 197 * 60_000), START)).toBe('ok')
  expect(limitTone(fiveHour(72, 10 * 60_000), START)).toBe('warn')
  expect(limitTone(fiveHour(40, 4 * HOUR), START), 'a fifth into the window, on course for 200%').toBe('crit')
  expect(limitTone(fiveHour(93, 10 * 60_000), START)).toBe('crit')
  expect(barRuns(50, 0.25, 8)).toEqual([['■■', 'on'], ['▣', 'mark'], ['■', 'on'], ['□□□□', 'off']])
})

test('the band keeps rate limits, context and cost, and leaves out what the spinner and status line already show', () => {
  const groups = bandGroups({
    model: 'Opus 5.5',
    turns: 3,
    contextPercent: 31,
    contextTokens: 313800,
    contextWindow: 1_000_000,
    contextDelta: 7400,
    rateLimits: [{ kind: 'five_hour', percentUsed: 13, resetsAt: new Date(START + 197 * 60_000).toISOString() }],
    costUsd: 8.04,
    startedAt: START - 2 * HOUR,
  }, START, true, [0.5, 1.8, 0.2])

  expect(groups.find(group => group.key === 'cost')?.spark, 'band: the cost carries the turns as a sparkline').toBe('▃█▂')
  expect(groups.map(group => [group.label, group.value, group.asides.map(aside => aside.replace(/\d{1,2}:\d{2}[ap]m/, 'TIME'))])).toEqual([
    ['5h', '13%', ['→ TIME']],
    ['ctx', '31%', ['314k/1M', '+7.4k']],
    ['cost', '$8.04', ['$4.02/h']],
  ])
})

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} } as const

test('the terminal band draws one row of rate limits, context and cost, and yields to a survey', async ($, on) => {
  mockWorld(on, {
    usage: {
      startedAt: START - 2 * HOUR,
      context: { window: 1_000_000, percent: 31, tokens: 313800 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 13, resetsAt: new Date(START + 197 * 60_000).toISOString() }, { kind: 'seven_day', percentUsed: 92, resetsAt: new Date(START + 297 * 60_000).toISOString() }],
      cost: { usd: 8.04 },
    },
  })
  on('ui.render', (_, e) => {
    const { Text } = _.ui.resolve(e)

    return <Text>engine</Text>
  })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  const shows = async (text: RegExp) => expect(await band.find({ type: 'Text', text }), `band: ${text}`).toBeDefined()

  await shows(/^5h $/)
  await shows(/^ 13%$/)
  await shows(/^ → \d{1,2}:\d{2}[ap]m$/)
  await shows(/^ │ $/)
  await shows(/^7d $/)
  await shows(/^ 92%$/)
  await shows(/^ctx $/)
  await shows(/^ 31%$/)
  await shows(/^ 314k\/1M$/)
  await shows(/^cost $/)
  await shows(/^\$8\.04$/)
  await shows(/^ \$4\.02\/h$/)
  await shows(/^■$/)
  await shows(/^□+$/)
  expect(await band.find({ type: 'Text', text: /engine|calls|Opus|turns/ }), 'band: nothing the status line shows').toBeUndefined()
  expect((await band.find({ type: 'Text', text: /^ 92%$/ }))?.props, 'band: a window near its limit takes the status line red').toMatchObject({ color: '#ad0f00', weight: 'bold' })
  expect((await band.find({ type: 'Text', text: /^ 13%$/ }))?.props, 'band: a window that is fine stays in the label color').toMatchObject({ color: '#606060' })
  await band.unmount()

  const survey = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, hasSurvey: true } })
  expect(await survey.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await survey.unmount()
})

test('with the band turned off the band beneath is drawn', { options: { band: false } }, async ($, on) => {
  mockWorld(on)
  on('ui.render', (_, e) => {
    const { Text } = _.ui.resolve(e)

    return <Text>engine</Text>
  })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await band.unmount()
})

test('cost helpers scale the sparkline to the dearest turn and keep a week of day ledgers', () => {
  expect(sparkline([0.5, 1.8, 0.2])).toBe('▃█▂')
  expect(sparkline([0, 0])).toBe('▁▁')
  expect(promptLabel('\n  run the suite\nand more')).toBe('run the suite')
  expect(promptLabel('')).toBe('(continued turn)')
  expect(dayTotal({ a: 4, b: 3.5, junk: 'x' })).toEqual({ usd: 7.5, sessions: 2 })
  expect(dayTotal(undefined)).toEqual({ usd: 0, sessions: 0 })
  expect(dearestTurns([{ endedAt: 1, usd: 0.5, durationMs: 1, prompt: 'a' }, { endedAt: 2, usd: 1.8, durationMs: 1, prompt: 'b' }], 1).map(turn => turn.prompt)).toEqual(['b'])
  expect(hourlyCost({ model: 'm', turns: 1, contextPercent: null, contextTokens: null, contextWindow: null, contextDelta: null, rateLimits: [], costUsd: 2, startedAt: START - 60_000 }, START), 'too early for a rate').toBeNull()

  const today = new Date(2026, 9, 23, 12).getTime()
  expect(staleDayKeys([dayKey(today), dayKey(today - 6 * 24 * HOUR), dayKey(today - 7 * 24 * HOUR), 'recap-roots'], today)).toEqual([dayKey(today - 7 * 24 * HOUR)])
})

test('each turn\'s cost becomes a bar of the band sparkline and a row of the COST section, and the day ledger counts every session', async ($, on) => {
  let usd = 1
  const { store, clock } = mockWorld(on, { usageAt: () => ({ startedAt: START - HOUR, context: { window: 1_000_000, percent: 10, tokens: 100_000 }, rateLimits: [], cost: { usd } }) })
  store.set(dayKey(START), { 'other-session': 4 })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const turns: [string, number, number][] = [['rename the helper', 1.5, 12_000], ['run the suite\nand more', 3.3, 60_000], ['fix the typo', 3.5, 5_000]]
  for (const [prompt, after, ms] of turns) {
    await $.turn.start({ text: prompt, turnId: prompt })
    await clock.advance(ms)
    usd = after
    await $.turn.complete({ answer: 'ok', durationMs: ms, isAborted: false, turnId: prompt, reason: 'answer' })
  }

  const ui = await mountTerminal($)
  const shows = async (text: RegExp) => expect(await ui.find({ type: 'Text', text }), `cost: ${text}`).toBeDefined()

  await shows(/^COST$/)
  await shows(/^\$3\.50$/)
  await shows(/^today \$7\.50 · 2 sessions$/)
  await shows(/^ · \$3\.43\/h$/)
  await shows(/^ · avg \$0\.83\/turn$/)
  await shows(/^▃█▂$/)
  await shows(/^ last 3 turns$/)
  await shows(/^ \$1\.80$/)
  await shows(/^ run the suite$/)
  await shows(/^ 1m 0s$/)
  await shows(/^ \$0\.50$/)
  expect(await ui.find({ type: 'Text', text: /fix the typo/ }), 'cost: with three turns every turn is listed').toBeDefined()
  await ui.unmount()

  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: /^ ▃█▂$/ })).toBeDefined()
  await band.unmount()

  const desktop = await mountDesktop($)
  const alts = await svgAlts(desktop)
  expect(alts.some(alt => alt.startsWith('cost $3.50, today $7.50 · 2 sessions') && alt.includes('dearest $1.80 run the suite, $0.50 rename the helper, $0.20 fix the typo')), alts.join('\n')).toBe(true)
  await desktop.unmount()

  expect(store.get(dayKey(START))).toEqual({ 'other-session': 4, 'session-1': 3.5 })
})
