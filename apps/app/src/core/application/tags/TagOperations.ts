import { Vault } from '../../vault/models/Vault';
import {
  applyTagStyle,
  normalizeTagName,
  serializeTagName,
  type Tag,
  type TagMetadataEntry,
  type TagStyle,
} from '../../vault/models/Tag';
import { isValidTagName } from '../../vault/ingest/tag/tagScanner';
import {
  removeTagFromList,
  removeTagFromMarkdown,
  renameTagInList,
  renameTagInMarkdown,
  restyleTagList,
  restyleTagsInMarkdown,
  type TagEditResult,
} from '../../vault/ingest/tag/tagEdits';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { findTagOccurrences } from '../../vault/ingest/tag/findTagOccurrences';
import type { Page } from '../../vault/models/Page';
import type { TagMetadataStore } from '../../vault/persistence/TagMetadataStore';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type { PageOperations } from '../page/PageOperations';
import type { CollectionViewConfigStore } from '../collection/CollectionViewConfigStore';
import type { TagExpansionStore } from './TagExpansionStore';
import { collectionViewKeyForTag } from '../collection/collectionViewKey';

/** Why a note a batch operation would have changed was left alone. */
export type TagBatchSkipReason =
  // The file on disk no longer matches what Clutter last read — an external
  // edit it hasn't reconciled yet. Re-running once Sync has caught up completes it.
  'changed-on-disk';

/**
 * What a planned batch (rename, remove-from-notes, delete) actually did.
 * Explicit by design: a partial result is a normal outcome of editing many
 * files, never an exception, and the operation is idempotent — running it
 * again picks up exactly what is left. The shape is deliberately plain data
 * (ids, paths, reasons, messages) so a future surface — a toast, a report
 * dialog — can present it without any change here; today nothing in the UI
 * reads it.
 */
export interface TagBatchResult {
  /** How many notes (active and archived) the batch found using the tag. */
  readonly attemptedPageCount: number;
  /** Notes rewritten (body and/or frontmatter). */
  readonly updatedPageIds: readonly string[];
  readonly skipped: readonly {
    readonly pageId: string;
    readonly path: string;
    readonly reason: TagBatchSkipReason;
  }[];
  readonly failed: readonly {
    readonly pageId: string;
    readonly path: string;
    readonly message: string;
  }[];
  /**
   * True when no note was left half-done: nothing failed and nothing was
   * skipped.
   * The tag's *definition* is only changed (moved/deleted) when this is
   * true — a half-applied batch must never lose it.
   */
  readonly complete: boolean;
}

/** The outcome of `TagOperations.checkNewTagName()` — a reason code, never UI copy. */
export type NewTagNameCheck =
  | { readonly ok: true; readonly name: string }
  | {
      readonly ok: false;
      readonly reason: 'empty' | 'invalid' | 'duplicate';
      /** For `duplicate`: the existing tag's name. */
      readonly existingName?: string;
    };

/**
 * Owns the entire lifecycle of a tag *as an entity*: declaring it, its
 * definition (name spelling, icon, favorite — `.clutter/tags.json`), and the
 * operations that rewrite Markdown to change which notes carry it (rename,
 * remove-from-notes, delete). It does not own *usage*: that is whatever
 * Markdown says, and every Markdown change goes through
 * `PageOperations.mutateBody()`/`updateMetadata()` — the Gate, live
 * DocumentSessions and Sync all keep working exactly as for any other edit.
 *
 * Definitions are application configuration, not Vault domain content, so
 * they are never routed through the Persistence Gate (ARCHITECTURE_RULES.md
 * rule 2's `.clutter/*` scope carve-out); the single reader/writer is
 * `TagMetadataStore`. PagePersistenceCoordinator never calls this class.
 *
 * Every Markdown edit here is *semantic*: located by the shared tag grammar's
 * parse tree (`ingest/tag/tagEdits.ts`), never a regex over the text.
 */
