'use client';

import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/radix-ui';
import { type ErrorKey, getErrorKey } from '@/i18n/errors';
import {
  type AndroidLoginAttempt,
  ApiError,
  type AuthenticatedApiRequest,
  approveAndroidLoginAttempt,
  type CreatedAndroidLoginAttempt,
  createAndroidLoginAttempt,
  denyAndroidLoginAttempt,
  getAndroidLoginAttempt,
} from '@/lib/api';
import {
  effectiveAndroidLoginStatus,
  secondsUntilAndroidLoginExpiry,
  shouldPollAndroidLogin,
} from './androidQrLoginState';

type DisplayedAttempt = CreatedAndroidLoginAttempt &
  Pick<AndroidLoginAttempt, 'device' | 'matchingCode' | 'status'>;

type AndroidQrLoginPanelProps = {
  apiRequest: AuthenticatedApiRequest;
  enabled: boolean | null;
  username: string;
};

export function AndroidQrLoginPanel({ apiRequest, enabled, username }: AndroidQrLoginPanelProps) {
  const t = useTranslations('AndroidLogin');
  const errorT = useTranslations('Errors');
  const format = useFormatter();
  const [attempt, setAttempt] = useState<DisplayedAttempt | null>(null);
  const [error, setError] = useState<{ key: ErrorKey; status: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [serverHost, setServerHost] = useState<string | null>(null);

  const status =
    attempt == null ? null : effectiveAndroidLoginStatus(attempt.status, attempt.expiresAt, now);
  const remainingSeconds =
    attempt == null ? 0 : secondsUntilAndroidLoginExpiry(attempt.expiresAt, now);

  useEffect(() => {
    setServerHost(window.location.host);
  }, []);

  useEffect(() => {
    if (attempt == null || status == null || !shouldPollAndroidLogin(status) || error != null) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const nextAttempt = await getAndroidLoginAttempt(
          apiRequest,
          attempt.attemptId,
          abortController.signal,
        );
        if (!cancelled) {
          setAttempt((current) =>
            current?.attemptId === nextAttempt.attemptId ? { ...current, ...nextAttempt } : current,
          );
        }
      } catch (nextError) {
        if (!cancelled && !abortController.signal.aborted) {
          setError({
            key: getErrorKey(nextError),
            status: nextError instanceof ApiError ? nextError.status : 0,
          });
        }
      }
    }, attempt.pollIntervalSeconds * 1_000);

    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [apiRequest, attempt, error, status]);

  useEffect(() => {
    if (attempt == null || status == null || !shouldPollAndroidLogin(status)) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [attempt, status]);

  async function startAttempt() {
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await createAndroidLoginAttempt(apiRequest);
      setNow(Date.now());
      setAttempt({
        ...created,
        device: null,
        matchingCode: null,
        status: 'pending',
      });
    } catch (nextError) {
      setError({
        key: getErrorKey(nextError),
        status: nextError instanceof ApiError ? nextError.status : 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function approveAttempt() {
    if (attempt == null) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const approved = await approveAndroidLoginAttempt(apiRequest, attempt.attemptId);
      setAttempt((current) => (current == null ? null : { ...current, ...approved }));
    } catch (nextError) {
      setError({
        key: getErrorKey(nextError),
        status: nextError instanceof ApiError ? nextError.status : 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelAttempt() {
    if (attempt == null) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const denied = await denyAndroidLoginAttempt(apiRequest, attempt.attemptId);
      setAttempt((current) => (current == null ? null : { ...current, ...denied }));
    } catch (nextError) {
      setError({
        key: getErrorKey(nextError),
        status: nextError instanceof ApiError ? nextError.status : 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const canStart = enabled === true && (attempt == null || isTerminal(status));

  return (
    <section
      className="panel account-security-panel account-security-android-login"
      aria-labelledby="android-login-heading"
    >
      <div className="account-security-section-header">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="android-login-heading">{t('title')}</h2>
        </div>
        {status == null ? null : <span className="chip">{t(`status.${status}`)}</span>}
      </div>

      {enabled == null ? <p className="muted">{t('checking')}</p> : null}
      {enabled === false ? <p className="muted">{t('unavailable')}</p> : null}
      {enabled === true && attempt == null ? <p className="muted">{t('help')}</p> : null}

      {attempt == null ? null : (
        <div className="android-qr-login-layout">
          <div className="android-qr-login-code">
            <Image
              alt={t('qrAlt')}
              height={240}
              priority
              src={attempt.qrCodeDataUrl}
              unoptimized
              width={240}
            />
            <p className="muted no-margin">
              {attemptTimingLabel(status, remainingSeconds, t, format)}
            </p>
          </div>
          <div className="android-qr-login-details" aria-live="polite">
            <p className="no-margin">
              <strong>{t('account')}</strong> {username}
            </p>
            <p className="no-margin">
              <strong>{t('server')}</strong> {serverHost ?? t('defaultServer')}
            </p>
            <AttemptStatus attempt={attempt} status={status ?? attempt.status} />
          </div>
        </div>
      )}

      {error == null ? null : (
        <div className="error android-qr-login-feedback" role="alert">
          {errorT(error.key, { status: error.status })}
        </div>
      )}

      <div className="account-security-actions android-qr-login-actions">
        {error != null && attempt != null && status != null && shouldPollAndroidLogin(status) ? (
          <Button className="secondary" type="button" onClick={() => setError(null)}>
            {t('retryStatus')}
          </Button>
        ) : null}
        {status === 'claimed' ? (
          <Button disabled={isSubmitting} type="button" onClick={() => void approveAttempt()}>
            {isSubmitting ? t('approving') : t('approve')}
          </Button>
        ) : null}
        {status != null && shouldPollAndroidLogin(status) ? (
          <Button
            className="danger secondary"
            disabled={isSubmitting}
            type="button"
            onClick={() => void cancelAttempt()}
          >
            {isSubmitting ? t('cancelling') : t('cancel')}
          </Button>
        ) : null}
        {canStart ? (
          <Button disabled={isSubmitting} type="button" onClick={() => void startAttempt()}>
            {isSubmitting ? t('creating') : attempt == null ? t('create') : t('createNew')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function AttemptStatus({
  attempt,
  status,
}: {
  attempt: DisplayedAttempt;
  status: AndroidLoginAttempt['status'];
}) {
  const t = useTranslations('AndroidLogin');
  if (status === 'pending') {
    return <p className="muted">{t('pending')}</p>;
  }
  if (status === 'claimed') {
    return (
      <>
        <p className="muted">
          {attempt.device?.appVersion == null
            ? t.rich('scanned', {
                device: attempt.device?.name ?? t('defaultDevice'),
                strong: (children) => <strong>{children}</strong>,
              })
            : t.rich('scannedWithVersion', {
                device: attempt.device?.name ?? t('defaultDevice'),
                version: attempt.device.appVersion,
                strong: (children) => <strong>{children}</strong>,
              })}
        </p>
        <p className="android-qr-login-matching-code">
          {t.rich('matchingCode', {
            code: attempt.matchingCode ?? '',
            strong: (children) => <strong>{children}</strong>,
          })}
        </p>
        <p className="muted no-margin">{t('confirm')}</p>
      </>
    );
  }
  if (status === 'approved') {
    return <p className="success">{t('approved')}</p>;
  }
  if (status === 'consumed') {
    return <p className="success">{t('consumed')}</p>;
  }
  if (status === 'denied') {
    return <p className="muted">{t('denied')}</p>;
  }
  return <p className="muted">{t('expired')}</p>;
}

function attemptTimingLabel(
  status: AndroidLoginAttempt['status'] | null,
  remainingSeconds: number,
  t: ReturnType<typeof useTranslations<'AndroidLogin'>>,
  format: ReturnType<typeof useFormatter>,
): string {
  if (status === 'consumed') return t('codeUsed');
  if (status === 'denied') return t('codeCancelled');
  if (status === 'expired') return t('codeExpired');
  return t('expires', {
    minutes: format.number(Math.floor(remainingSeconds / 60), { useGrouping: false }),
    seconds: format.number(remainingSeconds % 60, { minimumIntegerDigits: 2, useGrouping: false }),
  });
}

function isTerminal(status: AndroidLoginAttempt['status'] | null): boolean {
  return status === 'consumed' || status === 'denied' || status === 'expired';
}
