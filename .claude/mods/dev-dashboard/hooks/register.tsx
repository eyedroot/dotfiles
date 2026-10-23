import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Activity, CostLedger, GitSnapshot, JiraState, PullRequest, RateLimit, SessionFacts, TurnRecap } from '../types'
import { SIGNAL_TONE, changesCard, checksCard, commitsCard, costCard, worktreesCard, gitCard, nowCard, placeCard, recapCard, signalsCard, ticketCard } from './cards'
import type { Card } from './cards'
import { bandGroups, barRuns } from './band'
import type { BandGroup } from './band'
import { classifyCommand, makeCheckRun, recordEdit } from './checks'
import { dayKey, dayTotal, dearestTurns, formatUsd, promptLabel, sparkline, staleDayKeys } from './cost'
import { readGitSnapshot } from './git'
import { JIRA_FIELDS, JIRA_ISSUE_TOOL, JIRA_SITES_TOOL, isConnectorMissing, parseJiraIssue, pickJiraSite } from './jira'
import { BAND_PALETTES, PALETTES, customThemeSlug, resolveTheme } from './palette'
import type { ChipTone, ThemeName } from './palette'
import { PR_FIELDS, parsePullRequest } from './pr'
import { RECAP_ROOTS_KEY, formatDuration, makeRecap, recapKey, rememberRoot } from './recap'
import { buildSignals, protectedBranchMatcher } from './signals'
import type { SignalLevel } from './signals'
import { CHECK_TONE, FILE_CODE_TONE, JIRA_STATUS_TONE, UPSTREAM_TONE, changeRows, costSummary, jiraWaitText, sessionLine, shortenHome, activityLine, branchTicketKey, currentTicket, issueContext, todoProgress, changeSummary, checkRows, currentPr, diffStat, fit, isInSync, prSummary, recapSummary, shortAge, syncText, toolLabel, toolName } from './view'
import type { CheckState, PaneFacts } from './view'

const PANE_ID = 'dev-dashboard'
const PANE_TITLE = 'Dashboard'
const PANE_COLUMNS = 46
const GIT_TIMEOUT_MS = 10000
const GH_TIMEOUT_MS = 20000
const LABEL_WIDTH = 7
const RUNNING_SHOWN = 3
const CHANGED_FILES_SHOWN = 8
const TICK_MS = 1000
const TURN_COSTS_KEPT = 48
const BAND_SPARK_TURNS = 12
const PANE_SPARK_TURNS = 30
const DEAREST_TURNS_SHOWN = 3
const BAND_BAR_WIDTH = 10
const BAND_WIDE_COLUMNS = 100
const SESSION_POLL_MS = 60_000
const TODO_BAR_WIDTH = 24
const OPEN_TODOS_SHOWN = 3
const EXCERPT_LINES_SHOWN = 2
const JIRA_FRESH_MS = 5 * 60 * 1000
const JIRA_SITE_KEY = 'jira-site'
const JIRA_CONNECT_ATTEMPTS = 6
const JIRA_CONNECT_WAIT_MS = 5000
const PLUGIN = 'dev-dashboard'

// A remote pane reports its width in cells; its text is drawn at about this
// many CSS pixels per cell, which sizes the SVG cards to the pane.
const REMOTE_CELL_PX = 6.2
const CARD_GAP_PX = 8
const CARD_MIN_PX = 250
const CARD_MAX_COLUMNS = 3

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const PUSH_COMMAND = /\b(git\s+push|gh\s+pr)\b/
const JIRA_WRITE_TOOL = /(transition|edit|addComment|addWorklog|create)\w*Jira/i

const IDLE: Activity = { turnStartedAt: null, toolCalls: 0, sessionToolCalls: 0, running: [] }
const NO_COSTS: CostLedger = { turns: [], todayUsd: null, todaySessions: 0, startUsd: null, startPrompt: '' }

// Change a shape tag when that value's fields change: the tag declines what an
// earlier version stored, which outlives a reload.
const git = atom({ plugin: 'dev-dashboard', key: 'git' } as const, null, { shape: 'git-3' })
const session = atom({ plugin: 'dev-dashboard', key: 'session' } as const, null, { shape: 'session-3' })
const lastTurn = atom({ plugin: 'dev-dashboard', key: 'lastTurn' } as const, null)
const previous = atom({ plugin: 'dev-dashboard', key: 'previous' } as const, null)
const isDismissed = atom({ plugin: 'dev-dashboard', key: 'isDismissed' } as const, false)
const activity = atom({ plugin: 'dev-dashboard', key: 'activity' } as const, IDLE)
const checks = atom({ plugin: 'dev-dashboard', key: 'checks' } as const, {})
const edits = atom({ plugin: 'dev-dashboard', key: 'edits' } as const, [])
const pr = atom({ plugin: 'dev-dashboard', key: 'pr' } as const, null)
const jira = atom({ plugin: 'dev-dashboard', key: 'jira' } as const, null)
const costs = atom({ plugin: 'dev-dashboard', key: 'costs' } as const, NO_COSTS)
const tick = atom({ plugin: 'dev-dashboard', key: 'tick' } as const, 0)

