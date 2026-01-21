# Claude Code Instructions for Dotfiles

This repository manages personal dotfiles using a bare Git repository.

## Repository Structure

```
~/.dotfiles/                 # Bare git repository
~/.config/ghostty/config     # Ghostty terminal config
~/.vimrc                     # Vim configuration
~/.zshrc.shared              # Shared zsh aliases (tracked)
~/.zshrc.secrets             # Local secrets (NOT tracked)
~/.dotfiles-install.sh       # Installation script
```

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

1. Add the file to tracking: `dotfiles add ~/.config/app/config`
2. Commit with descriptive message
3. **Update README.md** if adding new application configs
4. Push changes

### File Classification

| Type | Location | Git Tracked | Examples |
|------|----------|-------------|----------|
| Shared configs | `~/.config/*`, `~/.vimrc` | Yes | ghostty, vim |
| Shared aliases | `~/.zshrc.shared` | Yes | dotfiles alias |
| Machine-specific | `~/.zshrc.secrets` | No | API keys, local paths |
| Main shell config | `~/.zshrc` | No | oh-my-zsh, machine-specific |

### Important Rules

1. **Never track sensitive data**: API keys, tokens, passwords go in `.zshrc.secrets`
2. **Never track machine-specific paths**: Absolute paths like `/Users/username/...` go in `.zshrc.secrets`
3. **Use `$HOME` instead of `~` or absolute paths** in tracked files
4. **Always update README.md** when:
   - Adding new config files
   - Changing installation process
   - Adding new features to install script
5. **Test install script** after modifications

### Commit Message Format

```
<type>: <short description>

- Detail 1
- Detail 2

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Types: `Add`, `Update`, `Fix`, `Remove`

## Installation Script Maintenance

When modifying `.dotfiles-install.sh`:

1. Maintain support for multiple package managers (brew, apt, dnf, yum, pacman)
2. Keep the dependency list updated: `DEPENDENCIES=(git zsh vim)`
3. Ensure idempotency (safe to run multiple times)
4. Update step numbers if adding/removing steps

## Checklist After Changes

- [ ] Commit changes with `dotfiles commit`
- [ ] Push to remote with `dotfiles push`
- [ ] Update README.md if necessary
