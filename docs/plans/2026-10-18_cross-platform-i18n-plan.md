# Android and Web internationalization plan

## Goal

Add complete UI localization to the Android app and Web UI for the 18 languages below. Use English (`en`) for first use and as the fallback. Let users change and save their language without an account. Preserve mock playback, local data, cloud sessions, remote control, and existing URLs.

Implementation is on `narumi/feat/cross-platform-i18n`, based on `origin/main` at `faae335`. The newer 15 km/h and PingPong route defaults are preserved. Unchecked items remain acceptance requirements; qualified translation review and missing screenshot references block completion.

## Context (pre-change baseline)

- Android uses Kotlin, Compose, and Material 3. Most UI text is inline, including navigation labels, accessibility descriptions, validation, and operation results. `app/src/main/res/values/strings.xml` contains the app name and foreground-service text.
- `MainActivity.kt` extends `ComponentActivity`. `Theme.Kestrel` inherits a platform theme, not an AppCompat theme. Android supports API 29 and later; API 33 introduces platform per-app languages.
- `core/data/Preferences.kt` owns existing DataStore settings. Serialized settings must retain their forward-compatible behavior.
- Web uses Next.js App Router and React, with Radix components. `web/package.json` has no i18n dependency. `web/app/layout.tsx` sets `lang="en"` and English metadata.
- Web dates and name sorting include fixed English locales. Error helpers frequently display raw exception messages. Android `CloudApiException` already retains an optional server error code; Web `ApiError` currently retains only status and message.
- `.github/workflows/ci.yml` does not run Web's existing `npm test`. New catalog checks and tests must be connected to CI, not only documented.

## Language contract

Use these canonical BCP 47 tags in product documentation, Web catalogs, and locale tests. Android resource qualifiers map to the same language set.

| Language | Canonical tag | Android resource directory |
| --- | --- | --- |
| Traditional Chinese | `zh-TW` | `values-zh-rTW` |
| English | `en` | `values` (complete default catalog) |
| Japanese | `ja` | `values-ja` |
| Korean | `ko` | `values-ko` |
| Hindi | `hi` | `values-hi` |
| Spanish | `es` | `values-es` |
| French | `fr` | `values-fr` |
| Portuguese | `pt` | `values-pt` |
| Indonesian | `id` | `values-in` (Android legacy resource qualifier) |
| German | `de` | `values-de` |
| Vietnamese | `vi` | `values-vi` |
| Turkish | `tr` | `values-tr` |
| Filipino | `fil` | `values-b+fil` |
| Thai | `th` | `values-th` |
| Italian | `it` | `values-it` |
| Polish | `pl` | `values-pl` |
| Malay | `ms` | `values-ms` |
| Dutch | `nl` | `values-nl` |

- Effective language is a valid saved selection, otherwise `en`. Do not select a language automatically from browser headers or device language on first use.
- Honor an explicitly selected supported Android per-app language. Treat an empty selection or “system default” as the product default, `en`.
- Normalize case and standard aliases at input boundaries. Test Android's legacy Indonesian identifier. Map regional variants of supported language-only tags to their base language, such as `pt-BR` to `pt`.
- Map explicit Traditional Chinese variants (`zh-TW`, `zh-Hant`, and `zh-Hant-*`) to `zh-TW`. Do not treat bare `zh` or Simplified Chinese as Traditional Chinese; fall back to `en` when no supported match exists.
- Portuguese is one generic `pt` translation, not separate Brazilian and European catalogs. English and Spanish also use one catalog each. Set a glossary/style convention before translation review.
- Missing runtime messages use English without exposing keys or crashing. Missing translations still fail release checks; fallback does not count as completed localization.
- Keep language choices in a stable order. Show each language's native name and its English name, with a translated field label. Do not use flags.

## Architecture

### Android

Use Android resources (`string`, `plurals`, and resource arrays where needed), Compose `stringResource` / `pluralStringResource`, and resource lookup from a locale-aware context outside Compose. Do not add a custom translation engine or generate both platforms from one string file.

Use AndroidX AppCompat per-app locale support for API 29–32 and the platform integration for API 33+. Add AppCompat explicitly, migrate `MainActivity` to `AppCompatActivity`, and use a compatible no-action-bar host theme while retaining the existing Compose Material 3 theme. Prove this integration in the first Android task before migrating UI strings.

Use the AppCompat/platform locale store as the source of truth, not a second DataStore locale preference. Configure persistence below API 33 and supported-language metadata for API 33+. Initialize an empty or unsupported selection to explicit English before rendering UI. Verify upgrade behavior across API 32/33 and synchronization with Android Settings.

