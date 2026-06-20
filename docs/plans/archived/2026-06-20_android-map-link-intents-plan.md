## Goal

讓 Kestrel 可以接住 Android「開啟地圖」intent，出現在支援的地圖 app 候選/預設清單，並把可解析的地圖連結套到 Map tab 的目標點。

成功條件：`geo:25.033,121.565` 會開啟 Kestrel 並把地圖移到該點；常見含座標的 Google Maps URL 若被系統送進 Kestrel，也會得到同樣結果。

## Context

- 目前 `AndroidManifest.xml` 只有 launcher intent filter，Kestrel 不會出現在 `ACTION_VIEW` 地圖 intent 候選。
- `MapScreen` 的 Go to sheet 已能解析純座標與部分 Google Maps URL，並把點套到地圖；這條路徑應重用，不另做一套。
- Android 不能讓 Kestrel 驗證或直接搶下 `google.com` app links；Google 網域的 HTTPS 連結能否預設由系統版本與使用者設定決定。第一版只承諾支援 `geo:` scheme，以及「若 URL 被送進 app」就能解析。

## Architecture

- 解析集中在 `core/location/CoordParser.kt`，維持純字串輸入，方便用 local unit tests 鎖住格式。
- `MainActivity` 負責 `onCreate` / `onNewIntent` 讀取 `intent.dataString`，轉成 pending `LatLng`。
- `KestrelApp` 將 pending 點切到 Map tab，再交給 `MapScreen` consume once；`MapScreen` 使用既有 apply point 行為，不啟動 mock。

## Non-Goals

- 不做 `maps.app.goo.gl` 短網址網路展開。
- 不做地址/地名 geocoding、路線導航、directions deep link。
- 不新增第二個地圖後端或外部 SDK。
- 不新增預設 app onboarding UI；先靠 Android resolver / App info 設定。

## Plan

- [x] 擴充 `CoordParser.kt` 支援 `geo:<lat>,<lng>` 與 `geo:0,0?q=<lat>,<lng>`，並保留既有純座標/Google Maps URL 行為；驗證方式為更新 `app/src/test/java/dev/narumi/kestrel/core/location/CoordParserTest.kt` 並跑 `JAVA_HOME=… ./gradlew :app:testDebugUnitTest --tests dev.narumi.kestrel.core.location.CoordParserTest`。_Verified 2026-06-20: command passed; `just test` also passed._
- [x] 在 `app/src/main/AndroidManifest.xml` 的 `MainActivity` 加 `ACTION_VIEW` + `CATEGORY_DEFAULT` + `CATEGORY_BROWSABLE` intent filters：必做 `geo` scheme，另加常見 `https://maps.google.com/*` 與 `https://www.google.com/maps*` 作為候選但不開 `android:autoVerify`；驗證方式為讀 manifest diff，且 `just check` 通過。_Verified 2026-06-20: `aapt dump xmltree app/build/outputs/apk/debug/app-debug.apk AndroidManifest.xml` shows `geo`, `maps.google.com`, `google.com` `/maps`, and `www.google.com` `/maps`; `just check` passed._
- [x] 將 `MainActivity` 設為適合重用且不嵌入呼叫方 task 的 launch 行為（`singleTask`），在 `onCreate` / `onNewIntent` 解析 incoming map intent 為 pending `LatLng`；驗證方式為 `just check` 通過，且程式碼路徑不建立第二個 activity stack 來處理同一連結。_Verified 2026-06-20: manifest has `android:launchMode="singleTask"`; foreground `adb shell am start -W ... geo:40.6892,-74.0445 ...` returned `intent has been delivered to currently running top-most instance`; `just check` passed. Updated from `singleTop` after app-to-app smoke showed `singleTop` can place Kestrel inside the caller's task._
- [x] 將 pending `LatLng` 從 `MainActivity` 傳到 `KestrelApp` / `MapScreen`，收到後切回 `AppDestinations.HOME`、套用既有 point draft + camera target、consume once；驗證方式為 cold start 與 app 已開啟兩條路徑的程式碼檢查，且同一 intent 不會反覆套用。_Verified 2026-06-20: `KestrelApp` switches to `HOME`; `MapScreen` calls existing `applyPoint()` then `onMapLinkPointConsumed()`; cold start and foreground `am start -W` both returned `Status: ok`._
- [x] 在測試裝置安裝 debug build 後做 resolver smoke：`adb shell cmd package query-intent-activities -a android.intent.action.VIEW -d 'geo:25.033,121.565'` 可看到 `dev.narumi.kestrel`；驗證結果記錄到此計畫或 PR 描述。_Verified 2026-06-20 on device using this Android version's equivalent command: `adb shell cmd package query-activities --brief --components -a android.intent.action.VIEW -d 'geo:35.6812,139.7671'` output included `dev.narumi.kestrel/.MainActivity`._
- [x] 在測試裝置做開啟 smoke：`adb shell am start -W -a android.intent.action.VIEW -d 'geo:25.033,121.565'` 開啟 Kestrel 並把地圖移到該點；另用一個含座標的 Google Maps URL 做「若送進 app」解析驗證，結果記錄到此計畫或 PR 描述。_Verified 2026-06-20: after `just install`, `adb shell am start -W -a android.intent.action.VIEW -d 'geo:35.6812,139.7671' -n dev.narumi.kestrel/.MainActivity` returned `Status: ok`; foreground `geo:40.6892,-74.0445` returned `intent has been delivered to currently running top-most instance`; explicit Google URL `https://www.google.com/maps/search/?api=1&query=40.6892%2C-74.0445` also delivered to the top-most Kestrel instance. Device was locked, so visual screenshot was not usable; map movement is covered by the verified `MapScreen.applyPoint()` code path._
- [x] 執行 Android quality gates：`just check && just lint`，以及上述 unit test；把結果記錄到此計畫或 PR 描述。_Verified 2026-06-20: `just check`, `just lint`, targeted `CoordParserTest`, and `just test` all passed._

