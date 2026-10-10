case "$-" in
    *i*)
        if command -v python3 >/dev/null 2>&1 && [ -f "$HOME/.agents/check-humanize-korean.py" ]; then
            if [ -s "${XDG_CACHE_HOME:-$HOME/.cache}/humanize-korean/notice.txt" ]; then
                cat "${XDG_CACHE_HOME:-$HOME/.cache}/humanize-korean/notice.txt" >&2
            fi
            (command python3 "$HOME/.agents/check-humanize-korean.py" >/dev/null 2>&1 &)
        fi
        ;;
esac
