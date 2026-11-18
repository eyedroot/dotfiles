import type { EngineInterface } from 'claude-code'

export type AppEntry = {
  app: string
  alias: string | null
  image?: string | null
  dev?: string
  stage?: string
  prod?: string
  jp?: string
  note?: string
}

export type RepoEntry = {
  folder: string
  alias: string | null
  image?: string | null
  sonar?: string
  helm?: string
  dev?: string
  stage?: string
  prod?: string
  jp?: string
  preprod?: string
  note?: string
  apps?: AppEntry[]
}

export type RepoMap = {
  root: string
  updated?: string
  clusters?: Record<string, string>
  repos: RepoEntry[]
}

export type Match = { entry: RepoEntry; app?: AppEntry }

const TOKEN = /^[a-z0-9][a-z0-9_-]*$/i

export function parseRepoMap(text: string): RepoMap {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('대응표가 객체가 아니다')
  const map = parsed as Partial<RepoMap>
  if (typeof map.root !== 'string' || !Array.isArray(map.repos)) throw new Error('대응표에 root나 repos가 없다')

  return map as RepoMap
}

export function expandHome(path: string, home: string | undefined): string {
  if (path === '~' || path.startsWith('~/')) return (home ?? '') + path.slice(1)

  return path
}

export function matchKey(m: Match): string {
  return m.app ? `${m.entry.folder}/${m.app.app}` : m.entry.folder
}

// A name counts only as a whole token: `kollus-vod-console` inside
// `kollus-vod-console-v2-backend` or after `catenoidhub/` (the image of another
// app that happens to carry this folder's name) is not a mention.
function mentionPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`(?<![A-Za-z0-9_-])(?<!catenoidhub/)${escaped}(?![A-Za-z0-9_-])`)
}

type Candidate = { name: string; match: Match }

function candidates(map: RepoMap): Candidate[] {
  const list: Candidate[] = []
  for (const entry of map.repos) {
    list.push({ name: entry.folder, match: { entry } })
    if (entry.alias && TOKEN.test(entry.alias) && entry.alias !== entry.folder) {
      list.push({ name: entry.alias, match: { entry } })
    }
    for (const app of entry.apps ?? []) {
      list.push({ name: app.app, match: { entry, app } })
      if (app.alias && TOKEN.test(app.alias) && app.alias !== app.app) {
        list.push({ name: app.alias, match: { entry, app } })
      }
    }
  }

  return list
}

export function findMentions(text: string, map: RepoMap): Match[] {
  if (!text) return []
  const found: { at: number; match: Match }[] = []
  const seen = new Set<string>()
  for (const { name, match } of candidates(map)) {
    const key = matchKey(match)
    if (seen.has(key)) continue
    const at = text.search(mentionPattern(name))
    if (at === -1) continue
    seen.add(key)
    found.push({ at, match })
  }
  found.sort((a, b) => a.at - b.at)

  return found.map(f => f.match)
}

export function lookup(query: string, map: RepoMap): Match[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: Match[] = []
  for (const entry of map.repos) {
    const names = [entry.folder, entry.alias ?? ''].map(s => s.toLowerCase())
    if (names.some(n => n === q || n.includes(q))) hits.push({ entry })
    for (const app of entry.apps ?? []) {
      const appNames = [app.app, app.alias ?? ''].map(s => s.toLowerCase())
      if (appNames.some(n => n === q || n.includes(q))) hits.push({ entry, app })
    }
  }

  return hits
}

export function repoAt(cwd: string, rootAbs: string, map: RepoMap): Match | null {
  const root = rootAbs.replace(/\/+$/, '')
  if (!root || !(cwd === root || cwd.startsWith(root + '/'))) return null
  const folder = cwd.slice(root.length + 1).split('/')[0]
  if (!folder) return null
  const entry = map.repos.find(r => r.folder === folder)

  return entry ? { entry } : null
}

