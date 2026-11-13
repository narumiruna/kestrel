import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedApiRequest, Place, Route } from '../../lib/api.ts';
import { createDashboardLibraryLoader } from './dashboardLibraryLoader.ts';

const time = '2026-11-14T00:00:00.000Z';
const place = (id: string): Place => ({
  id,
  name: id,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
  description: null,
  latitude: 25,
  longitude: 121,
  libraryItem: null,
  tags: [],
});
const route = (id: string): Route => ({
  id,
  name: id,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
  description: null,
  currentRevision: null,
  defaultSpeedKmh: 15,
  mode: 'ONCE',
  isPublic: false,
  libraryItem: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const requests: Array<{ path: string; read: ReturnType<typeof deferred<Array<Place | Route>>> }> =
    [];
  const apiRequest: AuthenticatedApiRequest = <T>(path: string) => {
    const read = deferred<Array<Place | Route>>();
    requests.push({ path, read });
    return read.promise as Promise<T>;
  };
  return { loader: createDashboardLibraryLoader(apiRequest), requests };
}
type Loader = ReturnType<typeof createDashboardLibraryLoader>;
const resources = [
  { resource: 'places', selectedKey: 'selectedPlaceId', item: place },
  { resource: 'routes', selectedKey: 'selectedRouteId', item: route },
] as const;
const refreshResource = (loader: Loader, resource: 'places' | 'routes') =>
  resource === 'places' ? loader.refreshPlaces() : loader.refreshRoutes();
const selectResource = (loader: Loader, resource: 'places' | 'routes', id: string) =>
  resource === 'places' ? loader.setSelectedPlaceId(id) : loader.setSelectedRouteId(id);
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const { resource, selectedKey, item } of resources) {
  test(`${resource}: an old full read cannot restore a deleted row after a targeted refresh`, async () => {
    const { loader, requests } = setup();
    const initial = refreshResource(loader, resource);
    requests[0].read.resolve([item('deleted'), item('survivor')]);
    await initial;
    selectResource(loader, resource, 'deleted');

    const oldFull = loader.refresh();
    const oldRead = requests.findLast((request) => request.path === `/${resource}`);
    const otherRead = requests.findLast((request) => request.path !== `/${resource}`);
    assert.ok(oldRead);
    assert.ok(otherRead);
    otherRead.read.resolve([]);
    await tick();
    // The delete has committed; its collection read must supersede the old full read.
    const afterDelete = refreshResource(loader, resource);
    requests.at(-1)?.read.resolve([item('survivor')]);
    await afterDelete;
    const latest = loader.getSnapshot();
    assert.deepEqual(latest[resource], [item('survivor')]);
    assert.equal(latest[selectedKey], 'survivor');
    assert.equal(latest.isLoading, false);
    assert.ok(latest.lastLoadedAt);

    oldRead.read.resolve([item('deleted'), item('survivor')]);
    await oldFull;
    assert.equal(loader.getSnapshot(), latest);
  });

  test(`${resource}: a new full refresh supersedes a targeted read and ignores its late failure`, async () => {
    const { loader, requests } = setup();
    const oldRead = refreshResource(loader, resource);
    const newFull = loader.refresh();
    requests[1].read.resolve([place('new-place')]);
    requests[2].read.resolve([route('new-route')]);
    await newFull;
    const latest = loader.getSnapshot();
    assert.equal(latest.isLoading, false);
    requests[0].read.reject(new Error('stale collection failure'));
    await oldRead;
    assert.equal(loader.getSnapshot(), latest);
    assert.equal(latest[selectedKey], resource === 'places' ? 'new-place' : 'new-route');
  });

  test(`${resource}: stale failures cannot change errors, loading or timestamp while the newest read is pending`, async () => {
    const { loader, requests } = setup();
    const oldRead = refreshResource(loader, resource);
    const newRead = refreshResource(loader, resource);
    const pending = loader.getSnapshot();
    requests[0].read.reject(new Error('stale failure'));
    await oldRead;
    assert.equal(loader.getSnapshot(), pending);
    assert.equal(pending.isLoading, true);
    assert.equal(pending.lastLoadedAt, null);
    const failure = new Error('current failure');
    requests[1].read.reject(failure);
    await newRead;
    const result = loader.getSnapshot();
    assert.equal(result[`${resource}Failure`], failure);
    assert.equal(result.isLoading, false);
    assert.equal(result.lastLoadedAt, null);
  });

  test(`${resource}: stale successes cannot clear the newest failure or change selection`, async () => {
    const { loader, requests } = setup();
    const oldRead = refreshResource(loader, resource);
    const newRead = refreshResource(loader, resource);
    const failure = new Error('newest failed');
    requests[1].read.reject(failure);
    await newRead;
    const latest = loader.getSnapshot();
    requests[0].read.resolve([item('stale')]);
    await oldRead;
    assert.equal(loader.getSnapshot(), latest);
    assert.equal(latest[`${resource}Failure`], failure);
    assert.equal(latest[selectedKey], null);
    assert.equal(latest.lastLoadedAt, null);
  });
}

