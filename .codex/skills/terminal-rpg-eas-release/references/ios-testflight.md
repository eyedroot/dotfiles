# iOS EAS Build and TestFlight

## Preflight

1. Inspect the exact source and remote state:

   ```bash
   git status --short --branch
   git log -1 --oneline --decorate
   git fetch --prune origin
   git rev-list --left-right --count HEAD...origin/main
   ```

   Identify whether the user wants the current working tree or a committed revision. EAS Build can upload a dirty working tree, so do not silently assume that a displayed Git commit contains every uploaded change.

2. Inspect and validate the EAS project:

   ```bash
   eas --version
   eas whoami
   eas project:info
   eas build:version:get --platform ios --profile production --json
   eas build:list --platform ios --build-profile production --distribution store --app-identifier com.eyedroot.terminalrpg --limit 50 --json --non-interactive
   eas submit:list --platform ios --limit 50 --json --non-interactive
   eas submit:status --platform ios --profile production --json --non-interactive
   ```

3. Verify local configuration:

   - `app.json` must use `com.eyedroot.terminalrpg`
   - `ios.config.usesNonExemptEncryption` is `false` only while the app uses no encryption beyond Apple's exempt categories
   - `eas.json` uses remote app versions and production `autoIncrement: true`
   - `submit.production.ios.ascAppId` should be `6808637240` after the first App Store Connect setup. Add it when a requested release setup includes configuration and the value is missing
   - Do not add an EAS Update `channel` to a build profile unless `expo-updates` is installed and configured

4. Run verification proportional to the change. For a release candidate, use the complete project checks:

   ```bash
   bun run typecheck
   bun run lint
   bun test
   bun run format:check
   bun run expo:check
   bun run doctor
   ```

## New binary with automatic submission

Use the production build and submit profiles with the same name:

```bash
eas build --platform ios --profile production --auto-submit
```

- Do not pass `--what-to-test` on the Starter plan unless current plan support is verified
- If a label is useful in EAS Build, use `--message`, which labels the build without populating TestFlight release notes
- Apple login, certificate, provisioning profile, or API key prompts may appear on the first run. Let the user enter password and two-factor authentication locally
- Prefer EAS-managed remote signing credentials unless the repository has an explicit local-credentials policy

## Recover a failed automatic submission

If the binary build is still running, wait for it instead of creating another build. Once it is `FINISHED`, submit that build ID without release notes:

```bash
eas submit \
  --platform ios \
  --profile production \
  --id BUILD_ID \
  --groups "Team (Expo)" \
  --no-auto-testflight-setup \
  --wait
```

- Before using the command, verify that `Team (Expo)` exists and the intended tester is already a member. If the group is missing, omit `--groups` and use `--auto-testflight-setup` for the one-time setup instead
- Confirm there is no finished submission for the same build before retrying
- Page through `eas submit:list` until entries predate the target build. Treat `awaiting-build`, `in-queue`, `in-progress`, and `finished` submissions whose `submittedBuild.id` matches as duplicates
- If a matching failed submission has a submission ID and is retryable, inspect it and prefer `eas submit:retry SUBMISSION_ID` over creating another submission
- A submission scheduling failure does not imply the build failed
- If only TestFlight release notes are missing, set them in App Store Connect unless current EAS plan documentation explicitly confirms CLI support

## Monitor to completion

- Prefer Expo MCP `build_info` and `build_list` when available; otherwise use `eas build:view` and `eas build:list`
- For every candidate, confirm `buildProfile: production`, `distribution: STORE`, `appIdentifier: com.eyedroot.terminalrpg`, `status: FINISHED`, a present `.ipa`, and the intended source revision, app version, and build number
- Use `eas submit:list`, `eas submit:view`, or `eas submit:status` for submission and App Store Connect state
- Wait with increasing intervals. Do not report completion while the build or submission is queued or processing
- Distinguish these milestones:
  1. EAS Build is `FINISHED` and has an `.ipa`
  2. EAS Submit is `FINISHED`
  3. Apple finishes processing and the build appears in TestFlight
  4. App Store Connect or submission logs confirm assignment to `Team (Expo)`
  5. The tester can install and launch it on the intended iPhone

Include the build ID, app version, build number, submission ID, relevant dashboard links, and any remaining Apple processing step in the final report.
