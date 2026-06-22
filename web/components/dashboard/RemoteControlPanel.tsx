'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getRemoteDeviceUnavailableReason,
  isRemoteDeviceCommandReady,
  useRemoteDevices,
} from '@/components/dashboard/useRemoteDevices';
import { formatError } from '@/components/dashboard/utils';
import type {
  CreateRemoteCommandRequest,
  Place,
  RemoteCommand,
  RemoteCommandStatus,
  RemoteDevice,
  Route,
  RouteMode,
  RouteWaypoint,
} from '@/lib/api';

type RemoteControlPanelProps = {
  buildPrimaryCommand: () => CreateRemoteCommandRequest;
  primaryActionLabel: string;
  primaryDisabledReason: string | null;
};

type PendingAction = 'primary' | 'stop' | null;

const STOP_COMMAND: CreateRemoteCommandRequest = {
  payload: {},
  type: 'STOP',
};

export function PlaceRemoteControlPanel({ place }: { place: Place | null }) {
  return (
    <RemoteControlPanel
      buildPrimaryCommand={() => {
        if (place == null) {
          throw new Error('Save this place before sending it to Android.');
        }

        return {
          payload: {
            point: {
              latitude: place.latitude,
              longitude: place.longitude,
            },
          },
          type: 'SET_POINT',
        };
      }}
      primaryActionLabel="Mock on device"
      primaryDisabledReason={place == null ? 'Save this place before sending it to Android.' : null}
    />
  );
}

export function RouteRemoteControlPanel({
  mode,
  route,
  speedKmh,
  waypoints,
}: {
  mode: RouteMode;
  route: Route | null;
  speedKmh: number;
  waypoints: RouteWaypoint[];
}) {
  const routeDisabledReason = getRouteDisabledReason(route, waypoints, speedKmh);

  return (
    <RemoteControlPanel
      buildPrimaryCommand={() => {
        if (route == null) {
          throw new Error('Save this route before sending it to Android.');
        }

        if (waypoints.length < 2) {
          throw new Error('Add at least 2 waypoints before playing this route.');
        }

        if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
          throw new Error('Enter a positive default speed before playing this route.');
        }

        return {
          payload: {
            mode,
            speedKmh,
            waypoints: waypoints.map((waypoint) => ({
              latitude: waypoint.latitude,
              longitude: waypoint.longitude,
            })),
          },
          type: 'START_ROUTE',
        };
      }}
      primaryActionLabel="Play on device"
      primaryDisabledReason={routeDisabledReason}
    />
  );
}

function RemoteControlPanel({
  buildPrimaryCommand,
  primaryActionLabel,
  primaryDisabledReason,
}: RemoteControlPanelProps) {
  const remote = useRemoteDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [command, setCommand] = useState<RemoteCommand | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isPollingCommand, setIsPollingCommand] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const selectedDevice = useMemo(
    () => remote.devices.find((device) => device.id === selectedDeviceId) ?? null,
    [remote.devices, selectedDeviceId],
  );
  const deviceUnavailableReason = getRemoteDeviceUnavailableReason(selectedDevice);
  const primaryUnavailableReason = primaryDisabledReason ?? deviceUnavailableReason;
  const stopUnavailableReason = deviceUnavailableReason;

  useEffect(() => {
    setSelectedDeviceId((currentDeviceId) => {
      if (remote.devices.some((device) => device.id === currentDeviceId)) {
        return currentDeviceId;
      }

      return remote.controllableDevices[0]?.id ?? remote.devices[0]?.id ?? '';
    });
  }, [remote.controllableDevices, remote.devices]);

  useEffect(() => {
    setCommand((currentCommand) =>
      currentCommand == null || currentCommand.deviceId === selectedDeviceId
        ? currentCommand
        : null,
    );
    setCommandError(null);
  }, [selectedDeviceId]);

  async function sendCommand(
    request: CreateRemoteCommandRequest,
    nextPendingAction: PendingAction,
  ) {
    if (selectedDevice == null) {
      return;
    }

    setCommandError(null);
    setPendingAction(nextPendingAction);

    try {
      const nextCommand = await remote.createCommand(selectedDevice.id, request);
      setCommand(nextCommand);
      setIsPollingCommand(true);

      const completedCommand = await remote.pollCommandStatus(nextCommand, {
        onUpdate: setCommand,
      });
      setCommand(completedCommand);
    } catch (nextError) {
      setCommandError(formatError(nextError));
    } finally {
      setIsPollingCommand(false);
      setPendingAction(null);
    }
  }

  function sendPrimaryCommand() {
    if (primaryUnavailableReason != null) {
      setCommandError(primaryUnavailableReason);
      return;
    }

    try {
      void sendCommand(buildPrimaryCommand(), 'primary');
    } catch (nextError) {
      setCommandError(formatError(nextError));
    }
  }

  function sendStopCommand() {
    if (stopUnavailableReason != null) {
      setCommandError(stopUnavailableReason);
      return;
    }

    void sendCommand(STOP_COMMAND, 'stop');
  }

  const statusMessage = getPanelStatusMessage({
    command,
    fallbackReason: primaryUnavailableReason,
    isPollingCommand,
  });

  return (
    <details className="route-editor-section route-editor-collapsible route-editor-secondary-section remote-control-section">
      <summary>
        <span>Web remote control</span>
        <span className="muted">{formatDeviceSummary(remote.devices)}</span>
      </summary>
      <div className="route-editor-collapsible-content remote-control-content">
        {remote.error == null ? null : <div className="error">{remote.error}</div>}
        {commandError == null ? null : <div className="error">{commandError}</div>}
        <label>
          Device
          <select
            disabled={remote.devices.length === 0 || remote.isLoading || pendingAction != null}
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
          >
            {remote.devices.length === 0 ? (
              <option value="">No Android devices</option>
            ) : (
              remote.devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {formatDeviceOption(device)}
                </option>
              ))
            )}
          </select>
        </label>
        <DeviceStatus device={selectedDevice} />
        <div className="remote-control-actions">
          <button
            disabled={primaryUnavailableReason != null || pendingAction != null}
            type="button"
            onClick={sendPrimaryCommand}
          >
            {pendingAction === 'primary' ? 'Sending...' : primaryActionLabel}
          </button>
          <button
            className="secondary"
            disabled={stopUnavailableReason != null || pendingAction != null}
            type="button"
            onClick={sendStopCommand}
          >
            {pendingAction === 'stop' ? 'Stopping...' : 'Stop on device'}
          </button>
          <button
            className="secondary"
            disabled={remote.isLoading || pendingAction != null}
            type="button"
            onClick={() => {
              void remote.refresh().catch(() => {
                // The hook stores the formatted error.
              });
            }}
          >
            {remote.isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className={getStatusClassName(command)} role="status">
          {command == null ? null : <strong>{formatCommandStatusLabel(command.status)}</strong>}
          <span>{statusMessage}</span>
        </div>
      </div>
    </details>
  );
}

