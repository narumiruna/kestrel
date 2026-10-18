'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  getRemoteDeviceUnavailableReason,
  isRemoteDeviceCommandReady,
  useRemoteDevices,
} from '@/components/dashboard/useRemoteDevices';
import { formatRouteDistanceFromWaypoints } from '@/components/dashboard/utils';
import { PlayIcon } from '@/components/ui/icons';
import { Button, DialogFrame, SelectField } from '@/components/ui/radix-ui';
import { errorMessage } from '@/i18n/errors';
import type {
  CreateRemoteCommandRequest,
  Place,
  RemoteCommand,
  RemoteDevice,
  Route,
  RouteMode,
  RouteWaypoint,
} from '@/lib/api';

type RemoteTranslator = ReturnType<typeof useTranslations<'Remote'>>;
type RemoteControlPanelProps = {
  buildPrimaryCommand: () => CreateRemoteCommandRequest;
  primaryActionLabel: string;
  primaryDisabledReason: string | null;
};
type RemoteControlControlsProps = RemoteControlPanelProps & {
  className?: string;
  commandPreview?: {
    distance: string;
    mode: string;
    source: string;
    speed: string;
    waypointCount: number;
  };
  remote: ReturnType<typeof useRemoteDevices>;
};
type PendingAction = 'primary' | 'stop' | null;
const STOP_COMMAND: CreateRemoteCommandRequest = { payload: {}, type: 'STOP' };

export function PlaceRemoteControlAction({ place }: { place: Place | null }) {
  const t = useTranslations('Remote');
  const remote = useRemoteDevices();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <DialogFrame
      className="place-action-dialog-card"
      eyebrow={t('advancedTool')}
      open={isDialogOpen}
      title={t('title')}
      trigger={
        <Button className="secondary device-action-button" type="button">
          <span>{t('device')}</span>
          <span className="muted">{formatDeviceSummary(remote.devices, t)}</span>
        </Button>
      }
      onOpenChange={setIsDialogOpen}
    >
      <RemoteControlControls
        buildPrimaryCommand={() => {
          if (place == null) throw new Error(t('savePlace'));
          return {
            payload: { point: { latitude: place.latitude, longitude: place.longitude } },
            type: 'SET_POINT',
          };
        }}
        className="place-action-dialog-content remote-control-content"
        primaryActionLabel={t('mockOnDevice')}
        primaryDisabledReason={place == null ? t('savePlace') : null}
        remote={remote}
      />
    </DialogFrame>
  );
}

export function RouteRemoteControlAction({
  isDirty,
  mode,
  route,
  speedKmh,
  waypoints,
}: {
  isDirty: boolean;
  mode: RouteMode;
  route: Route | null;
  speedKmh: number;
  waypoints: RouteWaypoint[];
}) {
  const t = useTranslations('Remote');
  const locale = useLocale();
  const remote = useRemoteDevices();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const routeDisabledReason = getRouteDisabledReason(route, waypoints, speedKmh, t);

  return (
    <DialogFrame
      className="place-action-dialog-card"
      eyebrow={t('advancedTool')}
      open={isDialogOpen}
      title={t('title')}
      trigger={
        <Button className="secondary device-action-button" type="button">
          <PlayIcon aria-hidden />
          <span>{isDirty ? t('playDraft') : t('playSaved')}</span>
          <span className="muted">{formatDeviceSummary(remote.devices, t)}</span>
        </Button>
      }
      onOpenChange={setIsDialogOpen}
    >
      <RemoteControlControls
        buildPrimaryCommand={() => buildRouteRemoteCommand(route, waypoints, speedKmh, mode, t)}
        className="place-action-dialog-content remote-control-content"
        commandPreview={{
          distance: formatRouteDistanceFromWaypoints(waypoints, locale),
          mode: t(`mode.${mode}`),
          source: isDirty ? t('draft') : t('saved'),
          speed: Number.isFinite(speedKmh) ? t('speed', { speed: speedKmh }) : t('unknownSpeed'),
          waypointCount: waypoints.length,
        }}
        primaryActionLabel={t('play')}
        primaryDisabledReason={routeDisabledReason}
        remote={remote}
      />
    </DialogFrame>
  );
}

