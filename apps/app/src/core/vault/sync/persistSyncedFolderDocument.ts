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
  /** The metadata fields the repair itself changes: they are not expected to match the file. */
  readonly repairs?: readonly (keyof FolderMetadata)[];
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
    if (!stillMatches(folder, current, options.repairs ?? [])) {
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

/** The metadata the file holds equals the folder's, apart from the fields the repair changes (and the id). */
function stillMatches(folder: Folder, currentText: string, repairs: readonly (keyof FolderMetadata)[]): boolean {
  const onDisk = folderBuilder.build({
    parentId: folder.parentId,
    directory: { path: folder.path, parentPath: null, frontmatter: parser.parse(currentText).frontmatter },
  }).metadata;

  return (Object.keys(folder.metadata) as (keyof FolderMetadata)[])
    .filter((key) => !repairs.includes(key))
    .every((key) => JSON.stringify(folder.metadata[key] ?? null) === JSON.stringify(onDisk[key] ?? null));
}

function stale(deps: PersistSyncedFolderDocumentDeps, folder: Folder, why: string): false {
  console.warn(`Sync: a repair of ${folder.path} was skipped because ${why}; it will be reconciled from disk.`);
  deps.onStale?.(folder.path);

  return false;
}
