## Goal

在 Options 加一個最小的「Map links」區塊，讓使用者知道 Kestrel 支援 `geo:` 與 Google Maps 座標連結，並能一鍵跳到 Android 的 Kestrel link/default 設定頁；可選再提供一個 `geo:25.033,121.565` 測試按鈕。

成功條件：Options 內能看到說明、能開啟系統 link/default 設定，且測試按鈕不需要新權限或新依賴。

## Context

- PR #131 已讓 `MainActivity` 支援 `geo:`、`maps.google.com`、`google.com/maps`、`www.google.com/maps` 的 `ACTION_VIEW` intent。
- Android 不允許 app 直接把自己設成預設地圖 app；只能把使用者帶到系統設定或丟出 resolver。
- `OptionsScreen.kt` 已有 `KestrelActionRow`、`KestrelCard`、`KestrelSectionHeader` 可重用，不需要新增 UI abstraction。

## Non-Goals

- 不在 app 內直接切換或強制改 Android 預設 app。
- 不保證接管 `google.com/maps` verified links；只在 UI 說明這是系統/使用者設定限制。
- 不新增 DataStore 設定，因為這不是 app 內狀態。

## Plan

- [x] 在 `OptionsScreen.kt` 新增 `MapLinksOptionsCard` composable，顯示支援 `geo:` / Google Maps links 與「Google links may still be handled by Android/Google Maps」限制；驗證方式為 `just android-check` 編譯/格式通過。_Verified 2026-06-20: implemented as `app/src/main/java/dev/narumi/kestrel/feature/options/MapLinksOptionsCard.kt` to avoid `OptionsScreen.kt` TooManyFunctions; `just android-check` passed._
- [x] 在 `OptionsScreen` 的 Cloud sync 之後加入 `MapLinksOptionsCard`，讓入口出現在 Options 頁面上方；驗證方式為讀碼確認 card 位於 `CloudSettingsSection()` 後，且 preview/compile 不需要額外 state。_Verified 2026-06-20: `OptionsScreen()` calls `CloudSettingsSection()` then `MapLinksOptionsCard()`; `just build` passed._
- [x] 實作 `Open Android link settings` 按鈕：Android 12+ 使用 `Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS` + `package:` data，舊版 fallback 到 `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`；驗證方式為 `just android-check`，並在測試裝置按鈕可開啟 Kestrel 設定頁。_Verified 2026-06-20: button calls `Context.openMapLinkSettings()` with `ACTION_APP_OPEN_BY_DEFAULT_SETTINGS`, `package:` data, and `Settings.EXTRA_APP_PACKAGE`, falling back to app details; smoke equivalent `adb shell am start -W -a android.settings.APP_OPEN_BY_DEFAULT_SETTINGS -d 'package:dev.narumi.kestrel' --es android.provider.extra.APP_PACKAGE dev.narumi.kestrel` opened `com.android.settings/.applications.InstalledAppOpenByDefaultActivity` with `Status: ok`._
- [x] 實作可選 `Test geo link` 按鈕：發出 `Intent.ACTION_VIEW` + `geo:25.033,121.565`，必要時使用 chooser，讓使用者檢查 resolver/default 行為；驗證方式為測試裝置按鈕可開啟 resolver 或把 Kestrel 帶到 Map tab。_Verified 2026-06-20: button calls `Context.testGeoMapLink()` with `ACTION_VIEW` + `geo:25.033,121.565`; smoke equivalent `adb shell am start -W -a android.intent.action.VIEW -d 'geo:25.033,121.565'` opened `android/com.android.internal.app.ResolverActivity` with `Status: ok`._
- [x] 執行驗證：`just check && just lint`；若有抽出純 Kotlin helper 再加/跑 unit test，否則不新增測試。_Verified 2026-06-20: `just check && just lint` passed; no pure Kotlin helper was added._
- [x] 更新 follow-up PR #132 描述或新增 commit 說明，記錄 Options 入口與手動 smoke 結果；驗證方式為 `gh pr view 132` 可看到更新後摘要或 commit 已推上 branch。_Verified 2026-06-20: PR #131 had already merged, so this Options update is committed and pushed in follow-up PR #132 with the Map links summary and smoke commands._

## Risks

- 不同 Android 版本的 link settings action 支援不同；用 application details 作為 fallback。_Mitigated by `tryStartActivity()` fallback to `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`._
- Test geo link 可能開啟其他已設為預設的地圖 app，這是預期行為，文案要說明它是在測系統 resolver/default，而不是強制使用 Kestrel。_Accepted and documented in the Options card: Android controls defaults._

## Completion Checklist

- [x] Options 顯示 Map links 區塊與限制說明，已由程式碼與 `just check` 驗證。_Verified 2026-06-20: `MapLinksOptionsCard.kt` contains the card and `OptionsScreen()` includes it after Cloud sync; `just check` passed._
- [x] `Open Android link settings` 可開啟 Kestrel 的系統設定頁，已由測試裝置 smoke 驗證。_Verified 2026-06-20: `adb shell am start -W -a android.settings.APP_OPEN_BY_DEFAULT_SETTINGS -d 'package:dev.narumi.kestrel' --es android.provider.extra.APP_PACKAGE dev.narumi.kestrel` opened `InstalledAppOpenByDefaultActivity` with `Status: ok`._
- [x] `Test geo link` 可觸發 Android resolver/default 行為，已由測試裝置 smoke 驗證。_Verified 2026-06-20: `adb shell am start -W -a android.intent.action.VIEW -d 'geo:25.033,121.565'` opened `ResolverActivity` with `Status: ok`._
- [x] Quality gates 通過：`just check && just lint`。_Verified 2026-06-20: command passed._
- [x] Follow-up PR #132 已包含此 Options 入口更新，已由 pushed commit 或 PR 描述驗證。_Verified 2026-06-20: commit pushed to `feat/android-map-link-intents` and PR #132 body updated._
