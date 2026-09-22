# Kestrel Cloud route editing

Kestrel Cloud uses two workspaces:

- **Map** is the canonical place to create and spatially edit Places and Routes.
- **Library** is for searching, sharing, deleting, and opening saved items on the map.

## Sign in to Android with a QR code

When the server enables Android QR login, open **Account → Sign in with a QR code** and choose **Create Android login code**. The code lasts five minutes and requires a Web session created within the previous ten minutes; sign in again through the normal login page when prompted.

Scan the code from the signed-out Android app. Before approving, compare the username, server, Android device label, and six-digit matching code on both screens. Only the same active Web session that created the attempt can approve or cancel it. The completed Android session appears under **Active sessions** and can be revoked independently. QR login starts cloud sync but does not enable Web remote control.

Cancel or create a new code if the device is unexpected, any displayed value differs, or another device claimed the code. Do not send a QR screenshot to another person: it is a short-lived bearer capability even though it contains no password or session token. Password/TOTP/recovery-code and OIDC login remain available when QR login or Google Play services is unavailable.

## Create or edit a route

Open **Map → Routes**, then select a saved route or choose **New**.

A route draft follows one task sequence:

1. **Path** — add, select, and manage the ordered waypoints shown on the map.
2. **Playback** — choose the default speed and Once, Loop, or Ping-pong behavior.
3. **Save & use** — save manually, then play the intended snapshot on Android or share the saved revision.

Route name and compact status stay above the sequence. Optional description and compatibility visibility remain under **More details**.

The map is a live preview of the draft. Kestrel does not auto-save routes: nothing is written to the cloud until **Save route** succeeds. A new route says **Not saved yet**, a changed route says **Unsaved changes** or **Not ready to save**, and a clean existing route shows its saved cloud revision without a disabled Save button.

## Add and edit waypoints

You can build the same path with pointer, touch, or keyboard:

- Click the map to append a waypoint when the route preview is ready.
- Choose **Saved place** to open a searchable dialog and append a Place from the cloud library.
- Choose **Coordinates** to add an exact latitude and longitude without using the map.
- Drag a numbered map marker to move it.
- Select a marker to move, edit, or remove that waypoint precisely. Every editable marker keeps its number visible; Start is circular and End has a squared flag-like shape in addition to their color difference.
- Open **Manage all waypoints** to reorder, duplicate, edit, or remove any row.

Routes require 2–1000 waypoints. Latitude must be from −90 to 90 and longitude from −180 to 180.

### Undo and Redo

**Undo** and **Redo** cover path changes made during the current draft, including adding, dragging, removing, reordering, reversing, and closing a loop. The history resets after Save, Discard, selecting another route, starting another draft, or reloading the page.

### Reverse route

**More → Reverse route** changes `A → B → C` into `C → B → A`. It changes direction but normally keeps the same geometry and distance. Associated waypoint metadata stays with each point.

### Close loop

When **Loop** is selected and the end differs from the start, **Close loop** appends a copy of the starting waypoint:

```text
A → B → C becomes A → B → C → A
```

This adds a visible return segment instead of letting playback jump directly from the old endpoint to the start. Repeating Close loop does not add another copy. Ping-pong already travels back along the route and does not need this action.

## Playback modes

- **Once** — travel to the last waypoint and finish there.
- **Loop** — restart after reaching the end. Use Close loop when continuous movement back to the start matters.
- **Ping-pong** — travel to the end, reverse along the same path, and repeat.

Default speed must be a finite number greater than zero.

## Draft, Share, and Android device behavior

These actions intentionally use different snapshots:

- **Save route** writes the current draft as the next cloud revision. The Save action appears for new, changed, saving, or failed states; a clean saved route uses a compact status instead.
- **Share saved revision** exposes the latest successfully saved revision. The dialog warns when unsaved changes are excluded.
- **Play current draft on device** previews the current unsaved route command before sending it. For a clean route, the action is **Play saved route on device**. The dialog includes waypoint count, distance, speed, mode, target device, and whether it replaces an active mock.

The **Mark route as public** compatibility flag does not create a public link. Use **Share** after saving to create, copy, disable, or re-enable the actual public link.

## Cancellation and recovery

- Closing or cancelling a coordinate, Share, Device, or delete dialog has no side effects.
- Internal navigation with unsaved work asks whether to keep editing or discard the draft.
- **Discard** restores the latest saved route and clears path history.
- A failed Save keeps the complete draft and shows an actionable error near Save.
- If Saved places fail to load, route editing remains available and that section offers Retry.
- **Map unavailable** means MapLibre or its style did not initialize. The map is dimmed and blocked, viewport controls are disabled, and saved places, exact coordinates, and **Manage all waypoints** remain available.
- **Route preview unavailable** means the basemap loaded but the route line or markers could not be synchronized. Map-based route gestures are disabled, precise inspector editing remains available, and **Retry map** remounts MapLibre.
- Ordinary recoverable tile errors do not replace the workspace with a fatal alert.

Keyboard focus returns to the originating control after dialogs close. Route status, selection, errors, and success are communicated with text and semantics rather than color alone.
