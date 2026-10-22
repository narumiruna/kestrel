import type {
  OAuthAuth,
  OAuthCredential,
  ProviderAuthInteraction,
} from '@earendil-works/pi-ai';
import { createHash, randomBytes } from 'node:crypto';
import { runAiAuthWorker } from './ai-auth-worker-client';

export type AiLoginRunner = (
  providerId: string,
  userId: string,
  interaction: ProviderAuthInteraction,
) => Promise<OAuthCredential>;

type ProviderLoader = (id: string) => Promise<OAuthAuth | undefined>;
const CALLBACK = 'http://127.0.0.1:1455/auth/callback';
const RESOURCE = 'https://api.openai.com/v1';
const DIRECT_SCOPE = 'chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
const fail = (): never => {
  throw new Error('AI provider login failed');
};
const required = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : fail();

export async function loadAiOAuthProvider(id: string) {
  const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
  return builtinModels({
    authContext: {
      env: () => Promise.resolve(undefined),
      fileExists: () => Promise.resolve(false),
    },
  }).getProvider(id)?.auth.oauth;
}

export async function postAiToken(
  url: string,
  body: URLSearchParams | string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const response = await transport(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      accept: 'application/json',
      'content-type':
        typeof body === 'string'
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
    },
    body,
    signal: bounded,
  });
  if (!response.ok || !response.body) return fail();
  const reader = response.body.getReader();
  let text = '';
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      bounded.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) return fail();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  bounded.throwIfAborted();
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return fail();
  return parsed as Record<string, unknown>;
}

/** Isolated provider collection and transport; no credential persistence. */
export function createAiLoginRunner(
  load: ProviderLoader = loadAiOAuthProvider,
  transport: typeof fetch = fetch,
): AiLoginRunner {
  const exchange = (
    url: string,
    body: URLSearchParams | string,
    signal: AbortSignal,
  ) => postAiToken(url, body, signal, transport);

  return async (providerId, userId, interaction) => {
    try {
      interaction.signal.throwIfAborted();
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId))
        return fail();
      if (providerId === 'openai' || providerId === 'openrouter') {
        const verifier = random();
        const state = random();
        const authorization = new URL(
          providerId === 'openai'
            ? 'https://auth.openai.com/api/accounts/authorize'
            : 'https://openrouter.ai/auth',
        );
        authorization.searchParams.set('code_challenge', digest(verifier));
        authorization.searchParams.set('code_challenge_method', 'S256');
        if (providerId === 'openai') {
          for (const [key, value] of Object.entries({
            client_id: 'dynamic_agent_client',
            agent_name_hint: 'Kestrel',
            ext_agent_host_id: `urn:uuid:${userId.toLowerCase()}`,
            response_type: 'code',
            redirect_uri: CALLBACK,
            resource: RESOURCE,
            scope: `openid profile email offline_access resource.invoke ${DIRECT_SCOPE}`,
            state,
            nonce: random(),
          }))
            authorization.searchParams.set(key, value);
        }
        interaction.notify({ type: 'auth_url', url: authorization.href });
        const input = await interaction.prompt({
          type: 'manual_code',
          message:
            providerId === 'openai'
              ? `Paste the full ${CALLBACK} URL from your browser:`
              : 'Paste the OpenRouter authorization code:',
          signal: interaction.signal,
        });
        interaction.signal.throwIfAborted();
        if (input.length > 16_384) return fail();
        if (providerId === 'openrouter') {
          const token = await exchange(
            'https://openrouter.ai/api/v1/auth/keys',
            JSON.stringify({
              code: required(input.trim()),
              code_verifier: verifier,
              code_challenge_method: 'S256',
            }),
            interaction.signal,
          );
          return {
            type: 'oauth',
            access: required(token.key),
            refresh: '',
            expires: Number.MAX_SAFE_INTEGER,
          };
        }
        const callback = new URL(input.trim());
        if (
          callback.origin !== 'http://127.0.0.1:1455' ||
          callback.pathname !== '/auth/callback' ||
          callback.username ||
          callback.password ||
          callback.hash ||
          callback.searchParams.has('error') ||
          callback.searchParams.get('state') !== state ||
          ['state', 'code', 'client_id'].some(
            (key) => callback.searchParams.getAll(key).length !== 1,
          )
        )
          return fail();
        const clientId = required(
          callback.searchParams.get('client_id'),
        ).trim();
        if (clientId === 'dynamic_agent_client') return fail();
        const token = await exchange(
          'https://auth.openai.com/api/accounts/oauth/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: required(callback.searchParams.get('code')),
            code_verifier: verifier,
            redirect_uri: CALLBACK,
            resource: RESOURCE,
          }),
          interaction.signal,
        );
        required(token.id_token);
        const scopes = required(token.scope).trim().split(/\s+/);
        if (!scopes.includes(DIRECT_SCOPE)) return fail();
        if (
          typeof token.expires_in !== 'number' ||
          !Number.isFinite(token.expires_in) ||
          token.expires_in <= 0
        )
          return fail();
        const expires = Date.now() + token.expires_in * 1000 - 180_000;
        if (!Number.isSafeInteger(expires)) return fail();
        return {
          type: 'oauth',
          access: required(token.access_token),
          refresh: required(token.refresh_token),
          expires,
          clientId,
          scopes,
        };
      }
      const oauth = await load(providerId);
      interaction.signal.throwIfAborted();
      if (!oauth) return fail();
      const credential = await oauth.login(
        {
          signal: interaction.signal,
          notify: (event) => interaction.notify(event),
          prompt: async (prompt) => {
            interaction.signal.throwIfAborted();
            const method = {
              anthropic: 'copy_code',
              'openai-codex': 'device_code',
              radius: 'device-code',
            }[providerId];
            if (prompt.type === 'select' && method) {
              if (!prompt.options.some((option) => option.id === method))
                return fail();
              return method;
            }
            if (
              providerId === 'github-copilot' &&
              prompt.type === 'text' &&
              prompt.message ===
                'GitHub Enterprise URL/domain (blank for github.com)'
            )
              return '';
            return interaction.prompt(prompt);
          },
        },
        { agentName: 'Kestrel', getDeviceId: () => userId },
      );
      interaction.signal.throwIfAborted();
      return credential;
    } catch {
      if (interaction.signal.aborted)
        throw new Error('AI provider login cancelled');
      return fail();
    }
  };
}

/** Never replay a potentially consumed Kimi refresh token after a transport failure. */
export async function refreshKimiOnce(
  credential: OAuthCredential,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<OAuthCredential> {
  const token = await postAiToken(
    'https://auth.kimi.com/api/oauth/token',
    new URLSearchParams({
      client_id: '17e5f671-d194-4dfb-9706-5516cb48c098',
      grant_type: 'refresh_token',
      refresh_token: credential.refresh,
    }),
    signal,
    transport,
  );
  if (
    typeof token.expires_in !== 'number' ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0
  )
    return fail();
  const expires = Date.now() + token.expires_in * 1000;
  if (!Number.isSafeInteger(expires)) return fail();
  return {
    type: 'oauth',
    access: required(token.access_token),
    refresh: required(token.refresh_token),
    expires,
  };
}

export const loginWithPi: AiLoginRunner = (providerId, userId, interaction) =>
  runAiAuthWorker({ providerId, userId }, interaction);
export default loginWithPi;
