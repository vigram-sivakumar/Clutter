import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { ensureClutterDirectory } from '../initialize/ensureClutterDirectory';
import {
  RESOURCE_ARCHIVE_METADATA_RELATIVE_PATH,
  EMPTY_RESOURCE_ARCHIVE_METADATA_FILE_CONTENTS,
} from '../initialize/ReservedResources';

export interface ResourceArchiveMetadataEntry {
  readonly originalPath: string;
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
 * Restore should return it to — current archive provenance only, not an
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
 * Read/write is a plain read-modify-write against VaultFileSystem, the same
 * shape TagOperations.updateMetadata() already uses — no atomic temp-file
 * swap, because none of the existing `.clutter/*.json` infrastructure
 * (VaultFileSystem.writeFile, LocalFileSystem's writeTextFile) provides one
 * to reuse. Introducing one here would be a new mechanism, not a reuse of
 * an existing pattern.
 */
export class ResourceArchiveMetadataStore {
  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string
  ) {}

  /**
   * Every currently-archived resource's provenance record, keyed by its
   * current path inside Archive/. A missing file behaves as an empty store
   * — same tolerance TagOperations.readMetadata() already applies to a
   * missing tags.json (mid-scaffolding, or a vault predating this reserved
   * file).
   */
  async read(): Promise<ReadonlyMap<string, ResourceArchiveMetadataEntry>> {
    return this.readEntries();
  }

  /**
   * Records that the resource now at `archivedPath` was archived from
   * `originalPath` — called once, at the moment a resource's file has just
   * been moved into Archive/. Overwrites any existing entry for
   * `archivedPath` (there should never be one: a fresh archive always
   * targets a collision-free destination), same last-write-wins shape
   * TagOperations.updateMetadata() already uses for a tag entry.
   */
  async record(archivedPath: string, originalPath: string): Promise<void> {
    const entries = await this.readEntries();

    entries.set(archivedPath, { originalPath });

    await this.writeEntries(entries);
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
    const entries = await this.readEntries();
    const entry = entries.get(previousArchivedPath);

    if (!entry) {
      return;
    }

    entries.delete(previousArchivedPath);
    entries.set(nextArchivedPath, entry);

    await this.writeEntries(entries);
  }

  /**
   * Removes a resource's provenance record — called once Restore has
   * successfully moved the file back out of Archive/, so a stale entry
   * never outlives the archived state it describes. A no-op if no record
   * exists for `archivedPath`, mirroring updateArchivedPath's own
   * tolerance.
   */
  async remove(archivedPath: string): Promise<void> {
    const entries = await this.readEntries();

    if (!entries.has(archivedPath)) {
      return;
    }

    entries.delete(archivedPath);

    await this.writeEntries(entries);
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

    await this.fileSystem.writeFile(
      this.path,
      JSON.stringify({ resources: Object.fromEntries(entries) }, null, 2)
    );
  }
}
