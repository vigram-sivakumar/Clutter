/**
 * Reserved resources owned by Clutter.
 *
 * These resources define the minimum filesystem structure required for a
 * valid Clutter vault. The VaultInitializer reconciles the user's vault
 * against this specification during startup.
 *
 * User content belongs in the vault.
 * Application infrastructure belongs in reserved resources.
 *
 * Reserved resources are owned and managed by Clutter. They represent application infrastructure rather than user-created organizational structure and provide stable locations for system features.
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

/**
 * Top-level folder names owned by Clutter as application infrastructure.
 * These are real Folder entities in the vault, but they are not generic
 * user content and should not surface in generic folder navigation
 * (e.g. the Notes sidebar tab) — reserved folders get their own dedicated
 * surface (e.g. Daily Notes has its own tab) or none yet.
 *
 * Reserved folders:
 * - .clutter
 *   Internal application data.
 * - Daily Notes
 *   Stores daily notes managed by Clutter.
 * - Archive
 *   Stores archived pages. A page is considered archived because it resides in
 *   this folder, not because of an `archived` metadata flag. When a page is
 *   archived, `originalParentId` is recorded so the page can later be restored
 *   to its previous location.
 * - Inbox
 *   Default capture location for newly created content.
 */
export const RESERVED_FOLDER_NAMES: ReadonlySet<string> = new Set(
  RESERVED_RESOURCES.filter(
    (resource): resource is ReservedFolder => resource.type === 'folder'
  ).map((resource) => resource.path)
);
