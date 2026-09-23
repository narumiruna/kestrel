'use client';

import { IconButton, TextField } from '@radix-ui/themes';
import { type FormEvent, useState } from 'react';
import { formatError } from '@/components/dashboard/utils';
import { EyeClosedIcon, EyeOpenIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/radix-ui';
import type { ChangePasswordInput } from '@/lib/api';

type PasswordField = 'current' | 'new' | 'confirm';

export function ChangePasswordForm({
  onChangePassword,
  username,
}: {
  onChangePassword: (input: ChangePasswordInput) => Promise<void>;
  username: string;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [touched, setTouched] = useState<Record<PasswordField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const newPasswordValid = newPassword.length >= 12 && newPassword.length <= 256;
  const matches = confirmPassword === newPassword;
  const canSubmit =
    currentPassword.length > 0 && newPasswordValid && matches && confirmPassword.length > 0;
  const currentFieldError =
    currentError ?? (touched.current && !currentPassword ? 'Enter your current password.' : null);
  const newError = touched.new && !newPasswordValid;
  const confirmError = touched.confirm && (confirmPassword.length === 0 || !matches);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSaving) return;

    setError(null);
    setCurrentError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTouched({ current: false, new: false, confirm: false });
      setVisible({ current: false, new: false, confirm: false });
      setNotice('Password changed successfully. Use your new password next time you sign in.');
    } catch (nextError) {
      const message = formatError(nextError);
      if (/invalid current password/i.test(message)) {
        setCurrentError('Current password is incorrect. Please try again.');
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function field(
    key: PasswordField,
    label: string,
    value: string,
    onChange: (value: string) => void,
    autoComplete: 'current-password' | 'new-password',
    invalid: boolean,
    descriptionId?: string,
  ) {
    const id = `change-password-${key}`;
    return (
      <div className="password-field" key={key}>
        <label htmlFor={id}>{label}</label>
        <TextField.Root
          aria-describedby={descriptionId}
          aria-invalid={invalid}
          autoComplete={autoComplete}
          className={invalid ? 'password-input is-invalid' : 'password-input'}
          disabled={isSaving}
          id={id}
          maxLength={256}
          required
          type={visible[key] ? 'text' : 'password'}
          value={value}
          onBlur={() => setTouched((previous) => ({ ...previous, [key]: true }))}
          onChange={(event) => {
            onChange(event.target.value);
            setNotice(null);
            setError(null);
            if (key === 'current') setCurrentError(null);
          }}
        >
          <TextField.Slot side="right">
            <IconButton
              aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
              aria-pressed={visible[key]}
              className="password-visibility"
              disabled={isSaving}
              size="1"
              type="button"
              variant="ghost"
              onClick={() => setVisible((previous) => ({ ...previous, [key]: !previous[key] }))}
            >
              {visible[key] ? <EyeClosedIcon /> : <EyeOpenIcon />}
            </IconButton>
          </TextField.Slot>
        </TextField.Root>
      </div>
    );
  }

  return (
    <form className="change-password-form" onSubmit={submit}>
      <input autoComplete="username" className="sr-only" readOnly tabIndex={-1} value={username} />
      {notice == null ? null : (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      {error == null ? null : (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div>
        {field(
          'current',
          'Current password',
          currentPassword,
          setCurrentPassword,
          'current-password',
          currentFieldError != null,
          currentFieldError == null ? undefined : 'current-password-error',
        )}
        {currentFieldError == null ? null : (
          <p className="password-error" id="current-password-error" role="alert">
            {currentFieldError}
          </p>
        )}
      </div>
      <div>
        {field(
          'new',
          'New password',
          newPassword,
          setNewPassword,
          'new-password',
          newError,
          'new-password-help',
        )}
        <p className={newError ? 'password-error' : 'password-hint'} id="new-password-help">
          Use 12–256 characters for your new password.
        </p>
      </div>
      <div>
        {field(
          'confirm',
          'Confirm new password',
          confirmPassword,
          setConfirmPassword,
          'new-password',
          confirmError,
          'confirm-password-help',
        )}
        {confirmError ? (
          <p className="password-error" id="confirm-password-help" role="alert">
            {confirmPassword.length === 0
              ? 'Confirm your new password.'
              : 'Passwords do not match.'}
          </p>
        ) : (
          <p className="password-hint" id="confirm-password-help">
            Re-enter your new password to confirm.
          </p>
        )}
      </div>
      <Button className="change-password-submit" disabled={!canSubmit || isSaving} type="submit">
        {isSaving ? 'Changing password…' : 'Change password'}
      </Button>
    </form>
  );
}
