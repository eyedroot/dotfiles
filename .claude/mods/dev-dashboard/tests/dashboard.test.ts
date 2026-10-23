import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { judgeUpstream, parseRemoteName, parseRefs, parseTrack, parseWorktrees } from '../hooks/git'
import { bannerWidth, renderBanner } from '../hooks/banner'
import { FLOWER } from '../hooks/flower'
import { customThemeSlug, resolveTheme } from '../hooks/palette'
import { encodeBase64, makeHalfBlockCells } from '../hooks/raster'
import { firstLines, rememberRoot } from '../hooks/recap'
import { drawCard, drawPill, fitText } from '../hooks/svg'

const MAIN_ROOT = '/home/dev/repo'
const WORKTREE = `${MAIN_ROOT}/.claude/worktrees/NX-1_feature`

type Mounted = {
  find: (query: { type: string; text?: RegExp }) => Promise<{ text?: string; props?: Record<string, unknown> } | undefined>
  findAll: (query: { type: string; text?: RegExp }) => Promise<{ text?: string; props?: Record<string, unknown> }[]>
}

const headings = async (ui: Mounted) =>
  (await ui.findAll({ type: 'Text', text: /^(GIT|WORKTREES \(\d+\)|LAST TURN|PREVIOUS SESSION|COMMITS)$/ })).map(found => found.text)

const svgAlts = async (ui: Mounted) => (await ui.findAll({ type: 'Svg' })).map(found => String(found.props?.alt ?? ''))

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

const DESKTOP_PANE_PROPS = { ...PANE_PROPS, bodyColumns: 100 } as const

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
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/dev' : undefined }))
  on('session.cwd', () => ({ value: WORKTREE }))
  on('session.model', () => ({ value: 'Fable 5.1' }))
  on('session.turns', () => ({ value: 3 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 18, tokens: 36000 }, rateLimits: [] } }))
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

  const { columns, rows, cells } = makeHalfBlockCells(FLOWER, '#f7f7f7')
  expect(columns).toBe(14)
  expect(rows).toBe(7)
  expect(cells).toHaveLength(Math.ceil((14 * 7 * 12) / 3) * 4)
  expect(cells.startsWith(encodeBase64(new Uint8Array(Uint32Array.of(0x2580, 0xf7f7f7, 0xf7f7f7).buffer)))).toBe(true)
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

test('pills and cards are self-contained SVG documents that restyle themselves for a dark appearance', () => {
  const pill = drawPill('blue', [{ label: 'CTX' }, { bar: { percent: 18, tone: 'blue' } }, { value: '18%', cls: 'blue' }])
  expect(pill.height).toBe(30)
  expect(pill.source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(pill.source).toContain('@media (prefers-color-scheme:dark)')
  expect(pill.source).toContain('class="pill-blue"')
  expect(pill.source).toContain('>CTX<')

  const card = drawCard({ width: 300, tone: 'purple', title: 'WORKTREE', blocks: [{ kind: 'big', text: 'NX-1_feature' }, { kind: 'line', text: '~/repo/.claude/worktrees/NX-1_feature' }] })
  expect(card.width).toBe(300)
  expect(card.height).toBeGreaterThan(60)
  expect(card.source).toContain('class="card-purple"')
  expect(card.source).toContain('>NX-1_feature<')
  expect(drawCard({ width: 200, tone: null, title: 'A <B> & C', blocks: [] }).source).toContain('A &lt;B&gt; &amp; C')
  expect(fitText('a very long branch name indeed', 10, 60)).toBe('a very l…')
  expect(fitText('short', 10, 60)).toBe('short')
})

test('a custom theme is read as the preset it is based on', async ($, on) => {
  mockWorld(on, { theme: 'custom:paper' })
  on('fs.read', (_, e) => ({ value: e.path === '/home/dev/.claude/themes/paper.json' ? '{"base":"light"}' : '{}' }))
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS })
  expect((await ui.find({ type: 'Box' }))?.props, 'light base of the custom theme').toMatchObject({ backgroundColor: '#f7f7f7' })
  await ui.unmount()
})

test('recap lines drop markdown marks and empty lines, and the root list stays bounded', () => {
  expect(firstLines('# Title\n\n- **done** the thing\n```\ncode\n```\n---\nnext line', 3)).toEqual(['Title', 'done the thing', 'code'])
  expect(firstLines('`CLAUDE_CODE_PLUGIN_DIRS` 를 settings_json 에 넣습니다', 1)).toEqual(['CLAUDE_CODE_PLUGIN_DIRS 를 settings_json 에 넣습니다'])
  expect(rememberRoot(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
  expect(rememberRoot(Array.from({ length: 20 }, (_, index) => `/r${index}`), '/new')).toHaveLength(20)
})

test('the terminal pane leads with the worktree, then chips, the mismatched upstream, the worktrees and the commits on the palette background', async ($, on) => {
  mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS })
  const shows = async (text: RegExp) => expect(await ui.find({ type: 'Text', text }), `terminal: ${text}`).toBeDefined()

  await shows(/^█▀▄ █▀▀ █ █ {4}█▀▄ ▄▀▄ ▄▀▀ █ █$/)
  await shows(/^NX-1_feature$/)
  await shows(/^project repo$/)
  await shows(/eyedroot\/repo/)
  await shows(/^~\/repo\/\.claude\/worktrees\/NX-1_feature$/)
  await shows(/^ ctx $/)
  await shows(/^ 18% $/)
  await shows(/^feature\/NX-1_feature$/)
  await shows(/^mismatch $/)
  await shows(/^ Fable 5\.1 · 3 turns $/)
  await shows(/origin\/develop/)
  await shows(/name differs, git push is refused/)
  await shows(/↑2 ↓1 {2}2 changed/)
  await shows(/Add the feature/)
  await shows(/^repo$/)
  await shows(/^ {2}→ origin\/develop$/)
  await shows(/^NX-2_other$/)
  await shows(/^ {2}→ origin\/feature\/NX-2_other$/)
  expect(await headings(ui), 'terminal: section order').toEqual(['GIT', 'WORKTREES (2)', 'COMMITS'])
  expect(await ui.find({ type: 'Text', text: /^── / }), 'terminal: no rule headings').toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /LAST TURN/ }), 'terminal: no recap yet').toBeUndefined()
  expect((await ui.find({ type: 'Box' }))?.props, 'terminal: light background').toMatchObject({ backgroundColor: '#f7f7f7' })
  expect((await ui.find({ type: 'Raster' }))?.props, 'terminal: flower raster').toEqual(expect.objectContaining({ columns: 14, rows: 7 }))
  await ui.unmount()

  const wide = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: { ...PANE_PROPS, bodyColumns: 80 } })
  expect(await wide.find({ type: 'Text', text: /^██▀▀▄▄ ██▀▀▀▀ ██  ██ {6}██▀▀▄▄ ▄▄▀▀▄▄ ▄▄▀▀▀▀ ██  ██$/ }), 'wide pane: two columns per pixel').toBeDefined()
  await wide.unmount()
})

