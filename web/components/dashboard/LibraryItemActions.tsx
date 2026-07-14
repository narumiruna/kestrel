'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { formatError, toAbsolutePublicUrl } from '@/components/dashboard/utils';
import { ApiError, type ShareLink } from '@/lib/api';

type ItemKind = 'places' | 'routes';

type Props = {
  itemId: string;
  itemKind: ItemKind;
  itemName: string;
  onDeleted: () => void | Promise<void>;
};

export function LibraryItemActions({ itemId, itemKind, itemName, onDeleted }: Props) {
  const auth = useAuth();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog == null) {
      return;
    }

    if (isShareOpen && !dialog.open) {
      dialog.showModal();
      setError(null);
      setNotice(null);
      setShareLink(null);
      setIsLoadingShare(true);
      void auth
        .apiRequest<ShareLink>(`/${itemKind}/${itemId}/share-link`)
        .then(setShareLink)
        .catch((nextError: unknown) => {
          if (nextError instanceof ApiError && nextError.status === 404) {
            setShareLink(null);
          } else {
            setError(formatError(nextError));
          }
        })
        .finally(() => setIsLoadingShare(false));
      return;
    }

    if (!isShareOpen && dialog.open) {
      dialog.close();
    }
  }, [auth, isShareOpen, itemId, itemKind]);

  async function createShareLink() {
    setError(null);
    setNotice(null);
    setIsMutating(true);

    try {
      setShareLink(
        await auth.apiRequest<ShareLink>(`/${itemKind}/${itemId}/share-link`, { method: 'POST' }),
      );
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function setShareDisabled(disabled: boolean) {
    setError(null);
    setNotice(null);
    setIsMutating(true);

    try {
      setShareLink(
        await auth.apiRequest<ShareLink>(`/${itemKind}/${itemId}/share-link`, {
          body: JSON.stringify({ disabled }),
          method: 'PATCH',
        }),
      );
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function copyShareUrl() {
    if (shareLink == null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(toAbsolutePublicUrl(shareLink.publicUrl));
      setNotice('Share URL copied.');
    } catch {
      setNotice('Copy failed. Select the URL and copy it manually.');
    }
  }

  async function deleteItem() {
    if (!window.confirm(`Delete “${itemName}”? This cannot be undone.`)) {
      return;
    }

    setIsMutating(true);
    setError(null);

    try {
      await auth.apiRequest(`/${itemKind}/${itemId}`, { method: 'DELETE' });
      await onDeleted();
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  const mapHref = `/dashboard/map?kind=${itemKind}&selected=${encodeURIComponent(itemId)}`;
  const itemLabel = itemKind === 'places' ? 'place' : 'route';

  return (
    <div className="library-item-actions">
      <Link className="library-open-map" href={mapHref}>
        Open on map
      </Link>
      <button className="secondary" type="button" onClick={() => setIsShareOpen(true)}>
        Share
      </button>
      <details className="library-more-menu">
        <summary>More</summary>
        <div className="library-more-menu-content">
          <button className="danger" disabled={isMutating} type="button" onClick={deleteItem}>
            Delete {itemLabel}…
          </button>
        </div>
      </details>
      {error == null || isShareOpen ? null : (
        <span className="library-item-error" role="alert">
          {error}
        </span>
      )}
      <dialog
        aria-labelledby={`share-${itemKind}-${itemId}`}
        className="place-action-dialog"
        ref={dialogRef}
        onCancel={() => setIsShareOpen(false)}
        onClose={() => setIsShareOpen(false)}
      >
        <div className="place-action-dialog-card">
          <header>
            <div>
              <p className="field-kicker font-mono">Share {itemLabel}</p>
              <h2 className="font-serif" id={`share-${itemKind}-${itemId}`}>
                {itemName}
              </h2>
            </div>
            <button className="secondary" type="button" onClick={() => setIsShareOpen(false)}>
              Close
            </button>
          </header>
          {isLoadingShare ? <p className="muted">Loading share settings…</p> : null}
          {error == null ? null : (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice == null ? null : (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {!isLoadingShare && shareLink == null ? (
            <div className="stack">
              <p className="muted no-margin">
                Create a public read-only link. Signed-in visitors can copy this {itemLabel} into
                their own library.
              </p>
              <button disabled={isMutating} type="button" onClick={createShareLink}>
                {isMutating ? 'Creating…' : 'Create public link'}
              </button>
            </div>
          ) : null}
          {shareLink == null ? null : (
            <div className="stack">
              <label>
                Public URL
                <input readOnly value={toAbsolutePublicUrl(shareLink.publicUrl)} />
              </label>
              <p className="muted no-margin">
                Status: {shareLink.disabledAt == null ? 'Active' : 'Disabled'}
              </p>
              <div className="library-share-actions">
                <button className="secondary" type="button" onClick={copyShareUrl}>
                  Copy URL
                </button>
                <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
                  Open public page
                </a>
                <button
                  className={shareLink.disabledAt == null ? 'danger' : 'secondary'}
                  disabled={isMutating}
                  type="button"
                  onClick={() => setShareDisabled(shareLink.disabledAt == null)}
                >
                  {isMutating
                    ? 'Saving…'
                    : shareLink.disabledAt == null
                      ? 'Disable link'
                      : 'Re-enable link'}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
