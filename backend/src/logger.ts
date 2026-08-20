import pino from 'pino';

export type Logger = pino.Logger;

const DEFAULT_LEVEL = 'info';

/**
 * Defence in depth: request and audit logs are built from allowlisted fields,
 * so these paths should never appear. Censor them if a future call site slips.
 */
const REDACTED_PATHS = [
  'accessToken',
  'authorization',
  'currentPassword',
  'newPassword',
  'password',
  'recoveryCode',
  'refreshToken',
  'totpCode',
  '*.accessToken',
  '*.authorization',
  '*.currentPassword',
  '*.newPassword',
  '*.password',
  '*.recoveryCode',
  '*.refreshToken',
  '*.totpCode',
];

export const logger = pino({
  base: { service: 'kestrel-cloud-api' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  level: resolveLevel(process.env.LOG_LEVEL, process.env.NODE_ENV),
  redact: {
    censor: '[REDACTED]',
    paths: REDACTED_PATHS,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Returns a child logger tagged with the emitting module. */
export function createLogger(context: string): Logger {
  return logger.child({ context });
}

function resolveLevel(
  configuredLevel: string | undefined,
  nodeEnv: string | undefined,
): pino.LevelWithSilent {
  const level = configuredLevel?.trim().toLowerCase();

  if (level != null && level !== '') {
    return isLevel(level) ? level : DEFAULT_LEVEL;
  }

  return nodeEnv === 'test' ? 'silent' : DEFAULT_LEVEL;
}

function isLevel(level: string): level is pino.LevelWithSilent {
  return level === 'silent' || Object.hasOwn(pino.levels.values, level);
}
