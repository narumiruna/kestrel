'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getSavedPlaceSnapshot } from '@/components/dashboard/savedPlaceSnapshot';
import {
  getRemoteDeviceUnavailableReason,
  isRemoteDeviceCommandReady,
  useRemoteDevices,
} from '@/components/dashboard/useRemoteDevices';
import { formatCoord, formatRouteDistanceFromWaypoints } from '@/components/dashboard/utils';
import { CheckIcon, Cross2Icon, PlayIcon, ReloadIcon } from '@/components/ui/icons';
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
  commandPreview?:
    | {
        coordinates: string;
        kind: 'place';
        name: string;
        source: string;
      }
    | {
        distance: string;
        kind: 'route';
        mode: string;
        source: string;
        speed: string;
        waypointCount: number;
      };
  remote: ReturnType<typeof useRemoteDevices>;
};
const STOP_COMMAND: CreateRemoteCommandRequest = { payload: {}, type: 'STOP' };

export function PlaceRemoteControlAction({ place }: { place: Place | null }) {
  const t = useTranslations('Remote');
  const savedPlace = getSavedPlaceSnapshot(place);
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
          if (savedPlace == null) throw new Error(t('savePlace'));
          return {
            payload: { point: savedPlace.point },
            type: 'SET_POINT',
          };
        }}
        className="place-action-dialog-content remote-control-content"
        commandPreview={
          savedPlace == null
            ? undefined
            : {
                coordinates: savedPlace.coordinates,
                kind: 'place',
                name: savedPlace.name,
                source: t('savedPlace'),
              }
        }
        primaryActionLabel={t('mockOnDevice')}
        primaryDisabledReason={place == null ? t('savePlace') : null}
        remote={remote}
      />
    </DialogFrame>
  );
}

