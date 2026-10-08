import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { judgeUpstream, parseRemoteName, parseRefs, parseTrack, parseWorktrees } from '../hooks/git'
import { bannerWidth, renderBanner } from '../hooks/banner'
import { FLOWER } from '../hooks/flower'
import { customThemeSlug, resolveTheme } from '../hooks/palette'
import { encodeBase64, makeHalfBlockCells } from '../hooks/raster'
import { firstLines, rememberRoot } from '../hooks/recap'

const MAIN_ROOT = '/home/dev/repo'

const headings = async (ui: { findAll: (query: { type: string; text: RegExp }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text', text: /^── / })).map(found => found.text?.replace(/^── (.*?) ─*$/, '$1'))
const WORKTREE = `${MAIN_ROOT}/.claude/worktrees/NX-1_feature`

const REFS = [
  'develop\torigin/develop\trefs/heads/develop\t\torigin/develop',
  'feature/NX-1_feature\torigin/develop\trefs/heads/develop\t[ahead 2, behind 1]\torigin/develop',
  'feature/NX-2_other\torigin/feature/NX-2_other\trefs/heads/feature/NX-2_other\t\torigin/feature/NX-2_other',
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

const PANE_PROPS = {
  title: 'Dashboard',
  isFocused: false,
  bodyColumns: 44,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

function gitAnswer(argv: readonly string[]): { exitCode: number; stdout: string } {
  const [, verb = '', flag = ''] = argv

  if (verb === 'rev-parse') return { exitCode: 0, stdout: `${WORKTREE}\n${MAIN_ROOT}/.git\nfeature/NX-1_feature\n` }
  if (verb === 'config') return { exitCode: 0, stdout: 'git@github.com:eyedroot/repo.git\n' }
  if (verb === 'for-each-ref') return { exitCode: 0, stdout: `${REFS}\n` }
  if (verb === 'status') return { exitCode: 0, stdout: ' M a.ts\n?? b.ts\n' }
  if (verb === 'log') return { exitCode: 0, stdout: 'bbbb1111\t2 hours ago\tAdd the feature\naaaa2222\t3 days ago\tMerge develop\n' }
  if (verb === 'worktree' && flag === 'list') return { exitCode: 0, stdout: WORKTREES }

  return { exitCode: 1, stdout: '' }
}

function mockWorld(on: On, settings: Record<string, unknown> = { theme: 'light' }): Map<string, unknown> {
  const store = new Map<string, unknown>()

  mock.clock(on, { now: 1_000_000 })
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
    value: { ...gitAnswer(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('settings.read', () => ({ value: settings }))
  on('session.cwd', () => ({ value: WORKTREE }))
  on('session.model', () => ({ value: 'Fable 5.1' }))
  on('session.turns', () => ({ value: 3 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 18 }, rateLimits: [] } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))

  return store
}

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
  expect(rows.map(row => row.status)).toEqual(['ok', 'mismatch', 'ok'])
  expect(rows.map(row => row.isCurrent)).toEqual([false, true, false])
  expect(rows[1]?.upstream).toBe('origin/develop')
})

test('the banner is three rows of block letters, case-insensitive, and skips characters it has no glyph for', () => {
  const rows = renderBanner('dev dash')

  expect(rows).toHaveLength(3)
  expect(bannerWidth(rows)).toBe(53)
  expect(rows[0]).toBe('██▀▀▄▄ ██▀▀▀▀ ██  ██      ██▀▀▄▄ ▄▄▀▀▄▄ ▄▄▀▀▀▀ ██  ██')
  expect(renderBanner('@#')).toEqual([])
  expect(renderBanner('')).toEqual([])
})

test('the flower becomes half-block cells with its black surround painted in the pane background', () => {
  expect(FLOWER.pixels).toHaveLength(FLOWER.width * FLOWER.height * 6)
  expect(encodeBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu')
  expect(encodeBase64(new Uint8Array([77, 97]))).toBe('TWE=')

  const { columns, rows, cells } = makeHalfBlockCells(FLOWER, '#f2e9e1')
  expect(columns).toBe(14)
  expect(rows).toBe(7)
  expect(cells).toHaveLength(Math.ceil((14 * 7 * 12) / 3) * 4)
  expect(cells.startsWith(encodeBase64(new Uint8Array(Uint32Array.of(0x2580, 0xf2e9e1, 0xf2e9e1).buffer)))).toBe(true)
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

test('a custom theme is read as the preset it is based on', async ($, on) => {
  mockWorld(on, { theme: 'custom:paper' })
  on('env.get', () => ({ value: '/home/dev' }))
  on('fs.read', (_, e) => ({ value: e.path === '/home/dev/.claude/themes/paper.json' ? '{"base":"light"}' : '{}' }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS })
  expect((await ui.find({ type: 'Box' }))?.props, 'light base of the custom theme').toMatchObject({ backgroundColor: '#f2e9e1' })
  await ui.unmount()
})

test('recap lines drop markdown marks and empty lines, and the root list stays bounded', () => {
  expect(firstLines('# Title\n\n- **done** the thing\n```\ncode\n```\n---\nnext line', 3)).toEqual(['Title', 'done the thing', 'code'])
  expect(firstLines('`CLAUDE_CODE_PLUGIN_DIRS` 를 settings_json 에 넣습니다', 1)).toEqual(['CLAUDE_CODE_PLUGIN_DIRS 를 settings_json 에 넣습니다'])
  expect(rememberRoot(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
  expect(rememberRoot(Array.from({ length: 20 }, (_, index) => `/r${index}`), '/new')).toHaveLength(20)
})

test('the pane shows the worktree, the mismatched upstream and the commits on every docking surface, and widens the banner with the pane', async ($, on) => {
  mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface, component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS })
    const shows = async (text: RegExp) => expect(await ui.find({ type: 'Text', text }), `${surface}: ${text}`).toBeDefined()

    await shows(/^█▀▄ █▀▀ █ █ {4}█▀▄ ▄▀▄ ▄▀▀ █ █$/)
    await shows(/^repo/)
    await shows(/eyedroot\/repo/)
    await shows(/feature\/NX-1_feature/)
    await shows(/^NX-1_feature/)
    await shows(/origin\/develop/)
    await shows(/name differs, git push is refused/)
    await shows(/↑2 ↓1 {2}2 changed/)
    await shows(/Add the feature/)
    await shows(/^repo$/)
    await shows(/^ {2}→ origin\/develop$/)
    await shows(/^NX-2_other$/)
    await shows(/^ {2}→ origin\/feature\/NX-2_other$/)
    await shows(/Fable 5.1 · 3 turns · ctx 18%/)
    expect(await headings(ui), `${surface}: section order`).toEqual(['Session', 'Git', 'Worktrees (2)', 'Commits'])
    expect(await ui.find({ type: 'Text', text: /Last turn/ }), `${surface}: no recap yet`).toBeUndefined()
    expect((await ui.find({ type: 'Box' }))?.props, `${surface}: light background`).toMatchObject({ backgroundColor: '#f2e9e1' })
    expect((await ui.find({ type: 'Raster' }))?.props, `${surface}: flower raster`).toEqual(
      surface === 'terminal' ? expect.objectContaining({ columns: 14, rows: 7 }) : undefined,
    )

    await ui.unmount()
  }

  const wide = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: { ...PANE_PROPS, bodyColumns: 80 } })
  expect(await wide.find({ type: 'Text', text: /^██▀▀▄▄ ██▀▀▀▀ ██  ██ {6}██▀▀▄▄ ▄▄▀▀▄▄ ▄▄▀▀▀▀ ██  ██$/ }), 'wide pane: two columns per pixel').toBeDefined()
  await wide.unmount()
})

test('a finished turn becomes the recap and is kept for the next session in that repository', async ($, on) => {
  const store = mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })
  await $.turn.complete({
    answer: '## Done\n\nRenamed the helper and **added** a test.\n\nNext: run the suite.',
    durationMs: 12000,
    isAborted: false,
    turnId: 'turn-1',
    reason: 'answer',
    usage: { input_tokens: 10, output_tokens: 1234, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude' },
  })

  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS })

  expect(await ui.find({ type: 'Text', text: /Last turn/ })).toBeDefined()
  expect(await headings(ui)).toEqual(['Session', 'Git', 'Worktrees (2)', 'Last turn', 'Commits'])
  expect(await ui.find({ type: 'Text', text: /0 tools · 1.2k out/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Renamed the helper and added a test\.$/ }))?.props).toMatchObject({ wrap: 'wrap' })
  expect(await ui.find({ type: 'Text', text: /Previous session/ })).toBeUndefined()
  await ui.unmount()

  expect(store.get(`recap:${MAIN_ROOT}`)).toMatchObject({ toolCalls: 0, outputTokens: 1234, durationMs: 12000 })
  expect(store.get('recap-roots')).toEqual([MAIN_ROOT])
})

test('the previous recap of the repository is shown when a session starts there', async ($, on) => {
  const store = mockWorld(on)
  store.set(`recap:${MAIN_ROOT}`, {
    repoRoot: MAIN_ROOT,
    endedAt: 1_000_000 - 3 * 60 * 60 * 1000,
    durationMs: 65000,
    toolCalls: 7,
    outputTokens: 900,
    reason: 'answer',
    lines: ['Moved the upstream check into git.ts'],
  })
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS })

  expect(await ui.find({ type: 'Text', text: /Previous session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /3h ago · 1m 5s · 7 tools · 900 out/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Moved the upstream check/ })).toBeDefined()
  await ui.unmount()
})