test('overlapping full refreshes only finish loading when the newest resources settle', async () => {
  const { loader, requests } = setup();
  const first = loader.refresh();
  const second = loader.refresh();
  const pending = loader.getSnapshot();
  requests[0].read.resolve([place('old')]);
  requests[1].read.resolve([route('old')]);
  await first;
  assert.equal(loader.getSnapshot(), pending);
  assert.equal(pending.isLoading, true);
  assert.equal(pending.lastLoadedAt, null);
  requests[2].read.resolve([place('new')]);
  await tick();
  const partial = loader.getSnapshot();
  assert.deepEqual(partial.places, [place('new')]);
  assert.equal(partial.isLoading, true);
  assert.ok(partial.lastLoadedAt);
  requests[3].read.reject(new Error('route read failed'));
  await second;
  assert.equal(loader.getSnapshot().isLoading, false);
  assert.equal(loader.getSnapshot().lastLoadedAt, partial.lastLoadedAt);
});

for (const { resource: failedResource } of resources) {
  test(`partial full refresh retains failed ${failedResource} data and selection`, async () => {
    const { loader, requests } = setup();
    const initial = loader.refresh();
    requests[0].read.resolve([place('p1'), place('p2')]);
    requests[1].read.resolve([route('r1'), route('r2')]);
    await initial;
    loader.setSelectedPlaceId((current) => {
      assert.equal(current, 'p1');
      return 'p2';
    });
    loader.setSelectedRouteId((current) => {
      assert.equal(current, 'r1');
      return 'r2';
    });
    const previous = loader.getSnapshot();
    const refresh = loader.refresh();
    const failure = new Error('one collection failed');
    if (failedResource === 'places') {
      requests[2].read.reject(failure);
      requests[3].read.resolve([route('r3'), route('r2')]);
    } else {
      requests[2].read.resolve([place('p3'), place('p2')]);
      requests[3].read.reject(failure);
    }
    await refresh;
    const result = loader.getSnapshot();
    assert.equal(result[failedResource], previous[failedResource]);
    assert.equal(result[`${failedResource}Failure`], failure);
    assert.equal(result.selectedPlaceId, 'p2');
    assert.equal(result.selectedRouteId, 'r2');
    assert.equal(result.isLoading, false);
    assert.ok(result.lastLoadedAt);
    assert.notEqual(result.lastLoadedAt, previous.lastLoadedAt);

    const failed = loader.refresh();
    requests[4].read.reject(failure);
    requests[5].read.reject(failure);
    await failed;
    assert.equal(loader.getSnapshot().lastLoadedAt, result.lastLoadedAt);
    assert.equal(loader.getSnapshot().isLoading, false);

    const recovery = refreshResource(loader, failedResource);
    assert.equal(loader.getSnapshot()[`${failedResource}Failure`], null);
    requests[6].read.resolve([]);
    await recovery;
    assert.equal(
      loader.getSnapshot()[failedResource === 'places' ? 'selectedPlaceId' : 'selectedRouteId'],
      null,
    );
  });
}

