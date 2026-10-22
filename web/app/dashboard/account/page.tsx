'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AiAssistantSettings } from '@/components/dashboard/AiAssistantSettings';
import { AndroidQrLoginPanel } from '@/components/dashboard/AndroidQrLoginPanel';
import { ChangePasswordForm } from '@/components/dashboard/ChangePasswordForm';
import {
  clearOidcLinkState,
  createOidcLinkNonce,
  saveOidcLinkAttempt,
} from '@/components/dashboard/oidcLinkState';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import { ArrowLeftIcon, GearIcon, LockClosedIcon } from '@/components/ui/icons';
import { Button, ConfirmDialog, DialogFrame, TextInput } from '@/components/ui/radix-ui';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { errorMessage } from '@/i18n/errors';
import type {
  AuthMethods,
  AuthSessionSummary,
  AuthSessionsResponse,
  ChangePasswordInput,
  OidcLinkStatus,
  RemoteDevice,
  RemoteDevicesResponse,
} from '@/lib/api';
import { AccountPreferences } from './AccountPreferences';
import { resolveAccountNavigation } from './accountNavigation';
import { describeSession, formatDate } from './accountPresentation';

type PendingAction =
  | { id: string; kind: 'device'; label: string }
  | { id: string; kind: 'session'; label: 'browser' | 'android' | 'web' }
  | { kind: 'others' };

type AccountTranslator = ReturnType<typeof useTranslations<'Account'>>;
type AccountError = {
  key: 'loadError' | 'linkError' | 'revokeError' | 'storageError';
  cause?: unknown;
};
type AccountNotice = 'oidcLinked' | 'passwordChanged' | { action: PendingAction };

const UNAVAILABLE_OIDC_LINK_STATUS: OidcLinkStatus = {
  displayName: 'OpenID Connect',
  enabled: false,
  linked: false,
};

