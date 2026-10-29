import { parentPort, workerData } from 'node:worker_threads';
import type { AuthResult } from '@earendil-works/pi-ai';
import type { AiSelection } from '../ai/ai-catalog';
import { runVisualAgent } from './route-assistant.agent';
import type { AssistantRunInput } from './route-assistant.models';

const port = parentPort;
if (!port) throw new Error('RA_PROVIDER_FAILED');
const request = workerData as {
  input: AssistantRunInput;
  selection: AiSelection;
  auth: AuthResult;
};
const controller = new AbortController();
port.on('message', () => controller.abort());
void runVisualAgent(
  request.input,
  request.selection,
  request.auth,
  controller.signal,
  (event) => port.postMessage({ type: 'event', event }),
)
  .then(() => port.postMessage({ type: 'done' }))
  .catch((error: unknown) => {
    const code =
      error instanceof Error &&
      (error.message === 'RA_LIMIT' || error.message === 'RA_MODEL_UNSUPPORTED')
        ? error.message
        : 'RA_PROVIDER_FAILED';
    port.postMessage({ type: 'error', code });
  })
  .finally(() => {
    // Drop workerData references before the parent terminates this worker.
    request.input = undefined as unknown as AssistantRunInput;
    request.auth = undefined as unknown as AuthResult;
    port.close();
  });
