import { Fault } from './contracts.ts';
export const PAGE_CODEC = 'clutter-page-y-v2';
export function pageRootPrefix(pageId: string, kind: string): Uint8Array {
  if (
    !['notes', 'tasks'].includes(kind) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(pageId)
  )
    throw new Fault('UNSUPPORTED_PAGE_CODEC');
  return new TextEncoder().encode(
    PAGE_CODEC + '\0schema2\0yjs13.6.33\0' + pageId + '\0' + kind + '\0'
  );
}
export function pageRootPayload(
  bytes: Uint8Array,
  pageId: string,
  kind: string
): Uint8Array {
  const prefix = pageRootPrefix(pageId, kind);
  if (
    bytes.length > 1500000 ||
    bytes.length < prefix.length ||
    prefix.some((v, i) => bytes[i] !== v)
  )
    throw new Fault('UNSUPPORTED_PAGE_CODEC');
  return bytes.subarray(prefix.length);
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const value = await globalThis.crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes).buffer
  );
  return [...new Uint8Array(value)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
