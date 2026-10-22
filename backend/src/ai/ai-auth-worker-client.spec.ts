import type {
  AuthPrompt,
  ProviderAuthInteraction,
} from '@earendil-works/pi-ai';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import {
  aiAuthWorkerRuntime,
  refreshWithPi,
  runAiAuthWorker,
} from './ai-auth-worker-client';

jest.mock('node:worker_threads', () => ({ Worker: jest.fn() }));
const createWorker = jest.mocked(Worker);
const credential = {
  type: 'oauth' as const,
  access: 'dummy-access',
  refresh: 'dummy-refresh',
  expires: 12345,
};
class TestWorker extends EventEmitter {
  stdout = { resume: jest.fn() };
  stderr = { resume: jest.fn() };
  terminate = jest.fn(() => Promise.resolve(0));
  postMessage = jest.fn<void, [unknown]>();
}
function setup() {
  const worker = new TestWorker();
  createWorker.mockImplementation(() => worker as unknown as Worker);
  const controller = new AbortController();
  const notify = jest.fn();
  const ui: ProviderAuthInteraction = {
    signal: controller.signal,
    notify,
    prompt: jest.fn(() => Promise.resolve('answer')),
  };
  return {
    worker,
    controller,
    ui,
    notify,
    start: () => runAiAuthWorker({ providerId: 'openai', userId: 'owner' }, ui),
  };
}
beforeEach(() => jest.clearAllMocks());

it('starts an isolated bounded worker without parent environment or inherited arguments', async () => {
  const h = setup();
  const result = h.start();
  expect(createWorker).toHaveBeenCalledWith(
    expect.stringContaining('ai-auth-worker.ts'),
    {
      workerData: { providerId: 'openai', userId: 'owner' },
      env: {},
      execArgv: [],
      stdout: true,
      stderr: true,
      eval: true,
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    },
  );
  h.worker.emit('message', { type: 'done', credential });
  await expect(result).resolves.toEqual(credential);
  expect(h.worker.stdout.resume).toHaveBeenCalledTimes(1);
  expect(h.worker.stderr.resume).toHaveBeenCalledTimes(1);
  expect(h.worker.terminate).toHaveBeenCalledTimes(1);
});

it('selects a compiled entry without a TypeScript bootstrap', () => {
  const runtime = aiAuthWorkerRuntime(
    join(__dirname, '../../dist/ai/ai-auth-worker-client.js'),
  );
  expect(runtime.entry).toBe(
    join(__dirname, '../../dist/ai/ai-auth-worker.js'),
  );
  expect(runtime.eval).toBe(false);
  expect(runtime.resourceLimits.maxOldGenerationSizeMb).toBe(128);
  expect(runtime.entry).not.toContain('ts-node');
});

it('selects an explicit source project without parent process arguments', () => {
  const runtime = aiAuthWorkerRuntime();
  expect(runtime.eval).toBe(true);
  expect(runtime.entry).toContain('transpileOnly:true');
  expect(runtime.entry).toContain(join(__dirname, '../../tsconfig.json'));
  expect(runtime.entry).toContain(join(__dirname, 'ai-auth-worker.ts'));
});

it('relays prompt answers and provider events without logging secrets', async () => {
  const h = setup();
  const result = h.start();
  const event = {
    type: 'device_code',
    userCode: 'ABCD',
    verificationUri: 'https://provider.example/device',
  };
  h.worker.emit('message', { type: 'event', event });
  expect(h.notify).toHaveBeenCalledWith(event);
  h.worker.emit('message', {
    type: 'prompt',
    id: 'prompt',
    prompt: { type: 'manual_code', message: 'Code' },
  });
  await Promise.resolve();
  expect(h.worker.postMessage).toHaveBeenCalledWith({
    id: 'prompt',
    value: 'answer',
  });
  h.worker.emit('message', { type: 'done', credential });
  await expect(result).resolves.toEqual(credential);
});

it('cancels a prompt without relaying a late answer to another step', async () => {
  const h = setup();
  let answer!: (value: string) => void;
  let promptSignal: AbortSignal | undefined;
  h.ui.prompt = (prompt: AuthPrompt) => {
    promptSignal = prompt.signal;
    return new Promise((resolve) => {
      answer = resolve;
    });
  };
  const result = h.start();
  h.worker.emit('message', {
    type: 'prompt',
    id: 'prompt',
    prompt: { type: 'manual_code', message: 'Code' },
  });
  h.worker.emit('message', { type: 'prompt_cancel', id: 'prompt' });
  expect(promptSignal?.aborted).toBe(true);
  answer('late-secret');
  await Promise.resolve();
  expect(h.worker.postMessage).not.toHaveBeenCalled();
  h.worker.emit('message', { type: 'done', credential });
  await expect(result).resolves.toEqual(credential);
});

it.each(['error', 'exit', 'reported-error', 'abort'] as const)(
  'fails safely on %s and ignores late completion',
  async (kind) => {
    const h = setup();
    const result = h.start();
    if (kind === 'error')
      h.worker.emit('error', new Error('secret raw provider error'));
    if (kind === 'exit') h.worker.emit('exit', 1);
    if (kind === 'reported-error') h.worker.emit('message', { type: 'error' });
    if (kind === 'abort') h.controller.abort('secret abort reason');
    h.worker.emit('message', { type: 'done', credential });
    await expect(result).rejects.toThrow(/^AI provider authentication failed$/);
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
  },
);

it('does not start a worker for an already cancelled request', () => {
  const h = setup();
  h.controller.abort();
  expect(h.start).toThrow();
  expect(createWorker).not.toHaveBeenCalled();
});

it('uses the same isolated path for refresh and rejects unexpected interaction', async () => {
  const h = setup();
  const result = refreshWithPi('kimi-coding', credential, h.controller.signal);
  expect(createWorker.mock.calls[0][1]?.workerData).toEqual({
    providerId: 'kimi-coding',
    credential,
  });
  h.worker.emit('message', {
    type: 'event',
    event: { type: 'progress', message: 'secret' },
  });
  await expect(result).rejects.toThrow(/^AI provider authentication failed$/);
});
