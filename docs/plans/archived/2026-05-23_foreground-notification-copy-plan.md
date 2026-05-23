# Foreground notification copy plan

## Goal

Make Kestrel's foreground location-service notification clearer and more maintainable by improving the notification title, mode-specific text, and Android notification channel description.

## Context

Current notification copy is split between `app/src/main/res/values/strings.xml` and hard-coded strings in `LocationService.kt`. The notification channel has a name but no description. This is a small app-polish item from `docs/plans/2026-05-10_engineering-backlog-plan.md`.

## Non-Goals

- Do not redesign notification behavior, actions, icons, priority, or foreground-service lifecycle.
- Do not add zh-TW / ja localization in this slice; keep the current default English resource set.

## Plan

- [x] Add string resources in `app/src/main/res/values/strings.xml` for the channel description and each notification state/action label so notification copy is resource-backed; verified by inspecting the resource names and usages in `LocationService.kt`.
- [x] Update `LocationService.ensureChannel()` to set `NotificationChannel.description` to the new channel description; verified by reading `LocationService.kt` and confirming the description is assigned before `createNotificationChannel()`.
- [x] Update `LocationService.buildNotification()` to use clearer copy for idle/default, single-point, route-playing, and route-paused states, plus resource-backed Pause/Resume/Stop action labels; verified with `rg -n 'Single point mock active|Route paused|Route playing|"Pause"|"Resume"|"Stop"' app/src/main/java/dev/narumi/kestrel/core/location/LocationService.kt` returning no stale hard-coded notification copy.
- [x] Run `just check` to verify formatting and static checks for the Android project. Initial run exposed unrelated web formatting drift in `web/app/globals.css` and `web/components/dashboard/RouteEditor.tsx`; after targeted Biome formatting, `just check` passed.
- [x] Update `docs/plans/2026-05-10_engineering-backlog-plan.md` to mark the foreground notification wording item complete, including the verification command evidence.

## Risks

- Existing notification channels keep their old user-visible metadata on devices where the channel already exists; verification of the new channel description may require clearing app data or a fresh install.
- Over-specific copy could imply mock location is active while the service is only ready/restoring; keep idle/default text distinct from active single-point or route states.

## Completion Checklist

- [x] Foreground notification title/text/action copy is resource-backed and clearer, verified by `LocationService.kt` and `strings.xml` diffs.
- [x] Notification channel description is set in `LocationService.ensureChannel()`, verified by code inspection.
- [x] No stale hard-coded notification status/action strings remain in `LocationService.kt`, verified by `rg -n 'Single point mock active|Route paused|Route playing|"Pause"|"Resume"|"Stop"' app/src/main/java/dev/narumi/kestrel/core/location/LocationService.kt` returning no output.
- [x] Android checks pass as part of `just check`; full `just check` passed after targeted Biome formatting of unrelated web formatting drift.
- [x] The engineering backlog foreground-notification item is checked off with evidence in `docs/plans/2026-05-10_engineering-backlog-plan.md`.