Locale changes can recreate the activity. Keep service execution independent of the activity. Preserve recoverable UI state and do not replay pending map links, OIDC callbacks, or commands. Update the running service's localized notification and channel labels without restarting playback or replacing channel IDs. Service resources must resolve the selected language on API 29–32 as well as API 33+.

Represent app-owned status and error state by stable identifiers plus arguments where text can survive a locale change. Resolve text at presentation time. Keep IDs, enum values, API payloads, persisted user content, and diagnostic logs independent of translated labels.

### Web

Add `next-intl` for App Router server/client messages, ICU interpolation and plurals, and locale-aware display formatting. Use `web/messages/en.json` as the source catalog, plus one catalog for each other canonical tag. Keep locale validation and request configuration in `web/i18n/`. Confirm compatibility with the repository's Next.js and React versions before UI migration.

Keep all existing route paths. Do not introduce a `[locale]` route segment, language redirects, or locale middleware. `/login`, `/login/oidc`, `/login/oidc/android`, `/dashboard/*`, `/share/[token]`, API routes, asset routes, and discovery routes must retain their meaning.

Read a validated, non-secret language cookie in the server request configuration. Missing or invalid cookies resolve to English. Set `<html lang>` and localized metadata from the same request locale and pass the same locale/messages to the client provider. Do not use a process-global mutable locale or a client-only storage lookup that changes the language after hydration.

Use a validated same-origin server action to save the cookie (`Path=/`, `SameSite=Lax`, persistent lifetime, `Secure` on HTTPS, `HttpOnly` since the server owns it), then refresh server-rendered content. Handle a failed write with a localized error. Account for cookie-dependent rendering and prevent shared caches from serving another user's language. Load only the active locale's catalog, plus English where fallback needs it; do not bundle all 18 catalogs into each client page.

Add one reusable Radix language selector. Put it in the existing Account settings and make it available on signed-out login and public share pages. Keep the locale provider stable so switching does not reset sessions, in-progress forms, route drafts, or map selection. Display the current language without requiring authentication.

### Shared presentation rules

- Translate app-owned labels, help text, validation, dialogs, empty/loading states, notifications, accessibility labels, keyboard help, map controls, marker labels, and app-controlled page metadata/error boundaries.
- Use full messages with named or positional arguments. Do not join translated sentence fragments. Escape interpolated user values; do not render translator-supplied HTML.
- Use locale plural rules, not an English singular/plural branch. Android and ICU plural categories can differ; validate each platform against its own rules.
- Format human-readable numbers, counts, distances, speeds, durations, and dates with the selected locale. Preserve current units and the user's time zone behavior; language selection must not silently change either.
- Keep coordinates used for editing/copying, URLs, JSON numbers, timestamps on the wire, identifiers, recovery codes, and protocol values in their existing machine-readable form. Explain decimal-point input where needed; localized display must not break parsing or round trips.
- Use locale-aware collation for alphabetical library/favorites sorting. Retain stable ID tie-breakers. Do not alter stored names, manual ordering, search identity, or route computation.
- Translate client errors by stable error code and operation context. For missing or unknown codes, show a useful localized generic error with safe status context. Do not match English server prose, expose raw response bodies, or weaken authentication behavior. Preserve actionable states such as reauthentication, throttling, and conflicts.
- Do not translate names, descriptions, tags, device names, OIDC provider names, brands, or other user/server-configured content. Do not rewrite saved default names; use localized defaults only when creating new content.
- Keep MapLibre and legally required attribution. Localize app-owned map UI only; basemap labels, third-party identity pages, scanner UI, and OS permission dialogs remain provider/OS controlled.

## Non-Goals

- Account-synced language settings, database migrations, backend message catalogs, or translation of documentation and external provider content.
- Locale-prefixed URLs, SEO alternate-language routes, extra regional catalogs, automatic language detection, or new unit/time-zone settings.
- A translation management service, runtime machine translation, or new RTL language support. All requested languages use left-to-right UI; retain existing RTL compatibility.
- Deployment, release, connected-device changes, or binary screenshot commits without separate approval.

## Plan

### 1. Establish coverage and translation rules

- [x] Inventory Android and Web user-visible text, including core-generated errors/status, map controls, notifications, metadata, callback pages, accessibility, and transient states. Source paths and exclusions are recorded and reviewed in `docs/i18n.md`.
- [x] Define the locale list, normalization cases, glossary, placeholder rules, and generic Portuguese convention in `docs/i18n.md`. Qualified language reviewers are not available in this checkout; language review is an explicit delivery dependency. Generated translations are drafts, not reviewed release translations.
- [x] Audit error-code coverage in both clients and `backend/src/http/`. `docs/i18n.md` records code/status handling, uncoded-response fallbacks, and raw-body exclusions. Backend protocol changes are excluded; implementation checks remain below.