export class TagOperations {
  constructor(
    private readonly vault: Vault,
    private readonly metadataStore: TagMetadataStore,
    private readonly fileSystem: VaultFileSystem,
    private readonly pageOperations: PageOperations,
    // Optional — only real boot (Application.attachVault) supplies it;
    // existing tests constructing TagOperations directly are unaffected.
    // Used solely by rename() below to move a renamed tag's persisted
    // Configure-menu configuration (CollectionViewConfigStore) to its new
    // key, so it isn't orphaned under the old tag name.
    private readonly collectionViewConfigStore?: CollectionViewConfigStore,
    // Same optional, real-boot-only shape as collectionViewConfigStore
    // above, for the same reason: rename() moves a renamed tag's persisted
    // Tags-sidebar expansion state to its new name (ADR-035 §9).
    private readonly tagExpansionStore?: TagExpansionStore
  ) {}

  /**
   * Synchronous pre-check mirroring `rename()`'s own validation exactly —
   * same grammar check, same `normalizeTagName` identity rules, same
   * collision scan — so a caller (an `EditableText` `onCommit`) can decide
   * immediately whether a submitted value would be accepted, without
   * waiting on the async `rename()` call to reject. Never mutates anything.
   */
  canRename(oldName: string, newName: string): boolean {
    const trimmedNewName = newName.trim();

    if (!trimmedNewName) {
      return false;
    }

    if (!isValidTagName(serializeTagName(trimmedNewName))) {
      return false;
    }

    return !this.findCollision(normalizeTagName(oldName), normalizeTagName(trimmedNewName));
  }

  /**
   * Renames a tag's canonical identity everywhere it is used: every inline
   * `#tag` occurrence and every frontmatter `tags:` entry in every note, and
   * the tag's definition (icon, favorite) moves with it.
   *
   * A planned batch, one note at a time (see `rewriteNotes`): each note is
   * re-read, re-parsed and re-validated immediately before its own write, so
   * an external edit during the run is never overwritten. Identity is
   * normalized (case + `-`/`_` folded) for both the collision check and the
   * "which occurrences" decision; the new name is always persisted in
   * canonical serialized form (`serializeTagName`).
   *
   * The definition, the tag's collection-view configuration and its sidebar
   * expansion state move only when the batch is complete; otherwise the
   * result lists what remains and a re-run finishes the job.
   *
   * `merge: true` lets the target be a tag that already exists. That is how a
   * re-run finishes an interrupted rename (half the notes already carry the
   * new name, so the new tag exists), and it is also exactly what merging two
   * tags is: every use of the old tag becomes the target. The target's
   * definition wins field by field; only fields it lacks come from the old
   * one. Without it, an existing target is rejected (what `canRename` mirrors).
   */
  async rename(
    oldName: string,
    newName: string,
    options: { readonly merge?: boolean } = {}
  ): Promise<TagBatchResult> {
    const trimmedNewName = newName.trim();

    if (!trimmedNewName) {
      throw new Error('Tag name cannot be empty.');
    }

    const canonicalName = serializeTagName(trimmedNewName);

    if (!isValidTagName(canonicalName)) {
      throw new Error(
        `"${trimmedNewName}" contains characters that aren't allowed in a tag name.`
      );
    }

    const oldKey = normalizeTagName(oldName);
    const newKey = normalizeTagName(trimmedNewName);
    const collision = options.merge ? undefined : this.findCollision(oldKey, newKey);

    if (collision) {
      throw new Error(`A tag named "${collision.name}" already exists.`);
    }

    const matches = (name: string): boolean => normalizeTagName(name) === oldKey;

    const result = await this.rewriteNotes(oldKey, this.affectedPages(matches), {
      body: (markdown) => renameTagInMarkdown(markdown, matches, canonicalName),
      tags: (tags) => renameTagInList(tags, matches, canonicalName),
    });

    if (!result.complete) {
      return result;
    }

    await this.applyDefinitions((definitions) => {
      const next = new Map(definitions);
      const definition = next.get(oldKey);

      if (definition) {
        next.delete(oldKey);
        const target = oldKey === newKey ? undefined : next.get(newKey);
        next.set(newKey, { ...definition, ...target, name: target?.name ?? canonicalName });
      }

      return next;
    });

    // Moves this tag's persisted Configure-menu configuration and sidebar
    // expansion state to the new name. `oldName` (not `oldKey`) is the exact
    // string those stores key by — every rename() caller passes the tag's
    // current `Tag.name`. A same-identity, different-spelling rename
    // ("Project" → "project") still needs this: the persisted key's exact
    // string changes even though the identity doesn't.
    this.collectionViewConfigStore?.renameKey(
      collectionViewKeyForTag(oldName),
      collectionViewKeyForTag(canonicalName)
    );
    this.tagExpansionStore?.renameTag(oldName, canonicalName);

    return result;
  }

