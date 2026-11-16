import type { Buffer } from 'node:buffer';
export const MAX_BYTES: number;
export function hash(bytes: string | Uint8Array): string;
export function crc32(bytes: Uint8Array): number;
export function validateBytes(bytes: Buffer, mime: string): unknown;
