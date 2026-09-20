'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { formatError } from '@/components/dashboard/utils';
import { Button, TextInput } from '@/components/ui/radix-ui';
import type { ChangePasswordInput } from '@/lib/api';

// Call in the shell that owns the form's lifetime: Map retains state on close,
// while the Library account content resets when unmounted.
export function usePasswordChange(onChangePassword: (input: ChangePasswordInput) => Promise<void>) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setIsSaving(true);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password updated.');
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    notice,
    error,
    isSaving,
    submit,
  };
}

export function ChangePasswordForm({
  children,
  fieldIdPrefix,
  passwordChange,
  username,
}: {
  children?: ReactNode;
  fieldIdPrefix: string;
  passwordChange: ReturnType<typeof usePasswordChange>;
  username?: string;
}) {
  const {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    notice,
    error,
    isSaving,
    submit,
  } = passwordChange;
  return (
    <>
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
      {children}
      <form className="stack" onSubmit={submit}>
        {username === undefined ? null : (
          <input
            aria-hidden="true"
            autoComplete="username"
            className="sr-only"
            readOnly
            tabIndex={-1}
            value={username}
          />
        )}
        <label htmlFor={`${fieldIdPrefix}-1`}>
          Current password
          <TextInput
            id={`${fieldIdPrefix}-1`}
            autoComplete="current-password"
            required
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label htmlFor={`${fieldIdPrefix}-2`}>
          New password
          <TextInput
            id={`${fieldIdPrefix}-2`}
            autoComplete="new-password"
            minLength={12}
            required
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <Button disabled={isSaving} type="submit">
          {isSaving ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </>
  );
}
