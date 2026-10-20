import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { GitSnapshot, SessionFacts, TurnRecap, UpstreamStatus } from '../types'
import { bannerWidth, renderBanner } from './banner'
import { UPSTREAM_NOTE, chips, commitsCard, contextCard, fit, gitCard, isInSync, pills, placeCard, recapCard, recapSummary, shortAge, shortenHome, syncText, worktreesCard } from './cards'
import type { Card, ChipPart, PaneFacts } from './cards'
import { FLOWER } from './flower'
import { readGitSnapshot } from './git'
import { PALETTES, customThemeSlug, resolveTheme } from './palette'
import type { ChipTone, Palette, ThemeName } from './palette'
import { makeHalfBlockCells } from './raster'
import { RECAP_ROOTS_KEY, makeRecap, recapKey, rememberRoot } from './recap'
import { drawPill } from './svg'

const PANE_ID = 'dev-dashboard'
const PANE_TITLE = 'Dashboard'
const PANE_COLUMNS = 46
const GIT_TIMEOUT_MS = 10000
const LABEL_WIDTH = 10

// A remote pane reports its width in cells; its text is drawn at about this
// many CSS pixels per cell, which sizes the SVG cards to the pane.
const REMOTE_CELL_PX = 6.2
const CARD_GAP_PX = 8
const CARD_MIN_PX = 250
const CARD_MAX_COLUMNS = 3

const git = atom({ plugin: 'dev-dashboard', key: 'git' } as const, null)
const lastTurn = atom({ plugin: 'dev-dashboard', key: 'lastTurn' } as const, null)
const previous = atom({ plugin: 'dev-dashboard', key: 'previous' } as const, null)
const session = atom({ plugin: 'dev-dashboard', key: 'session' } as const, null)
const isDismissed = atom({ plugin: 'dev-dashboard', key: 'isDismissed' } as const, false)

