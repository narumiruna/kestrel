'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { UserMark } from '@/components/cartographer/UserMark';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import { formatError } from '@/components/dashboard/utils';
import type {
  AuthSessionSummary,
  AuthSessionsResponse,
  ChangePasswordInput,
  RemoteDevice,
  RemoteDevicesResponse,
} from '@/lib/api';

type PendingAction =
  | { id: string; kind: 'device'; label: string }
  | { id: string; kind: 'session'; label: string }
  | { kind: 'others'; label: string };

export default function AccountSecurityPage() {
  const auth = useDashboardAuth();
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSecurityData = useCallback(async () => {
    if (!auth.isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const sessionResponse = await auth.apiRequest<AuthSessionsResponse>('/auth/sessions');
      const deviceResponse = await auth.apiRequest<RemoteDevicesResponse>('/devices');
      setSessions(sessionResponse.sessions);
      setDevices(deviceResponse.devices);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (auth.isHydrated && auth.isAuthenticated) {
      void loadSecurityData();
    }
  }, [auth.isAuthenticated, auth.isHydrated, loadSecurityData]);

  async function changePassword(input: ChangePasswordInput) {
    await auth.apiRequest('/auth/password/change', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async function revokeCurrentSession() {
    if (!window.confirm('Sign out this session now?')) {
      return;
    }
    await auth.logout();
  }

  async function submitSensitiveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingAction == null) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const body = JSON.stringify({ currentPassword });
      if (pendingAction.kind === 'session') {
        await auth.apiRequest(`/auth/sessions/${pendingAction.id}/revoke`, {
          body,
          method: 'POST',
        });
      } else if (pendingAction.kind === 'device') {
        await auth.apiRequest(`/devices/${pendingAction.id}/revoke`, {
          body,
          method: 'POST',
        });
      } else {
        await auth.apiRequest('/auth/sessions/revoke-others', {
          body,
          method: 'POST',
        });
      }
      setNotice(`${pendingAction.label} revoked.`);
      setPendingAction(null);
      setCurrentPassword('');
      await loadSecurityData();
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="account-security-shell">
        <p className="muted">Loading account security…</p>
      </main>
    );
  }

  const otherSessionCount = sessions.filter((session) => !session.isCurrent).length;

  return (
    <main className="account-security-shell">
      <header className="account-security-header">
        <div>
          <Link className="account-security-back" href="/dashboard/map">
            ← Back to dashboard
          </Link>
          <p className="eyebrow">Account</p>
          <h1>Sessions &amp; devices</h1>
          <p className="muted no-margin">
            Review where Kestrel is signed in and revoke access you no longer recognize.
          </p>
        </div>
        <UserMark
          username={auth.session.user.username}
          onChangePassword={changePassword}
          onLogout={auth.logout}
        />
      </header>

      {error == null ? null : (
        <div className="error account-security-feedback" role="alert">
          {error}
        </div>
      )}
      {notice == null ? null : (
        <div className="success account-security-feedback" role="status">
          {notice}
        </div>
      )}

      <div className="account-security-grid">
        <section className="panel account-security-panel" aria-labelledby="sessions-heading">
          <div className="account-security-section-header">
            <div>
              <p className="eyebrow">Authentication</p>
              <h2 id="sessions-heading">Active sessions</h2>
            </div>
            <button
              className="secondary"
              disabled={isLoading || otherSessionCount === 0 || isSubmitting}
              type="button"
              onClick={() => setPendingAction({ kind: 'others', label: 'Other sessions' })}
            >
              Revoke all others
            </button>
          </div>
          {isLoading ? <p className="muted">Loading sessions…</p> : null}
          {!isLoading && sessions.length === 0 ? (
            <p className="muted">No active sessions were returned.</p>
          ) : null}
          <div className="account-security-list">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                disabled={isSubmitting}
                onRevoke={() => {
                  if (session.isCurrent) {
                    void revokeCurrentSession();
                  } else {
                    setPendingAction({
                      id: session.id,
                      kind: 'session',
                      label: describeSession(session),
                    });
                  }
                }}
              />
            ))}
          </div>
        </section>

        <section className="panel account-security-panel" aria-labelledby="devices-heading">
          <div className="account-security-section-header">
            <div>
              <p className="eyebrow">Remote control</p>
              <h2 id="devices-heading">Android devices</h2>
            </div>
            <button
              className="secondary"
              disabled={isLoading}
              type="button"
              onClick={() => void loadSecurityData()}
            >
              Refresh
            </button>
          </div>
          <p className="muted">
            Revoking a device also revokes the Android session that last registered it. A command
            already delivered to Android may still finish.
          </p>
          {isLoading ? <p className="muted">Loading devices…</p> : null}
          {!isLoading && devices.length === 0 ? (
            <p className="muted">
              No Android devices registered. Enable web remote control in Kestrel Options to add
              one.
            </p>
          ) : null}
          <div className="account-security-list">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                disabled={isSubmitting}
                onRevoke={() =>
                  setPendingAction({ id: device.id, kind: 'device', label: device.name })
                }
              />
            ))}
          </div>
        </section>
      </div>

      {pendingAction == null ? null : (
        <section className="panel account-security-confirm" aria-labelledby="confirm-heading">
          <div>
            <p className="eyebrow">Confirm sensitive action</p>
            <h2 id="confirm-heading">Revoke {pendingAction.label}</h2>
            <p className="muted">
              Enter your current password. Existing credentials are accepted even if they predate
              the current password-length policy.
            </p>
          </div>
          <form className="account-security-confirm-form" onSubmit={submitSensitiveAction}>
            <label>
              Current password
              <input
                autoComplete="current-password"
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <div className="account-security-actions">
              <button
                className="secondary"
                disabled={isSubmitting}
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setCurrentPassword('');
                }}
              >
                Cancel
              </button>
              <button className="danger" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Revoking…' : 'Revoke access'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function SessionRow({
  disabled,
  onRevoke,
  session,
}: {
  disabled: boolean;
  onRevoke: () => void;
  session: AuthSessionSummary;
}) {
  return (
    <article className="account-security-row">
      <div>
        <div className="account-security-row-title">
          <strong>{describeSession(session)}</strong>
          {session.isCurrent ? <span className="chip remote-chip-online">current</span> : null}
        </div>
        <p className="muted no-margin">{session.userAgent ?? 'Unknown client'}</p>
        <p className="muted no-margin">
          Last used {formatDate(session.lastUsedAt)} · Expires {formatDate(session.expiresAt)}
          {session.ipAddress == null ? '' : ` · ${session.ipAddress}`}
        </p>
      </div>
      <button className="danger secondary" disabled={disabled} type="button" onClick={onRevoke}>
        {session.isCurrent ? 'Sign out' : 'Revoke'}
      </button>
    </article>
  );
}