export default function AccountSettingsPage() {
  const t = useTranslations('Account');
  const errorT = useTranslations('Errors');
  const aiT = useTranslations('AiAssistant');
  const locale = useLocale();
  const previousLocaleRef = useRef(locale);
  const auth = useDashboardAuth();
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [oidcLinkStatus, setOidcLinkStatus] = useState<OidcLinkStatus | null>(null);
  const [androidQrLoginEnabled, setAndroidQrLoginEnabled] = useState<boolean | null>(null);
  const [areSessionsLoading, setAreSessionsLoading] = useState(true);
  const [areDevicesLoading, setAreDevicesLoading] = useState(true);
  const [isOidcLinkStatusLoading, setIsOidcLinkStatusLoading] = useState(true);
  const [error, setError] = useState<AccountError | null>(null);
  const [notice, setNotice] = useState<AccountNotice | null>(null);
  const [navigation, setNavigation] = useState<ReturnType<typeof resolveAccountNavigation> | null>(
    null,
  );
  const section = navigation?.section ?? 'preferences';
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isOidcLinkOpen, setIsOidcLinkOpen] = useState(false);
  const [oidcCurrentPassword, setOidcCurrentPassword] = useState('');
  const loadGenerationRef = useRef(0);
  const passwordTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shouldRestorePasswordFocusRef = useRef(false);

  useEffect(() => {
    if (
      section !== 'security' ||
      isPasswordOpen ||
      isPasswordSaving ||
      !shouldRestorePasswordFocusRef.current
    )
      return;
    shouldRestorePasswordFocusRef.current = false;
    passwordTriggerRef.current?.focus();
  }, [isPasswordOpen, isPasswordSaving, section]);

  const loadSecurityData = useCallback(() => {
    if (!auth.isAuthenticated) {
      return;
    }

    const loadGeneration = loadGenerationRef.current + 1;
    loadGenerationRef.current = loadGeneration;
    const isCurrentLoad = () => loadGenerationRef.current === loadGeneration;
    setAreSessionsLoading(true);
    setAreDevicesLoading(true);
    setIsOidcLinkStatusLoading(true);
    setAndroidQrLoginEnabled(null);
    setError(null);

    void auth
      .apiRequest<AuthSessionsResponse>('/auth/sessions')
      .then((response) => {
        if (isCurrentLoad()) {
          setSessions(response.sessions);
        }
      })
      .catch((nextError) => {
        if (isCurrentLoad()) {
          setError({ key: 'loadError', cause: nextError });
        }
      })
      .finally(() => {
        if (isCurrentLoad()) {
          setAreSessionsLoading(false);
        }
      });
    void auth
      .apiRequest<RemoteDevicesResponse>('/devices')
      .then((response) => {
        if (isCurrentLoad()) {
          setDevices(response.devices);
        }
      })
      .catch((nextError) => {
        if (isCurrentLoad()) {
          setError({ key: 'loadError', cause: nextError });
        }
      })
      .finally(() => {
        if (isCurrentLoad()) {
          setAreDevicesLoading(false);
        }
      });
    void auth
      .apiRequest<AuthMethods>('/auth/methods')
      .then((methods) => {
        if (isCurrentLoad()) {
          setAndroidQrLoginEnabled(methods.androidQrLogin.enabled);
        }
      })
      .catch(() => {
        if (isCurrentLoad()) {
          setAndroidQrLoginEnabled(false);
        }
      });
    void auth
      .apiRequest<OidcLinkStatus>('/auth/oidc/link')
      .then((linkStatus) => {
        if (isCurrentLoad()) {
          setOidcLinkStatus(linkStatus);
        }
      })
      .catch(() => {
        if (isCurrentLoad()) {
          setOidcLinkStatus((currentStatus) => currentStatus ?? UNAVAILABLE_OIDC_LINK_STATUS);
        }
      })
      .finally(() => {
        if (isCurrentLoad()) {
          setIsOidcLinkStatusLoading(false);
        }
      });
  }, [auth]);

  useEffect(() => {
    if (auth.isHydrated && auth.isAuthenticated) {
      loadSecurityData();
    }
  }, [auth.isAuthenticated, auth.isHydrated, loadSecurityData]);

  useEffect(() => {
    if (!auth.isHydrated) {
      return;
    }
    function syncNavigation() {
      const next = resolveAccountNavigation(new URL(window.location.href));
      if (next.linked) {
        setNotice('oidcLinked');
        window.history.replaceState(window.history.state, '', next.href);
      }
      setNavigation(next);
    }
    syncNavigation();
    window.addEventListener('hashchange', syncNavigation);
    window.addEventListener('popstate', syncNavigation);
    return () => {
      window.removeEventListener('hashchange', syncNavigation);
      window.removeEventListener('popstate', syncNavigation);
    };
  }, [auth.isHydrated]);

  useEffect(() => {
    if (previousLocaleRef.current === locale) return;
    previousLocaleRef.current = locale;
    // A locale Server Action can remove the fragment without a hashchange event.
    // Keep the mounted category and its reload/deep-link target in sync.
    if (navigation == null || window.location.hash) return;
    const url = new URL(window.location.href);
    url.hash = navigation.target;
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [locale, navigation]);

  useEffect(() => {
    if (!auth.isAuthenticated || navigation == null || !navigation.target.endsWith('-heading'))
      return;
    // Legacy links point inside Security. Reveal the mounted panel before scrolling.
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(navigation.target)?.scrollIntoView();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [auth.isAuthenticated, navigation]);

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
        clearOidcLinkState();
        setError({ key: 'storageError' });
        setIsSubmitting(false);
        return;
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
      setError({ key: 'linkError', cause: nextError });
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
      setNotice({ action: pendingAction });
      setPendingAction(null);
      setCurrentPassword('');
      loadSecurityData();
    } catch (nextError) {
      setError({ key: 'revokeError', cause: nextError });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="account-security-shell">
        <p className="muted">{t('loading')}</p>
      </main>
    );
  }

  const otherSessionCount = sessions.filter((session) => !session.isCurrent).length;
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 5);
  const hiddenSessionCount = sessions.length - visibleSessions.length;

  return (
    <main className="shell kc-shell kc-shell-account">
      <WorkspaceHeader
        activeSection="account"
        isRefreshing={areSessionsLoading || areDevicesLoading || isOidcLinkStatusLoading}
        username={auth.session.user.username}
        onLogout={() => setIsSignOutOpen(true)}
        onRefresh={loadSecurityData}
      />
      <div className="account-security-shell">
        <Link className="account-security-back" href="/dashboard/map">
          <ArrowLeftIcon aria-hidden /> {t('back')}
        </Link>
        <header className="account-security-header">
          <div>
            <h1>{t('title')}</h1>
            <p className="muted no-margin">{t('description')}</p>
          </div>
        </header>

        <div className="account-settings-layout">
          <nav className="account-settings-nav" aria-label={t('sections')}>
            <a
              href="#preferences"
              aria-current={section === 'preferences' ? 'location' : undefined}
            >
              <GearIcon /> {t('preferences')}
            </a>
            <a
              href="#ai-assistant"
              aria-current={section === 'ai-assistant' ? 'location' : undefined}
            >
              <GearIcon /> {aiT('title')}
            </a>
            <a href="#security" aria-current={section === 'security' ? 'location' : undefined}>
              <LockClosedIcon /> {t('security')}
              {error == null ? null : (
                <span
                  className="account-settings-error"
                  role="img"
                  aria-label={t('securityError')}
                  title={t('securityError')}
                >
                  !
                </span>
              )}
            </a>
          </nav>
          <div className="account-settings-content">
            <div id="preferences" hidden={section !== 'preferences'}>
              <AccountPreferences />
            </div>
            <section
              id="ai-assistant"
              hidden={section !== 'ai-assistant'}
              aria-label={aiT('title')}
            >
              <AiAssistantSettings
                key={auth.session.session.id}
                apiRequest={auth.apiRequest}
                active={section === 'ai-assistant'}
              />
            </section>
            {/* Keep Security mounted: category changes must not reset password or QR state. */}
            <section id="security" hidden={section !== 'security'} aria-label={t('security')}>
              {error == null ? null : (
                <div className="error account-security-feedback" role="alert">
                  {error.cause == null
                    ? t(error.key)
                    : errorMessage(error.cause, (key, values) =>
                        ['unexpected', 'http', 'server'].includes(key)
                          ? t(error.key)
                          : errorT(key, values),
                      )}
                </div>
              )}
              {notice == null ? null : (
                <div className="success account-security-feedback" role="status">
                  {typeof notice === 'string'
                    ? t(notice)
                    : t('revokedNotice', { target: describeAction(notice.action, t) })}
                </div>
              )}

              <div className="account-security-grid">
                <section
                  className="panel account-security-panel account-security-sign-in"
                  aria-labelledby="sign-in-heading"
                >
                  <div className="account-security-section-header">
                    <div>
                      <h2 id="sign-in-heading">{t('signIn')}</h2>
                    </div>
                    {oidcLinkStatus?.linked ? (
                      <span className="chip remote-chip-online">{t('linked')}</span>
                    ) : null}
                  </div>
                  {isOidcLinkStatusLoading || oidcLinkStatus == null ? (
                    <p className="muted">{t('loadingSignIn')}</p>
                  ) : !oidcLinkStatus.enabled ? (
                    <p className="muted">{t('oidcUnavailable')}</p>
                  ) : oidcLinkStatus.linked ? (
                    <p className="muted">
                      {t('providerLinked', { provider: oidcLinkStatus.displayName })}
                    </p>
                  ) : (
                    <>
                      <p className="muted">
                        {t('linkHelp', { provider: oidcLinkStatus.displayName })}
                      </p>
                      <div className="account-security-actions">
                        <Button
                          className="secondary"
                          disabled={isSubmitting}
                          type="button"
                          onClick={() => setIsOidcLinkOpen(true)}
                        >
                          {t('linkProvider', { provider: oidcLinkStatus.displayName })}
                        </Button>
                      </div>
                    </>
                  )}
                  <div className="account-password-row">
                    <div>
                      <h3>{t('password')}</h3>
                      <p className="muted no-margin">{t('passwordHelp')}</p>
                    </div>
                    <Button
                      ref={passwordTriggerRef}
                      className="secondary"
                      type="button"
                      aria-expanded={isPasswordOpen}
                      aria-controls="account-password-form"
                      disabled={isPasswordSaving}
                      onClick={() => setIsPasswordOpen((open) => !open)}
                    >
                      {t('changePassword')}
                    </Button>
                  </div>
                  {isPasswordOpen ? (
                    <div id="account-password-form" className="account-password-expansion">
                      <ChangePasswordForm
                        username={auth.session.user.username}
                        onCancel={() => {
                          shouldRestorePasswordFocusRef.current = true;
                          setIsPasswordOpen(false);
                        }}
                        onSuccess={() => {
                          shouldRestorePasswordFocusRef.current = true;
                          setIsPasswordOpen(false);
                          setNotice('passwordChanged');
                        }}
                        onChangePassword={async (input) => {
                          setIsPasswordSaving(true);
                          try {
                            await changePassword(input);
                          } finally {
                            setIsPasswordSaving(false);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </section>

                <section
                  className="panel account-security-panel"
                  aria-labelledby="sessions-heading"
                >
                  <div className="account-security-section-header">
                    <div>
                      <h2 id="sessions-heading">{t('sessions')}</h2>
                    </div>
                    <Button
                      className="secondary"
                      disabled={areSessionsLoading || otherSessionCount === 0 || isSubmitting}
                      type="button"
                      onClick={() => setPendingAction({ kind: 'others' })}
                    >
                      {t('revokeOthers')}
                    </Button>
                  </div>
                  {areSessionsLoading ? <p className="muted">{t('loadingSessions')}</p> : null}
                  {!areSessionsLoading && sessions.length === 0 ? (
                    <p className="muted">{t('noSessions')}</p>
                  ) : null}
                  <div className="account-security-list">
                    {visibleSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        disabled={areSessionsLoading || isSubmitting}
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
                      {showAllSessions
                        ? t('showFewer')
                        : t('showMore', { count: hiddenSessionCount })}
                    </Button>
                  ) : null}
                </section>

                <AndroidQrLoginPanel
                  key={auth.session.session.id}
                  apiRequest={auth.apiRequest}
                  enabled={androidQrLoginEnabled}
                  username={auth.session.user.username}
                />

                <section className="panel account-security-panel" aria-labelledby="devices-heading">
                  <div className="account-security-section-header">
                    <div>
                      <h2 id="devices-heading">{t('devices')}</h2>
                    </div>
                  </div>
                  <p className="muted">{t('deviceRevokeHelp')}</p>
                  {areDevicesLoading ? <p className="muted">{t('loadingDevices')}</p> : null}
                  {!areDevicesLoading && devices.length === 0 ? (
                    <p className="muted">{t('noDevices')}</p>
                  ) : null}
                  <div className="account-security-list">
                    {devices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        disabled={areDevicesLoading || isSubmitting}
                        onRevoke={() =>
                          setPendingAction({ id: device.id, kind: 'device', label: device.name })
                        }
                      />
                    ))}
                  </div>
                </section>
              </div>
            </section>
          </div>
        </div>

        <DialogFrame
          description={t('oidcDescription', {
            provider: oidcLinkStatus?.displayName ?? t('oidcProvider'),
          })}
          eyebrow={t('addSignIn')}
          open={isOidcLinkOpen}
          title={t('linkProvider', { provider: oidcLinkStatus?.displayName ?? t('oidc') })}
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
              {t('currentKestrelPassword')}
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
                {t('cancel')}
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? t('continuing') : t('continueProvider')}
              </Button>
            </div>
          </form>
        </DialogFrame>

        <ConfirmDialog
          confirmLabel={t('signOut')}
          description={t('signOutDescription')}
          open={isSignOutOpen}
          title={t('signOutTitle')}
          onConfirm={revokeCurrentSession}
          onOpenChange={setIsSignOutOpen}
        />

        <DialogFrame
          description={t('sensitiveDescription')}
          eyebrow={t('confirmSensitive')}
          open={pendingAction != null}
          title={t('revokeTitle', {
            target: pendingAction == null ? t('access') : describeAction(pendingAction, t),
          })}
          onOpenChange={(open) => {
            if (!open && !isSubmitting) {
              setPendingAction(null);
              setCurrentPassword('');
            }
          }}
        >
          <form className="account-security-confirm-form" onSubmit={submitSensitiveAction}>
            <label htmlFor="radix-field-app-dashboard-account-page-tsx-1">
              {t('currentPassword')}
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
                {t('cancel')}
              </Button>
              <Button className="danger" disabled={isSubmitting} type="submit">
                {isSubmitting ? t('revoking') : t('revokeAccess')}
              </Button>
            </div>
          </form>
        </DialogFrame>
      </div>
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
  const t = useTranslations('Account');
  const locale = useLocale();
  return (
    <article className="account-security-row">
      <div>
        <div className="account-security-row-title">
          <strong>{t(`sessionKind.${describeSession(session)}`)}</strong>
          {session.isCurrent ? (
            <span className="chip remote-chip-online">{t('current')}</span>
          ) : null}
        </div>
        <p className="muted no-margin">{session.userAgent ?? t('unknownClient')}</p>
        <p className="muted no-margin">
          {session.ipAddress == null
            ? t('sessionDates', {
                lastUsed: formatDate(session.lastUsedAt, locale),
                expires: formatDate(session.expiresAt, locale),
              })
            : t('sessionDatesWithIp', {
                lastUsed: formatDate(session.lastUsedAt, locale),
                expires: formatDate(session.expiresAt, locale),
                ip: session.ipAddress,
              })}
        </p>
      </div>
      <Button className="danger secondary" disabled={disabled} type="button" onClick={onRevoke}>
        {session.isCurrent ? t('signOut') : t('revoke')}
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
  const t = useTranslations('Account');
  const locale = useLocale();
  const isOnline = device.revokedAt == null && device.online;
  const status = device.revokedAt != null ? 'revoked' : isOnline ? 'online' : 'offline';
  const playback = t(`playback.${device.state?.playbackState ?? 'unknown'}`);

  return (
    <article className="account-security-row">
      <div>
        <div className="account-security-row-title">
          <strong>{device.name}</strong>
          <span className={`chip ${isOnline ? 'remote-chip-online' : 'remote-chip-offline'}`}>
            {t(`deviceStatus.${status}`)}
          </span>
        </div>
        <p className="muted no-margin">
          {t('devicePlayback', { playback, enabled: device.remoteControlEnabled ? 'yes' : 'no' })}
        </p>
        <p className="muted no-margin">
          {device.appVersion == null
            ? t('lastSeen', { date: formatDate(device.lastSeenAt, locale) })
            : t('lastSeenVersion', {
                date: formatDate(device.lastSeenAt, locale),
                version: device.appVersion,
              })}
        </p>
      </div>
      <Button
        className="danger secondary"
        disabled={disabled || device.revokedAt != null}
        type="button"
        onClick={onRevoke}
      >
        {device.revokedAt == null ? t('revoke') : t('revoked')}
      </Button>
    </article>
  );
}

function describeAction(action: PendingAction, t: AccountTranslator): string {
  if (action.kind === 'others') return t('otherSessions');
  return action.kind === 'device' ? action.label : t(`sessionKind.${action.label}`);
}
