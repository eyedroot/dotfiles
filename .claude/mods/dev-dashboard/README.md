# dev-dashboard

A Claude Code mod (function-hooks plugin) that docks a pane beside the transcript and draws a usage band above the prompt. The pane shows what the status line and the transcript do not: the issue being worked on, what is running right now, what needs action, and whether the code was verified after the last edit. Context fill and rate limits live in the band; the pane names them only when they cross a threshold.

From top to bottom:

- **Issue**: when the branch or worktree name carries a Jira key (`feature/NX-454_video_page`), the issue's key, status, summary, type, assignee and parent, then the description's checklist (`- [ ]` lines) as a progress bar with its open items; an issue without a checklist shows the first lines of its description. Under it the place: the project with `↳ worktree` beside it, `⑃ branch`, the `owner/name` of `origin` and the path with `$HOME` as `~`. A branch without a key leads with the place instead.
- **Now**: `WORKING` with the turn's elapsed time and tool count, and each main-loop tool still running with its own elapsed time; `IDLE` with the last turn's length otherwise. Under them the session: model, turns, tool calls and how long it has run. The elapsed times tick once a second only while a turn runs.
- **Signals**: only facts that ask for an action, errors first. When there are none the pane says `all clear`. Raised for a merge, rebase, cherry-pick or revert in progress and conflicted files; an upstream that makes `git push` refuse (`mismatch`) or was deleted (`gone`); commits behind the upstream; uncommitted changes or local commits on a shared branch (`protectedBranches`); a failing test, type or lint run; a check that passed before files were edited again (stale); the PR's failing checks, conflicts with its base or requested changes; a turn that ended on an API error or refusal; context at 70% and above; a rate-limit window at 75% and above. Unpushed commits and other worktrees whose upstream is gone show as dim notes.
- **Checks**: the last test, type, lint and build run seen in this session, read from Bash commands (phpunit, pest, jest, vitest, pytest, `go test`, tsc, phpstan, eslint, pint, `claude plugin validate`, `npm run build` and the like, also inside `docker exec`). A run fails on a non-zero exit or on a tally that reports failures, so `phpunit | tail` still counts as failed.
- **Last turn**: when it ended, how long it took, its tool count and output tokens, and the first `recapLines` lines of the answer.
- **Changes**: the uncommitted file count and `git diff --shortstat HEAD` size, then each file `git status` lists with its status (`M`, `new`, `D`, ...) and, for a file this session edited, how many times; files edited here that git no longer lists follow, marked `·`.
- **Cost**: the session's cost so far; today's total across every session (each session's running total is kept under its id in the mod's store, one key per day, a week kept) with the session count, the hourly rate and the average per turn; a sparkline of up to thirty turns; and the three dearest turns with the first line of their prompt and how long they took, the latest in the accent color. A turn's cost is the session total at its end minus the total at its start, so a subagent's spend counts toward the turn that ran it. The turns are kept for the session only.
- **Git**: the branch, its upstream with the verdict, a push target that differs from the upstream, ahead/behind and dirty state, the branch's PR (`#7 open · ✓5 ✕1 ◌2 · approved`) with its title, the other worktrees each with its upstream verdict, and the latest commits.
- **Previous session**: the recap of the last session that ran in this repository, until the first turn of this one.

The issue is read with the Atlassian connector's `getJiraIssue` (`mcp__claude_ai_Atlassian__getJiraIssue`) at session start, after each turn once it is five minutes old, and right after the model changes a Jira issue. The site comes from `jiraSite`, or else from `getAccessibleAtlassianResources` once, remembered in the mod's store. Auto mode's classifier gives no verdict for a call no request asked for, so the mod answers `tool.check` with an allow for these two read tools when, and only when, the call is its own (`next.origin.plugin`). The engine runs a plugin's hooks only for calls raised inside one of its hooks, so the reads start from hooks, never from a timer. While the connector is still connecting at session start the read is retried a few times.

The PR line comes from `gh pr view`, run at session start, every `prSeconds`, after a branch change and after a `git push` or `gh pr` command. It needs a `gh` account that can see the repository; where it cannot, or the branch has no PR, the line is left out.

## The band above the prompt

On the terminal one row in the status line's look (`~/.claude/statusline.sh`): the same `■□` ten-cell bars, ` │ ` separators and colors, taken from `BAND_PALETTES` in `hooks/palette.ts`. Each rate-limit window shows its bar with a `▣` where the window's time has got to, the percentage and the reset as clock time (`→ 2:19pm`, with the weekday when it is more than a day away); the context shows its fill, tokens used and what the last response added; `cost` shows the session's cost so far (the `/cost` total), a sparkline of the last twelve turns' costs (each bar scaled to the dearest of them) and the hourly rate. A rate-limit bar steps teal, yellow, orange and red with its level as the status line's does, and a window used faster than it refills steps up early; a percentage keeps the label color until its window or the context needs attention. The turn timer, tool count, session length and model are left out: the spinner, the pane and the status line already show them. The band takes the place of the usage-bar mod's band on the terminal (its `/usage` and `/budget` commands still work); `band: false` hands the row back to it. On other surfaces the band is left to usage-bar.

## Loading

The pane opens by itself when the terminal runs the fullscreen layout and is at least 144 columns wide. `/dashboard` opens or closes it at any width. `r` refreshes, `h` hides.

## Two drawings

On the desktop app, VS Code and mobile the pane is drawn as SVG in the style of the usage-bar mod: a full-width issue card, a full-width worktree card (the desktop sidebar does not say which worktree a session runs in), then cards for now, signals, checks, changes, git, the previous session and the commits. The SVG restyles itself through `prefers-color-scheme`, and its tints are translucent over the host's own pane background, so the pane follows the app's light or dark appearance without reading a setting. Cards are sized from the pane's cell count at about 6.2 CSS pixels per cell and wrap to one, two or three columns.

In the terminal, where there is no SVG, colors follow Claude Code's `theme` setting, a custom theme counting as the preset it is based on: a light theme gets PhpStorm's Rider Melon tool-window gray with a keyword-blue accent, matching the light Ghostty theme; a dark theme takes the colors of the herdr sidebar beside it (`~/.config/herdr/config.toml`): the Catppuccin Mocha mantle, the wine-rose accent `#cc6480`, the rose-shifted grays and herdr's sage, yellow and red state colors. When one side's colors change, change the other's with it. The `theme` option forces one. The issue's status, the state (`WORKING`, `IDLE`) and each check's result (`PASS`, `FAIL`, `STALE`, `STOP`) are drawn as tinted badges in the chip colors of the palette.

For a session started from a terminal, name the folder in `CLAUDE_CODE_PLUGIN_DIRS`:

```sh
export CLAUDE_CODE_PLUGIN_DIRS="$HOME/.claude/mods/dev-dashboard"
```

For sessions the desktop app starts, put the same key in the `env` block of `~/.claude/settings.json`. Either way the folder is watched: a saved edit reloads the module.

Options live under `/config` (or `pluginConfigs.dev-dashboard` in settings): `jira`, `jiraSite`, `commits`, `autoOpen`, `band`, `pollSeconds`, `pr`, `prSeconds`, `protectedBranches`, `recapLines`, `theme`.

## Checking

```sh
claude plugin validate ~/.claude/mods/dev-dashboard
tsc -p ~/.claude/mods/dev-dashboard        # after the engine has loaded it once
claude plugin test ~/.claude/mods/dev-dashboard
```
