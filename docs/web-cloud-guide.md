# Kestrel Cloud route editing

Kestrel Cloud uses two workspaces:

- **Map** is the canonical place to create and spatially edit Places and Routes.
- **Library** is for searching, sharing, deleting, and opening saved items on the map.

## Create or edit a route

Open **Map → Routes**, then select a saved route or choose **New**.

A route draft has four parts:

1. **Route name and status** — waypoint count, distance, speed, mode, and saved revision.
2. **Path** — the ordered waypoints shown on the map.
3. **Playback** — default speed and Once, Loop, or Ping-pong behavior.
4. **More details** — description and the compatibility visibility flag.

The map is a live preview of the draft. Nothing is written to the cloud until **Save route** succeeds.

## Add and edit waypoints

You can build the same path with pointer, touch, or keyboard:

- Click the map to append a waypoint.
- Choose **Saved place** to append a Place from the cloud library.
- Choose **Coordinates** to add an exact latitude and longitude without using the map.
- Drag a numbered map marker to move it.
- Select a marker to move, edit, or remove that waypoint precisely.
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

- **Save route** writes the current draft as the next cloud revision.
- **Share** exposes the latest successfully saved revision. The dialog warns when unsaved changes are excluded.
- **Device** previews the current route command before sending it, including whether it uses an unsaved draft, waypoint count, distance, speed, mode, target device, and whether it replaces an active mock.

The **Mark route as public** compatibility flag does not create a public link. Use **Share** after saving to create, copy, disable, or re-enable the actual public link.

## Cancellation and recovery

- Closing or cancelling a coordinate, Share, Device, or delete dialog has no side effects.
- Internal navigation with unsaved work asks whether to keep editing or discard the draft.
- **Discard** restores the latest saved route and clears path history.
- A failed Save keeps the complete draft and shows an actionable error near Save.
- If Saved places fail to load, route editing remains available and that section offers Retry.
- If the map cannot load, exact waypoint editing remains available in the inspector and **Retry map** remounts MapLibre.

Keyboard focus returns to the originating control after dialogs close. Route status, selection, errors, and success are communicated with text and semantics rather than color alone.
