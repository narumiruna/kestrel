export type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
  };
};

export type LoginInput = {
  password: string;
  recoveryCode?: string;
  totpCode?: string;
  username: string;
};

export type Place = {
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  id: string;
  latitude: number;
  libraryItem: LibraryItem | null;
  longitude: number;
  name: string;
  tags: string[];
  updatedAt: string;
};

export type RouteMode = 'ONCE' | 'LOOP' | 'PING_PONG';

export type RouteWaypoint = {
  latitude: number;
  longitude: number;
  pauseSeconds?: number | null;
  sequence?: number;
  speedKmh?: number | null;
};

export type Route = {
  createdAt: string;
  currentRevision: {
    createdAt: string;
    createdBy: string;
    defaultSpeedKmh: number;
    id: string;
    mode: RouteMode;
    revisionNumber: number;
    waypoints: RouteWaypoint[];
  } | null;
  defaultSpeedKmh: number;
  deletedAt: string | null;
  description: string | null;
  id: string;
  isPublic: boolean;
  libraryItem: LibraryItem | null;
  mode: RouteMode;
  name: string;
  updatedAt: string;
};

export type LibraryItem = {
  createdAt: string;
  deletedAt: string | null;
  id: string;
  kind: 'PLACE' | 'ROUTE';
  lastUsedAt: string | null;
  pinned: boolean;
  placeId: string | null;
  routeId: string | null;
  sortOrder: number;
  updatedAt: string;
};

export type PlaceInput = {
  description: string | null;
  latitude: number;
  longitude: number;
  name: string;
  tags: string[];
};

export type RouteInput = {
  defaultSpeedKmh: number;
  description: string | null;
  isPublic: boolean;
  mode: RouteMode;
  name: string;
  waypoints: Array<{
    latitude: number;
    longitude: number;
  }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API_BASE_URL = '/api/backend';

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      'content-type': 'application/json',
      ...(accessToken == null ? {} : { authorization: `Bearer ${accessToken}` }),
      ...headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function login(input: LoginInput) {
  return apiFetch<AuthSession>('/auth/login', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}

export function refreshSession(refreshToken: string) {
  return apiFetch<AuthSession>('/auth/refresh', {
    body: JSON.stringify({ refreshToken }),
    method: 'POST',
  });
}

export function register(input: { password: string; username: string }) {
  return apiFetch<{ nextStep: 'totp_setup'; user: { id: string; username: string } }>(
    '/auth/register',
    {
      body: JSON.stringify(input),
      method: 'POST',
    },
  );
}

export function setupTotp(input: { password: string; username: string }) {
  return apiFetch<{
    otpauthUrl: string;
    qrCodeDataUrl: string;
    secret: string;
    user: { id: string; username: string };
  }>('/auth/totp/setup', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}

export function verifyTotp(input: { code: string; password: string; username: string }) {
  return apiFetch<{
    nextStep: 'login';
    recoveryCodes: string[];
    user: { id: string; username: string };
  }>('/auth/totp/verify', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    const message = body.message;

    if (Array.isArray(message)) {
      return message.join('\n');
    }

    if (typeof message === 'string') {
      return message;
    }
  } catch {
    // Fall through to status text.
  }

  return response.statusText || `HTTP ${response.status}`;
}
