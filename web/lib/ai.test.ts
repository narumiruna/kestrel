import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type AiProvider,
  type AiSettings,
  aiModelKey,
  newerAiSettings,
  searchAiProviders,
} from './ai.ts';

const providers: AiProvider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    methods: [
      { type: 'api_key', available: true, reason: null },
      { type: 'oauth', available: true, reason: null },
    ],
    fields: [],
    models: [],
  },
  {
    id: 'minimax-cn',
    name: 'MiniMax CN',
    methods: [{ type: 'api_key', available: true, reason: null }],
    fields: [],
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    methods: [{ type: 'oauth', available: false, reason: 'policy' }],
    fields: [],
    models: [],
  },
];

test('provider search filters by method, matches names and IDs, and preserves unavailable providers', () => {
  assert.deepEqual(
    searchAiProviders(providers, 'api_key', ' MINImax-cn ').map(({ id }) => id),
    ['minimax-cn'],
  );
  assert.deepEqual(
    searchAiProviders(providers, 'oauth', '').map(({ id }) => id),
    ['openrouter', 'anthropic'],
  );
  assert.equal(searchAiProviders(providers, 'oauth', 'MiniMax').length, 0);
  assert.equal(searchAiProviders(providers, 'api_key', 'not present').length, 0);
  assert.equal(searchAiProviders(providers, 'oauth', 'ANTHROPIC')[0].methods[0].reason, 'policy');
});

test('model identity keeps operation types distinct, including identical provider model IDs', () => {
  assert.notEqual(
    aiModelKey({ id: 'same', type: 'chat' }),
    aiModelKey({ id: 'same', type: 'image' }),
  );
  assert.notEqual(
    aiModelKey({ id: 'same', type: 'image' }),
    aiModelKey({ id: 'same', type: 'classifier' }),
  );
});

test('late settings responses cannot restore a disconnected connection or older defaults', () => {
  const current: AiSettings = {
    generation: 2,
    selection: null,
    connections: [],
    connectionGenerations: { openrouter: 4 },
  };
  const staleConnection = { ...current, connectionGenerations: { openrouter: 3 } };
  assert.equal(newerAiSettings(current, staleConnection), current);
  assert.equal(newerAiSettings(current, { ...current, generation: 1 }), current);
  assert.equal(newerAiSettings(current, { ...current, connectionGenerations: {} }), current);
  const fresh = { ...current, generation: 3 };
  assert.equal(newerAiSettings(current, fresh), fresh);
  assert.equal(newerAiSettings(null, fresh), fresh);
});