const gitRefresh: { pending: Promise<GitSnapshot> | null; isQueued: boolean } = { pending: null, isQueued: false }

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
  const facts: SessionFacts = {
    model,
    turns,
    contextPercent: usage.context.percent ?? null,
    contextTokens: usage.context.tokens ?? null,
    contextWindow: usage.context.window,
  }

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
  let home: string | null = null
  let turnStartedAt = 0
  let toolCalls = 0
  let hasAutoOpened = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dashboard', description: 'Toggle the dev dashboard pane' })

    theme = await readTheme($, options.theme)
    home = (await $.env.get('HOME')) ?? null
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
    const now = await $.clock.now()
    const [snapshot, turn, prior, facts] = await Promise.all([read($, git), read($, lastTurn), read($, previous), read($, session)])
    const showsPrior = prior !== null && (turn === null || prior.endedAt !== turn.endedAt)

    if (e.surface !== 'terminal') {
      const { Box, Button, Svg, Text } = $.ui.resolve(e)
      const paneWidth = Math.max(CARD_MIN_PX, Math.floor(e.props.bodyColumns * REMOTE_CELL_PX) - 2 * CARD_GAP_PX)
      const columns = Math.max(1, Math.min(CARD_MAX_COLUMNS, Math.floor((paneWidth + CARD_GAP_PX) / (CARD_MIN_PX + CARD_GAP_PX))))
      const cardWidth = Math.floor((paneWidth - CARD_GAP_PX * (columns - 1)) / columns)
      const wideWidth = columns === 1 ? cardWidth : cardWidth * 2 + CARD_GAP_PX
      const draw = (key: string, card: Card) => <Svg key={key} source={card.source} alt={card.alt} width={card.width} height={card.height} />

      if (snapshot === null) {
        return (
          <Box paddingX={1}>
            <Text dimColor>Reading the repository…</Text>
          </Box>
        )
      }

      const view: PaneFacts = { snapshot, turn, prior, facts, now, home }
      const context = contextCard(view, cardWidth)
      const worktrees = worktreesCard(view, cardWidth)

      return (
        <Box flexDirection="column" width="100%" paddingX={1} rowGap={1}>
          {draw('card:place', placeCard(view, wideWidth))}
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={1}>
            {pills(view).map(pill => draw(`pill:${pill.key}`, { ...drawPill(pill.tone, pill.items), alt: pill.alt }))}
          </Box>
          <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" columnGap={1} rowGap={1}>
            {snapshot.isRepo && draw('card:git', gitCard(view, cardWidth))}
            {context !== null && draw('card:context', context)}
            {worktrees !== null && draw('card:worktrees', worktrees)}
            {turn !== null && draw('card:turn', recapCard('LAST TURN', turn, now, wideWidth, 'purple'))}
            {showsPrior && draw('card:previous', recapCard('PREVIOUS SESSION', prior, now, wideWidth, null))}
            {snapshot.isRepo && draw('card:commits', commitsCard(view, wideWidth))}
            {!snapshot.isRepo && <Text dimColor>not a git repository</Text>}
          </Box>
          <Box flexDirection="row" columnGap={1}>
            <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refreshGit($, commitCount)} />
            <Button key="hide" label="Hide" hotkey="h" role="dismiss" onPress={() => $.ui.close({ id: PANE_ID })} />
          </Box>
        </Box>
      )
    }

    const { Box, Button, Text, Raster } = $.ui.resolve(e)
    const palette = PALETTES[theme]
    const width = Math.max(10, e.props.bodyColumns - 2)

    const heading = (label: string) => (
      <Box key={`h:${label}`} marginTop={1}>
        <Text color={palette.accent} weight="bold">
          {fit(label.toUpperCase(), width)}
        </Text>
        <Text color={palette.muted} dimColor>
          {fit(` ${'─'.repeat(Math.max(0, width - label.length - 1))}`, Math.max(0, width - label.length))}
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
    const chip = (key: string, tone: ChipTone, parts: ChipPart[]) => {
      const colors = palette.chips[tone]
      const style: Record<ChipPart[1], { color: string; weight?: 'bold'; dimColor?: boolean }> = {
        label: { color: colors.accent, weight: 'bold' },
        value: { color: colors.text, weight: 'bold' },
        aside: { color: colors.muted },
        accent: { color: colors.accent },
        off: { color: colors.muted, dimColor: true },
      }
      const last = parts.length - 1

      return (
        <Box key={`chip:${key}`} flexDirection="row" flexShrink={0}>
          {parts.map(([text, kind], index) => (
            <Text key={`${key}:${index}`} backgroundColor={colors.tint} {...style[kind]}>
              {`${index === 0 ? ' ' : ''}${text}${index === last ? ' ' : ''}`}
            </Text>
          ))}
        </Box>
      )
    }
    const recapBlock = (label: string, recap: TurnRecap | null) => {
      if (recap === null) return null

      return (
        <Box key={`recap:${label}`} flexDirection="column">
          {heading(label)}
          <Text color={palette.muted}>{fit(recapSummary(recap, now).join(' · '), width)}</Text>
          {recap.lines.map((line, index) => (
            <Text key={`${label}:${index}`} color={palette.text} wrap="wrap">
              {line}
            </Text>
          ))}
        </Box>
      )
    }

    const artworkCells = artwork !== null && artwork.width <= width ? makeHalfBlockCells(artwork, palette.background) : null
    const art = () => artworkCells === null ? null : <Raster key="flower" columns={artworkCells.columns} rows={artworkCells.rows} cells={artworkCells.cells} />
    const title = (snapshot: GitSnapshot, titleWidth: number) => {
      const banner = bannerFor(titleWidth)

      return (
        <Box flexDirection="column">
          {banner !== null && (
            <Box flexDirection="column" marginBottom={1}>
              {banner.map((bannerRow, index) => (
                <Text key={`banner:${index}`} color={palette.accent} weight="bold">
                  {bannerRow}
                </Text>
              ))}
            </Box>
          )}
          <Text color={palette.accent} weight="bold">
            {fit(snapshot.worktree ?? snapshot.projectName, titleWidth)}
          </Text>
          {snapshot.worktree !== null && <Text color={palette.text}>{fit(`project ${snapshot.projectName}`, titleWidth)}</Text>}
          {snapshot.remoteName !== null && <Text color={palette.muted}>{fit(snapshot.remoteName, titleWidth)}</Text>}
          <Text color={palette.muted} dimColor>
            {fit(shortenHome(snapshot.root, home), titleWidth)}
          </Text>
        </Box>
      )
    }
    const header = (snapshot: GitSnapshot) => {
      const artColumns = artworkCells === null ? 0 : artworkCells.columns + 2
      const isSideBySide = artworkCells !== null && artColumns + Math.max(bannerWidth(narrowBanner), (snapshot.worktree ?? snapshot.projectName).length) <= width

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

    const view: PaneFacts = { snapshot, turn, prior, facts, now, home }
    const upstreamNote = UPSTREAM_NOTE[snapshot.upstreamStatus]
    const otherWorktrees = snapshot.worktrees.filter(worktree => !worktree.isCurrent)

    return frame(
      <Box flexDirection="column">
        {header(snapshot)}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
          {chips(view).map(part => chip(part.key, part.tone, part.parts))}
        </Box>
        {!snapshot.isRepo && (
          <Box marginTop={1}>
            <Text color={palette.muted}>not a git repository</Text>
          </Box>
        )}
        {snapshot.isRepo && (
          <Box flexDirection="column">
            {heading('Git')}
            {row('branch', snapshot.branch ?? 'HEAD (detached)', snapshot.branch === null ? palette.warning : palette.text)}
            {snapshot.worktree !== null && row('worktree', snapshot.worktree)}
            {row('upstream', snapshot.upstream ?? 'none', upstreamColor(palette, snapshot.upstreamStatus))}
            {upstreamNote !== null && (
              <Text color={upstreamColor(palette, snapshot.upstreamStatus)} wrap="truncate-end">
                {fit(`  ! ${upstreamNote}`, width)}
              </Text>
            )}
            {snapshot.pushTarget !== null && row('push', snapshot.pushTarget, palette.warning)}
            {row('sync', `${syncText(snapshot)}  ${snapshot.dirty === 0 ? 'clean' : `${snapshot.dirty} changed`}`, isInSync(snapshot) ? palette.ok : palette.text)}
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
        {showsPrior && recapBlock('Previous session', prior)}
        {snapshot.isRepo && (
          <Box flexDirection="column">
            {heading('Commits')}
            {snapshot.commits.length === 0 && <Text color={palette.muted}>no commits yet</Text>}
            {snapshot.commits.map(commit => (
              <Box key={`c:${commit.hash}`}>
                <Text color={palette.hash}>{commit.hash.slice(0, 8)} </Text>
                <Text color={palette.muted}>{shortAge(commit.age).padEnd(3)} </Text>
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
