import { Prisma, type OidcLoginAttempt } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import {
  createLocalJWKSet,
  errors as joseErrors,
  type JSONWebKeySet,
  jwtVerify,
} from 'jose';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ConfigService } from '../config.service';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '../http/errors';
import { createLogger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthAuditMetadata, AuthAuditService } from './auth-audit.service';

const PROVIDER = 'oidc';
const AUTHORIZATION_LIFETIME_MS = 10 * 60 * 1000;
const EXCHANGE_TICKET_LIFETIME_MS = 10 * 60 * 1000;
const EXCHANGE_RETRY_LIFETIME_MS = 20 * 60 * 1000;
const CALLBACK_CLAIM_RATE_WINDOW_MS = 60 * 1000;
const CALLBACK_PROCESSING_LIFETIME_MS = 2 * 60 * 1000;
const MAX_ACTIVE_CALLBACK_CLAIMS = 1000;
const MAX_CALLBACK_CLAIMS_PER_WINDOW = 120;
const CALLBACK_CLAIM_TRANSACTION_ATTEMPTS = 3;
const CALLBACK_COMPLETION_RETRY_DELAY_MS = 1000;
const SESSION_DURATION_DAYS = 30;
const SECRET_BYTES = 32;
const ENCRYPTION_KEY_BYTES = 32;
const ENCRYPTED_VALUE_VERSION = 'v1';
const CLIENT_NONCE_PATTERN = /^[A-Za-z0-9:._-]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const DEFAULT_DISPLAY_NAME = 'OpenID Connect';

export type OidcClientType = 'android' | 'web';

type OidcConfiguration = {
  androidCallbackUri: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  encryptionKey: Buffer;
  issuer: string;
  redirectUri: string;
  webCallbackUri: string;
};

type OidcDiscovery = {
  authorization_endpoint: string;
  code_challenge_methods_supported?: string[];
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  token_endpoint_auth_methods_supported?: string[];
  userinfo_endpoint?: string;
};

type AuthorizationState = {
  clientNonceHash: string;
  clientType: OidcClientType;
  codeVerifier: string;
  expiresAt: number;
};

type VerifiedIdentity = {
  issuer: string;
  preferredUsername: string | null;
  subject: string;
};

type OidcExchangeResponse = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  authMethod: 'oidc';
  refreshToken: string;
  session: { createdAt: Date; expiresAt: Date; id: string; lastUsedAt: Date };
  user: { id: string; username: string };
};

type ExchangeSession = OidcExchangeResponse['session'];
type ExchangeUser = OidcExchangeResponse['user'];
class RetryableOidcCallbackError extends Error {}
class OidcUnsafeToRetryError extends Error {}

type RecoverableExchangeAttempt = {
  clientNonceHash: string;
  consumedAt: Date | null;
  exchangeSessionId: string | null;
  expiresAt: Date;
  provider: string;
};

export class OidcService {
  private readonly logger = createLogger(OidcService.name);
  private discoveryCache?: { expiresAt: number; value: OidcDiscovery };

  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly authAuditService: AuthAuditService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  getMethods(): { oidc: { displayName: string; enabled: boolean } } {
    try {
      const configuration = this.getConfiguration(false);
      return {
        oidc: {
          displayName: configuration?.displayName ?? DEFAULT_DISPLAY_NAME,
          enabled: configuration != null,
        },
      };
    } catch {
      return {
        oidc: { displayName: DEFAULT_DISPLAY_NAME, enabled: false },
      };
    }
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
    const callbackStartedAt = new Date();
    if (input.error != null) {
      if (authorizationState.expiresAt <= callbackStartedAt.getTime()) {
        throw new GoneException('OIDC sign-in attempt is invalid or expired');
      }
      return buildClientRedirect(
        authorizationState.clientType,
        configuration,
        input.error === 'access_denied'
          ? 'access_denied'
          : 'authentication_failed',
        undefined,
        authorizationState.clientNonceHash,
      );
    }

    const authorizationCode = validateAuthorizationCode(input.code);
    const attemptId = randomUUID();
    const recoveredRedirect = await this.claimCallback(
      attemptId,
      rawState,
      authorizationState,
      configuration,
      callbackStartedAt,
    );
    if (recoveredRedirect != null) {
      return recoveredRedirect;
    }

    try {
      const discovery = await this.getDiscovery(configuration);
      const identity = await this.exchangeAndVerify(
        authorizationCode,
        rawState,
        authorizationState.codeVerifier,
        configuration,
        discovery,
        callbackStartedAt.getTime() + CALLBACK_PROCESSING_LIFETIME_MS,
      );
      const exchangeTicket = deriveSecret(
        configuration.encryptionKey,
        'callback-exchange-ticket',
        rawState,
      );
      const callbackCompletedAt = new Date();
      await this.completeCallbackClaim(
        attemptId,
        callbackStartedAt,
        callbackCompletedAt,
        exchangeTicket,
        identity,
      );

      return buildClientRedirect(
        authorizationState.clientType,
        configuration,
        undefined,
        exchangeTicket,
        authorizationState.clientNonceHash,
      );
    } catch (error) {
      if (error instanceof OidcUnsafeToRetryError) {
        throw new InternalServerErrorException(
          'OIDC callback cannot be safely retried after the token request',
        );
      }
      if (error instanceof RetryableOidcCallbackError) {
        await this.releaseCallbackClaim(attemptId, callbackStartedAt);
        throw new ServiceUnavailableException(
          'OIDC callback is temporarily unavailable',
        );
      }
      await this.completeFailedCallback(attemptId, callbackStartedAt);
      this.logger.warn(
        { reason: error instanceof Error ? error.name : 'UnknownError' },
        'OIDC callback failed',
      );
      return buildClientRedirect(
        authorizationState.clientType,
        configuration,
        'authentication_failed',
        undefined,
        authorizationState.clientNonceHash,
      );
    }
  }

