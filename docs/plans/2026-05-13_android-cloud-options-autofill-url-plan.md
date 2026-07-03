# Android cloud Options autofill / URL validation plan

## Goal

Close the remaining manual validation for Android Options → Cloud sync login. Success means production URL aliasing works without typing `/api/backend`, and the current 1Password/autofill behavior is either accepted or captured as a concrete follow-up.

## Context

Already implemented and verified by code/tests:

- `CloudSettings.DEFAULT_API_BASE_URL = "https://kestrel.narumi.dev"`.
- `normalizeCloudApiBaseUrl()` maps `https://kestrel.narumi.dev` and `/api` to `/api/backend`, while preserving direct backend URLs such as `http://10.0.2.2:3000`.
- `CloudApiClient.normalizedBaseUrl()` is the single request-time normalization path.
- Options helper text explains the production default.
- Login fields use Compose content type / text data hints, and Android/Web credential association metadata exists for `kestrel.narumi.dev`.

Known gotcha: earlier Compose autofill attempts were worse with 1Password. Keep this plan manual-only unless a reproducible failure appears.

## Non-Goals

- Do not redesign cloud auth, session storage, TOTP, or recovery-code flow.
- Do not clear app data, uninstall/reinstall, run `just reset`, or wipe favorites/prefs for this validation.

## Plan

- [ ] On a real device with 1Password, test the signed-out Cloud sync form: username fills, password fills, TOTP/recovery field does not block manual entry, and sign-in remains possible; record device, Android version, 1Password version, and result here.
- [ ] Set the API URL field to `https://kestrel.narumi.dev`, sign in, and tap `Sync now`; verify success or a backend auth/sync error rather than a Web 404. If needed, confirm with filtered `just log` output.
- [ ] If autofill still fails, record the smallest reproducible field behavior and decide whether to keep the current safe workaround or file a focused follow-up.
- [ ] Run `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 just check && JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 just lint` if code changes are made while fixing validation findings.

## Completion Checklist

- [ ] 1Password username/password/TOTP behavior is manually verified or a focused follow-up is filed with reproduction details.
- [ ] Production URL alias login + `Sync now` is manually verified without typing `/api/backend`.
- [x] URL normalization behavior is unit-tested in `CloudApiBaseUrlTest.kt`.
- [x] Default production URL and Options helper text are present in source.
- [ ] Any code changes made during validation pass the Android quality gates above.
