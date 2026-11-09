import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { writeFileAtomic } from './writeFileAtomic';
import { ensureClutterDirectory } from '../initialize/ensureClutterDirectory';
import {
  RESOURCE_ARCHIVE_METADATA_RELATIVE_PATH,
  EMPTY_RESOURCE_ARCHIVE_METADATA_FILE_CONTENTS,
} from '../initialize/ReservedResources';

export interface ResourceArchiveMetadataEntry {
  readonly originalPath: string;
  /**
   * The ISO instant the app archived the file — set once, at the moment of the archive, and gone with
   * the record when the file is restored. Absent for a file archived before this was recorded (there
   * is nothing to infer it from: moving a file keeps its filesystem dates), and for a file that was
   * moved into Archive/ outside the app.
   */
  readonly archivedAt?: string;
}

/**
 * Owns `.clutter/resource-archive.json` end-to-end — the VaultResource
 * counterpart to TagOperations' ownership of `.clutter/tags.json`, same
 * pattern exactly: reads and writes the file directly via VaultFileSystem,
 * outside the Persistence Gate (ARCHITECTURE_RULES.md rule 2's `.clutter/*`
 * carve-out — this is Clutter-owned application infrastructure, never Vault
 * domain content, so it never becomes a `Page`/`Folder`/`VaultResource`
 * mutation). `.clutter` itself is lazily ensured immediately before every
 * write, never assumed to already exist, mirroring
 * TagOperations.updateMetadata()'s own `ensureClutterDirectory` call.
 *
 * Records, for each VaultResource currently sitting in Archive/, the path
 * Restore should return it to and the date it was archived — current archive provenance only, not an
 * append-only history/log: once a resource is restored (or its record is
 * otherwise removed), nothing here remembers it was ever archived.
 *
 * Lives in `vault/persistence/` (not `application/`), mirroring MoveService:
 * the future Persistence Gate dispatch for resource archive/restore needs
 * to call this directly, and the Gate must never depend upward on the
 * application layer (rule 7).
 *
 * Deliberately no `originalParentId` — Restore derives the destination
 * folder from `originalPath`'s parent directory at restore time, exactly
 * like MoveService.resolveRestoreDestination/FolderPathResolver.
 * resolveRestoreDestination already do for Page/Folder.
 *
 * Read/write is a read-modify-write serialised by the queue below. The write goes through `writeFileAtomic`, the
 * same helper `TagMetadataStore` uses: on the packaged app's provider (`writesAreAtomic`, ADR-063) that is the native
 * temp-file / fsync / rename replace, so a reader or a crash sees the old file or the new one, never a torn one; on a
 * provider that cannot do that it stages a sibling temp file and renames it over the target. A failed write leaves
 * the previous file untouched.
 */
