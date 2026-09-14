import { Prisma } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { ConfigService } from '../config.service';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '../http/errors';
import { createLogger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthAuditMetadata, AuthAuditService } from './auth-audit.service';

const PROVIDER = 'pocket_id';
const AUTHORIZATION_LIFETIME_MS = 10 * 60 * 1000;
const EXCHANGE_TICKET_LIFETIME_MS = 10 * 60 * 1000;
const EXCHANGE_RETRY_LIFETIME_MS = 20 * 60 * 1000;
const SESSION_DURATION_DAYS = 30;
const SECRET_BYTES = 32;
const ENCRYPTION_KEY_BYTES = 32;
const ENCRYPTED_VALUE_VERSION = 'v1';
const CLIENT_NONCE_PATTERN = /^[A-Za-z0-9:._-]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const ANDROID_CALLBACK_URI =
  'https://kestrel.narumi.dev/login/pocket-id/android';

export type PocketIdClientType = 'android' | 'web';

type PocketIdConfiguration = {
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  issuer: string;
  redirectUri: string;
  webCallbackUri: string;
};

type OidcDiscovery = {
  authorization_endpoint: string;
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

type AuthorizationState = {
  clientNonceHash: string;
  clientType: PocketIdClientType;
  codeVerifier: string;
  expiresAt: number;
};

type VerifiedIdentity = {
  issuer: string;
  preferredUsername: string | null;
  subject: string;
};

type PocketIdExchangeResponse = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  authMethod: 'pocket_id';
  refreshToken: string;
  session: { createdAt: Date; expiresAt: Date; id: string; lastUsedAt: Date };
  user: { id: string; username: string };
};

type ExchangeSession = PocketIdExchangeResponse['session'];
type ExchangeUser = PocketIdExchangeResponse['user'];
type RecoverableExchangeAttempt = {
  clientNonceHash: string;
  consumedAt: Date | null;
  exchangeRefreshTokenEncrypted: string | null;
  exchangeSessionId: string | null;
  expiresAt: Date;
  provider: string;
};

export class PocketIdService {
  private readonly logger = createLogger(PocketIdService.name);
  private discoveryCache?: { expiresAt: number; value: OidcDiscovery };

  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly authAuditService: AuthAuditService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  getMethods(): { pocketId: { enabled: boolean } } {
    return { pocketId: { enabled: this.getConfiguration(false) != null } };
  }

  async start(input: unknown): Promise<{ authorizationUrl: string }> {
    const configuration = this.requireConfiguration();
    const { clientNonce, clientType } = parseStartRequest(input);
    const discovery = await this.getDiscovery(configuration);
    const codeVerifier = createRandomSecret();
    const state = createAuthorizationState(
      {
        clientNonceHash: hashValue(clientNonce),
        clientType,
        codeVerifier,
        expiresAt: Date.now() + AUTHORIZATION_LIFETIME_MS,
      },
      configuration.encryptionKey,
    );
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', configuration.clientId);
    authorizationUrl.searchParams.set(
      'code_challenge',
      createPkceChallenge(codeVerifier),
    );
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('nonce', state);
    authorizationUrl.searchParams.set(
      'redirect_uri',
      configuration.redirectUri,
    );
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile');
    authorizationUrl.searchParams.set('state', state);

    return { authorizationUrl: authorizationUrl.toString() };
  }

