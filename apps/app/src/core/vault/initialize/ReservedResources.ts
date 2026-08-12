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

import { VaultPath } from '../ingest/VaultPath';
import { DailyNotePath } from '../ingest/DailyNotePath';

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
 * actually reserved (not just named the same thing) go through
 * MembershipSelector.isSystemFolder()/isWorkspaceFolder() (ADR-023) —
 * which itself calls Vault.isReservedFolder(), the one path/parentId-aware
 * check — rather than this function reimplementing that check itself.
 */
export function reservedFolderIdForName(name: string): ReservedFolderId | undefined {
  return (Object.entries(RESERVED_FOLDER_IDS) as [ReservedFolderId, string][]).find(
    ([, folderName]) => folderName === name
  )?.[0];
}

/**
 * Whether `path` is a descendant of the reserved Daily Notes folder.
 * Location only — does not imply a valid Daily Note filename. Any depth
 * counts, same descendant semantics used for Archive membership elsewhere
 * (VaultPath.isDescendantOf). String-only (vaultRoot, not a Vault
 * instance) so this can be called before a Vault exists yet, during the
 * initial scan.
 *
 * Not the classification rule by itself — see isDailyNotePath(), which
 * additionally requires the canonical filename convention. Exported
 * separately because it's still useful on its own (e.g. Archive
 * reconciliation asking "did this used to live under Daily Notes" without
 * caring whether the name was ever valid).
 */
export function isInsideDailyNotesFolder(vaultRoot: string, path: string): boolean {
  return VaultPath.isDescendantOf(
    path,
    `${vaultRoot}/${RESERVED_FOLDER_IDS['daily-notes']}`
  );
}

/**
 * The sole classification rule for a page's Daily Note vs. Note role (that
 * role is derived from the current path, never persisted frontmatter —
 * frontmatter.type, if present on disk, is inert legacy data, see
 * FrontmatterSerializer). A page is a Daily Note only if it is both
 * located under Daily Notes/ AND its path is the exact canonical Daily
 * Note path for some date (DailyNotePath.matchesCanonicalPath) — a
 * malformed/external Markdown file placed inside Daily Notes (wrong
 * filename, non-canonical folder names, extra nesting) classifies as an
 * ordinary Note instead, so no Daily Note consumer ever has to guard
 * against treating a non-date string as a date.
 */
export function isDailyNotePath(vaultRoot: string, path: string): boolean {
  return (
    isInsideDailyNotesFolder(vaultRoot, path) &&
    DailyNotePath.matchesCanonicalPath(vaultRoot, path)
  );
}

/**
 * Whether `path` is `.clutter` itself or something nested inside it —
 * Clutter's own application-infrastructure directory, never user content.
 * This is the one path the vault/filesystem discovery pipeline (initial
 * scan and incremental sync alike) excludes by name; every other
 * dot-prefixed file or folder (`.git`, `.obsidian`, a user's own
 * `.Project`, etc.) is ordinary vault content and must be discovered like
 * anything else — the vault stays a normal, portable Markdown filesystem.
 */
export function isClutterInternalPath(vaultRoot: string, path: string): boolean {
  const clutterPath = `${vaultRoot}/${RESERVED_FOLDER_IDS.clutter}`;
  return path === clutterPath || path.startsWith(`${clutterPath}/`);
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
