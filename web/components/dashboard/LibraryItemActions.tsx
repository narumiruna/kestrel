'use client';

import { IconButton } from '@radix-ui/themes';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useShareLink } from '@/components/dashboard/useShareLink';
import { formatError, toAbsolutePublicUrl } from '@/components/dashboard/utils';
import { DotsHorizontalIcon, Share2Icon, TrashIcon } from '@/components/ui/icons';
import {
  Button,
  ConfirmDialog,
  DialogFrame,
  Menu,
  MenuSurface,
  TextInput,
} from '@/components/ui/radix-ui';
import type { ShareLink } from '@/lib/api';

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
  const {
    createShareLink,
    error,
    isLoading: isLoadingShare,
    isMutating,
    loadShareLink,
    setDisabled,
    setError,
    setIsMutating,
    setShareLink,
    shareLink,
  } = useShareLink(itemKind, itemId);
  const [notice, setNotice] = useState<string | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isShareOpen) {
      return;
    }

    setNotice(null);
    setShareLink(null);
    void loadShareLink();
  }, [isShareOpen, loadShareLink, setShareLink]);

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

  const itemLabel = itemKind === 'places' ? 'place' : 'route';

  return (
    <div className="library-item-actions">
      <DialogFrame
        className="place-action-dialog-card"
        description={`Manage public read-only access to this ${itemLabel}.`}
        eyebrow={`Share ${itemLabel}`}
        open={isShareOpen}
        title={itemName}
        trigger={
          <Button aria-label={`Share ${itemName}`} className="secondary" type="button">
            <Share2Icon aria-hidden /> Share
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
          onCreateShareLink={() => {
            setNotice(null);
            void createShareLink();
          }}
          onSetShareDisabled={(disabled) => {
            setNotice(null);
            void setDisabled(disabled);
          }}
        />
      </DialogFrame>
      <MenuSurface
        className="library-more-menu-content"
        trigger={
          <IconButton
            ref={moreButtonRef}
            aria-label={`More actions for ${itemName}`}
            className="secondary library-more-menu-trigger"
            type="button"
            variant="ghost"
          >
            <DotsHorizontalIcon aria-hidden />
          </IconButton>
        }
      >
        <Menu.Item
          className="ui-menu-item danger"
          disabled={isMutating}
          onSelect={() => setIsDeleteOpen(true)}
        >
          <TrashIcon aria-hidden /> Delete {itemLabel}…
        </Menu.Item>
      </MenuSurface>
      <ConfirmDialog
        confirmLabel={`Delete ${itemLabel}`}
        description="This cannot be undone. The item and its share link will be permanently removed."
        isConfirming={isMutating}
        open={isDeleteOpen}
        restoreFocusElement={moreButtonRef.current}
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
  const shareUrlId = useId();

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
          <label htmlFor={shareUrlId}>
            Public URL
            <TextInput id={shareUrlId} readOnly value={toAbsolutePublicUrl(shareLink.publicUrl)} />
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
