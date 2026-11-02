#!/usr/bin/env python3
"""zsh는 중괄호 없는 $name 바로 뒤의 :s, :a, :h 같은 글자를 수식어로 읽어 값을 조용히 바꾼다.

예를 들어 $IMAGE:stage-test 는 태그가 빠진 이미지 이름이 되어 docker push 가 latest 로 올라간다.
그래서 Bash 명령에 이 모양이 있으면 실행 전에 막고 ${IMAGE}:... 로 다시 쓰게 한다.
"""

import json
import re
import sys

UNBRACED_VAR_FOLLOWED_BY_MODIFIER = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*|[0-9]):[A-Za-z&]")
HEREDOC = re.compile(r"<<-?[ \t]*(['\"]?)(\w+)\1[^\n]*\n(.*?)^[ \t]*\2[ \t]*$", re.S | re.M)


def find_modifier_uses(shell_text: str, honors_quotes: bool) -> list:
    found = []
    position = 0
    in_double_quotes = False

    while position < len(shell_text):
        char = shell_text[position]

        if char == "\\":
            position += 2
            continue

        if honors_quotes and char == "'" and not in_double_quotes:
            closing = shell_text.find("'", position + 1)
            position = len(shell_text) if closing == -1 else closing + 1
            continue

        if honors_quotes and char == '"':
            in_double_quotes = not in_double_quotes
            position += 1
            continue

        if char == "$":
            match = UNBRACED_VAR_FOLLOWED_BY_MODIFIER.match(shell_text, position)

            if match:
                found.append(match.group(0))
                position = match.end()
                continue

        position += 1

    return found


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""

    if isinstance(command, list):
        command = " ".join(str(part) for part in command)

    found = []

    def take_out_heredoc_body(heredoc: re.Match) -> str:
        delimiter_is_quoted = heredoc.group(1) != ""

        if not delimiter_is_quoted:
            found.extend(find_modifier_uses(heredoc.group(3), honors_quotes=False))

        return ""

    command_without_heredoc_bodies = HEREDOC.sub(take_out_heredoc_body, command)
    found.extend(find_modifier_uses(command_without_heredoc_bodies, honors_quotes=True))

    if not found:
        return 0

    examples = ", ".join(sorted(set(found)))
    sys.stderr.write(
        f"중괄호 없는 변수 뒤에 콜론과 영문자가 붙어 있습니다: {examples}\n"
        "zsh는 이 글자를 :s, :a 같은 수식어로 읽어 값을 바꿉니다. "
        "${IMAGE}:stage-test 처럼 변수 이름을 중괄호로 감싸서 다시 실행하세요.\n"
    )

    return 2


if __name__ == "__main__":
    sys.exit(main())
