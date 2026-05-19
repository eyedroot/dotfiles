-- ============================================================
-- Hammerspoon Configuration
-- ============================================================

-- adb 절대경로 (homebrew 기준)
local ADB = "/opt/homebrew/bin/adb"

-- ============================================================
-- Android Emulator: 스크린샷을 클립보드로 (Cmd+Option+S)
-- ============================================================
hs.hotkey.bind({ "cmd", "alt" }, "S", function()
  local tmpPath = "/tmp/android-screen.png"
  local cmd = string.format(
    [[%s exec-out screencap -p > %s && osascript -e 'set the clipboard to (read (POSIX file "%s") as «class PNGf»)']],
    ADB,
    tmpPath,
    tmpPath
  )

  hs.task
    .new("/bin/zsh", function(exitCode, _, stdErr)
      if exitCode == 0 then
        hs.alert.show("📋 Android 스크린샷 복사됨", 1)
      else
        hs.alert.show("❌ 실패: " .. (stdErr or "unknown"), 2)
      end
    end, { "-c", cmd })
    :start()
end)

-- ============================================================
-- Config Reload (Cmd+Option+R)
-- ============================================================
hs.hotkey.bind({ "cmd", "alt" }, "R", function()
  hs.reload()
end)

hs.alert.show("Hammerspoon config loaded ✅", 1)
