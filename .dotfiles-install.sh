#!/bin/bash
# Dotfiles Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/eyedroot/dotfiles/main/.dotfiles-install.sh | bash

set -e

DOTFILES_REPO="git@github.com:eyedroot/dotfiles.git"
DOTFILES_DIR="$HOME/.dotfiles"
BACKUP_DIR="$HOME/.dotfiles-backup"

echo "=== Dotfiles Installation ==="

# 1. Clone bare repository
if [ -d "$DOTFILES_DIR" ]; then
    echo "[!] $DOTFILES_DIR already exists. Skipping clone."
else
    echo "[1/5] Cloning dotfiles repository..."
    git clone --bare "$DOTFILES_REPO" "$DOTFILES_DIR"
fi

# Define dotfiles alias function
dotfiles() {
    git --git-dir="$DOTFILES_DIR" --work-tree="$HOME" "$@"
}

# 2. Backup existing files
echo "[2/5] Backing up existing files..."
mkdir -p "$BACKUP_DIR"

dotfiles checkout 2>&1 | grep -E "^\s+" | awk '{print $1}' | while read -r file; do
    if [ -f "$HOME/$file" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$file")"
        mv "$HOME/$file" "$BACKUP_DIR/$file"
        echo "    Backed up: $file"
    fi
done

# 3. Checkout files
echo "[3/5] Checking out dotfiles..."
dotfiles checkout
dotfiles config status.showUntrackedFiles no

# 4. Create secrets template if not exists
if [ ! -f "$HOME/.zshrc.secrets" ]; then
    echo "[4/5] Creating .zshrc.secrets template..."
    cat > "$HOME/.zshrc.secrets" << 'EOF'
# Local secrets - DO NOT COMMIT TO GIT
# Add this line to your .zshrc:
# [ -f "$HOME/.zshrc.secrets" ] && source "$HOME/.zshrc.secrets"

# Kubernetes config
# export KUBECONFIG="$HOME/.kube/config"

# API Keys
# export OPENAI_API_KEY="your-key-here"

# Local aliases (machine-specific paths)
# alias claude-mem='bun "/path/to/script"'
EOF
else
    echo "[4/5] .zshrc.secrets already exists. Skipping."
fi

# 5. Add source lines to .zshrc if not present
echo "[5/5] Updating .zshrc..."
if ! grep -q "zshrc.shared" "$HOME/.zshrc" 2>/dev/null; then
    cat >> "$HOME/.zshrc" << 'EOF'

# Load shared config (tracked by git)
[ -f "$HOME/.zshrc.shared" ] && source "$HOME/.zshrc.shared"

# Load secrets (not tracked by git)
[ -f "$HOME/.zshrc.secrets" ] && source "$HOME/.zshrc.secrets"
EOF
    echo "    Added source lines to .zshrc"
else
    echo "    .zshrc already configured. Skipping."
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Installed files:"
dotfiles ls-tree --name-only HEAD | sed 's/^/  - /'
echo ""
echo "Next steps:"
echo "  1. Edit ~/.zshrc.secrets with your API keys"
echo "  2. Run: source ~/.zshrc"
echo ""
echo "Backup location: $BACKUP_DIR"
