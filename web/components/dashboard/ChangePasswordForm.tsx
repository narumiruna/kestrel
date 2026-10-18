'use client';

import { IconButton, TextField } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { EyeClosedIcon, EyeOpenIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/radix-ui';
import { type ErrorKey, getErrorKey } from '@/i18n/errors';
import { ApiError, type ChangePasswordInput } from '@/lib/api';

type PasswordField = 'current' | 'new' | 'confirm';

export function ChangePasswordForm({
  onChangePassword,
  onCancel,
  onSuccess,
  username,
}: {
  onChangePassword: (input: ChangePasswordInput) => Promise<void>;
  username: string;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const t = useTranslations('ChangePassword');
  const errorT = useTranslations('Errors');
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
  const [error, setError] = useState<{ key: ErrorKey; status: number } | null>(null);
  const [notice, setNotice] = useState(false);

  const newPasswordValid = newPassword.length >= 12 && newPassword.length <= 256;
  const matches = confirmPassword === newPassword;
  const canSubmit =
    currentPassword.length > 0 && newPasswordValid && matches && confirmPassword.length > 0;
  const currentFieldError = touched.current && !currentPassword ? t('enterCurrent') : null;
  const newError = touched.new && !newPasswordValid;
  const confirmError = touched.confirm && (confirmPassword.length === 0 || !matches);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSaving) return;

    setError(null);
    setNotice(false);
    setIsSaving(true);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTouched({ current: false, new: false, confirm: false });
      setVisible({ current: false, new: false, confirm: false });
      setNotice(true);
      onSuccess?.();
    } catch (nextError) {
      setError({
        key: getErrorKey(nextError),
        status: nextError instanceof ApiError ? nextError.status : 0,
      });
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
          autoFocus={key === 'current'}
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
            setNotice(false);
            setError(null);
          }}
        >
          <TextField.Slot side="right">
            <IconButton
              aria-label={visible[key] ? t(`hide.${key}`) : t(`show.${key}`)}
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
      <input
        aria-hidden="true"
        autoComplete="username"
        className="sr-only"
        readOnly
        tabIndex={-1}
        value={username}
      />
      {!notice ? null : (
        <div className="success" role="status">
          {t('success')}
        </div>
      )}
      {error == null ? null : (
        <div className="error" role="alert">
          {error.key === 'unauthorized'
            ? t('authenticationFailed')
            : errorT(error.key, { status: error.status })}
        </div>
      )}
      <div>
        {field(
          'current',
          t('current'),
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
          t('new'),
          newPassword,
          setNewPassword,
          'new-password',
          newError,
          'new-password-help',
        )}
        <p className={newError ? 'password-error' : 'password-hint'} id="new-password-help">
          {t('passwordHelp')}
        </p>
      </div>
      <div>
        {field(
          'confirm',
          t('confirm'),
          confirmPassword,
          setConfirmPassword,
          'new-password',
          confirmError,
          'confirm-password-help',
        )}
        {confirmError ? (
          <p className="password-error" id="confirm-password-help" role="alert">
            {confirmPassword.length === 0 ? t('confirmRequired') : t('mismatch')}
          </p>
        ) : (
          <p className="password-hint" id="confirm-password-help">
            {t('confirmHelp')}
          </p>
        )}
      </div>
      <div className="account-security-actions">
        <Button className="change-password-submit" disabled={!canSubmit || isSaving} type="submit">
          {isSaving ? t('updating') : t('update')}
        </Button>
        {onCancel == null ? null : (
          <Button className="secondary" disabled={isSaving} type="button" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
