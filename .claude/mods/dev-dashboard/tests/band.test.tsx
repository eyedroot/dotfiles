import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bandGroups, barRuns, limitBarColor, limitTone, resetClock } from '../hooks/band'
import { recentSpend, sparkline } from '../hooks/cost'

const START = 1_000_000
const HOUR = 3_600_000
const WORKTREE = '/home/dev/repo'

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} } as const

function mockWorld(on: On, usage: () => unknown) {
  const clock = mock.clock(on, { now: START })

  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.delete', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('settings.read', () => ({ value: { theme: 'light' } }))
  on('env.get', () => ({ value: '/home/dev' }))
  on('session.cwd', () => ({ value: WORKTREE }))
  on('session.model', () => ({ value: 'Fable 5.1' }))
  on('session.turns', () => ({ value: 3 }))
  on('session.usage', () => ({ value: usage() as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', (_, e) => {
    const { Text } = _.ui.resolve(e)

    return <Text>engine</Text>
  })

  return clock
}

test('a rate-limit window is judged by its level and by how fast it is being used', () => {
  const fiveHour = (percentUsed: number, resetsInMs: number) => ({ kind: 'five_hour', percentUsed, resetsAt: new Date(START + resetsInMs).toISOString() })
  const local = (hours: number, minutes: number, dayOffset = 0) => new Date(2026, 9, 23 + dayOffset, hours, minutes).getTime()

  expect(resetClock(local(14, 19), local(11, 0))).toBe('2:19pm')
  expect(resetClock(local(9, 30, 2), local(11, 0)), 'more than a day away names the weekday').toBe('Sun 9:30am')
  expect([limitBarColor(14, 'ok'), limitBarColor(54, 'ok'), limitBarColor(75, 'warn'), limitBarColor(92, 'crit')]).toEqual(['low', 'mid', 'high', 'crit'])
  expect(limitTone(fiveHour(13, 197 * 60_000), START)).toBe('ok')
  expect(limitTone(fiveHour(72, 10 * 60_000), START)).toBe('warn')
  expect(limitTone(fiveHour(40, 4 * HOUR), START), 'a fifth into the window, on course for 200%').toBe('crit')
  expect(barRuns(50, 0.25, 8)).toEqual([['■■', 'on'], ['▣', 'mark'], ['■', 'on'], ['□□□□', 'off']])
})

test('the cost carries a sparkline from three turns on and what the last hour cost', () => {
  const turns = [0.5, 1.8, 0.2].map((usd, index) => ({ endedAt: START - (3 - index) * 60_000, usd }))
  const facts = {
    model: 'Opus 5.5',
    turns: 3,
    contextPercent: 31,
    contextTokens: 313800,
    contextWindow: 1_000_000,
    contextDelta: 7400,
    rateLimits: [{ kind: 'five_hour', percentUsed: 13, resetsAt: new Date(START + 197 * 60_000).toISOString() }],
    costUsd: 8.04,
    startedAt: START - 2 * HOUR,
  }

  expect(sparkline([0.5, 1.8, 0.2])).toBe('▃█▂')
  expect(recentSpend([{ endedAt: START - 2 * HOUR, usd: 5 }, { endedAt: START - 60_000, usd: 0.4 }], START), 'only the last hour').toBe(0.4)

  const groups = bandGroups(facts, START, true, turns)
  expect(groups.map(group => [group.label, group.value, group.spark, group.asides.map(aside => aside.replace(/\d{1,2}:\d{2}[ap]m/, 'TIME'))])).toEqual([
    ['5h', '13%', null, ['→ TIME']],
    ['ctx', '31%', null, ['314k/1M', '+7.4k']],
    ['cost', '$8.04', '▃█▂', ['1h $2.50']],
  ])
  expect(bandGroups(facts, START, true, turns.slice(0, 2)).find(group => group.key === 'cost')?.spark, 'two turns draw no sparkline').toBeNull()
})

test('the terminal band draws rate limits, context and cost in the status line look, and yields to a survey', async ($, on) => {
  mockWorld(on, () => ({
    startedAt: START - 2 * HOUR,
    context: { window: 1_000_000, percent: 31, tokens: 313800 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 13, resetsAt: new Date(START + 197 * 60_000).toISOString() }, { kind: 'seven_day', percentUsed: 92, resetsAt: new Date(START + 297 * 60_000).toISOString() }],
    cost: { usd: 8.04 },
  }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  const shows = async (text: RegExp) => expect(await band.find({ type: 'Text', text }), `band: ${text}`).toBeDefined()

  await shows(/^5h $/)
  await shows(/^ 13%$/)
  await shows(/^ → \d{1,2}:\d{2}[ap]m$/)
  await shows(/^ │ $/)
  await shows(/^ 92%$/)
  await shows(/^ctx $/)
  await shows(/^ 314k\/1M$/)
  await shows(/^cost $/)
  await shows(/^\$8\.04$/)
  expect((await band.find({ type: 'Text', text: /^ 92%$/ }))?.props, 'band: a window near its limit takes the status line red').toMatchObject({ color: '#ad0f00', weight: 'bold' })
  expect(await band.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  await band.unmount()

  const survey = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, hasSurvey: true } })
  expect(await survey.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await survey.unmount()
})

test('each turn\'s cost joins the band sparkline', async ($, on) => {
  let usd = 1
  const clock = mockWorld(on, () => ({ startedAt: START - HOUR, context: { window: 1_000_000, percent: 10, tokens: 100_000 }, rateLimits: [], cost: { usd } }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  for (const [index, after] of [1.5, 3.3, 3.5].entries()) {
    await $.turn.start({ text: 'go', turnId: `turn-${index}` })
    await clock.advance(10_000)
    usd = after
    await $.turn.complete({ answer: 'ok', durationMs: 10_000, isAborted: false, turnId: `turn-${index}`, reason: 'answer' })
  }

  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: /^ ▃█▂$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^ 1h \$2\.50$/ })).toBeDefined()
  await band.unmount()
})

test('with the band turned off the band beneath is drawn', { options: { band: false } }, async ($, on) => {
  mockWorld(on, () => ({ startedAt: 0, context: { window: 200000, percent: 18, tokens: 36000 }, rateLimits: [] }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const band = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await band.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await band.unmount()
})
