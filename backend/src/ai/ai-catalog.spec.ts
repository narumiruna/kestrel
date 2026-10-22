import { AiCatalogService, type piRegistry } from './ai-catalog';
import { AiSecretBox } from './ai-secret-box';

const providers = [
  { id: 'openrouter', name: 'OpenRouter', auth: { apiKey: true, oauth: true } },
  { id: 'anthropic', name: 'Anthropic', auth: { apiKey: true, oauth: true } },
  { id: 'azure', name: 'Azure', auth: { apiKey: true } },
  { id: 'qwen-token-plan', name: 'Qwen', auth: { apiKey: true } },
  { id: 'other', name: 'Other', auth: { oauth: true } },
];
const models = [
  { id: 'chat', name: 'Chat', type: 'chat' },
  { id: 'image', name: 'Image', type: 'image' },
  { id: 'classifier', name: 'Classifier', type: 'classifier' },
];

describe('AiCatalogService', () => {
  let service: AiCatalogService;
  let available: jest.Mock;
  let get: jest.Mock;
  let getAllModels: jest.Mock;
  const resolveCredential = jest.fn(() => {
    throw new Error('Credential resolution is forbidden');
  });

  beforeEach(() => {
    available = jest.fn(() => true);
    get = jest.fn((name: string) =>
      name === 'KESTREL_PUBLIC_URL'
        ? 'https://kestrel.example'
        : 'operator-secret',
    );
    getAllModels = jest.fn(() => models);
    const registryLoader = () =>
      Promise.resolve({
        models: {
          getProviders: () => providers,
          getAllModels,
          resolveCredential,
        },
        getModelType: (model: { type: string }) => model.type,
        getSupportedThinkingLevels: () => ['off', 'high'],
      } as unknown as Awaited<ReturnType<typeof piRegistry>>);
    service = new AiCatalogService(
      { get },
      { available } as unknown as AiSecretBox,
      registryLoader,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('lists only provider-scoped metadata without credentials or operator configuration', async () => {
    const result = await service.catalog();
    expect(getAllModels.mock.calls).toEqual(providers.map(({ id }) => [id]));
    expect(resolveCredential).not.toHaveBeenCalled();
    expect(
      get.mock.calls.every(([name]) => name === 'KESTREL_PUBLIC_URL'),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /operator-secret|resolveCredential|apiKey|AZURE_OPENAI/,
    );
    expect(
      result.providers.find(({ id }) => id === 'azure')?.fields,
    ).toContainEqual({ name: 'resourceName', required: true });
    expect(result.providers[0].models).toEqual([
      {
        id: 'chat',
        name: 'Chat',
        type: 'chat',
        thinkingLevels: ['off', 'high'],
      },
      { id: 'image', name: 'Image', type: 'image', thinkingLevels: [] },
      {
        id: 'classifier',
        name: 'Classifier',
        type: 'classifier',
        thinkingLevels: [],
      },
    ]);
  });

  it.each([
    ['anthropic', 'oauth'],
    ['other', 'oauth'],
    ['qwen-token-plan', 'api_key'],
  ])(
    'allows every registry method without verification gates %s/%s',
    async (provider, method) => {
      await expect(
        service.assertMethod(provider, method),
      ).resolves.toMatchObject({ id: provider });
      await expect(
        service.keyCredential('qwen-token-plan', { apiKey: 'key' }),
      ).resolves.toMatchObject({ type: 'api_key', key: 'key' });
    },
  );

  it('requires encryption but permits OAuth without a public callback origin', async () => {
    available.mockReturnValue(false);
    await expect(service.assertMethod('openrouter', 'api_key')).rejects.toThrow(
      'AI_METHOD_UNAVAILABLE',
    );
    await expect(service.assertMethod('openrouter', 'oauth')).rejects.toThrow(
      'AI_METHOD_UNAVAILABLE',
    );
    available.mockReturnValue(true);
    get.mockReturnValue('http://kestrel.example');
    await expect(
      service.assertMethod('openrouter', 'oauth'),
    ).resolves.toMatchObject({ id: 'openrouter' });
  });

  it.each([
    ['missing', 'api_key'],
    ['openrouter', 'shell'],
    ['azure', 'oauth'],
  ])('rejects unknown provider/method %s/%s', async (provider, method) => {
    await expect(service.assertMethod(provider, method)).rejects.toThrow(
      'AI_UNSUPPORTED_METHOD',
    );
  });

  const selection = {
    providerId: 'openrouter',
    authMethod: 'api_key',
    modelId: 'chat',
    modelType: 'chat',
    thinkingLevel: 'high',
  };
  it('accepts validated selections and clearing', async () => {
    await expect(service.selection(selection)).resolves.toEqual(selection);
    await expect(service.selection(null)).resolves.toBeNull();
    await expect(
      service.selection({
        ...selection,
        modelId: 'image',
        modelType: 'image',
        thinkingLevel: null,
      }),
    ).resolves.toMatchObject({ thinkingLevel: null });
  });

  it.each([
    [{ providerId: 'missing' }, 'AI_UNSUPPORTED_METHOD'],
    [{ authMethod: 'command' }, 'AI_UNSUPPORTED_METHOD'],
    [{ modelType: 'audio' }, 'AI_UNSUPPORTED_MODEL'],
    [{ modelId: 'missing' }, 'AI_UNSUPPORTED_MODEL'],
    [{ thinkingLevel: 'invalid' }, 'AI_UNSUPPORTED_THINKING'],
    [
      { modelId: 'image', modelType: 'image', thinkingLevel: 'high' },
      'AI_UNSUPPORTED_THINKING',
    ],
    [{ command: 'echo secret' }, 'AI_INVALID_INPUT'],
    [{ providerId: 'x'.repeat(65) }, 'AI_INVALID_INPUT'],
  ])('rejects invalid selection %j', async (patch, error) => {
    await expect(service.selection({ ...selection, ...patch })).rejects.toThrow(
      error,
    );
  });

  it('returns a literal key and allowlisted provider configuration only', async () => {
    await expect(
      service.keyCredential('azure', {
        apiKey: 'literal-key',
        config: { resourceName: 'my-resource' },
      }),
    ).resolves.toEqual({
      type: 'api_key',
      key: 'literal-key',
      env: {
        AZURE_OPENAI_RESOURCE_NAME: 'my-resource',
        AZURE_OPENAI_API_VERSION: 'v1',
      },
    });
  });

  it.each([
    '',
    'x'.repeat(8193),
    '!echo',
    '$TOKEN',
    '$(echo key)',
    'key\nvalue',
    'key value',
    'key\u0000',
  ])('rejects invalid or executable key %j', async (apiKey) => {
    await expect(
      service.keyCredential('openrouter', { apiKey }),
    ).rejects.toThrow(/AI_INVALID_(INPUT|KEY)/);
  });

  it.each([
    { command: 'echo key' },
    { shell: 'sh' },
    { file: '/tmp/key' },
    { url: 'https://example.com' },
    { resourceName: 'https://example.com' },
    { resourceName: '/tmp/key' },
    { resourceName: '$(echo key)' },
    { resourceName: 'x'.repeat(4097) },
    { resourceName: 'valid', apiVersion: '!command' },
  ])('rejects non-allowlisted or unsafe configuration %j', async (config) => {
    await expect(
      service.keyCredential('azure', { apiKey: 'literal-key', config }),
    ).rejects.toThrow('AI_INVALID_CONFIGURATION');
  });

  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com/?q=x',
    'https://example.com/#fragment',
    'file:///tmp/key',
    'not a URL',
    '',
  ])('rejects non-origin operator URL %j', (origin) => {
    get.mockReturnValue(origin);
    expect(service.publicOrigin()).toBeNull();
  });

  it('normalizes a valid HTTPS operator origin', () => {
    get.mockReturnValue('https://EXAMPLE.com:443/');
    expect(service.publicOrigin()).toBe('https://example.com');
  });
});