  private async claimCallback(
    attemptId: string,
    rawState: string,
    authorizationState: AuthorizationState,
    configuration: OidcConfiguration,
    callbackStartedAt: Date,
  ): Promise<string | null> {
    const stateHash = hashValue(rawState);
    const existing = await this.prismaService.oidcLoginAttempt.findUnique({
      where: { stateHash },
    });
    if (existing != null) {
      if (
        existing.callbackCompletedAt != null ||
        existing.expiresAt > callbackStartedAt
      ) {
        return this.recoverCallbackRedirect(
          existing,
          rawState,
          authorizationState,
          configuration,
          callbackStartedAt,
        );
      }
      await this.prismaService.oidcLoginAttempt.deleteMany({
        where: {
          callbackCompletedAt: null,
          expiresAt: { lte: callbackStartedAt },
          id: existing.id,
        },
      });
    }
    if (authorizationState.expiresAt <= callbackStartedAt.getTime()) {
      throw new GoneException('OIDC sign-in attempt is invalid or expired');
    }

    for (
      let attempt = 1;
      attempt <= CALLBACK_CLAIM_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.insertCallbackClaim(
          attemptId,
          stateHash,
          authorizationState,
          callbackStartedAt,
        );
        return null;
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : null;
        if (code === 'P2034' && attempt < CALLBACK_CLAIM_TRANSACTION_ATTEMPTS) {
          continue;
        }
        if (code === 'P2002' || isRetryablePrismaError(error)) {
          try {
            const committedAttempt =
              await this.prismaService.oidcLoginAttempt.findUnique({
                where: { stateHash },
              });
            if (committedAttempt?.id === attemptId) {
              return null;
            }
            if (committedAttempt != null || code === 'P2002') {
              return this.recoverCallbackRedirect(
                committedAttempt,
                rawState,
                authorizationState,
                configuration,
                callbackStartedAt,
              );
            }
          } catch (lookupError) {
            if (
              !isRetryablePrismaError(lookupError) ||
              attempt === CALLBACK_CLAIM_TRANSACTION_ATTEMPTS
            ) {
              throw lookupError;
            }
          }
          if (attempt < CALLBACK_CLAIM_TRANSACTION_ATTEMPTS) {
            continue;
          }
        }
        throw error;
      }
    }
    throw new InternalServerErrorException('OIDC callback claim failed');
  }

  private async insertCallbackClaim(
    attemptId: string,
    stateHash: string,
    authorizationState: AuthorizationState,
    callbackStartedAt: Date,
  ): Promise<void> {
    await this.prismaService.$transaction(
      async (transaction) => {
        await transaction.oidcLoginAttempt.deleteMany({
          where: { expiresAt: { lte: callbackStartedAt } },
        });
        const [activeClaims, recentClaims] = await Promise.all([
          transaction.oidcLoginAttempt.count(),
          transaction.oidcLoginAttempt.count({
            where: {
              createdAt: {
                gt: new Date(
                  callbackStartedAt.getTime() - CALLBACK_CLAIM_RATE_WINDOW_MS,
                ),
              },
            },
          }),
        ]);
        if (
          activeClaims >= MAX_ACTIVE_CALLBACK_CLAIMS ||
          recentClaims >= MAX_CALLBACK_CLAIMS_PER_WINDOW
        ) {
          throw new HttpException(
            'OIDC callback capacity is temporarily unavailable',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        await transaction.oidcLoginAttempt.create({
          data: {
            callbackStartedAt,
            clientNonceHash: authorizationState.clientNonceHash,
            clientType: authorizationState.clientType,
            expiresAt: new Date(
              callbackStartedAt.getTime() + CALLBACK_PROCESSING_LIFETIME_MS,
            ),
            id: attemptId,
            pkceVerifierEncrypted: '',
            provider: PROVIDER,
            stateHash,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private recoverCallbackRedirect(
    attempt: OidcLoginAttempt | null,
    rawState: string,
    authorizationState: AuthorizationState,
    configuration: OidcConfiguration,
    now: Date,
  ): string {
    const exchangeTicket = deriveSecret(
      configuration.encryptionKey,
      'callback-exchange-ticket',
      rawState,
    );
    if (
      attempt == null ||
      attempt.provider !== PROVIDER ||
      attempt.callbackCompletedAt == null ||
      attempt.expiresAt <= now ||
      attempt.clientType !== authorizationState.clientType ||
      attempt.clientNonceHash !== authorizationState.clientNonceHash ||
      attempt.exchangeTicketHash !== hashValue(exchangeTicket)
    ) {
      throw new GoneException('OIDC sign-in attempt is invalid or expired');
    }
    return buildClientRedirect(
      authorizationState.clientType,
      configuration,
      undefined,
      exchangeTicket,
      authorizationState.clientNonceHash,
    );
  }

  private async completeCallbackClaim(
    attemptId: string,
    callbackStartedAt: Date,
    callbackCompletedAt: Date,
    exchangeTicket: string,
    identity: VerifiedIdentity,
  ): Promise<void> {
    const exchangeTicketHash = hashValue(exchangeTicket);
    const completionDeadline =
      callbackStartedAt.getTime() + CALLBACK_PROCESSING_LIFETIME_MS;
    let attempt = 0;
    while (Date.now() < completionDeadline) {
      attempt += 1;
      try {
        const completed = await this.prismaService.oidcLoginAttempt.updateMany({
          data: {
            callbackCompletedAt,
            exchangeTicketHash,
            expiresAt: new Date(
              callbackCompletedAt.getTime() + EXCHANGE_TICKET_LIFETIME_MS,
            ),
            issuer: identity.issuer,
            issuerHash: hashValue(identity.issuer),
            preferredUsername: identity.preferredUsername,
            subject: identity.subject,
          },
          where: {
            callbackCompletedAt: null,
            callbackStartedAt,
            consumedAt: null,
            id: attemptId,
          },
        });
        if (completed.count === 1) return;
        const stored = await this.prismaService.oidcLoginAttempt.findUnique({
          where: { id: attemptId },
        });
        if (
          stored?.callbackCompletedAt != null &&
          stored.exchangeTicketHash === exchangeTicketHash
        ) {
          return;
        }
        throw new GoneException('OIDC sign-in attempt is invalid or expired');
      } catch (error) {
        if (!isRetryablePrismaError(error)) {
          throw error;
        }
        if (
          Date.now() + CALLBACK_COMPLETION_RETRY_DELAY_MS >=
          completionDeadline
        ) {
          throw new OidcUnsafeToRetryError(
            'OIDC callback storage unavailable after code redemption',
          );
        }
        if (attempt >= 3) {
          await delay(CALLBACK_COMPLETION_RETRY_DELAY_MS);
        }
      }
    }
    throw new OidcUnsafeToRetryError(
      'OIDC callback storage unavailable after code redemption',
    );
  }

  private async releaseCallbackClaim(
    attemptId: string,
    callbackStartedAt: Date,
  ): Promise<void> {
    await this.prismaService.oidcLoginAttempt.deleteMany({
      where: {
        callbackCompletedAt: null,
        callbackStartedAt,
        consumedAt: null,
        id: attemptId,
      },
    });
  }

  private async completeFailedCallback(
    attemptId: string,
    callbackStartedAt: Date,
  ): Promise<void> {
    await this.prismaService.oidcLoginAttempt.updateMany({
      data: {
        callbackCompletedAt: new Date(),
        consumedAt: new Date(),
      },
      where: {
        callbackCompletedAt: null,
        callbackStartedAt,
        consumedAt: null,
        id: attemptId,
      },
    });
  }

  async exchange(
    input: unknown,
    metadata: AuthAuditMetadata = {},
  ): Promise<OidcExchangeResponse> {
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
      throw new GoneException('OIDC exchange ticket is invalid or expired');
    }
    if (attempt.consumedAt != null) {
      const recovered = await this.recoverCompletedExchange(
        attempt,
        exchangeTicket,
        clientNonce,
        configuration,
        now,
      );
      if (recovered != null) {
        await this.auditSuccessfulExchange(recovered, metadata);
        return recovered;
      }
      throw new GoneException('OIDC exchange ticket is invalid or expired');
    }
    if (
      attempt.callbackCompletedAt == null ||
      attempt.expiresAt <= now ||
      attempt.issuer == null ||
      attempt.issuerHash == null ||
      attempt.subject == null
    ) {
      throw new GoneException('OIDC exchange ticket is invalid or expired');
    }

    const refreshToken = deriveSecret(
      configuration.encryptionKey,
      'exchange-refresh-token',
      exchangeTicket,
      clientNonce,
    );
    const refreshTokenHash = hashValue(refreshToken);
    const sessionId = randomUUID();

    try {
      const result = await this.prismaService.$transaction(
        async (transaction) => {
          const consumed = await transaction.oidcLoginAttempt.updateMany({
            data: {
              consumedAt: now,
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
              'OIDC exchange ticket is invalid or expired',
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
            const username = validateOidcUsername(attempt.preferredUsername);
            const collision = await transaction.user.findUnique({
              select: { id: true },
              where: { username },
            });
            if (collision != null) {
              throw new ConflictException(
                'OIDC username already belongs to another Kestrel account',
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

      await this.auditSuccessfulExchange(response, metadata);

      return response;
    } catch (error) {
      const recovered = await this.recoverExchange(
        exchangeTicket,
        clientNonce,
        configuration,
        now,
      );
      if (recovered != null) {
        await this.auditSuccessfulExchange(recovered, metadata);
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

  private async auditSuccessfulExchange(
    response: OidcExchangeResponse,
    metadata: AuthAuditMetadata,
  ): Promise<void> {
    await this.safeAuditLog({
      ...metadata,
      authMethod: PROVIDER,
      event: 'login',
      outcome: 'success',
      sessionId: response.session.id,
      userId: response.user.id,
      username: response.user.username,
    });
  }

  private async recoverExchange(
    exchangeTicket: string,
    clientNonce: string,
    configuration: OidcConfiguration,
    now: Date,
  ): Promise<OidcExchangeResponse | null> {
    const attempt = await this.prismaService.oidcLoginAttempt.findUnique({
      where: { exchangeTicketHash: hashValue(exchangeTicket) },
    });
    return this.recoverCompletedExchange(
      attempt,
      exchangeTicket,
      clientNonce,
      configuration,
      now,
    );
  }

  private async recoverCompletedExchange(
    attempt: RecoverableExchangeAttempt | null,
    exchangeTicket: string,
    clientNonce: string,
    configuration: OidcConfiguration,
    now: Date,
  ): Promise<OidcExchangeResponse | null> {
    if (
      attempt == null ||
      attempt.provider !== PROVIDER ||
      attempt.consumedAt == null ||
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
    const refreshToken = deriveSecret(
      configuration.encryptionKey,
      'exchange-refresh-token',
      exchangeTicket,
      clientNonce,
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
  ): OidcExchangeResponse {
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
    configuration: OidcConfiguration,
    discovery: OidcDiscovery,
    processingDeadline: number,
  ): Promise<VerifiedIdentity> {
    const signingKeys = await this.fetchJwks(discovery.jwks_uri);
    const tokenAuthMethod = selectTokenAuthMethod(discovery);
    const tokenBody = new URLSearchParams({
      client_id: configuration.clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: configuration.redirectUri,
    });
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    };
    if (tokenAuthMethod === 'client_secret_post') {
      tokenBody.set('client_secret', configuration.clientSecret);
    } else {
      headers.authorization = createClientSecretBasicAuthorization(
        configuration.clientId,
        configuration.clientSecret,
      );
    }
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(discovery.token_endpoint, {
        body: tokenBody,
        headers,
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new OidcUnsafeToRetryError(
        'OIDC token exchange outcome is unknown',
      );
    }
    if (!tokenResponse.ok) {
      if (isRetryableProviderStatus(tokenResponse.status)) {
        throw new OidcUnsafeToRetryError(
          'OIDC token exchange outcome is unknown',
        );
      }
      throw new BadRequestException('OIDC token exchange rejected');
    }
    let tokenPayload: Record<string, unknown>;
    try {
      tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
    } catch {
      throw new OidcUnsafeToRetryError(
        'OIDC token exchange response is incomplete',
      );
    }
    if (typeof tokenPayload.id_token !== 'string') {
      throw new ServiceUnavailableException('OIDC returned no ID token');
    }

    let verifiedToken;
    try {
      verifiedToken = await this.verifyIdToken(
        tokenPayload.id_token,
        signingKeys,
        configuration,
      );
    } catch (error) {
      if (!(error instanceof joseErrors.JWKSNoMatchingKey)) throw error;
      let refreshedSigningKeys;
      try {
        refreshedSigningKeys = await this.fetchJwks(discovery.jwks_uri);
      } catch (refreshError) {
        if (refreshError instanceof RetryableOidcCallbackError) {
          throw new OidcUnsafeToRetryError(
            'OIDC signing-key refresh unavailable after code redemption',
          );
        }
        throw refreshError;
      }
      verifiedToken = await this.verifyIdToken(
        tokenPayload.id_token,
        refreshedSigningKeys,
        configuration,
      );
    }
    const { payload } = verifiedToken;
    if (
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp == null) ||
      (payload.azp != null && payload.azp !== configuration.clientId)
    ) {
      throw new BadRequestException('OIDC authorized party is invalid');
    }
    if (payload.nonce !== expectedNonce) {
      throw new BadRequestException('OIDC nonce is invalid');
    }
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 255
    ) {
      throw new BadRequestException('OIDC subject is invalid');
    }

    let preferredUsername = payload.preferred_username;
    if (
      typeof preferredUsername !== 'string' &&
      typeof tokenPayload.access_token === 'string' &&
      discovery.userinfo_endpoint != null
    ) {
      const userInfo = await this.fetchUserInfo(
        discovery.userinfo_endpoint,
        tokenPayload.access_token,
        processingDeadline,
      );
      if (userInfo != null) {
        if (userInfo.sub !== payload.sub) {
          throw new BadRequestException('OIDC user info subject is invalid');
        }
        preferredUsername = userInfo.preferred_username;
      }
    }

    return {
      issuer: configuration.issuer,
      preferredUsername: normalizeOidcUsernameClaim(preferredUsername),
      subject: payload.sub,
    };
  }

  private verifyIdToken(
    idToken: string,
    signingKeys: ReturnType<typeof createLocalJWKSet>,
    configuration: OidcConfiguration,
  ) {
    return jwtVerify(idToken, signingKeys, {
      audience: configuration.clientId,
      issuer: configuration.issuer,
      requiredClaims: ['exp', 'iat', 'nonce', 'sub'],
    });
  }

  private async fetchJwks(endpoint: string) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new RetryableOidcCallbackError('OIDC signing keys unavailable');
    }
    if (!response.ok) {
      if (isRetryableProviderStatus(response.status)) {
        throw new RetryableOidcCallbackError('OIDC signing keys unavailable');
      }
      throw new ServiceUnavailableException('OIDC signing keys failed');
    }
    let body: Partial<JSONWebKeySet>;
    try {
      body = (await response.json()) as Partial<JSONWebKeySet>;
    } catch {
      throw new RetryableOidcCallbackError('OIDC signing keys unavailable');
    }
    if (!Array.isArray(body.keys)) {
      throw new ServiceUnavailableException('OIDC signing keys are invalid');
    }
    return createLocalJWKSet(body as JSONWebKeySet);
  }

  private async fetchUserInfo(
    endpoint: string,
    accessToken: string,
    processingDeadline: number,
  ): Promise<Record<string, unknown> | null> {
    let attempt = 0;
    while (Date.now() < processingDeadline) {
      attempt += 1;
      try {
        const response = await fetch(endpoint, {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok && !isRetryableProviderStatus(response.status)) {
          return null;
        }
        if (response.ok) {
          const body = (await response.json()) as unknown;
          return body != null &&
            typeof body === 'object' &&
            !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : null;
        }
      } catch {
        // Retry while the access token and callback processing lease are live.
      }
      if (
        Date.now() + CALLBACK_COMPLETION_RETRY_DELAY_MS >=
        processingDeadline
      ) {
        break;
      }
      if (attempt >= 3) {
        await delay(CALLBACK_COMPLETION_RETRY_DELAY_MS);
      }
    }
    throw new OidcUnsafeToRetryError(
      'OIDC user info unavailable after code redemption',
    );
  }

  private async getDiscovery(
    configuration: OidcConfiguration,
  ): Promise<OidcDiscovery> {
    if (
      this.discoveryCache != null &&
      this.discoveryCache.expiresAt > Date.now()
    ) {
      return this.discoveryCache.value;
    }

    const discoveryUrl = new URL(
      `${configuration.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
    );
    let response: Response;
    try {
      response = await fetch(discoveryUrl, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new RetryableOidcCallbackError('OIDC discovery unavailable');
    }
    if (!response.ok) {
      throw new RetryableOidcCallbackError('OIDC discovery unavailable');
    }
    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new RetryableOidcCallbackError('OIDC discovery unavailable');
    }
    const discovery = validateDiscovery(body, configuration.issuer);
    this.discoveryCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value: discovery,
    };
    return discovery;
  }

  private requireConfiguration(): OidcConfiguration {
    const configuration = this.getConfiguration(true);
    if (configuration == null) {
      throw new ServiceUnavailableException('OIDC sign-in is disabled');
    }
    return configuration;
  }

  private getConfiguration(rejectPartial: boolean): OidcConfiguration | null {
    const values = {
      androidCallbackUri: this.configService
        .get('AUTH_OIDC_ANDROID_CALLBACK_URI')
        ?.trim(),
      clientId: this.configService.get('AUTH_OIDC_CLIENT_ID'),
      clientSecret: this.configService.get('AUTH_OIDC_CLIENT_SECRET'),
      encryptionKey: this.configService
        .get('AUTH_OIDC_FLOW_ENCRYPTION_KEY')
        ?.trim(),
      issuer: this.configService.get('AUTH_OIDC_ISSUER')?.trim(),
      redirectUri: this.configService.get('AUTH_OIDC_REDIRECT_URI')?.trim(),
      webCallbackUri: this.configService
        .get('AUTH_OIDC_WEB_CALLBACK_URI')
        ?.trim(),
    };
    const configuredCount = Object.values(values).filter(
      (value) => value != null && value.trim() !== '',
    ).length;
    if (configuredCount === 0) {
      return null;
    }
    if (configuredCount !== Object.keys(values).length) {
      if (rejectPartial) {
        throw new InternalServerErrorException(
          'OIDC configuration is incomplete',
        );
      }
      return null;
    }

    validateConfiguredUrl(
      values.androidCallbackUri!,
      'OIDC Android callback URI',
    );
    validateConfiguredUrl(values.issuer!, 'OIDC issuer');
    validateConfiguredUrl(values.redirectUri!, 'OIDC redirect URI');
    validateConfiguredUrl(values.webCallbackUri!, 'OIDC Web callback URI');
    const encryptionKey = decodeEncryptionKey(values.encryptionKey!);
    const displayName = validateDisplayName(
      this.configService.get('AUTH_OIDC_DISPLAY_NAME')?.trim() ||
        DEFAULT_DISPLAY_NAME,
    );

    return {
      androidCallbackUri: values.androidCallbackUri!,
      clientId: values.clientId!,
      clientSecret: values.clientSecret!,
      displayName,
      encryptionKey,
      issuer: values.issuer!,
      redirectUri: values.redirectUri!,
      webCallbackUri: values.webCallbackUri!,
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
        'failed to persist OIDC auth audit log',
      );
    }
  }
}

function parseStartRequest(input: unknown): {
  clientNonce: string;
  clientType: OidcClientType;
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

function validateAuthorizationCode(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 2048 ||
    !/^[\x20-\x7e]+$/.test(value)
  ) {
    throw new BadRequestException('OIDC authorization code is invalid');
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
    throw new BadRequestException('OIDC sign-in state is invalid');
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
    throw new BadRequestException('OIDC sign-in state is invalid');
  }
}

function normalizeOidcUsernameClaim(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const username = value.trim();
  return username.length <= MAX_USERNAME_LENGTH ? username : null;
}

function validateOidcUsername(value: string | null): string {
  const username = value?.trim() ?? '';
  if (
    username.length < MIN_USERNAME_LENGTH ||
    username.length > MAX_USERNAME_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    throw new ConflictException(
      'OIDC username must be 3-64 letters, numbers, dots, underscores, or hyphens',
    );
  }
  return username;
}

function validateDiscovery(
  value: Record<string, unknown>,
  expectedIssuer: string,
): OidcDiscovery {
  if (value.issuer !== expectedIssuer) {
    throw new ServiceUnavailableException('OIDC discovery issuer mismatch');
  }
  for (const key of [
    'authorization_endpoint',
    'jwks_uri',
    'token_endpoint',
  ] as const) {
    if (typeof value[key] !== 'string') {
      throw new ServiceUnavailableException('OIDC discovery is invalid');
    }
    validateProviderEndpoint(value[key], key);
  }
  if (value.userinfo_endpoint != null) {
    if (typeof value.userinfo_endpoint !== 'string') {
      throw new ServiceUnavailableException('OIDC discovery is invalid');
    }
    validateProviderEndpoint(value.userinfo_endpoint, 'userinfo_endpoint');
  }
  if (
    value.token_endpoint_auth_methods_supported != null &&
    (!Array.isArray(value.token_endpoint_auth_methods_supported) ||
      !value.token_endpoint_auth_methods_supported.every(
        (method) => typeof method === 'string',
      ))
  ) {
    throw new ServiceUnavailableException('OIDC discovery is invalid');
  }
  if (value.code_challenge_methods_supported != null) {
    if (
      !Array.isArray(value.code_challenge_methods_supported) ||
      !value.code_challenge_methods_supported.every(
        (method) => typeof method === 'string',
      )
    ) {
      throw new ServiceUnavailableException('OIDC discovery is invalid');
    }
    if (!value.code_challenge_methods_supported.includes('S256')) {
      throw new ServiceUnavailableException(
        'OIDC provider does not support PKCE S256',
      );
    }
  }
  return value as OidcDiscovery;
}

function selectTokenAuthMethod(
  discovery: OidcDiscovery,
): 'client_secret_basic' | 'client_secret_post' {
  const supported = discovery.token_endpoint_auth_methods_supported ?? [
    'client_secret_basic',
  ];
  if (supported.includes('client_secret_basic')) {
    return 'client_secret_basic';
  }
  if (supported.includes('client_secret_post')) {
    return 'client_secret_post';
  }
  throw new ServiceUnavailableException(
    'OIDC provider does not support confidential client authentication',
  );
}

function createClientSecretBasicAuthorization(
  clientId: string,
  clientSecret: string,
): string {
  const credentials = `${formEncode(clientId)}:${formEncode(clientSecret)}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

function formEncode(value: string): string {
  return new URLSearchParams({ value }).toString().slice('value='.length);
}

function validateProviderEndpoint(value: string, label: string): void {
  try {
    const url = new URL(value);
    if (
      !isAllowedUrlProtocol(url) ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== ''
    ) {
      throw new Error('unsafe URL');
    }
  } catch {
    throw new ServiceUnavailableException(`${label} is invalid`);
  }
}

function validateConfiguredUrl(value: string, label: string): URL {
  try {
    const url = new URL(value);
    if (
      !isAllowedUrlProtocol(url) ||
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

function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryablePrismaError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return true;
  }
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(error.code)
  );
}

function isAllowedUrlProtocol(url: URL): boolean {
  return (
    url.protocol === 'https:' ||
    (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')
  );
}

function validateDisplayName(value: string): string {
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (value.length < 1 || value.length > 64 || hasControlCharacter) {
    throw new InternalServerErrorException('OIDC display name is invalid');
  }
  return value;
}

function buildClientRedirect(
  clientType: string,
  configuration: OidcConfiguration,
  error?: string,
  exchangeTicket?: string,
  clientNonceHash?: string,
): string {
  const isAndroid = clientType === 'android';
  const url = new URL(
    isAndroid ? configuration.androidCallbackUri : configuration.webCallbackUri,
  );
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

function deriveSecret(
  key: Buffer,
  context: string,
  ...values: string[]
): string {
  const hmac = createHmac('sha256', key).update(context);
  for (const value of values) {
    hmac.update('\0').update(value);
  }
  return hmac.digest('base64url');
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
