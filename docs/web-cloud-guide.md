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

1. **View** — inspect the route without adding or dragging points.
2. **Edit** — add, select, and manage the ordered waypoints shown on the map.
3. **Playback** — preview the route with only its start/end markers; choose the default speed and Once, Loop, or Ping-pong behavior.
4. Save manually, then play the intended snapshot on Android or share the saved revision.

Route name and compact status stay above the tabs. Switching tabs preserves the draft and Undo/Redo history; Save, Share, and device playback use the existing controls below the panels. Optional description and compatibility visibility remain under **More details**.

The map is a live preview of the draft. Kestrel does not auto-save routes: nothing is written to the cloud until **Save route** succeeds. A new route says **Not saved yet**, a changed route says **Unsaved changes** or **Not ready to save**, and a clean existing route shows its saved cloud revision without a disabled Save button.

## Add and edit waypoints

You can build the same path with pointer, touch, or keyboard:

- In **Edit**, enable point addition and click the map to append a waypoint when the route preview is ready.
- Choose **Saved place** to open a searchable dialog and append a Place from the cloud library.
- Choose **Coordinates** to add an exact latitude and longitude without using the map.
- Drag a numbered map marker to move it.
- Select a marker to center the map and reveal its selected row in **Manage all waypoints**, then move, edit, or remove it precisely. Numbers thin out as you zoom out, while selected/hovered points and endpoints take priority. Zoom in or use the list to access hidden points. Start is circular and End has a squared flag-like shape in addition to their color difference.
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

## Suggest a path from a screenshot

Manual editing needs no AI setup. It connects ordered waypoints with direct segments, not road snapping. Moving or removing points can cut corners, including after an assistant proposal.

Open the single **Suggest a path** entry in the existing route inspector. It uses the same map and draft; no separate workspace or required mode switch is added.

1. In personal AI settings, connect your provider and save an image-capable **chat** model and thinking setting. Image-generation, classifier, and text-only models do not qualify. There is no provider approval gate, shared credential, or silent model substitution. The settings link uses existing draft-navigation protection.
2. Describe a visible path change (up to 2000 characters). Optionally enter a loop target from **0.1 to 20 km**.
3. Choose **Capture map**. Review the exact PNG, capture time, dimensions, source, and selected provider/model. Capture includes the map, visible route markers/labels/leaders, and attribution, not the whole page, inspector, account UI, Places, or device data.
4. Confirm image transfer, then choose **Generate path**. Opening the assistant, typing, and capture do not call the inference provider. Removing the image prevents submission; capture and confirm a new one. There is no image-free fallback.
5. Review the separate approximate candidate on the existing map, point count, measured distance, source, and any loop error. Use **Apply path** once to replace only the path as one Undo step, or **Discard suggestion**. Confirm separately if event-bearing waypoints will be removed.
6. Use the existing **Save route** action when ready. Apply does not save, share, sync, or send a device command. Name, description, visibility, playback mode, and default speed stay unchanged. Unchanged point references retain exact coordinates and speed/pause; explicit visible-point moves retain their identity and events. New points have null speed/pause. Undo is path-only.

### Capture limits and source permission

- Capture waits at most **5 seconds**. Submit within **120 seconds** of capture. The submitted review image expires **10 minutes after capture**.
- Camera, map size, style, or draft changes before submission require explicit recapture. After submission, camera-only panning does not change the frozen image or its coordinate conversion.
- One PNG is required: at most **2 MiB**, **1600 pixels per side**, and **2,560,000 pixels**. A loading, blank, incomplete, CORS-blocked, or unavailable map is not a valid capture.
- Only OSM-based **plain**, **dark**, and **terrain** styles support capture; terrain is a color treatment, not elevation. Esri satellite capture is disabled pending source-owner permission. Manual satellite editing remains available. See [source terms and official evidence](route-assistant-source-terms.md).
- Capture supports flat **Mercator at zero pitch**. The model supplies strict normalized image positions or retained point references, never geographic coordinates. Frozen conversion samples must round-trip within **0.25 output pixels**. Positions exclude the attribution footer. Unsupported views or repeated worlds require manual view adjustment, not an automatic camera reset.

### Accuracy, privacy, and recovery

Every result is an **approximate visual path**, not verified roads, geocoding, or navigation. Only the confirmed screenshot supplies new-path evidence. There is no road graph, external search, routing service, geographic-memory lookup, Places lookup, or inferred off-screen connection. Identify ambiguous visible targets, adjust the map manually, and recapture when needed. Crossings, access, direction, barriers, and safety cannot be verified from the image.