  /**
   * One-time cleanup: re-cases every existing tag, everywhere it is used, in
   * `style` — inline `#tag`s and frontmatter `tags` of every note (archived
   * ones included, open editors' unsaved text included), plus the tag
   * definitions' stored spellings. It is an *action*, never a setting: the
   * style is not remembered, and nothing about how a new tag is created
   * depends on it.
   *
   * Casing only. Tag identity is `normalizeTagName`, which folds case, so no
   * tag is renamed, merged or split — only its spelling changes (see
   * `applyTagStyle`). One vault-wide page pass through the same planned-batch
   * engine as `rename()` (not `rename()` once per tag), touching only notes
   * where some spelling actually differs, so it is idempotent: a second run
   * finds nothing to do, and a re-run after a partial result finishes the job.
   *
   * As with `rename()`, the definitions (written once, through the store) and
   * the per-tag Configure-menu/expansion state keyed by spelling move only
   * when the batch is complete.
   *
   * One user action, one scan: `affectedPages` is the only pass over the
   * vault, the definitions are checked against the in-memory snapshot (the
   * store, and its disk read, is touched only if one actually changes), and
   * when everything already matches nothing is read from or written to disk.
   * The returned `TagBatchResult` is the post-run feedback; nothing needs to
   * be scanned again to learn what changed.
   */
  async restyle(style: TagStyle): Promise<TagBatchResult> {
    const restyleName = (name: string): string => applyTagStyle(name, style);
    const differs = (name: string): boolean => restyleName(name) !== name;
    // Spellings in force before the batch, which the spelling-keyed stores
    // below are still indexed by.
    const previousNames = Array.from(this.vault.tags(), (tag) => tag.name);

    const result = await this.rewriteNotes(`restyle:${style}`, this.affectedPages(differs), {
      body: (markdown) => restyleTagsInMarkdown(markdown, restyleName),
      tags: (tags) => restyleTagList(tags, restyleName),
    });

    if (!result.complete) {
      return result;
    }

    // The spelling a definition stores (shown while no note uses the tag). A
    // hand-written entry with no `name` is left alone when its default
    // spelling is already in the target style.
    const restyledDefinitionName = (key: string, definition: TagMetadataEntry): string | null => {
      const current = serializeTagName(definition.name ?? key);
      const name = restyleName(current);

      return name !== current && isValidTagName(name) ? name : null;
    };

    // Decided from the Vault's in-memory snapshot, so an already-matching
    // vault never reaches the store (which re-reads tags.json from disk).
    // The mutation below still runs against the file as it is right now.
    const definitionsNeedRestyle = Array.from(this.vault.tagMetadataSnapshot()).some(
      ([key, definition]) => restyledDefinitionName(key, definition) !== null
    );

    if (definitionsNeedRestyle) {
      await this.applyDefinitions((definitions) => {
        let next: Map<string, TagMetadataEntry> | undefined;

        for (const [key, definition] of definitions) {
          const name = restyledDefinitionName(key, definition);

          if (name !== null) {
            next ??= new Map(definitions);
            next.set(key, { ...definition, name });
          }
        }

        return next ?? definitions;
      });
    }

    for (const oldName of previousNames) {
      const newName = restyleName(oldName);

      this.collectionViewConfigStore?.renameKey(
        collectionViewKeyForTag(oldName),
        collectionViewKeyForTag(newName)
      );
      this.tagExpansionStore?.renameTag(oldName, newName);
    }

    return result;
  }

