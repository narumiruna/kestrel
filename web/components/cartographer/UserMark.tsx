'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { formatError } from '@/components/dashboard/utils';
import { useTheme } from '@/components/ThemeProvider';

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
      <button
        aria-expanded={isOpen}
        className="user-mark-button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden className="user-mark-avatar">
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span>{username}</span>
      </button>
      {isOpen ? (
        <div className="user-mark-popover">
          <div className="stack">
            <div>
              <strong>Account</strong>
              <p className="muted no-margin">Theme, password, and session controls.</p>
            </div>
            {error == null ? null : <div className="error">{error}</div>}
            {notice == null ? null : <div className="success">{notice}</div>}
            <Link className="secondary button-link" href="/dashboard/account">
              Account security
            </Link>
            <button
              className="secondary"
              disabled={!isHydrated}
              type="button"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>
            <form className="stack" onSubmit={submitPasswordChange}>
              <label>
                Current password
                <input
                  autoComplete="current-password"
                  minLength={12}
                  required
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  autoComplete="new-password"
                  minLength={12}
                  required
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <button disabled={isSaving} type="submit">
                {isSaving ? 'Saving…' : 'Change password'}
              </button>
            </form>
            <button className="secondary" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