function RemoteControlControls({
  buildPrimaryCommand,
  className = 'route-editor-collapsible-content remote-control-content',
  commandPreview,
  primaryActionLabel,
  primaryDisabledReason,
  remote,
}: RemoteControlControlsProps) {
  const t = useTranslations('Remote');
  const errorT = useTranslations('Errors');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [command, setCommand] = useState<RemoteCommand | null>(null);
  const [commandError, setCommandError] = useState<unknown>(null);
  const [isPollingCommand, setIsPollingCommand] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const selectedDevice = useMemo(
    () => remote.devices.find((device) => device.id === selectedDeviceId) ?? null,
    [remote.devices, selectedDeviceId],
  );
  const deviceUnavailableReason = getRemoteDeviceUnavailableReason(selectedDevice, t);
  const primaryUnavailableReason = primaryDisabledReason ?? deviceUnavailableReason;
  const stopUnavailableReason = deviceUnavailableReason;

  useEffect(() => {
    setSelectedDeviceId((currentDeviceId) => {
      if (remote.devices.some((device) => device.id === currentDeviceId)) return currentDeviceId;
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
    if (selectedDevice == null) return;
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
      setCommandError(nextError);
    } finally {
      setIsPollingCommand(false);
      setPendingAction(null);
    }
  }

  function sendPrimaryCommand() {
    if (primaryUnavailableReason != null) return;
    try {
      void sendCommand(buildPrimaryCommand(), 'primary');
    } catch (nextError) {
      setCommandError(nextError);
    }
  }

  function sendStopCommand() {
    if (stopUnavailableReason != null) return;
    void sendCommand(STOP_COMMAND, 'stop');
  }

  const statusMessage = getPanelStatusMessage(t, {
    command,
    fallbackReason: primaryUnavailableReason,
    isPollingCommand,
  });

  return (
    <div className={className}>
      {remote.error == null ? null : <div className="error">{remote.error}</div>}
      {commandError == null ? null : (
        <div className="error">
          {errorMessage(commandError, (key, values) =>
            ['unexpected', 'http', 'server'].includes(key)
              ? t('commandError')
              : errorT(key, values),
          )}
        </div>
      )}
      <SelectField
        disabled={remote.devices.length === 0 || remote.isLoading || pendingAction != null}
        label={t('device')}
        options={remote.devices.map((device) => ({
          label: formatDeviceOption(device, t),
          value: device.id,
        }))}
        placeholder={remote.devices.length === 0 ? t('noAndroidDevices') : t('chooseDevice')}
        value={selectedDeviceId}
        onValueChange={setSelectedDeviceId}
      />
      <DeviceStatus device={selectedDevice} />
      {commandPreview == null ? null : (
        <section className="remote-command-preview" aria-label={t('previewLabel')}>
          <strong>{commandPreview.source}</strong>
          <span>
            {t('preview', {
              count: commandPreview.waypointCount,
              distance: commandPreview.distance,
              speed: commandPreview.speed,
              mode: commandPreview.mode,
            })}
          </span>
          {selectedDevice?.state == null || selectedDevice.state.playbackState === 'IDLE' ? null : (
            <span className="remote-replacement-warning">
              {t(`replacement.${selectedDevice.state.playbackState}`)}
            </span>
          )}
        </section>
      )}
      <div className="remote-control-actions">
        <Button
          disabled={primaryUnavailableReason != null || pendingAction != null}
          type="button"
          onClick={sendPrimaryCommand}
        >
          {pendingAction === 'primary' ? t('sending') : primaryActionLabel}
        </Button>
        <Button
          className="secondary"
          disabled={stopUnavailableReason != null || pendingAction != null}
          type="button"
          onClick={sendStopCommand}
        >
          {pendingAction === 'stop' ? t('stopping') : t('stop')}
        </Button>
        <Button
          className="secondary"
          disabled={remote.isLoading || pendingAction != null}
          type="button"
          onClick={() => {
            void remote.refresh().catch(() => {
              /* The hook stores the error. */
            });
          }}
        >
          {remote.isLoading ? t('refreshing') : t('refresh')}
        </Button>
      </div>
      <div className={getStatusClassName(command)} role="status">
        {command == null ? null : <strong>{t(`status.${command.status}`)}</strong>}
        <span>{statusMessage}</span>
      </div>
    </div>
  );
}

function DeviceStatus({ device }: { device: RemoteDevice | null }) {
  const t = useTranslations('Remote');
  if (device == null) return <p className="muted no-margin">{t('empty')}</p>;
  const isOnline = device.revokedAt == null && device.online;
  const status = device.revokedAt != null ? 'revoked' : isOnline ? 'online' : 'offline';
  return (
    <div className="chip-row remote-device-status">
      <span className={`chip ${isOnline ? 'remote-chip-online' : 'remote-chip-offline'}`}>
        {t(`deviceStatus.${status}`)}
      </span>
      <span
        className={`chip ${device.remoteControlEnabled ? 'remote-chip-enabled' : 'remote-chip-disabled'}`}
      >
        {device.remoteControlEnabled ? t('remoteEnabled') : t('remoteDisabled')}
      </span>
      {device.appVersion == null ? null : (
        <span className="chip">{t('version', { version: device.appVersion })}</span>
      )}
    </div>
  );
}

function buildRouteRemoteCommand(
  route: Route | null,
  waypoints: RouteWaypoint[],
  speedKmh: number,
  mode: RouteMode,
  t: RemoteTranslator,
): CreateRemoteCommandRequest {
  const reason = getRouteDisabledReason(route, waypoints, speedKmh, t);
  if (reason != null) throw new Error(reason);
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
}

function getRouteDisabledReason(
  route: Route | null,
  waypoints: RouteWaypoint[],
  speedKmh: number,
  t: RemoteTranslator,
): string | null {
  if (route == null) return t('saveRoute');
  if (waypoints.length < 2) return t('addWaypoints');
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return t('positiveSpeed');
  return null;
}

function getPanelStatusMessage(
  t: RemoteTranslator,
  {
    command,
    fallbackReason,
    isPollingCommand,
  }: {
    command: RemoteCommand | null;
    fallbackReason: string | null;
    isPollingCommand: boolean;
  },
): string {
  if (command == null) return fallbackReason ?? t('readyToSend');
  if (['QUEUED', 'DELIVERED', 'APPLIED', 'FAILED', 'EXPIRED'].includes(command.status))
    return t(`result.${command.status}`);
  return isPollingCommand ? t('waiting') : t('readyToSend');
}

function getStatusClassName(command: RemoteCommand | null): string {
  return command == null
    ? 'remote-control-status'
    : `remote-control-status remote-control-status-${command.status.toLowerCase()}`;
}

function formatDeviceSummary(devices: RemoteDevice[], t: RemoteTranslator): string {
  const readyCount = devices.filter((device) => isRemoteDeviceCommandReady(device)).length;
  return devices.length === 0
    ? t('noDevices')
    : t('ready', { ready: readyCount, total: devices.length });
}

function formatDeviceOption(device: RemoteDevice, t: RemoteTranslator): string {
  const status = device.revokedAt != null ? 'revoked' : device.online ? 'online' : 'offline';
  return t('deviceOption', {
    name: device.name,
    status,
    enabled: device.remoteControlEnabled ? 'yes' : 'no',
  });
}