  /**
   * Whether `input` can become a new tag, and the exact name it would get —
   * the synchronous pre-check behind the New tag dialog, mirroring
   * `canRename()`'s role. The name is the shared normalization composed with
   * the shared canonical spelling (`serializeTagName(normalizeTagName(x))`):
   * trimmed, lower-cased, separators as hyphens — `Design_System` becomes
   * `design-system` — then checked against the one tag grammar. Rejects an
   * empty name, a name the grammar would not read back as a single tag, and
   * a name that is already a tag (used or declared) under any spelling.
   * Never mutates anything.
   */
  checkNewTagName(input: string): NewTagNameCheck {
    const name = serializeTagName(normalizeTagName(input));

    if (name === '') {
      return { ok: false, reason: 'empty' };
    }

    if (!isValidTagName(name)) {
      return { ok: false, reason: 'invalid' };
    }

    const existing = this.vault.getTagByName(name);

    if (existing) {
      return { ok: false, reason: 'duplicate', existingName: existing.name };
    }

    return { ok: true, name };
  }

  /**
   * Declares a tag — creates its definition without using it anywhere, so
   * the tag exists with `usageCount: 0` until a note uses it. Nothing is
   * written to Markdown. The name is normalized exactly as in
   * `checkNewTagName()` (lower-case, hyphens), and `icon` (an emoji) is
   * stored on the definition. Idempotent: declaring an existing definition
   * (under any casing/separator spelling) changes nothing, and never
   * overwrites its icon.
   */
  async declare(name: string, options: { readonly icon?: string } = {}): Promise<void> {
    const canonicalName = serializeTagName(normalizeTagName(name));

    if (!isValidTagName(canonicalName)) {
      throw new Error(`"${name.trim()}" isn't a valid tag name.`);
    }

    const key = normalizeTagName(canonicalName);

    await this.applyDefinitions((definitions) =>
      definitions.has(key)
        ? definitions
        : new Map(definitions).set(key, {
            name: canonicalName,
            ...(options.icon ? { icon: options.icon } : {}),
          })
    );
  }

  /**
   * Removes the tag from every note that uses it — inline occurrences and
   * frontmatter entries — and **keeps its definition**: a configured or
   * declared tag stays as a zero-usage tag with its icon/favorite intact. (A
   * tag that was only ever implicit, with no definition, simply stops
   * existing, since nothing declares it.) Same planned-batch guarantees as
   * `rename()`.
   */
  removeFromNotes(name: string): Promise<TagBatchResult> {
    const key = normalizeTagName(name);
    const matches = (candidate: string): boolean => normalizeTagName(candidate) === key;

    return this.rewriteNotes(key, this.affectedPages(matches), {
      body: (markdown) => removeTagFromMarkdown(markdown, matches),
      tags: (tags) => removeTagFromList(tags, matches),
    });
  }

  /**
   * How many tags currently have no usage in any note — what `deleteUnusedTags()`
   * would remove. Only a declared tag can be unused (a tag no note uses and
   * nothing declares doesn't exist), so these are all definitions.
   */
  countUnusedTags(): number {
    return Array.from(this.vault.tags()).filter((tag) => tag.usageCount === 0).length;
  }

  /**
   * Tidy up: deletes the definitions of every tag that no note uses, in one
   * write, and returns how many were removed. Notes are never touched, and a
   * tag with even one usage keeps its definition. "Unused" is read from the
   * Vault at the moment of the write, so a tag that gained a usage since the
   * caller last looked is kept.
   */
  async deleteUnusedTags(): Promise<number> {
    if (this.countUnusedTags() === 0) {
      return 0;
    }

    let removed = 0;

    await this.applyDefinitions((definitions) => {
      const unused = new Set(
        Array.from(this.vault.tags())
          .filter((tag) => tag.usageCount === 0)
          .map((tag) => normalizeTagName(tag.name))
      );
      const next = new Map(definitions);

      for (const key of definitions.keys()) {
        if (unused.has(key)) {
          next.delete(key);
          removed += 1;
        }
      }

      return next;
    });

    return removed;
  }

