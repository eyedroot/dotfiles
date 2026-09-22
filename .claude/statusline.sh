#!/bin/bash
set -f

input=$(cat)

if [ -z "$input" ]; then
    printf "Claude"
    exit 0
fi

# ── Colors (matched to Starship prompt palette) ──────────
bold='\033[1m'
dim='\033[2m'
reset='\033[0m'

if [ "$TERM_PROGRAM" = "Unpeel" ]; then
    layout="ink"
    # Unpeel runs on a light background. Hue is reserved for what needs attention;
    # everything else separates by value alone. slate-300 measures 1.5:1 against
    # white, too faint to see, so the recessive tone is slate-400 instead.
    ink='\033[38;2;15;23;42m'      # project and model name (slate 900)
    body='\033[38;2;71;85;105m'    # branch, percentages, output style (slate 600)
    faint='\033[38;2;148;163;184m' # separators and labels (slate 400)
    alert='\033[38;2;185;28;28m'   # dirty worktree, 5h usage past 90% (red 700)

    sep=" ${faint}·${reset} "
else
    layout="vivid"
    # The status line cannot query the terminal background, so Claude Code's
    # own theme setting is the light/dark switch; the UI around the status
    # line already follows that value. "auto" follows the macOS appearance,
    # which is what Claude Code itself resolves it to.
    claude_theme=$(jq -r '.theme // "dark"' "$HOME/.claude/settings.json" 2>/dev/null)
    if [ "$claude_theme" = "auto" ]; then
        if [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ]; then
            claude_theme="dark"
        else
            claude_theme="light"
        fi
    fi
    case "$claude_theme" in
        light*)
            # Light palette, matched to the Ghostty warm-paper setup (background
            # #FEFCF3, Nord-leaning ANSI colors). Each hue is a darker shade of
            # the corresponding ANSI color so it clears 4.5:1 on the paper.
            mauve='\033[38;2;122;92;158m'     # project name (violet)
            sapphire='\033[38;2;43;98;160m'   # model name (deep blue)
            red='\033[38;2;176;80;90m'        # git dirty / context bar
            teal='\033[38;2;58;126;128m'      # rate limit icon
            green='\033[38;2;63;127;82m'      # git clean branch
            gray='\033[38;2;99;106;121m'      # sub text (ANSI bright black)
            black='\033[38;2;168;161;150m'    # separators (warm faint)
            yellow='\033[38;2;143;99;24m'     # folder icon (amber)
            peach='\033[38;2;163;88;26m'      # worktree info (burnt orange)
            lavender='\033[38;2;94;99;168m'   # style info (indigo)

            rate_low='\033[38;2;58;126;128m'  # Teal (safe)
            rate_mid='\033[38;2;143;99;24m'   # Amber (warm)
            rate_high='\033[38;2;163;88;26m'  # Burnt orange
            rate_crit='\033[38;2;176;80;90m'  # Red (critical)
            ;;
        *)
            # Colorful palette: Catppuccin Mocha vivid
            mauve='\033[38;2;203;166;247m'     # project name (Mocha Mauve)
            sapphire='\033[38;2;116;199;236m'  # model name (Mocha Sapphire)
            red='\033[38;2;243;139;168m'       # git dirty / context bar (Mocha Red)
            teal='\033[38;2;148;226;213m'      # rate limit icon (Mocha Teal)
            green='\033[38;2;166;227;161m'     # git clean branch (Mocha Green)
            gray='\033[38;2;186;194;222m'      # sub text (Mocha Subtext1)
            black='\033[38;2;127;132;156m'     # separators (Mocha Overlay1)
            yellow='\033[38;2;249;226;175m'    # folder icon (Mocha Yellow)
            peach='\033[38;2;250;179;135m'     # worktree info (Mocha Peach)
            lavender='\033[38;2;180;190;254m'  # style info (Mocha Lavender)

            rate_low='\033[38;2;148;226;213m'  # Teal (safe)
            rate_mid='\033[38;2;249;226;175m'  # Yellow (warm)
            rate_high='\033[38;2;250;179;135m' # Peach (orange)
            rate_crit='\033[38;2;243;139;168m' # Red (critical)
            ;;
    esac

    sep=" ${black}│${reset} "
fi

# ── Extract JSON data ────────────────────────────────────
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // ""')
[ -z "$cwd" ] || [ "$cwd" = "null" ] && cwd=$(pwd)
project=$(basename "$cwd")
style=$(echo "$input" | jq -r '.output_style.name // "default"')
vim_mode=$(echo "$input" | jq -r '.vim.mode // empty')

# ── Worktree info ─────────────────────────────────────────
# Distinguish the main (source) worktree from linked worktrees:
#   main worktree with linked children  →  project ⌂
#   linked worktree                     →  origin-project ↳ worktree-name
real_project="$project"
worktree_info=""
wt_name=$(echo "$input" | jq -r '.workspace.git_worktree.name // empty')
wt_original=$(echo "$input" | jq -r '.workspace.git_worktree.original_repo_dir // empty')

