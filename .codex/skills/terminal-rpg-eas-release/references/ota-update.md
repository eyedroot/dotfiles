# iOS EAS Update

## Compatibility gate

An OTA update can only reach a binary that already contains `expo-updates`, an updates URL, a runtime version, and the target channel. Never publish first and infer compatibility afterward.

1. Inspect the current project and shipped iOS binaries:

   ```bash
   rg 'expo-updates|runtimeVersion|updates|channel' package.json app.json eas.json
   eas build:list --platform ios --limit 10 --json --non-interactive
   eas channel:view production --json --non-interactive
   eas update:list --all --platform ios --limit 10 --json --non-interactive
   ```

2. Classify the requested change:

   - JavaScript, TypeScript, translations, and bundled assets may be OTA-compatible when the runtime matches
   - Native dependencies, config plugins, entitlements, permissions, Info.plist values, native assets, or other native configuration require a new binary
   - Database and persisted-state changes require backward-compatible migrations because older binaries may still run

3. Compare the target build's runtime version and channel with the proposed update. Stop rather than publishing when they cannot match

   ```bash
   eas fingerprint:compare --build-id BUILD_ID --environment production --json --non-interactive
   ```

## First-time setup

The 2026-09-04 project baseline did not include `expo-updates`. Verify the current checkout before relying on that fact.

- If the user asks only to publish an OTA update and no compatible binary exists, explain that one native setup build must ship first
- If the user asks to establish OTA support, use the current Expo SDK 57 documentation to install and configure it:

  ```bash
  bunx expo install expo-updates
  eas update:configure
  ```

- Inspect every generated change, choose a runtime policy compatible with the current SDK and project, and run the full verification suite
- Rebuild and submit a production iOS binary before publishing an update for that runtime
- Reintroduce `build.production.channel: "production"` only after `expo-updates` is configured

## Publish an OTA update

After compatibility and user intent are both verified:

```bash
eas update \
  --channel production \
  --platform ios \
  --environment production \
  --message "DESCRIPTION"
```

- `--message` describes an EAS Update and is unrelated to the Enterprise-only TestFlight submission `changelog`
- Do not publish to Android unless the user explicitly requests Android
- Do not use OTA to bypass a required App Store binary review

## Verify delivery

1. Read back the update and channel mapping:

   ```bash
   eas channel:view production --json --non-interactive
   eas update:list --all --platform ios --limit 10 --json --non-interactive
   ```

2. Confirm the update runtime matches the intended TestFlight or App Store build
3. Compare the published update and target build fingerprints:

   ```bash
   eas fingerprint:compare --build-id BUILD_ID --update-id UPDATE_ID --json --non-interactive
   ```

4. Validate on a real iPhone using that binary, including a cold relaunch and the changed behavior
5. Report the update group ID, channel, runtime version, platforms, source revision, and device verification result

Do not claim OTA completion from a successful upload alone; compatibility and device application are separate evidence.
