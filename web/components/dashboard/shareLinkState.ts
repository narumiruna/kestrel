import { ApiError, type ShareLink } from '../../lib/api.ts';

export type ShareLinkReadState = 'idle' | 'loading' | 'ready' | 'error';
type Update<T> = T | ((previous: T) => T);
type Snapshot = {
  readState: ShareLinkReadState;
  shareLink: ShareLink | null;
  failure: unknown;
  isMutating: boolean;
  canMutate: boolean;
};
type Request = (path: string, options?: RequestInit) => Promise<ShareLink>;

// One instance belongs to one user/session/item. It never stores credentials.
export function createShareLinkState(path: string | null, request: Request) {
  let active = true;
  let version = 0;
  let snapshot: Snapshot = {
    readState: 'idle',
    shareLink: null,
    failure: null,
    isMutating: false,
    canMutate: false,
  };
  const listeners = new Set<() => void>();
  function update(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    snapshot.canMutate =
      active && path != null && snapshot.readState === 'ready' && !snapshot.isMutating;
    for (const listener of listeners) listener();
  }
  function current(identity: number) {
    return active && version === identity;
  }
  async function loadShareLink() {
    if (!active || path == null || snapshot.isMutating) return;
    const identity = ++version;
    update({ readState: 'loading', failure: null });
    try {
      const shareLink = await request(path);
      if (current(identity)) update({ shareLink, readState: 'ready', failure: null });
    } catch (failure) {
      if (!current(identity)) return;
      if (failure instanceof ApiError && failure.status === 404) {
        update({ shareLink: null, readState: 'ready', failure: null });
      } else {
        update({ readState: 'error', failure });
      }
    }
  }
  async function mutate(disabled?: boolean) {
    if (!snapshot.canMutate || path == null) return;
    if (disabled == null ? snapshot.shareLink != null : snapshot.shareLink == null) return;
    const identity = ++version;
    // Update before awaiting: two clicks in the same render cannot both submit.
    update({ isMutating: true, failure: null });
    try {
      const shareLink = await request(
        path,
        disabled == null
          ? { method: 'POST' }
          : { method: 'PATCH', body: JSON.stringify({ disabled }) },
      );
      if (current(identity)) update({ shareLink, readState: 'ready', failure: null });
    } catch (failure) {
      // A failed write may have reached the server. Require a read before another write.
      if (current(identity)) update({ readState: 'error', failure });
    } finally {
      if (current(identity)) update({ isMutating: false });
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
    },
    dispose: () => {
      active = false;
      ++version;
      update({ readState: 'idle', shareLink: null, failure: null, isMutating: false });
    },
    loadShareLink,
    createShareLink: () => mutate(),
    setDisabled: (disabled: boolean) => mutate(disabled),
    setError: (value: Update<unknown>) => {
      if (!active) return;
      update({ failure: typeof value === 'function' ? value(snapshot.failure) : value });
    },
    setIsMutating: (value: Update<boolean>) => {
      if (!active) return;
      const isMutating = typeof value === 'function' ? value(snapshot.isMutating) : value;
      ++version;
      update({
        isMutating,
        readState: snapshot.readState === 'loading' ? 'idle' : snapshot.readState,
      });
    },
    setShareLink: (value: Update<ShareLink | null>) => {
      if (!active || snapshot.isMutating) return;
      const shareLink = typeof value === 'function' ? value(snapshot.shareLink) : value;
      ++version;
      update({ shareLink, readState: shareLink == null ? 'idle' : 'ready' });
    },
  };
}
