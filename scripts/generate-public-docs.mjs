import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const files = ['remote-control-api.md', 'device-session-security.md', 'android-qr-login-api.md'];
const args = process.argv.slice(2);

async function main() {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/generate-public-docs.mjs [--check]');
  }

  const check = args[0] === '--check';
  const failures = [];
  for (const name of files) {
    const source = `docs/${name}`;
    const output = `web/public/docs/${name}`;
    const notice = `<!-- Generated from ${source} by scripts/generate-public-docs.mjs. Do not edit. -->\n\n`;
    const expected = notice + (await readFile(new URL(source, root), 'utf8'));
    const target = new URL(output, root);

    if (check) {
      let actual;
      try {
        actual = await readFile(target, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (actual !== expected) {
        failures.push(`${output}: ${actual === undefined ? 'missing' : 'stale'}`);
      }
    } else {
      await mkdir(new URL('web/public/docs/', root), { recursive: true });
      await writeFile(target, expected, 'utf8');
      console.log(`Generated ${output}`);
    }
  }

  if (failures.length) {
    throw new Error(
      `${failures.join('\n')}\nRun node scripts/generate-public-docs.mjs from ${fileURLToPath(root)}`,
    );
  }
  if (check) console.log('Public docs are current.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
