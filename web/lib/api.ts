export type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshRequestId?: string;
  refreshToken: string;
  session: {
    id: string;
  };
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

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type AuthSessionSummary = {
  createdAt: string;
  expiresAt: string;
  id: string;
  ipAddress: string | null;
  isCurrent: boolean;
  lastUsedAt: string;
  userAgent: string | null;
};

export type AuthSessionsResponse = {
  serverTime: string;
  sessions: AuthSessionSummary[];
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

export type RemoteCommandType = 'SET_POINT' | 'START_ROUTE' | 'STOP';

export type RemoteCommandStatus = 'QUEUED' | 'DELIVERED' | 'APPLIED' | 'FAILED' | 'EXPIRED';

export type RemotePoint = {
  latitude: number;
  longitude: number;
};

export type RemoteSetPointPayload = { point: RemotePoint };
export type RemoteStartRoutePayload = {
  mode: RouteMode;
  speedKmh: number;
  waypoints: RemotePoint[];
};
export type RemoteStopPayload = Record<string, never>;

export type RemoteCommandPayload =
  | RemoteSetPointPayload
  | RemoteStartRoutePayload
  | RemoteStopPayload;

type RemoteCommandBase = {
  appliedAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  deviceId: string;
  errorMessage: string | null;
  expiresAt: string;
  id: string;
  status: RemoteCommandStatus;
};

export type RemoteCommand =
  | (RemoteCommandBase & {
      payload: RemoteSetPointPayload;
      type: 'SET_POINT';
    })
  | (RemoteCommandBase & {
      payload: RemoteStartRoutePayload;
      type: 'START_ROUTE';
    })
  | (RemoteCommandBase & {
      payload: RemoteStopPayload;
      type: 'STOP';
    });

export type RemotePlaybackState = 'IDLE' | 'SINGLE' | 'ROUTE' | 'PAUSED';

export type RemoteDeviceState = {
  lastReportedAt: string;
  playbackState: RemotePlaybackState;
};

export type RemoteDevice = {
  appVersion: string | null;
  createdAt: string;
  id: string;
  lastCommand: RemoteCommand | null;
  lastSeenAt: string;
  name: string;
  online: boolean;
  platform: 'ANDROID';
  remoteControlEnabled: boolean;
  revokedAt: string | null;
  state: RemoteDeviceState | null;
};

export type RemoteDevicesResponse = {
  devices: RemoteDevice[];
  serverTime: string;
};

export type CreateRemoteCommandRequest =
  | {
      expiresAt?: string;
      payload: { point: RemotePoint };
      type: 'SET_POINT';
    }
  | {
      expiresAt?: string;
      payload: { mode: RouteMode; speedKmh: number; waypoints: RemotePoint[] };
      type: 'START_ROUTE';
    }
  | {
      expiresAt?: string;
      payload: Record<string, never>;
      type: 'STOP';
    };

export type ShareLink = {
  createdAt: string;
  disabledAt: string | null;
  expiresAt: string | null;
  id: string;
  permission: 'PUBLIC_READ';
  placeId: string | null;
  publicUrl: string;
  routeId: string | null;
  routeRevisionId: string | null;
  token: string;
  updatedAt: string;
};

export type PublicShareLink = Pick<
  ShareLink,
  'createdAt' | 'expiresAt' | 'permission' | 'publicUrl' | 'token'
>;

export type PlaceShareLink = ShareLink & {
  placeId: string;
  routeId: null;
  routeRevisionId: null;
};

export type RouteShareLink = ShareLink & {
  placeId: null;
  routeId: string;
};

export type SharedPlaceSnapshot = {
  kind: 'PLACE';
  place: {
    description: string | null;
    latitude: number;
    longitude: number;
    name: string;
    tags: string[];
  };
  shareLink: PublicShareLink;
};

export type SharedRouteSnapshot = {
  kind: 'ROUTE';
  route: {
    description: string | null;
    name: string;
    revision: {
      createdAt: string;
      defaultSpeedKmh: number;
      id: string;
      mode: RouteMode;
      revisionNumber: number;
      waypoints: RouteWaypoint[];
    };
  };
  shareLink: PublicShareLink;
};

export type SharedSnapshot = SharedPlaceSnapshot | SharedRouteSnapshot;

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
    pauseSeconds?: number | null;
    speedKmh?: number | null;
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

export function refreshSession(
  refreshToken: string,
  refreshRequestId: string,
  signal?: AbortSignal,
) {
  return apiFetch<AuthSession>('/auth/refresh', {
    body: JSON.stringify({ refreshRequestId, refreshToken }),
    method: 'POST',
    signal,
  });
}

export function changePassword(input: ChangePasswordInput, accessToken: string) {
  return apiFetch<{ ok: true }>('/auth/password/change', {
    accessToken,
    body: JSON.stringify(input),
    method: 'POST',
  });
}

export function register(input: { password: string; username: string }) {
  return apiFetch<{ nextStep: 'login' | 'totp_setup'; user: { id: string; username: string } }>(
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