export function RouteRemoteControlAction({
  remote,
  isDirty,
  mode,
  route,
  speedKmh,
  waypoints,
}: {
  remote: ReturnType<typeof useRemoteDevices>;
  isDirty: boolean;
  mode: RouteMode;
  route: Route | null;
  speedKmh: number;
  waypoints: RouteWaypoint[];
}) {
  const t = useTranslations('Remote');
  const locale = useLocale();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const routeDisabledReason = getRouteDisabledReason(route, waypoints, speedKmh, t);
  useEffect(() => {
    void remote.refresh();
  }, [remote.refresh]);

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
          kind: 'route',
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
  const locale = useLocale();
  const selectedDevice =
    remote.devices.find((device) => device.id === remote.selectedDeviceId) ?? null;
  const deviceUnavailableReason = getRemoteDeviceUnavailableReason(selectedDevice, t);
  const primaryUnavailableReason = primaryDisabledReason ?? deviceUnavailableReason;
  const pending = remote.pendingAction != null;
  const command = remote.command;
  let preview = pending ? undefined : commandPreview;
  if (pending && command?.type === 'SET_POINT') {
    preview = {
      kind: 'place',
      source: t('submittedCommand'),
      name: commandPreview?.kind === 'place' ? commandPreview.name : '',
      coordinates: `${formatCoord(command.payload.point.latitude)}, ${formatCoord(command.payload.point.longitude)}`,
    };
  } else if (pending && command?.type === 'START_ROUTE') {
    preview = {
      kind: 'route',
      source: t('submittedCommand'),
      distance: formatRouteDistanceFromWaypoints(command.payload.waypoints, locale),
      mode: t(`mode.${command.payload.mode}`),
      speed: t('speed', { speed: command.payload.speedKmh }),
      waypointCount: command.payload.waypoints.length,
    };
  }
  const statusMessage =
    pending && command == null
      ? remote.isSubmitting
        ? t('sending')
        : t('submissionUnknown')
      : pending && (remote.commandError != null || remote.unconfirmed)
        ? remote.commandError != null
          ? t('statusReadError')
          : t('statusUnconfirmed')
        : command == null
          ? (primaryUnavailableReason ?? t('readyToSend'))
          : t(`result.${command.status}`);
  const StatusIcon =
    command?.status === 'APPLIED'
      ? CheckIcon
      : command?.status === 'FAILED' || command?.status === 'EXPIRED'
        ? Cross2Icon
        : ReloadIcon;

  return (
    <div className={className}>
      {remote.error == null || pending ? null : (
        <div className="error" role="alert">
          {remote.error}
        </div>
      )}
      {!pending && remote.commandError != null ? (
        <div className="error" role="alert">
          {primaryUnavailableReason ?? errorMessage(remote.commandError, errorT)}
        </div>
      ) : null}
      <SelectField
        disabled={remote.devices.length === 0 || remote.isLoading || pending}
        label={t('device')}
        options={remote.devices.map((device) => ({
          label: formatDeviceOption(device, t),
          value: device.id,
        }))}
        placeholder={remote.devices.length === 0 ? t('noAndroidDevices') : t('chooseDevice')}
        value={remote.selectedDeviceId}
        onValueChange={remote.selectDevice}
      />
      <DeviceStatus device={selectedDevice} />
      {preview == null ? null : (
        <section
          className="remote-command-preview"
          aria-label={t(preview.kind === 'place' ? 'placePreviewLabel' : 'previewLabel')}
        >
          <strong>{preview.source}</strong>
          {preview.kind === 'place' ? (
            <>
              <span>{preview.name}</span>
              <span className="font-mono">{preview.coordinates}</span>
            </>
          ) : (
            <span>
              {t('preview', {
                count: preview.waypointCount,
                distance: preview.distance,
                speed: preview.speed,
                mode: preview.mode,
              })}
            </span>
          )}
          {pending ||
          selectedDevice?.state == null ||
          selectedDevice.state.playbackState === 'IDLE' ? null : (
            <span className="remote-replacement-warning">
              {t(`replacement.${selectedDevice.state.playbackState}`)}
            </span>
          )}
        </section>
      )}
      <div className="remote-control-actions">
        <Button
          disabled={primaryUnavailableReason != null || pending || remote.isLoading}
          type="button"
          onClick={() => void remote.sendCommand(buildPrimaryCommand, 'primary')}
        >
          {remote.isSubmitting && remote.pendingAction === 'primary'
            ? t('sending')
            : primaryActionLabel}
        </Button>
        <Button
          className="action-state-soft"
          highContrast
          variant="soft"
          disabled={deviceUnavailableReason != null || pending || remote.isLoading}
          type="button"
          onClick={() => void remote.sendCommand(() => STOP_COMMAND, 'stop')}
        >
          {remote.isSubmitting && remote.pendingAction === 'stop' ? t('stopping') : t('stop')}
        </Button>
        <Button
          className="action-state-soft"
          highContrast
          variant={remote.commandError != null || remote.unconfirmed ? 'solid' : 'soft'}
          disabled={remote.isRefreshing || remote.isSubmitting || remote.isPolling}
          type="button"
          onClick={() => void remote.refresh()}
        >
          <ReloadIcon /> {remote.isRefreshing ? t('refreshing') : t('refreshStatus')}
        </Button>
      </div>
      <div
        className={getStatusClassName(command)}
        role={pending && remote.commandError != null ? 'alert' : 'status'}
        aria-atomic="true"
        aria-busy={remote.isSubmitting || remote.isPolling || remote.isRefreshing}
      >
        <span className="row">
          <StatusIcon />
          {command == null ? null : (
            <strong>{t('lastConfirmed', { status: t(`status.${command.status}`) })}</strong>
          )}
        </span>
        <span>{statusMessage}</span>
        {command == null ? null : (
          <small className="font-mono">
            {t('commandReference', {
              id: command.id.length > 12 ? `…${command.id.slice(-8)}` : command.id,
            })}
          </small>
        )}
      </div>
      <p className="muted no-margin">{t('closeDoesNotCancel')}</p>
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
