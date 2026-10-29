import { deflateSync } from 'node:zlib';
import { AssistantRunInput } from './route-assistant.models';
import { pngCrc } from './route-assistant.png';

export function fixturePng(width = 20, height = 20, raw?: Buffer): string {
  const chunk = (name: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(name), data]);
    const result = Buffer.alloc(body.length + 8);
    result.writeUInt32BE(data.length);
    body.copy(result, 4);
    result.writeUInt32BE(pngCrc(body), body.length + 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw ?? Buffer.alloc((width * 4 + 1) * height))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}
export function fixtureInput(): AssistantRunInput {
  return {
    request: 'Trace visible path',
    loopTargetMeters: null,
    snapshot: {
      binding: {
        userId: 'user',
        sessionId: 'session',
        editorId: 'editor',
        routeId: 'new:route',
        draftGeneration: 1,
        settingsGeneration: 2,
        connectionGeneration: 3,
        runId: 'run',
        captureId: 'capture',
      },
      capturedAt: 1000000,
      png: fixturePng(),
      view: {
        projection: 'mercator',
        pitch: 0,
        bearing: 0,
        zoom: 10,
        center: [0, 0],
        bounds: [-1, -1, 1, 1],
        style: 'plain',
        cssWidth: 20,
        cssHeight: 20,
        canvasWidth: 20,
        canvasHeight: 20,
        width: 20,
        height: 20,
        pixelScale: 1,
        mapRect: { left: 2, top: 2, width: 16, height: 16 },
      },
      transform: {
        origin: [0.499, 0.499],
        xAxis: [0.002, 0],
        yAxis: [0, 0.002],
        checks: [
          { u: 0, v: 0, x: 0.499, y: 0.499 },
          { u: 1, v: 0, x: 0.501, y: 0.499 },
          { u: 0, v: 1, x: 0.499, y: 0.501 },
          { u: 1, v: 1, x: 0.501, y: 0.501 },
        ],
      },
      waypoints: [
        {
          draftId: 'a',
          latitude: 0,
          longitude: 0,
          speedKmh: 5,
          pauseSeconds: 2,
        },
        {
          draftId: 'b',
          latitude: 0,
          longitude: 0.1,
          speedKmh: null,
          pauseSeconds: null,
        },
      ],
      visibleMarkers: [{ draftId: 'a', label: '1', u: 0.5, v: 0.5 }],
    },
  };
}
