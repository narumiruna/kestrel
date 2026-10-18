import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import english from '../messages/en.json';
import { localeCookie } from './config';
import { resolveLocaleMessages } from './resolve';

export default getRequestConfig(async () => {
  const resolved = await resolveLocaleMessages((await cookies()).get(localeCookie)?.value);
  return {
    ...resolved,
    onError() {},
    getMessageFallback: () => english.Framework.messageUnavailable,
  };
});