const gitRefresh: { pending: Promise<GitSnapshot> | null; isQueued: boolean } = { pending: null, isQueued: false }
const prRefresh: { pending: Promise<PullRequest | null> | null } = { pending: null }
const ticker: { cancel: (() => void) | null } = { cancel: null }

const STATE_BADGE: Record<CheckState, string> = { pass: 'PASS', fail: 'FAIL', stale: 'STALE', stopped: 'STOP' }
const SIGNAL_MARK: Record<SignalLevel, string> = { error: '✕', warn: '▲', info: '·' }

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

function refreshGit($: EngineInterface, commitCount: number, isPrEnabled: boolean): Promise<GitSnapshot> {
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
    const exists = (path: string) => $.fs.exists(path).catch(() => false)
    const earlier = await read($, git)
    const snapshot = await readGitSnapshot(run, exists, cwd, commitCount, await $.clock.now())
    await update($, git, () => snapshot)

    if (isPrEnabled && earlier?.branch !== snapshot.branch) void refreshPr($)

    return snapshot
  })().finally(() => {
    gitRefresh.pending = null

    if (gitRefresh.isQueued) {
      gitRefresh.isQueued = false
      void refreshGit($, commitCount, isPrEnabled)
    }
  })

  return gitRefresh.pending
}

// gh answers non-zero when the branch has no PR, gh is missing or its account
// cannot see the repository; each of those shows no PR line.
function refreshPr($: EngineInterface): Promise<PullRequest | null> {
  if (prRefresh.pending !== null) return prRefresh.pending

  prRefresh.pending = (async () => {
    const snapshot = await read($, git)
    let found: PullRequest | null = null

    if (snapshot !== null && snapshot.isRepo && snapshot.branch !== null && snapshot.remoteName !== null) {
      const ran = await $.process.run(['gh', 'pr', 'view', '--json', PR_FIELDS], { cwd: await $.session.cwd(), timeoutMs: GH_TIMEOUT_MS }).catch(() => null)
      found = ran !== null && ran.exitCode === 0 ? parsePullRequest(ran.stdout, snapshot.branch) : null
    }

    await update($, pr, () => found)

    return found
  })().finally(() => {
    prRefresh.pending = null
  })

  return prRefresh.pending
}

// The MCP tool typings follow whichever connectors were up at the last
// reload, so the Jira tools are named by string and the input is cast.
async function callJira($: EngineInterface, input: { tool: string } & Record<string, unknown>): Promise<{ answer: string | null; failure: string | null }> {
  try {
    const ran = await $.tool.call(input as unknown as Parameters<EngineInterface['tool']['call']>[0])

    if (ran.deny !== undefined) return { answer: null, failure: ran.deny }
    if (ran.isError === true) return { answer: null, failure: ran.text ?? 'the Jira tool answered an error' }

    return { answer: ran.text ?? (typeof ran.result === 'string' ? ran.result : JSON.stringify(ran.result)), failure: null }
  } catch (error) {
    return { answer: null, failure: error instanceof Error ? error.message : String(error) }
  }
}

async function readJiraSite($: EngineInterface, siteOption: string): Promise<{ site: string | null; failure: string | null }> {
  if (siteOption !== '') return { site: siteOption, failure: null }

  const stored = await $.store.get(JIRA_SITE_KEY)
  if (typeof stored === 'string' && stored !== '') return { site: stored, failure: null }

  const { answer, failure } = await callJira($, { tool: JIRA_SITES_TOOL })
  const site = answer === null ? null : pickJiraSite(answer)

  if (site !== null) await $.store.set(JIRA_SITE_KEY, site)

  return { site, failure: site === null ? failure ?? 'no Atlassian site with Jira access' : null }
}

// Call only from inside a hook. The tool.check hook below allows this
// plugin's own Jira reads, and the engine skips a plugin's hooks for a call
// raised outside one (a timer), which then falls to the permission mode.
async function refreshJira($: EngineInterface, siteOption: string, isForced: boolean): Promise<JiraState | null> {
  const snapshot = await read($, git)
  const key = snapshot === null ? null : branchTicketKey(snapshot)

  if (key === null) {
    await update($, jira, () => null)

    return null
  }

  const now = await $.clock.now()
  const known = await read($, jira)
  if (!isForced && known !== null && known.key === key && known.issue !== null && now - known.readAt < JIRA_FRESH_MS) return known

  const { site, failure: siteFailure } = await readJiraSite($, siteOption)
  let state: JiraState = { key, issue: known?.key === key ? known.issue : null, failure: siteFailure, readAt: now }

  if (site !== null) {
    const { answer, failure } = await callJira($, { tool: JIRA_ISSUE_TOOL, cloudId: site, issueIdOrKey: key, fields: JIRA_FIELDS, responseContentFormat: 'markdown', updateHistory: false })
    const issue = answer === null ? null : parseJiraIssue(answer, now)

    state = { key, issue: issue ?? state.issue, failure: issue === null ? failure ?? 'the Jira answer could not be read' : null, readAt: now }
  }

  await update($, jira, () => state)

  return state
}

