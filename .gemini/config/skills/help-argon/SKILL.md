---
name: help-argon
description: >-
  Claude Code(~/.claude)나 Codex(~/.codex)에서 진행하던 대화 맥락·플랜·워크트리 상태를 Antigravity(Argon)로 이어받거나, 반대로 Antigravity에서 작업한 맥락을 다시 Claude Code나 Codex로 넘길 때 사용하는 스킬. 사용자가 "클로드 코드 이어서", "코덱스 대화 가져와", "맥락 이어받아줘", "help-argon", "다시 클로드로 넘길게" 등을 요청할 때 활성화한다.
---

# Help Argon (Claude Code / Codex ↔ Antigravity Handoff)

Claude Code(`~/.claude`) 또는 Codex(`~/.codex`)와 Antigravity(Argon) 간에 작업 맥락, 진행 중인 플랜, git 워크트리 상태를 손실 없이 주고받기 위한 인수인계 절차다.

---

## 방향 A: Claude Code / Codex → Antigravity로 맥락 이어받기 (Inbound)

사용자가 Claude Code나 Codex에서 하던 작업을 이어달라고 요청할 때 따른다.

### Step 1: 추출 스크립트 실행

먼저 현재 워크스페이스(및 연결된 git worktree)에 해당하는 최신 세션을 추출한다.

- **최신 세션 자동 추출 (기본)**:
  ```bash
  python3 ~/.gemini/config/skills/help-argon/scripts/extract_context.py --cwd "<현재_워크스페이스_경로>"
  ```
- **세션 목록을 먼저 확인해야 할 때** (여러 워크트리/세션 중 선택 필요 시):
  ```bash
  python3 ~/.gemini/config/skills/help-argon/scripts/extract_context.py --cwd "<현재_워크스페이스_경로>" --list
  ```
- **특정 에이전트·세션·대화 길이 지정**:
  ```bash
  python3 ~/.gemini/config/skills/help-argon/scripts/extract_context.py \
    --cwd "<현재_워크스페이스_경로>" \
    --source claude \
    --session "<세션ID_또는_경로>" \
    --turns 10
  ```

### Step 2: 워크트리 경로 및 동시 수정 주의사항 확인

1. 출력된 `Working Directory`와 `Git Branch`를 반드시 확인한다.
   - 세션이 `.claude/worktrees/<name>` 또는 별도 git worktree에서 작업 중이었다면, **메인 저장소가 아닌 해당 워크트리 경로의 파일**을 읽고 수정해야 한다.
2. 이전 에이전트(Claude Code / Codex)가 현재 실행 중이지 않고 멈춘 상태인지 확인한다. (동일 워크트리를 두 에이전트가 동시에 수정하면 충돌이 발생한다.)

### Step 3: 인수인계 브리핑 후 작업 개시

추출한 내용을 바탕으로 사용자에게 아래 핵심을 **3~5줄로 간결하게 브리핑**한 뒤, 사용자가 요청한 후속 작업을 바로 이어서 진행한다.
- 이어받은 세션 출처(`claude` / `codex`), 작업 브랜치 및 실제 워크트리 경로
- 마지막 대화에서 내린 설계 결정 및 결론
- 남아 있는 플랜/체크리스트 항목 및 미커밋(`git status`) 파일 상태

---

## 방향 B: Antigravity → Claude Code / Codex로 맥락 돌려주기 (Outbound)

사용자가 사용량 리셋 등으로 다시 Claude Code나 Codex로 돌아간다고 말할 때 따른다. (외부 세션 `.jsonl` 파일을 직접 변조하지 않는다.)

### Step 1: 현재 상태 및 산출물 정리

1. 작업 중인 워크트리에서 `git status --short`와 `git diff --stat`을 확인해 변경·미커밋 파일 목록을 정리한다.
2. Antigravity에서 진행하면서 내린 **설계 결정 사항, 완료한 작업, 검증 결과, 남은 할 일**을 정리한다.
3. 해당 프로젝트가 Obsidian 노트, 런북, 로드맵 문서를 함께 관리하고 있었다면 변경 내역을 해당 문서에도 반영해 둔다.

### Step 2: 원본 대화 로그 및 한 줄 프롬프트 제공

1. 필요 시 참고할 수 있도록 현재 Antigravity 대화의 원본 로그 경로를 함께 안내한다:
   - `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`
2. 사용자가 Claude Code 또는 Codex 입력창에 그대로 복사해 붙여넣으면 즉시 맥락을 파악하고 이어갈 수 있는 **한 줄 인수인계 프롬프트**를 코드 블록으로 제공한다.

예시 형식:
```text
Antigravity에서 이어서 작업한 내용을 넘겨받으려고 해. 현재 워크트리(<워크트리_경로>, 브랜치 <브랜치명>)의 git diff와 <transcript.jsonl 경로 또는 요약 내용>을 확인하고, 남은 작업(<남은_항목>)부터 이어서 진행해줘.
```
