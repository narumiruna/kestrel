import type {
  AuthPrompt,
  OAuthAuth,
  ProviderAuthInteraction,
} from '@earendil-works/pi-ai';
import { createHash } from 'node:crypto';
import { Server } from 'node:net';
import {
  createAiLoginRunner,
  loginWithPi,
  refreshKimiOnce,
} from './ai-pi-login';

const USER = '12345678-1234-1234-1234-123456789abc';
const credential = {
  type: 'oauth' as const,
  access: 'access',
  refresh: 'refresh',
  expires: 123,
};
const token = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  id_token: 'discard-me',
  scope: 'openid chatgpt.tokens.use.direct',
};
function interaction(): Omit<ProviderAuthInteraction, 'prompt'> & {
  prompt: jest.Mock<Promise<string>, [AuthPrompt]>;
} {
  return {
    signal: new AbortController().signal,
    notify: jest.fn(),
    prompt: jest.fn<Promise<string>, [AuthPrompt]>(),
  };
}
function setup(
  mutate: (url: URL) => void = () => undefined,
  data: unknown = token,
) {
  const ui = interaction();
  let authorization: URL;
  ui.notify = jest.fn((event) => {
    if (event.type === 'auth_url') authorization = new URL(event.url);
  });
  ui.prompt = jest.fn(() => {
    const callback = new URL('http://127.0.0.1:1455/auth/callback');
    callback.search = new URLSearchParams({
      state: authorization.searchParams.get('state')!,
      code: 'code',
      client_id: 'issued-client',
    }).toString();
    mutate(callback);
    return Promise.resolve(callback.href);
  });
  const transport = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response(JSON.stringify(data)));
  const load = jest.fn<Promise<OAuthAuth | undefined>, [string]>();
  return {
    ui,
    transport,
    load,
    run: createAiLoginRunner(load, transport),
    authorization: () => authorization,
  };
}

