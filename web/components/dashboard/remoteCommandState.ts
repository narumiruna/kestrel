import type { CreateRemoteCommandRequest, RemoteCommand, RemoteDevice } from '../../lib/api.ts';

export type PendingRemoteAction = 'primary' | 'stop';
export type RemoteCommandSnapshot = {
  selectedDeviceId: string;
  command: RemoteCommand | null;
  pendingAction: PendingRemoteAction | null;
  isSubmitting: boolean;
  isPolling: boolean;
  isRefreshing: boolean;
  unconfirmed: boolean;
  error: unknown;
};
type Transport = {
  isCurrentOwner: () => boolean;
  validateDevice: (deviceId: string) => void;
  createCommand: (deviceId: string, request: CreateRemoteCommandRequest) => Promise<RemoteCommand>;
  loadDevices: (options: { showLoading: boolean; signal: AbortSignal }) => Promise<RemoteDevice[]>;
  waitForPoll: (signal: AbortSignal) => Promise<void>;
};
const POLL_ATTEMPTS = 75;
const initialSnapshot = (): RemoteCommandSnapshot => ({
  selectedDeviceId: '',
  command: null,
  pendingAction: null,
  isSubmitting: false,
  isPolling: false,
  isRefreshing: false,
  unconfirmed: false,
  error: null,
});
export function isTerminalRemoteCommand(command: RemoteCommand): boolean {
  return ['APPLIED', 'FAILED', 'EXPIRED'].includes(command.status);
}

// The mounted action owns this tracker. A dialog only subscribes to its snapshot.
export function createRemoteCommandTracker(transport: Transport) {
  let snapshot = initialSnapshot();
  let active = true;
  let generation = 0;
  let readVersion = 0;
  let refreshVersion = 0;
  let abort = new AbortController();
  let refreshPromise: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const current = (owner = generation) =>
    active && owner === generation && transport.isCurrentOwner();
  function update(patch: Partial<RemoteCommandSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }
  function reconcile(devices: RemoteDevice[]) {
    const command = snapshot.command;
    if (command == null) {
      if (
        snapshot.pendingAction == null &&
        !devices.some((d) => d.id === snapshot.selectedDeviceId)
      ) {
        const first =
          devices.find((d) => d.revokedAt == null && d.online && d.remoteControlEnabled) ??
          devices[0];
        update({ selectedDeviceId: first?.id ?? '' });
      }
      return;
    }
    if (isTerminalRemoteCommand(command)) return;
    const latest = devices.find((d) => d.id === command.deviceId)?.lastCommand;
    if (latest?.id !== command.id || latest.deviceId !== command.deviceId) {
      update({ unconfirmed: true, error: null });
      return;
    }
    // A delayed queued snapshot must not regress an already-delivered command.
    if (command.status === 'DELIVERED' && latest.status === 'QUEUED') {
      update({ error: null, unconfirmed: false });
      return;
    }
    update({
      command: latest,
      error: null,
      unconfirmed: false,
      ...(isTerminalRemoteCommand(latest) ? { pendingAction: null, isPolling: false } : {}),
    });
  }
  async function read(showLoading: boolean, owner: number) {
    const version = ++readVersion;
    try {
      const devices = await transport.loadDevices({ showLoading, signal: abort.signal });
      if (current(owner) && version === readVersion) reconcile(devices);
    } catch (error) {
      if (current(owner) && version === readVersion && snapshot.pendingAction != null) {
        update({ error, unconfirmed: true });
      }
      return false;
    }
    return true;
  }
  function refresh(): Promise<void> {
    if (!current()) return Promise.resolve();
    if (refreshPromise != null) return refreshPromise;
    const owner = generation;
    const version = ++refreshVersion;
    update({ isRefreshing: true });
    refreshPromise = (async () => {
      try {
        await read(true, owner);
      } finally {
        if (active && transport.isCurrentOwner() && version === refreshVersion) {
          update({ isRefreshing: false });
          refreshPromise = null;
        }
      }
    })();
    return refreshPromise;
  }
  async function send(build: () => CreateRemoteCommandRequest, action: PendingRemoteAction) {
    if (!current() || snapshot.pendingAction != null || !snapshot.selectedDeviceId) return;
    const deviceId = snapshot.selectedDeviceId;
    let request: CreateRemoteCommandRequest;
    try {
      transport.validateDevice(deviceId);
      request = build();
    } catch (error) {
      update({ error });
      return;
    }
    const owner = ++generation;
    ++readVersion;
    update({
      command: null,
      pendingAction: action,
      isSubmitting: true,
      error: null,
      unconfirmed: false,
    });
    try {
      const command = await transport.createCommand(deviceId, request);
      if (!current(owner)) return;
      if (command.deviceId !== deviceId) {
        update({ unconfirmed: true });
        return;
      }
      update({
        command,
        isSubmitting: false,
        pendingAction: isTerminalRemoteCommand(command) ? null : action,
      });
      if (isTerminalRemoteCommand(command)) return;
      update({ isPolling: true });
      for (
        let attempt = 0;
        attempt < POLL_ATTEMPTS && current(owner) && snapshot.pendingAction != null;
        attempt += 1
      ) {
        if (attempt > 0) await transport.waitForPoll(abort.signal);
        if (!current(owner) || snapshot.pendingAction == null) break;
        if (!(await read(false, owner))) break;
      }
      if (current(owner) && snapshot.pendingAction != null) update({ unconfirmed: true });
    } catch (error) {
      // A lost POST response is ambiguous. Do not automatically submit it again.
      if (current(owner)) update({ error, unconfirmed: true });
    } finally {
      if (current(owner)) update({ isSubmitting: false, isPolling: false });
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    activate: () => {
      active = true;
      if (abort.signal.aborted) abort = new AbortController();
    },
    dispose: () => {
      active = false;
      ++generation;
      ++readVersion;
      ++refreshVersion;
      abort.abort();
      refreshPromise = null;
      snapshot = initialSnapshot();
    },
    selectDevice: (deviceId: string) => {
      if (!current() || snapshot.pendingAction != null || snapshot.selectedDeviceId === deviceId)
        return;
      ++generation;
      ++readVersion;
      update({ ...initialSnapshot(), selectedDeviceId: deviceId });
    },
    refresh,
    send,
  };
}

export function waitForRemoteCommandPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 2_000);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}
