# Android route background playback

## Goal

Keep active route playback updating while the screen is off, and advance by actual elapsed time rather than coroutine tick count.

## Context

The user observed an unchanged position after five minutes locked and unplugged. A separate USB-connected check showed the same foreground service process before and after locking. CPU suspension remains inferred, not directly measured. `LocationService` has no WakeLock and advances exactly one second per tick.

## Plan

- [x] Add a testable route execution lifecycle using a monotonic clock and acquire/release callbacks; verify delayed ticks, pause/resume, repeated actions, and stop. Narrow JVM tests passed.
- [x] Declare WAKE_LOCK and integrate a non-reference-counted PARTIAL_WAKE_LOCK into route start/restore, pause/resume, replacement, finish, destruction, and coroutine exit.
- [x] Run narrow JVM tests, Android formatting, Detekt, full JVM tests, and debug build; review the diff. `just android-check`, `just android-lint`, `just android-test`, `just android-build`, and `git diff --check` passed.

## Risks and scope

- Keeping the CPU awake increases power consumption during active route playback. Paused routes and stationary point mocks do not hold the lock.
- WakeLock does not override forced Doze or OEM process termination. Process-death recovery continues from saved progress; downtime is not replayed.
- No battery-setting changes, deployment, installation, or device operations in this implementation task.

## Completion Checklist

- [x] Timing and lock lifecycle unit tests pass.
- [x] Android local checks and debug build pass.
- [x] Document the remaining unplugged physical-device check for a separate user-approved installation and validation; do not claim it passed.

## Physical-device handoff

Not executed: install/update the debug APK only after confirming the target device, signing compatibility, and backup/data-loss risk with the user. Do not uninstall or clear data to resolve a signing mismatch. Then verify unplugged locked-screen playback on a sufficiently long Loop route, followed by pause/resume and stop checks. The expected outcome is distance advancing according to speed while locked, no jump for explicitly paused time, and no route WakeLock after pause or stop. Forced Doze and OEM process termination remain outside this fix's guarantee.
