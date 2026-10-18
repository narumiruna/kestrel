'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/BrandMark';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button, CheckboxField, Tabs, TextInput } from '@/components/ui/radix-ui';
import { type ErrorKey, getErrorKey } from '@/i18n/errors';
import {
  ApiError,
  getAuthMethods,
  login,
  register,
  setupTotp,
  startOidc,
  verifyTotp,
} from '@/lib/api';

type AuthTab = 'login' | 'register';
type AuthOperation = 'signIn' | 'register' | 'totp';
type LoginError =
  | { key: ErrorKey; status: number }
  | { key: 'errorCredentials' | 'errorRegistrationConflict' | 'errorTotpInvalid' };
type TotpSetup = {
  qrCodeDataUrl: string;
  secret: string;
};

const DEV_DEFAULT_PASSWORD = 'admin';
const DEV_DEFAULT_USERNAME = 'admin';
const REGISTER_PASSWORD_MIN_LENGTH = 12;

export default function LoginPage() {
  const t = useTranslations('Auth');
  const errorT = useTranslations('Errors');
  const auth = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [oneTimeCode, setOneTimeCode] = useState('');
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<LoginError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcDisplayName, setOidcDisplayName] = useState('OpenID Connect');
  const didApplyDevDefaultsRef = useRef(false);

  useEffect(() => {
    if (didApplyDevDefaultsRef.current || tab !== 'login' || !isLocalDevHost()) {
      return;
    }

    didApplyDevDefaultsRef.current = true;
    setUsername((currentUsername) => currentUsername || DEV_DEFAULT_USERNAME);
    setPassword((currentPassword) => currentPassword || DEV_DEFAULT_PASSWORD);
  }, [tab]);

  useEffect(() => {
    if (auth.isHydrated && auth.isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [auth.isAuthenticated, auth.isHydrated, router]);

  useEffect(() => {
    let cancelled = false;
    getAuthMethods()
      .then((methods) => {
        if (!cancelled) {
          setOidcEnabled(methods.oidc.enabled);
          setOidcDisplayName(methods.oidc.displayName);
        }
      })
      .catch(() => {
        // Local authentication remains available when method discovery fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function beginOidcSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      const authenticationAttemptId = await auth.beginAuthentication();
      const { authorizationUrl } = await startOidc(authenticationAttemptId, 'web');
      window.location.assign(authorizationUrl);
    } catch (nextError) {
      setError(loginError(nextError));
      setIsSubmitting(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const authenticationAttemptId = await auth.beginAuthentication();
      const trimmedOneTimeCode = oneTimeCode.trim();
      const session = await login({
        password,
        username,
        ...(trimmedOneTimeCode.length === 0
          ? {}
          : isRecoveryCode
            ? { recoveryCode: trimmedOneTimeCode }
            : { totpCode: trimmedOneTimeCode }),
      });
      await auth.saveSession(session, authenticationAttemptId);
      router.replace('/dashboard');
    } catch (nextError) {
      setError(loginError(nextError, 'signIn'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (totpSetup == null) {
        const authenticationAttemptId = await auth.beginAuthentication();
        await register({ password, username });
        const session = await login({ password, username });
        await auth.saveSession(session, authenticationAttemptId);
        router.replace('/dashboard');
      } else {
        const result = await verifyTotp({
          code: oneTimeCode,
          password,
          username,
        });
        setRecoveryCodes(result.recoveryCodes);
      }
    } catch (nextError) {
      setError(loginError(nextError, totpSetup == null ? 'register' : 'totp'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startTotpSetup() {
    setError(null);
    setIsSubmitting(true);

    try {
      await ensureAccountForTotpSetup();
      const setup = await setupTotp({ password, username });
      setTotpSetup({
        qrCodeDataUrl: setup.qrCodeDataUrl,
        secret: setup.secret,
      });
    } catch (nextError) {
      setError(loginError(nextError, 'totp'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function ensureAccountForTotpSetup() {
    try {
      await register({ password, username });
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 409) {
        return;
      }

      throw nextError;
    }
  }

  return (
    <main className="auth-page">
      <section className="card auth-card stack">
        <BrandMark className="auth-brand" subtitle={t('subtitle')} titleAs="h1" />

        <LanguageSelector />

        <Tabs.Root
          className="auth-tabs-root"
          value={tab}
          onValueChange={(value) => setTab(value as AuthTab)}
        >
          <Tabs.List className="tabs" activateOnFocus>
            <Tabs.Tab value="login">{t('loginTab')}</Tabs.Tab>
            <Tabs.Tab value="register">{t('registerTab')}</Tabs.Tab>
            <Tabs.Indicator className="ui-tabs-indicator" />
          </Tabs.List>

          {error == null ? null : (
            <div className="error" role="alert">
              {'status' in error ? errorT(error.key, { status: error.status }) : t(error.key)}
            </div>
          )}

          <Tabs.Panel className="auth-tab-panel" value="login">
            <form className="stack" onSubmit={submitLogin}>
              <CredentialsFields
                password={password}
                setPassword={setPassword}
                setUsername={setUsername}
                username={username}
              />
              <label htmlFor="radix-field-app-login-page-tsx-1">
                {isRecoveryCode ? t('recoveryCode') : t('totpCode')}
                <TextInput
                  id="radix-field-app-login-page-tsx-1"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder={t('codePlaceholder')}
                  value={oneTimeCode}
                  onChange={(event) => setOneTimeCode(event.target.value)}
                />
              </label>
              <CheckboxField checked={isRecoveryCode} onCheckedChange={setIsRecoveryCode}>
                {t('useRecoveryCode')}
              </CheckboxField>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? t('signingIn') : t('signIn')}
              </Button>
              {oidcEnabled ? (
                <>
                  <div className="auth-alternative" aria-hidden="true">
                    <span>{t('or')}</span>
                  </div>
                  <Button
                    className="secondary"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => void beginOidcSignIn()}
                  >
                    {t('continueWith', { provider: oidcDisplayName })}
                  </Button>
                </>
              ) : null}
            </form>
          </Tabs.Panel>
          <Tabs.Panel className="auth-tab-panel" value="register">
            <form className="stack" onSubmit={submitRegister}>
              <CredentialsFields
                password={password}
                passwordMinLength={REGISTER_PASSWORD_MIN_LENGTH}
                setPassword={setPassword}
                setUsername={setUsername}
                username={username}
              />

              {totpSetup == null ? (
                <p className="muted">{t('passwordHelp')}</p>
              ) : (
                <div className="stack">
                  <div className="success">{t('scanTotp')}</div>
                  <Image
                    alt={t('totpQrAlt')}
                    className="qr"
                    height={224}
                    src={totpSetup.qrCodeDataUrl}
                    unoptimized
                    width={224}
                  />
                  <label htmlFor="radix-field-app-login-page-tsx-2">
                    {t('secret')}
                    <TextInput
                      id="radix-field-app-login-page-tsx-2"
                      readOnly
                      value={totpSetup.secret}
                    />
                  </label>
                  <label htmlFor="radix-field-app-login-page-tsx-3">
                    {t('totpCode')}
                    <TextInput
                      id="radix-field-app-login-page-tsx-3"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      required
                      value={oneTimeCode}
                      onChange={(event) => setOneTimeCode(event.target.value)}
                    />
                  </label>
                </div>
              )}

              {recoveryCodes == null ? null : (
                <div className="success stack">
                  <strong>{t('saveRecoveryCodes')}</strong>
                  <div className="chip-row">
                    {recoveryCodes.map((code) => (
                      <code className="chip" key={code}>
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <Button disabled={isSubmitting || recoveryCodes != null} type="submit">
                {totpSetup == null ? t('createAccount') : t('verifyTotp')}
              </Button>
              {totpSetup == null ? (
                <Button
                  className="secondary"
                  disabled={
                    isSubmitting ||
                    username.length === 0 ||
                    password.length < REGISTER_PASSWORD_MIN_LENGTH
                  }
                  type="button"
                  onClick={() => void startTotpSetup()}
                >
                  {t('createWithTotp')}
                </Button>
              ) : null}
              {recoveryCodes == null ? null : (
                <Button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setOneTimeCode('');
                    setRecoveryCodes(null);
                    setTotpSetup(null);
                  }}
                >
                  {t('continueToLogin')}
                </Button>
              )}
            </form>
          </Tabs.Panel>
        </Tabs.Root>
      </section>
    </main>
  );
}

function CredentialsFields({
  password,
  passwordMinLength,
  setPassword,
  setUsername,
  username,
}: {
  password: string;
  passwordMinLength?: number;
  setPassword: (value: string) => void;
  setUsername: (value: string) => void;
  username: string;
}) {
  const t = useTranslations('Auth');
  return (
    <>
      <label htmlFor="radix-field-app-login-page-tsx-4">
        {t('username')}
        <TextInput
          id="radix-field-app-login-page-tsx-4"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label htmlFor="radix-field-app-login-page-tsx-5">
        {t('password')}
        <TextInput
          id="radix-field-app-login-page-tsx-5"
          autoComplete={passwordMinLength == null ? 'current-password' : 'new-password'}
          minLength={passwordMinLength}
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
    </>
  );
}

function isLocalDevHost(): boolean {
  const hostname = window.location.hostname;

  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function loginError(error: unknown, operation?: AuthOperation): LoginError {
  // Uncoded authentication responses need operation-specific guidance, not server prose.
  if (error instanceof ApiError && !error.code) {
    if (operation === 'signIn' && error.status === 401) return { key: 'errorCredentials' };
    if (operation === 'register' && error.status === 409) {
      return { key: 'errorRegistrationConflict' };
    }
    if (operation === 'totp' && [400, 401].includes(error.status)) {
      return { key: 'errorTotpInvalid' };
    }
  }
  return { key: getErrorKey(error), status: error instanceof ApiError ? error.status : 0 };
}
