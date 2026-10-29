import type { AuthResult } from '@earendil-works/pi-ai';

/** These controls also apply to SDKs that read files without the pi auth context. */
export const PROVIDER_WORKER_ENV = Object.freeze({
  HOME: '/dev/null/kestrel-no-home',
  USERPROFILE: '/dev/null/kestrel-no-home',
  XDG_CONFIG_HOME: '/dev/null/kestrel-no-home',
  CLOUDSDK_CONFIG: '/dev/null/kestrel-no-home',
  AWS_CONFIG_FILE: '/dev/null',
  AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
  AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'true',
  AWS_MAX_ATTEMPTS: '1',
  AWS_EC2_METADATA_DISABLED: 'true',
  GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
});

/** Keep saved provider fields, not arbitrary SDK credential, proxy, or file controls. */
export function isolatedProviderEnv(auth: AuthResult): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [
    'AZURE_OPENAI_RESOURCE_NAME',
    'AZURE_OPENAI_API_VERSION',
    'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_GATEWAY_ID',
  ]) {
    const value = auth.env?.[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, ...PROVIDER_WORKER_ENV };
}

export function bedrockEndpoint(auth: AuthResult): string {
  const region = auth.env?.AWS_REGION;
  if (!region || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
    throw new Error('RA_PROVIDER_FAILED');
  return `https://bedrock-runtime.${region}.amazonaws.com${region.startsWith('cn-') ? '.cn' : ''}`;
}

export function requireExplicitProviderKey(
  providerId: string,
  auth: AuthResult,
) {
  const key = auth.auth.apiKey?.trim();
  const explicitHeader = Object.entries(auth.auth.headers ?? {}).some(
    ([name, value]) =>
      ['authorization', 'cf-aig-authorization'].includes(name.toLowerCase()) &&
      typeof value === 'string' &&
      value.trim().length > 0,
  );
  if (
    providerId === 'google-vertex'
      ? !key || /^<[^>]*>$/.test(key) || key === 'gcp-vertex-credentials'
      : !key && !explicitHeader
  )
    throw new Error('RA_PROVIDER_FAILED');
}

const OUTPUT_FIELDS = new Set([
  'max_tokens',
  'max_completion_tokens',
  'max_output_tokens',
  'maxOutputTokens',
  'maxTokens',
]);
// Never interpret user content or tool schemas/arguments as provider controls.
const CONTENT_FIELDS = new Set([
  'tools',
  'toolConfig',
  'functions',
  'functionDeclarations',
  'parameters',
  'input_schema',
  'json_schema',
  'response_format',
  'responseSchema',
  'responseJsonSchema',
  'messages',
  'contents',
  'system',
  'systemInstruction',
  'input',
]);

/** Run on the final adapter payload: streamSimple can add a thinking budget. */
export function capProviderPayload(
  payload: unknown,
  remaining: number,
): unknown {
  const fail = (): never => {
    throw new Error('RA_LIMIT');
  };
  if (!Number.isSafeInteger(remaining) || remaining <= 0) fail();
  let capped = remaining;
  let found = false;
  const thinking: {
    object: Record<string, unknown>;
    field: string;
    legacy: boolean;
  }[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const object = value as Record<string, unknown>;
    for (const [field, item] of Object.entries(object)) {
      if (CONTENT_FIELDS.has(field)) continue;
      if (OUTPUT_FIELDS.has(field)) {
        if (
          typeof item !== 'number' ||
          !Number.isSafeInteger(item) ||
          item <= 0
        )
          fail();
        const tokens = Math.min(item as number, remaining);
        object[field] = tokens;
        capped = Math.min(capped, tokens);
        found = true;
      } else if (field === 'thinking' && item && typeof item === 'object') {
        const config = item as Record<string, unknown>;
        if (config.type === 'enabled')
          thinking.push({
            object: config,
            field: 'budget_tokens',
            legacy: true,
          });
      } else if (
        field === 'thinkingConfig' &&
        item &&
        typeof item === 'object'
      ) {
        const config = item as Record<string, unknown>;
        if ('thinkingBudget' in config)
          thinking.push({
            object: config,
            field: 'thinkingBudget',
            legacy: false,
          });
      } else visit(item);
    }
  };
  visit(payload);
  if (!found) fail();
  for (const { object, field, legacy } of thinking) {
    const budget = object[field];
    if (typeof budget !== 'number' || !Number.isSafeInteger(budget)) fail();
    // Google -1 means automatic thinking; maxOutputTokens still bounds its total.
    if (!legacy && (budget === -1 || budget === 0)) continue;
    const available = capped - 1024;
    if ((budget as number) <= 0 || available < (legacy ? 1024 : 1)) fail();
    object[field] = Math.min(budget as number, available);
  }
  return payload;
}