for (const existing of [false, true]) {
  test(`route upsert ${existing ? 'updates' : 'adds'} a saved route and invalidates all pending route reads`, async () => {
    const { loader, requests } = setup();
    const initial = loader.refreshRoutes();
    requests[0].read.resolve(existing ? [route('saved'), route('other')] : [route('other')]);
    await initial;
    const oldFull = loader.refresh();
    const oldTargeted = loader.refreshRoutes();
    const saved = { ...route('saved'), name: 'Saved edit', defaultSpeedKmh: 30 };
    loader.upsertRoute(saved);
    const committed = loader.getSnapshot();
    assert.equal(
      committed.routes.find((item) => item.id === saved.id),
      saved,
    );
    assert.equal(committed.routes.filter((item) => item.id === saved.id).length, 1);
    assert.equal(committed.selectedRouteId, saved.id);
    assert.equal(committed.routesFailure, null);
    assert.equal(committed.isLoading, true); // The current Places read is still pending.
    requests[2].read.resolve([route('saved')]);
    requests[3].read.reject(new Error('stale route failure'));
    await oldTargeted;
    assert.equal(loader.getSnapshot(), committed);
    requests[1].read.reject(new Error('current places failure'));
    await oldFull;
    assert.equal(loader.getSnapshot().routes, committed.routes);
    assert.equal(loader.getSnapshot().selectedRouteId, saved.id);
    assert.equal(loader.getSnapshot().routesFailure, null);
    assert.equal(loader.getSnapshot().lastLoadedAt, committed.lastLoadedAt);
    assert.equal(loader.getSnapshot().isLoading, false);

    const laterRead = loader.refreshRoutes();
    requests[4].read.resolve([saved, route('later')]);
    await laterRead;
    assert.deepEqual(loader.getSnapshot().routes, [saved, route('later')]);
    assert.equal(loader.getSnapshot().selectedRouteId, saved.id);
  });
}

test('a route save clears a prior route failure and finishes route-only loading', async () => {
  const { loader, requests } = setup();
  const failed = loader.refreshRoutes();
  requests[0].read.reject(new Error('failed read'));
  await failed;
  assert.ok(loader.getSnapshot().routesFailure);
  loader.upsertRoute(route('saved'));
  assert.equal(loader.getSnapshot().routesFailure, null);
  const pending = loader.refreshRoutes();
  loader.upsertRoute({ ...route('saved'), name: 'Second save' });
  const saved = loader.getSnapshot();
  assert.equal(saved.isLoading, false);
  requests[1].read.resolve([]);
  await pending;
  assert.equal(loader.getSnapshot(), saved);
});

test('effect cleanup invalidates pending reads before the next activation', async () => {
  const { loader, requests } = setup();
  const oldRefresh = loader.refresh();
  loader.invalidatePending();
  const newRefresh = loader.refresh();
  const current = loader.getSnapshot();
  requests[0].read.resolve([place('old')]);
  requests[1].read.reject(new Error('old failure'));
  await oldRefresh;
  assert.equal(loader.getSnapshot(), current);
  requests[2].read.resolve([]);
  requests[3].read.resolve([]);
  await newRefresh;
  assert.equal(loader.getSnapshot().isLoading, false);
});

test('subscribers see committed snapshots and can unsubscribe without changing loader state', async () => {
  const { loader, requests } = setup();
  const snapshots: Array<ReturnType<Loader['getSnapshot']>> = [];
  const unsubscribe = loader.subscribe(() => snapshots.push(loader.getSnapshot()));
  const read = loader.refreshPlaces();
  assert.equal(snapshots.at(-1)?.isLoading, true);
  requests[0].read.resolve([place('p1'), place('p2')]);
  await read;
  assert.deepEqual(snapshots.at(-1)?.places, [place('p1'), place('p2')]);
  assert.equal(snapshots.at(-1)?.selectedPlaceId, 'p1');
  unsubscribe();
  const count = snapshots.length;
  loader.setSelectedPlaceId('p2');
  assert.equal(loader.getSnapshot().selectedPlaceId, 'p2');
  assert.equal(snapshots.length, count);
});
