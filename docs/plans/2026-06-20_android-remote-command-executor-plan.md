## Goal

讓 Android app 在使用者明確 opt-in 後註冊為可控制 device，並在 app 前景或 Kestrel mock service active 時 polling backend remote commands，收到 command 後執行既有 mock point / route / stop 行為並回報結果。

成功條件：Android 登入 cloud 且 Options 開啟 `Allow web remote control` 後，Web 建立的 `SET_POINT` / `START_ROUTE` / `STOP` command 能在 Android app 前景或 mock service active 時被套用；缺少 mock permission 時 command 回報 failed 並顯示可理解錯誤。

## Architecture

- DataStore 新增 remote-control settings：`enabled: Boolean = false`、stable `deviceId: String?`、`deviceName: String?`。
- 新增 `RemoteControlRepository`：register device、poll command、ack command，重用 `CloudAuthRepository`/`CloudApiClient` access-token refresh path。
- Polling 由 app foreground lifecycle 啟動；如果 `LocationService.runtimeState` 非 idle，也允許 background cadence 維持接收 stop/pause 類命令。
- Executor 將 backend command 映射到既有 `LocationService` API，不新增第二套 mock engine。

## Non-Goals

- 不用 FCM 叫醒被殺掉的 app。
- 不要求 command 在 Android process dead 時被立即執行。
- 不自動開啟 Android mock location developer setting；缺少權限時回報 failed。
- 第一版不做 Android UI command history，只在 Options 顯示 remote control enable/last status。

## Plan

- [ ] 在 `Preferences.kt` 新增向前相容 `RemoteControlSettings(enabled: Boolean = false, deviceId: String? = null, deviceName: String? = null)`，並在 `KestrelPrefs` 加 getter/setter；驗證方式為 DataStore serialization compile，`just android-check` 通過。
- [ ] 擴充 `CloudApiClient` / `CloudModels.kt` 支援 backend remote-control endpoints：register device、poll commands、ack command；驗證方式為新增純 Kotlin serialization/unit tests 或 mock client tests，命令 `JAVA_HOME=… ./gradlew :app:testDebugUnitTest --tests '*RemoteControl*'`。
- [ ] 新增 `RemoteControlRepository`，負責確保 device registration、定期 poll、expiry-aware ack、access token refresh；驗證方式為 unit tests 覆蓋 disabled/no-session/no-device/register/poll/ack failure path。
- [ ] 新增 command executor：`SET_POINT` 驗證 lat/lng 後呼叫 `LocationService.setLocation(context, point)`；`START_ROUTE` 驗證 waypoint >= 2、speed/mode 後呼叫 `LocationService.startRoute(context, waypoints, speedKmh, mode)`；`STOP` 呼叫 `LocationService.stop(context)`；驗證方式為 unit tests 使用 fake executor 或 facade 確認不先送 `stop()` 再 set/start。
- [ ] 在 `OptionsScreen` 加 `Web remote control` card/toggle，預設 off，說明「Kestrel must be open or mock service running」與目前 device name/last status；驗證方式為 `just android-check` 與手動 UI review。
- [ ] 在 `MainActivity` lifecycle foreground observer 啟動/停止 polling；如果 `LocationService.runtimeState` 進入 active mock，保持較低頻 polling；驗證方式為讀碼確認不會在未登入或 disabled 時 polling，並用 filtered logs 確認 foreground 開始 polling。
- [ ] 實作 error/ack mapping：mock permission 不足、invalid payload、route too short、service start exception 都 ack `FAILED`；成功 ack `APPLIED`；驗證方式為 unit tests 與 non-destructive device smoke。
- [ ] 執行 Android quality gates：`just check && just lint`，以及新增 unit tests；手動 smoke 不使用 `just reset` 或清 app data。

## Risks

- Android foreground service race：替換 active mock 時不可先 `LocationService.stop()`，直接用 `setLocation` / `startRoute` atomic replace。
- App 被殺時 command 會等待到下次 app 開啟或過期；Web 必須顯示 offline/expired。
- Polling 太頻繁耗電；第一版 foreground 5 秒、active service 10–15 秒、disabled/no-session 不 poll。

## Completion Checklist

- [ ] Remote control settings 預設 off 且 DataStore schema 向前相容，已由 compile/tests 驗證。
- [ ] Android 可註冊 device、poll command、ack applied/failed，已由 unit tests 驗證。
- [ ] `SET_POINT` / `START_ROUTE` / `STOP` command 會呼叫既有 `LocationService` API，且不引入 stop/start race，已由 tests/code review 驗證。
- [ ] Options remote-control toggle 與狀態文案已由 `just check` 和手動 UI review 驗證。
- [ ] Android quality gates 通過：`just check && just lint`，新增 unit tests 通過。
- [ ] Non-destructive device smoke 驗證 Web/backend command 能被 Android 前景 app 接收並 ack。