test('the desktop pane is SVG cards on the host background, the worktree card first, and no raster or palette fill', async ($, on) => {
  mockWorld(on)
  await $.session.start({ cwd: WORKTREE, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'Pane', requestId: 'dev-dashboard', props: DESKTOP_PANE_PROPS })
  const alts = await svgAlts(ui)
  const has = (pattern: RegExp) => expect(alts.some(alt => pattern.test(alt)), `desktop: ${pattern}`).toBe(true)

  has(/^worktree NX-1_feature at ~\/repo\/\.claude\/worktrees\/NX-1_feature, project repo, branch feature\/NX-1_feature$/)
  has(/^branch feature\/NX-1_feature, 2 changed, ↑2 ↓1$/)
  has(/^upstream origin\/develop mismatch$/)
  has(/^context 18%$/)
  has(/^Fable 5\.1, 3 turns$/)
  has(/^git: branch feature\/NX-1_feature, upstream origin\/develop mismatch, ↑2 ↓1, 2 changed$/)
  has(/^context 18%, Fable 5\.1, 3 turns$/)
  has(/^worktrees: repo → origin\/develop ok, NX-2_other → origin\/feature\/NX-2_other ok$/)
  has(/^commits: bbbb111 Add the feature, aaaa222 Merge develop$/)
  expect(alts[0], 'desktop: the worktree card comes first').toMatch(/^worktree NX-1_feature at /)
  expect(alts[1], 'desktop: then the pills').toMatch(/^branch /)
  expect(alts.findIndex(alt => alt.startsWith('git:')), 'desktop: the cards follow the pills').toBeGreaterThan(alts.findIndex(alt => alt.startsWith('Fable 5.1,')))
  expect(alts.some(alt => /last turn/.test(alt)), 'desktop: no recap yet').toBe(false)

  const place = (await ui.findAll({ type: 'Svg' })).find(found => String(found.props?.alt).startsWith('worktree NX-1'))
  expect(String(place?.props?.source)).toContain('@media (prefers-color-scheme:dark)')
  expect(String(place?.props?.source)).toContain('>WORKTREE<')
  expect(place?.props?.width, 'desktop: the worktree card spans two columns').toBeGreaterThan(400)
  expect((await ui.findAll({ type: 'Box' })).some(box => box.props?.backgroundColor !== undefined), 'desktop: no painted background').toBe(false)
  expect(await ui.find({ type: 'Raster' }), 'desktop: no raster').toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^── / }), 'desktop: no rule headings').toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /Refresh/ }), 'desktop: refresh button').toBeDefined()
  await ui.unmount()
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

  expect(await headings(ui)).toEqual(['GIT', 'WORKTREES (2)', 'LAST TURN', 'COMMITS'])
  expect(await ui.find({ type: 'Text', text: /0 tools · 1.2k out/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Renamed the helper and added a test\.$/ }))?.props).toMatchObject({ wrap: 'wrap' })
  expect(await ui.find({ type: 'Text', text: /PREVIOUS SESSION/ })).toBeUndefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'Pane', requestId: 'dev-dashboard', props: DESKTOP_PANE_PROPS })
  const alts = await svgAlts(desktop)
  expect(alts.some(alt => /^last turn: just now, 12s, 0 tools, 1.2k out\. Done Renamed the helper and added a test\. Next: run the suite\.$/.test(alt)), alts.join('\n')).toBe(true)
  expect(alts.some(alt => /^previous session/.test(alt))).toBe(false)
  await desktop.unmount()

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

  expect(await ui.find({ type: 'Text', text: /PREVIOUS SESSION/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /3h ago · 1m 5s · 7 tools · 900 out/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Moved the upstream check/ })).toBeDefined()
  await ui.unmount()

  const desktop = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'Pane', requestId: 'dev-dashboard', props: DESKTOP_PANE_PROPS })
  const alts = await svgAlts(desktop)
  expect(alts.some(alt => /^previous session: 3h ago, 1m 5s, 7 tools, 900 out\. Moved the upstream check into git\.ts$/.test(alt)), alts.join('\n')).toBe(true)
  await desktop.unmount()
})
