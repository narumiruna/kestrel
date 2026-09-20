import { RouteMode } from '@prisma/client';
import { InternalServerErrorException } from '../http/errors';
import {
  createRouteRevisionPayload,
  parseStoredRouteRevisionPayload,
} from './route-revision.codec';

describe('route revision codec', () => {
  it('parses nullable waypoint metadata and orders waypoints by sequence', () => {
    const result = parseStoredRouteRevisionPayload({
      defaultSpeedKmh: 12.5,
      mode: RouteMode.PING_PONG,
      waypoints: [
        {
          latitude: 25.2,
          longitude: 121.2,
          pauseSeconds: null,
          sequence: 2,
          speedKmh: null,
        },
        {
          latitude: 25,
          longitude: 121,
          pauseSeconds: 3,
          sequence: 0,
          speedKmh: 8,
        },
      ],
    });

    expect(result).toEqual({
      defaultSpeedKmh: 12.5,
      mode: RouteMode.PING_PONG,
      waypoints: [
        {
          latitude: 25,
          longitude: 121,
          pauseSeconds: 3,
          sequence: 0,
          speedKmh: 8,
        },
        {
          latitude: 25.2,
          longitude: 121.2,
          pauseSeconds: null,
          sequence: 2,
          speedKmh: null,
        },
      ],
    });
  });

  it.each([null, [], 'invalid', { mode: RouteMode.ONCE, waypoints: [] }])(
    'rejects an invalid stored payload: %p',
    (payload) => {
      expect(() => parseStoredRouteRevisionPayload(payload)).toThrow(
        new InternalServerErrorException(
          'stored route revision payload is invalid',
        ),
      );
    },
  );

  it('rejects malformed stored waypoints with their index', () => {
    expect(() =>
      parseStoredRouteRevisionPayload({
        defaultSpeedKmh: 10,
        mode: RouteMode.ONCE,
        waypoints: [
          {
            latitude: Number.NaN,
            longitude: 121,
            pauseSeconds: null,
            sequence: 0,
            speedKmh: null,
          },
        ],
      }),
    ).toThrow(
      new InternalServerErrorException('stored route waypoint 0 is invalid'),
    );
  });

  it('derives waypoint sequences when serializing a new revision', () => {
    expect(
      createRouteRevisionPayload({
        defaultSpeedKmh: 10,
        mode: RouteMode.LOOP,
        waypoints: [
          {
            latitude: 25,
            longitude: 121,
            pauseSeconds: null,
            speedKmh: null,
          },
          {
            latitude: 25.1,
            longitude: 121.1,
            pauseSeconds: 2,
            speedKmh: 7,
          },
        ],
      }),
    ).toEqual({
      defaultSpeedKmh: 10,
      mode: RouteMode.LOOP,
      waypoints: [
        {
          latitude: 25,
          longitude: 121,
          pauseSeconds: null,
          sequence: 0,
          speedKmh: null,
        },
        {
          latitude: 25.1,
          longitude: 121.1,
          pauseSeconds: 2,
          sequence: 1,
          speedKmh: 7,
        },
      ],
    });
  });

  it('retains explicit waypoint sequences when serializing a copied revision', () => {
    const payload = createRouteRevisionPayload({
      defaultSpeedKmh: 10,
      mode: RouteMode.ONCE,
      waypoints: [
        {
          latitude: 25,
          longitude: 121,
          pauseSeconds: null,
          sequence: 4,
          speedKmh: null,
        },
      ],
    });

    expect(payload.waypoints).toEqual([
      {
        latitude: 25,
        longitude: 121,
        pauseSeconds: null,
        sequence: 4,
        speedKmh: null,
      },
    ]);
  });
});
