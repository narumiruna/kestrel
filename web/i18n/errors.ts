import { ApiError } from '../lib/api.ts';

export type ErrorKey =
  | 'unexpected'
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'expired'
  | 'conflict'
  | 'rateLimited'
  | 'validation'
  | 'server'
  | 'http'
  | 'syncCursorExpired'
  | 'mutationReused'
  | 'reauthenticationRequired'
  | 'authenticationChanged'
  | 'authenticationSuperseded'
  | 'authenticationBusy'
  | 'notAuthenticated'
  | 'invalidLatitude'
  | 'invalidLongitude';
const codes: Record<string, ErrorKey> = {
  AUTHENTICATION_CHANGED: 'authenticationChanged',
  AUTHENTICATION_SUPERSEDED: 'authenticationSuperseded',
  AUTHENTICATION_BUSY: 'authenticationBusy',
  NOT_AUTHENTICATED: 'notAuthenticated',
  INVALID_LATITUDE: 'invalidLatitude',
  INVALID_LONGITUDE: 'invalidLongitude',
  SYNC_CURSOR_EXPIRED: 'syncCursorExpired',
  CLIENT_MUTATION_ID_REUSED: 'mutationReused',
  reauthentication_required: 'reauthenticationRequired',
};

export function getErrorKey(error: unknown): ErrorKey {
  if (error instanceof ApiError) {
    if (error.code && Object.hasOwn(codes, error.code)) return codes[error.code];
    if (error.status === 401) return 'unauthorized';
    if (error.status === 403) return 'forbidden';
    if (error.status === 404) return 'notFound';
    if (error.status === 410) return 'expired';
    if (error.status === 409) return 'conflict';
    if (error.status === 429) return 'rateLimited';
    if (error.status === 400 || error.status === 422) return 'validation';
    if (error.status >= 500) return 'server';
    return 'http';
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && ['TimeoutError', 'NetworkError'].includes(error.name))
  )
    return 'network';
  return 'unexpected';
}
export function errorMessage(
  error: unknown,
  t: (key: ErrorKey, values?: { status: number }) => string,
): string {
  return t(getErrorKey(error), { status: error instanceof ApiError ? error.status : 0 });
}