  /**
   * Deletes the tag's *definition* only: its name spelling, icon and
   * favorite. Notes are untouched, so a tag that is still used reverts to an
   * ordinary implicit tag and an unused one ceases to exist.
   */
  async deleteDefinition(name: string): Promise<void> {
    const key = normalizeTagName(name);

    await this.applyDefinitions((definitions) => {
      if (!definitions.has(key)) {
        return definitions;
      }

      const next = new Map(definitions);
      next.delete(key);
      return next;
    });
  }

  /**
   * Deletes the tag completely: removes it from every note, then deletes its
   * definition. The definition is deleted only when the removal completed
   * for every note, so a partial failure can't leave notes using a tag that
   * has silently lost its configuration.
   */
  async deleteTag(name: string): Promise<TagBatchResult> {
    const result = await this.removeFromNotes(name);

    if (result.complete) {
      await this.deleteDefinition(name);
    }

    return result;
  }

  /**
   * One mutation method, extensible by field (icon today, color later)
   * rather than by method count — mirrors PageOperations.updateMetadata().
   * Configuring a tag *declares* it: the definition is created if absent and
   * is never removed just because its fields are cleared or its usage drops
   * to zero (deleting is `deleteDefinition()`/`deleteTag()`).
   */
  async updateMetadata(name: string, patch: Partial<TagMetadataEntry>): Promise<void> {
    const key = normalizeTagName(name);
    const spelling = serializeTagName(name.trim());

    await this.applyDefinitions((definitions) => {
      const existing = definitions.get(key);
      const merged: Record<string, unknown> = {
        // Remember how the tag is spelled so a declared tag keeps its casing
        // after the last note using it goes away.
        ...(isValidTagName(spelling) ? { name: spelling } : {}),
        ...existing,
        ...patch,
      };

      for (const field of Object.keys(merged)) {
        if (merged[field] === undefined) {
          delete merged[field];
        }
      }

      return new Map(definitions).set(key, merged as TagMetadataEntry);
    });
  }

  /**
   * The one collision check, shared by `canRename()` and `rename()`. A
   * rename that only changes casing/separator (still the same logical tag,
   * `newKey === oldKey`) never collides with itself; collision only matters
   * against a genuinely *different* existing tag — used or declared.
   */
  private findCollision(oldKey: string, newKey: string): Tag | undefined {
    if (newKey === oldKey) {
      return undefined;
    }

    return Array.from(this.vault.tags()).find((tag) => normalizeTagName(tag.name) === newKey);
  }

  /** Writes the definitions through the store and publishes them to the Vault projection. */
  private async applyDefinitions(
    mutate: (
      definitions: ReadonlyMap<string, TagMetadataEntry>
    ) => ReadonlyMap<string, TagMetadataEntry>
  ): Promise<void> {
    const next = await this.metadataStore.update(mutate);

    this.vault.setTagMetadata(next);
  }