// At session start the connectors are still connecting, so the first reads
// find no Jira tool; the retries wait inside the same hook-started chain.
async function refreshJiraOnStart($: EngineInterface, siteOption: string): Promise<void> {
  for (let attempt = 1; attempt <= JIRA_CONNECT_ATTEMPTS; attempt += 1) {
    const state = await refreshJira($, siteOption, true)
    if (state === null || state.failure === null || !isConnectorMissing(state.failure)) return

    await $.clock.sleep(JIRA_CONNECT_WAIT_MS)
  }
}

function toRateLimit(limit: { kind: string; percentUsed: number; resetsAt?: string }): RateLimit {
  return { kind: limit.kind, percentUsed: limit.percentUsed, resetsAt: limit.resetsAt ?? null }
}

async function refreshSession($: EngineInterface): Promise<void> {
  const [model, turns, usage] = await Promise.all([$.session.model(), $.session.turns(), $.session.usage()])
  const facts: SessionFacts = {
    model,
    turns,
    contextPercent: usage.context.percent ?? null,
    contextTokens: usage.context.tokens ?? null,
    contextWindow: usage.context.window,
    contextDelta: null,
    rateLimits: usage.rateLimits.map(toRateLimit),
    costUsd: usage.cost?.usd ?? null,
    startedAt: usage.startedAt,
  }

  await update($, session, earlier => ({ ...facts, contextDelta: earlier?.contextDelta ?? null }))
}

async function loadTodayCost($: EngineInterface): Promise<void> {
  const total = dayTotal(await $.store.get(dayKey(await $.clock.now())))

  await update($, costs, ledger => ({ ...ledger, todayUsd: total.sessions === 0 ? null : total.usd, todaySessions: total.sessions }))
}

async function recordTurnCost($: EngineInterface, endedAt: number, durationMs: number): Promise<void> {
  const [ledger, facts, sessionId] = await Promise.all([read($, costs), read($, session), $.session.id()])
  const sessionUsd = facts?.costUsd ?? null
  if (sessionUsd === null) return

  const key = dayKey(endedAt)
  const stored = await $.store.get(key)
  const day = { ...(stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}), [sessionId]: sessionUsd }
  const total = dayTotal(day)
  const turnUsd = ledger.startUsd === null ? null : Math.max(0, sessionUsd - ledger.startUsd)

  await $.store.set(key, day)
  await Promise.all(staleDayKeys(await $.store.keys(), endedAt).map(stale => $.store.delete(stale)))
  await update($, costs, now => ({
    ...now,
    turns: turnUsd === null ? now.turns : [...now.turns, { endedAt, usd: turnUsd, durationMs, prompt: now.startPrompt }].slice(-TURN_COSTS_KEPT),
    todayUsd: total.usd,
    todaySessions: total.sessions,
    startUsd: null,
  }))
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

// The elapsed times in the pane move only while a turn runs, so the clock
// redraws it only then.
function startTicking($: EngineInterface): void {
  if (ticker.cancel !== null) return

  const timer = $.clock.every(TICK_MS, () => void $.clock.now().then(now => update($, tick, () => now)))
  ticker.cancel = () => timer.cancel()
}

function stopTicking(): void {
  ticker.cancel?.()
  ticker.cancel = null
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })
}

