---
name: terminal-rpg-eas-release
description: Terminal RPG Expo/EAS iOS delivery workflow. Use when working in /Users/eyedroot/Github/terminal-rpg and the user asks to configure, start, monitor, retry, or verify an iOS EAS production build, TestFlight submission, or EAS Update. Do not apply it to Android delivery unless the user explicitly expands the scope.
---

# Terminal RPG EAS Release

Work from `/Users/eyedroot/Github/terminal-rpg` and read its `AGENTS.md` before acting.

## Route the request

- For a new iOS binary, TestFlight upload, submission retry, or build status check, read [references/ios-testflight.md](references/ios-testflight.md)
- For an OTA update, update compatibility check, or EAS Update setup, read [references/ota-update.md](references/ota-update.md)
- If the request mixes both, determine whether the changes require a native binary first, then follow the references in that order

## Fixed project context

- Expo project: `@byzz/terminal-rpg`
- EAS project ID: `82e2a690-d2c0-4d88-80e7-f3150c1f8c86`
- iOS bundle identifier: `com.eyedroot.terminalrpg`
- App Store Connect app ID: `6808637240`
- TestFlight internal group: `Team (Expo)`
- The user currently wants iOS delivery only; do not start Android builds or submissions
- Use direct `eas` commands. Do not substitute `npx testflight` unless the user explicitly asks for that wrapper
- The Expo plan baseline on 2026-09-04 is Starter. Do not pass `--what-to-test` unless current plan support is verified: EAS CLI maps it to the submission `changelog`, whose scheduled submission path was rejected as Enterprise-only on that baseline

Treat the account plan, tool versions, credentials, build IDs, runtime versions, and remote status as live facts. Verify them every time rather than relying on this snapshot.

## Shared safeguards

- Inspect Git status, the requested source revision, `app.json`, `eas.json`, and current EAS state before creating work
- Check current official Expo documentation when EAS CLI flags, plan availability, SDK behavior, or store requirements may have changed
- Do not start a duplicate build or submission when an equivalent one is queued, running, or already finished
- Never request Apple passwords or two-factor codes in chat. Pause at authentication and have the user enter them in their own terminal
- Do not expose or commit `.p8`, `.p12`, `.mobileprovision`, passwords, access tokens, or API key material
- Do not commit or push release configuration changes unless the user explicitly requests it
- Report build, submission, and TestFlight processing as separate states; one does not prove the next