Distance is measured from the final direct-segment path. Loop proposals must stay within **±10%** of the target and close within **10 m**, with at most **3 candidate attempts**. Final paths require **2–1000 points**. Excessive or invalid geometry fails; it is not truncated or silently simplified. Preview, Apply, Save, sync, and playback use the same geometry; map route sources use zero simplification tolerance. OSM credit remains on the image and route editing/preview maps after Apply and Save; Android retains native OSM attribution. Redistribution must retain applicable source credit and licensing obligations.

The image and request can reveal precise positions. Your provider can charge for image input and retain data under its own account terms. Full draft coordinates and conversion metadata stay inside the authenticated application; the provider receives the image, bounded request, dimensions/map rectangle, visible marker references, and optional loop target. Local transient storage does not guarantee provider deletion or no training.

There is no automatic capture, recapture, submission, retry, or chat/image persistence. Reload or restart does not recover the conversation. Images and proposals are cleared on removal, invalidation, cancellation, expiry, Apply/discard, or session end. Manual Save alone persists approved route geometry.

**Stop** aborts local work and requests cancellation. Stream loss or disconnect does not prove that upstream inference stopped, prevent charges, or guarantee a refund. After failure, review the state and explicitly capture/submit again; paid requests are not replayed automatically.

Manual edits, edit → Undo, route switches, discard, successful Save/baseline changes, settings/credential changes, and logout invalidate affected runs and proposals. Late events cannot restore them. There is no automatic rebase; capture again. Apply is disabled while Save or credential refresh is running. Normal OAuth refresh keeps the same credential generation; an actual failure or credential change still invalidates the result. An invalid assistant loop field does not block manual Save. Failed Save keeps the draft but cannot revive an invalidated result. Cross-tab route-write compare-and-swap protection is **not implemented**.

See the [API contract](route-assistant-api.md) and [operations requirements](operations.md#route-assistant-operations).

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

### Share link checks

Share checks the saved item's link status before enabling link creation or changes. **Checking link status…** is not a claim that no link exists. If the check fails, **Retry** reads the status again; it does not create or change a link. A failed Create or link change also requires this read before another write. A delayed older response cannot replace a newer successful result.

### Device command status

After sending a command, the dialog retains its command reference and last confirmed status. **Refresh status** reads the device response; it does not send another command. A matching Applied, Failed, or Expired result completes that operation. An unrelated or missing latest command does not confirm its result.

If the result cannot be confirmed, the command may still run. The send controls stay unavailable for that unresolved operation. If submission itself has no confirmed result, check Android; do not assume that the request failed or repeat it automatically.

A confirmed API rejection, such as a device conflict, is different from an unknown result. The rejection error stays visible, but it does not keep an unresolved operation. Check the error and device status. You can select another device or send a new command when the selected device is ready. No command is retried automatically.

**Close** or Escape closes the Device dialog without cancelling the command. Reopening the same Device action restores pending tracking, including a submission whose response has not arrived. Switching Route tabs also preserves that tracking. Reloading or leaving the current editor can end local tracking; these actions do not cancel a command already sent. Check Android before starting another operation after local tracking ends. Stop keeps its existing availability rules and is not an immediate cancellation guarantee.

## Cancellation and recovery

- Closing an unsubmitted coordinate, Share, Device, or delete dialog does not submit its action. Closing after submission does not undo a completed or pending request.
- Internal navigation with unsaved work asks whether to keep editing or discard the draft.
- **Discard** restores the latest saved route and clears path history.
- A failed Save keeps the complete draft and shows an actionable error near Save.
- If Saved places fail to load, route editing remains available and that section offers Retry.
- **Map unavailable** means MapLibre or its style did not initialize. The map is dimmed and blocked, viewport controls are disabled, and saved places, exact coordinates, and **Manage all waypoints** remain available.
- **Route preview unavailable** means the basemap loaded but the route line or markers could not be synchronized. Map-based route gestures are disabled, precise inspector editing remains available, and **Retry map** remounts MapLibre.
- Ordinary recoverable tile errors do not replace the workspace with a fatal alert.

Keyboard focus returns to the originating control after dialogs close. Route status, selection, errors, and success are communicated with text and semantics rather than color alone.
