'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { formatError, toAbsolutePublicUrl } from '@/components/dashboard/utils';
import {
  Button,
  ConfirmDialog,
  DialogFrame,
  Menu,
  MenuSurface,
  TextInput,
} from '@/components/ui/radix-ui';
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
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!isShareOpen) {
      return;
    }

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
      <DialogFrame
        className="place-action-dialog-card"
        eyebrow={`Share ${itemLabel}`}
        open={isShareOpen}
        title={itemName}
        trigger={
          <Button className="secondary" type="button">
            Share
          </Button>
        }
        onOpenChange={setIsShareOpen}
      >
        <ShareDialogContent
          error={error}
          isLoadingShare={isLoadingShare}
          isMutating={isMutating}
          itemLabel={itemLabel}
          notice={notice}
          shareLink={shareLink}
          onCopyShareUrl={copyShareUrl}
          onCreateShareLink={createShareLink}
          onSetShareDisabled={setShareDisabled}
        />
      </DialogFrame>
      <MenuSurface
        className="library-more-menu-content"
        trigger={
          <Button className="secondary library-more-menu-trigger" type="button">
            More <span aria-hidden>⌄</span>
          </Button>
        }
      >
        <Menu.Item
          className="ui-menu-item danger"
          disabled={isMutating}
          onClick={() => setIsDeleteOpen(true)}
        >
          Delete {itemLabel}…
        </Menu.Item>
      </MenuSurface>
      <ConfirmDialog
        confirmLabel={`Delete ${itemLabel}`}
        description="This cannot be undone. The item and its share link will be permanently removed."
        isConfirming={isMutating}
        open={isDeleteOpen}
        title={`Delete “${itemName}”?`}
        onConfirm={deleteItem}
        onOpenChange={setIsDeleteOpen}
      />
      {error == null || isShareOpen ? null : (
        <span className="library-item-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function ShareDialogContent({
  error,
  isLoadingShare,
  isMutating,
  itemLabel,
  notice,
  onCopyShareUrl,
  onCreateShareLink,
  onSetShareDisabled,
  shareLink,
}: {
  error: string | null;
  isLoadingShare: boolean;
  isMutating: boolean;
  itemLabel: string;
  notice: string | null;
  onCopyShareUrl: () => void;
  onCreateShareLink: () => void;
  onSetShareDisabled: (disabled: boolean) => void;
  shareLink: ShareLink | null;
}) {
  return (
    <>
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
            Create a public read-only link. Signed-in visitors can copy this {itemLabel} into their
            own library.
          </p>
          <Button disabled={isMutating} type="button" onClick={onCreateShareLink}>
            {isMutating ? 'Creating…' : 'Create public link'}
          </Button>
        </div>
      ) : null}
      {shareLink == null ? null : (
        <div className="stack">
          <label htmlFor="radix-field-components-dashboard-libraryitemactions-tsx-1">
            Public URL
            <TextInput
              id="radix-field-components-dashboard-libraryitemactions-tsx-1"
              readOnly
              value={toAbsolutePublicUrl(shareLink.publicUrl)}
            />
          </label>
          <p className="muted no-margin">
            Status: {shareLink.disabledAt == null ? 'Active' : 'Disabled'}
          </p>
          <div className="library-share-actions">
            <Button className="secondary" type="button" onClick={onCopyShareUrl}>
              Copy URL
            </Button>
            <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
              Open public page
            </a>
            <Button
              className={shareLink.disabledAt == null ? 'danger' : 'secondary'}
              disabled={isMutating}
              type="button"
              onClick={() => onSetShareDisabled(shareLink.disabledAt == null)}
            >
              {isMutating
                ? 'Saving…'
                : shareLink.disabledAt == null
                  ? 'Disable link'
                  : 'Re-enable link'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
