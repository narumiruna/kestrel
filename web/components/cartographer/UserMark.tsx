'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { formatError } from '@/components/dashboard/utils';
import { useTheme } from '@/components/ThemeProvider';
import { Button, PopoverFrame, TextInput } from '@/components/ui/radix-ui';

type UserMarkProps = {
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  onLogout: () => void | Promise<void>;
  username: string;
};

export function UserMark({ onChangePassword, onLogout, username }: UserMarkProps) {
  const { isHydrated, theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
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

  return (
    <div className="user-mark">
      <PopoverFrame
        className="user-mark-popover"
        open={isOpen}
        title="Account controls"
        trigger={
          <Button className="user-mark-button" type="button">
            <span aria-hidden className="user-mark-avatar">
              {username.slice(0, 1).toUpperCase()}
            </span>
            <span>{username}</span>
          </Button>
        }
        onOpenChange={setIsOpen}
      >
        <div className="stack">
          <div>
            <strong>Account</strong>
            <p className="muted no-margin">Theme, password, and session controls.</p>
          </div>
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
          <Link className="secondary button-link" href="/dashboard/account">
            Account security
          </Link>
          <Button className="secondary" disabled={!isHydrated} type="button" onClick={toggleTheme}>
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          </Button>
          <form className="stack" onSubmit={submitPasswordChange}>
            <label htmlFor="radix-field-components-cartographer-usermark-tsx-1">
              Current password
              <TextInput
                id="radix-field-components-cartographer-usermark-tsx-1"
                autoComplete="current-password"
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label htmlFor="radix-field-components-cartographer-usermark-tsx-2">
              New password
              <TextInput
                id="radix-field-components-cartographer-usermark-tsx-2"
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
          <Button className="secondary" type="button" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </PopoverFrame>
    </div>
  );
}
