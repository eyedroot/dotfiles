import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { GitSnapshot, SessionFacts, TurnRecap, UpstreamStatus } from '../types'
import { bannerWidth, renderBanner } from './banner'
import { FLOWER } from './flower'
import { readGitSnapshot } from './git'
import { PALETTES, customThemeSlug, resolveTheme } from './palette'
import type { Palette, ThemeName } from './palette'
import { makeHalfBlockCells } from './raster'
import { RECAP_ROOTS_KEY, formatDuration, formatTokens, makeRecap, recapKey, relativeAge, rememberRoot } from './recap'

const PANE_ID = 'dev-dashboard'
const PANE_TITLE = 'Dashboard'
const PANE_COLUMNS = 46
const GIT_TIMEOUT_MS = 10000
const LABEL_WIDTH = 10

const git = atom({ plugin: 'dev-dashboard', key: 'git' } as const, null)
const lastTurn = atom({ plugin: 'dev-dashboard', key: 'lastTurn' } as const, null)
const previous = atom({ plugin: 'dev-dashboard', key: 'previous' } as const, null)
const session = atom({ plugin: 'dev-dashboard', key: 'session' } as const, null)
const isDismissed = atom({ plugin: 'dev-dashboard', key: 'isDismissed' } as const, false)

const UPSTREAM_NOTE: Record<UpstreamStatus, string | null> = {
  ok: null,
  mismatch: '! name differs, git push is refused',
  gone: '! remote branch was deleted',
  none: 'no upstream, first push sets it',
}

const gitRefresh: { pending: Promise<GitSnapshot> | null; isQueued: boolean } = { pending: null, isQueued: false }

function fit(text: string, width: number): string {
  if (width <= 1) return ''

  return text.length > width ? `${text.slice(0, width - 1)}…` : text
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

function upstreamColor(palette: Palette, status: UpstreamStatus): string {
  if (status === 'ok') return palette.ok
  if (status === 'mismatch') return palette.error
  if (status === 'gone') return palette.warning

  return palette.muted
}

function refreshGit($: EngineInterface, commitCount: number): Promise<GitSnapshot> {
  if (gitRefresh.pending !== null) {
    gitRefresh.isQueued = true

    return gitRefresh.pending
  }

  gitRefresh.pending = (async () => {
    const cwd = await $.session.cwd()
    const run = async (args: readonly string[]) => {
      const ran = await $.process.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })

      return { exitCode: ran.exitCode, stdout: ran.stdout }
    }
    const snapshot = await readGitSnapshot(run, cwd, commitCount, await $.clock.now())
    await update($, git, () => snapshot)

    return snapshot
  })().finally(() => {
    gitRefresh.pending = null

    if (gitRefresh.isQueued) {
      gitRefresh.isQueued = false
      void refreshGit($, commitCount)
    }
  })

  return gitRefresh.pending
}

async function refreshSession($: EngineInterface): Promise<void> {
  const [model, turns, usage] = await Promise.all([$.session.model(), $.session.turns(), $.session.usage()])
  const facts: SessionFacts = { model, turns, contextPercent: usage.context.percent ?? null }

  await update($, session, () => facts)
}

async function loadPrevious($: EngineInterface, repoRoot: string | null): Promise<void> {
  if (repoRoot === null) return

  const stored = await $.store.get(recapKey(repoRoot))
  const recap = stored !== undefined && stored !== null && typeof stored === 'object' ? (stored as TurnRecap) : null

  await update($, previous, () => recap)
}

async function persistRecap($: EngineInterface, recap: TurnRecap): Promise<void> {
  if (recap.repoRoot === null) return

  const roots = await $.store.get(RECAP_ROOTS_KEY)
  const known = Array.isArray(roots) ? roots.filter((root): root is string => typeof root === 'string') : []
  const kept = rememberRoot(known, recap.repoRoot)

  await Promise.all(known.filter(root => !kept.includes(root)).map(root => $.store.delete(recapKey(root))))
  await $.store.set(recapKey(recap.repoRoot), recap)
  await $.store.set(RECAP_ROOTS_KEY, kept)
}

async function customThemeBase($: EngineInterface, slug: string): Promise<unknown> {
  try {
    const home = await $.env.get('HOME')
    const theme = JSON.parse(await $.fs.read(`${home}/.claude/themes/${slug}.json`)) as { base?: unknown }

    return theme.base ?? 'dark'
  } catch {
    return 'dark'
  }
}

async function readTheme($: EngineInterface, option: unknown): Promise<ThemeName> {
  const settings = await $.settings.read()
  const slug = customThemeSlug(settings.theme)

  return resolveTheme(option, slug === null ? settings.theme : await customThemeBase($, slug))
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })
}

