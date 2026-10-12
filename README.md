# Dotfiles

Personal dotfiles managed with a bare Git repository.

## Contents

- `~/.config/ghostty/config` - Ghostty terminal configuration
- `~/.config/herdr/config.toml` - herdr workspace manager: theme, sidebar rows, tab-bar status (with `status.sh` agent/git reporter)
- `~/.config/karabiner/karabiner.json` - Karabiner-Elements key mappings (macOS)
- `~/Library/KeyBindings/DefaultKeyBinding.dict` - macOS key bindings (₩ → ` 변환)
- `~/.vimrc` - Vim configuration
- `~/.zshrc.shared` - Shared zsh aliases and settings (includes Starship init)
- `~/.config/starship.toml` - Starship prompt configuration (optional)
- `~/.dotfiles-install.sh` - Installation script
- `~/.Brewfile` - Homebrew packages (formulae & casks)
- `~/.agents/AGENTS.md` - Shared agent working principles (single source for Claude Code and Codex CLI)
- `~/.local/share/agent-skills/im-not-ai/` - Vendored copy of [im-not-ai](https://github.com/epoko77-ai/im-not-ai) (`git subtree`, squashed) that provides the `humanize-korean` skill for Claude Code and Codex. Shared instructions apply its writing principles to Korean replies and run the full skill for prose drafting and polishing.
- `~/.claude/settings.json.dotfiles` - Claude Code settings (model, plugins, status line)
- `~/.claude/CLAUDE.md` - Claude Code global memory (imports `~/.agents/AGENTS.md`)
- `~/.codex/AGENTS.md` - Codex CLI agent instructions (symlink to `~/.agents/AGENTS.md`)
- `~/.codex/config.toml.dotfiles` - Codex CLI config template (model, MCP servers, plugins)
- `~/.codex/skills/confluence-page-editing/` - Shared skill for editing Confluence pages through the Atlassian MCP without losing highlights, underlines, column widths, or captions (reads and writes ADF, verifies after upload). Claude Code loads it through the tracked symlink `~/.claude/skills/confluence-page-editing -> ../../.codex/skills/confluence-page-editing`; a new shared skill needs the same pair committed together
- `~/.tmux.conf` - tmux configuration (Catppuccin Mocha theme, TPM)
- `~/.config/intelephense/settings.json` - Intelephense PHP LSP settings
- `~/.config/opencode/opencode.json` - opencode CLI configuration (Ollama provider)
- `~/.config/macos/defaults.sh` - macOS system defaults (Dock, Finder, keyboard, etc.)
- `~/.local/bin/morning-update` - Daily update routine (Homebrew, Node.js latest LTS via nvm, Codex CLI, npm globals, and other developer tools)
- `~/.local/bin/bw-ssh-reset.sh` - Bitwarden SSH agent reset (macOS sleep/wake recovery)
- `~/.local/bin/bw-diagnose.sh` - Bitwarden SSH agent diagnostic report
- `~/.local/bin/ssh-keygen-bw` - SSH commit-signing wrapper for GUI apps (Fork etc.); register once with `git config --global gpg.ssh.program ~/.local/bin/ssh-keygen-bw`
- `~/.hammerspoon/init.lua` - Hammerspoon (macOS automation) global hotkeys
- `~/CLAUDE.md` - Claude Code instructions
- `~/.local/bin/start-remote-sim-view.sh` - Start a Tailscale-accessible iOS Simulator viewer
- `~/.local/bin/serve-sim-viewer.js` - Local MJPEG wrapper for `serve-sim`
- `~/Library/LaunchAgents/com.eyedroot.serve-sim-viewer.plist` - Keeps the simulator viewer running

The upstream repository is vendored into `$HOME/.local/share/agent-skills/im-not-ai` with `git subtree --squash`, so a plain checkout of the dotfiles already contains the skill. Its tool-specific entries are tracked as relative symlinks: `~/.claude/skills/{humanize,humanize-korean,humanize-redo,humanize-scan}`, `~/.claude/agents/{humanize-diagnostician,humanize-finalizer,humanize-monolith,korean-ai-tell-taxonomist}.md`, and `~/.codex/skills/humanize-korean`. The vendored revision is recorded in the `git-subtree-split` trailer of the latest squash commit. To update, review the upstream changes and run:

```bash
dotfiles subtree pull --prefix=.local/share/agent-skills/im-not-ai https://github.com/epoko77-ai/im-not-ai.git main --squash
```

Explicit invocation remains available as `/humanize-korean` in Claude Code and `$humanize-korean` in Codex.

Interactive bash and zsh sessions start a background check that compares the vendored revision with upstream `main`. The check does not pull or install updates. Its result is stored in `${XDG_CACHE_HOME:-$HOME/.cache}/humanize-korean/status.json`; an update or failed-check notice from the preceding check is shown at the next shell startup. Non-interactive shells skip the check. Run `python3 "$HOME/.agents/check-humanize-korean.py"` for a foreground check. Git and HTTP operations each have a five-second timeout.

Interactive bash and zsh sessions display only the flower from the Claude Code dev-dashboard mod as their startup artwork. `$HOME/.agents/shell-flower.py` reads the mod's `hooks/flower.ts` pixel data and renders it with terminal colors; it does not collect system information. Non-interactive sessions skip the artwork.

## Installation

### One-line Install

```bash
curl -fsSL https://raw.githubusercontent.com/eyedroot/dotfiles/main/.dotfiles-install.sh | bash
```

The install script will automatically:
- Check and install dependencies (git, zsh, vim)
- Detect your package manager (brew, apt, dnf, yum, pacman)
- Install Homebrew on macOS if needed
- Backup existing config files
- Clone and checkout dotfiles
- Install oh-my-zsh plugins (zsh-autosuggestions) and Starship prompt
- Install TPM (Tmux Plugin Manager)
- Check Karabiner-Elements installation (macOS)
- Set zsh as default shell
- Optionally install Homebrew packages from Brewfile
- Optionally apply macOS system defaults (Dock, Finder, keyboard, etc.)

### Supported Systems

| OS | Package Manager |
|----|-----------------|
| macOS | Homebrew |
| Ubuntu/Debian | apt |
| Fedora | dnf |
| CentOS/RHEL | yum |
| Arch Linux | pacman |

### Manual Install

```bash
# Clone bare repository
git clone --bare git@github.com:eyedroot/dotfiles.git $HOME/.dotfiles

# Define alias
alias dotfiles='git --git-dir=$HOME/.dotfiles --work-tree=$HOME'

# Checkout files
dotfiles checkout
dotfiles config status.showUntrackedFiles no

# Add to .zshrc
echo '[ -f "$HOME/.zshrc.shared" ] && source "$HOME/.zshrc.shared"' >> ~/.zshrc
echo '[ -f "$HOME/.zshrc.secrets" ] && source "$HOME/.zshrc.secrets"' >> ~/.zshrc
```

## Post-Installation

1. **Edit `~/.zshrc.secrets`** for machine-specific settings:
   ```bash
   # API Keys
   export OPENAI_API_KEY="your-key-here"

   # Local aliases
   alias myalias='command'
   ```

2. **Apply changes:**
   ```bash
   source ~/.zshrc
   ```

3. **Configure Starship** (optional):
   ```bash
   mkdir -p ~/.config && starship preset pure-preset -o ~/.config/starship.toml
   ```

4. **Install tmux plugins** (inside tmux session):
   ```bash
   # Start tmux, then press: prefix + I (capital I)
   # This installs all plugins defined in .tmux.conf (Catppuccin, battery, cpu, etc.)
   ```

5. **Intelephense 라이센스 등록** (PHP 개발 시):
   ```bash
   # 라이센스 키를 파일에 입력
   echo "your-license-key" > ~/.config/intelephense_license.txt
   ```

6. **Apply Claude Code settings** (if skipped during install):
   ```bash
   cp ~/.claude/settings.json.dotfiles ~/.claude/settings.json
   ```

7. **Install optional apps** (macOS):
   ```bash
   brew install --cask karabiner-elements  # Keyboard customization
   brew bundle --file=~/.Brewfile          # All packages
   ```

6. **Start remote iOS Simulator viewer** (macOS, optional):
   ```bash
   ~/.local/bin/start-remote-sim-view.sh
   ```

   Requirements:
   - Tailscale must be installed, logged in, and Serve enabled for the tailnet.
   - Xcode Simulator runtime must include the default device, or pass a simulator name:
     `~/.local/bin/start-remote-sim-view.sh "iPhone 17 Pro (26.5)"`.
   - `serve-sim` is used if installed globally; otherwise the script falls back to `npx --yes serve-sim@latest`.

## Usage

```bash
# Check status
dotfiles status

# Add a file
dotfiles add ~/.config/some/config

# Commit changes
dotfiles commit -m "Add config"

# Push to remote
dotfiles push
```

## File Structure

| File | Tracked | Purpose |
|------|---------|---------|
| `~/.zshrc.shared` | Yes | Shared aliases, safe to sync |
| `~/.zshrc.secrets` | No | API keys, machine-specific settings |
| `~/.zshrc` | No | Main shell config, machine-specific |

## License

MIT
