import { Vault } from '../../vault/models/Vault';
import { normalizeTagName, serializeTagName, type Tag, type TagMetadataEntry } from '../../vault/models/Tag';
import {
  TAG_METADATA_RELATIVE_PATH,
  EMPTY_TAG_METADATA_FILE_CONTENTS,
} from '../../vault/initialize/ReservedResources';
import { ensureClutterDirectory } from '../../vault/initialize/ensureClutterDirectory';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type { PageOperations } from '../page/PageOperations';

/**
 * Matches a `#identifier` occurrence in one line of Markdown — deliberately
 * mirroring `TagExtractor.ts`'s own already-shipped regex
 * (`/(^|\s)#([a-zA-Z0-9_-]+)/g`) rather than importing/exporting it: same
 * non-sharing-across-layers precedent `tagScanner.ts`'s own `TAG_NAME_PATTERN`
 * doc comment already establishes for this exact grammar (Vault Ingest's
 * extractor vs. an independent consumer of the same shape) — this is the
 * Application layer, not Vault Ingest, and `TagExtractor.ts` is explicitly
 * out of scope for this feature. Two independently-maintained regexes
 * expressing the same grammar shape, not one shared implementation.
 */
const TAG_OCCURRENCE_PATTERN = /(^|\s)#([a-zA-Z0-9_-]+)/g;

/**
 * The exact identifier grammar `TagExtractor.ts`/`tagScanner.ts` already
 * define (`[A-Za-z0-9_-]+`), anchored to the *whole* canonical name —
 * same non-sharing-across-layers precedent as `TAG_OCCURRENCE_PATTERN`
 * above. Checked against the *serialized* name (after `serializeTagName`
 * has already turned whitespace into `-`), not the raw typed value: a
 * space is fine pre-serialization, but anything else outside this
 * character class (a colon, a slash, ...) would survive serialization
 * unchanged and produce a `#`-token `TagExtractor`'s own regex can never
 * fully re-parse back out (it stops at the first disallowed character,
 * silently truncating the tag) — this must be rejected before ever being
 * written, not discovered only once mis-parsed back out of Markdown.
 */
