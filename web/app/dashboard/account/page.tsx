'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { UserMark } from '@/components/cartographer/UserMark';
import {
  clearOidcLinkState,
  createOidcLinkNonce,
  saveOidcLinkAttempt,
} from '@/components/dashboard/oidcLinkState';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import { formatError } from '@/components/dashboard/utils';
import { Button, ConfirmDialog, DialogFrame, TextInput } from '@/components/ui/radix-ui';
import type {
  AuthSessionSummary,
  AuthSessionsResponse,
  ChangePasswordInput,
  OidcLinkStatus,
  RemoteDevice,
  RemoteDevicesResponse,
} from '@/lib/api';

type PendingAction =
  | { id: string; kind: 'device'; label: string }
  | { id: string; kind: 'session'; label: string }
  | { kind: 'others'; label: string };

const UNAVAILABLE_OIDC_LINK_STATUS: OidcLinkStatus = {
  displayName: 'OpenID Connect',
  enabled: false,
  linked: false,
};

export default function AccountSecurityPage() {
  const auth = useDashboardAuth();
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [oidcLinkStatus, setOidcLinkStatus] = useState<OidcLinkStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  const [isOidcLinkOpen, setIsOidcLinkOpen] = useState(false);
  const [oidcCurrentPassword, setOidcCurrentPassword] = useState('');

  const loadSecurityData = useCallback(async () => {
    if (!auth.isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const linkStatusRequest = auth
        .apiRequest<OidcLinkStatus>('/auth/oidc/link')
        .catch(() => null);
      const [sessionResponse, deviceResponse, linkStatus] = await Promise.all([
        auth.apiRequest<AuthSessionsResponse>('/auth/sessions'),
        auth.apiRequest<RemoteDevicesResponse>('/devices'),
        linkStatusRequest,
      ]);
      setSessions(sessionResponse.sessions);
      setDevices(deviceResponse.devices);
      setOidcLinkStatus(linkStatus ?? UNAVAILABLE_OIDC_LINK_STATUS);
    } catch (nextError) {
      setOidcLinkStatus((currentStatus) => currentStatus ?? UNAVAILABLE_OIDC_LINK_STATUS);
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

  useEffect(() => {
    if (!auth.isHydrated) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get('oidc') === 'linked') {
      setNotice('OIDC sign-in is now linked to this account.');
      url.searchParams.delete('oidc');
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }, [auth.isHydrated]);

  async function changePassword(input: ChangePasswordInput) {
    await auth.apiRequest('/auth/password/change', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async function revokeCurrentSession() {
    await auth.logout();
  }

  async function submitOidcLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    const clientNonce = createOidcLinkNonce();
    try {
      if (!saveOidcLinkAttempt(clientNonce)) {
        throw new Error(
          'Session storage is unavailable. Enable it before linking a sign-in method.',
        );
      }
      const { authorizationUrl } = await auth.apiRequest<{ authorizationUrl: string }>(
        '/auth/oidc/link/start',
        {
          body: JSON.stringify({ clientNonce, currentPassword: oidcCurrentPassword }),
          method: 'POST',
        },
      );
      window.location.assign(authorizationUrl);
    } catch (nextError) {
      clearOidcLinkState();
      setError(formatError(nextError));
      setIsSubmitting(false);
    }
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
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 5);
  const hiddenSessionCount = sessions.length - visibleSessions.length;

  return (
    <main className="account-security-shell">
      <header className="account-security-header">
        <div>
          <Link className="account-security-back" href="/dashboard/map">
            ← Back to dashboard
          </Link>
          <p className="eyebrow">Account</p>
          <h1>Account security</h1>
          <p className="muted no-margin">
            Manage sign-in methods, active sessions, and remote-control devices.
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
        <section
          className="panel account-security-panel account-security-sign-in"
          aria-labelledby="sign-in-heading"
        >
          <div className="account-security-section-header">
            <div>
              <p className="eyebrow">Authentication</p>
              <h2 id="sign-in-heading">Sign-in methods</h2>
            </div>
            {oidcLinkStatus?.linked ? (
              <span className="chip remote-chip-online">linked</span>
            ) : null}
          </div>
          {isLoading || oidcLinkStatus == null ? (
            <p className="muted">Loading sign-in methods…</p>
          ) : !oidcLinkStatus.enabled ? (
            <p className="muted">OIDC account linking is unavailable on this server.</p>
          ) : oidcLinkStatus.linked ? (
            <p className="muted">
              {oidcLinkStatus.displayName} is linked. You can use it to sign in to this Kestrel
              account.
            </p>
          ) : (
            <>
              <p className="muted">
                Link {oidcLinkStatus.displayName} to this existing Kestrel account. You will confirm
                your current password before continuing to the provider.
              </p>
              <div className="account-security-actions">
                <Button
                  className="secondary"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => setIsOidcLinkOpen(true)}
                >
                  Link {oidcLinkStatus.displayName}
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="panel account-security-panel" aria-labelledby="sessions-heading">
          <div className="account-security-section-header">
            <div>
              <p className="eyebrow">Authentication</p>
              <h2 id="sessions-heading">Active sessions</h2>
            </div>
            <Button
              className="secondary"
              disabled={isLoading || otherSessionCount === 0 || isSubmitting}
              type="button"
              onClick={() => setPendingAction({ kind: 'others', label: 'Other sessions' })}
            >
              Revoke all others
            </Button>
          </div>
          {isLoading ? <p className="muted">Loading sessions…</p> : null}
          {!isLoading && sessions.length === 0 ? (
            <p className="muted">No active sessions were returned.</p>
          ) : null}
          <div className="account-security-list">
            {visibleSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                disabled={isSubmitting}
                onRevoke={() => {
                  if (session.isCurrent) {
                    setIsSignOutOpen(true);
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
          {sessions.length > 5 ? (
            <Button
              className="secondary account-security-show-more"
              type="button"
              onClick={() => setShowAllSessions((current) => !current)}
            >
              {showAllSessions ? 'Show fewer sessions' : `Show ${hiddenSessionCount} more sessions`}
            </Button>
          ) : null}
        </section>

        <section className="panel account-security-panel" aria-labelledby="devices-heading">
          <div className="account-security-section-header">
            <div>
              <p className="eyebrow">Remote control</p>
              <h2 id="devices-heading">Android devices</h2>
            </div>
            <Button
              className="secondary"
              disabled={isLoading}
              type="button"
              onClick={() => void loadSecurityData()}
            >
              Refresh
            </Button>
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

      <DialogFrame
        description={`Enter your current Kestrel password, then authenticate with ${oidcLinkStatus?.displayName ?? 'the OIDC provider'}.`}
        eyebrow="Add sign-in method"
        open={isOidcLinkOpen}
        title={`Link ${oidcLinkStatus?.displayName ?? 'OIDC'}`}
        onOpenChange={(open) => {
          if (!isSubmitting) {
            setIsOidcLinkOpen(open);
            if (!open) {
              setOidcCurrentPassword('');
            }
          }
        }}
      >
        <form className="account-security-confirm-form" onSubmit={submitOidcLink}>
          <label htmlFor="radix-field-app-dashboard-account-page-tsx-oidc-password">
            Current Kestrel password
            <TextInput
              id="radix-field-app-dashboard-account-page-tsx-oidc-password"
              autoComplete="current-password"
              required
              type="password"
              value={oidcCurrentPassword}
              onChange={(event) => setOidcCurrentPassword(event.target.value)}
            />
          </label>
          <div className="account-security-actions">
            <Button
              className="secondary"
              disabled={isSubmitting}
              type="button"
              onClick={() => {
                setIsOidcLinkOpen(false);
                setOidcCurrentPassword('');
              }}
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Continuing…' : 'Continue to provider'}
            </Button>
          </div>
        </form>
      </DialogFrame>

      <ConfirmDialog
        confirmLabel="Sign out"
        description="This browser session will end immediately. You will need to sign in again."
        open={isSignOutOpen}
        title="Sign out this session?"
        onConfirm={revokeCurrentSession}
        onOpenChange={setIsSignOutOpen}
      />

      <DialogFrame
        description="Enter your current password. Existing credentials are accepted even if they predate the current password-length policy."
        eyebrow="Confirm sensitive action"
        open={pendingAction != null}
        title={`Revoke ${pendingAction?.label ?? 'access'}`}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPendingAction(null);
            setCurrentPassword('');
          }
        }}
      >
        <form className="account-security-confirm-form" onSubmit={submitSensitiveAction}>
          <label htmlFor="radix-field-app-dashboard-account-page-tsx-1">
            Current password
            <TextInput
              id="radix-field-app-dashboard-account-page-tsx-1"
              autoComplete="current-password"
              required
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <div className="account-security-actions">
            <Button
              className="secondary"
              disabled={isSubmitting}
              type="button"
              onClick={() => {
                setPendingAction(null);
                setCurrentPassword('');
              }}
            >
              Cancel
            </Button>
            <Button className="danger" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Revoking…' : 'Revoke access'}
            </Button>
          </div>
        </form>
      </DialogFrame>
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
      <Button className="danger secondary" disabled={disabled} type="button" onClick={onRevoke}>
        {session.isCurrent ? 'Sign out' : 'Revoke'}
      </Button>
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
      <Button
        className="danger secondary"
        disabled={disabled || device.revokedAt != null}
        type="button"
        onClick={onRevoke}
      >
        {device.revokedAt == null ? 'Revoke' : 'Revoked'}
      </Button>
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
