'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { errorMessage } from '@/i18n/errors';
import { createShareLinkState } from './shareLinkState';

export function useShareLink(itemKind: 'places' | 'routes', itemId: string | null) {
  const { apiRequest, session } = useAuth();
  const userId = session?.user.id;
  const sessionId = session?.session.id;
  const te = useTranslations('Errors');
  // Token rotation preserves this owner; a new login/session or item does not.
  const state = useMemo(
    () =>
      createShareLinkState(
        userId == null || sessionId == null || itemId == null
          ? null
          : `/${itemKind}/${itemId}/share-link`,
        apiRequest,
      ),
    [apiRequest, userId, sessionId, itemKind, itemId],
  );
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
  useEffect(() => {
    state.activate();
    return state.dispose;
  }, [state]);

  return {
    createShareLink: state.createShareLink,
    error: snapshot.failure == null ? null : errorMessage(snapshot.failure, te),
    isLoading: snapshot.readState === 'loading',
    isMutating: snapshot.isMutating,
    readState: snapshot.readState,
    canMutate: snapshot.canMutate,
    loadShareLink: state.loadShareLink,
    setDisabled: state.setDisabled,
    // Library actions share error/busy state with their delete confirmation.
    setError: state.setError,
    setIsMutating: state.setIsMutating,
    setShareLink: state.setShareLink,
    shareLink: snapshot.shareLink,
  };
}
