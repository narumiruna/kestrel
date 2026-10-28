import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CreateRemoteCommandRequest, RemoteCommand, RemoteDevice } from '../../lib/api.ts';
import { createRemoteCommandTracker } from './remoteCommandState.ts';

const time = '2026-10-28T08:00:00.000Z';
const request: CreateRemoteCommandRequest = { type: 'STOP', payload: {} };
const command = (status: RemoteCommand['status'] = 'QUEUED', id = 'command-1'): RemoteCommand => ({
  ...request,
  id,
  deviceId: 'device-1',
  status,
  createdAt: time,
  deliveredAt: null,
  appliedAt: status === 'APPLIED' ? time : null,
  expiresAt: time,
  errorMessage: null,
});
const device = (lastCommand: RemoteCommand | null = null): RemoteDevice => ({
  id: 'device-1',
  name: 'Review phone',
  appVersion: '0.10.0',
  createdAt: time,
  lastSeenAt: time,
  online: true,
  platform: 'ANDROID',
  remoteControlEnabled: true,
  revokedAt: null,
  state: null,
  lastCommand,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  let current = true;
  let devices = [device()];
  let readFailure: unknown = null;
  let posts = 0;
  let reads = 0;
  const waits: Array<ReturnType<typeof deferred<void>>> = [];
  const transport = {
    isCurrentOwner: () => current,
    validateDevice: (_deviceId: string) => {},
    createCommand: async (_deviceId: string, _request: CreateRemoteCommandRequest) => {
      posts += 1;
      devices = [device(command())];
      return command();
    },
    loadDevices: async (_options: { showLoading: boolean; signal: AbortSignal }) => {
      reads += 1;
      if (readFailure != null) throw readFailure;
      return devices;
    },
    waitForPoll: async (signal: AbortSignal) => {
      const waiting = deferred<void>();
      signal.addEventListener('abort', () => waiting.resolve(), { once: true });
      waits.push(waiting);
      await waiting.promise;
    },
  };
  const tracker = createRemoteCommandTracker(transport);
  tracker.activate();
  tracker.selectDevice('device-1');
  return {
    tracker,
    transport,
    waits,
    setDevices: (next: RemoteDevice[]) => {
      devices = next;
    },
    setFailure: (next: unknown) => {
      readFailure = next;
    },
    loseOwner: () => {
      current = false;
    },
    counts: () => ({ posts, reads }),
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('a matching Refresh recovers failed polling without submitting again', async () => {
  const s = setup();
  s.setFailure(new Error('status read failed'));
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.tracker.getSnapshot().command?.status, 'QUEUED');
  assert.ok(s.tracker.getSnapshot().error);
  assert.equal(s.tracker.getSnapshot().pendingAction, 'primary');
  s.setFailure(null);
  s.setDevices([device(command('APPLIED'))]);
  await s.tracker.refresh();
  assert.equal(s.tracker.getSnapshot().command?.status, 'APPLIED');
  assert.equal(s.tracker.getSnapshot().error, null);
  assert.equal(s.tracker.getSnapshot().pendingAction, null);
  assert.equal(s.counts().posts, 1);
});

test('dialog observers can leave and reopen without clearing the pending send guard', async () => {
  const s = setup();
  const send = s.tracker.send(() => request, 'primary');
  await tick();
  const unsubscribe = s.tracker.subscribe(() => {});
  unsubscribe();
  const reopened = s.tracker.subscribe(() => {});
  assert.equal(s.tracker.getSnapshot().command?.id, 'command-1');
  assert.equal(s.tracker.getSnapshot().pendingAction, 'primary');
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.counts().posts, 1);
  reopened();
  s.tracker.dispose();
  await send;
});

test('Close before the POST completes cannot release the synchronous submission guard', async () => {
  const s = setup();
  const submitted = deferred<RemoteCommand>();
  s.transport.createCommand = async () => {
    submitted.resolve(command('APPLIED'));
    return submitted.promise;
  };
  const work = s.tracker.send(() => request, 'primary');
  assert.equal(s.tracker.getSnapshot().isSubmitting, true);
  await s.tracker.send(() => {
    throw new Error('duplicate build must not run');
  }, 'primary');
  submitted.resolve(command('APPLIED'));
  await work;
  assert.equal(s.tracker.getSnapshot().command?.status, 'APPLIED');
  assert.equal(s.tracker.getSnapshot().pendingAction, null);
});

for (const status of ['APPLIED', 'FAILED', 'EXPIRED'] as const) {
  test(`Refresh reconciles matching ${status} and preserves its terminal result`, async () => {
    const s = setup();
    s.setFailure(new Error('poll failed'));
    await s.tracker.send(() => request, 'stop');
    s.setFailure(null);
    s.setDevices([device(command(status))]);
    await s.tracker.refresh();
    assert.equal(s.tracker.getSnapshot().command?.status, status);
    assert.equal(s.tracker.getSnapshot().pendingAction, null);
    s.setDevices([device(command('QUEUED'))]);
    await s.tracker.refresh();
    assert.equal(s.tracker.getSnapshot().command?.status, status);
    s.setFailure(new Error('later read failed'));
    await s.tracker.refresh();
    assert.equal(s.tracker.getSnapshot().command?.status, status);
    assert.equal(s.tracker.getSnapshot().error, null);
  });
}

for (const match of [
  null,
  command('APPLIED', 'other-command'),
  { ...command('APPLIED'), deviceId: 'other-device' },
]) {
  test(`missing or unrelated latest-command data cannot confirm the tracked result: ${match?.id ?? 'missing'}`, async () => {
    const s = setup();
    s.setFailure(new Error('poll failed'));
    await s.tracker.send(() => request, 'primary');
    s.setFailure(null);
    s.setDevices([device(match)]);
    await s.tracker.refresh();
    assert.equal(s.tracker.getSnapshot().command?.status, 'QUEUED');
    assert.equal(s.tracker.getSnapshot().unconfirmed, true);
    assert.equal(s.tracker.getSnapshot().pendingAction, 'primary');
    await s.tracker.send(() => request, 'primary');
    assert.equal(s.counts().posts, 1);
  });
}

test('matching nonterminal responses clear read errors but retain the pending guard', async () => {
  const s = setup();
  s.setFailure(new Error('poll failed'));
  await s.tracker.send(() => request, 'primary');
  s.setFailure(null);
  for (const status of ['QUEUED', 'DELIVERED'] as const) {
    s.setDevices([device(command(status))]);
    await s.tracker.refresh();
    assert.equal(s.tracker.getSnapshot().error, null);
    assert.equal(s.tracker.getSnapshot().command?.status, status);
    assert.equal(s.tracker.getSnapshot().pendingAction, 'primary');
  }
});

test('late older reads cannot undo a newer matching recovery', async () => {
  const s = setup();
  const older = deferred<RemoteDevice[]>();
  s.transport.loadDevices = async () => older.promise;
  const send = s.tracker.send(() => request, 'primary');
  await tick();
  s.transport.loadDevices = async () => [device(command('APPLIED'))];
  await s.tracker.refresh();
  older.resolve([device(command('QUEUED'))]);
  await send;
  assert.equal(s.tracker.getSnapshot().command?.status, 'APPLIED');
  assert.equal(s.tracker.getSnapshot().error, null);
});

test('an ambiguous POST failure is not automatically submitted again or called ready', async () => {
  const s = setup();
  let attempts = 0;
  s.transport.createCommand = async () => {
    attempts += 1;
    throw new Error('response lost');
  };
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.tracker.getSnapshot().command, null);
  assert.equal(s.tracker.getSnapshot().unconfirmed, true);
  await s.tracker.send(() => request, 'primary');
  await s.tracker.refresh();
  assert.equal(attempts, 1);
  assert.equal(s.tracker.getSnapshot().pendingAction, 'primary');
});

