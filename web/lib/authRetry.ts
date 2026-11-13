import { ApiError } from './api.ts';

/** Do not refresh for a current-password rejection; preserve access-token 401 recovery. */
export async function withAccessTokenRetry<T>(
  request: () => Promise<T>,
  retryWithCurrentSession: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      error.code === 'INVALID_CURRENT_PASSWORD'
    ) {
      throw error;
    }
    return retryWithCurrentSession();
  }
}
