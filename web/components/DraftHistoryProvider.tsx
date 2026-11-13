'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';
import { createHistoryNavigation } from './historyNavigation';

type Blocker = (proceed: () => void) => void;
const DraftHistoryContext = createContext<((blocker: Blocker) => () => void) | null>(null);

/** Mounted across workspace routes so every same-document entry has a position. */
export function DraftHistoryProvider({ children }: { children: ReactNode }) {
  const blockerRef = useRef<Blocker | null>(null);
  const register = useCallback((blocker: Blocker) => {
    blockerRef.current = blocker;
    return () => {
      if (blockerRef.current === blocker) blockerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const navigation = createHistoryNavigation(
      window.history,
      () => blockerRef.current != null,
      (proceed) => blockerRef.current?.(proceed),
    );
    window.addEventListener('popstate', navigation.handlePopState, true);
    return () => {
      window.removeEventListener('popstate', navigation.handlePopState, true);
      navigation.dispose();
    };
  }, []);

  return <DraftHistoryContext.Provider value={register}>{children}</DraftHistoryContext.Provider>;
}

export function useDraftHistoryGuard(enabled: boolean, onBlocked: Blocker) {
  const register = useContext(DraftHistoryContext);
  const callbackRef = useRef(onBlocked);
  callbackRef.current = onBlocked;
  useEffect(() => {
    if (!enabled || register == null) return;
    return register((proceed) => callbackRef.current(proceed));
  }, [enabled, register]);
}
