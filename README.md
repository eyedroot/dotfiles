# Dotfiles

Personal dotfiles managed with a bare Git repository.

## Contents

- `~/.config/ghostty/config` - Ghostty terminal configuration
- `~/.vimrc` - Vim configuration
- `~/.zshrc.shared` - Shared zsh aliases and settings

## Installation

### One-line Install

```bash
curl -fsSL https://raw.githubusercontent.com/eyedroot/dotfiles/main/.dotfiles-install.sh | bash
```

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

1. Create `~/.zshrc.secrets` for machine-specific settings (API keys, local aliases)
2. Run `source ~/.zshrc` to apply changes

## Usage

```bash
# Add a file
dotfiles add ~/.config/some/config

# Commit changes
dotfiles commit -m "Add config"

# Push to remote
dotfiles push
```

## License

MIT
