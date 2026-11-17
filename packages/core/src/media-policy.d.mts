import type { AssetMeta, AssetLink } from './contracts.ts';
export type AssociationState = {
  notes: Record<string, unknown>;
  tasks: Record<string, unknown>;
  assets: Record<string, AssetMeta>;
  assetLinks: Record<string, AssetLink & { pageId: string }>;
};
export function validateAssociations<T extends AssociationState>(state: T): T;
export function admitImport(
  command: { pageId: string; attachmentId: string; role: string },
  context: {
    hasPage: (pageId: string) => boolean;
    hasAttachment: (id: string) => boolean;
    pageLinks: { role: string }[];
  }
): void;
export function id(value: unknown): value is string;
export function exact(value: unknown, keys: readonly string[]): void;
export function pageExists(
  state: Pick<AssociationState, 'notes' | 'tasks'>,
  pageId: string
): boolean;
