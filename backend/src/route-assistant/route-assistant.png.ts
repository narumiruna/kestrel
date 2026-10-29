import { inflateSync } from 'node:zlib';
import { aiError } from '../ai/ai-errors';
import { ROUTE_ASSISTANT_LIMITS as L } from './route-assistant.models';

export function pngCrc(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate the non-interlaced, 8-bit RGB/RGBA PNG emitted by canvas. */
export function validateAssistantPng(
  value: unknown,
  width: number,
  height: number,
): void {
  const fail = (): never => aiError('RA_INVALID_PNG');
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(L.pngBytes / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    fail();
  const png = Buffer.from(value as string, 'base64');
  if (
    png.length > L.pngBytes ||
    png.length < 57 ||
    png.toString('base64') !== value ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    fail();
  const parts: Buffer[] = [];
  let offset = 8;
  let chunks = 0;
  let channels = 0;
  let ended = false;
  let idatEnded = false;
  while (offset < png.length) {
    if (++chunks > 1024) fail();
    if (offset + 12 > png.length) fail();
    const size = png.readUInt32BE(offset);
    if (size > png.length - offset - 12) fail();
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + size);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      pngCrc(png.subarray(offset + 4, offset + 8 + size)) !==
        png.readUInt32BE(offset + 8 + size)
    )
      fail();
    if (offset === 8 && type !== 'IHDR') fail();
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13) fail();
      const w = data.readUInt32BE(0),
        h = data.readUInt32BE(4);
      if (
        !w ||
        !h ||
        w > L.imageSide ||
        h > L.imageSide ||
        w * h > L.imagePixels ||
        w !== width ||
        h !== height ||
        data[8] !== 8 ||
        ![2, 6].includes(data[9]) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      )
        fail();
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      if (idatEnded || ended) fail();
      parts.push(data);
    } else if (type === 'IEND') {
      if (size !== 0 || !parts.length || offset + 12 !== png.length) fail();
      ended = true;
    } else {
      // Canvas needs no ancillary data; reject unknown critical chunks and APNG.
      if (
        type[0] === type[0].toUpperCase() ||
        ['acTL', 'fcTL', 'fdAT'].includes(type)
      )
        fail();
      if (parts.length) idatEnded = true;
    }
    offset += size + 12;
  }
  if (!ended || !channels) fail();
  const rowBytes = width * channels + 1;
  const expected = rowBytes * height;
  try {
    const result = inflateSync(Buffer.concat(parts), {
      maxOutputLength: expected,
      info: true,
    }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    if (
      result.buffer.length !== expected ||
      result.engine.bytesWritten !==
        parts.reduce((sum, part) => sum + part.length, 0)
    )
      fail();
    for (let row = 0; row < height; row++)
      if (result.buffer[row * rowBytes] > 4) fail();
  } catch {
    fail();
  }
}
