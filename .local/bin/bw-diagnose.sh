#!/bin/bash
# Bitwarden SSH Agent 진단 스크립트
# 결과를 ~/.local/bin/diagnose-result.txt에 저장합니다.

OUTPUT="$HOME/.local/bin/diagnose-result.txt"

echo "=== Bitwarden SSH Agent 진단 결과 ===" > "$OUTPUT"
echo "날짜: $(date)" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 1. ~/.ssh/config 내용 (ForwardAgent 확인)
echo "--- [1] ~/.ssh/config ---" >> "$OUTPUT"
if [ -f "$HOME/.ssh/config" ]; then
    cat "$HOME/.ssh/config" >> "$OUTPUT"
else
    echo "(파일 없음)" >> "$OUTPUT"
fi
echo "" >> "$OUTPUT"

# 2. Bitwarden 설치 유형 (App Store vs .dmg)
echo "--- [2] Bitwarden 설치 유형 ---" >> "$OUTPUT"
if [ -d "/Applications/Bitwarden.app" ]; then
    RECEIPT=$(mdls -name kMDItemAppStoreHasReceipt /Applications/Bitwarden.app 2>/dev/null | awk '{print $3}')
    if [ "$RECEIPT" = "1" ]; then
        echo "설치 유형: App Store 버전" >> "$OUTPUT"
    else
        echo "설치 유형: .dmg (직접 다운로드) 버전" >> "$OUTPUT"
    fi
    # codesign으로 추가 확인
    echo "codesign 정보:" >> "$OUTPUT"
    codesign -dv /Applications/Bitwarden.app 2>&1 | grep -E "TeamIdentifier|Authority" >> "$OUTPUT"
else
    echo "Bitwarden.app이 /Applications에 없습니다." >> "$OUTPUT"
fi
echo "" >> "$OUTPUT"

# 3. Bitwarden 버전
echo "--- [3] Bitwarden 버전 ---" >> "$OUTPUT"
if [ -d "/Applications/Bitwarden.app" ]; then
    VERSION=$(mdls -name kMDItemVersion /Applications/Bitwarden.app 2>/dev/null | awk '{print $3}' | tr -d '"')
    echo "버전: $VERSION" >> "$OUTPUT"
else
    echo "(확인 불가)" >> "$OUTPUT"
fi
echo "" >> "$OUTPUT"

# 4. SSH_AUTH_SOCK 환경변수
echo "--- [4] SSH_AUTH_SOCK ---" >> "$OUTPUT"
echo "SSH_AUTH_SOCK=$SSH_AUTH_SOCK" >> "$OUTPUT"
if [ -n "$SSH_AUTH_SOCK" ]; then
    if [ -e "$SSH_AUTH_SOCK" ]; then
        echo "소켓 파일 존재: YES" >> "$OUTPUT"
        ls -la "$SSH_AUTH_SOCK" >> "$OUTPUT" 2>&1
    else
        echo "소켓 파일 존재: NO (파일이 없거나 끊어짐)" >> "$OUTPUT"
    fi
else
    echo "SSH_AUTH_SOCK이 설정되지 않았습니다." >> "$OUTPUT"
fi
echo "" >> "$OUTPUT"

# 5. ssh-add -L 결과
echo "--- [5] ssh-add -L (등록된 키 목록) ---" >> "$OUTPUT"
ssh-add -L >> "$OUTPUT" 2>&1
echo "" >> "$OUTPUT"

# 6. Bitwarden 프로세스 상태
echo "--- [6] Bitwarden 프로세스 ---" >> "$OUTPUT"
ps aux | grep -i "[B]itwarden" >> "$OUTPUT" 2>&1
echo "" >> "$OUTPUT"

# 7. .zshrc에 bw-fix alias 존재 여부
echo "--- [7] .zshrc bw-fix alias 확인 ---" >> "$OUTPUT"
if [ -f "$HOME/.zshrc" ]; then
    ALIAS_LINE=$(grep "bw-fix" "$HOME/.zshrc" 2>/dev/null)
    if [ -n "$ALIAS_LINE" ]; then
        echo "이미 존재: $ALIAS_LINE" >> "$OUTPUT"
    else
        echo "bw-fix alias 없음" >> "$OUTPUT"
    fi
else
    echo ".zshrc 파일 없음" >> "$OUTPUT"
fi
echo "" >> "$OUTPUT"

echo "=== 진단 완료 ===" >> "$OUTPUT"

echo "진단 완료! 결과가 $OUTPUT 에 저장되었습니다."
cat "$OUTPUT"
