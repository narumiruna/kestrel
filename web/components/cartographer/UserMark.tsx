'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChangePasswordForm, usePasswordChange } from '@/components/ChangePasswordForm';
import { useTheme } from '@/components/ThemeProvider';
import { Button, PopoverFrame } from '@/components/ui/radix-ui';

type UserMarkProps = {
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  onLogout: () => void | Promise<void>;
  username: string;
};

export function UserMark({ onChangePassword, onLogout, username }: UserMarkProps) {
  const { isHydrated, theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const passwordChange = usePasswordChange(onChangePassword);

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
          <ChangePasswordForm
            fieldIdPrefix="radix-field-components-cartographer-usermark-tsx"
            passwordChange={passwordChange}
          >
            <Link className="secondary button-link" href="/dashboard/account">
              Account security
            </Link>
            <Button
              className="secondary"
              disabled={!isHydrated}
              type="button"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </Button>
          </ChangePasswordForm>
          <Button className="secondary" type="button" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </PopoverFrame>
    </div>
  );
}
