import type { Commit, GitSnapshot, UpstreamStatus, WorktreeRow } from '../types'

export type GitRun = (args: readonly string[]) => Promise<{ exitCode: number; stdout: string }>

type RefRow = {
  branch: string
  upstream: string | null
  remoteRef: string
  track: string
  push: string | null
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')

  return trimmed.slice(trimmed.lastIndexOf('/') + 1)
}

export function parseRemoteName(remoteUrl: string | null): string | null {
  if (remoteUrl === null || remoteUrl === '') return null

  const match = /([^/:]+\/[^/:]+?)(?:\.git)?\/?$/.exec(remoteUrl)

  return match?.[1] ?? null
}

export function judgeUpstream(branch: string | null, remoteRef: string, track: string): UpstreamStatus {
  if (branch === null || remoteRef === '') return 'none'
  if (track.includes('gone')) return 'gone'

  return remoteRef === `refs/heads/${branch}` ? 'ok' : 'mismatch'
}

export function parseTrack(track: string): { ahead: number; behind: number } {
  const ahead = /ahead (\d+)/.exec(track)
  const behind = /behind (\d+)/.exec(track)

  return { ahead: Number(ahead?.[1] ?? 0), behind: Number(behind?.[1] ?? 0) }
}

export function parseCommits(stdout: string): Commit[] {
  return stdout
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const [hash = '', age = '', ...subject] = line.split('\t')

      return { hash, age, subject: subject.join('\t') }
    })
}

export function parseRefs(stdout: string): Map<string, RefRow> {
  const rows = new Map<string, RefRow>()

  for (const line of stdout.split('\n')) {
    if (line === '') continue

    const [branch = '', upstream = '', remoteRef = '', track = '', push = ''] = line.split('\t')

    rows.set(branch, {
      branch,
      upstream: upstream === '' ? null : upstream,
      remoteRef,
      track,
      push: push === '' ? null : push,
    })
  }

  return rows
}

export function parseWorktrees(stdout: string, refs: Map<string, RefRow>, currentRoot: string | null): WorktreeRow[] {
  const rows: WorktreeRow[] = []
  let path: string | null = null
  let branch: string | null = null

  const flush = () => {
    if (path === null) return

    const ref = branch === null ? undefined : refs.get(branch)

    rows.push({
      path,
      name: basename(path),
      branch,
      upstream: ref?.upstream ?? null,
      status: judgeUpstream(branch, ref?.remoteRef ?? '', ref?.track ?? ''),
      isCurrent: path === currentRoot,
    })
    path = null
    branch = null
  }

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      path = line.slice('worktree '.length)
    } else if (line.startsWith('branch refs/heads/')) {
      branch = line.slice('branch refs/heads/'.length)
    } else if (line === '') {
      flush()
    }
  }
  flush()

  return rows
}

export async function readGitSnapshot(run: GitRun, cwd: string, commitCount: number, readAt: number): Promise<GitSnapshot> {
  const empty: GitSnapshot = {
    isRepo: false,
    cwd,
    mainRoot: null,
    projectName: basename(cwd),
    remoteName: null,
    branch: null,
    worktree: null,
    upstream: null,
    upstreamStatus: 'none',
    pushTarget: null,
    ahead: 0,
    behind: 0,
    dirty: 0,
    commits: [],
    worktrees: [],
    readAt,
  }

  const layout = await run(['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir', '--abbrev-ref', 'HEAD'])
  if (layout.exitCode !== 0) return empty

  const [toplevel = '', commonDir = '', head = ''] = layout.stdout.split('\n')
  const mainRoot = commonDir.endsWith('/.git') ? commonDir.slice(0, -'/.git'.length) : toplevel
  const branch = head === '' || head === 'HEAD' ? null : head

  const [remote, refs, status, log, worktrees] = await Promise.all([
    run(['config', '--get', 'remote.origin.url']),
    run(['for-each-ref', '--format=%(refname:short)%09%(upstream:short)%09%(upstream:remoteref)%09%(upstream:track)%09%(push:short)', 'refs/heads/']),
    run(['status', '--porcelain']),
    run(['log', `--format=%h%x09%ar%x09%s`, '-n', String(commitCount)]),
    run(['worktree', 'list', '--porcelain']),
  ])

  const refRows = parseRefs(refs.stdout)
  const current = branch === null ? undefined : refRows.get(branch)
  const upstream = current?.upstream ?? null
  const { ahead, behind } = parseTrack(current?.track ?? '')

  return {
    isRepo: true,
    cwd,
    mainRoot,
    projectName: basename(mainRoot),
    remoteName: remote.exitCode === 0 ? parseRemoteName(remote.stdout.trim()) : null,
    branch,
    worktree: toplevel === mainRoot ? null : basename(toplevel),
    upstream,
    upstreamStatus: judgeUpstream(branch, current?.remoteRef ?? '', current?.track ?? ''),
    pushTarget: current?.push !== null && current?.push !== undefined && current.push !== upstream ? current.push : null,
    ahead,
    behind,
    dirty: status.stdout.split('\n').filter(line => line !== '').length,
    commits: log.exitCode === 0 ? parseCommits(log.stdout) : [],
    worktrees: parseWorktrees(worktrees.stdout, refRows, toplevel),
    readAt,
  }
}
