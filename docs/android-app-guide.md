# Kestrel Android guide

Kestrel uses Android's official mock-location APIs. Before starting a mock, enable Developer Options, select **Kestrel** as the mock-location app, and grant the permissions requested on Map.

## Preview and start a point

1. Open **Map**.
2. Tap the map, hold a map location and choose a point action, or choose **Choose target** to enter coordinates, paste a supported Maps URL, or select a Favorite.
3. Check the teal Preview marker and coordinates.
4. Choose **Mock this point**.

A preview does not change the system location. If another mock is active, it continues until you review the Current/New comparison and confirm **Replace current mock**. Cancelling the preview or confirmation leaves the active mock unchanged.

## Preview and play a route

- Tap multiple map locations to build a route, or choose **Generate random route**.
- Random-route presets provide a starting point; custom point count and spacing remain available. **Preview route** draws the route but does not start playback.
- Review the path, waypoint count, speed, and Once/Loop/Ping-pong mode, then choose **Play route**.
- Use **Undo last waypoint**, **Clear preview**, or **Cancel preview** without affecting active playback.
- While a route is active, Pause, Resume, and Stop remain available on Map, in the Android notification, and in the compact playback status shown above Favorites and Settings.

If Kestrel cannot apply a point or route, it keeps the previous valid mock when Android permits and shows a corrective message. Recheck app permissions and **Developer Options → Select mock location app** before retrying.

## Favorites

**Favorites** shows saved points and routes in one list. Use the visible filters **All / Points / Routes** and sort choices **Manual / Recent / A–Z**.

- **Preview on map** opens the item without starting or replacing a mock.
- Point and route edits are saved only after **Save** succeeds. **Cancel** makes no stored change.
- Rename and manual reordering remain available.
- Delete requires confirmation. For a cloud-synced point, deletion is included in cloud sync. Deleting the Favorite selected for app opening returns that setting to the last map view.

Favorite names do not have to be unique; Kestrel identifies saved items independently of their display names.

## Settings

The **Settings** destination keeps six settings in one flat list. Each row always shows its current value and uses **Change**, **Save changes**, and **Cancel** consistently.

### When app opens

- **Last map view** returns to the map area last viewed.
- **Current device location** centers the map after a location fix is available.
- **A Favorite** preserves the existing type-specific behavior:
  - a saved point starts mocking after launch;
  - a saved route opens as a preview and does not start playback.

Choosing **A Favorite** never silently selects the first item; select an item and save explicitly.

### Map links

Kestrel supports `geo:` coordinate links and Google Maps links containing coordinates. Android controls which app opens a link. Testing a link creates a preview and does not stop active playback.

### Random routes

Defaults are used when no last-used generator values exist. **Use recommended** only changes the draft; choose **Save changes** to apply it.

### Route recovery

Route recovery controls how often active progress is saved:

- **More accurate** — may rewind by up to 1 second.
- **Balanced** — may rewind by up to 5 seconds.
- **Fewer writes** — may rewind by up to 15 seconds.
- Custom values from 1–60 seconds remain available.

The choice applies to the next route start or restore. A route restored after process death resumes unpaused.

### Cloud sync

Sign in with username, password, and then an authenticator or recovery code. Local Favorites remain available while signed out or offline. Sync errors retain the previous local data and provide a retry/reconnect action.

The server address can be changed only while signed out so account, session, and remote-control state cannot be split between servers.

When a point differs on this device and in cloud sync, Kestrel previews both versions before you confirm one of these outcomes:

- **Keep this device** — upload this device's version.
- **Keep cloud version** — replace this device's copy.
- **Keep both** — preserve both as separate Favorites.

### Web remote control

Web remote control is opt-in and requires cloud sign-in. Enabling it asks for confirmation and explains that the Web dashboard can replace or stop this device's mock while Kestrel is open or its mock service is running.

Disabling remote control applies immediately after the server confirms the opt-out. If Kestrel cannot authenticate or reach the server, the switch remains on and Settings asks you to reconnect and retry. Signing out while remote control is enabled first disables it; if that opt-out fails, Kestrel keeps the account signed in so you can recover safely. Android or the backend cannot recall a command already delivered to the device; see [device and session security](device-session-security.md) for the exact boundary.

## Navigation and accessibility

- Back closes the current dialog, sheet, or expanded settings editor before returning from Favorites or Settings to Map.
- Map gestures have labeled coordinate, Favorite, generator, undo, and clear alternatives.
- Controls support touch, D-pad/hardware keyboard activation, TalkBack state announcements, large text, dark mode, compact phones, landscape, and wider layouts.
