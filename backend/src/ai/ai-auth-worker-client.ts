import type {
  AuthEvent,
  AuthPrompt,
  OAuthCredential,
  ProviderAuthInteraction,
} from '@earendil-works/pi-ai';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';

type Request =
  | { providerId: string; userId: string }
  | { providerId: string; credential: OAuthCredential };
type WorkerMessage =
  | { type: 'event'; event: AuthEvent }
  | { type: 'prompt'; id: string; prompt: AuthPrompt }
  | { type: 'prompt_cancel'; id: string }
  | { type: 'done'; credential: OAuthCredential }
  | { type: 'error' };

/** Select the runtime without inheriting watch/debug arguments or provider environment variables. */
export function aiAuthWorkerRuntime(clientFilename = __filename) {
  const source = clientFilename.endsWith('.ts');
  const directory = dirname(clientFilename);
  return {
    entry: source
      ? `require(${JSON.stringify(require.resolve('ts-node'))}).register({transpileOnly:true,project:${JSON.stringify(join(directory, '../../tsconfig.json'))}});require(${JSON.stringify(join(directory, 'ai-auth-worker.ts'))});`
      : join(directory, 'ai-auth-worker.js'),
    eval: source,
    resourceLimits: {
      maxOldGenerationSizeMb: source ? 256 : 128,
      maxYoungGenerationSizeMb: 16,
      stackSizeMb: 4,
    },
  };
}

/** Each login/refresh gets an empty environment. Provider modules cannot read host auth or endpoint overrides. */
export function runAiAuthWorker(
  request: Request,
  interaction: ProviderAuthInteraction,
): Promise<OAuthCredential> {
  interaction.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const runtime = aiAuthWorkerRuntime();
    const worker = new Worker(runtime.entry, {
      workerData: request,
      env: {},
      execArgv: [],
      stdout: true,
      stderr: true,
      eval: runtime.eval,
      resourceLimits: runtime.resourceLimits,
    });
    worker.stdout.resume();
    worker.stderr.resume();
    const prompts = new Map<string, AbortController>();
    let settled = false;
    const finish = (credential?: OAuthCredential) => {
      if (settled) return;
      settled = true;
      interaction.signal.removeEventListener('abort', abort);
      for (const controller of prompts.values()) controller.abort();
      void worker.terminate().catch(() => undefined);
      if (credential) resolve(credential);
      else reject(new Error('AI provider authentication failed'));
    };
    const abort = () => finish();
    interaction.signal.addEventListener('abort', abort, { once: true });
    if (interaction.signal.aborted) finish();
    worker.on('error', () => finish());
    worker.on('exit', () => finish());
    worker.on('message', (message: WorkerMessage) => {
      if (settled) return;
      if (message.type === 'done') finish(message.credential);
      else if (message.type === 'error') finish();
      else if (message.type === 'event') {
        try {
          interaction.notify(message.event);
        } catch {
          finish();
        }
      } else if (message.type === 'prompt_cancel') {
        prompts.get(message.id)?.abort();
        prompts.delete(message.id);
      } else if (message.type === 'prompt') {
        const controller = new AbortController();
        prompts.set(message.id, controller);
        void interaction
          .prompt({
            ...message.prompt,
            signal: AbortSignal.any([interaction.signal, controller.signal]),
          })
          .then((value) => {
            if (!settled && !controller.signal.aborted)
              worker.postMessage({ id: message.id, value });
          })
          .catch(() => {
            if (!controller.signal.aborted) finish();
          })
          .finally(() => prompts.delete(message.id));
      }
    });
  });
}

export const refreshWithPi = (
  providerId: string,
  credential: OAuthCredential,
  signal: AbortSignal,
) =>
  runAiAuthWorker(
    { providerId, credential },
    {
      signal,
      notify: () => {
        throw new Error('Unexpected refresh interaction');
      },
      prompt: () => Promise.reject(new Error('Unexpected refresh prompt')),
    },
  );