export const register: Register = (on, options) => {
  const commitCount = Math.max(1, Math.floor(toNumber(options.commits, 8)))
  const recapLines = Math.max(1, Math.floor(toNumber(options.recapLines, 4)))
  const pollSeconds = Math.max(0, toNumber(options.pollSeconds, 30))
  const autoOpen = options.autoOpen !== false
  const bannerText = typeof options.banner === 'string' ? options.banner : ''
  const wideBanner = renderBanner(bannerText, 2)
  const narrowBanner = renderBanner(bannerText, 1)
  const bannerFor = (columns: number) => [wideBanner, narrowBanner].find(rows => rows.length > 0 && bannerWidth(rows) <= columns) ?? null
  const artwork = options.art === 'none' ? null : FLOWER

  let theme: ThemeName = 'dark'
  let turnStartedAt = 0
  let toolCalls = 0
  let hasAutoOpened = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dashboard', description: 'Toggle the dev dashboard pane' })

    theme = await readTheme($, options.theme)
    const snapshot = await refreshGit($, commitCount)
    await Promise.all([loadPrevious($, snapshot.mainRoot), refreshSession($)])

    if (pollSeconds > 0) {
      $.clock.every(pollSeconds * 1000, () => void refreshGit($, commitCount))
    }

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE_ID)

    if (isOpen) {
      await $.ui.close({ id: PANE_ID })

      return { text: 'Dashboard closed.' }
    }

    await update($, isDismissed, () => false)
    const opened = await openPane($)

    return { text: opened.isPlaced ? 'Dashboard opened.' : `Dashboard waits: ${opened.reason}` }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID && e.origin.kind === 'person') {
      await update($, isDismissed, () => true)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (autoOpen && !hasAutoOpened && e.viewport?.isFullscreen === true && !(await read($, isDismissed))) {
      hasAutoOpened = true
      void openPane($)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    toolCalls = 0

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isMainLoop = e.agentId === undefined
    if (isMainLoop) toolCalls += 1

    const ran = await next(e)

    if (isMainLoop && ran.deny === undefined && ran.isReadOnly !== true) {
      void refreshGit($, commitCount)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const endedAt = await $.clock.now()
    const snapshot = await read($, git)
    const recap = makeRecap({
      answer: e.answer,
      durationMs: turnStartedAt > 0 ? endedAt - turnStartedAt : e.durationMs,
      toolCalls,
      outputTokens: e.usage?.output_tokens ?? null,
      reason: e.reason,
      repoRoot: snapshot?.mainRoot ?? null,
      endedAt,
      lineCount: recapLines,
    })

    await update($, lastTurn, () => recap)
    await Promise.all([persistRecap($, recap), refreshSession($), refreshGit($, commitCount)])

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const palette = PALETTES[theme]
    const width = Math.max(10, e.props.bodyColumns - 2)
    const now = await $.clock.now()
    const [snapshot, turn, prior, facts] = await Promise.all([read($, git), read($, lastTurn), read($, previous), read($, session)])

    const heading = (label: string) => (
      <Box key={`h:${label}`} marginTop={1}>
        <Text color={palette.accent} bold>
          {fit(`── ${label} `.padEnd(width, '─'), width)}
        </Text>
      </Box>
    )
    const row = (label: string, value: string, color: string = palette.text) => (
      <Box key={`r:${label}`}>
        <Text color={palette.muted}>{label.padEnd(LABEL_WIDTH)}</Text>
        <Text color={color} wrap="truncate-end">
          {fit(value, width - LABEL_WIDTH)}
        </Text>
      </Box>
    )
    const recapBlock = (label: string, recap: TurnRecap | null) => {
      if (recap === null) return null

      const summary = [
        relativeAge(recap.endedAt, now),
        formatDuration(recap.durationMs),
        `${recap.toolCalls} tools`,
        recap.outputTokens === null ? null : `${formatTokens(recap.outputTokens)} out`,
        recap.reason === 'answer' ? null : recap.reason,
      ].filter((fact): fact is string => fact !== null)

      return (
        <Box key={`recap:${label}`} flexDirection="column">
          {heading(label)}
          <Text color={palette.muted}>{fit(summary.join(' · '), width)}</Text>
          {recap.lines.map((line, index) => (
            <Text key={`${label}:${index}`} color={palette.text} wrap="wrap">
              {line}
            </Text>
          ))}
        </Box>
      )
    }

    const artworkCells = artwork !== null && e.surface === 'terminal' && artwork.width <= width ? makeHalfBlockCells(artwork, palette.background) : null
    const art = () => {
      if (artworkCells === null || e.surface !== 'terminal') return null

      const { Raster } = $.ui.resolve(e)

      return <Raster key="flower" columns={artworkCells.columns} rows={artworkCells.rows} cells={artworkCells.cells} />
    }
    const title = (snapshot: GitSnapshot, titleWidth: number) => {
      const banner = bannerFor(titleWidth)

      return (
        <Box flexDirection="column">
          {banner !== null && (
            <Box flexDirection="column" marginBottom={1}>
              {banner.map((bannerRow, index) => (
                <Text key={`banner:${index}`} color={palette.accent} bold>
                  {bannerRow}
                </Text>
              ))}
            </Box>
          )}
          <Text color={palette.accent} bold>
            {fit(snapshot.projectName, titleWidth)}
          </Text>
          {snapshot.remoteName !== null && <Text color={palette.muted}>{fit(snapshot.remoteName, titleWidth)}</Text>}
        </Box>
      )
    }
    const header = (snapshot: GitSnapshot) => {
      const artColumns = artworkCells === null ? 0 : artworkCells.columns + 2
      const isSideBySide = artworkCells !== null && artColumns + Math.max(bannerWidth(narrowBanner), snapshot.projectName.length) <= width

      if (isSideBySide) {
        return (
          <Box alignItems="center">
            <Box marginRight={2}>{art()}</Box>
            {title(snapshot, width - artColumns)}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          {artworkCells !== null && <Box marginBottom={1}>{art()}</Box>}
          {title(snapshot, width)}
        </Box>
      )
    }
    const frame = (children: RenderChildren) => (
      <Box flexDirection="column" width="100%" minHeight={Math.max(1, e.props.scroll.bodyRows)} paddingX={1} backgroundColor={palette.background}>
        {children}
      </Box>
    )

    if (snapshot === null) {
      return frame(<Text color={palette.muted}>Reading the repository…</Text>)
    }

    const upstreamNote = UPSTREAM_NOTE[snapshot.upstreamStatus]
    const otherWorktrees = snapshot.worktrees.filter(worktree => !worktree.isCurrent)
    const sessionLine = facts === null
      ? null
      : [facts.model, `${facts.turns} turns`, facts.contextPercent === null ? null : `ctx ${Math.round(facts.contextPercent)}%`]
          .filter((fact): fact is string => fact !== null)
          .join(' · ')

    return frame(
      <Box flexDirection="column">
        {header(snapshot)}
        {sessionLine !== null && (
          <Box flexDirection="column">
            {heading('Session')}
            <Text color={palette.muted}>{fit(sessionLine, width)}</Text>
          </Box>
        )}
        {!snapshot.isRepo && <Text color={palette.muted}>not a git repository</Text>}
        {snapshot.isRepo && (
          <Box flexDirection="column">
            {heading('Git')}
            {row('branch', snapshot.branch ?? 'HEAD (detached)', snapshot.branch === null ? palette.warning : palette.text)}
            {snapshot.worktree !== null && row('worktree', snapshot.worktree)}
            {row('upstream', snapshot.upstream ?? 'none', upstreamColor(palette, snapshot.upstreamStatus))}
            {upstreamNote !== null && (
              <Text color={upstreamColor(palette, snapshot.upstreamStatus)} wrap="truncate-end">
                {fit(`  ${upstreamNote}`, width)}
              </Text>
            )}
            {snapshot.pushTarget !== null && row('push', snapshot.pushTarget, palette.warning)}
            {row(
              'sync',
              `↑${snapshot.ahead} ↓${snapshot.behind}  ${snapshot.dirty === 0 ? 'clean' : `${snapshot.dirty} changed`}`,
              snapshot.dirty === 0 && snapshot.ahead === 0 && snapshot.behind === 0 ? palette.ok : palette.text,
            )}
            {otherWorktrees.length > 0 && (
              <Box flexDirection="column">
                {heading(`Worktrees (${otherWorktrees.length})`)}
                {otherWorktrees.map(worktree => (
                  <Box key={`w:${worktree.path}`} flexDirection="column">
                    <Text color={palette.text} wrap="truncate-end">
                      {fit(`${worktree.name}${worktree.branch === null ? '  (detached)' : ''}${worktree.status === 'ok' ? '' : `  (${worktree.status})`}`, width)}
                    </Text>
                    <Text color={upstreamColor(palette, worktree.status)} wrap="truncate-end">
                      {fit(`  → ${worktree.upstream ?? 'none'}`, width)}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
        {recapBlock('Last turn', turn)}
        {prior !== null && (turn === null || prior.endedAt !== turn.endedAt) && recapBlock('Previous session', prior)}
        {snapshot.isRepo && (
          <Box flexDirection="column">
            {heading('Commits')}
            {snapshot.commits.length === 0 && <Text color={palette.muted}>no commits yet</Text>}
            {snapshot.commits.map(commit => (
              <Box key={`c:${commit.hash}`}>
                <Text color={palette.hash}>{commit.hash.slice(0, 8)} </Text>
                <Text color={palette.muted}>{commit.age.replace(/ ago$/, '').replace(/ (\w)\w+$/, '$1').padEnd(3)} </Text>
                <Text color={palette.text} wrap="truncate-end">
                  {fit(commit.subject, width - 13)}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refreshGit($, commitCount)} />
          <Text> </Text>
          <Button key="hide" label="Hide" hotkey="h" role="dismiss" onPress={() => $.ui.close({ id: PANE_ID })} />
        </Box>
      </Box>,
    )
  })
}