export class ResourceArchiveMetadataStore {
  /**
   * Every read and every read-modify-write runs through this one chain, one at a time. Without it two overlapping
   * operations read the same starting state and the later write replaces the earlier one, losing a record (an
   * archive racing a restore could resurrect or drop one): a lost *logical* update that no atomic file write can
   * prevent. Same shape as `TagMetadataStore`'s queue. In-process only: another Clutter process is not serialised
   * by it.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    // A failed operation must not wedge the queue for the next caller (its own caller still sees the failure).
    this.queue = run.catch(() => {});
    return run;
  }

  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    /**
     * Told the whole record set after every read and every successful write, inside this store's queue, so an
     * in-memory copy (reference resolution) is current before the operation that changed it completes.
     */
    private readonly onEntries: (entries: ReadonlyMap<string, ResourceArchiveMetadataEntry>) => void = () => {}
  ) {}

  /**
   * Every currently-archived resource's provenance record, keyed by its
   * current path inside Archive/. A missing file behaves as an empty store
   * — same tolerance TagOperations.readMetadata() already applies to a
   * missing tags.json (mid-scaffolding, or a vault predating this reserved
   * file).
   */
  async read(): Promise<ReadonlyMap<string, ResourceArchiveMetadataEntry>> {
    return this.enqueue(async () => {
      const entries = await this.readEntries();
      this.onEntries(new Map(entries));
      return entries;
    });
  }

  /**
   * Records that the resource now at `archivedPath` was archived from
   * `originalPath` — called once, at the moment a resource's file has just
   * been moved into Archive/. Overwrites any existing entry for
   * `archivedPath` (there should never be one: a fresh archive always
   * targets a collision-free destination), same last-write-wins shape
   * TagOperations.updateMetadata() already uses for a tag entry.
   */
  async record(
    archivedPath: string,
    originalPath: string,
    archivedAt: string = new Date().toISOString()
  ): Promise<void> {
    return this.enqueue(async () => {
      const entries = await this.readEntries();

      entries.set(archivedPath, { originalPath, archivedAt });

      await this.writeEntries(entries);
    });
  }

  /**
   * Re-keys an archived resource's record after it was renamed while still
   * inside Archive/ — the archived-path key changes, but the `originalPath`
   * it should eventually restore to does not. A no-op if no record exists
   * for `previousArchivedPath` (nothing to carry forward), the same lenient
   * "absent means nothing to do" shape this store applies throughout rather
   * than throwing on a caller that raced or double-invoked.
   */
  async updateArchivedPath(
    previousArchivedPath: string,
    nextArchivedPath: string
  ): Promise<void> {
    return this.enqueue(async () => {
      const entries = await this.readEntries();
      const entry = entries.get(previousArchivedPath);

      if (!entry) {
        return;
      }

      entries.delete(previousArchivedPath);
      entries.set(nextArchivedPath, entry);

      await this.writeEntries(entries);
    });
  }

  /**
   * Removes a resource's provenance record — called once Restore has
   * successfully moved the file back out of Archive/, so a stale entry
   * never outlives the archived state it describes. A no-op if no record
   * exists for `archivedPath`, mirroring updateArchivedPath's own
   * tolerance.
   */
  async remove(archivedPath: string): Promise<void> {
    return this.enqueue(async () => {
      const entries = await this.readEntries();

      if (!entries.has(archivedPath)) {
        return;
      }

      entries.delete(archivedPath);

      await this.writeEntries(entries);
    });
  }

  /**
   * Drops the records of archived files that are confirmed to be gone, so a record never outlives the file it
   * describes. Never touches a file. For each candidate (every record when `candidates` is omitted) that still has a
   * record when its turn comes, `isConfirmedMissing` is asked, inside this store's queue: a record is removed only
   * when it answers a definite `true`. A `false`, or an answer that throws, keeps the record, so an uncertain
   * filesystem state (permissions, an unreachable directory, a transient error) never costs anyone a restore
   * destination. The file is rewritten once, and only when something was removed. Returns the paths removed.
   */
  async removeRecordsOfMissingFiles(
    isConfirmedMissing: (archivedPath: string) => Promise<boolean>,
    candidates?: readonly string[]
  ): Promise<readonly string[]> {
    return this.enqueue(async () => {
      const entries = await this.readEntries();
      const removed: string[] = [];

      for (const archivedPath of candidates ?? [...entries.keys()]) {
        if (!entries.has(archivedPath)) continue;

        let missing = false;
        try {
          missing = (await isConfirmedMissing(archivedPath)) === true;
        } catch {
          missing = false;
        }

        if (missing) {
          entries.delete(archivedPath);
          removed.push(archivedPath);
        }
      }

      if (removed.length > 0) {
        await this.writeEntries(entries);
      }

      return removed;
    });
  }

  private get path(): string {
    return `${this.rootPath}/${RESOURCE_ARCHIVE_METADATA_RELATIVE_PATH}`;
  }

  private async readEntries(): Promise<Map<string, ResourceArchiveMetadataEntry>> {
    const content = (await this.fileSystem.exists(this.path))
      ? await this.fileSystem.readFile(this.path)
      : EMPTY_RESOURCE_ARCHIVE_METADATA_FILE_CONTENTS;

    const raw = (JSON.parse(content).resources ?? {}) as Record<
      string,
      ResourceArchiveMetadataEntry
    >;

    return new Map(Object.entries(raw));
  }

  private async writeEntries(
    entries: ReadonlyMap<string, ResourceArchiveMetadataEntry>
  ): Promise<void> {
    await ensureClutterDirectory(this.fileSystem, this.rootPath);

    await writeFileAtomic(
      this.fileSystem,
      this.path,
      JSON.stringify({ resources: Object.fromEntries(entries) }, null, 2)
    );

    this.onEntries(new Map(entries));
  }
}
