import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashWriteLabel, checkLabel, describeToolCall, mcpWriteLabel } from '../hooks/activity'

const WORKTREE = '/home/dev/repo'
const START = new Date(2026, 10, 11, 14, 5).getTime()
const BAND_PROPS = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} } as const

type World = {
  sessionUsd: () => number | null
  failingCommand?: RegExp
  refusedCommand?: string
}

type DrawnPill = { alt: string; source: string }

function mockWorld(on: On, world: World) {
  const clock = mock.clock(on, { now: START })

  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.delete', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('settings.read', () => ({ value: { theme: 'dark' } }))
  on('env.get', () => ({ value: '/home/dev' }))
  on('session.cwd', () => ({ value: WORKTREE }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => {
    const usd = world.sessionUsd()

    return { value: { startedAt: START, context: { window: 200_000, percent: 10, tokens: 20_000 }, rateLimits: [], ...(usd === null ? {} : { cost: { usd } }) } as never }
  })
  on('command.register', (_, e) => {
    if (e.name === world.refusedCommand) throw new Error('a name Claude Code ships')

    return { value: { command: e.name } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', (_, e) => {
    const { Text } = _.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('tool.call', (_, e) => {
    const command = e.tool === 'Bash' ? String((e as { command?: unknown }).command) : ''
    const hasFailed = world.failingCommand?.test(command) === true

    return (hasFailed ? { result: { stdout: '', stderr: 'failed', interrupted: false }, isError: true } : { result: { stdout: '', stderr: '', interrupted: false } }) as never
  })

  return clock
}

// $.tool.call is typed per tool across every MCP server connected on this
// machine, more than the type checker can instantiate; the tests pass plain inputs.
function callTool($: Engine, input: { tool: string; [arg: string]: unknown }): Promise<unknown> {
  return ($.tool.call as unknown as (input: object) => Promise<unknown>)(input)
}

async function drawnPills($: Engine): Promise<DrawnPill[] | 'engine'> {
  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS })
  const pills = await band.findAll({ type: 'Svg' })
  const engine = await band.find({ type: 'Text', text: /^engine$/ })
  await band.unmount()

  return engine === undefined ? pills.map(pill => ({ alt: String(pill.props.alt), source: String(pill.props.source) })) : 'engine'
}

async function pillAlts($: Engine): Promise<string[] | 'engine'> {
  const pills = await drawnPills($)

  return pills === 'engine' ? pills : pills.map(pill => pill.alt)
}

function barHeights(source: string): number[] {
  return [...source.matchAll(/<rect class="blue" x="[^"]+" y="[^"]+" width="3" height="([^"]+)"/g)].map(match => Number(match[1]))
}

test('a check is found where a segment runs it, not where its name is only mentioned', () => {
  expect(checkLabel('vendor/bin/pest --filter Foo')).toBe('pest')
  expect(checkLabel('cd app && docker exec -it php81 php artisan test')).toBe('artisan test')
  expect(checkLabel('docker compose exec -w /app php81 vendor/bin/phpstan analyse')).toBe('phpstan')
  expect(checkLabel('tsc -p ~/.claude/mods/dev-dashboard 2>&1 | head -40')).toBe('tsc')
  expect(checkLabel('npm run lint')).toBe('npm run lint')
  expect(checkLabel('claude plugin test ~/.claude/mods/dev-dashboard')).toBe('claude plugin test')
  expect(checkLabel('npm install')).toBeNull()
  expect(checkLabel('grep -n pest composer.json')).toBeNull()
  expect(checkLabel('git commit -m "run pest; then tsc"')).toBeNull()
})

test('a shell write to an outside system is named, a read or a dry run is not', () => {
  expect(bashWriteLabel('git -C ~/repo push origin main')).toBe('git push')
  expect(bashWriteLabel('git --git-dir=$HOME/.dotfiles --work-tree=$HOME push')).toBe('git push')
  expect(bashWriteLabel('kubectl --context tk-dev -n kollus rollout restart deployment/api')).toBe('kubectl rollout restart')
  expect(bashWriteLabel('kubectl get pods -A | grep api')).toBeNull()
  expect(bashWriteLabel('kubectl apply --dry-run=server -f api.yaml')).toBeNull()
  expect(bashWriteLabel('gh pr create --title "Fix"')).toBe('gh pr create')
  expect(bashWriteLabel('gh pr view 12')).toBeNull()
  expect(bashWriteLabel('gh api repos/o/r/issues -f title=x')).toBe('gh api')
  expect(bashWriteLabel('gh api repos/o/r')).toBeNull()
  expect(bashWriteLabel('echo "git push"')).toBeNull()
})

test('an MCP tool counts as a write by its verb, unless its server works on this machine', () => {
  expect(mcpWriteLabel('mcp__a69ecaad-cd7a__slack_send_message')).toBe('slack_send_message')
  expect(mcpWriteLabel('mcp__a03550fc-f4a8__addCommentToJiraIssue')).toBe('addCommentToJiraIssue')
  expect(mcpWriteLabel('mcp__plugin_atlassian_atlassian__executeWrite')).toBe('executeWrite')
  expect(mcpWriteLabel('mcp__a69ecaad-cd7a__slack_read_channel')).toBeNull()
  expect(mcpWriteLabel('mcp__a03550fc-f4a8__getJiraIssue')).toBeNull()
  expect(mcpWriteLabel('mcp__plugin_atlassian_atlassian__executeRead')).toBeNull()
  expect(mcpWriteLabel('mcp__a03550fc-f4a8__addTeamworkGraphContext')).toBeNull()
  expect(mcpWriteLabel('mcp__ccd_turn__update_plan')).toBeNull()
  expect(mcpWriteLabel('mcp__obsidian__write_note')).toBeNull()
})

test('only edits to project files wait for a check', () => {
  const edit = (path: string, isError = false) => describeToolCall({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' }, { result: {}, isError }).editedPaths

  expect(edit('/home/dev/repo/app/Foo.php')).toEqual(['/home/dev/repo/app/Foo.php'])
  expect(edit('/home/dev/repo/README.md')).toEqual([])
  expect(edit('/private/tmp/claude-501/scratchpad/notes.ts')).toEqual([])
  expect(edit('/home/dev/repo/app/Foo.php', true), 'a failed edit changed nothing').toEqual([])
  expect(describeToolCall({ tool: 'Bash', command: "sed -i '' 's/a/b/' app/Foo.php" }, { result: { bashEditDiff: { changedFiles: ['/home/dev/repo/app/Foo.php'] } } }).editedPaths).toEqual(['/home/dev/repo/app/Foo.php'])
  expect(describeToolCall({ tool: 'Bash', command: 'vendor/bin/pest' }, { result: { interrupted: false }, isError: true }).check).toEqual({ label: 'pest', hasPassed: false })
  expect(describeToolCall({ tool: 'Bash', command: 'vendor/bin/pest' }, { result: { backgroundTaskId: 'b1' } }).check, 'a background run has no result yet').toBeNull()
})

test('the cost pill shows the session cost, then the last hour and a bar for each turn from three turns on', async ($, on) => {
  let usd = 1
  const clock = mockWorld(on, { sessionUsd: () => usd })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  const before = await drawnPills($)
  expect(before === 'engine' ? before : before.map(pill => pill.alt)).toEqual(['이 세션 비용 $1.00'])
  expect(before === 'engine' ? [] : barHeights(before[0]?.source ?? ''), 'no turn yet, no bars').toEqual([])
  expect(before === 'engine' ? '' : (before[0]?.source ?? ''), 'the label says the amount runs from the session start').toContain('>세션 비용</text>')

  for (const [index, after] of [1.5, 3.3, 3.5].entries()) {
    await $.turn.start({ text: 'go', turnId: `turn-${index}` })
    await clock.advance(10_000)
    usd = after
    await $.turn.complete({ answer: 'ok', durationMs: 10_000, isAborted: false, turnId: `turn-${index}`, reason: 'answer' })
  }

  const after = await drawnPills($)
  expect(after === 'engine' ? after : after.map(pill => pill.alt)).toEqual(['이 세션 비용 $3.50, 최근 1시간 $2.50, 최근 3턴의 턴별 비용 막대'])

  const heights = barHeights(after === 'engine' ? '' : (after[0]?.source ?? ''))
  expect(heights, 'turns cost $0.50, $1.80 and $0.20').toHaveLength(3)
  expect(Math.max(...heights), 'the dearest turn has the tallest bar').toBe(heights[1])
  expect(heights[0]).toBeGreaterThan(heights[2] ?? Infinity)
})

test('the desktop band leads with the cost, then unverified edits, the check that follows and outside writes', async ($, on) => {
  mockWorld(on, { sessionUsd: () => 1, failingCommand: /pest/ })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  await callTool($, { tool: 'Edit', file_path: `${WORKTREE}/app/Foo.php`, old_string: 'a', new_string: 'b' })
  await callTool($, { tool: 'Write', file_path: `${WORKTREE}/app/Bar.php`, content: '<?php' })
  expect(await pillAlts($)).toEqual(['이 세션 비용 $1.00', '검증: 2개 파일을 고친 뒤 테스트나 검사를 돌리지 않음'])

  await callTool($, { tool: 'Bash', command: 'vendor/bin/pest' })
  expect((await pillAlts($))[1]).toBe('검증: pest 실패 (14:05)')

  await callTool($, { tool: 'Bash', command: 'git push origin feature/NX-1' })
  await callTool($, { tool: 'mcp__a69ecaad-cd7a__slack_send_message', channel_id: 'C1', message: 'done' })
  expect(await pillAlts($)).toEqual(['이 세션 비용 $1.00', '검증: pest 실패 (14:05)', '이 세션의 외부 쓰기 2회, 마지막은 slack_send_message 14:05'])
})

test('with nothing to show, a survey up or the desktop band turned off, the band beneath is drawn', async ($, on) => {
  mockWorld(on, { sessionUsd: () => null })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  expect(await pillAlts($), 'no cost reported and no activity').toEqual('engine')

  await callTool($, { tool: 'Edit', file_path: `${WORKTREE}/app/Foo.php`, old_string: 'a', new_string: 'b' })
  const survey = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND_PROPS, hasSurvey: true } })
  expect(await survey.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await survey.unmount()
})

test('desktopBand off hands the band back', { options: { desktopBand: false } }, async ($, on) => {
  mockWorld(on, { sessionUsd: () => 1 })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  expect(await pillAlts($)).toEqual('engine')
})

test('a refused /dashboard registration does not stop the session facts read at session start', async ($, on) => {
  mockWorld(on, { sessionUsd: () => 1, refusedCommand: 'dashboard' })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  expect(await pillAlts($)).toEqual(['이 세션 비용 $1.00'])
})
