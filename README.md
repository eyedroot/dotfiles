# Dotfiles

Personal dotfiles managed with a bare Git repository.

## Contents

- `~/.config/ghostty/config` - Ghostty terminal configuration
- `~/.config/herdr/config.toml` - herdr (tmux) tab shortcuts + theme
- `~/.config/karabiner/karabiner.json` - Karabiner-Elements key mappings (macOS)
- `~/Library/KeyBindings/DefaultKeyBinding.dict` - macOS key bindings (₩ → ` 변환)
- `~/.vimrc` - Vim configuration
- `~/.zshrc.shared` - Shared zsh aliases and settings (includes Starship init)
- `~/.config/starship.toml` - Starship prompt configuration (optional)
- `~/.dotfiles-install.sh` - Installation script
- `~/.Brewfile` - Homebrew packages (formulae & casks)
- `~/.claude/settings.json.dotfiles` - Claude Code settings (model, plugins, status line)
- `~/.claude/CLAUDE.md` - Claude Code global working principles (accuracy, response style, review stance)
- `~/.codex/AGENTS.md` - Codex CLI agent instructions
- `~/.codex/config.toml.dotfiles` - Codex CLI config template (model, MCP servers, plugins)
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
