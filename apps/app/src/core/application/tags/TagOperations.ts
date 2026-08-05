import { Vault } from '../../vault/models/Vault';
import { normalizeTagName, type TagMetadataEntry } from '../../vault/models/Tag';
import { TAG_METADATA_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * Owns the entire lifecycle of Tag presentation metadata (icon today,
 * color later) — the one file every caller updates through.
 *
 * Tag metadata is presentation configuration, not Vault knowledge: it is
 * not parsed from Markdown, never duplicated onto TagOccurrence, and not
 * Vault domain content, so it is never routed through the Persistence
 * Gate (ARCHITECTURE_RULES.md rule 2's .clutter/* scope carve-out).
 * TagOperations reads and writes .clutter/tags.json directly via
 * VaultFileSystem, the same relationship VaultInitializer already has with
 * .clutter/workspace.json — no store, no loader, no queue, no
 * serialization module. The JSON shape is trivial enough that the small
 * "raw object -> normalized Map" transform below is duplicated (not
 * shared) with application bootstrap's equivalent startup-time read; if
 * the format ever grows real structure, that's the trigger to factor out
 * a shared primitive, not before.
 *
 * PagePersistenceCoordinator and VaultSyncService never call this class
 * and never reference tags.json — Save and Sync are completely unaware
 * this file exists.
 */
export class TagOperations {
  constructor(
    private readonly vault: Vault,
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string
  ) {}

  /**
   * One mutation method, extensible by field (icon today, color later)
   * rather than by method count — mirrors PageOperations.updateMetadata().
   */
  async updateMetadata(
    name: string,
    patch: Partial<TagMetadataEntry>
  ): Promise<void> {
    const normalized = normalizeTagName(name);
    const path = `${this.rootPath}/${TAG_METADATA_RELATIVE_PATH}`;

    const next = new Map(await this.readMetadata(path));

    const merged: TagMetadataEntry = { ...next.get(normalized), ...patch };

    if (Object.values(merged).every((value) => value === undefined)) {
      next.delete(normalized);
    } else {
      next.set(normalized, merged);
    }

    await this.fileSystem.writeFile(
      path,
      JSON.stringify({ tags: Object.fromEntries(next) }, null, 2)
    );

    this.vault.setTagMetadata(next);
  }

  private async readMetadata(
    path: string
  ): Promise<ReadonlyMap<string, TagMetadataEntry>> {
    const content = (await this.fileSystem.exists(path))
      ? await this.fileSystem.readFile(path)
      : '{"tags":{}}';

    const raw = (JSON.parse(content).tags ?? {}) as Record<
      string,
      TagMetadataEntry
    >;

    return new Map(
      Object.entries(raw).map(([key, value]) => [normalizeTagName(key), value])
    );
  }
}
