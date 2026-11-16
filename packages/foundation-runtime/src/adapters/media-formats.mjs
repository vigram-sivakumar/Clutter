import { MAX_ASSET_BYTES } from '../contracts.ts';
// Deliberately bounded fixture admission, NOT a general PDF/image security parser.
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
export const MAX_BYTES = MAX_ASSET_BYTES;
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validateBytes(bytes, mime) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES)
    throw Error('ASSET_BYTE_LIMIT');
  if (mime === 'image/png') {
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
      throw Error('INVALID_PNG');
    let offset = 8,
      width,
      height,
      end = false;
    const chunks = [];
    let count = 0;
    while (offset < bytes.length) {
      if (++count > 128 || offset + 12 > bytes.length)
        throw Error('INVALID_PNG');
      const n = bytes.readUInt32BE(offset),
        type = bytes.toString('ascii', offset + 4, offset + 8),
        next = offset + 12 + n;
      if (
        next > bytes.length ||
        crc32(bytes.subarray(offset + 4, next - 4)) !==
          bytes.readUInt32BE(next - 4)
      )
        throw Error('INVALID_PNG');
      const data = bytes.subarray(offset + 8, next - 4);
      if (type === 'IHDR') {
        if (offset !== 8 || n !== 13) throw Error('INVALID_PNG');
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        if (
          !width ||
          !height ||
          width > 256 ||
          height > 256 ||
          data[8] !== 8 ||
          data[9] !== 6 ||
          data[10] ||
          data[11] ||
          data[12]
        )
          throw Error('UNSUPPORTED_PNG_LAYOUT');
      } else if (type === 'IDAT') {
        if (!width || end) throw Error('INVALID_PNG');
        chunks.push(data);
      } else if (type === 'IEND') {
        if (n || next !== bytes.length || !chunks.length)
          throw Error('INVALID_PNG');
        end = true;
      } else throw Error('UNSUPPORTED_PNG_LAYOUT');
      offset = next;
    }
    if (!end) throw Error('INVALID_PNG');
    let rows;
    try {
      rows = inflateSync(Buffer.concat(chunks), { maxOutputLength: 263000 });
    } catch {
      throw Error('INVALID_PNG_DEFLATE');
    }
    const stride = width * 4 + 1;
    if (rows.length !== stride * height) throw Error('INVALID_PNG_PIXELS');
    for (let y = 0; y < height; y++)
      if (rows[y * stride] > 4) throw Error('INVALID_PNG_FILTER');
    return { width, height };
  }
  if (mime === 'application/pdf') {
    const text = bytes.toString('latin1'),
      match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
    if (
      !/^%PDF-1\.[0-7][\r\n]/.test(text) ||
      !match ||
      !text.includes('/Type /Page') ||
      !text.includes('/Root ') ||
      text.slice(Number(match[1]), Number(match[1]) + 4) !== 'xref' ||
      !/trailer\s*<</.test(text) ||
      /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|Encrypt)\b/.test(text)
    )
      throw Error('UNSUPPORTED_OR_INVALID_PDF');
    return {
      validation:
        'bounded conventional-xref structural subset; not a general PDF decoder',
    };
  }
  throw Error('UNSUPPORTED_ASSET_MIME');
}