function DeviceStatus({ device }: { device: RemoteDevice | null }) {
  if (device == null) {
    return (
      <p className="muted no-margin">
        No Android devices registered. Open Kestrel Options and enable web remote control.
      </p>
    );
  }

  return (
    <div className="chip-row remote-device-status">
      <span className={`chip ${device.online ? 'remote-chip-online' : 'remote-chip-offline'}`}>
        {device.online ? 'online' : 'offline'}
      </span>
      <span
        className={`chip ${
          device.remoteControlEnabled ? 'remote-chip-enabled' : 'remote-chip-disabled'
        }`}
      >
        {device.remoteControlEnabled ? 'remote enabled' : 'remote disabled'}
      </span>
      {device.appVersion == null ? null : <span className="chip">v{device.appVersion}</span>}
    </div>
  );
}

function getRouteDisabledReason(
  route: Route | null,
  waypoints: RouteWaypoint[],
  speedKmh: number,
): string | null {
  if (route == null) {
    return 'Save this route before sending it to Android.';
  }

  if (waypoints.length < 2) {
    return 'Add at least 2 waypoints before playing this route.';
  }

  if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
    return 'Enter a positive default speed before playing this route.';
  }

  return null;
}

function getPanelStatusMessage({
  command,
  fallbackReason,
  isPollingCommand,
}: {
  command: RemoteCommand | null;
  fallbackReason: string | null;
  isPollingCommand: boolean;
}): string {
  if (command == null) {
    return fallbackReason ?? 'Ready to send.';
  }

  switch (command.status) {
    case 'QUEUED':
      return 'Queued; open Kestrel on Android to receive commands.';
    case 'DELIVERED':
      return 'Command delivered; waiting for result.';
    case 'APPLIED':
      return 'Applied on Android.';
    case 'FAILED':
      return command.errorMessage == null
        ? 'Failed on Android.'
        : `Failed: ${command.errorMessage}`;
    case 'EXPIRED':
      return 'Expired before Android reported a result. Open Kestrel on Android and try again.';
  }

  return isPollingCommand ? 'Waiting for Android result.' : 'Ready to send.';
}

function getStatusClassName(command: RemoteCommand | null): string {
  if (command == null) {
    return 'remote-control-status';
  }

  return `remote-control-status remote-control-status-${command.status.toLowerCase()}`;
}

function formatCommandStatusLabel(status: RemoteCommandStatus): string {
  return status
    .split('_')
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(' ');
}

function formatDeviceSummary(devices: RemoteDevice[]): string {
  const readyCount = devices.filter((device) => isRemoteDeviceCommandReady(device)).length;

  if (devices.length === 0) {
    return 'No devices';
  }

  return `${readyCount}/${devices.length} ready`;
}

function formatDeviceOption(device: RemoteDevice): string {
  const status = device.online ? 'online' : 'offline';
  const enabled = device.remoteControlEnabled ? 'enabled' : 'disabled';

  return `${device.name} - ${status}, ${enabled}`;
}
