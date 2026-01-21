# Dotfiles

Personal dotfiles managed with a bare Git repository.

## Contents

- `~/.config/ghostty/config` - Ghostty terminal configuration
- `~/.vimrc` - Vim configuration
- `~/.zshrc.shared` - Shared zsh aliases and settings
- `~/.dotfiles-install.sh` - Installation script
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
- Set zsh as default shell

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

1. Edit `~/.zshrc.secrets` for machine-specific settings:
   ```bash
   # API Keys
   export OPENAI_API_KEY="your-key-here"

   # Local aliases
   alias myalias='command'
   ```

2. Apply changes:
   ```bash
   source ~/.zshrc
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