### 2. Prove locale selection and persistence

- [x] Implement the Android AppCompat activity/theme integration, locale configuration, and storage behavior. Prove English first launch on a non-English device, saved selection after process restart, API 29–32 behavior, API 33+ Settings changes, and English fallback before extracting all UI text. Use automated tests where possible; obtain approval before emulator/device installation or instrumentation.
- [x] Add the Web `next-intl` dependency/configuration and locale cookie action, then connect the provider, document language, and metadata. Tests must prove English first response, supported/invalid cookie handling, request isolation, and matching server/client locale without hydration warnings.
- [x] Add language selection to Android's existing Settings and Web Account/login/share surfaces. Verify all 18 choices are keyboard/accessibility reachable and persisted without an account; preserve auth, drafts, and active mock state when switching.

### 3. Extract and validate the English source catalogs

- [x] Extract Android text from navigation, Map, Favorites, Settings, cloud/security flows, shared components, and core-owned user messages into English resources. Replace cached display strings and translated enum labels with late presentation lookup. Resource compilation and targeted JVM tests must pass.
- [x] Extract Web text from landing/login/registration/TOTP, OIDC callbacks, Map/Library/Account, remote control, public shares, common components, map helpers, and framework error/loading surfaces into namespaced English messages. Add typed message-key checks and verify no visible key names.
- [x] Introduce locale-aware formatters and name sorting on both platforms. Tests must cover decimal-comma display, Polish plurals, Turkish case behavior, stable ordering, and unchanged coordinate/API serialization and route calculations.
- [x] Replace raw UI error/status rendering with localized mappings and typed local state. Test known codes, missing codes, network failures, validation, expired sessions, rate limits, sync conflicts, and remote-command failures without changing retry or revocation semantics.
- [x] Refresh service notifications/channel labels and app-owned MapLibre text after language changes. Verify the active route, paused state, progress, service IDs, channel IDs, and marker positioning remain unchanged.

### 4. Supply all 17 translated catalogs

- [ ] Translate and review Traditional Chinese, Japanese, and Korean for both platforms. Verify Traditional Chinese script, glossary consistency, placeholders, and CJK layout; retain review evidence by locale.
- [ ] Translate and review Hindi, Indonesian, Vietnamese, Filipino, Thai, and Malay for both platforms. Verify Devanagari/Thai shaping, combining marks, line breaks, placeholders, and language identifiers; retain review evidence by locale.
- [ ] Translate and review Spanish, French, Portuguese, German, Turkish, Italian, Polish, and Dutch for both platforms. Verify plural branches, accents, terminology, and expanded labels; retain review evidence by locale.
- [x] Check every translated catalog against its platform's English catalog. Require complete keys, nonempty messages, matching argument names/types, valid XML/ICU, and required plural categories. Exclude only explicitly non-translatable values such as asset statements and brands. Review identical-to-English entries instead of rejecting valid shared terms automatically.

### 5. Add regression gates and UI evidence

- [x] Add deterministic catalog validation and locale tests, exposed as `just i18n-check`. Check the exact 18-language set and both platform mappings. Add regression fixtures that prove missing keys, bad placeholders, malformed messages, and invalid locales fail the gate.
- [x] Update `web/package.json` test discovery to include new i18n tests, and run Web tests plus catalog validation in `.github/workflows/ci.yml`. Update path filters so shared i18n scripts/metadata trigger the required checks. Add Android resource lint with missing-translation and formatting failures treated as errors.
- [x] Update tests that locate UI by English text to use stable semantic/test identifiers or locale-specific resource lookup. Test English fallback, restart persistence, changing language during errors, and preservation of pending callback/command state.
- [x] Verify Android screens and notifications in all 18 locales, including font scaling and long labels. Cover API 29–32 and API 33+ locale behavior. Use local JVM/resource tests and Compose previews first; keep installation/instrumentation pending until the target and state-change risk are approved.
- [x] Verify Web login, Map, Library, Account, and public share flows in all 18 locales through Chrome DevTools at the current review target: 1440×900, light mode. Check glyph coverage, line wrapping, keyboard/screen-reader labels, locale switching, draft retention, document language, metadata, hydration, and absence of untranslated app-owned text. Keep screenshots outside the repository; do not use Playwright.
- [ ] Run `just i18n-check`, `just android-check`, `just android-lint`, `just android-test`, `just android-ui`, `just android-build`, Android resource lint, `just web-check`, `cd web && npm test`, `just web-typecheck`, and `just web-build`. Use Java 26 and Node.js 22; run `npm ci` after dependency changes. Split long checks into observable steps and record failures or unavailable baselines as open items, not passes.
- [x] Document language selection, default/fallback behavior, source-catalog updates, translator review, and validation commands in `docs/i18n.md`, with links from Android/Web contributor documentation. Confirm only intended source/documentation files changed and no build caches or binary screenshots enter the diff.

