/**
 * Reserved resources owned by Clutter.
 *
 * These resources define the minimum filesystem structure required for a
 * valid Clutter vault. The VaultInitializer reconciles the user's vault
 * against this specification during startup.
 *
 * User content belongs in the vault.
 * Application infrastructure belongs in reserved resources.
 */

export interface ReservedFolder {
  readonly type: 'folder';
  readonly path: string;
}

export interface ReservedFile {
  readonly type: 'file';
  readonly path: string;
  readonly contents: string;
}

export type ReservedResource = ReservedFolder | ReservedFile;

export const RESERVED_RESOURCES: readonly ReservedResource[] = [
  {
    type: 'folder',
    path: '.clutter',
  },
  {
    type: 'folder',
    path: 'Daily Notes',
  },
  {
    type: 'folder',
    path: 'Archive',
  },
  {
    type: 'folder',
    path: 'Inbox',
  },
  {
    type: 'file',
    path: '.clutter/workspace.json',
    contents: '{}',
  },
];
