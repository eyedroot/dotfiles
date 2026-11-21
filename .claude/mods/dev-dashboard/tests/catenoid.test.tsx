import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { findMentions, formatCard, formatIndexLine, formatTip, listLines, lookup, parseRepoMap, repoAt } from '../hooks/catenoid'

const SAMPLE = {
  root: '~/Github/Catenoid',
  repos: [
    { folder: 'kollus-vod-console', alias: 'api-v2', image: 'catenoidhub/kollus-vod-api-v2', dev: 'vod-dev-kr.kollus.com', stage: 'vod-stage-kr.kollus.com', prod: 'api-vod-kr.kollus.com' },
    { folder: 'kollus-www-v2', alias: 'vod-console-backend', image: 'catenoidhub/kollus-vod-console-refactoring', dev: 'c-kr-dev-backend.kollus.com' },
    { folder: 'kollus-www-v2-front', alias: 'vod-console-v2-frontend', image: 'catenoidhub/kollus-www-v2-front' },
    { folder: 'kollus-monorepo', alias: 'vod-console 등 프론트 앱 묶음', apps: [{ app: 'vod-console', alias: 'vod-console', image: 'catenoidhub/kollus-vod-console', dev: 'c-dev-kr.kollus.com' }] },
    { folder: 'kollus-vg-v2', alias: 'vg-v2', image: 'catenoidhub/kollus-vod-vg-v2', dev: 'v-dev-kr.kollus.com' },
    { folder: 'kpod', alias: null, note: '배포 없음(도구)' },
  ],
}
const MAP = parseRepoMap(JSON.stringify(SAMPLE))
const HOME = '/Users/me'

function names(text: string): string[] {
  return findMentions(text, MAP).map(m => (m.app ? `${m.entry.folder}/${m.app.app}` : m.entry.folder))
}

test('a folder or alias counts only as a whole token', async () => {
  expect(names('kollus-vod-console 배포 확인')).toEqual(['kollus-vod-console'])
  expect(names('api-v2 토큰이 401')).toEqual(['kollus-vod-console'])
  expect(names('kollus-vod-console-v2-backend 파드')).toEqual([])
  expect(names('image catenoidhub/kollus-vod-console:2.0.5')).toEqual([])
  expect(names('kollus-www-v2와 kollus-www-v2-front 둘 다')).toEqual(['kollus-www-v2', 'kollus-www-v2-front'])
  expect(names('apps/vod-console 빌드')).toEqual(['kollus-monorepo/vod-console'])
  expect(names('~/Github/Catenoid/kollus-vg-v2/app')).toEqual(['kollus-vg-v2'])
  expect(names('')).toEqual([])
})

test('the tip line, the index line and the card each show an entry', async () => {
  const [match] = findMentions('kollus-vod-console', MAP)
  expect(match && formatTip(match)).toBe('kollus-vod-console[api-v2] · image catenoidhub/kollus-vod-api-v2 · dev vod-dev-kr.kollus.com · stage vod-stage-kr.kollus.com · prod api-vod-kr.kollus.com')
  expect(match && formatIndexLine(match)).toBe('kollus-vod-console → api-v2 · catenoidhub/kollus-vod-api-v2')
  expect(match && formatCard(match)).toBe(['kollus-vod-console[api-v2]', '  image  catenoidhub/kollus-vod-api-v2', '  dev  vod-dev-kr.kollus.com', '  stage  vod-stage-kr.kollus.com', '  prod  api-vod-kr.kollus.com'].join('\n'))
  const [app] = findMentions('apps/vod-console', MAP)
  expect(app && formatTip(app)).toBe('kollus-monorepo apps/vod-console[vod-console] · image catenoidhub/kollus-vod-console · dev c-dev-kr.kollus.com')
  const [tool] = findMentions('kpod', MAP)
  expect(tool && formatTip(tool)).toBe('kpod · 배포 없음(도구)')
  const index = listLines(MAP)
  expect(index[0]).toBe('kollus-vod-console → api-v2 · catenoidhub/kollus-vod-api-v2')
  expect(index.at(-1)).toBe('배포 없음: kpod')
})

test('the cwd names the repo, and lookup finds by part of a name', async () => {
  const root = `${HOME}/Github/Catenoid`
  expect(repoAt(`${root}/kollus-vg-v2/app`, root, MAP)?.entry.folder).toBe('kollus-vg-v2')
  expect(repoAt(root, root, MAP)).toBeNull()
  expect(repoAt('/tmp/other', root, MAP)).toBeNull()
  expect(lookup('vg', MAP).map(m => m.entry.folder)).toEqual(['kollus-vg-v2'])
  expect(lookup('없는이름', MAP)).toEqual([])
})


