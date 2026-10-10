if [ -f "$HOME/.agents/humanize-shell.sh" ]; then
    . "$HOME/.agents/humanize-shell.sh"
fi

case "$-" in
    *i*)
        if command -v python3 >/dev/null 2>&1 && [ -f "$HOME/.agents/shell-flower.py" ]; then
            command python3 "$HOME/.agents/shell-flower.py"
        fi
        ;;
esac
