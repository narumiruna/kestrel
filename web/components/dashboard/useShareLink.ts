'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ApiError, type ShareLink } from '@/lib/api';
import { formatError, toAbsolutePublicUrl } from './utils';

export function useShareLink(itemKind: 'places' | 'routes', itemId: string | null) {
  const auth = useAuth();
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const path = itemId == null ? null : `/${itemKind}/${itemId}/share-link`;

  const loadShareLink = useCallback(
    async (reset = false) => {
      setError(null);
      setNotice(null);
      if (reset || path == null) setShareLink(null);
      if (path == null) return;

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
    },
    [auth, path],
  );

  async function mutateShareLink(disabled?: boolean) {
    if (path == null) return;
    setNotice(null);
    setError(null);
    setIsMutating(true);
    try {
      setShareLink(
        await auth.apiRequest<ShareLink>(
          path,
          disabled === undefined
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

  async function copyPublicUrl(failureMessage = 'Copy failed; select the URL manually.') {
    if (shareLink == null) return;
    try {
      await navigator.clipboard.writeText(toAbsolutePublicUrl(shareLink.publicUrl));
      setNotice('Share URL copied.');
    } catch {
      setNotice(failureMessage);
    }
  }

  return {
    shareLink,
    error,
    notice,
    isLoading,
    isMutating,
    loadShareLink,
    createShareLink: () => mutateShareLink(),
    setDisabled: (disabled: boolean) => mutateShareLink(disabled),
    copyPublicUrl,
    // Library item deletion shares the dialog's feedback and busy surface.
    setError,
    setIsMutating,
  };
}