  async callback(input: {
    code?: string;
    error?: string;
    state?: string;
  }): Promise<string> {
    const configuration = this.requireConfiguration();
    const rawState = validateCallbackState(input.state);
    const authorizationState = parseAuthorizationState(
      rawState,
      configuration.encryptionKey,
    );
    if (authorizationState.expiresAt <= Date.now()) {
      throw new GoneException(
        'Pocket ID sign-in attempt is invalid or expired',
      );
    }

    if (input.error != null) {
      return buildClientRedirect(
        authorizationState.clientType,
        configuration.webCallbackUri,
        input.error === 'access_denied'
          ? 'access_denied'
          : 'authentication_failed',
        undefined,
        authorizationState.clientNonceHash,
      );
    }

    try {
      if (input.code == null || input.code === '') {
        throw new BadRequestException(
          'Pocket ID authorization code is missing',
        );
      }
      const discovery = await this.getDiscovery(configuration);
      const identity = await this.exchangeAndVerify(
        input.code,
        rawState,
        authorizationState.codeVerifier,
        configuration,
        discovery,
      );
      const exchangeTicket = createRandomSecret();
      const callbackCompletedAt = new Date();
      await this.prismaService.$transaction(async (transaction) => {
        await transaction.oidcLoginAttempt.deleteMany({
          where: { expiresAt: { lte: callbackCompletedAt } },
        });
        await transaction.oidcLoginAttempt.create({
          data: {
            callbackCompletedAt,
            callbackStartedAt: callbackCompletedAt,
            clientNonceHash: authorizationState.clientNonceHash,
            clientType: authorizationState.clientType,
            exchangeTicketHash: hashValue(exchangeTicket),
            expiresAt: new Date(
              callbackCompletedAt.getTime() + EXCHANGE_TICKET_LIFETIME_MS,
            ),
            issuer: identity.issuer,
            issuerHash: hashValue(identity.issuer),
            pkceVerifierEncrypted: '',
            preferredUsername: identity.preferredUsername,
            provider: PROVIDER,
            stateHash: hashValue(rawState),
            subject: identity.subject,
          },
        });
      });

      return buildClientRedirect(
        authorizationState.clientType,
        configuration.webCallbackUri,
        undefined,
        exchangeTicket,
        authorizationState.clientNonceHash,
      );
    } catch (error) {
      this.logger.warn(
        { reason: error instanceof Error ? error.name : 'UnknownError' },
        'Pocket ID callback failed',
      );
      return buildClientRedirect(
        authorizationState.clientType,
        configuration.webCallbackUri,
        'authentication_failed',
        undefined,
        authorizationState.clientNonceHash,
      );
    }
  }

