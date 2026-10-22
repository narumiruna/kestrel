import type { CredentialStore } from '@earendil-works/pi-ai';
import { AiCatalogService } from './ai-catalog';
import { aiError } from './ai-errors';
import { refreshWithPi } from './ai-auth-worker-client';

/** A fresh user-owned collection. Never import CLI auth.json or use host credentials. */
export async function createUserAiModels(
  credentials: CredentialStore,
  catalog: AiCatalogService,
) {
  const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
  const models = builtinModels({
    credentials,
    authContext: {
      env: () => Promise.resolve(undefined),
      fileExists: () => Promise.resolve(false),
    },
    identity: { userAgent: { custom: 'Kestrel' }, attribution: null },
  });
  for (const provider of models.getProviders()) {
    const apiKey = provider.auth.apiKey;
    const oauth = provider.auth.oauth;
    models.setProvider({
      ...provider,
      auth: {
        ...(apiKey
          ? {
              apiKey: {
                ...apiKey,
                login: () => aiError('AI_USE_HOSTED_AUTH'),
                resolve: async (input) => {
                  if (!input.credential) return undefined;
                  await catalog.assertMethod(provider.id, 'api_key');
                  if (!input.credential.key)
                    return aiError('AI_RECONNECT_REQUIRED', 409);
                  return apiKey.resolve({
                    ...input,
                    ctx: {
                      env: () => Promise.resolve(undefined),
                      fileExists: () => Promise.resolve(false),
                    },
                  });
                },
              },
            }
          : {}),
        ...(oauth
          ? {
              oauth: {
                ...oauth,
                login: () => aiError('AI_USE_HOSTED_AUTH'),
                refresh: async (credential, signal) => {
                  await catalog.assertMethod(provider.id, 'oauth');
                  return refreshWithPi(
                    provider.id,
                    credential,
                    AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
                  );
                },
                toAuth: async (credential) => {
                  await catalog.assertMethod(provider.id, 'oauth');
                  return oauth.toAuth(credential);
                },
              },
            }
          : {}),
      },
    });
  }
  // This stage exposes auth resolution only, not unchecked downstream SDK/inference paths.
  return {
    getAuth: models.getAuth.bind(models),
    checkAuth: models.checkAuth.bind(models),
  };
}
