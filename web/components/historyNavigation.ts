const POSITION_KEY = 'kestrelHistoryPosition';

type HistoryPort = Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
type PopEvent = Pick<PopStateEvent, 'state' | 'stopImmediatePropagation'>;

function position(state: unknown): number | null {
  if (state == null || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[POSITION_KEY];
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function withPosition(state: unknown, value: number) {
  return { ...(state != null && typeof state === 'object' ? state : {}), [POSITION_KEY]: value };
}

/** Track existing entries instead of adding sentinel entries to browser history. */
export function createHistoryNavigation(
  history: HistoryPort,
  isBlocked: () => boolean,
  requestConfirmation: (proceed: () => void) => void,
) {
  const push = history.pushState;
  const replace = history.replaceState;
  let current = position(history.state) ?? 0;
  let currentState: unknown = history.state;
  let active = true;
  let restoring: { origin: number; target: number } | null = null;
  let bypass: number | null = null;
  replace.call(history, withPosition(history.state, current), '');

  const trackedPush: History['pushState'] = (state, unused, url) => {
    const next = current + 1;
    push.call(history, active ? withPosition(state, next) : state, unused, url);
    if (active) {
      current = next;
      currentState = history.state;
    }
  };
  const trackedReplace: History['replaceState'] = (state, unused, url) => {
    replace.call(history, active ? withPosition(state, current) : state, unused, url);
    if (active) currentState = history.state;
  };
  history.pushState = trackedPush;
  history.replaceState = trackedReplace;

  return {
    handlePopState(event: PopEvent) {
      if (!active) return;
      const target = position(event.state);
      if (target == null) {
        // Native fragment navigation creates an entry without calling pushState.
        current += 1;
        replace.call(history, withPosition(history.state ?? currentState, current), '');
        currentState = history.state;
        return;
      }
      if (bypass === target) {
        bypass = null;
        restoring = null;
        current = target;
        currentState = event.state;
        return;
      }
      if (restoring != null) {
        event.stopImmediatePropagation();
        if (target !== restoring.origin) {
          history.go(restoring.origin - target);
          return;
        }
        const traversal = restoring;
        restoring = null;
        let proceeded = false;
        const proceed = () => {
          if (!active || proceeded || current !== traversal.origin) return;
          proceeded = true;
          bypass = traversal.target;
          history.go(traversal.target - current);
        };
        if (isBlocked()) requestConfirmation(proceed);
        else proceed();
        return;
      }
      if (target !== current && isBlocked()) {
        // Capture before Next.js sees the event so the editor remains mounted.
        event.stopImmediatePropagation();
        restoring = { origin: current, target };
        history.go(current - target);
        return;
      }
      current = target;
      currentState = event.state;
    },
    dispose() {
      active = false;
      restoring = null;
      bypass = null;
      if (history.pushState === trackedPush) history.pushState = push;
      if (history.replaceState === trackedReplace) history.replaceState = replace;
    },
  };
}