## Verification Evidence

### Local checks

- Catalogs: `just i18n-check` passes for all 18 languages. Each Web catalog has 672 messages. Each Android language has 425 translated resources: 414 strings and 11 plurals across three XML files. Default-only asset statements remain non-translatable.
- Validator fixtures: 16 tests pass, including duplicate keys, malformed XML/ICU, missing locales, wrong argument types, unsupported rich tags, invalid Java format conversions/flags, and incomplete plural categories.
- Web: Node.js 22; `npm ci`, 174 tests, `just web-verify` (check, typecheck, production build), and actionlint pass. Biome reports 44 existing CSS warnings and one informational diagnostic; no errors. Production dependency audit reports zero vulnerabilities.
- Android: Java 26; `just android-check`, `just android-lint`, `just android-test` (243 tests, no skips/failures), `just android-resource-lint`, `just android-build`, and debug test-APK compilation pass. In-process Kotlin compilation avoids a stale daemon-cache failure encountered during parallel development; final Android checks run serially.
- Screenshot validation is **blocked**, not passed: `just android-ui` reports 31 `ScreenshotImageNotFoundException` errors because reference images are absent. No comparison failure is claimed. Do not add binary reference images to this repository.

### Browser evidence

Chrome 155 was controlled through the Chrome DevTools Protocol in an isolated profile, at 1440×900 in light mode. An isolated read-only API fixture supplied places, routes, sessions, and public shares; no existing backend or account data was changed.

All 18 languages were checked on login, Map, Library, Account, and public share pages: 90 screen checks, matching document language, no page overflow, no visible key names, and no runtime exceptions. Login and Map contact sheets were reviewed for all languages, including CJK, Devanagari, and Thai glyphs. A real Radix keyboard selection changed English to Japanese, retained login drafts, saved a persistent HttpOnly/SameSite cookie, and survived reload. An offline action produced a localized error without changing the selected language or crashing the form. Seven production HTTP checks also cover request isolation, invalid cookies, cookie security, and rejected cross-origin writes.

Screenshots and runtime logs are outside Git under `/private/tmp/kestrel-i18n-*`. These checks do not replace production-backend, real OIDC-provider, or physical remote-control integration tests.

### Android runtime evidence and remaining paths

Only disposable AOSP emulators are authorized; adb commands pin the serial and verify the AVD name. No personal device is used. Mutating locale test rules require explicit opt-in and emulator hardware before launching an Activity. An unflagged negative check skips the test without launching the app. Software Vulkan is required for this emulator's MapLibre renderer.

API 32 uses Japanese system language; API 33 uses French. Each platform passes 25 combined tests: five resource tests, locale recreation, playing/paused service preservation, and 17 existing interaction tests. Resource tests verify all 18 UI/service resource sets, reject silent English fallback, and cover Polish plurals, German decimal formatting, invariant coordinates, and late error resolution. Runtime checks preserve preview input, route identity/progress, paused location, notification/channel IDs and actions, and operation counts. A UI-selected Japanese language survives force-stop/relaunch. API 33 first launch selects English on the French host. A simulated upgrade seeds the actual API 32 Japanese AppCompat file and pre-migration component state on API 33; the framework locale and UI become Japanese without data clearing. An already-migrated empty framework selection correctly returns to English rather than importing a stale file.

The all-language layout test passes separately on API 32 at font scale 1.0 and API 33 at 1.5: 108 native captures across Map, Favorites, and Settings. Independent model visual review found one clipped Japanese/Korean Map action at large font. The sheet now scales with font size; unit tests and all 18 large-font layouts verify that the complete primary action stays above navigation. Japanese subtitle wording was shortened without removing safety information; the 320×360dp populated Favorites fixture and all 17 interaction tests pass in Japanese and English. Popup labels use the parent's locale-aware resources. Touch-target tests retain the 48dp minimum, and the Back/focus test enters real keyboard mode.

Playback teardown now uses one DataStore observer started before service actions, avoiding an observed initial-subscription/write overlap. Stop persistence was verified; no production service teardown change was needed. Two combined API 32 runs passed after this test fix. One earlier repeat timed out on the initial English notification before any language change; later final API 32/33 combined runs pass, but the intermittent readiness failure is retained as a test risk with field-level diagnostics. Missing screenshot comparison references remain blocked.