## Risks

- Android 12+ 對未驗證 HTTPS app links 更嚴格，`google.com/maps` 可能只進瀏覽器或 Google Maps；用 `geo:` 作為可靠支援面，HTTPS 只當 best-effort candidate。_Accepted and documented in Context / Completion Checklist._
- Intent filter 太寬會讓 Kestrel 出現在不該出現的連結；先限制到 `geo:` 與明確 maps host/path。_Mitigated by manifest filters for `geo`, `maps.google.com`, `google.com` path prefix `/maps`, and `www.google.com` path prefix `/maps` only._
- 若目前有 mock route 正在跑，外部點套用沿用 `applyPoint` 會停掉正在跑的 mock；這和 Go to sheet 現有行為一致，但 smoke 時要注意。_Accepted: implementation intentionally reuses existing Go to behavior._

## Completion Checklist

- [x] `geo:` coordinate parsing 已由 `CoordParserTest` 與指定 unit test 命令驗證。_Verified 2026-06-20: `JAVA_HOME=… ./gradlew :app:testDebugUnitTest --tests dev.narumi.kestrel.core.location.CoordParserTest` passed._
- [x] Kestrel 會出現在 `geo:` map intent resolver 中，已由 `cmd package query-intent-activities` 輸出驗證。_Verified 2026-06-20 with equivalent `cmd package query-activities --brief --components ...`; output included `dev.narumi.kestrel/.MainActivity`._
- [x] `geo:` intent cold start 與 foreground `onNewIntent` 都會切到 Map tab 並移到目標點，已由測試裝置 smoke 驗證。_Verified 2026-06-20: cold `am start -W ... geo:35.6812,139.7671 ...` returned `Status: ok`; foreground `geo:40.6892,-74.0445` returned `intent has been delivered to currently running top-most instance`; code path switches to Map tab and calls `applyPoint()`._
- [x] 含座標 Google Maps URL 若被送進 Kestrel 會移到目標點，且 `google.com` 不能保證被 Kestrel 預設接管的限制已在 PR/文件中明確記錄。_Verified 2026-06-20: `CoordParserTest.parsesGoogleMapsQueryUrl` passed; explicit Google URL `am start` delivered to Kestrel; limitation documented in Context/Risks._
- [x] Android quality gates 通過：`just check && just lint`，以及 `CoordParserTest` 指定 unit test 通過。_Verified 2026-06-20: `just check`, `just lint`, targeted `CoordParserTest`, and `just test` passed._
