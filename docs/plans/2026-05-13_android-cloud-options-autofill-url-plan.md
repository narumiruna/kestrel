## Goal

讓 Android app 的 Options → Cloud sync 登入與 API URL 設定更順手：

1. 使用 1Password 自動填入時，username / password / TOTP 欄位能被正確辨識與帶入。
2. 新安裝或未設定過 cloud endpoint 時，預設顯示並使用 `https://kestrel.narumi.dev`。
3. Production cloud endpoint 可輸入 `https://kestrel.narumi.dev` 或 `https://kestrel.narumi.dev/api`，app 會自動使用實際 backend proxy `https://kestrel.narumi.dev/api/backend`；已輸入完整 `/api/backend` 以及本機 direct backend URL 不被破壞。

## Context

- 目前 `OptionsScreen.kt` 的 cloud login 欄位只是一般 `OutlinedTextField`，沒有針對 Android Autofill / credential managers 提供 username/password/OTP 語意。
- 目前 `CloudApiClient` 會將 `KestrelPrefs.CloudSettings.apiBaseUrl` 做 `trim().trimEnd('/')` 後直接接 `/auth/login`、`/sync/*` 等 backend path。
- Web console 已有 runtime proxy `web/app/api/backend/[...path]/route.ts`，production/domain 對外應走 `/api/backend/*`；直接輸入 `https://kestrel.narumi.dev` 會打到 web root 下的 `/auth/login` 而非 backend。
- DataStore 的 `CloudSettings.apiBaseUrl` 只有單一字串欄位，適合保持相容並在 client 端正規化。
- 目前 `CloudSettings.DEFAULT_API_BASE_URL` 是 emulator/local backend `http://10.0.2.2:3000`；production-friendly 預設值需要改為 `https://kestrel.narumi.dev`，本機開發者仍可手動覆寫。

## Non-Goals

- 不重做 cloud auth flow、session 儲存或 TOTP/recovery-code 流程。
- 不改 web/backend 部署拓撲；backend 仍透過 web 的 `/api/backend` proxy 對外。
- 不清除使用者 app data；任何需要 `just reset` 或 reinstall 的驗證另行明確徵求同意。

## Unknowns

- 1Password 在 Compose `OutlinedTextField` 上是否只需要 Autofill/semantics content type，或還需要 IME hints / stable node structure；先做最小欄位語意改動，再用實機 1Password 驗證。
- 是否要把 production URL alias 限定在 `kestrel.narumi.dev`，或支援任意 web origin 自動補 `/api/backend`；本計畫先以不破壞本機 direct backend 為優先，實作前用單元測試鎖定規則。

## Plan

