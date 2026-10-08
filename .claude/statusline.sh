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

# Unpeel paints its panes from its own appearance setting, not the Ghostty
# theme, and keeps the resolved value (light or dark) in app-appearance.
unpeel_appearance=$(cat "$HOME/.unpeel/app-appearance" 2>/dev/null)

if [ "$TERM_PROGRAM" = "Unpeel" ] && [ "$unpeel_appearance" = "light" ]; then
    layout="ink"
    # On Unpeel's light background hue is reserved for what needs attention;
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
    # which is what Claude Code itself resolves it to. An Unpeel pane on the
    # dark appearance keeps the dark palette whatever the setting says.
    if [ "$TERM_PROGRAM" = "Unpeel" ] && [ "$unpeel_appearance" = "dark" ]; then
        claude_theme="dark"
    else
        claude_theme=$(jq -r '.theme // "dark"' "$HOME/.claude/settings.json" 2>/dev/null)
    fi
    # A custom theme (custom:<slug>) is a preset plus overrides; its file names
    # the preset under "base".
    case "$claude_theme" in
        custom:*)
            claude_theme=$(jq -r '.base // "dark"' "$HOME/.claude/themes/${claude_theme#custom:}.json" 2>/dev/null)
            ;;
    esac
    if [ "$claude_theme" = "auto" ]; then
        if [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ]; then
            claude_theme="dark"
        else
            claude_theme="light"
        fi
    fi
    case "$claude_theme" in
        light*)
            # Rose Pine Dawn palette, the same roles as the Mocha block below:
            # iris accent on the project name, pine model name, love context
            # meter. Accents are the Dawn colors darkened so every color but
            # the separator clears 4.5:1 on the base (#faf4ed).
            project_color='\033[38;2;107;91;126m'    # iris, darkened #6b5b7e
            model_color='\033[38;2;40;105;131m'      # pine #286983
            ctx_bar_color='\033[38;2;143;79;97m'    # love, darkened #8f4f61
            branch_color='\033[38;2;61;105;112m'     # foam, darkened #3d6970
            worktree_color='\033[38;2;137;83;80m'   # rose, darkened #895350
            style_color='\033[38;2;107;91;126m'      # iris, darkened
            rate_icon_color='\033[38;2;61;105;112m'  # foam, darkened
            subtext_color='\033[38;2;99;95;120m'    # subtle, darkened #635f78
            separator_color='\033[38;2;152;147;165m' # muted #9893a5
            alert_color='\033[38;2;143;79;97m'      # love, darkened

            rate_low='\033[38;2;61;105;112m'    # foam
            rate_mid='\033[38;2;133;89;29m'    # gold, darkened #85591d
            rate_high='\033[38;2;137;83;80m'   # rose, darkened
            rate_crit='\033[38;2;143;79;97m'   # love, darkened
            ;;
        *)
            # Colorful palette: Catppuccin Mocha vivid
            project_color='\033[38;2;203;166;247m'   # Mocha Mauve
            model_color='\033[38;2;116;199;236m'     # Mocha Sapphire
            ctx_bar_color='\033[38;2;243;139;168m'   # Mocha Red
            branch_color='\033[38;2;166;227;161m'    # Mocha Green
            worktree_color='\033[38;2;250;179;135m'  # Mocha Peach
            style_color='\033[38;2;180;190;254m'     # Mocha Lavender
            rate_icon_color='\033[38;2;148;226;213m' # Mocha Teal
            subtext_color='\033[38;2;186;194;222m'   # Mocha Subtext1
            separator_color='\033[38;2;127;132;156m' # Mocha Overlay1
            alert_color='\033[38;2;243;139;168m'     # Mocha Red

            rate_low='\033[38;2;148;226;213m'  # Teal (safe)
            rate_mid='\033[38;2;249;226;175m'  # Yellow (warm)
            rate_high='\033[38;2;250;179;135m' # Peach (orange)
            rate_crit='\033[38;2;243;139;168m' # Red (critical)
            ;;
    esac

    sep=" ${separator_color}│${reset} "
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
        worktree_info=$(printf "${sep}${worktree_color}↳ %s${reset}" "$wt_name")
    fi
elif [ -n "$abs_git_dir" ] && [ -d "$abs_git_dir/worktrees" ] && [ -n "$(ls -A "$abs_git_dir/worktrees" 2>/dev/null)" ]; then
    # main worktree that has linked worktrees: mark as the source
    if [ "$layout" = "ink" ]; then
        worktree_info=$(printf " ${faint}⌂${reset}")
    else
        worktree_info=$(printf " ${worktree_color}⌂${reset}")
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
            git_info=$(printf "${sep}${bold}${alert_color}⑃ %s${reset} ${bold}${alert_color}±${reset}" "$branch")
        fi
    else
        if [ "$layout" = "ink" ]; then
            git_info=$(printf "${sep}${body}%s${reset}" "$branch")
        else
            git_info=$(printf "${sep}${branch_color}⑃ %s${reset}" "$branch")
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
        ctx_info=$(printf "${sep}${ctx_bar_color}%s${reset} ${subtext_color}%d%%${reset}" "$bar" "$pct")
    fi
fi

# ── Style info ───────────────────────────────────────────
style_info=""
if [ "$style" != "default" ]; then
    if [ "$layout" = "ink" ]; then
        style_info=$(printf "${sep}${body}%s${reset}" "$style")
    else
        style_info=$(printf "${sep}${style_color}⚙ %s${reset}" "$style")
    fi
fi

# ── Vim mode ─────────────────────────────────────────────
vim_info=""
if [ -n "$vim_mode" ]; then
    if [ "$layout" = "ink" ]; then
        vim_info=$(printf "${sep}${alert}%s${reset}" "${vim_mode:0:1}")
    elif [ "$vim_mode" = "NORMAL" ]; then
        vim_info=$(printf "${sep}${bold}${alert_color}▌N${reset}")
    else
        vim_info=$(printf "${sep}${bold}${alert_color}▌I${reset}")
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
        rate_info=$(printf "${sep}${rate_icon_color}↻${reset} ${bold}${rate_color}%s${reset}" "$rate_bar")
    fi
    if [ -n "$reset_time" ]; then
        if [ "$layout" = "ink" ]; then
            rate_info+=$(printf " ${faint}→ %s${reset}" "$reset_time")
        else
            rate_info+=$(printf " ${subtext_color}→ %s${reset}" "$reset_time")
        fi
    fi
fi

# ── Output ───────────────────────────────────────────────
# Line 1: project + git info
if [ "$layout" = "ink" ]; then
    printf "${bold}${ink}%s${reset}%s%s" \
        "$real_project" "$worktree_info" "$git_info"
else
    printf "${bold}${project_color}✺ \033[4m%s${reset}%s%s" \
        "$real_project" "$worktree_info" "$git_info"
fi
echo ""
# Line 2: model + context + rate limit + style + vim
if [ "$layout" = "ink" ]; then
    printf "${ink}%s${reset}%s%s%s%s" \
        "$model" "$ctx_info" "$rate_info" "$style_info" "$vim_info"
else
    printf "${bold}${model_color}%s${reset}%s%s%s%s" \
        "$model" "$ctx_info" "$rate_info" "$style_info" "$vim_info"
fi

exit 0
