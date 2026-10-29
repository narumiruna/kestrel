import type { AuthResult } from '@earendil-works/pi-ai';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { AiSelection } from '../ai/ai-catalog';
import {
  AssistantEvent,
  AssistantRunInput,
  ROUTE_ASSISTANT_LIMITS as L,
} from './route-assistant.models';

import { PROVIDER_WORKER_ENV } from './route-assistant.provider-limits';

export function assistantWorkerRuntime(clientFilename = __filename) {
  const source = clientFilename.endsWith('.ts');
  const directory = dirname(clientFilename);
  return {
    entry: source
      ? `require(${JSON.stringify(require.resolve('ts-node'))}).register({transpileOnly:true,project:${JSON.stringify(join(directory, '../../tsconfig.json'))}});require(${JSON.stringify(join(directory, 'route-assistant.worker.ts'))});`
      : join(directory, 'route-assistant.worker.js'),
    eval: source,
    resourceLimits: {
      maxOldGenerationSizeMb: source ? 256 : 128,
      maxYoungGenerationSizeMb: 16,
      stackSizeMb: 4,
    },
  };
}

/** Only resolved user auth crosses this short-lived worker boundary; SDK file controls are fixed. */
export function runAssistantWorker(
  input: AssistantRunInput,
  selection: AiSelection,
  auth: AuthResult,
  signal: AbortSignal,
  emit: (event: AssistantEvent) => void,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const runtime = assistantWorkerRuntime();
    const worker = new Worker(runtime.entry, {
      workerData: { input, selection, auth },
      env: { ...PROVIDER_WORKER_ENV },
      execArgv: [],
      stdout: true,
      stderr: true,
      eval: runtime.eval,
      resourceLimits: runtime.resourceLimits,
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (code?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      void worker.terminate().catch(() => undefined);
      if (code) reject(new Error(code));
      else resolve();
    };
    const abort = () => finish('RA_PROVIDER_FAILED');
    const timer = setTimeout(() => finish('RA_LIMIT'), L.runMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    worker.on('error', () => finish('RA_PROVIDER_FAILED'));
    worker.on('exit', () => finish('RA_PROVIDER_FAILED'));
    worker.on(
      'message',
      (message: { type: string; event?: AssistantEvent; code?: string }) => {
        if (settled) return;
        if (message.type === 'done') finish();
        else if (message.type === 'error')
          finish(
            message.code === 'RA_LIMIT'
              ? 'RA_LIMIT'
              : message.code === 'RA_MODEL_UNSUPPORTED'
                ? 'RA_MODEL_UNSUPPORTED'
                : 'RA_PROVIDER_FAILED',
          );
        else if (message.type === 'event' && message.event) {
          try {
            emit(message.event);
          } catch {
            finish('RA_PROVIDER_FAILED');
          }
        }
      },
    );
  });
}
