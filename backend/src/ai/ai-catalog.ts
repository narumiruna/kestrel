import type { ApiKeyCredential } from '@earendil-works/pi-ai';
import { ConfigService } from '../config.service';
import {
  aiError,
  boundedString,
  hasControlCharacters,
  objectInput,
} from './ai-errors';
import { AiSecretBox } from './ai-secret-box';

export type AiSelection = {
  authMethod: 'api_key' | 'oauth';
  providerId: string;
  modelType: 'chat' | 'image' | 'classifier';
  modelId: string;
  thinkingLevel: string | null;
};

type AvailabilityReason =
  'policy' | 'hosted_unverified' | 'operator_unconfigured' | null;
const FIELDS: Record<
  string,
  {
    name: string;
    required: boolean;
    env: string;
    pattern: RegExp;
    fallback?: string;
  }[]
> = {
  azure: [
    {
      name: 'resourceName',
      required: true,
      env: 'AZURE_OPENAI_RESOURCE_NAME',
      pattern: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/,
    },
    {
      name: 'apiVersion',
      required: false,
      env: 'AZURE_OPENAI_API_VERSION',
      pattern: /^[a-zA-Z0-9.-]{1,40}$/,
      fallback: 'v1',
    },
    {
      name: 'deploymentMap',
      required: false,
      env: 'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
      pattern:
        /^[a-zA-Z0-9._:/-]+=[a-zA-Z0-9_-]+(?:,[a-zA-Z0-9._:/-]+=[a-zA-Z0-9_-]+)*$/,
    },
  ],
  'cloudflare-workers-ai': [
    {
      name: 'accountId',
      required: true,
      env: 'CLOUDFLARE_ACCOUNT_ID',
      pattern: /^[a-fA-F0-9]{32}$/,
    },
  ],
  'cloudflare-ai-gateway': [
    {
      name: 'accountId',
      required: true,
      env: 'CLOUDFLARE_ACCOUNT_ID',
      pattern: /^[a-fA-F0-9]{32}$/,
    },
    {
      name: 'gatewayId',
      required: true,
      env: 'CLOUDFLARE_GATEWAY_ID',
      pattern: /^[a-zA-Z0-9_-]{1,64}$/,
    },
  ],
  'amazon-bedrock': [
    {
      name: 'region',
      required: true,
      env: 'AWS_REGION',
      pattern: /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/,
    },
  ],
};

/** Shared metadata only. Never resolve credentials, log in, refresh, or infer on this collection. */
let registry: ReturnType<typeof loadRegistry> | undefined;
async function loadRegistry() {
  const [{ builtinModels }, { getModelType, getSupportedThinkingLevels }] =
    await Promise.all([
      import('@earendil-works/pi-ai/providers/all'),
      import('@earendil-works/pi-ai/models'),
    ]);
  const models = builtinModels({
    authContext: {
      env: () => Promise.resolve(undefined),
      fileExists: () => Promise.resolve(false),
    },
  });
  return { models, getModelType, getSupportedThinkingLevels };
}
export function piRegistry() {
  registry ??= loadRegistry();
  return registry;
}

export class AiCatalogService {
  constructor(
    private readonly config: ConfigService,
    private readonly secrets: AiSecretBox,
    private readonly registryLoader = piRegistry,
  ) {}

  publicOrigin(): string | null {
    try {
      const url = new URL(this.config.get('KESTREL_PUBLIC_URL') ?? '');
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  async catalog() {
    const { models, getModelType, getSupportedThinkingLevels } =
      await this.registryLoader();
    return {
      version: '1.4.0',
      providers: models
        .getProviders()
        .map((provider) => {
          const methods: {
            type: 'api_key' | 'oauth';
            available: boolean;
            reason: AvailabilityReason;
          }[] = [];
          if (provider.auth.apiKey) {
            const reason: AvailabilityReason = this.secrets.available()
              ? null
              : 'operator_unconfigured';
            methods.push({
              type: 'api_key',
              available: reason === null,
              reason,
            });
          }
          if (provider.auth.oauth) {
            const reason: AvailabilityReason = this.secrets.available()
              ? null
              : 'operator_unconfigured';
            methods.push({ type: 'oauth', available: reason === null, reason });
          }
          return {
            id: provider.id,
            name: provider.name,
            methods,
            fields: (FIELDS[provider.id] ?? []).map(({ name, required }) => ({
              name,
              required,
            })),
            models: models.getAllModels(provider.id).map((model) => ({
              id: model.id,
              name: model.name,
              type: getModelType(model),
              thinkingLevels:
                getModelType(model) === 'chat'
                  ? getSupportedThinkingLevels(
                      model as Parameters<typeof getSupportedThinkingLevels>[0],
                    )
                  : [],
            })),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    };
  }

  async assertMethod(providerId: string, method: string) {
    const provider = (await this.catalog()).providers.find(
      (entry) => entry.id === providerId,
    );
    const supported = provider?.methods.find((entry) => entry.type === method);
    if (!supported) return aiError('AI_UNSUPPORTED_METHOD');
    if (!supported.available) return aiError('AI_METHOD_UNAVAILABLE', 503);
    return provider!;
  }

  async selection(input: unknown): Promise<AiSelection | null> {
    if (input === null) return null;
    const value = objectInput(input);
    if (
      Object.keys(value).some(
        (key) =>
          ![
            'providerId',
            'authMethod',
            'modelType',
            'modelId',
            'thinkingLevel',
          ].includes(key),
      )
    )
      return aiError('AI_INVALID_INPUT');
    const providerId = boundedString(value.providerId, 64);
    const provider = (await this.catalog()).providers.find(
      (entry) => entry.id === providerId,
    );
    if (
      !provider ||
      !provider.methods.some((entry) => entry.type === value.authMethod)
    )
      return aiError('AI_UNSUPPORTED_METHOD');
    const model = provider.models.find(
      (entry) => entry.id === value.modelId && entry.type === value.modelType,
    );
    if (!model) return aiError('AI_UNSUPPORTED_MODEL');
    if (
      model.type === 'chat'
        ? !model.thinkingLevels.some((level) => level === value.thinkingLevel)
        : value.thinkingLevel !== null
    )
      return aiError('AI_UNSUPPORTED_THINKING');
    return {
      providerId,
      authMethod: value.authMethod as AiSelection['authMethod'],
      modelId: model.id,
      modelType: model.type,
      thinkingLevel: value.thinkingLevel as string | null,
    };
  }

  async keyCredential(
    providerId: string,
    input: unknown,
  ): Promise<ApiKeyCredential> {
    await this.assertMethod(providerId, 'api_key');
    const value = objectInput(input);
    const key = boundedString(value.apiKey, 8192);
    if (/^[!$]|\s/.test(key) || hasControlCharacters(key))
      return aiError('AI_INVALID_KEY');
    const fields = FIELDS[providerId] ?? [];
    const config = objectInput(value.config ?? {});
    if (
      Object.keys(config).some(
        (name) => !fields.some((field) => field.name === name),
      )
    )
      return aiError('AI_INVALID_CONFIGURATION');
    const env: Record<string, string> = {};
    for (const field of fields) {
      const content = config[field.name] || field.fallback;
      if (!content && !field.required) continue;
      if (
        typeof content !== 'string' ||
        content.length > 4096 ||
        !field.pattern.test(content)
      )
        return aiError('AI_INVALID_CONFIGURATION');
      env[field.env] = content;
    }
    return { type: 'api_key', key, ...(fields.length ? { env } : {}) };
  }
}
