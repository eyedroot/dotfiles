#!/bin/sh
# herdr tab-bar status + Space metadata reporter.
#
# Wired from $HOME/.config/herdr/config.toml, [ui] tab_bar_right, as two
# command entries. herdr runs each on the server every interval_seconds via
# `/bin/sh -lc` and shows the LAST LINE of stdout at the right edge of the tab
# row; an entry that prints nothing is invisible (no separator either).
#
#   status.sh                 agent fleet summary, attention states first
#                             e.g. "4 agents · 1 blocked · 2 working · 1 idle"
#   status.sh --report-dirty  prints nothing; reports a $dirty token per Git
#                             workspace ("±3 ?1") for [ui.sidebar.spaces].
#                             Tokens carry a TTL so they vanish if this stops.
#   status.sh --dirty <path>  debug: print the $dirty value for one directory.
set -u

HERDR="${HERDR_BIN_PATH:-}"
if [ -z "$HERDR" ] || [ ! -x "$HERDR" ]; then
  if command -v herdr >/dev/null 2>&1; then HERDR=herdr
  elif [ -x "$HOME/.local/bin/herdr" ]; then HERDR="$HOME/.local/bin/herdr"
  else echo "herdr not found"; exit 0
  fi
fi
SOURCE="herdr-status"
TTL_MS=30000

# "±<tracked changes> ?<untracked>", empty when clean or not a Git work tree.
dirty_value() {
  dir="$1"
  [ -d "$dir" ] || return 0
  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  porcelain="$(git --no-optional-locks -c core.useBuiltinFSMonitor=false \
                 -C "$dir" status --porcelain=v1 -unormal 2>/dev/null)" || return 0
  tracked=$(printf '%s\n' "$porcelain" | grep -c -v -e '^??' -e '^$')
  untracked=$(printf '%s\n' "$porcelain" | grep -c '^??')
  value=""
  [ "$tracked" -gt 0 ] && value="±$tracked"
  [ "$untracked" -gt 0 ] && value="${value:+$value }?$untracked"
  printf '%s' "$value"
}

case "${1:-}" in
  --dirty) dirty_value "${2:-.}"; echo; exit 0 ;;
  --report-dirty) mode=report ;;
  *) mode=summary ;;
esac

command -v jq >/dev/null 2>&1 || { [ "$mode" = summary ] && echo "jq missing"; exit 0; }

snapshot="$("$HERDR" api snapshot 2>/dev/null)" || snapshot=""
[ -n "$snapshot" ] || { [ "$mode" = summary ] && echo "herdr offline"; exit 0; }

if [ "$mode" = report ]; then
  tab="$(printf '\t')"
  printf '%s' "$snapshot" \
    | jq -r '.result.snapshot.panes
             | group_by(.workspace_id)
             | .[] | "\(.[0].workspace_id)\t\(.[0].cwd)"' \
    | while IFS="$tab" read -r ws cwd; do
        [ -n "$ws" ] || continue
        value="$(dirty_value "$cwd")"
        if [ -n "$value" ]; then
          "$HERDR" workspace report-metadata "$ws" --source "$SOURCE" \
            --token "dirty=$value" --ttl-ms "$TTL_MS" >/dev/null 2>&1
        else
          "$HERDR" workspace report-metadata "$ws" --source "$SOURCE" \
            --clear-token dirty >/dev/null 2>&1
        fi
      done
  exit 0
fi

printf '%s' "$snapshot" | jq -r '
  .result.snapshot.agents as $a
  | ($a | length) as $n
  | if $n == 0 then "no agents" else
      (["blocked", "done", "working", "idle", "unknown"]
        | map(. as $s
              | ($a | map(select(.agent_status == $s)) | length) as $c
              | select($c > 0)
              | "\($c) \($s)")
      ) as $parts
      | (["\($n) agent\(if $n == 1 then "" else "s" end)"] + $parts) | join(" · ")
    end'
