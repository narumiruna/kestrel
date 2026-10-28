import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./generate-public-docs.mjs', import.meta.url));
const files = ['remote-control-api.md', 'device-session-security.md', 'android-qr-login-api.md'];

function run(scriptPath, ...args) {
  // Run outside the project to verify that paths are relative to the script.
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

function succeeds(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kestrel-public-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'docs'));
  const scriptPath = join(root, 'scripts/generate-public-docs.mjs');
  await copyFile(script, scriptPath);
  for (const name of files) {
    await writeFile(join(root, 'docs', name), `# ${name}\n\nCanonical content.\n`);
  }
  return { root, scriptPath, output: join(root, 'web/public/docs') };
}

test('committed public docs match the canonical sources', () => {
  succeeds(run(script, '--check'));
});

test('generation copies all sources with a source notice and is deterministic', async (t) => {
  const { root, scriptPath, output } = await fixture(t);
  succeeds(run(scriptPath));
  assert.deepEqual((await readdir(output)).sort(), [...files].sort());

  const expected = [];
  for (const name of files) {
    const source = await readFile(join(root, 'docs', name), 'utf8');
    const content =
      `<!-- Generated from docs/${name} by scripts/generate-public-docs.mjs. Do not edit. -->\n\n` +
      source;
    assert.equal(await readFile(join(output, name), 'utf8'), content);
    expected.push(content);
  }

  succeeds(run(scriptPath));
  for (const [index, name] of files.entries()) {
    assert.equal(await readFile(join(output, name), 'utf8'), expected[index]);
  }

  const before = await Promise.all(files.map((name) => stat(join(output, name), { bigint: true })));
  succeeds(run(scriptPath, '--check'));
  const after = await Promise.all(files.map((name) => stat(join(output, name), { bigint: true })));
  assert.deepEqual(after.map((info) => info.mtimeNs), before.map((info) => info.mtimeNs));
});

for (const name of files) {
  test(`check rejects stale ${name} without changing it`, async (t) => {
    const { scriptPath, output } = await fixture(t);
    succeeds(run(scriptPath));
    await writeFile(join(output, name), 'Stale content.\n');

    const result = run(scriptPath, '--check');
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`web/public/docs/${name}: stale`));
    assert.match(result.stderr, /Run node scripts\/generate-public-docs\.mjs/);
    assert.equal(await readFile(join(output, name), 'utf8'), 'Stale content.\n');
  });

  test(`check rejects missing ${name} without creating it`, async (t) => {
    const { scriptPath, output } = await fixture(t);
    succeeds(run(scriptPath));
    await rm(join(output, name));

    const result = run(scriptPath, '--check');
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`web/public/docs/${name}: missing`));
    await assert.rejects(stat(join(output, name)), { code: 'ENOENT' });
  });
}

test('check reports all missing outputs without creating the output directory', async (t) => {
  const { scriptPath, output } = await fixture(t);
  const result = run(scriptPath, '--check');
  assert.equal(result.status, 1);
  for (const name of files) {
    assert.ok(result.stderr.includes(`web/public/docs/${name}: missing`));
  }
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('unsupported arguments fail without generating output', async (t) => {
  const { scriptPath, output } = await fixture(t);
  for (const args of [['--unknown'], ['--check', '--unknown'], ['--check', '--check']]) {
    const result = run(scriptPath, ...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
  await assert.rejects(stat(output), { code: 'ENOENT' });
});