const VALID_CANONICAL_TAG_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Owns the entire lifecycle of Tag presentation metadata (icon today,
 * color later) — the one file every caller updates through.
 *
 * Tag metadata is presentation configuration, not Vault knowledge: it is
 * not parsed from Markdown, never duplicated onto TagOccurrence, and not
 * Vault domain content, so it is never routed through the Persistence
 * Gate (ARCHITECTURE_RULES.md rule 2's .clutter/* scope carve-out).
 * TagOperations reads and writes .clutter/tags.json directly via
 * VaultFileSystem — no store, no loader, no queue, no serialization
 * module. `.clutter` itself is lazily ensured (ensureClutterDirectory)
 * immediately before every write, never assumed to already exist — the
 * same lazy system-folder lifecycle every reserved Vault folder now
 * follows, applied to the one reserved resource that isn't a Vault Folder
 * at all. The JSON shape is trivial enough that the small "raw object ->
 * normalized Map" transform below is duplicated (not shared) with
 * application bootstrap's equivalent startup-time read; if the format
 * ever grows real structure, that's the trigger to factor out a shared
 * primitive, not before.
 *
 * PagePersistenceCoordinator and VaultSyncService never call this class
 * and never reference tags.json — Save and Sync are completely unaware
 * this file exists.
 */
export class TagOperations {
  constructor(
    private readonly vault: Vault,
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    private readonly pageOperations: PageOperations
  ) {}

  /**
   * Synchronous pre-check mirroring `rename()`'s own validation exactly —
   * same `normalizeTagName` identity rules, same collision scan, via the
   * same private `findCollision` helper — so a caller (an `EditableText`
   * `onCommit`) can decide immediately whether a submitted value would be
   * accepted, without waiting on the async `rename()` call to reject.
   * Never mutates anything, safe to call speculatively on every keystroke
   * or submit attempt. `rename()` still re-validates internally rather
   * than trusting a caller already checked — this is a convenience for
   * UI-layer rejection feedback, not the only place validity is enforced.
   */
  canRename(oldName: string, newName: string): boolean {
    const trimmedNewName = newName.trim();

    if (!trimmedNewName) {
      return false;
    }

    if (!VALID_CANONICAL_TAG_NAME_PATTERN.test(serializeTagName(trimmedNewName))) {
      return false;
    }

    const oldIdentity = normalizeTagName(oldName);
    const newIdentity = normalizeTagName(trimmedNewName);

    return !this.findCollision(oldIdentity, newIdentity);
  }

  /**
   * Renames a tag's canonical identity, rewriting every matching Markdown
   * occurrence across the vault — not just the in-memory `Tag` entity.
   * Markdown remains the sole source of truth (per the editor architecture
   * decisions' foundational principle): there is nothing to update here
   * besides the source lines themselves, since `Vault.tags()` is derived
   * from `page.analysis.tags` on every projection refresh, which
   * `PageOperations.mutateBody()` already triggers as part of any normal
   * content commit — no separate reindex step exists or is needed.
   *
   * Identity is normalized (case + `-`/`_` folded, per `normalizeTagName`)
   * for both the "does this collide with a different existing tag" check
   * and the "which occurrences does this rename actually touch" scan —
   * deliberately NOT `Vault.getTagByName()`/`VaultQuery.getPagesByTag()`,
   * both of which are exact, as-typed-casing lookups by their own design
   * (confirmed against their own doc comments), not normalized-identity
   * ones. `oldName` itself is normalized before comparison too, so calling
   * rename() with any separator/casing variant of the tag being renamed
   * behaves identically.
   *
   * The new name is always persisted in canonical serialized form
   * (`serializeTagName` — spaces or the *other* separator collapse to
   * `-`), regardless of what the caller typed — the one place Clutter
   * itself ever writes tag Markdown, so it always writes the canonical
   * shape (docs/editor-architecture-decisions.md's "lenient reader, strict
   * writer" rule).
   */
  async rename(oldName: string, newName: string): Promise<void> {
    const trimmedNewName = newName.trim();

    if (!trimmedNewName) {
      throw new Error('Tag name cannot be empty.');
    }

    const canonicalName = serializeTagName(trimmedNewName);

    if (!VALID_CANONICAL_TAG_NAME_PATTERN.test(canonicalName)) {
      throw new Error(
        `"${trimmedNewName}" contains characters that aren't allowed in a tag name.`
      );
    }

    const oldIdentity = normalizeTagName(oldName);
    const newIdentity = normalizeTagName(trimmedNewName);
    const collision = this.findCollision(oldIdentity, newIdentity);

    if (collision) {
      throw new Error(`A tag named "${collision.name}" already exists.`);
    }

    const affectedPageIds = Array.from(this.vault.pages())
      .filter((page) =>
        page.analysis.tags.some(
          (occurrence) => normalizeTagName(occurrence.name) === oldIdentity
        )
      )
      .map((page) => page.id);

    await Promise.all(
      affectedPageIds.map((pageId) =>
        this.pageOperations.mutateBody(pageId, (markdown) =>
          this.rewriteOccurrences(markdown, oldIdentity, canonicalName)
        )
      )
    );
  }

  /**
   * The one collision check, shared by `canRename()` and `rename()` —
   * never duplicated between the synchronous pre-check and the actual
   * mutation. A rename that only changes casing/separator (still the same
   * logical tag, `newIdentity === oldIdentity`) never collides with
   * itself; collision only matters against a genuinely *different*
   * existing tag.
   */
  private findCollision(oldIdentity: string, newIdentity: string): Tag | undefined {
    if (newIdentity === oldIdentity) {
      return undefined;
    }

    return Array.from(this.vault.tags()).find(
      (tag) => normalizeTagName(tag.name) === newIdentity
    );
  }

  /**
   * Rewrites every `#identifier` occurrence whose normalized identity
   * matches `oldIdentity` to the canonical `#newName`, line by line — same
   * per-line approach `TagExtractor.ts`'s own `extract()` uses (its `^`
   * anchor means "start of line", correct only when matched against one
   * line at a time, not the whole multi-line document at once). Every
   * other occurrence — a different tag, or ordinary text that merely
   * contains the same characters without matching the tag grammar at
   * all — passes through untouched.
   */
  private rewriteOccurrences(
    markdown: string,
    oldIdentity: string,
    newName: string
  ): string {
    return markdown
      .split('\n')
      .map((line) =>
        line.replace(TAG_OCCURRENCE_PATTERN, (match, leading: string, name: string) =>
          normalizeTagName(name) === oldIdentity ? `${leading}#${newName}` : match
        )
      )
      .join('\n');
  }

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

    await ensureClutterDirectory(this.fileSystem, this.rootPath);

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
      : EMPTY_TAG_METADATA_FILE_CONTENTS;

    const raw = (JSON.parse(content).tags ?? {}) as Record<
      string,
      TagMetadataEntry
    >;

    return new Map(
      Object.entries(raw).map(([key, value]) => [normalizeTagName(key), value])
    );
  }
}
