'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { errorMessage } from '@/i18n/errors';
import type { RemoteCommand, RemoteDevice, RemoteDevicesResponse } from '@/lib/api';
import { createRemoteCommandTracker, waitForRemoteCommandPoll } from './remoteCommandState';

type DeviceData = {
  owner: string | null;
  devices: RemoteDevice[];
  failure: unknown;
  isLoading: boolean;
};
const emptyDeviceData = (owner: string | null): DeviceData => ({
  owner,
  devices: [],
  failure: null,
  isLoading: false,
});

// Mounted by the saved Place action or Route editor, never by a dialog or Route tab.
export function useRemoteDevices() {
  const t = useTranslations('Remote');
  const errorT = useTranslations('Errors');
  const auth = useAuth();
  const owner =
    auth.isHydrated && auth.session != null
      ? JSON.stringify([auth.session.user.id, auth.session.session.id])
      : null;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const apiRef = useRef(auth.apiRequest);
  apiRef.current = auth.apiRequest;
  const translatorRef = useRef(t);
  translatorRef.current = t;
  const mountedRef = useRef(false);
  const readVersionRef = useRef(0);
  const [data, setData] = useState(() => emptyDeviceData(owner));
  const visibleData = data.owner === owner ? data : emptyDeviceData(owner);
  const devicesRef = useRef(visibleData.devices);
  devicesRef.current = visibleData.devices;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDevices = useCallback(
    async ({
      showLoading,
      signal,
    }: {
      showLoading: boolean;
      signal: AbortSignal;
    }): Promise<RemoteDevice[]> => {
      const current = () =>
        mountedRef.current && owner != null && ownerRef.current === owner && !signal.aborted;
      if (!current()) return [];
      const version = ++readVersionRef.current;
      setData((previous) => ({
        ...(previous.owner === owner ? previous : emptyDeviceData(owner)),
        failure: null,
        isLoading: showLoading || (previous.owner === owner && previous.isLoading),
      }));
      try {
        const response = await apiRef.current<RemoteDevicesResponse>('/devices', { signal });
        if (current() && version === readVersionRef.current) {
          setData((previous) => ({ ...previous, owner, devices: response.devices, failure: null }));
        }
        return response.devices;
      } catch (failure) {
        if (current() && version === readVersionRef.current) {
          setData((previous) => ({ ...previous, owner, failure }));
        }
        throw failure;
      } finally {
        if (showLoading && current()) {
          setData((previous) =>
            previous.owner === owner ? { ...previous, isLoading: false } : previous,
          );
        }
      }
    },
    [owner],
  );

  const tracker = useMemo(
    () =>
      createRemoteCommandTracker({
        isCurrentOwner: () => mountedRef.current && owner != null && ownerRef.current === owner,
        validateDevice: (deviceId) => {
          const device = devicesRef.current.find((candidate) => candidate.id === deviceId) ?? null;
          const reason = getRemoteDeviceUnavailableReason(device, translatorRef.current);
          if (reason != null) throw new Error(reason);
        },
        createCommand: async (deviceId, request) => {
          return apiRef.current<RemoteCommand>(`/devices/${deviceId}/commands`, {
            method: 'POST',
            body: JSON.stringify(request),
          });
        },
        loadDevices,
        waitForPoll: waitForRemoteCommandPoll,
      }),
    [owner, loadDevices],
  );
  const commandState = useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot,
    tracker.getSnapshot,
  );

  useEffect(() => {
    tracker.activate();
    void tracker.refresh();
    return tracker.dispose;
  }, [tracker]);

  const controllableDevices = useMemo(
    () => visibleData.devices.filter(isRemoteDeviceCommandReady),
    [visibleData.devices],
  );
  const { error: commandError, ...operation } = commandState;
  return {
    devices: visibleData.devices,
    controllableDevices,
    error:
      visibleData.failure == null
        ? null
        : errorMessage(visibleData.failure, (key, values) =>
            ['unexpected', 'http', 'server'].includes(key) ? t('loadError') : errorT(key, values),
          ),
    isLoading: visibleData.isLoading,
    ...operation,
    commandError,
    selectDevice: tracker.selectDevice,
    sendCommand: tracker.send,
    refresh: tracker.refresh,
  };
}

export function isRemoteDeviceCommandReady(device: RemoteDevice): boolean {
  return device.revokedAt == null && device.online && device.remoteControlEnabled;
}

export function getRemoteDeviceUnavailableReason(
  device: RemoteDevice | null,
  t: ReturnType<typeof useTranslations<'Remote'>>,
): string | null {
  if (device == null) return t('selectDevice');
  if (device.revokedAt != null) return t('revokedDevice');
  if (!device.remoteControlEnabled) return t('enableRemote');
  if (!device.online) return t('openAndroid');
  return null;
}
