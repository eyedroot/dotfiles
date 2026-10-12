---
name: confluence-page-editing
description: Confluence 페이지를 Atlassian MCP 도구(getConfluencePage, updateConfluencePage, createConfluencePage)로 읽고 고치거나 새로 만들 때 사용. 형광펜·밑줄·표 열 너비·이미지 캡션 같은 기존 서식을 잃지 않도록 ADF 형식으로 읽고 쓰는 절차와, 올린 뒤 원본과 대조해 검증하는 절차를 담고 있다. "위키 페이지 수정해줘", "Confluence 문서 업데이트", "페이지 문장 고쳐서 반영", "Atlassian 위키에 반영" 요청에 적용한다. 페이지를 읽기만 할 때는 필요 없다.
---

# Confluence 페이지 편집

Atlassian MCP의 `updateConfluencePage`는 `contentFormat`에 따라 본문을 다르게 변환해 저장한다. 변환 과정에서 기존 서식이 사라지거나 깨지는 경우가 있으므로, 기존 페이지를 고칠 때는 ADF(Atlassian Document Format) JSON을 그대로 읽고 그대로 쓴다.

## 형식별로 생기는 문제

| contentFormat | 읽을 때 | 쓸 때 |
| --- | --- | --- |
| `markdown` | 형광펜, 밑줄, 글자색, 표 열 너비, 이미지와 캡션, 노드 localId가 빠진다 | 위 서식이 모두 사라진 페이지로 덮어쓴다 |
| `html` | 서식은 보이지만 round-trip이 완전하지 않다 | 형광펜 `<span style="background-color: ...">`가 `backgroundColor` 마크와 **같은 색의 `textColor` 마크 두 개**로 저장돼 글자가 배경에 묻혀 보이지 않는다 |
| `adf` | 저장된 그대로 받는다 | 받은 JSON을 그대로 돌려보내므로 손대지 않은 부분은 바뀌지 않는다 |

`html`로 올린 뒤 markdown으로 다시 읽어 확인하면 글자가 멀쩡히 보이므로 문제를 놓친다. 검증도 반드시 `adf`로 한다.

## 기존 페이지를 고치는 절차

0. 사용자가 "검토만", "수정하지 마", "제안만"이라고 했으면 읽기까지만 하고 끝낸다.
1. `getConfluencePage(contentFormat="adf")`로 읽는다. 내용 파악이 목적이면 `markdown`으로 한 번 더 읽어도 되지만, 수정의 기준 본문은 ADF다.
2. 응답의 `body`(`{"type":"doc", ...}`)를 스크래치 디렉터리에 `before.json`으로 저장한다.
3. 바꿀 문장을 `[원문, 수정문]` 쌍의 JSON 배열로 적고 `scripts/adf_tools.py replace`로 적용한다. 스크립트는 각 원문이 텍스트 노드 안에서 정확히 한 번만 매칭될 때만 바꾸고, 0번이거나 2번 이상이면 멈춘다.
   - 형광펜 구간과 인라인 코드가 번갈아 나오는 문장은 텍스트 노드가 여러 개로 쪼개져 있다. 이때는 노드 경계에 맞춰 원문을 나눠서 적는다. 노드 경계는 `scripts/adf_tools.py text`로 확인한다.
   - `marks`(strong, code, backgroundColor, underline 등)와 `attrs`(colwidth, localId, media id, collection)는 건드리지 않는다. 글자만 바꾼다.
4. `updateConfluencePage(contentFormat="adf", body=<after.json 내용 문자열>, versionMessage="...")`로 올린다. `getContentFormatGuide`는 `html`일 때만 필요하다.
5. 다시 `getConfluencePage(contentFormat="adf")`로 읽어 `verify.json`으로 저장하고 `scripts/adf_tools.py diff --before before.json --after verify.json`을 돌린다. 바뀐 텍스트 노드가 3에서 적은 쌍과 같은지, 새로 생긴 `textColor` 마크가 없는지 확인한다.
6. 사용자에게는 바꾼 문장 전후, 버전 번호, 검증 결과를 보고한다. 바꾸지 않은 제안은 바꾸지 않았다고 따로 적는다.

```bash
SKILL_DIR="$HOME/.codex/skills/confluence-page-editing"
python3 "$SKILL_DIR/scripts/adf_tools.py" text --in before.json
python3 "$SKILL_DIR/scripts/adf_tools.py" replace --in before.json --out after.json --edits edits.json
python3 "$SKILL_DIR/scripts/adf_tools.py" diff --before before.json --after verify.json
```

## 이미 html로 올려 형광펜 글자가 사라졌을 때

1. `adf`로 읽어 `broken.json`으로 저장한다.
2. `scripts/adf_tools.py strip-textcolor --in broken.json --out fixed.json`을 돌린다. 배경색과 같은 색의 `textColor` 마크만 제거한다.
3. `fixed.json`을 `contentFormat="adf"`로 올리고, 5번 절차대로 다시 읽어 `textColor`가 남아 있지 않은지 확인한다.

## 새 페이지를 만들 때

- 형광펜·글자색·열 너비가 필요 없으면 `createConfluencePage(contentFormat="markdown")`로 충분하다.
- 서식이 필요하면 ADF로 작성한다. `html`로 만들었다면 만든 직후 `adf`로 읽어 `strip-textcolor`를 한 번 돌린다.

## 하지 않는 것

- `markdown`으로 읽은 본문을 그대로 `updateConfluencePage`에 넘기지 않는다.
- 본문 전체를 손으로 다시 타이핑해서 올리지 않는다. 바꿀 문장만 치환한다.
- 사용자가 "포맷은 그대로"라고 했으면 불릿 계층, 굵게 위치, 문장 끝 마침표 유무, 표 구조를 바꾸지 않는다.
- 사용자가 고쳐 달라고 한 항목 밖의 문장은 고치지 않는다. 더 고치고 싶은 곳은 제안으로만 적는다.
