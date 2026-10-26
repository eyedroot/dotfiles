# dev-dashboard

A Claude Code mod (function-hooks plugin) that docks a pane beside the transcript with the facts a developer keeps checking by hand:

- project name and the `owner/name` of `origin`
- the session's model, turn count and context fill
- current branch, the worktree it lives in, and the upstream branch with a verdict: `ok` when the upstream name is the branch's own, `mismatch` when it points elsewhere (the state that makes `git push` refuse under `push.default=simple`), `gone` when the remote branch was deleted, `none` when unset
- ahead/behind counts against that upstream and the number of changed files
- the other worktrees of the repository, listed one per entry with its own upstream verdict
- a recap of the last turn: how long it took, how many tools ran, the answer's first lines, and the same for the last session that ran in this repository
- recent commits

## The band above the prompt

On the terminal the mod also draws one row above the prompt in the status line's look (`~/.claude/statusline.sh`): the same `■□` ten-cell bars, ` │ ` separators and colors, taken from `BAND_PALETTES` in `hooks/palette.ts`. Each rate-limit window shows its bar with a `▣` where the window's time has got to, the percentage and the reset as clock time (`→ 2:19pm`, with the weekday when it is more than a day away); the context shows its fill, tokens used and what the last response added; `cost` shows the session's cost so far (the `/cost` total), from three turns on a sparkline of the last twelve turns' costs (each bar scaled to the dearest of them), and `1h` with what the turns of the last hour cost. A rate-limit bar steps teal, yellow, orange and red with its level as the status line's does, and a window used faster than it refills steps up early. The band takes the place of the usage-bar mod's band on the terminal (its `/usage` and `/budget` commands still work); `band: false` hands the row back to it.

## Loading

The pane opens by itself when the terminal runs the fullscreen layout and is at least 144 columns wide. `/dashboard` opens or closes it at any width. `r` refreshes, `h` hides.

## Two drawings

The desktop app's sidebar does not say which worktree a session runs in, so on every surface the pane leads with the worktree name (or the project name at the main checkout), its path with `$HOME` as `~`, the project and the branch.

On the desktop app, VS Code and mobile the pane is drawn as SVG in the style of the usage-bar mod. One full-width card carries everything about where the session is, each fact once: the worktree (or project) name, its path, the project when in a worktree, the branch with the changed-file count beside it, and the upstream with its verdict and note. Below it come the other worktrees and the commits, then the context card and the turn recaps. A branch, upstream or path too long for a line wraps onto a second one, breaking after a `/`, `_`, `-` or `.`, instead of being cut. Body text is 12 CSS pixels, values 13 and the name 22, close to the host's own pane text. The SVG restyles itself through `prefers-color-scheme`, and its tints are translucent over the host's own pane background, so the pane follows the app's light or dark appearance without reading a setting. Cards are sized from the pane's cell count at about 6.2 CSS pixels per cell and wrap to one, two or three columns.

In the terminal, where there is no SVG, colors follow Claude Code's `theme` setting, a custom theme counting as the preset it is based on: a light theme gets PhpStorm's Rider Melon tool-window gray with a keyword-blue accent, matching the light Ghostty theme; a dark theme takes the colors of the herdr sidebar beside it (`~/.config/herdr/config.toml`): the Catppuccin Mocha mantle, the wine-rose accent `#cc6480`, the rose-shifted grays and herdr's sage, yellow and red state colors. When one side's colors change, change the other's with it. The `theme` option forces one. Under the header a row of tinted chips carries the context fill, the branch and the upstream verdict; the sections below keep the label-and-value rows.

For a session started from a terminal, name the folder in `CLAUDE_CODE_PLUGIN_DIRS`:

```sh
export CLAUDE_CODE_PLUGIN_DIRS="$HOME/.claude/mods/dev-dashboard"
```

For sessions the desktop app starts, put the same key in the `env` block of `~/.claude/settings.json`. Either way the folder is watched: a saved edit reloads the module.

Options live under `/config` (or `pluginConfigs.dev-dashboard` in settings): `banner`, `commits`, `autoOpen`, `band`, `pollSeconds`, `recapLines`, `theme`.

`art: flower` draws a six-petal flower (14 by 14 pixels, two per cell with `▀`) on the terminal surface, beside the banner and worktree name when the pane is wide enough for both and above them otherwise; its black surround takes the pane's background color. The pixels live in `hooks/flower.ts`, generated from a photo with pure-Python PNG decoding and box downsampling.

The banner is drawn with a built-in 3-row block font (letters, digits, `-`, `.`): 3 by 5 pixel glyphs, two cell columns per pixel so the stems are a full cell wide. Where that form does not fit, the glyphs fall back to one column per pixel; a text still wider than the pane is left out rather than cut.

## Checking

```sh
claude plugin validate ~/.claude/mods/dev-dashboard
tsc -p ~/.claude/mods/dev-dashboard        # after the engine has loaded it once
claude plugin test ~/.claude/mods/dev-dashboard
```