  async exchange(
    input: unknown,
    metadata: AuthAuditMetadata = {},
  ): Promise<PocketIdExchangeResponse> {
    const configuration = this.requireConfiguration();
    const { clientNonce, exchangeTicket } = parseExchangeRequest(input);
    const exchangeTicketHash = hashValue(exchangeTicket);
    const now = new Date();
    const attempt = await this.prismaService.oidcLoginAttempt.findUnique({
      where: { exchangeTicketHash },
    });

    if (
      attempt == null ||
      attempt.provider !== PROVIDER ||
      !secureHashMatches(attempt.clientNonceHash, clientNonce)
    ) {
      throw new GoneException(
        'Pocket ID exchange ticket is invalid or expired',
      );
    }
    if (attempt.consumedAt != null) {
      const recovered = await this.recoverCompletedExchange(
        attempt,
        clientNonce,
        configuration,
        now,
      );
      if (recovered != null) {
        return recovered;
      }
      throw new GoneException(
        'Pocket ID exchange ticket is invalid or expired',
      );
    }
    if (
      attempt.callbackCompletedAt == null ||
      attempt.expiresAt <= now ||
      attempt.issuer == null ||
      attempt.issuerHash == null ||
      attempt.subject == null
    ) {
      throw new GoneException(
        'Pocket ID exchange ticket is invalid or expired',
      );
    }

    const refreshToken = createRandomSecret();
    const refreshTokenHash = hashValue(refreshToken);
    const sessionId = randomUUID();

    try {
      const result = await this.prismaService.$transaction(
        async (transaction) => {
          const consumed = await transaction.oidcLoginAttempt.updateMany({
            data: {
              consumedAt: now,
              exchangeRefreshTokenEncrypted: encryptValue(
                refreshToken,
                configuration.encryptionKey,
              ),
              exchangeSessionId: sessionId,
              expiresAt: new Date(now.getTime() + EXCHANGE_RETRY_LIFETIME_MS),
            },
            where: {
              consumedAt: null,
              expiresAt: { gt: now },
              id: attempt.id,
            },
          });
          if (consumed.count !== 1) {
            throw new GoneException(
              'Pocket ID exchange ticket is invalid or expired',
            );
          }

          let identity = await transaction.federatedIdentity.findUnique({
            where: {
              provider_issuerHash_subject: {
                issuerHash: attempt.issuerHash!,
                provider: PROVIDER,
                subject: attempt.subject!,
              },
            },
            include: { user: true },
          });
          if (identity != null && identity.issuer !== attempt.issuer) {
            throw new InternalServerErrorException(
              'stored OIDC identity is invalid',
            );
          }

          if (identity == null) {
            const username = validatePocketIdUsername(
              attempt.preferredUsername,
            );
            const collision = await transaction.user.findUnique({
              select: { id: true },
              where: { username },
            });
            if (collision != null) {
              throw new ConflictException(
                'Pocket ID username already belongs to another Kestrel account',
              );
            }

            const passwordHash = await hash(createRandomSecret(), {
              type: argon2id,
            });
            const user = await transaction.user.create({
              data: {
                passwordHash,
                username,
              },
            });
            identity = await transaction.federatedIdentity.create({
              data: {
                issuer: attempt.issuer!,
                issuerHash: attempt.issuerHash!,
                provider: PROVIDER,
                subject: attempt.subject!,
                userId: user.id,
              },
              include: { user: true },
            });
          }

          const session = await transaction.session.create({
            data: {
              expiresAt: createSessionExpiry(now),
              id: sessionId,
              ipAddress: metadata.ipAddress,
              lastUsedAt: now,
              refreshTokenHash,
              userAgent: metadata.userAgent,
              userId: identity.user.id,
            },
            select: {
              createdAt: true,
              expiresAt: true,
              id: true,
              lastUsedAt: true,
            },
          });

          return { session, user: identity.user };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const response = this.issueExchangeResponse(
        result.session,
        result.user,
        refreshToken,
        now,
      );

      await this.safeAuditLog({
        ...metadata,
        authMethod: PROVIDER,
        event: 'login',
        outcome: 'success',
        sessionId: result.session.id,
        userId: result.user.id,
        username: result.user.username,
      });

      return response;
    } catch (error) {
      const recovered = await this.recoverExchange(
        exchangeTicketHash,
        clientNonce,
        configuration,
        now,
      );
      if (recovered != null) {
        return recovered;
      }
      await this.safeAuditLog({
        ...metadata,
        authMethod: PROVIDER,
        event: 'login',
        failureReason:
          error instanceof ConflictException
            ? 'username_collision'
            : 'exchange_failed',
        outcome: 'failure',
      });
      throw error;
    }
  }

  private async recoverExchange(
    exchangeTicketHash: string,
    clientNonce: string,
    configuration: PocketIdConfiguration,
    now: Date,
  ): Promise<PocketIdExchangeResponse | null> {
    const attempt = await this.prismaService.oidcLoginAttempt.findUnique({
      where: { exchangeTicketHash },
    });
    return this.recoverCompletedExchange(
      attempt,
      clientNonce,
      configuration,
      now,
    );
  }

  private async recoverCompletedExchange(
    attempt: RecoverableExchangeAttempt | null,
    clientNonce: string,
    configuration: PocketIdConfiguration,
    now: Date,
  ): Promise<PocketIdExchangeResponse | null> {
    if (
      attempt == null ||
      attempt.provider !== PROVIDER ||
      attempt.consumedAt == null ||
      attempt.exchangeRefreshTokenEncrypted == null ||
      attempt.exchangeSessionId == null ||
      attempt.expiresAt <= now ||
      !secureHashMatches(attempt.clientNonceHash, clientNonce)
    ) {
      return null;
    }
    const session = await this.prismaService.session.findUnique({
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        lastUsedAt: true,
        refreshTokenHash: true,
        revokedAt: true,
        user: { select: { id: true, username: true } },
      },
      where: { id: attempt.exchangeSessionId },
    });
    if (
      session == null ||
      session.revokedAt != null ||
      session.expiresAt <= now
    ) {
      return null;
    }
    const refreshToken = decryptValue(
      attempt.exchangeRefreshTokenEncrypted,
      configuration.encryptionKey,
    );
    if (!secureHashMatches(session.refreshTokenHash, refreshToken)) {
      return null;
    }
    return this.issueExchangeResponse(
      {
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        id: session.id,
        lastUsedAt: session.lastUsedAt,
      },
      session.user,
      refreshToken,
      now,
    );
  }

  private issueExchangeResponse(
    session: ExchangeSession,
    user: ExchangeUser,
    refreshToken: string,
    issuedAt: Date,
  ): PocketIdExchangeResponse {
    const accessToken = this.accessTokenService.issueToken(
      { sessionId: session.id, userId: user.id },
      issuedAt,
    );
    return {
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      authMethod: PROVIDER,
      refreshToken,
      session,
      user: { id: user.id, username: user.username },
    };
  }

  private async exchangeAndVerify(
    code: string,
    expectedNonce: string,
    codeVerifier: string,
    configuration: PocketIdConfiguration,
    discovery: OidcDiscovery,
  ): Promise<VerifiedIdentity> {
    const tokenResponse = await fetch(discovery.token_endpoint, {
      body: new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: configuration.redirectUri,
      }),
      headers: { accept: 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) {
      throw new ServiceUnavailableException('Pocket ID token exchange failed');
    }
    const tokenBody = (await tokenResponse.json()) as Record<string, unknown>;
    if (typeof tokenBody.id_token !== 'string') {
      throw new ServiceUnavailableException('Pocket ID returned no ID token');
    }

    const { payload } = await jwtVerify(
      tokenBody.id_token,
      await this.fetchJwks(discovery.jwks_uri),
      {
        audience: configuration.clientId,
        issuer: configuration.issuer,
        requiredClaims: ['exp', 'iat', 'nonce', 'sub'],
      },
    );
    if (
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp == null) ||
      (payload.azp != null && payload.azp !== configuration.clientId)
    ) {
      throw new BadRequestException('Pocket ID authorized party is invalid');
    }
    if (payload.nonce !== expectedNonce) {
      throw new BadRequestException('Pocket ID nonce is invalid');
    }
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 255
    ) {
      throw new BadRequestException('Pocket ID subject is invalid');
    }