### Translation review status

All 17 translated language sets have complete literal drafts and passing structural validation. Each draft received model self-review. An independent model read all Filipino, Thai, and Malay messages and sampled critical authentication, QR approval, playback, conflict, and revocation messages in the other 14 languages. This is **not qualified human review**.

| Locale | Structural checks | Independent model coverage | Qualified human review |
| --- | --- | --- | --- |
| `zh-TW` | Pass | Critical-message sample | Pending |
| `ja` | Pass | Critical-message sample | Pending |
| `ko` | Pass | Critical-message sample | Pending |
| `hi` | Pass | Critical-message sample | Pending |
| `es` | Pass | Critical-message sample | Pending |
| `fr` | Pass | Critical-message sample | Pending |
| `pt` | Pass | Critical-message sample | Pending |
| `id` | Pass | Critical-message sample | Pending |
| `de` | Pass | Critical-message sample | Pending |
| `vi` | Pass | Critical-message sample | Pending |
| `tr` | Pass | Critical-message sample | Pending |
| `fil` | Pass | Full catalog read | Pending |
| `th` | Pass | Full catalog read | Pending |
| `it` | Pass | Critical-message sample | Pending |
| `pl` | Pass | Critical-message sample | Pending |
| `ms` | Pass | Full catalog read | Pending |
| `nl` | Pass | Critical-message sample | Pending |

Independent review corrected French loop-jump warning precision and Malay disclosure-state wording. Identical-to-English entries were reviewed as brands, protocol/unit templates, or valid shared technical terms, not copied English sentences. Qualified reviewers are unavailable; the translation-review tasks remain open.

### Code review

Independent Android and Web reviews covered correctness, security, lifecycle, compatibility, regressions, and scope. Findings led to destination-keyed draft retention, saveable Map inputs, consumption of completed OIDC callbacks before unrelated sync, invariant Turkish route-search aliases, and stricter Android format-specifier validation. Regression tests cover these fixes. Resource lint also required configuration-aware Compose resource reads and the API-29-compatible URLDecoder overload. Runtime review corrected the Indonesian `values-in` qualifier, popup locale inheritance, compact Japanese header text, and font-scaled sheet sizing; regression checks retain the original viewport, focus, and touch-target requirements. No backend schema/protocol or release/deployment change is included.

## Risks and Recovery

- AppCompat migration changes activity recreation and context behavior. Complete the locale integration proof before broad extraction. Keep locale changes separate from service start/stop actions and preserve single-task callback handling.
- Cookie-based Web locale makes rendering request-dependent. Verify production builds, cache isolation, and catalog loading; never use a module-global current language.
- Font coverage and text expansion can expose existing layout limits. Use system sans-serif fallbacks for CJK, Devanagari, and Thai before adding bundled font assets. Fix affected layouts rather than shortening required safety text.
- Eighteen complete languages require translation review. Missing reviewers or unavailable device/screenshot checks remain explicit blockers; do not move incomplete languages into a later plan to declare completion.
- No database or locale URL migration is needed. Before any separately authorized release, retain the previous build and complete English resources. Rollback must leave locale cookie/store values safely ignorable by older clients and preserve user data, sessions, and running-service semantics. Do not reset application data as recovery.

## Completion Checklist

- [ ] All 18 languages are selectable on both platforms; all 17 non-English catalogs are complete and reviewed, with evidence recorded by locale.
- [x] English is verified as the first-use and invalid-selection default even on non-English hosts. Valid saved selections survive restart and Web reload/sign-out.
- [x] App-owned UI, accessibility text, notifications, metadata, validation, and recoverable errors use the selected language. Documented external/user-content exclusions remain unchanged.
- [x] Locale formatting, plural rules, and collation are tested; coordinate parsing, API payloads, stable IDs, route generation, and manual sorting are unchanged.
- [x] Language changes preserve active playback, route drafts, user data, session retry behavior, and one-time callback/command handling across supported Android API levels and Web navigation.
- [x] Existing Web URLs, Android app links, OIDC callbacks, share tokens, proxy/assets, robots, sitemap, and discovery behavior remain compatible.
- [ ] Catalog checks, relevant Android/Web tests, lint, type checks, and builds pass locally and in CI. Required visual/device checks have evidence; unavailable checks remain open.
- [ ] `docs/i18n.md` describes the verified workflow. All plan tasks are checked before this plan is archived under `docs/plans/archived/`.
