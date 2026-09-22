import type { AndroidLoginAttemptStatus } from '@/lib/api';

const TERMINAL_STATUSES = new Set<AndroidLoginAttemptStatus>(['consumed', 'denied', 'expired']);

export function effectiveAndroidLoginStatus(
  status: AndroidLoginAttemptStatus,
  expiresAt: string,
  now: number,
): AndroidLoginAttemptStatus {
  if (!TERMINAL_STATUSES.has(status) && new Date(expiresAt).getTime() <= now) {
    return 'expired';
  }
  return status;
}

export function shouldPollAndroidLogin(status: AndroidLoginAttemptStatus): boolean {
  return !TERMINAL_STATUSES.has(status);
}

export function secondsUntilAndroidLoginExpiry(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1_000));
}

export function formatAndroidLoginTimeRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
