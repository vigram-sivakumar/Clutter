import type { Buffer } from 'node:buffer';
import type { AssetMeta } from '../contracts.ts';
export type AssetFileHost = {
  dir: string;
  phase: (name: string, command: unknown) => Promise<void>;
};
export function syncDirectory(path: string): void;
export function directories(
  host: AssetFileHost,
  options?: { create?: boolean }
): { media: string; objects: string; staging: string };
export function readObject(
  host: AssetFileHost,
  digest: string,
  meta: AssetMeta
): Buffer;
export function publish(
  host: AssetFileHost,
  command: { mime: string },
  bytes: Buffer
): Promise<{ digest: string; meta: AssetMeta }>;
