#!/bin/sh
# 전역 git 훅 디스패처.
# 1) 전역 로직을 수행하고 2) 저장소 자체 훅(.git/hooks/<이름>)이 있으면 이어서 실행한다.
# core.hooksPath가 전역으로 지정되면 git이 저장소별 .git/hooks를 보지 않으므로,
# 여기서 직접 체이닝해 기존 저장소 훅이 계속 동작하도록 보장한다.

hook_name=$(basename "$0")

# --- 전역 로직: 새 worktree 생성 시 gitignore된 파일 채워 넣기 ---
# git worktree add 직후 post-checkout이 flag=1로 새 worktree 안에서 실행되는 것을 이용한다.
if [ "$hook_name" = "post-checkout" ] && [ "$3" = "1" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  case "$common" in
    */.git)
      # bare 저장소(dotfiles 등)나 submodule은 */.git 형태가 아니므로 자동 제외된다.
      main=${common%/.git}
      cur=$(git rev-parse --show-toplevel 2>/dev/null)
      if [ -n "$cur" ] && [ "$cur" != "$main" ]; then
        # 의존성 디렉토리는 반드시 실체로 만든다.
        # 심볼릭 링크로 걸면 composer 오토로더가 링크를 풀어낸 실경로를 기준으로 삼아
        # worktree가 아니라 본 저장소의 앱 코드를 로드한다.
        # cp -c는 APFS clonefile이라 즉시 끝나고 디스크는 이후 변경분만 차지한다.
        for d in vendor node_modules; do
          if [ ! -e "$cur/$d" ] && [ -e "$main/$d" ]; then
            cp -Rc "$main/$d" "$cur/$d" 2>/dev/null || cp -R "$main/$d" "$cur/$d"
          fi
        done

        # 환경 설정은 링크로 건다. 복사하면 본 저장소에서 값을 고쳤을 때 worktree 쪽이 낡는다.
        # 절대 경로 링크는 컨테이너에 다른 경로로 마운트되면 깨지므로 상대 경로로 만든다.
        for f in .env; do
          [ -e "$cur/$f" ] && continue
          [ -f "$main/$f" ] || continue
          case "$cur" in
            "$main"/*)
              up=$(printf '%s' "${cur#"$main"/}" | tr -cd '/' | wc -c | tr -d ' ')
              prefix=""
              i=0
              while [ "$i" -le "$up" ]; do
                prefix="../$prefix"
                i=$((i + 1))
              done
              ln -s "$prefix$f" "$cur/$f"
              ;;
            *)
              cp "$main/$f" "$cur/$f"
              ;;
          esac
        done

        # composer.lock이 gitignore된 저장소는 버전 고정을 위해 복사로 맞춰준다.
        f=composer.lock
        if [ ! -f "$cur/$f" ] && [ -f "$main/$f" ] && git -C "$cur" check-ignore -q "$f" 2>/dev/null; then
          cp "$main/$f" "$cur/$f"
        fi

        # IDE 코드 스타일과 검사 프로필은 gitignore 되어 있으면 본 저장소 것을 복사한다.
        # 없으면 IDE 기본 스킴으로 돌아가 파라미터 정렬 같은 꺼 둔 옵션이 되살아난다.
        for d in .idea/codeStyles .idea/inspectionProfiles; do
          if [ ! -e "$cur/$d" ] && [ -d "$main/$d" ] && git -C "$cur" check-ignore -q "$d" 2>/dev/null; then
            mkdir -p "$(dirname "$cur/$d")"
            cp -R "$main/$d" "$cur/$d"
          fi
        done
      fi
      ;;
  esac
fi

# --- 저장소 자체 훅 체이닝 ---
repo_hooks_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/hooks
if [ -x "$repo_hooks_dir/$hook_name" ]; then
  exec "$repo_hooks_dir/$hook_name" "$@"
fi
exit 0