test('owner loss and disposal ignore late submissions and stop polling', async () => {
  const s = setup();
  const submitted = deferred<RemoteCommand>();
  s.transport.createCommand = async () => submitted.promise;
  const work = s.tracker.send(() => request, 'primary');
  s.loseOwner();
  s.tracker.dispose();
  submitted.resolve(command('APPLIED'));
  await work;
  assert.equal(s.tracker.getSnapshot().command, null);
  assert.equal(s.counts().reads, 0);
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.tracker.getSnapshot().pendingAction, null);
});

test('device selection cannot drop an unresolved operation', async () => {
  const s = setup();
  s.setFailure(new Error('poll failed'));
  await s.tracker.send(() => request, 'primary');
  s.tracker.selectDevice('other-device');
  assert.equal(s.tracker.getSnapshot().selectedDeviceId, 'device-1');
  s.setFailure(null);
  s.setDevices([device(command('APPLIED'))]);
  await s.tracker.refresh();
  s.tracker.selectDevice('other-device');
  assert.equal(s.tracker.getSnapshot().selectedDeviceId, 'other-device');
  assert.equal(s.tracker.getSnapshot().command, null);
});

test('Refresh busy cleanup is independent of a newer send generation', async () => {
  const s = setup();
  const reading = deferred<RemoteDevice[]>();
  s.transport.loadDevices = async () => reading.promise;
  const refresh = s.tracker.refresh();
  const send = s.tracker.send(() => request, 'primary');
  await tick();
  reading.resolve([device(command('APPLIED'))]);
  await Promise.all([refresh, send]);
  assert.equal(s.tracker.getSnapshot().command?.status, 'APPLIED');
  assert.equal(s.tracker.getSnapshot().isRefreshing, false);
});

