import { VaultPath } from '../ingest/VaultPath';
import type { Folder } from './Folder';
import type { Page } from './Page';
import type { VaultResource } from './VaultResource';

/**
 * Finding an archived item by where it came from.
 *
 * Archiving moves a file into `Archive/` and nothing rewrites the references to it, so a reference such as
 * `[[Projects/Note]]` names a location the item no longer occupies. The location it left is recorded as
 * provenance (a note's and a folder's `originalPath`, an asset's record in `.clutter/resource-archive.json`), and an
 * item inside an archived folder left from wherever its folder did. This is the one place that reads that
 * provenance for reference resolution.
 *
 * - Where an item IS decides whether it is archived (under `Archive/`); recorded provenance on an item that is not
 *   there is never read.
 * - Matching is by the full path, through `VaultPath.normalizeForMatch` on both sides. Never by title or filename.
 * - More than one archived item claiming a path is `ambiguous`: nothing here ever picks one.
 * - Read-only and synchronous.
 */
export type ArchivedLookup<T> =
  | { readonly status: 'unique'; readonly item: T }
  | { readonly status: 'ambiguous' }
  | { readonly status: 'none' };

/** Where archived assets came from, by their current path in `Archive/`. */
export interface ArchivedResourceOrigins {
  originalPathOf(archivedPath: string): string | undefined;
}

export interface ArchivedOriginSource {
  /** `<root>/Archive`. */
  readonly archivePath: string;
  pages(): Iterable<Page>;
  folders(): Iterable<Folder>;
  resources(): Iterable<VaultResource>;
  getFolderByPath(path: string): Folder | undefined;
  readonly resourceOrigins: ArchivedResourceOrigins | null;
}

/**
 * The location an item under `Archive/` was archived from, or undefined when it is not archived or nothing
 * records it. `direct` is the item's own recorded original path, used only when it sits directly in `Archive/`.
 */
function originOf(source: ArchivedOriginSource, itemPath: string, direct: string | null | undefined): string | undefined {
  const archive = source.archivePath;

  if (!VaultPath.isDescendantOf(itemPath, archive)) return undefined;

  if (VaultPath.parentDirectory(itemPath) === archive) {
    return direct ? VaultPath.normalizeForMatch(direct) : undefined;
  }

  // Deeper: it left with the folder that sits directly in `Archive/`, from that folder's own place.
  const topName = itemPath.slice(archive.length + 1).split('/')[0] as string;
  const topPath = `${archive}/${topName}`;
  const topOrigin = source.getFolderByPath(topPath)?.metadata.originalPath;

  return topOrigin ? `${VaultPath.normalizeForMatch(topOrigin)}${itemPath.slice(topPath.length)}` : undefined;
}

function find<T>(
  items: Iterable<T>,
  target: string,
  originFor: (item: T) => string | undefined
): ArchivedLookup<T> {
  let found: T | undefined;
  let count = 0;

  for (const item of items) {
    if (originFor(item) === target) {
      found = item;
      count += 1;
      if (count > 1) return { status: 'ambiguous' };
    }
  }

  return count === 1 ? { status: 'unique', item: found as T } : { status: 'none' };
}

export function findArchivedPageByOrigin(source: ArchivedOriginSource, absolutePath: string): ArchivedLookup<Page> {
  return find(source.pages(), VaultPath.normalizeForMatch(absolutePath), (page) =>
    originOf(source, page.path, page.metadata.originalPath)
  );
}

export function findArchivedFolderByOrigin(source: ArchivedOriginSource, absolutePath: string): ArchivedLookup<Folder> {
  return find(source.folders(), VaultPath.normalizeForMatch(absolutePath), (folder) =>
    originOf(source, folder.path, folder.metadata.originalPath)
  );
}

export function findArchivedResourceByOrigin(
  source: ArchivedOriginSource,
  absolutePath: string
): ArchivedLookup<VaultResource> {
  return find(source.resources(), VaultPath.normalizeForMatch(absolutePath), (resource) =>
    originOf(source, resource.path, source.resourceOrigins?.originalPathOf(resource.path))
  );
}
