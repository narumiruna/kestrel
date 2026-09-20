'use client';

import { useEffect } from 'react';
import { useShareLink } from '@/components/dashboard/useShareLink';
import { toAbsolutePublicUrl } from '@/components/dashboard/utils';
import { Button, TextInput } from '@/components/ui/radix-ui';
import type { Route } from '@/lib/api';

export function RouteSharePanel({ route }: { route: Route | null }) {
  const {
    shareLink,
    error,
    notice,
    isLoading,
    isMutating,
    loadShareLink,
    createShareLink,
    setDisabled,
    copyPublicUrl,
  } = useShareLink('routes', route?.id ?? null);

  useEffect(() => {
    void route; // Reload when the saved snapshot changes, not just its ID.
    void loadShareLink();
  }, [loadShareLink, route]);

  if (route == null) {
    return (
      <p className="muted no-margin">Save this route before creating a public latest-route link.</p>
    );
  }

  return (
    <section className="stack">
      <div className="route-share-header">
        <h3>Share link</h3>
        {isLoading ? <span className="muted">Loading…</span> : null}
      </div>
      <p className="muted no-margin">
        Visitors can open the public page without login. Signed-in users can copy the visible route
        snapshot into their own library.
      </p>
      <p className="muted no-margin">
        Public link:{' '}
        {shareLink == null ? 'Not created' : shareLink.disabledAt == null ? 'Active' : 'Disabled'}
      </p>
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
      {shareLink == null ? (
        <div className="row">
          <Button disabled={isMutating} type="button" onClick={() => void createShareLink()}>
            {isMutating ? 'Creating…' : 'Create public link'}
          </Button>
        </div>
      ) : (
        <div className="stack">
          <label htmlFor="radix-field-components-dashboard-routesharepanel-tsx-1">
            Public URL
            <TextInput
              id="radix-field-components-dashboard-routesharepanel-tsx-1"
              readOnly
              value={toAbsolutePublicUrl(shareLink.publicUrl)}
            />
          </label>
          <div className="chip-row">
            {shareLink.disabledAt == null ? (
              <span className="chip">active</span>
            ) : (
              <span className="chip">disabled</span>
            )}
            <span className="chip">latest route</span>
          </div>
          <div className="row">
            <Button className="secondary" type="button" onClick={() => void copyPublicUrl()}>
              Copy URL
            </Button>
            <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
              Open public page
            </a>
            <Button
              className={shareLink.disabledAt == null ? 'danger' : 'secondary'}
              disabled={isMutating}
              type="button"
              onClick={() => void setDisabled(shareLink.disabledAt == null)}
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
    </section>
  );
}
