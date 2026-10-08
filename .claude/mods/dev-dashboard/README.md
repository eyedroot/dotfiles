# dev-dashboard

A Claude Code mod (function-hooks plugin) that docks a pane beside the transcript with the facts a developer keeps checking by hand:

- project name and the `owner/name` of `origin`
- the session's model, turn count and context fill
- current branch, the worktree it lives in, and the upstream branch with a verdict: `ok` when the upstream name is the branch's own, `mismatch` when it points elsewhere (the state that makes `git push` refuse under `push.default=simple`), `gone` when the remote branch was deleted, `none` when unset
- ahead/behind counts against that upstream and the number of changed files
- the other worktrees of the repository, listed one per entry with its own upstream verdict
- a recap of the last turn: how long it took, how many tools ran, the answer's first lines, and the same for the last session that ran in this repository
- recent commits

## Loading

The pane opens by itself when the terminal runs the fullscreen layout and is at least 144 columns wide. `/dashboard` opens or closes it at any width. `r` refreshes, `h` hides.

Colors follow Claude Code's `theme` setting, a custom theme counting as the preset it is based on: a light theme gets the Rose Pine Dawn overlay with an iris accent, a dark theme the Catppuccin Mocha mantle with a mauve accent, each matching the Ghostty theme of that mode. The `theme` option forces one.

For a session started from a terminal, name the folder in `CLAUDE_CODE_PLUGIN_DIRS`:

```sh
export CLAUDE_CODE_PLUGIN_DIRS="$HOME/.claude/mods/dev-dashboard"
```

For sessions the desktop app starts, put the same key in the `env` block of `~/.claude/settings.json`. Either way the folder is watched: a saved edit reloads the module.

Options live under `/config` (or `pluginConfigs.dev-dashboard` in settings): `banner`, `commits`, `autoOpen`, `pollSeconds`, `recapLines`, `theme`.

`art: flower` draws a six-petal flower (14 by 14 pixels, two per cell with `▀`) on the terminal surface, beside the banner and project name when the pane is wide enough for both and above them otherwise; its black surround takes the pane's background color. The pixels live in `hooks/flower.ts`, generated from a photo with pure-Python PNG decoding and box downsampling.

The banner is drawn with a built-in 3-row block font (letters, digits, `-`, `.`): 3 by 5 pixel glyphs, two cell columns per pixel so the stems are a full cell wide. Where that form does not fit, the glyphs fall back to one column per pixel; a text still wider than the pane is left out rather than cut.

## Checking

```sh
claude plugin validate ~/.claude/mods/dev-dashboard
tsc -p ~/.claude/mods/dev-dashboard        # after the engine has loaded it once
claude plugin test ~/.claude/mods/dev-dashboard
```
