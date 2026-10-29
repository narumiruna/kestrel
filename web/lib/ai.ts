export type AiAuthMethod = 'api_key' | 'oauth';
export type AiModelType = 'chat' | 'image' | 'classifier';
export type AiSelection = {
  authMethod: AiAuthMethod;
  providerId: string;
  modelId: string;
  modelType: AiModelType;
  thinkingLevel: string | null;
};
export type AiConnection = {
  providerId: string;
  authMethod: AiAuthMethod;
  generation: number;
  status: 'connected' | 'reconnect_required';
  refreshing?: boolean;
};
export type AiSettings = {
  generation: number;
  connectionGenerations: Record<string, number>;
  selection: AiSelection | null;
  connections: AiConnection[];
};
export type AiProvider = {
  id: string;
  name: string;
  methods: {
    type: AiAuthMethod;
    available: boolean;
    reason: 'policy' | 'hosted_unverified' | 'operator_unconfigured' | null;
  }[];
  fields: { name: string; required: boolean }[];
  models: {
    id: string;
    name: string;
    type: AiModelType;
    thinkingLevels: string[];
    imageInput?: boolean;
  }[];
};
export type AiCatalog = { version: string; providers: AiProvider[] };
export type AiAttempt = {
  id: string;
  providerId: string;
  status:
    | 'pending'
    | 'code_received'
    | 'processing'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'expired';
  expiresAt: string;
  authorizationUrl?: string;
  interaction?: {
    authorizationUrl?: string;
    instructions?: string;
    userCode?: string;
    message?: string;
    prompt?: {
      id: string;
      type: 'text' | 'secret' | 'manual_code' | 'select';
      message: string;
      placeholder?: string;
      options?: { id: string; label: string }[];
    };
  };
};

export function aiAuthorizationUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !host.includes('.') ||
      /\.(?:localhost|local|internal)$/.test(host) ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host.includes(':')
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function newerAiSettings(current: AiSettings | null, next: AiSettings): AiSettings {
  if (
    current &&
    (next.generation < current.generation ||
      Object.entries(current.connectionGenerations).some(
        ([id, generation]) => (next.connectionGenerations[id] ?? 0) < generation,
      ))
  )
    return current;
  return next;
}

export function aiModelKey(model: { id: string; type: AiModelType }): string {
  return `${model.type}:${model.id}`;
}

export function searchAiProviders(providers: AiProvider[], method: AiAuthMethod, query: string) {
  const search = query.trim().toLowerCase();
  return providers.filter(
    (provider) =>
      provider.methods.some((candidate) => candidate.type === method) &&
      `${provider.name} ${provider.id}`.toLowerCase().includes(search),
  );
}