function field(label: string, value: string | null | undefined): string {
  return value ? ` · ${label} ${value}` : ''
}

export function head(m: Match): string {
  const { entry, app } = m
  if (app) return app.alias ? `${entry.folder} apps/${app.app}[${app.alias}]` : `${entry.folder} apps/${app.app}`

  return entry.alias ? `${entry.folder}[${entry.alias}]` : entry.folder
}

// One line, for a toast and the line beneath an answer: the hosts a person
// reaches for first. JP and pre-prod wait in the card.
export function formatTip(m: Match): string {
  const { entry, app } = m
  const it = app ?? entry

  return head(m) + field('image', it.image) + field('dev', it.dev) + field('stage', it.stage) + field('prod', it.prod) + (it.note ? ` · ${it.note}` : '')
}

// One short line per repo, for the index `/catenoid` prints without a name.
export function formatIndexLine(m: Match): string {
  const { entry, app } = m
  const it = app ?? entry
  const name = app ? `${entry.folder} apps/${app.app}` : entry.folder
  const alias = it.alias ? ` → ${it.alias}` : ''

  return name + alias + (it.image ? ` · ${it.image}` : '')
}

export type CardRow = { label: string; value: string; color: 'suggestion' | 'success' | 'warning' | 'error' | 'subtle' | 'text' }

// The rows of the colored card drawn above the prompt, one per labelled value.
export function cardRows(m: Match): CardRow[] {
  const { entry, app } = m
  const it = app ?? entry
  const rows: [string, string | null | undefined, CardRow['color']][] = [
    ['image', it.image, 'suggestion'],
    ['dev', it.dev, 'success'],
    ['stage', it.stage, 'warning'],
    ['prod', it.prod, 'error'],
    ['JP', it.jp, 'text'],
    ['pre-prod', app ? undefined : entry.preprod, 'text'],
    ['주의', it.note, 'subtle'],
  ]

  return rows.flatMap(([label, value, color]) => (value ? [{ label, value, color }] : []))
}

// Several labelled lines, for `/catenoid <name>`.
export function formatCard(m: Match): string {
  const { entry, app } = m
  const it = app ?? entry
  const rows: [string, string | null | undefined][] = [
    ['image', it.image],
    ['dev', it.dev],
    ['stage', it.stage],
    ['prod', it.prod],
    ['JP', it.jp],
    ['pre-prod', app ? undefined : entry.preprod],
    ['sonar', app ? undefined : entry.sonar],
    ['helm', app ? undefined : entry.helm],
    ['주의', it.note],
  ]
  const lines = [head(m), ...rows.filter(([, v]) => v).map(([k, v]) => `  ${k}  ${v}`)]

  return lines.join('\n')
}

export function listLines(map: RepoMap): string[] {
  const deployed: string[] = []
  const idle: string[] = []
  for (const entry of map.repos) {
    const apps = entry.apps ?? []
    if (entry.alias || entry.image || apps.length > 0) deployed.push(formatIndexLine({ entry }))
    else idle.push(entry.folder)
    for (const app of apps) deployed.push('  ' + formatIndexLine({ entry, app }))
  }
  if (idle.length > 0) deployed.push(`배포 없음: ${idle.join(', ')}`)

  return deployed
}

export type Loaded = { map: RepoMap | null; rootAbs: string; dataPath: string; error: string }

export const NOT_LOADED: Loaded = { map: null, rootAbs: '', dataPath: '', error: '아직 읽지 않음' }

export async function loadRepoMap($: EngineInterface, dataPathRaw: string): Promise<Loaded> {
  const home = await $.env.get('HOME')
  const dataPath = expandHome(dataPathRaw, home)
  try {
    const map = parseRepoMap(await $.fs.read(dataPath))

    return { map, rootAbs: expandHome(map.root, home), dataPath, error: '' }
  } catch (error) {
    return { map: null, rootAbs: '', dataPath, error: error instanceof Error ? error.message : String(error) }
  }
}
