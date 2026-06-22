'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { formatError } from '@/components/dashboard/utils';
import type {
  CreateRemoteCommandRequest,
  RemoteCommand,
  RemoteCommandStatus,
  RemoteDevice,
  RemoteDevicesResponse,
} from '@/lib/api';

const COMMAND_POLL_ATTEMPTS = 75;
const COMMAND_POLL_INTERVAL_MS = 2_000;
const TERMINAL_COMMAND_STATUSES = new Set<RemoteCommandStatus>(['APPLIED', 'FAILED', 'EXPIRED']);

export type PollCommandStatusOptions = {
  attempts?: number;
  intervalMs?: number;
  onUpdate?: (command: RemoteCommand) => void;
};

export function useRemoteDevices() {
  const auth = useAuth();
  const isAuthReady = auth.isHydrated && auth.isAuthenticated;
  const mountedRef = useRef(false);
  const authReadyRef = useRef(isAuthReady);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const controllableDevices = useMemo(
    () => devices.filter((device) => isRemoteDeviceCommandReady(device)),
    [devices],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    authReadyRef.current = isAuthReady;

    if (!isAuthReady) {
      setDevices([]);
      setError(null);
      setIsLoading(false);
    }
  }, [isAuthReady]);

  const loadDevices = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}): Promise<RemoteDevice[]> => {
      if (!authReadyRef.current) {
        return [];
      }

      if (showLoading && mountedRef.current) {
        setIsLoading(true);
      }

      if (mountedRef.current && authReadyRef.current) {
        setError(null);
      }

      try {
        const response = await auth.apiRequest<RemoteDevicesResponse>('/devices');

        if (mountedRef.current && authReadyRef.current) {
          setDevices(response.devices);
        }

        return response.devices;
      } catch (nextError) {
        if (mountedRef.current && authReadyRef.current) {
          setError(formatError(nextError));
        }

        throw nextError;
      } finally {
        if (showLoading && mountedRef.current && authReadyRef.current) {
          setIsLoading(false);
        }
      }
    },
    [auth],
  );

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    void loadDevices().catch(() => {
      // The hook stores the formatted error for the caller.
    });
  }, [isAuthReady, loadDevices]);

  const createCommand = useCallback(
    async (deviceId: string, request: CreateRemoteCommandRequest): Promise<RemoteCommand> => {
      const device = devices.find((currentDevice) => currentDevice.id === deviceId) ?? null;
      const unavailableReason = getRemoteDeviceUnavailableReason(device);

      if (unavailableReason != null) {
        throw new Error(unavailableReason);
      }

      const command = await auth.apiRequest<RemoteCommand>(`/devices/${deviceId}/commands`, {
        body: JSON.stringify(request),
        method: 'POST',
      });

      void loadDevices({ showLoading: false }).catch(() => {
        // Keep the queued command; polling will surface later refresh failures.
      });

      return command;
    },
    [auth, devices, loadDevices],
  );

  const pollCommandStatus = useCallback(
    async (
      command: RemoteCommand,
      options: PollCommandStatusOptions = {},
    ): Promise<RemoteCommand> => {
      const attempts = options.attempts ?? COMMAND_POLL_ATTEMPTS;
      const intervalMs = options.intervalMs ?? COMMAND_POLL_INTERVAL_MS;
      let latestCommand = command;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) {
          await wait(intervalMs);
        }

        if (!mountedRef.current || !authReadyRef.current) {
          return latestCommand;
        }

        const nextDevices = await loadDevices({ showLoading: false });
        const refreshedCommand = findCommand(nextDevices, latestCommand);

        if (refreshedCommand != null) {
          latestCommand = refreshedCommand;
          options.onUpdate?.(latestCommand);
        }

        if (TERMINAL_COMMAND_STATUSES.has(latestCommand.status)) {
          return latestCommand;
        }
      }

      return latestCommand;
    },
    [loadDevices],
  );

  return {
    controllableDevices,
    createCommand,
    devices,
    error,
    isLoading,
    pollCommandStatus,
    refresh: loadDevices,
  };
}

export function isRemoteDeviceCommandReady(device: RemoteDevice): boolean {
  return device.online && device.remoteControlEnabled;
}

export function getRemoteDeviceUnavailableReason(device: RemoteDevice | null): string | null {
  if (device == null) {
    return 'Select a registered Android device.';
  }

  if (!device.remoteControlEnabled) {
    return 'Enable web remote control in Kestrel Options.';
  }

  if (!device.online) {
    return 'Open Kestrel on Android to receive commands.';
  }

  return null;
}

export function isTerminalRemoteCommandStatus(status: RemoteCommandStatus): boolean {
  return TERMINAL_COMMAND_STATUSES.has(status);
}

function findCommand(devices: RemoteDevice[], command: RemoteCommand): RemoteCommand | null {
  const device = devices.find((currentDevice) => currentDevice.id === command.deviceId);

  if (device?.lastCommand?.id === command.id) {
    return device.lastCommand;
  }

  return null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
