# Claude Code Instructions for Dotfiles

This repository manages personal dotfiles using a bare Git repository.

> **Scope**: These instructions apply ONLY when working on dotfiles tracked by the `~/.dotfiles` bare repository. This file is picked up globally in every repository under the home directory — when working in any other repository, ignore it entirely (especially the commit message format below).

## Repository Structure

- Bare git repository: `~/.dotfiles`, work tree: `$HOME`
- Shared behavior, verification, and authorization rules: `~/.agents/AGENTS.md`, loaded through the agent's global instructions. The rules below specialize dotfiles maintenance.
- Full list of tracked files: run `dotfiles ls-tree -r --full-tree --name-only HEAD` (works from any directory; plain `ls-files` only lists files under the current directory)
- Verify the relevant files against Git, current configuration, and installation code. Treat the classification below as orientation, not proof of the current tracking state.

## Git Commands

Always use the `dotfiles` alias or full command:

```bash
# Using alias (defined in .zshrc.shared)
dotfiles status
dotfiles add <file>
dotfiles commit -m "message"
dotfiles push

# Or full command
git --git-dir=$HOME/.dotfiles --work-tree=$HOME <command>
```

## Guidelines for Modifying Dotfiles

### Adding New Config Files

1. Inspect Git status and the proposed file contents; confirm the file is portable and contains no secrets.
2. When committing is authorized, stage only the requested files: `dotfiles add <file>`.
3. Review the staged diff and run checks appropriate to the changed files.
4. Commit and push only when explicitly requested, using the commit message format below.

### File Classification

| Type | Location | Git Tracked | Examples |
|------|----------|-------------|----------|
| App configs | `~/.config/*`, `~/.vimrc` | Yes | ghostty, karabiner, vim, intelephense |
| Automation | `~/.hammerspoon/init.lua` | Yes | global hotkeys, macOS automation |
| Shell configs | `~/.zshrc.shared` | Yes | aliases, Starship init |
| Package lists | `~/.Brewfile` | Yes | brew formulae & casks |
| Agent principles | `~/.agents/AGENTS.md` | Yes | shared working principles (single source) |
| Claude Code | `~/.claude/{settings.json.dotfiles,CLAUDE.md}` | Yes | model, plugins, statusLine; CLAUDE.md imports `~/.agents/AGENTS.md` |
| Codex CLI | `~/.codex/{AGENTS.md,config.toml.dotfiles}` | Yes | AGENTS.md is a symlink to `~/.agents/AGENTS.md`; config template |
| Codex local | `~/.codex/config.toml` | No | machine-specific (trusted projects, hooks.state, marketplaces) |
| Codex state | `~/.codex/{auth.json,*.sqlite,sessions/,logs/}` | No | auth tokens, runtime state |
| Machine-specific | `~/.zshrc.secrets` | No | API keys, local paths |
| Main shell config | `~/.zshrc` | No | oh-my-zsh, machine-specific |
| Local permissions | `~/.claude/settings.local.json` | No | path-specific permissions |

### Important Rules

1. **Never track sensitive data**: API keys, tokens, passwords go in `.zshrc.secrets`
2. **Never track machine-specific paths**: Absolute paths like `/Users/username/...` go in `.zshrc.secrets`
3. **Use `$HOME` instead of `~` or absolute paths** in tracked files
4. **Validate the changed behavior**: Distinguish valid file syntax from successful application loading and observed runtime behavior. Do not report deployment or activation based only on a file edit.
5. **Test installation changes in isolation**: When `.dotfiles-install.sh` changes, check its syntax and test the affected steps in an isolated environment; do not rerun installation for unrelated configuration or instruction edits.

### Commit Message Format

```
<type>: <short description>

- Detail 1
- Detail 2
```

Types: `Add`, `Update`, `Fix`, `Remove`

## Installation Script Maintenance

When modifying `.dotfiles-install.sh`, inspect the affected steps in the script:

1. Maintain support for multiple package managers (brew, apt, dnf, yum, pacman)
2. Keep the dependency list updated: `DEPENDENCIES=(git zsh vim)`
3. Ensure idempotency (safe to run multiple times)