    let preferredUsername = payload.preferred_username;
    if (
      typeof preferredUsername !== 'string' &&
      typeof tokenBody.access_token === 'string' &&
      discovery.userinfo_endpoint != null
    ) {
      const userInfo = await this.fetchUserInfo(
        discovery.userinfo_endpoint,
        tokenBody.access_token,
      );
      if (userInfo != null) {
        if (userInfo.sub !== payload.sub) {
          throw new BadRequestException(
            'Pocket ID user info subject is invalid',
          );
        }
        preferredUsername = userInfo.preferred_username;
      }
    }

    return {
      issuer: configuration.issuer,
      preferredUsername: normalizePocketIdUsernameClaim(preferredUsername),
      subject: payload.sub,
    };
  }

  private async fetchJwks(endpoint: string) {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Pocket ID signing keys failed');
    }
    const body = (await response.json()) as Partial<JSONWebKeySet>;
    if (!Array.isArray(body.keys)) {
      throw new ServiceUnavailableException(
        'Pocket ID signing keys are invalid',
      );
    }
    return createLocalJWKSet(body as JSONWebKeySet);
  }

  private async fetchUserInfo(
    endpoint: string,
    accessToken: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as unknown;
      return body != null && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private async getDiscovery(
    configuration: PocketIdConfiguration,
  ): Promise<OidcDiscovery> {
    if (
      this.discoveryCache != null &&
      this.discoveryCache.expiresAt > Date.now()
    ) {
      return this.discoveryCache.value;
    }

    const discoveryUrl = new URL(
      `${configuration.issuer}/.well-known/openid-configuration`,
    );
    const response = await fetch(discoveryUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Pocket ID discovery failed');
    }
    const body = (await response.json()) as Record<string, unknown>;
    const discovery = validateDiscovery(body, configuration.issuer);
    this.discoveryCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value: discovery,
    };
    return discovery;
  }

  private requireConfiguration(): PocketIdConfiguration {
    const configuration = this.getConfiguration(true);
    if (configuration == null) {
      throw new ServiceUnavailableException('Pocket ID sign-in is disabled');
    }
    return configuration;
  }

  private getConfiguration(
    rejectPartial: boolean,
  ): PocketIdConfiguration | null {
    const values = {
      clientId: this.configService.get('AUTH_POCKET_ID_CLIENT_ID')?.trim(),
      clientSecret: this.configService
        .get('AUTH_POCKET_ID_CLIENT_SECRET')
        ?.trim(),
      encryptionKey: this.configService
        .get('AUTH_OIDC_FLOW_ENCRYPTION_KEY')
        ?.trim(),
      issuer: this.configService.get('AUTH_POCKET_ID_ISSUER')?.trim(),
      redirectUri: this.configService
        .get('AUTH_POCKET_ID_REDIRECT_URI')
        ?.trim(),
      webCallbackUri: this.configService
        .get('AUTH_POCKET_ID_WEB_CALLBACK_URI')
        ?.trim(),
    };
    const configuredCount = Object.values(values).filter(Boolean).length;
    if (configuredCount === 0) {
      return null;
    }
    if (configuredCount !== Object.keys(values).length) {
      if (rejectPartial) {
        throw new InternalServerErrorException(
          'Pocket ID configuration is incomplete',
        );
      }
      return null;
    }

    const issuer = validateConfiguredUrl(values.issuer!, 'Pocket ID issuer');
    const redirectUri = validateConfiguredUrl(
      values.redirectUri!,
      'Pocket ID redirect URI',
    );
    const webCallbackUri = validateConfiguredUrl(
      values.webCallbackUri!,
      'Pocket ID Web callback URI',
    );
    const encryptionKey = decodeEncryptionKey(values.encryptionKey!);

    return {
      clientId: values.clientId!,
      clientSecret: values.clientSecret!,
      encryptionKey,
      issuer: issuer.toString().replace(/\/$/, ''),
      redirectUri: redirectUri.toString(),
      webCallbackUri: webCallbackUri.toString(),
    };
  }

  private async safeAuditLog(
    entry: Parameters<AuthAuditService['log']>[0],
  ): Promise<void> {
    try {
      await this.authAuditService.log(entry);
    } catch {
      this.logger.warn(
        { event: entry.event },
        'failed to persist Pocket ID auth audit log',
      );
    }
  }
}

