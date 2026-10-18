'use server';

import { cookies, headers } from 'next/headers';
import { persistLocale } from './cookie';

export async function saveLocale(value: string): Promise<{ ok: boolean }> {
  try {
    const requestHeaders = await headers();
    const jar = await cookies();
    return persistLocale(
      value,
      requestHeaders.get('origin'),
      requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'),
      requestHeaders.get('x-forwarded-proto'),
      (name, nextValue, options) => {
        jar.set(name, nextValue, options);
      },
    );
  } catch {
    return { ok: false };
  }
}
