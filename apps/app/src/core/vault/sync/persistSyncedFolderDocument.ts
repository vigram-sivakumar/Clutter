import type { Folder } from '../models/Folder';
import type { FolderMetadata } from '../models/FolderMetadata';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FolderBuilder } from '../ingest/FolderBuilder';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { AtomicNotCommittedError, isWriteConflict } from '../atomicWrite/atomicWriteErrors';

export interface PersistSyncedFolderDocumentDeps {
  readonly fileSystem: VaultFileSystem;
  readonly serializer: FrontmatterSerializer;
  /** Called with the folder's path when the repair was refused as stale; the caller reconciles it from disk. */
  readonly onStale?: (path: string) => void;
}

export interface PersistSyncedFolderDocumentOptions {
  /** The `.folder.md` may not exist yet and may then be created (a folder with a path-derived id has none). */
  readonly mayCreate?: boolean;
  /**
   * The folder as Sync inspected it, before the repair (default: `folder` itself, for a repair that changes only the
   * id). The file must still hold exactly this metadata, **including the fields the repair is about to replace**: a
   * repair computed from an old value must not overwrite a newer one.
   */
  readonly inspected?: Folder;
  /**
   * For a repair that replaces the id: whether the id the file holds *now* still needs repairing (the duplicate is
   * still a duplicate). A file whose id another application changed meanwhile is not overwritten. Without it the file
   * must still hold the folder's own id (or none: a path-derived id has no `id` key).
   */
  readonly idStillNeedsRepair?: (onDiskId: string | undefined) => boolean;
}

const folderBuilder = new FolderBuilder();
const parser = new FrontmatterParser();

/**
 * Sync-owned write of a folder's `.folder.md` repair (duplicate id, archive metadata): the folder counterpart of
 * `persistSyncedPageDocument`, with the same rule (ADR-063): a repair is derived from the folder Sync inspected, so it
 * may replace only the text that folder was built from.
 *
 * A folder carries no content identity, and `.folder.md` is frontmatter only, so the check is semantic: the file is
 * read now, and every metadata field the repair does *not* change must still equal what the file holds. Then the file
 * is replaced only while it still holds exactly the text just read. Otherwise nothing is written and `onStale` is
 * called. Returns whether the repair was written. Any other provider writes as it always did.
 */
export async function persistSyncedFolderDocument(
  deps: PersistSyncedFolderDocumentDeps,
  folder: Folder,
  options: PersistSyncedFolderDocumentOptions = {}
): Promise<boolean> {
  const path = `${folder.path}/.folder.md`;
  const document = deps.serializer.serializeFolderDocument(folder);

  if (!deps.fileSystem.writesAreAtomic) {
    await deps.fileSystem.writeFile(path, document, options.mayCreate ? 'upsert' : 'replace');
    return true;
  }

  try {
    if (!(await deps.fileSystem.exists(path))) {
      if (!options.mayCreate) return stale(deps, folder, 'its .folder.md disappeared');
      await deps.fileSystem.writeFile(path, document, 'create');
      return true;
    }

    const current = await deps.fileSystem.readFile(path);
    if (!stillMatches(options.inspected ?? folder, folder.id, current, options.idStillNeedsRepair)) {
      return stale(deps, folder, 'its .folder.md changed after it was inspected');
    }
    await deps.fileSystem.writeFile(path, document, { replaceIf: current });

    return true;
  } catch (error) {
    if (isWriteConflict(error) || (error instanceof AtomicNotCommittedError && error.reason === 'targetMissing')) {
      return stale(deps, folder, 'its .folder.md changed or disappeared while it was being repaired');
    }
    throw error;
  }
}

/**
 * The file still holds what Sync inspected: every metadata field equal (the ones the repair will replace included),
 * and an id that is either still in need of the repair or still the folder's own.
 */
function stillMatches(
  inspected: Folder,
  repairedId: string,
  currentText: string,
  idStillNeedsRepair: ((onDiskId: string | undefined) => boolean) | undefined
): boolean {
  const onDisk = folderBuilder.build({
    parentId: inspected.parentId,
    directory: { path: inspected.path, parentPath: null, frontmatter: parser.parse(currentText).frontmatter },
  });
  const onDiskId = parser.parse(currentText).frontmatter.id;

  const idOk = idStillNeedsRepair ? idStillNeedsRepair(onDiskId) : onDiskId === undefined || onDiskId === repairedId;
  if (!idOk) return false;

  return (Object.keys(inspected.metadata) as (keyof FolderMetadata)[]).every(
    (key) => JSON.stringify(inspected.metadata[key] ?? null) === JSON.stringify(onDisk.metadata[key] ?? null)
  );
}

function stale(deps: PersistSyncedFolderDocumentDeps, folder: Folder, why: string): false {
  console.warn(`Sync: a repair of ${folder.path} was skipped because ${why}; it will be reconciled from disk.`);
  deps.onStale?.(folder.path);

  return false;
}
