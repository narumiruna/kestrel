import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { GET, generateStaticParams } from '../../app/maplibre/[asset]/route.ts';

const directory = dirname(
  createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'),
);

function requestAsset(asset: string) {
  return GET(new Request(`http://localhost/maplibre/${encodeURIComponent(asset)}`), {
    params: Promise.resolve({ asset }),
  });
}

test('pre-renders only the locked MapLibre worker and its sibling shared module', async () => {
  assert.deepEqual(generateStaticParams(), [
    { asset: 'maplibre-gl-worker.mjs' },
    { asset: 'maplibre-gl-shared.mjs' },
  ]);
  for (const { asset } of generateStaticParams()) {
    const response = await requestAsset(asset);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/javascript; charset=utf-8');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(join(directory, asset)),
    );
  }
});

test('asset requests fail closed for traversal, secrets, and unlisted module names', async () => {
  for (const asset of ['../package.json', '%2e%2e%2f.env', '.env', 'maplibre-gl.mjs', '']) {
    const response = await requestAsset(asset);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
  }
});