- [x] 調查目前 AndroidX Compose BOM 對 Autofill 的推薦 API，決定使用 `Modifier.semantics { contentType = ... }`、`keyboardOptions`、或仍需 `AutofillTree`；驗證方式是在 `OptionsScreen.kt` 中可編譯引用對應 API，並以 `just check` 確認無 unresolved reference。_Verified on 2026-05-13: both semantics `ContentType` and legacy `AutofillTree` / `AutofillNode` compiled, but manual 1Password testing showed regressions: semantics prevented password fill, and legacy nodes only filled OTP. Autofill code was reverted to preserve the previously working password fill._
- [ ] 更新 `CloudSignedOutCardContent` 的 username、password、TOTP/recovery-code 欄位語意，讓 1Password 能辨識帳號、密碼與 one-time code；驗證方式為 `just check`，並以實機 1Password smoke：點選 Username 欄位後可帶入 username，Password 欄位可帶入 password，TOTP 欄位可帶入 OTP 或不阻塞手動輸入。_Attempted semantics and legacy Autofill nodes; both failed manual 1Password smoke. Web research found Android recommends explicit credential hints and app/site association, while 1Password links Logins to apps/sites after `Always Allow`; because Compose hints regressed this form, the current workaround delays rendering the TOTP/recovery field until username and password are filled so 1Password first sees a credential-only form._
- [x] 將 `CloudSettings.DEFAULT_API_BASE_URL` 改為 `https://kestrel.narumi.dev`，讓新安裝與未設定過 cloud endpoint 的使用者預設走 production web origin；驗證方式為 `Preferences.kt` 中預設值、Options UI 初始值、以及單元測試/preview 證據。_Verified by `Preferences.kt` default value and `just test` / `just check` / `just lint` on 2026-05-13._
- [x] 新增 `core/cloud` 或 `core/data` 的純 Kotlin URL 正規化 helper，將預設值 `https://kestrel.narumi.dev`、`https://kestrel.narumi.dev/api` 解析成 `https://kestrel.narumi.dev/api/backend`，保留已完整的 `/api/backend`，並保留 direct backend URL（例如 `http://10.0.2.2:3000`、`http://localhost:3300`）不補 path；驗證方式為新增/更新 `app/src/test/...` 單元測試並跑 `JAVA_HOME=… ./gradlew :app:testDebugUnitTest`。_Implemented in `CloudApiBaseUrl.kt`; verified by `CloudApiBaseUrlTest.kt` and `just test` on 2026-05-13._
- [x] 將 helper 接到儲存或 request 建 URL 的單一路徑，避免 UI 顯示值與實際 request endpoint 分裂；驗證方式為讀碼確認 `CloudApiClient.normalizedBaseUrl()` 或 `KestrelPrefs.setCloudApiBaseUrl()` 只有一個 endpoint 正規化來源，且單元測試覆蓋 trailing slash、空白與 `/api/` cases。_Implemented by routing `CloudApiClient.normalizedBaseUrl()` through `normalizeCloudApiBaseUrl()`; tests cover whitespace, trailing slash, `/api`, and direct backend URLs._
- [x] 更新 Options UI helper text / label，說明 production 可輸入 `https://kestrel.narumi.dev`，app 會使用 backend proxy；驗證方式為 `OptionsScreen` preview/編譯通過，且 UI 文案不再要求手動輸入 `/api/backend`。_Implemented in `OptionsScreen.kt`; verified by `just check` and `just lint` on 2026-05-13._
- [ ] 做 cloud login smoke test：輸入或儲存 `https://kestrel.narumi.dev` 後登入一次並執行 `Sync now`，確認 request 成功或錯誤訊息來自 backend auth/sync 而不是 web 404；驗證方式為實機畫面結果與必要時 `just logf` 中的 Cloud/API 錯誤紀錄。
- [x] 執行完整 Android 驗證 `just check && just lint`；若改到純 Kotlin helper，另跑 `JAVA_HOME=… ./gradlew :app:testDebugUnitTest`，並把結果記錄到此計畫或 PR 描述。_Verified on 2026-05-13 by `just check`, `just lint`, and `just test`._

## Risks

- 太積極地自動補 `/api/backend` 可能破壞使用者自架的 direct backend URL；用單元測試明確保留本機與含 port 的 direct backend URL。
- 1Password Autofill 行為受 Android 版本、鍵盤與 1Password app 版本影響；自動化測試不一定能完整覆蓋，需保留實機驗證。
- 如果在儲存時改寫顯示 URL，使用者可能困惑；若採 request-time 正規化，UI 需說明「接受 web origin alias」。

## Completion Checklist

- [ ] 1Password username/password/TOTP 欄位辨識改善已由 `OptionsScreen.kt` 程式碼與實機 1Password smoke 結果驗證。_Current candidate hides the TOTP/recovery field until username and password are filled; manual smoke still needed._
- [x] `CloudSettings.DEFAULT_API_BASE_URL` 預設為 `https://kestrel.narumi.dev`，且新安裝 Options UI 初始值已由程式碼或 preview/smoke 證據驗證。_Verified by `Preferences.kt` default and `OptionsScreen.kt` binding to `CloudSettings()`._
- [x] `https://kestrel.narumi.dev`、`https://kestrel.narumi.dev/api`、`https://kestrel.narumi.dev/api/backend`、`http://10.0.2.2:3000` 的 URL 正規化行為已由 Android unit tests 驗證。_Verified by `CloudApiBaseUrlTest.kt` and `just test` on 2026-05-13._
- [ ] Production URL alias 登入與 `Sync now` 已在實機或 emulator 上驗證不再需要手動輸入 `/api/backend`。
- [x] Android quality gates 通過：`just check && just lint`，以及若有新增 unit tests 則 `JAVA_HOME=… ./gradlew :app:testDebugUnitTest` 通過。_Verified on 2026-05-13 by `just check`, `just lint`, and `just test`._