test('a matching queued read clears a failed-read error without regressing Delivered', async (t) => {
  const s = setup();
  t.after(() => s.tracker.dispose());
  const send = s.tracker.send(() => request, 'primary');
  await tick();
  s.setDevices([device(command('DELIVERED'))]);
  await s.tracker.refresh();
  s.setFailure(new Error('read failed'));
  await s.tracker.refresh();
  assert.ok(s.tracker.getSnapshot().error);
  s.setFailure(null);
  s.setDevices([device(command('QUEUED'))]);
  await s.tracker.refresh();
  assert.equal(s.tracker.getSnapshot().command?.status, 'DELIVERED');
  assert.equal(s.tracker.getSnapshot().error, null);
  assert.equal(s.tracker.getSnapshot().unconfirmed, false);
  s.tracker.dispose();
  await send;
});

test('local availability failure does not acquire an ambiguous POST lock', async () => {
  const s = setup();
  let posts = 0;
  s.transport.createCommand = async () => {
    posts += 1;
    return command('APPLIED');
  };
  s.transport.validateDevice = () => {
    throw new Error('device unavailable');
  };
  await s.tracker.send(() => request, 'primary');
  assert.equal(posts, 0);
  assert.equal(s.tracker.getSnapshot().pendingAction, null);
  assert.equal(s.tracker.getSnapshot().unconfirmed, false);
  s.transport.validateDevice = () => {};
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.tracker.getSnapshot().command?.status, 'APPLIED');
  assert.equal(posts, 1);
});

test('polling budget ends as unconfirmed without releasing the send guard', async () => {
  const s = setup();
  s.transport.waitForPoll = async () => {};
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.counts().reads, 75);
  assert.equal(s.tracker.getSnapshot().isPolling, false);
  assert.equal(s.tracker.getSnapshot().unconfirmed, true);
  assert.equal(s.tracker.getSnapshot().pendingAction, 'primary');
  await s.tracker.send(() => request, 'primary');
  assert.equal(s.counts().posts, 1);
});

test('owner disposal invalidates old Refresh cleanup after reactivation', async () => {
  const s = setup();
  const first = deferred<RemoteDevice[]>();
  const second = deferred<RemoteDevice[]>();
  s.transport.loadDevices = async () => first.promise;
  const oldRefresh = s.tracker.refresh();
  s.tracker.dispose();
  s.tracker.activate();
  s.transport.loadDevices = async () => second.promise;
  const newRefresh = s.tracker.refresh();
  first.resolve([device()]);
  await oldRefresh;
  assert.equal(s.tracker.getSnapshot().isRefreshing, true);
  second.resolve([device()]);
  await newRefresh;
  assert.equal(s.tracker.getSnapshot().isRefreshing, false);
});

test('Route command ownership survives View/Edit/Playback control unmounts', () => {
  const editor = readFileSync(new URL('./RouteEditor.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('./RemoteControlPanel.tsx', import.meta.url), 'utf8');
  const action = panel.slice(
    panel.indexOf('export function RouteRemoteControlAction('),
    panel.indexOf('function RemoteControlControls('),
  );
  assert.ok(editor.includes('const remote = useRemoteDevices();'));
  assert.ok(editor.includes('remote={remote}'));
  assert.ok(!action.includes('const remote = useRemoteDevices();'));
});

test('the Device owner is outside dismissible content; command state is not dialog-local', () => {
  const source = readFileSync(new URL('./RemoteControlPanel.tsx', import.meta.url), 'utf8');
  const content = source.slice(source.indexOf('function RemoteControlControls('));
  assert.ok(!content.includes('useState<RemoteCommand'));
  assert.ok(!content.includes('useState<PendingAction>'));
});