function parseStartRequest(input: unknown): {
  clientNonce: string;
  clientType: PocketIdClientType;
} {
  const record = parseRecord(input);
  if (record.clientType !== 'android' && record.clientType !== 'web') {
    throw new BadRequestException('clientType must be android or web');
  }
  return {
    clientNonce: validateClientNonce(record.clientNonce),
    clientType: record.clientType,
  };
}

function parseExchangeRequest(input: unknown): {
  clientNonce: string;
  exchangeTicket: string;
} {
  const record = parseRecord(input);
  if (
    typeof record.exchangeTicket !== 'string' ||
    record.exchangeTicket.length < 32 ||
    record.exchangeTicket.length > 128
  ) {
    throw new BadRequestException('exchangeTicket is invalid');
  }
  return {
    clientNonce: validateClientNonce(record.clientNonce),
    exchangeTicket: record.exchangeTicket,
  };
}

function parseRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('request body must be an object');
  }
  return input as Record<string, unknown>;
}

function validateClientNonce(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 16 ||
    value.length > 128 ||
    !CLIENT_NONCE_PATTERN.test(value)
  ) {
    throw new BadRequestException('clientNonce is invalid');
  }
  return value;
}

function validateCallbackState(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 128 ||
    value.length > 1024 ||
    !/^v1(?:\.[A-Za-z0-9_-]+){3}$/.test(value)
  ) {
    throw new BadRequestException('Pocket ID sign-in state is invalid');
  }
  return value;
}

function createAuthorizationState(
  value: AuthorizationState,
  key: Buffer,
): string {
  return encryptValue(JSON.stringify(value), key);
}

