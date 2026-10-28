'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Cross2Icon, ReloadIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/radix-ui';
import type { ShareLinkReadState } from './shareLinkState';

export function ShareLinkFeedback({
  readState,
  error,
  createLabel,
  onRetry,
}: {
  readState: ShareLinkReadState;
  error: string | null;
  createLabel: string;
  onRetry: () => void;
}) {
  const t = useTranslations('ShareState');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const restoreRetryFocusRef = useRef(false);
  const checking = readState === 'idle' || readState === 'loading';
  useEffect(() => {
    if (checking || !restoreRetryFocusRef.current) return;
    restoreRetryFocusRef.current = false;
    const root = rootRef.current;
    const target =
      readState === 'error'
        ? root?.querySelector<HTMLElement>('button')
        : root?.parentElement?.querySelector<HTMLElement>('input, button:not(:disabled), a[href]');
    if (target?.isConnected) target.focus();
  }, [checking, readState]);

  return (
    <div ref={rootRef} hidden={readState === 'ready'} aria-busy={checking} className="stack">
      {checking ? (
        <>
          <p className="row muted no-margin" role="status">
            <ReloadIcon /> {t('checking')}
          </p>
          <div>
            <Button disabled type="button">
              {createLabel}
            </Button>
          </div>
        </>
      ) : readState === 'error' ? (
        <>
          <div className="error stack" role="alert">
            <strong className="row">
              <Cross2Icon /> {t('readError')}
            </strong>
            {error == null ? null : <span>{error}</span>}
          </div>
          <div>
            <Button
              type="button"
              onClick={() => {
                restoreRetryFocusRef.current =
                  rootRef.current?.contains(document.activeElement) ?? false;
                onRetry();
              }}
            >
              <ReloadIcon /> {t('retry')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
