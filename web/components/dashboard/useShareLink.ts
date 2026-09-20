'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { formatError } from '@/components/dashboard/utils';
import { ApiError, type ShareLink } from '@/lib/api';

export function useShareLink(itemKind: 'places' | 'routes', itemId: string | null) {
  const auth = useAuth();
  const path = itemId == null ? null : `/${itemKind}/${itemId}/share-link`;
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  // Callers retain their own dialog opening, item switching, and notice reset triggers.
  const loadShareLink = useCallback(async () => {
    if (path == null) {
      setShareLink(null);
      setError(null);
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      setShareLink(await auth.apiRequest<ShareLink>(path));
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 404) {
        setShareLink(null);
      } else {
        setError(formatError(nextError));
      }
    } finally {
      setIsLoading(false);
    }
  }, [auth, path]);

  async function mutateShareLink(disabled?: boolean) {
    if (path == null) {
      return;
    }

    setError(null);
    setIsMutating(true);
    try {
      setShareLink(
        await auth.apiRequest<ShareLink>(
          path,
          disabled == null
            ? { method: 'POST' }
            : { body: JSON.stringify({ disabled }), method: 'PATCH' },
        ),
      );
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  return {
    createShareLink: () => mutateShareLink(),
    error,
    isLoading,
    isMutating,
    loadShareLink,
    setDisabled: (disabled: boolean) => mutateShareLink(disabled),
    // Library actions share error/busy state with their delete confirmation.
    setError,
    setIsMutating,
    setShareLink,
    shareLink,
  };
}