function parseAuthorizationState(
  value: string,
  key: Buffer,
): AuthorizationState {
  try {
    const parsed = JSON.parse(
      decryptValue(value, key),
    ) as Partial<AuthorizationState>;
    if (
      !/^[a-f0-9]{64}$/.test(parsed.clientNonceHash ?? '') ||
      (parsed.clientType !== 'android' && parsed.clientType !== 'web') ||
      typeof parsed.codeVerifier !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(parsed.codeVerifier) ||
      typeof parsed.expiresAt !== 'number' ||
      !Number.isSafeInteger(parsed.expiresAt)
    ) {
      throw new Error('invalid authorization state');
    }
    return parsed as AuthorizationState;
  } catch {
    throw new BadRequestException('Pocket ID sign-in state is invalid');
  }
}

function normalizePocketIdUsernameClaim(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const username = value.trim();
  return username.length <= MAX_USERNAME_LENGTH ? username : null;
}

function validatePocketIdUsername(value: string | null): string {
  const username = value?.trim() ?? '';
  if (
    username.length < MIN_USERNAME_LENGTH ||
    username.length > MAX_USERNAME_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    throw new ConflictException(
      'Pocket ID username must be 3-64 letters, numbers, dots, underscores, or hyphens',
    );
  }
  return username;
}

function validateDiscovery(
  value: Record<string, unknown>,
  expectedIssuer: string,
): OidcDiscovery {
  if (value.issuer !== expectedIssuer) {
    throw new ServiceUnavailableException(
      'Pocket ID discovery issuer mismatch',
    );
  }
  for (const key of [
    'authorization_endpoint',
    'jwks_uri',
    'token_endpoint',
  ] as const) {
    if (typeof value[key] !== 'string') {
      throw new ServiceUnavailableException('Pocket ID discovery is invalid');
    }
    validateProviderEndpoint(value[key], key);
  }
  if (value.userinfo_endpoint != null) {
    if (typeof value.userinfo_endpoint !== 'string') {
      throw new ServiceUnavailableException('Pocket ID discovery is invalid');
    }
    validateProviderEndpoint(value.userinfo_endpoint, 'userinfo_endpoint');
  }
  return value as OidcDiscovery;
}

function validateProviderEndpoint(value: string, label: string): void {
  const url = validateConfiguredUrl(value, label);
  if (url.username !== '' || url.password !== '') {
    throw new ServiceUnavailableException(`${label} is invalid`);
  }
}

function validateConfiguredUrl(value: string, label: string): URL {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' &&
        !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== '' ||
      url.search !== ''
    ) {
      throw new Error('unsafe URL');
    }
    return url;
  } catch {
    throw new InternalServerErrorException(`${label} is invalid`);
  }
}

function buildClientRedirect(
  clientType: string,
  webCallbackUri: string,
  error?: string,
  exchangeTicket?: string,
  clientNonceHash?: string,
): string {
  const isAndroid = clientType === 'android';
  const url = new URL(isAndroid ? ANDROID_CALLBACK_URI : webCallbackUri);
  const fragment = new URLSearchParams();
  if (error != null) {
    fragment.set('error', error);
  }
  if (exchangeTicket != null) {
    fragment.set('ticket', exchangeTicket);
  }
  if (isAndroid && clientNonceHash != null) {
    fragment.set('attempt', clientNonceHash);
  }
  url.hash = fragment.toString();
  return url.toString();
}

function createRandomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createPkceChallenge(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function secureHashMatches(expectedHash: string, value: string): boolean {
  const actual = Buffer.from(hashValue(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encryptValue(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    ENCRYPTED_VALUE_VERSION,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

function decryptValue(value: string, key: Buffer): string {
  const [version, iv, ciphertext, authTag, ...rest] = value.split('.');
  if (
    version !== ENCRYPTED_VALUE_VERSION ||
    iv == null ||
    ciphertext == null ||
    authTag == null ||
    rest.length > 0
  ) {
    throw new InternalServerErrorException('stored OIDC flow is invalid');
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new InternalServerErrorException('stored OIDC flow is invalid');
  }
}

function decodeEncryptionKey(value: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== ENCRYPTION_KEY_BYTES) {
    throw new InternalServerErrorException(
      'AUTH_OIDC_FLOW_ENCRYPTION_KEY must contain exactly 32 bytes',
    );
  }
  return key;
}

function createSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
