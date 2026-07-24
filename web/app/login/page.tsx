'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button, CheckboxField, Tabs, TextInput } from '@/components/ui/radix-ui';
import { ApiError, login, register, setupTotp, verifyTotp } from '@/lib/api';

type AuthTab = 'login' | 'register';
type TotpSetup = {
  qrCodeDataUrl: string;
  secret: string;
};

const DEV_DEFAULT_PASSWORD = 'admin';
const DEV_DEFAULT_USERNAME = 'admin';
const REGISTER_PASSWORD_MIN_LENGTH = 12;

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [oneTimeCode, setOneTimeCode] = useState('');
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setError(formatError(nextError));
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
      setError(formatError(nextError));
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
      setError(formatError(nextError));
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
        <div className="brand auth-brand">
          <h1>Kestrel Cloud</h1>
          <span className="muted">Edit places and routes for Android sync.</span>
        </div>

        <Tabs.Root
          className="auth-tabs-root"
          value={tab}
          onValueChange={(value) => setTab(value as AuthTab)}
        >
          <Tabs.List className="tabs" activateOnFocus>
            <Tabs.Tab value="login">Login</Tabs.Tab>
            <Tabs.Tab value="register">Register</Tabs.Tab>
            <Tabs.Indicator className="ui-tabs-indicator" />
          </Tabs.List>

          {error == null ? null : <div className="error">{error}</div>}

          <Tabs.Panel className="auth-tab-panel" value="login">
            <form className="stack" onSubmit={submitLogin}>
              <CredentialsFields
                password={password}
                setPassword={setPassword}
                setUsername={setUsername}
                username={username}
              />
              <label htmlFor="radix-field-app-login-page-tsx-1">
                {isRecoveryCode ? 'Recovery code' : 'TOTP code'}
                <TextInput
                  id="radix-field-app-login-page-tsx-1"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="Optional when password-only login is allowed"
                  value={oneTimeCode}
                  onChange={(event) => setOneTimeCode(event.target.value)}
                />
              </label>
              <CheckboxField checked={isRecoveryCode} onCheckedChange={setIsRecoveryCode}>
                Use a recovery code instead
              </CheckboxField>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
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
                <p className="muted">
                  Passwords must be at least 12 characters. TOTP is optional; you can sign in with
                  username and password only.
                </p>
              ) : (
                <div className="stack">
                  <div className="success">
                    Scan this QR code, then enter the current authenticator code.
                  </div>
                  <Image
                    alt="TOTP QR code"
                    className="qr"
                    height={224}
                    src={totpSetup.qrCodeDataUrl}
                    unoptimized
                    width={224}
                  />
                  <label htmlFor="radix-field-app-login-page-tsx-2">
                    Secret
                    <TextInput
                      id="radix-field-app-login-page-tsx-2"
                      readOnly
                      value={totpSetup.secret}
                    />
                  </label>
                  <label htmlFor="radix-field-app-login-page-tsx-3">
                    TOTP code
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
                  <strong>Save these recovery codes now. They will not be shown again.</strong>
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
                {totpSetup == null ? 'Create account' : 'Verify TOTP'}
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
                  Create account + set up optional TOTP
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
                  Continue to login
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
  return (
    <>
      <label htmlFor="radix-field-app-login-page-tsx-4">
        Username
        <TextInput
          id="radix-field-app-login-page-tsx-4"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label htmlFor="radix-field-app-login-page-tsx-5">
        Password
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

function formatError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}
