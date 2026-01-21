#!/bin/bash
# Dotfiles Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/eyedroot/dotfiles/main/.dotfiles-install.sh | bash

set -e

DOTFILES_REPO="git@github.com:eyedroot/dotfiles.git"
DOTFILES_DIR="$HOME/.dotfiles"
BACKUP_DIR="$HOME/.dotfiles-backup"

echo "=== Dotfiles Installation ==="

# Detect OS and package manager
detect_package_manager() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            echo "brew"
        else
            echo "none"
        fi
    elif command -v apt-get &> /dev/null; then
        echo "apt"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v yum &> /dev/null; then
        echo "yum"
    elif command -v pacman &> /dev/null; then
        echo "pacman"
    else
        echo "none"
    fi
}

# Install package based on package manager
install_package() {
    local pkg=$1
    local pm=$(detect_package_manager)

    echo "    Installing $pkg..."
    case $pm in
        brew)
            brew install "$pkg"
            ;;
        apt)
            sudo apt-get update && sudo apt-get install -y "$pkg"
            ;;
        dnf)
            sudo dnf install -y "$pkg"
            ;;
        yum)
            sudo yum install -y "$pkg"
            ;;
        pacman)
            sudo pacman -S --noconfirm "$pkg"
            ;;
        none)
            echo "    [!] No package manager found. Please install $pkg manually."
            exit 1
            ;;
    esac
}

# Install Homebrew on macOS if not present
install_homebrew() {
    if [[ "$OSTYPE" == "darwin"* ]] && ! command -v brew &> /dev/null; then
        echo "    Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)"
    fi
}

# 0. Check and install dependencies
echo "[0/6] Checking dependencies..."

DEPENDENCIES=(git zsh vim)
MISSING=()

for dep in "${DEPENDENCIES[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
        MISSING+=("$dep")
    fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "    Missing: ${MISSING[*]}"

    # Install Homebrew first on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        install_homebrew
    fi

    for dep in "${MISSING[@]}"; do
        install_package "$dep"
    done
    echo "    Dependencies installed."
else
    echo "    All dependencies found."
fi

# 1. Clone bare repository
if [ -d "$DOTFILES_DIR" ]; then
    echo "[1/6] $DOTFILES_DIR already exists. Skipping clone."
else
    echo "[1/6] Cloning dotfiles repository..."
    git clone --bare "$DOTFILES_REPO" "$DOTFILES_DIR"
fi

# Define dotfiles alias function
dotfiles() {
    git --git-dir="$DOTFILES_DIR" --work-tree="$HOME" "$@"
}

# 2. Backup existing files
echo "[2/6] Backing up existing files..."
mkdir -p "$BACKUP_DIR"

dotfiles checkout 2>&1 | grep -E "^\s+" | awk '{print $1}' | while read -r file; do
    if [ -f "$HOME/$file" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$file")"
        mv "$HOME/$file" "$BACKUP_DIR/$file"
        echo "    Backed up: $file"
    fi
done

# 3. Checkout files
echo "[3/6] Checking out dotfiles..."
dotfiles checkout
dotfiles config status.showUntrackedFiles no

# 4. Create secrets template if not exists
if [ ! -f "$HOME/.zshrc.secrets" ]; then
    echo "[4/6] Creating .zshrc.secrets template..."
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
    echo "[4/6] .zshrc.secrets already exists. Skipping."
fi

# 5. Add source lines to .zshrc if not present
echo "[5/6] Updating .zshrc..."
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

# 6. Set zsh as default shell if not already
echo "[6/6] Checking default shell..."
if [[ "$SHELL" != *"zsh"* ]]; then
    echo "    Setting zsh as default shell..."
    chsh -s "$(which zsh)"
    echo "    Default shell changed to zsh. Please restart your terminal."
else
    echo "    zsh is already the default shell."
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
