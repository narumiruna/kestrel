#!/usr/bin/env node

import { createHmac, randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const DEFAULT_BACKEND_URL = 'http://localhost:3300';
const DEFAULT_WEB_URL = 'http://localhost:3301';

const options = parseArgs(process.argv.slice(2));
const backendUrl = trimTrailingSlash(options.backendUrl ?? DEFAULT_BACKEND_URL);
const webUrl = trimTrailingSlash(options.webUrl ?? DEFAULT_WEB_URL);
const now = Date.now();
const username = `web-physical-smoke-${now}-${randomInt(1000, 9999)}`;
const password = `KestrelSmoke-${now}!`;

const { androidLogin, webLogin } = await createSmokeAccount(backendUrl, username, password);
const session = {
  accessToken: androidLogin.accessToken,
  accessTokenExpiresAt: Date.parse(androidLogin.accessTokenExpiresAt),
  refreshToken: androidLogin.refreshToken,
  sessionId: androidLogin.session.id,
  userId: androidLogin.user.id,
  username: androidLogin.user.username,
};
const webSession = {
  accessToken: webLogin.accessToken,
  accessTokenExpiresAt: webLogin.accessTokenExpiresAt,
  refreshToken: webLogin.refreshToken,
  user: webLogin.user,
};
const place = await post(backendUrl, '/places', {
  body: {
    description: 'Web physical smoke',
    latitude: 25.033,
    longitude: 121.5654,
    name: 'Physical smoke place',
    tags: ['smoke'],
  },
  token: webLogin.accessToken,
});
const route = await post(backendUrl, '/routes', {
  body: {
    defaultSpeedKmh: 5,
    description: 'Web physical smoke',
    isPublic: false,
    mode: 'LOOP',
    name: 'Physical smoke route',
    waypoints: [
      { latitude: 25.033, longitude: 121.5654 },
      { latitude: 25.0333, longitude: 121.5657 },
    ],
  },
  token: webLogin.accessToken,
});

const output = {
  android: {
    baseUrl: 'http://127.0.0.1:3300',
    sessionBase64: Buffer.from(JSON.stringify(session), 'utf8').toString('base64'),
  },
  backendUrl,
  placeId: place.id,
  routeId: route.id,
  username,
  web: {
    localStorageKey: 'kestrel.web.session',
    localStorageValue: JSON.stringify(webSession),
    url: `${webUrl}/dashboard/places`,
  },
};

if (options.out == null) {
  console.log(JSON.stringify(output, null, 2));
} else {
  writeFileSync(options.out, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        out: options.out,
        placeId: place.id,
        routeId: route.id,
        username,
      },
      null,
      2,
    ),
  );
}

async function createSmokeAccount(baseUrl, username, password) {
  await post(baseUrl, '/auth/register', {
    body: {
      password,
      username,
    },
  });
  const setup = await post(baseUrl, '/auth/totp/setup', {
    body: {
      password,
      username,
    },
  });
  await post(baseUrl, '/auth/totp/verify', {
    body: {
      code: totp(setup.secret),
      password,
      username,
    },
  });

  return {
    androidLogin: await loginSmokeAccount(baseUrl, username, password, setup.secret),
    webLogin: await loginSmokeAccount(baseUrl, username, password, setup.secret),
  };
}

async function loginSmokeAccount(baseUrl, username, password, secret) {
  return post(baseUrl, '/auth/login', {
    body: {
      password,
      totpCode: totp(secret),
      username,
    },
  });
}

async function post(baseUrl, path, { body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: body == null ? undefined : JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
      ...(token == null ? {} : { Authorization: `Bearer ${token}` }),
    },
    method: 'POST',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}: ${text}`);
  }
  return text.length === 0 ? null : JSON.parse(text);
}

function totp(secret) {
  const counter = Math.floor(Date.now() / 30_000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', base32Decode(secret)).update(counterBytes).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error(`Invalid base32 character: ${character}`);
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--backend-url') {
      parsed.backendUrl = requireValue(args, (index += 1), arg);
    } else if (arg === '--web-url') {
      parsed.webUrl = requireValue(args, (index += 1), arg);
    } else if (arg === '--out') {
      parsed.out = requireValue(args, (index += 1), arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value == null || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
