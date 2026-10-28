export function createDraftActionGuard() {
  let pending: (() => void) | null = null;
  return {
    request(needsConfirmation: boolean, action: () => void) {
      if (pending) return;
      if (needsConfirmation) pending = action;
      else action();
    },
    confirm() {
      const action = pending;
      pending = null;
      action?.();
    },
    cancel() {
      pending = null;
    },
  };
}