function DeviceRow({
  device,
  disabled,
  onRevoke,
}: {
  device: RemoteDevice;
  disabled: boolean;
  onRevoke: () => void;
}) {
  const isOnline = device.revokedAt == null && device.online;
  const status = device.revokedAt != null ? 'revoked' : isOnline ? 'online' : 'offline';
  const playback = device.state?.playbackState.toLowerCase() ?? 'not reported';

  return (
    <article className="account-security-row">
      <div>
        <div className="account-security-row-title">
          <strong>{device.name}</strong>
          <span className={`chip ${isOnline ? 'remote-chip-online' : 'remote-chip-offline'}`}>
            {status}
          </span>
        </div>
        <p className="muted no-margin">
          Playback: {playback} · Remote {device.remoteControlEnabled ? 'enabled' : 'disabled'}
        </p>
        <p className="muted no-margin">
          Last seen {formatDate(device.lastSeenAt)}
          {device.appVersion == null ? '' : ` · Kestrel ${device.appVersion}`}
        </p>
      </div>
      <button
        className="danger secondary"
        disabled={disabled || device.revokedAt != null}
        type="button"
        onClick={onRevoke}
      >
        {device.revokedAt == null ? 'Revoke' : 'Revoked'}
      </button>
    </article>
  );
}

function describeSession(session: AuthSessionSummary): string {
  if (session.isCurrent) {
    return 'This browser';
  }

  if (session.userAgent?.toLowerCase().includes('android')) {
    return 'Android session';
  }

  return 'Web session';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