  /**
   * The planned batch behind rename / remove / delete / restyle.
   *
   * The caller discovers `affected` (see `affectedPages`); then, for each affected note, in path order, **one at a time**:
   *   1. read the file from disk and parse it — if its body no longer equals
   *      what the Vault last read, it was changed externally and is skipped
   *      (never overwritten);
   *   2. frontmatter: recompute from the page's *current* `tags` and write
   *      only if something matched;
   *   3. body: rewrite *inside* the edit's transform, which re-parses the
   *      current content and edits only the occurrences that are tags right
   *      then — this is the revalidation, so nothing stale is ever written;
   *   4. if the note is open in an editor, make the result durable;
   *   5. record the outcome and continue — one failing note never aborts the
   *      rest.
   * Safe to re-run: a second pass finds only what is left.
   *
   * **Every note, archived or not.** Archived notes are edited too (their
   * status and location are untouched), so no old usage is left behind.
   *
   * **Unsaved editor content.** A note open in an editor has a
   * DocumentSession that is the owner of "current content" — which may hold
   * text the file does not. The body edit goes through `mutateBody`, which
   * transforms the session's *current* text (unsaved edits included) and
   * commits it back into the session, so the editor, and every later
   * autosave, carries the renamed text; the result is then flushed through
   * the ordinary save path. A tag typed into an editor but not yet saved is
   * therefore discovered (the session text is searched) and renamed too.
   * Nothing here bypasses the editor/save architecture or adds an undo
   * mechanism.
   */
  private async rewriteNotes(
    label: string,
    affected: readonly Page[],
    edits: {
      readonly body: (markdown: string) => TagEditResult;
      readonly tags: (tags: readonly string[]) => string[] | null;
    }
  ): Promise<TagBatchResult> {
    const updatedPageIds: string[] = [];
    const skipped: { pageId: string; path: string; reason: TagBatchSkipReason }[] = [];
    const failed: { pageId: string; path: string; message: string }[] = [];

    for (const page of affected) {
      try {
        if (!(await this.matchesDisk(page))) {
          skipped.push({ pageId: page.id, path: page.path, reason: 'changed-on-disk' });
          continue;
        }

        let changed = false;

        // Frontmatter first: it writes the *durable* body (equal to the file,
        // checked above), so the session — which holds anything newer — is
        // committed to afterwards and always has the last word.
        const currentTags = this.vault.getPage(page.id)?.metadata.tags ?? [];
        const nextTags = edits.tags(currentTags);

        if (nextTags && !sameList(nextTags, currentTags)) {
          await this.pageOperations.updateMetadata(page.id, { tags: nextTags }, { allowArchived: true });
          changed = true;
        }

        const session = this.pageOperations.getSession(page.id);
        const currentBody = session?.currentRevision.markdown ?? this.vault.getPage(page.id)?.source.markdown ?? '';

        // Nothing to write when the edit would leave the body byte-identical
        // (e.g. a rename to the spelling already in use) — no pointless save.
        if (edits.body(currentBody).markdown !== currentBody) {
          await this.pageOperations.mutateBody(
            page.id,
            (markdown) => edits.body(markdown).markdown,
            { allowArchived: true }
          );
          changed = true;

          if (session && page.metadata.status !== 'archived') {
            await this.pageOperations.requestSave(page.id);
          }
        }

        if (changed) {
          updatedPageIds.push(page.id);
        }
      } catch (error) {
        failed.push({
          pageId: page.id,
          path: page.path,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (failed.length > 0 || skipped.length > 0) {
      console.warn(
        `TagOperations: tag batch for "${label}" is incomplete — ${failed.length} failed, ` +
          `${skipped.length} changed on disk. Run it again to finish.`
      );
    }

    return {
      attemptedPageCount: affected.length,
      updatedPageIds,
      skipped,
      failed,
      complete: failed.length === 0 && skipped.length === 0,
    };
  }

  /**
   * Pages that use a tag for which `matches(name)` holds anywhere a note can
   * carry a tag, in a stable (path) order: durable inline occurrences,
   * frontmatter `tags`, and — for a note open in an editor — the editor's
   * current text, which may hold a tag the file does not yet. Cheapest checks
   * first and short-circuiting: a page's Markdown is only parsed when it has
   * unsaved editor text the durable analysis cannot answer for.
   */
  private affectedPages(matches: (name: string) => boolean): Page[] {
    return Array.from(this.vault.pages())
      .filter((page) => {
        if (page.analysis.tags.some((occurrence) => matches(occurrence.name))) {
          return true;
        }

        if ((page.metadata.tags ?? []).some(matches)) {
          return true;
        }

        const unsaved = this.pageOperations.getSession(page.id)?.currentRevision.markdown;

        return (
          unsaved !== undefined &&
          unsaved !== page.source.markdown &&
          findTagOccurrences(unsaved).some((span) => matches(span.name))
        );
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Whether the file on disk still holds the body the Vault last read for
   * this page. Durable content is what both sides describe, so this stays
   * valid while a DocumentSession holds newer unsaved edits (those live in
   * the session, not on disk).
   */
  private async matchesDisk(page: Page): Promise<boolean> {
    const onDisk = await this.fileSystem.readFile(page.path);

    return new FrontmatterParser().parse(onDisk).body === page.source.markdown;
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
