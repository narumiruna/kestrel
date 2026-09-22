'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { formatError } from '@/components/dashboard/utils';
import { Button } from '@/components/ui/radix-ui';
import {
  type AndroidLoginAttempt,
  type AuthenticatedApiRequest,
  approveAndroidLoginAttempt,
  type CreatedAndroidLoginAttempt,
  createAndroidLoginAttempt,
  denyAndroidLoginAttempt,
  getAndroidLoginAttempt,
} from '@/lib/api';
import {
  effectiveAndroidLoginStatus,
  formatAndroidLoginTimeRemaining,
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
  const [attempt, setAttempt] = useState<DisplayedAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [serverHost, setServerHost] = useState('this Kestrel server');

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
          setError(formatError(nextError));
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
      setError(formatError(nextError));
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
      setError(formatError(nextError));
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
      setError(formatError(nextError));
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
          <p className="eyebrow">Android sign-in</p>
          <h2 id="android-login-heading">Sign in with a QR code</h2>
        </div>
        {status == null ? null : <span className="chip">{status}</span>}
      </div>

      {enabled == null ? <p className="muted">Checking QR login availability…</p> : null}
      {enabled === false ? (
        <p className="muted">
          QR login is unavailable on this server. Existing Android sign-in methods still work.
        </p>
      ) : null}
      {enabled === true && attempt == null ? (
        <p className="muted">
          Create a five-minute code, then scan it from the signed-out Kestrel Android app. Review
          the account and matching code here before approving.
        </p>
      ) : null}

      {attempt == null ? null : (
        <div className="android-qr-login-layout">
          <div className="android-qr-login-code">
            <Image
              alt="QR code for signing in to Kestrel on Android"
              height={240}
              priority
              src={attempt.qrCodeDataUrl}
              unoptimized
              width={240}
            />
            <p className="muted no-margin">{attemptTimingLabel(status, remainingSeconds)}</p>
          </div>
          <div className="android-qr-login-details" aria-live="polite">
            <p className="no-margin">
              <strong>Account:</strong> {username}
            </p>
            <p className="no-margin">
              <strong>Server:</strong> {serverHost}
            </p>
            <AttemptStatus attempt={attempt} status={status ?? attempt.status} />
          </div>
        </div>
      )}

      {error == null ? null : (
        <div className="error android-qr-login-feedback" role="alert">
          {error}
        </div>
      )}

      <div className="account-security-actions android-qr-login-actions">
        {error != null && attempt != null && status != null && shouldPollAndroidLogin(status) ? (
          <Button className="secondary" type="button" onClick={() => setError(null)}>
            Retry status check
          </Button>
        ) : null}
        {status === 'claimed' ? (
          <Button disabled={isSubmitting} type="button" onClick={() => void approveAttempt()}>
            {isSubmitting ? 'Approving…' : 'Approve Android sign-in'}
          </Button>
        ) : null}
        {status != null && shouldPollAndroidLogin(status) ? (
          <Button
            className="danger secondary"
            disabled={isSubmitting}
            type="button"
            onClick={() => void cancelAttempt()}
          >
            {isSubmitting ? 'Cancelling…' : 'Cancel code'}
          </Button>
        ) : null}
        {canStart ? (
          <Button disabled={isSubmitting} type="button" onClick={() => void startAttempt()}>
            {isSubmitting
              ? 'Creating…'
              : attempt == null
                ? 'Create Android login code'
                : 'Create a new code'}
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
  if (status === 'pending') {
    return <p className="muted">Waiting for the Android app to scan this code.</p>;
  }
  if (status === 'claimed') {
    return (
      <>
        <p className="muted">
          Scanned by <strong>{attempt.device?.name ?? 'Android device'}</strong>
          {attempt.device?.appVersion == null ? '' : ` · Kestrel ${attempt.device.appVersion}`}.
        </p>
        <p className="android-qr-login-matching-code">
          Matching code <strong>{attempt.matchingCode}</strong>
        </p>
        <p className="muted no-margin">
          Confirm that this code, account, and server match the Android screen before approving.
        </p>
      </>
    );
  }
  if (status === 'approved') {
    return <p className="success">Approved. Waiting for Android to finish signing in.</p>;
  }
  if (status === 'consumed') {
    return (
      <p className="success">Android sign-in completed. The new session is now independent.</p>
    );
  }
  if (status === 'denied') {
    return <p className="muted">This Android sign-in was cancelled or denied.</p>;
  }
  return <p className="muted">This code expired. Create a new code to try again.</p>;
}

function attemptTimingLabel(
  status: AndroidLoginAttempt['status'] | null,
  remainingSeconds: number,
): string {
  if (status === 'consumed') return 'Code used';
  if (status === 'denied') return 'Code cancelled';
  if (status === 'expired') return 'Code expired';
  return `Expires in ${formatAndroidLoginTimeRemaining(remainingSeconds)}`;
}

function isTerminal(status: AndroidLoginAttempt['status'] | null): boolean {
  return status === 'consumed' || status === 'denied' || status === 'expired';
}
