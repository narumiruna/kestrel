'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ShareLinkFeedback } from '@/components/dashboard/ShareLinkFeedback';
import { useShareLink } from '@/components/dashboard/useShareLink';
import { toAbsolutePublicUrl } from '@/components/dashboard/utils';
import { Button, TextInput } from '@/components/ui/radix-ui';
import type { Route } from '@/lib/api';

export function RouteSharePanel({ route }: { route: Route | null }) {
  const t = useTranslations('routeShare');
  const {
    createShareLink,
    error,
    readState,
    canMutate,
    isMutating,
    loadShareLink,
    setDisabled,
    shareLink,
  } = useShareLink('routes', route?.id ?? null);
  const [notice, setNotice] = useState<'copied' | 'copyFailed' | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload for refreshed saved objects, even when their ID is unchanged.
  useEffect(() => {
    setNotice(null);
    void loadShareLink();
  }, [loadShareLink, route]);

  async function copyPublicUrl() {
    if (shareLink == null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(toAbsolutePublicUrl(shareLink.publicUrl));
      setNotice('copied');
    } catch {
      setNotice('copyFailed');
    }
  }

  if (route == null) {
    return <p className="muted no-margin">{t('saveFirst')}</p>;
  }

  return (
    <section className="stack">
      <div className="route-share-header">
        <h3>{t('title')}</h3>
      </div>
      <p className="muted no-margin">{t('help')}</p>
      <ShareLinkFeedback
        readState={readState}
        error={error}
        createLabel={t('create')}
        onRetry={() => void loadShareLink()}
      />
      {readState === 'ready' ? (
        <>
          <p className="muted no-margin" role="status">
            {t('status', {
              state:
                shareLink == null
                  ? 'missing'
                  : shareLink.disabledAt == null
                    ? 'active'
                    : 'disabled',
            })}
          </p>
          {notice == null ? null : (
            <div className="success" role="status">
              {t(notice)}
            </div>
          )}
          {shareLink == null ? (
            <div className="row">
              <Button
                disabled={!canMutate}
                type="button"
                onClick={() => {
                  setNotice(null);
                  void createShareLink();
                }}
              >
                {isMutating ? t('creating') : t('create')}
              </Button>
            </div>
          ) : (
            <div className="stack">
              <label htmlFor="radix-field-components-dashboard-routesharepanel-tsx-1">
                {t('publicUrl')}
                <TextInput
                  id="radix-field-components-dashboard-routesharepanel-tsx-1"
                  readOnly
                  value={toAbsolutePublicUrl(shareLink.publicUrl)}
                />
              </label>
              <div className="chip-row">
                {shareLink.disabledAt == null ? (
                  <span className="chip">{t('active')}</span>
                ) : (
                  <span className="chip">{t('disabled')}</span>
                )}
                <span className="chip">{t('latest')}</span>
              </div>
              <div className="row">
                <Button
                  className="action-state-soft"
                  highContrast
                  variant="soft"
                  type="button"
                  onClick={() => void copyPublicUrl()}
                >
                  {t('copy')}
                </Button>
                <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
                  {t('open')}
                </a>
                <Button
                  className="action-state-soft"
                  highContrast
                  variant="soft"
                  color={shareLink.disabledAt == null ? 'red' : undefined}
                  disabled={!canMutate}
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    void setDisabled(shareLink.disabledAt == null);
                  }}
                >
                  {isMutating
                    ? t('saving')
                    : shareLink.disabledAt == null
                      ? t('disable')
                      : t('enable')}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
