import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashWriteLabel, checkLabel, describeToolCall, mcpWriteLabel } from '../hooks/activity'
import { NO_AGENTS, mergeListed } from '../hooks/agents'
import { agentsPill, contextPill } from '../hooks/desktopBand'

const WORKTREE = '/home/dev/repo'
const START = new Date(2026, 10, 11, 14, 5).getTime()
const BAND_PROPS = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} } as const

type ListedAgent = { id: string; type: string; description: string; startTime: number; taskStatus: 'running' | 'completed' | 'failed' | 'killed' }

type World = {
  sessionUsd: () => number | null
  hasContext?: boolean
  agents?: () => ListedAgent[]
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

    return { value: { startedAt: START, context: world.hasContext === false ? { window: 200_000 } : { window: 200_000, percent: 10, tokens: 20_000 }, rateLimits: [], ...(usd === null ? {} : { cost: { usd } }) } as never }
  })
  on('command.register', (_, e) => {
    if (e.name === world.refusedCommand) throw new Error('a name Claude Code ships')

    return { value: { command: e.name } }
  })
  on('agent.list', () => ({ value: (world.agents?.() ?? []).map(agent => ({ ...agent, status: agent.taskStatus === 'killed' ? 'killed' : agent.taskStatus, kind: 'local_agent', label: agent.description, cwd: WORKTREE, tokenCount: 0, tokenSamples: [], hasRow: true })) as never }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'spawned' }))
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

  // The kit's mount keeps the engine's node beside a drawn band, so the band
  // counts as handed back only when it drew no pill.
  return pills.length === 0 && engine !== undefined ? 'engine' : pills.map(pill => ({ alt: String(pill.props.alt), source: String(pill.props.source) }))
}

async function pillAlts($: Engine): Promise<string[] | 'engine'> {
  const pills = await drawnPills($)

  return pills === 'engine' ? pills : pills.map(pill => pill.alt)
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

const run = (id: string, type: string, startTime: number, taskStatus: ListedAgent['taskStatus'] = 'running'): ListedAgent => ({ id, type, description: `${type} task ${id}`, startTime, taskStatus })

test('running agent types lead with a dot and their time, earlier ones follow dimmed, a failure in red', () => {
  const history = mergeListed(
    NO_AGENTS,
    [run('a1', 'Explore', START - 600_000, 'completed'), run('a2', 'code_explorer', START - 180_000), run('a3', 'code_explorer', START - 30_000), run('a4', 'test_runner', START - 20_000, 'failed'), run('a5', 'Plan', START)],
    START,
  )
  const pill = agentsPill(history)

  expect(pill?.value).toBe('실행 3')
  expect(pill?.items?.map(item => item.text)).toEqual(['code_explorer ×2 3분', 'Plan <1분', 'Explore', 'test_runner'])
  expect(pill?.items?.map(item => item.isDim === true)).toEqual([false, false, true, true])
  expect(pill?.items?.[3]?.tone, 'a failed run shows in red').toBe('red')
  expect(pill?.aside).toBe('완료 1 · 실패 1')
  expect(pill?.alt).toContain('code_explorer 2개 (code_explorer task a2, code_explorer task a3)')
})

test('an agent that leaves the list while running counts as finished, and an idle session shows the history alone', () => {
  const running = mergeListed(NO_AGENTS, [run('a1', 'Explore', START)], START)
  const gone = mergeListed(running, [], START + 90_000)

  expect(gone.runs[0]?.outcome).toBe('completed')
  expect(agentsPill(gone)?.value).toBe('대기')
  expect(agentsPill(gone)?.items?.map(item => item.text)).toEqual(['Explore'])
  expect(agentsPill(NO_AGENTS), 'no agent yet, no pill').toBeNull()
})

test('the context pill shows the fill and the tokens, its tone stepping up with the fill', () => {
  const facts = { model: 'Opus 5.5', turns: 3, contextPercent: 62.4, contextTokens: 124_800, contextWindow: 200_000, contextDelta: null, rateLimits: [], costUsd: 4.2, startedAt: START }

  expect(contextPill(facts)).toMatchObject({ key: 'context', tone: 'yellow', value: '62%', aside: '125k/200k' })
  expect(contextPill({ ...facts, contextPercent: 12 })?.tone).toBe('blue')
  expect(contextPill({ ...facts, contextPercent: null }), 'no reading yet').toBeNull()
  expect(JSON.stringify(contextPill(facts)), 'the cost stays out').not.toContain('4.2')
})

test('the desktop band leads with the agents, then the context, the checks and the outside writes; no cost is shown', async ($, on) => {
  let listed: ListedAgent[] = []
  const clock = mockWorld(on, { sessionUsd: () => 1, failingCommand: /pest/, agents: () => listed })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  listed = [run('spawned', 'code_explorer', START)]
  await $.agent.spawn({ tool_use_id: 'toolu_1', prompt: 'find it', description: 'code_explorer task spawned', subagentType: 'code_explorer', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: false, fork: false })
  await clock.advance(2_000)
  expect(await pillAlts($)).toEqual(['실행 중 1개: code_explorer 1개 (code_explorer task spawned)', '컨텍스트 10% 사용 (20k/200k 토큰)'])
  const drawn = await drawnPills($)
  expect(drawn === 'engine' ? '' : (drawn[0]?.source ?? '')).toContain('>code_explorer &lt;1분</text>')
  expect(drawn === 'engine' ? '' : drawn.map(pill => pill.source).join(''), 'the cost is gone from the band').not.toContain('$1.00')

  await clock.advance(120_000)
  const later = await drawnPills($)
  expect(later === 'engine' ? '' : (later[0]?.source ?? ''), 'the elapsed time moves by the minute while it runs').toContain('>code_explorer 2분</text>')

  listed = [run('spawned', 'code_explorer', START, 'completed')]
  await clock.advance(2_000)
  await callTool($, { tool: 'Edit', file_path: `${WORKTREE}/app/Foo.php`, old_string: 'a', new_string: 'b' })
  await callTool($, { tool: 'Bash', command: 'vendor/bin/pest' })
  await callTool($, { tool: 'Bash', command: 'git push origin feature/NX-1' })
  expect(await pillAlts($)).toEqual([
    '실행 중인 서브에이전트 없음. 이전에 쓴 서브에이전트: code_explorer 1개 (code_explorer task spawned)',
    '컨텍스트 10% 사용 (20k/200k 토큰)',
    '검증: pest 실패 (14:07)',
    '이 세션의 외부 쓰기 1회, 마지막은 git push 14:07',
  ])
})

test('with nothing to show, a survey up or the desktop band turned off, the band beneath is drawn', async ($, on) => {
  mockWorld(on, { sessionUsd: () => null, hasContext: false })
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  expect(await pillAlts($), 'no context reading, no agent and no activity').toEqual('engine')

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

  expect(await pillAlts($)).toEqual(['컨텍스트 10% 사용 (20k/200k 토큰)'])
})