describe('pi headless login', () => {
  it('exports the default runner', () =>
    expect(typeof loginWithPi).toBe('function'));

  it.each([
    ['anthropic', 'copy_code'],
    ['openai-codex', 'device_code'],
    ['radius', 'device-code'],
  ])('selects the headless method for %s', async (id, method) => {
    const ui = interaction();
    const login: OAuthAuth['login'] = jest.fn(async (wrapped, options) => {
      expect(
        await wrapped.prompt({
          type: 'select',
          message: 'Method',
          options: [
            { id: 'browser', label: 'Browser' },
            { id: method, label: 'Headless' },
          ],
        }),
      ).toBe(method);
      expect(options?.agentName).toBe('Kestrel');
      expect(options?.getDeviceId?.()).toBe(USER);
      return credential;
    });
    const load = jest.fn().mockResolvedValue({ login });
    expect(await createAiLoginRunner(load)(id, USER, ui)).toEqual(credential);
    expect(ui.prompt).not.toHaveBeenCalled();
  });

  it.each(['anthropic', 'openai-codex', 'radius'])(
    'never falls back to a loopback method for %s',
    async (id) => {
      const ui = interaction();
      const login: OAuthAuth['login'] = async (wrapped) => {
        await wrapped.prompt({
          type: 'select',
          message: 'Method',
          options: [{ id: 'browser', label: 'Browser' }],
        });
        return credential;
      };
      const run = createAiLoginRunner(() =>
        Promise.resolve({ login } as OAuthAuth),
      );
      await expect(run(id, USER, ui)).rejects.toThrow(
        'AI provider login failed',
      );
      expect(ui.prompt).not.toHaveBeenCalled();
    },
  );

  it('forces public GitHub and passes other prompts through without a verification gate', async () => {
    const ui = interaction();
    ui.prompt = jest
      .fn<Promise<string>, [AuthPrompt]>()
      .mockResolvedValue('answer');
    const login: OAuthAuth['login'] = async (wrapped) => {
      expect(
        await wrapped.prompt({
          type: 'text',
          message: 'GitHub Enterprise URL/domain (blank for github.com)',
        }),
      ).toBe('');
      expect(
        await wrapped.prompt({ type: 'manual_code', message: 'Other' }),
      ).toBe('answer');
      return credential;
    };
    expect(
      await createAiLoginRunner(() => Promise.resolve({ login } as OAuthAuth))(
        'github-copilot',
        USER,
        ui,
      ),
    ).toEqual(credential);
    expect(ui.prompt).toHaveBeenCalledTimes(1);
  });

  it('uses OpenAI state, nonce, issued client, PKCE and no listener', async () => {
    const listen = jest
      .spyOn(Server.prototype, 'listen')
      .mockImplementation(() => {
        throw new Error('No listener allowed');
      });
    try {
      const s = setup();
      const result = await s.run('openai', USER, s.ui);
      expect(result).toMatchObject({
        ...credential,
        expires: result.expires,
        clientId: 'issued-client',
      });
      expect(result).not.toHaveProperty('id_token');
      const url = s.authorization();
      expect(url.origin + url.pathname).toBe(
        'https://auth.openai.com/api/accounts/authorize',
      );
      expect(url.searchParams.get('agent_name_hint')).toBe('Kestrel');
      expect(url.searchParams.get('ext_agent_host_id')).toBe(
        `urn:uuid:${USER}`,
      );
      expect(url.searchParams.get('nonce')).toMatch(/^[\w-]{43}$/);
      expect(url.searchParams.get('state')).not.toBe(
        url.searchParams.get('nonce'),
      );
      expect(s.transport).toHaveBeenCalledTimes(1);
      const [endpoint, request] = s.transport.mock.calls[0];
      expect(endpoint).toBe('https://auth.openai.com/api/accounts/oauth/token');
      const body = request!.body as URLSearchParams;
      expect(body.get('client_id')).toBe('issued-client');
      expect(body.get('redirect_uri')).toBe(
        'http://127.0.0.1:1455/auth/callback',
      );
      expect(
        createHash('sha256')
          .update(body.get('code_verifier')!)
          .digest('base64url'),
      ).toBe(url.searchParams.get('code_challenge'));
      expect(s.load).not.toHaveBeenCalled();
      expect(listen).not.toHaveBeenCalled();
    } finally {
      listen.mockRestore();
    }
  });

  it.each([
    (url: URL) => url.searchParams.set('state', 'wrong'),
    (url: URL) => url.searchParams.delete('client_id'),
    (url: URL) => url.searchParams.delete('code'),
    (url: URL) => {
      url.hostname = 'localhost';
    },
    (url: URL) => {
      url.port = '1456';
    },
    (url: URL) => {
      url.pathname = '/other';
    },
    (url: URL) => {
      url.protocol = 'https:';
    },
    (url: URL) => {
      url.username = 'secret';
    },
    (url: URL) => url.searchParams.append('state', 'duplicate'),
    (url: URL) => url.searchParams.set('error', 'secret'),
  ])('rejects invalid callbacks without exchange %#', async (mutate) => {
    const s = setup(mutate);
    await expect(s.run('openai', USER, s.ui)).rejects.toThrow(
      'AI provider login failed',
    );
    expect(s.transport).not.toHaveBeenCalled();
  });

  it.each(['id_token', 'access_token', 'refresh_token', 'scope', 'expires_in'])(
    'requires OpenAI %s',
    async (field) => {
      const data = { ...token };
      delete data[field as keyof typeof token];
      const s = setup(undefined, data);
      await expect(s.run('openai', USER, s.ui)).rejects.toThrow(
        'AI provider login failed',
      );
      expect(s.transport).toHaveBeenCalledTimes(1);
    },
  );

  it('requires direct scope and bounds response size', async () => {
    for (const data of [
      { ...token, scope: 'openid' },
      { ...token, id_token: 'x'.repeat(70_000) },
    ]) {
      const s = setup(undefined, data);
      await expect(s.run('openai', USER, s.ui)).rejects.toThrow(
        'AI provider login failed',
      );
    }
  });

  it('uses headless OpenRouter PKCE with no callback URL', async () => {
    const s = setup(undefined, { key: 'key' });
    s.ui.prompt = jest
      .fn<Promise<string>, [AuthPrompt]>()
      .mockResolvedValue('manual-code');
    expect(await s.run('openrouter', USER, s.ui)).toEqual({
      type: 'oauth',
      access: 'key',
      refresh: '',
      expires: Number.MAX_SAFE_INTEGER,
    });
    expect(s.authorization().searchParams.has('callback_url')).toBe(false);
    expect(s.transport).toHaveBeenCalledTimes(1);
    const [url, request] = s.transport.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/auth/keys');
    const body = JSON.parse(request!.body as string) as {
      code: string;
      code_verifier: string;
    };
    expect(body.code).toBe('manual-code');
    expect(
      createHash('sha256').update(body.code_verifier).digest('base64url'),
    ).toBe(s.authorization().searchParams.get('code_challenge'));
  });

  it('handles abort before login and after manual input without exchange', async () => {
    for (const before of [true, false]) {
      const s = setup();
      const controller = new AbortController();
      s.ui.signal = controller.signal;
      if (before) controller.abort('secret');
      else
        s.ui.prompt = jest.fn(() => {
          controller.abort('secret');
          return Promise.resolve('secret');
        });
      await expect(s.run('openai', USER, s.ui)).rejects.toThrow(
        'AI provider login cancelled',
      );
      expect(s.transport).not.toHaveBeenCalled();
    }
  });

  it('does not expose raw provider or transport errors', async () => {
    const s = setup();
    s.transport.mockRejectedValue(new Error('secret response'));
    await expect(s.run('openai', USER, s.ui)).rejects.toThrow(
      /^AI provider login failed$/,
    );
    const run = createAiLoginRunner(() =>
      Promise.reject(new Error('secret provider')),
    );
    await expect(run('anything', USER, interaction())).rejects.toThrow(
      /^AI provider login failed$/,
    );
  });
  it.each(['lost-response', 'server-error'] as const)(
    'never retries a Kimi rotating refresh after %s',
    async (kind) => {
      const transport = jest.fn<
        ReturnType<typeof fetch>,
        Parameters<typeof fetch>
      >();
      if (kind === 'lost-response')
        transport.mockRejectedValue(new Error('dummy-lost-response'));
      else transport.mockResolvedValue(new Response('{}', { status: 503 }));
      await expect(
        refreshKimiOnce(credential, new AbortController().signal, transport),
      ).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0][0]).toBe(
        'https://auth.kimi.com/api/oauth/token',
      );
    },
  );

  it('preserves the Kimi successor tokens from a single refresh response', async () => {
    const transport = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(JSON.stringify(token)));
    await expect(
      refreshKimiOnce(credential, new AbortController().signal, transport),
    ).resolves.toMatchObject({
      type: 'oauth',
      access: 'access',
      refresh: 'refresh',
      expires: expect.any(Number) as unknown,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