const PRESENTATION = { isFullscreen: false, columns: 100 }
const MAIN = '/home/dev/Github/Catenoid/kollus-vg-v2'
const GIT_ANSWER = (argv: readonly string[]): { exitCode: number; stdout: string } => {
  const [, verb = ''] = argv
  if (verb === 'rev-parse') return { exitCode: 0, stdout: `${MAIN}\n${MAIN}/.git\ndevelop\n` }

  return { exitCode: 1, stdout: '' }
}

const PANE = { title: 'Dashboard', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as const

function world(on: On, rows: string[], readTable: () => string = () => JSON.stringify(SAMPLE)) {
  mock.clock(on, { now: 1_000_000 })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.delete', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => ({ value: { ...GIT_ANSWER(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('settings.read', () => ({ value: { theme: 'light' } }))
  on('env.get', () => ({ value: '/home/dev' }))
  on('fs.read', () => ({ value: readTable() }))
  on('session.cwd', () => ({ value: MAIN }))
  on('session.model', () => ({ value: 'Fable 5.1' }))
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: null, rateLimits: [], cost: null } as never }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.log', (_, e) => {
    rows.push(e.text)

    return { value: undefined }
  })
}

test('the pane shows the repository of the working folder, then the ones a prompt names', async ($, on) => {
  world(on, [])
  await $.session.start({ cwd: MAIN, surface: 'terminal', isInteractive: true })

  const terminal = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE })
  expect(await terminal.find({ type: 'Text', text: /^CATENOID$/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /kollus-vg-v2\[vg-v2\]/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'Pane', requestId: 'dev-dashboard', props: { ...PANE, bodyColumns: 100 } })
  const cards = await desktop.findAll({ type: 'Svg' })
  expect(cards.some(card => String(card.props?.alt ?? '').startsWith('kollus-vg-v2[vg-v2]: image catenoidhub/kollus-vod-vg-v2'))).toBe(true)
  await desktop.unmount()

  await $.prompt.submit({ text: 'kollus-vod-console 저장소 dev 도메인이 뭐야?', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE })
  expect(await ui.find({ type: 'Text', text: /kollus-vod-console\[api-v2\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /vod-dev-kr\.kollus\.com/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /kollus-vg-v2\[vg-v2\]/ })).toBeUndefined()
  await ui.unmount()

  const wide = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'desktop', component: 'Pane', requestId: 'dev-dashboard', props: { ...PANE, bodyColumns: 100 } })
  const alts = (await wide.findAll({ type: 'Svg' })).map(card => String(card.props?.alt ?? ''))
  expect(alts.some(alt => alt.startsWith('kollus-vod-console[api-v2]:') && alt.includes('dev vod-dev-kr.kollus.com'))).toBe(true)
  expect(alts.some(alt => alt.startsWith('kollus-vg-v2[vg-v2]:'))).toBe(false)
  await wide.unmount()
})

test('an answer writes one tip row per repo, however often it and the prompt name it, and the answer is left as it was', async ($, on) => {
  const rows: string[] = []
  world(on, rows)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'kollus-vod-console 이 뭐야?', wait: false, origin: { kind: 'composer' } })

  const answer = 'kollus-vod-console[api-v2] 는 VOD API v2 입니다. kollus-vod-console 과 api-v2 는 같은 저장소입니다.'
  const done = await $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(done.text).toBe(answer)
  expect(rows).toEqual(['Tip · kollus-vod-console[api-v2] · image catenoidhub/kollus-vod-api-v2 · dev vod-dev-kr.kollus.com · stage vod-stage-kr.kollus.com · prod api-vod-kr.kollus.com'])
})

test('the command lists the table or one entry, and an unreadable table turns the feature off', async ($, on) => {
  world(on, [])
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const one = await $.command.run({ command: 'catenoid', args: 'api-v2', origin: { kind: 'composer' }, presentation: PRESENTATION })
  expect(one.text?.split('\n')[0]).toBe('kollus-vod-console[api-v2]')
  const all = await $.command.run({ command: 'catenoid', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })
  expect(all.text?.split('\n').length).toBe(1 + listLines(MAP).length)
})

test('with no table file the pane has no Catenoid section', async ($, on) => {
  world(on, [], () => {
    throw new Error('ENOENT')
  })
  await $.session.start({ cwd: MAIN, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'dev-dashboard', surface: 'terminal', component: 'Pane', requestId: 'dev-dashboard', props: PANE })
  expect(await ui.find({ type: 'Text', text: /^CATENOID$/ })).toBeUndefined()
  await ui.unmount()
})
