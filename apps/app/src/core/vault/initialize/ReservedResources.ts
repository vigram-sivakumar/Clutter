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

/**
 * Relative path of the tag presentation-metadata file, reused by
 * application bootstrap (initial load) and TagOperations (the only writer)
 * so the two don't each carry their own copy of this literal.
 */
export const TAG_METADATA_RELATIVE_PATH = '.clutter/tags.json';

/**
 * The file's shape when no tag has metadata yet — the seed contents below,
 * and the fallback both bootstrap and TagOperations read when the file is
 * missing (e.g. mid-scaffolding, or a vault predating this reserved file).
 * One literal, three readers, instead of three copies of the same string.
 */
export const EMPTY_TAG_METADATA_FILE_CONTENTS = '{"tags":{}}';

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
    type: 'folder',
    path: 'Templates',
  },
  {
    type: 'file',
    path: '.clutter/workspace.json',
    contents: '{}',
  },
  {
    type: 'file',
    path: TAG_METADATA_RELATIVE_PATH,
    contents: EMPTY_TAG_METADATA_FILE_CONTENTS,
  },
];

/**
 * Stable identifiers for reserved top-level folders.
 *
 * Use these with Vault.getReservedFolder() — do not hardcode folder names or
 * paths in navigation or application code.
 */
export const RESERVED_FOLDER_IDS = {
  clutter: '.clutter',
  'daily-notes': 'Daily Notes',
  archive: 'Archive',
  inbox: 'Inbox',
  templates: 'Templates',
} as const;

export type ReservedFolderId = keyof typeof RESERVED_FOLDER_IDS;

export function reservedFolderRelativePath(id: ReservedFolderId): string {
  return RESERVED_FOLDER_IDS[id];
}

/**
 * The inverse of reservedFolderRelativePath: which reserved id (if any) a
 * top-level folder's name corresponds to. Name-only, deliberately not
 * vault-root/path-aware — callers that need to confirm a folder is
 * actually reserved (not just named the same thing) call
 * Vault.isReservedFolder() first, the same composition
 * MembershipSelector.isWorkspaceFolder()/isSystemFolder() (ADR-023) and
 * getSystemLocationForFolder() already rely on, rather than this function
 * reimplementing that path/parentId check itself.
 */
export function reservedFolderIdForName(name: string): ReservedFolderId | undefined {
  return (Object.entries(RESERVED_FOLDER_IDS) as [ReservedFolderId, string][]).find(
    ([, folderName]) => folderName === name
  )?.[0];
}

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
 *   Reserved storage location for archived pages. Archiving is expressed
 *   through page metadata (`status: archived`); residing in Archive/ alone
 *   does not imply archived lifecycle state.
 * - Inbox
 *   Default capture location for newly created content.
 * - Templates
 *   Reusable note templates managed by Clutter.
 */
export const RESERVED_FOLDER_NAMES: ReadonlySet<string> = new Set(
  RESERVED_RESOURCES.filter(
    (resource): resource is ReservedFolder => resource.type === 'folder'
  ).map((resource) => resource.path)
);
