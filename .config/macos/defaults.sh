#!/bin/bash

# =============================================================================
# macOS Defaults Configuration
# ~/.config/macos/defaults.sh
#
# Usage: bash ~/.config/macos/defaults.sh
# Some settings may require a logout/restart to take effect.
# =============================================================================

echo ""
echo "macOS Defaults Configuration"
echo "----------------------------"
echo ""

# =============================================================================
# Dock
# =============================================================================
echo "  [1/7] Configuring Dock..."

# Dock 자동 숨김
defaults write com.apple.dock autohide -bool true

# Dock 숨김/표시 딜레이 제거 (즉시 반응)
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0.3

# Dock 아이콘 크기
defaults write com.apple.dock tilesize -int 48

# 최근 사용 앱 표시 끄기
defaults write com.apple.dock show-recents -bool false

# 미션 컨트롤 애니메이션 속도
defaults write com.apple.dock expose-animation-duration -float 0.1

# =============================================================================
# Finder
# =============================================================================
echo "  [2/7] Configuring Finder..."

# 숨김 파일 표시
defaults write com.apple.finder AppleShowAllFiles -bool true

# 파일 확장자 항상 표시
defaults write NSGlobalDomain AppleShowAllExtensions -bool true

# 경로 막대 표시
defaults write com.apple.finder ShowPathbar -bool true

# 상태 막대 표시
defaults write com.apple.finder ShowStatusBar -bool true

# 기본 Finder 뷰를 리스트로
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"

# 휴지통 비우기 전 경고 끄기
defaults write com.apple.finder WarnOnEmptyTrash -bool false

# 종류(Kind)로 그룹화
defaults write com.apple.finder FXPreferredGroupBy -string "Kind"

# 종류(Kind)로 정렬
defaults write com.apple.finder FXPreferredSortBy -string "Kind"

# 기존 폴더별 뷰 설정 초기화 (홈 디렉토리 내 .DS_Store 제거)
# .DS_Store에 저장된 개별 폴더 설정이 기본값을 덮어쓰므로 제거해야 일괄 적용됨
find "$HOME" -name ".DS_Store" -type f -delete 2>/dev/null

# 리스트 뷰 기본 폰트 크기 14
/usr/libexec/PlistBuddy -c "Set :StandardViewSettings:ListViewSettings:textSize 14" ~/Library/Preferences/com.apple.finder.plist

# .DS_Store 파일 네트워크 드라이브에 생성 안 함
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true

# .DS_Store 파일 USB 드라이브에 생성 안 함
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true

# =============================================================================
# Keyboard & Input
# =============================================================================
echo "  [3/7] Configuring Keyboard & Input..."

# 키 반복 속도 (낮을수록 빠름)
defaults write NSGlobalDomain KeyRepeat -int 1

# 키 반복 시작 딜레이 (낮을수록 빠름)
defaults write NSGlobalDomain InitialKeyRepeat -int 10

# 자동 대문자 끄기
defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool false

# 자동 맞춤법 교정 끄기
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

# 스마트 따옴표 끄기 (코드 복붙할 때 중요!)
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false

# 스마트 대시 끄기
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false

# 자동 마침표 끄기
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false

# =============================================================================
# Trackpad & Mouse
# =============================================================================
echo "  [4/7] Configuring Trackpad..."

# 탭해서 클릭
defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true

# 세 손가락 드래그 활성화
defaults write com.apple.AppleMultitouchTrackpad TrackpadThreeFingerDrag -bool true

# 트래킹 속도
defaults write NSGlobalDomain com.apple.trackpad.scaling -float 3.0

# =============================================================================
# Screenshots
# =============================================================================
echo "  [5/7] Configuring Screenshots..."

# 스크린샷 저장 위치 변경 (폴더가 없으면 생성)
mkdir -p ~/Screenshots
defaults write com.apple.screencapture location -string "~/Screenshots"

# 스크린샷 포맷 (png, jpg, pdf 등)
defaults write com.apple.screencapture type -string "png"

# 스크린샷 그림자 제거
defaults write com.apple.screencapture disable-shadow -bool true

# 스크린샷 파일명에서 날짜 포맷
defaults write com.apple.screencapture name -string "Screenshot"

# =============================================================================
# Developer
# =============================================================================
echo "  [6/7] Configuring Developer settings..."

# Safari 개발자 메뉴 활성화
defaults write com.apple.Safari IncludeDevelopMenu -bool true
defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true

# Xcode 빌드 시간 표시
defaults write com.apple.dt.Xcode ShowBuildOperationDuration -bool true

# 크래시 리포터를 알림 형태로 (none, basic, developer)
defaults write com.apple.CrashReporter DialogType -string "none"

# =============================================================================
# Productivity & UI
# =============================================================================
echo "  [7/7] Configuring Productivity & UI..."

# 윈도우 애니메이션 속도 빠르게
defaults write NSGlobalDomain NSWindowResizeTime -float 0.1

# 저장 패널 기본으로 확장
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode2 -bool true

# 프린트 패널 기본으로 확장
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint -bool true
defaults write NSGlobalDomain PMPrintingExpandedStateForPrint2 -bool true

# 앱 종료 시 윈도우 상태 저장 안 함
defaults write NSGlobalDomain NSQuitAlwaysKeepsWindows -bool false

# 텍스트 선택 시 빠른 복사 (터미널 등에서 유용)
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false

# =============================================================================
# Restart affected processes
# =============================================================================
echo ""
echo "Restarting affected processes..."

killall Dock
killall Finder
killall SystemUIServer

echo ""
echo "Done. All defaults have been applied."
echo "Note: Some settings require a logout or restart to take effect."
