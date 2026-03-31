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

# Rate limit colors (by severity)
rate_low='\033[38;2;148;226;213m'  # Teal (safe)
rate_mid='\033[38;2;249;226;175m'  # Yellow (warm)
rate_high='\033[38;2;250;179;135m' # Peach (orange)
rate_crit='\033[38;2;243;139;168m' # Red (critical)

sep=" ${black}│${reset} "

# ── Extract JSON data ────────────────────────────────────
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // ""')
[ -z "$cwd" ] || [ "$cwd" = "null" ] && cwd=$(pwd)
project=$(basename "$cwd")
style=$(echo "$input" | jq -r '.output_style.name // "default"')
vim_mode=$(echo "$input" | jq -r '.vim.mode // empty')

# ── Resolve real project name (handles worktrees) ────────
real_project="$project"
if git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --git-common-dir > /dev/null 2>&1; then
    git_common=$(git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --git-common-dir 2>/dev/null)
    if [ -n "$git_common" ]; then
        resolved=$(cd "$cwd" && cd "$git_common" && cd .. && pwd)
        real_project=$(basename "$resolved")
    fi
fi

# ── Worktree info ────────────────────────────────────────
worktree_info=""
if [ "$real_project" != "$project" ]; then
    worktree_info=$(printf "${sep}${peach}[%s]${reset}" "$project")
fi

# ── Git info ─────────────────────────────────────────────
git_info=""
if git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --abbrev-ref HEAD 2>/dev/null)
    if ! git -C "$cwd" -c core.useBuiltinFSMonitor=false diff-index --quiet HEAD -- 2>/dev/null; then
        git_info=$(printf "${sep}${bold}${red}⑃ %s${reset} ${bold}${red}±${reset}" "$branch")
    else
        git_info=$(printf "${sep}${green}⑃ %s${reset}" "$branch")
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
    for ((i=0; i<filled; i++)); do bar+="▰"; done
    for ((i=0; i<empty; i++)); do bar+="▱"; done
    ctx_info=$(printf "${sep}${red}%s${reset} ${gray}%d%%${reset}" "$bar" "$pct")
fi

# ── Style info ───────────────────────────────────────────
style_info=""
if [ "$style" != "default" ]; then
    style_info=$(printf "${sep}${lavender}⚙ %s${reset}" "$style")
fi

# ── Vim mode ─────────────────────────────────────────────
vim_info=""
if [ -n "$vim_mode" ]; then
    if [ "$vim_mode" = "NORMAL" ]; then
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

# ── Fetch 5-hour usage (cached 60s) ─────────────────────
cache_file="/tmp/claude/statusline-usage-cache.json"
cache_max_age=60
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

    if [ "$five_pct" -ge 90 ]; then
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

    rate_info=$(printf "${sep}${teal}↻${reset} ${bold}${rate_color}%d%%${reset}" "$five_pct")
    if [ -n "$reset_time" ]; then
        rate_info+=$(printf " ${gray}→ %s${reset}" "$reset_time")
    fi
fi

# ── Output ───────────────────────────────────────────────
# Line 1: project + git info
printf "${bold}${mauve}✺ \033[4m%s${reset}%s%s" \
    "$real_project" "$worktree_info" "$git_info"
echo ""
# Line 2: model + context + rate limit + style + vim
printf "${bold}${sapphire}%s${reset}%s%s%s%s" \
    "$model" "$ctx_info" "$rate_info" "$style_info" "$vim_info"

exit 0
