import type { AuthPrompt, OAuthCredential } from '@earendil-works/pi-ai';
import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';
import {
  createAiLoginRunner,
  loadAiOAuthProvider,
  refreshKimiOnce,
} from './ai-pi-login';

const port = parentPort;
if (!port) throw new Error('AI authentication worker requires a parent');
const request = workerData as {
  providerId: string;
  userId?: string;
  credential?: OAuthCredential;
};
const controller = new AbortController();
const answers = new Map<string, (value: string) => void>();
port.on('message', (answer: { id: string; value: string }) => {
  answers.get(answer.id)?.(answer.value);
});
async function run() {
  if (request.credential) {
    if (request.providerId === 'kimi-coding')
      return refreshKimiOnce(request.credential, controller.signal);
    const oauth = await loadAiOAuthProvider(request.providerId);
    if (!oauth) throw new Error('Unsupported provider');
    return oauth.refresh(request.credential, controller.signal);
  }
  return createAiLoginRunner()(request.providerId, request.userId ?? '', {
    signal: controller.signal,
    notify: (event) => port!.postMessage({ type: 'event', event }),
    prompt: (prompt: AuthPrompt) =>
      new Promise<string>((resolve, reject) => {
        const id = randomUUID();
        const abort = () => {
          answers.delete(id);
          port!.postMessage({ type: 'prompt_cancel', id });
          reject(new Error('AI prompt cancelled'));
        };
        if (prompt.signal?.aborted) return abort();
        prompt.signal?.addEventListener('abort', abort, { once: true });
        answers.set(id, (value) => {
          answers.delete(id);
          prompt.signal?.removeEventListener('abort', abort);
          resolve(value);
        });
        const shown = { ...prompt };
        delete shown.signal;
        port!.postMessage({ type: 'prompt', id, prompt: shown });
      }),
  });
}
void run()
  .then((credential) => port.postMessage({ type: 'done', credential }))
  .catch(() => port.postMessage({ type: 'error' }));
