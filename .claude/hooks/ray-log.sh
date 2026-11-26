#!/bin/bash
# PostToolUse / PostToolUseFailure 훅: 에이전트가 실행한 도구 호출을 로컬 Ray(HTTP 23517)로 보낸다.
# 색상: Query=blue, K8s=purple, HTTP=orange, Git=gray, 그 외 Bash=green, 실패=red.
# 어떤 경우에도 에이전트 작업을 막지 않도록 항상 exit 0 으로 끝낸다.

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -z "$cwd" ] && cwd=$PWD

common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$common" ] && [ "$(basename "$common")" = ".git" ]; then
  project=$(basename "$(dirname "$common")")
else
  project=$(basename "$cwd")
fi

host=$(hostname)
max_chars=4000

payload=$(jq -c \
  --arg project "$project" \
  --arg host "$host" \
  --arg cwd "$cwd" \
  --argjson max "$max_chars" '
  def clip: if length > $max then .[0:$max] + "\n...(truncated)" else . end;
  def out(r):
    if r == null then ""
    elif (r | type) == "string" then r
    elif (r | type) == "object" and (r.stdout? != null or r.stderr? != null) then
      ((r.stdout // "") + (if (r.stderr // "") != "" then "\n[stderr]\n" + r.stderr else "" end))
    else (r | tojson) end;
  def classify($tool; $call):
    if $tool == "WebFetch" or $tool == "WebSearch" then {color: "orange", label: "HTTP"}
    elif ($call | test("\\b(mysql|mysqldump|psql|sqlite3|mongosh|redis-cli)\\b|artisan (tinker|db)|\\b(select|insert into|update|delete from)\\b.+\\b(from|set|values)\\b"; "i")) then {color: "blue", label: "Query"}
    elif ($call | test("\\b(kubectl|helm|kustomize)\\b")) then {color: "purple", label: "K8s"}
    elif ($call | test("\\b(curl|wget|http)\\b"; "i")) then {color: "orange", label: "HTTP"}
    elif ($call | test("^\\s*git\\b")) then {color: "gray", label: "Git"}
    else {color: "green", label: "Bash"} end;
  . as $in
  | ($in.tool_name // "unknown") as $tool
  | ($in.tool_input // {}) as $ti
  | (if $tool == "Bash" or $tool == "mcp__phpstorm__execute_terminal_command" then ($ti.command // "")
     elif $tool == "WebFetch" then (($ti.url // "") + "  " + ($ti.prompt // ""))
     else ($ti | tojson) end) as $call
  | classify($tool; $call) as $c
  | (($in.hook_event_name // "") == "PostToolUseFailure") as $failed
  | (if $failed then {color: "red", label: ($c.label + " FAILED")} else $c end) as $style
  | (if $failed then ($in.error // out($in.tool_response)) else out($in.tool_response) end) as $result
  | {
      uuid: ("claude-hook-" + (now | tostring) + "-" + ($call | length | tostring)),
      payloads: [
        { type: "log",
          content: { values: [ ("[" + $tool + "] " + ($call | clip)), ($result | clip) ] },
          origin: { function_name: $tool, file: $cwd, line_number: 0, hostname: $host } },
        { type: "color", content: { color: $style.color },
          origin: { function_name: $tool, file: $cwd, line_number: 0, hostname: $host } },
        { type: "label", content: { label: $style.label },
          origin: { function_name: $tool, file: $cwd, line_number: 0, hostname: $host } }
      ],
      meta: { project_name: $project }
    }' <<<"$input" 2>/dev/null)

[ -z "$payload" ] && exit 0

curl -s -m 2 -o /dev/null -X POST http://localhost:23517/ \
  -H 'Content-Type: application/json' -d "$payload" >/dev/null 2>&1

exit 0