abs_git_dir=$(git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --absolute-git-dir 2>/dev/null)
common_dir=$(git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --git-common-dir 2>/dev/null)
case "$common_dir" in
    ""|/*) ;;
    *) common_dir="$cwd/$common_dir" ;;
esac

if [ -n "$abs_git_dir" ] && [ "$abs_git_dir" != "$common_dir" ]; then
    # linked worktree: show the origin repo as project, arrow to worktree name
    if [ -n "$wt_original" ]; then
        real_project=$(basename "$wt_original")
    else
        real_project=$(basename "$(dirname "$common_dir")")
    fi
    if [ -z "$wt_name" ]; then
        wt_name=$(basename "$(git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --show-toplevel 2>/dev/null)")
    fi
    if [ "$layout" = "ink" ]; then
        worktree_info=$(printf "${sep}${body}↳ %s${reset}" "$wt_name")
    else
        worktree_info=$(printf "${sep}${peach}↳ %s${reset}" "$wt_name")
    fi
elif [ -n "$abs_git_dir" ] && [ -d "$abs_git_dir/worktrees" ] && [ -n "$(ls -A "$abs_git_dir/worktrees" 2>/dev/null)" ]; then
    # main worktree that has linked worktrees: mark as the source
    if [ "$layout" = "ink" ]; then
        worktree_info=$(printf " ${faint}⌂${reset}")
    else
        worktree_info=$(printf " ${peach}⌂${reset}")
    fi
fi

# ── Git info ─────────────────────────────────────────────
git_info=""
if git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --abbrev-ref HEAD 2>/dev/null)
    if ! git -C "$cwd" -c core.useBuiltinFSMonitor=false diff-index --quiet HEAD -- 2>/dev/null; then
        if [ "$layout" = "ink" ]; then
            git_info=$(printf "${sep}${body}%s${reset} ${alert}±${reset}" "$branch")
        else
            git_info=$(printf "${sep}${bold}${red}⑃ %s${reset} ${bold}${red}±${reset}" "$branch")
        fi
    else
        if [ "$layout" = "ink" ]; then
            git_info=$(printf "${sep}${body}%s${reset}" "$branch")
        else
            git_info=$(printf "${sep}${green}⑃ %s${reset}" "$branch")
        fi
    fi
fi

# ── Context window ───────────────────────────────────────
ctx_info=""
usage=$(echo "$input" | jq '.context_window.current_usage')
if [ "$usage" != "null" ]; then
    current=$(echo "$usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
    size=$(echo "$input" | jq '.context_window.context_window_size')
    pct=$((current * 100 / size))
    filled=$((pct / 10))
    empty=$((10 - filled))
    bar=""
    for ((i=0; i<filled; i++)); do bar+="■"; done
    for ((i=0; i<empty; i++)); do bar+="□"; done
    if [ "$layout" = "ink" ]; then
        ctx_info=$(printf "${sep}${body}%d%%${reset}" "$pct")
    else
        ctx_info=$(printf "${sep}${red}%s${reset} ${gray}%d%%${reset}" "$bar" "$pct")
    fi
fi

# ── Style info ───────────────────────────────────────────
style_info=""
if [ "$style" != "default" ]; then
    if [ "$layout" = "ink" ]; then
        style_info=$(printf "${sep}${body}%s${reset}" "$style")
    else
        style_info=$(printf "${sep}${lavender}⚙ %s${reset}" "$style")
    fi
fi

# ── Vim mode ─────────────────────────────────────────────
vim_info=""
if [ -n "$vim_mode" ]; then
    if [ "$layout" = "ink" ]; then
        vim_info=$(printf "${sep}${alert}%s${reset}" "${vim_mode:0:1}")
    elif [ "$vim_mode" = "NORMAL" ]; then
        vim_info=$(printf "${sep}${bold}${red}▌N${reset}")
    else
        vim_info=$(printf "${sep}${bold}${red}▌I${reset}")
    fi
fi

# ── OAuth token resolution ───────────────────────────────
get_oauth_token() {
    if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
        echo "$CLAUDE_CODE_OAUTH_TOKEN"
        return 0
    fi
    if command -v security >/dev/null 2>&1; then
        local blob
        blob=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)
        if [ -n "$blob" ]; then
            local token
            token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
            if [ -n "$token" ] && [ "$token" != "null" ]; then
                echo "$token"
                return 0
            fi
        fi
    fi
    local creds_file="${HOME}/.claude/.credentials.json"
    if [ -f "$creds_file" ]; then
        local token
        token=$(jq -r '.claudeAiOauth.accessToken // empty' "$creds_file" 2>/dev/null)
        if [ -n "$token" ] && [ "$token" != "null" ]; then
            echo "$token"
            return 0
        fi
    fi
    echo ""
}

# ── Fetch 5-hour usage (cached 180s) ────────────────────
cache_file="/tmp/claude/statusline-usage-cache.json"
cache_max_age=180
mkdir -p /tmp/claude

needs_refresh=true
usage_data=""

if [ -f "$cache_file" ]; then
    cache_mtime=$(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null)
    now=$(date +%s)
    cache_age=$(( now - cache_mtime ))
    if [ "$cache_age" -lt "$cache_max_age" ]; then
        needs_refresh=false
        usage_data=$(cat "$cache_file" 2>/dev/null)
    fi
fi

if $needs_refresh; then
    token=$(get_oauth_token)
    if [ -n "$token" ] && [ "$token" != "null" ]; then
        response=$(curl -s --max-time 5 \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -H "anthropic-beta: oauth-2025-04-20" \
            -H "User-Agent: claude-code/2.1.34" \
            "https://api.anthropic.com/api/oauth/usage" 2>/dev/null)
        if [ -n "$response" ] && echo "$response" | jq -e '.five_hour' >/dev/null 2>&1; then
            usage_data="$response"
            echo "$response" > "$cache_file"
        fi
    fi
    if [ -z "$usage_data" ] && [ -f "$cache_file" ]; then
        usage_data=$(cat "$cache_file" 2>/dev/null)
    fi
fi

# ── Build rate limit info ────────────────────────────────
rate_info=""
if [ -n "$usage_data" ] && echo "$usage_data" | jq -e '.five_hour' >/dev/null 2>&1; then
    five_pct=$(echo "$usage_data" | jq -r '.five_hour.utilization // 0' | awk '{printf "%.0f", $1}')

    if [ "$layout" = "ink" ]; then
        if [ "$five_pct" -ge 90 ]; then
            rate_color="$alert"
        else
            rate_color="$body"
        fi
    elif [ "$five_pct" -ge 90 ]; then
        rate_color="$rate_crit"
    elif [ "$five_pct" -ge 70 ]; then
        rate_color="$rate_high"
    elif [ "$five_pct" -ge 50 ]; then
        rate_color="$rate_mid"
    else
        rate_color="$rate_low"
    fi

    # reset time (parse as UTC, display as local)
    reset_iso=$(echo "$usage_data" | jq -r '.five_hour.resets_at // empty')
    reset_time=""
    if [ -n "$reset_iso" ] && [ "$reset_iso" != "null" ]; then
        stripped="${reset_iso%%.*}"
        stripped="${stripped%%Z}"
        stripped="${stripped%%+*}"
        epoch=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
        if [ -n "$epoch" ]; then
            reset_time=$(date -j -r "$epoch" +"%l:%M%p" 2>/dev/null | sed 's/^ //; s/\.//g' | tr '[:upper:]' '[:lower:]')
        fi
    fi

    rate_filled=$(( five_pct / 10 ))
    [ "$rate_filled" -gt 10 ] && rate_filled=10
    [ "$rate_filled" -lt 0 ] && rate_filled=0
    rate_empty=$(( 10 - rate_filled ))
    rate_bar=""
    for ((i=0; i<rate_filled; i++)); do rate_bar+="■"; done
    for ((i=0; i<rate_empty; i++)); do rate_bar+="□"; done
    if [ "$layout" = "ink" ]; then
        rate_info=$(printf "${sep}${faint}5h${reset} ${rate_color}%d%%${reset}" "$five_pct")
    else
        rate_info=$(printf "${sep}${teal}↻${reset} ${bold}${rate_color}%s${reset}" "$rate_bar")
    fi
    if [ -n "$reset_time" ]; then
        if [ "$layout" = "ink" ]; then
            rate_info+=$(printf " ${faint}→ %s${reset}" "$reset_time")
        else
            rate_info+=$(printf " ${gray}→ %s${reset}" "$reset_time")
        fi
    fi
fi

# ── Output ───────────────────────────────────────────────
# Line 1: project + git info
if [ "$layout" = "ink" ]; then
    printf "${bold}${ink}%s${reset}%s%s" \
        "$real_project" "$worktree_info" "$git_info"
else
    printf "${bold}${mauve}✺ \033[4m%s${reset}%s%s" \
        "$real_project" "$worktree_info" "$git_info"
fi
echo ""
# Line 2: model + context + rate limit + style + vim
if [ "$layout" = "ink" ]; then
    printf "${ink}%s${reset}%s%s%s%s" \
        "$model" "$ctx_info" "$rate_info" "$style_info" "$vim_info"
else
    printf "${bold}${sapphire}%s${reset}%s%s%s%s" \
        "$model" "$ctx_info" "$rate_info" "$style_info" "$vim_info"
fi

exit 0