export const register: Register = (on, options) => {
  const commitCount = Math.max(1, Math.floor(toNumber(options.commits, 5)))
  const recapLines = Math.max(1, Math.floor(toNumber(options.recapLines, 4)))
  const pollSeconds = Math.max(0, toNumber(options.pollSeconds, 30))
  const prSeconds = Math.max(0, toNumber(options.prSeconds, 120))
  const isPrEnabled = options.pr !== false
  const isJiraEnabled = options.jira !== false
  const jiraSite = typeof options.jiraSite === 'string' ? options.jiraSite.trim() : ''
  const autoOpen = options.autoOpen !== false
  const isBandEnabled = options.band !== false
  const isProtected = protectedBranchMatcher(typeof options.protectedBranches === 'string' ? options.protectedBranches : 'main,master,develop,pre_release*,release/*')

  let theme: ThemeName = 'dark'
  let home: string | null = null
  let hasAutoOpened = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dashboard', description: 'Toggle the dev dashboard pane' })

    theme = await readTheme($, options.theme)
    home = (await $.env.get('HOME')) ?? null
    stopTicking()
    await update($, activity, () => IDLE)
    const snapshot = await refreshGit($, commitCount, isPrEnabled)
    await Promise.all([loadPrevious($, snapshot.mainRoot), refreshSession($), loadTodayCost($)])
    if (isJiraEnabled) void refreshJiraOnStart($, jiraSite)
    $.clock.every(SESSION_POLL_MS, () => void refreshSession($))

    if (pollSeconds > 0) $.clock.every(pollSeconds * 1000, () => void refreshGit($, commitCount, isPrEnabled))
    if (isPrEnabled && prSeconds > 0) $.clock.every(prSeconds * 1000, () => void refreshPr($))

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

  // Drawn without next(e) on the terminal, so a band of another plugin
  // beneath (usage-bar) is left out there; `band: false` gives it back.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (autoOpen && !hasAutoOpened && e.viewport?.isFullscreen === true && !(await read($, isDismissed))) {
      hasAutoOpened = true
      void openPane($)
    }

    if (!isBandEnabled || e.surface !== 'terminal' || e.props.hasSurvey) return next(e)

    const [facts, ledger] = await Promise.all([read($, session), read($, costs)])
    const turnCosts = ledger.turns.slice(-BAND_SPARK_TURNS).map(turn => turn.usd)
    const groups = facts === null ? [] : bandGroups(facts, await $.clock.now(), e.props.bodyColumns >= BAND_WIDE_COLUMNS, turnCosts)
    if (groups.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const colors = BAND_PALETTES[theme]
    const valueColor = (group: BandGroup) => (group.tone === 'ok' ? colors.label : colors.bars[group.barColor])

    return (
      <Box flexDirection="row" flexWrap="wrap" paddingX={1}>
        {groups.map((group, index) => (
          <Box key={group.key} flexDirection="row" flexShrink={0}>
            {index > 0 && <Text color={colors.separator}>{' │ '}</Text>}
            <Text color={colors.label}>{`${group.label} `}</Text>
            {group.percent !== null &&
              barRuns(group.percent, group.elapsedShare, BAND_BAR_WIDTH).map(([run], runIndex) => (
                <Text key={`${group.key}:${runIndex}`} color={colors.bars[group.barColor]} weight={group.barColor === 'context' ? undefined : 'bold'}>
                  {run}
                </Text>
              ))}
            <Text color={group.percent === null ? colors.value : valueColor(group)} weight={group.percent === null || group.tone !== 'ok' ? 'bold' : undefined}>
              {group.percent === null ? group.value : ` ${group.value}`}
            </Text>
            {group.spark !== null && <Text color={colors.spark}>{` ${group.spark}`}</Text>}
            {group.asides.map(aside => (
              <Text key={`${group.key}:${aside}`} color={colors.separator}>
                {` ${aside}`}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  on('session.measure', async ($, e, next) => {
    await update($, session, facts => {
      if (facts === null) return null

      const tokens = e.context.tokens ?? facts.contextTokens
      const hasMoved = tokens !== null && facts.contextTokens !== null && tokens !== facts.contextTokens

      return {
        ...facts,
        contextPercent: e.context.percent ?? facts.contextPercent,
        contextTokens: tokens,
        contextWindow: e.context.window,
        contextDelta: hasMoved ? tokens - (facts.contextTokens ?? 0) : facts.contextDelta,
        rateLimits: e.rateLimits.map(toRateLimit),
        costUsd: e.cost?.usd ?? facts.costUsd,
      }
    })

    return next(e)
  })

  for (const tool of [JIRA_ISSUE_TOOL, JIRA_SITES_TOOL]) {
    on('tool.check', { tool }, ($, e, next) => {
      if (!isJiraEnabled || next.origin.plugin !== PLUGIN) return next(e)

      return { decision: 'allow', reason: 'dev-dashboard reads the Jira issue named by the branch' }
    })
  }

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const [startedAt, usage] = await Promise.all([$.clock.now(), $.session.usage()])
    await update($, activity, now => ({ ...now, turnStartedAt: startedAt, toolCalls: 0, running: [] }))
    await update($, costs, ledger => ({ ...ledger, startUsd: usage.cost?.usd ?? null, startPrompt: promptLabel(e.text) }))
    startTicking($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (next.origin.plugin === PLUGIN) return next(e)

    const isMainLoop = e.agentId === undefined
    const startedAt = await $.clock.now()
    const input = e as unknown as Record<string, unknown>

    if (isMainLoop) {
      const running = { id: e.tool_use_id, tool: e.tool, label: toolLabel(input), startedAt }
      await update($, activity, now => ({ ...now, toolCalls: now.toolCalls + 1, sessionToolCalls: (now.sessionToolCalls ?? 0) + 1, running: [...now.running, running] }))
    }

    let ran: Awaited<ReturnType<typeof next>>

    try {
      ran = await next(e)
    } finally {
      if (isMainLoop) await update($, activity, now => ({ ...now, running: now.running.filter(tool => tool.id !== e.tool_use_id) }))
    }

    if (ran.deny !== undefined) return ran

    const endedAt = await $.clock.now()
    const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null

    if (EDIT_TOOLS.has(e.tool) && ran.isError !== true && path !== null) {
      await update($, edits, list => recordEdit(list, path, endedAt))
    }

    if (e.tool === 'Bash') {
      const check = classifyCommand(e.command)
      const result = (ran.result ?? {}) as { backgroundTaskId?: unknown; interrupted?: unknown }

      if (check !== null && result.backgroundTaskId === undefined) {
        const run = makeCheckRun({
          ...check,
          output: ran.text ?? '',
          isError: ran.isError === true,
          isInterrupted: result.interrupted === true,
          startedAt,
          endedAt,
        })
        await update($, checks, earlier => ({ ...earlier, [run.kind]: run }))
      }

      if (isPrEnabled && PUSH_COMMAND.test(e.command)) void refreshPr($)
    }

    if (ran.isReadOnly !== true) void refreshGit($, commitCount, isPrEnabled)
    if (isJiraEnabled && JIRA_WRITE_TOOL.test(e.tool) && ran.isError !== true) await refreshJira($, jiraSite, true)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    stopTicking()
    const endedAt = await $.clock.now()
    const [snapshot, finished] = await Promise.all([read($, git), read($, activity)])
    const recap = makeRecap({
      answer: e.answer,
      durationMs: finished.turnStartedAt === null ? e.durationMs : endedAt - finished.turnStartedAt,
      toolCalls: finished.toolCalls,
      outputTokens: e.usage?.output_tokens ?? null,
      reason: e.reason,
      repoRoot: snapshot?.mainRoot ?? null,
      endedAt,
      lineCount: recapLines,
    })

    await update($, activity, now => ({ ...now, turnStartedAt: null, running: [] }))
    await update($, lastTurn, () => recap)
    await Promise.all([persistRecap($, recap), refreshSession($), refreshGit($, commitCount, isPrEnabled)])
    await recordTurnCost($, endedAt, recap.durationMs)
    if (isJiraEnabled) await refreshJira($, jiraSite, false)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const [snapshot, turn, prior, facts, doing, checkRuns, edited, pull, ticketState, ledger] = await Promise.all([
      read($, git),
      read($, lastTurn),
      read($, previous),
      read($, session),
      read($, activity),
      read($, checks),
      read($, edits),
      read($, pr),
      read($, jira),
      read($, costs),
      read($, tick),
    ])
    const now = await $.clock.now()
    const view: PaneFacts | null = snapshot === null ? null : { snapshot, turn, prior, facts, activity: doing, checks: checkRuns, edits: edited, pr: pull, jira: ticketState, costs: ledger, now, home }
    const signals = view === null ? [] : buildSignals(view, isProtected)
    const showsPrior = prior !== null && turn === null
    const ticket = view === null ? null : currentTicket(view)

    if (e.surface !== 'terminal') {
      const { Box, Button, Svg, Text } = $.ui.resolve(e)
      const paneWidth = Math.max(CARD_MIN_PX, Math.floor(e.props.bodyColumns * REMOTE_CELL_PX) - 2 * CARD_GAP_PX)
      const columns = Math.max(1, Math.min(CARD_MAX_COLUMNS, Math.floor((paneWidth + CARD_GAP_PX) / (CARD_MIN_PX + CARD_GAP_PX))))
      const cardWidth = Math.floor((paneWidth - CARD_GAP_PX * (columns - 1)) / columns)
      const wideWidth = columns === 1 ? cardWidth : cardWidth * 2 + CARD_GAP_PX
      const draw = (key: string, card: Card | null) => card === null ? null : <Svg key={key} source={card.source} alt={card.alt} width={card.width} height={card.height} />

      if (view === null) {
        return (
          <Box paddingX={1}>
            <Text dimColor>Reading the repository…</Text>
          </Box>
        )
      }

      return (
        <Box flexDirection="column" width="100%" paddingX={1} rowGap={1}>
          {draw('card:ticket', ticketCard(view, wideWidth))}
          {draw('card:place', placeCard(view, wideWidth))}
          <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" columnGap={1} rowGap={1}>
            {draw('card:now', nowCard(view, signals, cardWidth))}
            {draw('card:signals', signalsCard(signals, cardWidth))}
            {draw('card:checks', checksCard(view, cardWidth))}
            {turn !== null && draw('card:turn', recapCard('LAST TURN', turn, now, wideWidth, 'purple'))}
            {draw('card:changes', changesCard(view, cardWidth, CHANGED_FILES_SHOWN))}
            {draw('card:cost', costCard(view, cardWidth, PANE_SPARK_TURNS, DEAREST_TURNS_SHOWN))}
            {view.snapshot.isRepo && draw('card:git', gitCard(view, cardWidth))}
            {draw('card:worktrees', worktreesCard(view, cardWidth))}
            {showsPrior && draw('card:previous', recapCard('PREVIOUS SESSION', prior, now, wideWidth, null))}
            {view.snapshot.isRepo && draw('card:commits', commitsCard(view, wideWidth))}
            {!view.snapshot.isRepo && <Text dimColor>not a git repository</Text>}
          </Box>
          <Box flexDirection="row" columnGap={1}>
            <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refreshGit($, commitCount, isPrEnabled)} />
            <Button key="hide" label="Hide" hotkey="h" role="dismiss" onPress={() => $.ui.close({ id: PANE_ID })} />
          </Box>
        </Box>
      )
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const palette = PALETTES[theme]
    const width = Math.max(10, e.props.bodyColumns - 2)
    const toneColor = (tone: ChipTone | null) => (tone === null ? palette.muted : palette.chips[tone].accent)

    const heading = (label: string, aside = '') => {
      const title = label.toUpperCase()
      const rule = Math.max(0, width - title.length - (aside === '' ? 1 : aside.length + 2))

      return (
        <Box key={`h:${label}`} marginTop={1}>
          <Text color={palette.accent} weight="bold">
            {title}
          </Text>
          <Text color={palette.muted} dimColor>
            {` ${'─'.repeat(rule)}${aside === '' ? '' : ' '}`}
          </Text>
          {aside !== '' && <Text color={palette.muted}>{aside}</Text>}
        </Box>
      )
    }
    const badge = (key: string, tone: ChipTone, text: string) => (
      <Text key={key} backgroundColor={palette.chips[tone].tint} color={palette.chips[tone].accent} weight="bold">
        {` ${text} `}
      </Text>
    )
    const row = (label: string, value: string, color: string = palette.text) => (
      <Box key={`r:${label}`}>
        <Text color={palette.muted}>{label.padEnd(LABEL_WIDTH)}</Text>
        <Text color={color} wrap="truncate-end">
          {fit(value, width - LABEL_WIDTH)}
        </Text>
      </Box>
    )
    const spread = (key: string, left: RenderChildren, right: string, rightColor: string = palette.muted) => (
      <Box key={key} flexDirection="row" justifyContent="space-between">
        <Box flexShrink={1}>{left}</Box>
        <Text color={rightColor}>{` ${right}`}</Text>
      </Box>
    )

    const placeBlock = (current: GitSnapshot, isLead: boolean) => (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Text color={isLead ? palette.accent : palette.text} weight="bold" wrap="truncate-end">
            {current.projectName}
          </Text>
          {current.worktree !== null && (
            <Text color={palette.chips.cyan.accent} wrap="truncate-end">
              {`↳ ${current.worktree}`}
            </Text>
          )}
        </Box>
        {current.isRepo && (
          <Text color={current.branch === null ? palette.warning : palette.text} wrap="truncate-end">
            {`⑃ ${current.branch ?? 'HEAD (detached)'}`}
          </Text>
        )}
        {current.remoteName !== null && (
          <Text color={palette.muted} wrap="truncate-end">
            {current.remoteName}
          </Text>
        )}
        <Text color={palette.muted} dimColor wrap="truncate-start">
          {shortenHome(current.root, home)}
        </Text>
      </Box>
    )
    const header = (current: GitSnapshot) => {
      if (ticket === null) return placeBlock(current, true)

      const { issue } = ticket
      const progress = issue === null ? null : todoProgress(issue)
      const context = issue === null ? '' : issueContext(issue)
      const openTodos = issue === null ? [] : issue.todos.filter(todo => !todo.isDone)
      const barWidth = Math.max(6, Math.min(TODO_BAR_WIDTH, width - 12))
      const filled = progress === null ? 0 : Math.round((progress.done / progress.total) * barWidth)

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            <Text color={palette.accent} weight="bold">
              {ticket.key}
            </Text>
            {issue !== null && badge('jira:status', JIRA_STATUS_TONE[issue.statusCategory] ?? 'slate', issue.status.toUpperCase())}
          </Box>
          {issue === null && (
            <Text color={palette.muted} wrap="truncate-end">
              {jiraWaitText(ticket.failure)}
            </Text>
          )}
          {issue !== null && (
            <Box flexDirection="column">
              <Text color={palette.text} weight="bold" wrap="wrap">
                {issue.summary}
              </Text>
              {context !== '' && (
                <Text color={palette.muted} wrap="truncate-end">
                  {context}
                </Text>
              )}
              {progress !== null && (
                <Box flexDirection="row" marginTop={1}>
                  <Text color={palette.muted}>{'todo '}</Text>
                  <Text color={palette.accent}>{'━'.repeat(filled)}</Text>
                  <Text color={palette.muted} dimColor>
                    {'━'.repeat(barWidth - filled)}
                  </Text>
                  <Text color={palette.muted}>{` ${progress.done}/${progress.total}`}</Text>
                </Box>
              )}
              {openTodos.slice(0, OPEN_TODOS_SHOWN).map((todo, index) => (
                <Text key={`todo:${index}`} color={palette.text} wrap="truncate-end">
                  {`□ ${todo.text}`}
                </Text>
              ))}
              {openTodos.length > OPEN_TODOS_SHOWN && <Text color={palette.muted}>{`  + ${openTodos.length - OPEN_TODOS_SHOWN} more`}</Text>}
              {progress === null &&
                issue.excerpt.slice(0, EXCERPT_LINES_SHOWN).map((excerptLine, index) => (
                  <Text key={`excerpt:${index}`} color={palette.muted} wrap="truncate-end">
                    {excerptLine}
                  </Text>
                ))}
            </Box>
          )}
          <Box marginTop={1}>{placeBlock(current, false)}</Box>
        </Box>
      )
    }
    const frame = (children: RenderChildren) => (
      <Box flexDirection="column" width="100%" minHeight={Math.max(1, e.props.scroll.bodyRows)} paddingX={1} backgroundColor={palette.background}>
        {children}
      </Box>
    )

    if (view === null) {
      return frame(<Text color={palette.muted}>Reading the repository…</Text>)
    }

    const repo = view.snapshot
    const line = activityLine(view)
    const alarms = signals.filter(signal => signal.level !== 'info')
    const notes = signals.filter(signal => signal.level === 'info')
    const runningShown = doing.running.slice(0, RUNNING_SHOWN)
    const rows = checkRows(view)
    const stat = diffStat(repo)
    const pullShown = currentPr(view)
    const pullLine = pullShown === null ? null : prSummary(pullShown)
    const costParts = costSummary(view)
    const sessionFacts = sessionLine(view)
    const changes = changeRows(view)
    const otherWorktrees = repo.worktrees.filter(worktree => !worktree.isCurrent)

    return frame(
      <Box flexDirection="column">
        {header(repo)}

        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            {badge('state', line.isWorking ? 'blue' : 'slate', line.state)}
            <Text color={palette.muted} wrap="truncate-end">
              {fit(` ${line.detail}`, width - line.state.length - 2)}
            </Text>
          </Box>
          {runningShown.map(running =>
            spread(
              `run:${running.id}`,
              <Box flexDirection="row">
                <Text color={palette.chips.blue.accent}>{`▸ ${toolName(running.tool)} `}</Text>
                <Text color={palette.text} wrap="truncate-end">
                  {running.label}
                </Text>
              </Box>,
              formatDuration(now - running.startedAt),
            ),
          )}
          {doing.running.length > RUNNING_SHOWN && <Text color={palette.muted}>{`  + ${doing.running.length - RUNNING_SHOWN} more`}</Text>}
          {sessionFacts !== '' && (
            <Text color={palette.muted} wrap="truncate-end">
              {sessionFacts}
            </Text>
          )}
          {alarms.length === 0 && <Text color={palette.ok}>● all clear</Text>}
        </Box>

        {alarms.length > 0 && (
          <Box flexDirection="column">
            {heading('Signals', String(alarms.length))}
            {alarms.map(signal => (
              <Text key={`s:${signal.key}`} color={toneColor(SIGNAL_TONE[signal.level])} wrap="wrap">
                {`${SIGNAL_MARK[signal.level]} ${signal.text}`}
              </Text>
            ))}
          </Box>
        )}
        {notes.map(signal => (
          <Text key={`n:${signal.key}`} color={palette.muted} wrap="truncate-end">
            {fit(`${SIGNAL_MARK[signal.level]} ${signal.text}`, width)}
          </Text>
        ))}

        {rows.length > 0 && (
          <Box flexDirection="column">
            {heading('Checks')}
            {rows.map(check =>
              spread(
                `c:${check.kind}`,
                <Box flexDirection="row">
                  {badge(`b:${check.kind}`, CHECK_TONE[check.state] ?? 'slate', STATE_BADGE[check.state].padEnd(5))}
                  <Text color={palette.muted}>{` ${check.kind.padEnd(6)}`}</Text>
                  <Text color={palette.text} wrap="truncate-end">
                    {check.detail}
                  </Text>
                </Box>,
                check.age,
              ),
            )}
          </Box>
        )}

        {turn !== null && (
          <Box flexDirection="column">
            {heading('Last turn', recapSummary(turn, now)[0] ?? '')}
            <Text color={palette.muted} wrap="truncate-end">
              {recapSummary(turn, now).slice(1).join(' · ')}
            </Text>
            {turn.lines.map((recapLine, index) => (
              <Text key={`t:${index}`} color={palette.text} wrap="wrap">
                {recapLine}
              </Text>
            ))}
          </Box>
        )}

        {changes.length > 0 && (
          <Box flexDirection="column">
            {heading('Changes', stat ?? '')}
            <Text color={palette.muted}>{fit(changeSummary(view), width)}</Text>
            {changes.slice(0, CHANGED_FILES_SHOWN).map(file =>
              spread(
                `f:${file.path}`,
                <Box flexDirection="row">
                  <Text color={toneColor(FILE_CODE_TONE[file.code] ?? null)} weight="bold">
                    {file.code.padEnd(4)}
                  </Text>
                  <Text color={palette.text} wrap="truncate-start">
                    {file.path}
                  </Text>
                </Box>,
                file.edits === 0 ? '' : `×${file.edits}`,
              ),
            )}
            {changes.length > CHANGED_FILES_SHOWN && <Text color={palette.muted}>{`  + ${changes.length - CHANGED_FILES_SHOWN} more`}</Text>}
          </Box>
        )}

        {facts?.costUsd !== null && facts?.costUsd !== undefined && (
          <Box flexDirection="column">
            {heading('Cost', formatUsd(facts.costUsd))}
            {costParts.length > 0 && (
              <Box flexDirection="row" flexWrap="wrap">
                {costParts.map((part, index) => (
                  <Text key={`cost-part:${index}`} color={palette.muted}>
                    {index === 0 ? part : ` · ${part}`}
                  </Text>
                ))}
              </Box>
            )}
            {ledger.turns.length > 1 && (
              <Box flexDirection="row">
                <Text color={palette.chips.purple.accent}>{sparkline(ledger.turns.slice(-Math.min(PANE_SPARK_TURNS, width - 16)).map(cost => cost.usd))}</Text>
                <Text color={palette.muted}>{` last ${Math.min(ledger.turns.length, PANE_SPARK_TURNS, width - 16)} turns`}</Text>
              </Box>
            )}
            {dearestTurns(ledger.turns, DEAREST_TURNS_SHOWN).map(cost =>
              spread(
                `cost:${cost.endedAt}`,
                <Box flexDirection="row">
                  <Text color={cost.endedAt === ledger.turns[ledger.turns.length - 1]?.endedAt ? palette.accent : palette.text} weight="bold">
                    {formatUsd(cost.usd).padStart(6)}
                  </Text>
                  <Text color={palette.text} wrap="truncate-end">
                    {` ${cost.prompt}`}
                  </Text>
                </Box>,
                formatDuration(cost.durationMs),
              ),
            )}
          </Box>
        )}

        {repo.isRepo && (
          <Box flexDirection="column">
            {heading('Git')}
            {row('branch', repo.branch ?? 'HEAD (detached)', repo.branch === null ? palette.warning : palette.text)}
            {row('up', `${repo.upstream ?? 'none'}${repo.upstreamStatus === 'ok' ? '' : `  (${repo.upstreamStatus})`}`, toneColor(UPSTREAM_TONE[repo.upstreamStatus]))}
            {repo.pushTarget !== null && row('push', repo.pushTarget, palette.warning)}
            {row('sync', `${syncText(repo)} · ${repo.dirty === 0 ? 'clean' : `${repo.dirty} changed`}`, isInSync(repo) ? palette.ok : palette.text)}
            {pullLine !== null && row('pr', pullLine.text, toneColor(pullLine.tone))}
            {pullShown !== null && (
              <Text color={palette.muted} wrap="truncate-end">
                {`      ${pullShown.title}`}
              </Text>
            )}
            {otherWorktrees.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color={palette.muted}>{`worktrees (${otherWorktrees.length})`}</Text>
                {otherWorktrees.map(worktree =>
                  spread(
                    `w:${worktree.path}`,
                    <Box flexDirection="row">
                      <Text color={toneColor(UPSTREAM_TONE[worktree.status])}>{'● '}</Text>
                      <Text color={palette.text} wrap="truncate-end">
                        {worktree.name}
                      </Text>
                    </Box>,
                    worktree.branch === null ? 'detached' : worktree.status,
                    toneColor(worktree.branch === null ? 'yellow' : UPSTREAM_TONE[worktree.status]),
                  ),
                )}
              </Box>
            )}
            {repo.commits.length > 0 && (
              <Box marginTop={1}>
                <Text color={palette.muted}>commits</Text>
              </Box>
            )}
            {repo.commits.length === 0 && <Text color={palette.muted}>no commits yet</Text>}
            {repo.commits.map(commit => (
              <Box key={`k:${commit.hash}`}>
                <Text color={palette.hash}>{commit.hash.slice(0, 7)} </Text>
                <Text color={palette.muted}>{shortAge(commit.age).padEnd(3)} </Text>
                <Text color={palette.text} wrap="truncate-end">
                  {fit(commit.subject, width - 12)}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        {!repo.isRepo && (
          <Box marginTop={1}>
            <Text color={palette.muted}>not a git repository</Text>
          </Box>
        )}

        {showsPrior && (
          <Box flexDirection="column">
            {heading('Previous session')}
            <Text color={palette.muted}>{fit(recapSummary(prior, now).join(' · '), width)}</Text>
            {prior.lines.map((recapLine, index) => (
              <Text key={`p:${index}`} color={palette.text} wrap="wrap">
                {recapLine}
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1}>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refreshGit($, commitCount, isPrEnabled)} />
          <Text> </Text>
          <Button key="hide" label="Hide" hotkey="h" role="dismiss" onPress={() => $.ui.close({ id: PANE_ID })} />
        </Box>
      </Box>,
    )
  })
}
