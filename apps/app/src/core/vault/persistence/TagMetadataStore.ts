import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { TAG_METADATA_RELATIVE_PATH } from '../initialize/ReservedResources';
import { ensureClutterDirectory } from '../initialize/ensureClutterDirectory';
import type { TagMetadataEntry } from '../models/Tag';
import {
  parseTagMetadataFile,
  serializeTagMetadataFile,
  type TagMetadata,
} from './tagMetadataFile';
import { writeFileAtomic } from './writeFileAtomic';

/**
 * The one reader and the one writer of `.clutter/tags.json` — tag
 * *definitions* (declaration, icon, favorite; later color). Usage is never
 * stored here: Markdown owns that.
 *
 * - **Tolerant load.** A missing file is the empty definition set. An
 *   unparseable file never fails the vault: it is copied aside to
 *   `tags.json.corrupt-<timestamp>` (the user's bytes are preserved, never
 *   silently overwritten), a warning is logged, and the vault opens with no
 *   definitions. Individually-invalid entries are dropped with a warning and
 *   the valid ones kept. If the file can't even be read, or the quarantine
 *   copy can't be written, the store goes read-only for the session
 *   (`update()` throws) rather than risk replacing data it never saw.
 * - **Serialized.** Every load/update runs through one in-process queue, so a
 *   read-modify-write can never interleave with another (a lost update) or
 *   with an external-change reload.
 * - **Atomic.** Writes go temp-file → rename (`writeFileAtomic`), and an
 *   update that would not change the bytes writes nothing — which is also
 *   what makes reacting to our own write's watcher echo a harmless no-op.
 *
 * Lives outside the Persistence Gate by ARCHITECTURE_RULES.md rule 2's
 * `.clutter/*` scope carve-out: this file is application configuration, not
 * Vault domain content.
 */
export class TagMetadataStore {
  private queue: Promise<unknown> = Promise.resolve();
  private writeBlockedReason: string | null = null;
  // The corrupt bytes already backed up, so a file that stays corrupt across
  // several reloads is backed up once, not once per reload.
  private lastQuarantinedText: string | null = null;

  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    private readonly now: () => number = Date.now
  ) {}

  private get path(): string {
    return `${this.rootPath}/${TAG_METADATA_RELATIVE_PATH}`;
  }

  /** Reads the current definitions from disk. Never throws. */
  load(): Promise<TagMetadata> {
    return this.enqueue(async () => (await this.readCurrent()).entries);
  }

  /**
   * Applies `mutate` to the definitions as they are on disk *right now*
   * (re-read inside the queue — never a boot-time snapshot) and writes the
   * result. Resolves with the new definitions. Throws when the write
   * fails or the store is read-only; the file is then unchanged.
   */
  update(
    mutate: (current: ReadonlyMap<string, TagMetadataEntry>) => ReadonlyMap<string, TagMetadataEntry>
  ): Promise<TagMetadata> {
    return this.enqueue(async () => {
      const { entries, text } = await this.readCurrent();

      if (this.writeBlockedReason) {
        throw new Error(`tags.json is read-only this session: ${this.writeBlockedReason}`);
      }

      const next = mutate(new Map(entries));
      const nextText = serializeTagMetadataFile(next);

      if (nextText !== text) {
        await ensureClutterDirectory(this.fileSystem, this.rootPath);
        await writeFileAtomic(this.fileSystem, this.path, nextText);
      }

      return next;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    // A failed operation must not wedge the queue for the next caller.
    this.queue = run.catch(() => {});
    return run;
  }

  private async readCurrent(): Promise<{ entries: TagMetadata; text: string | null }> {
    // Read-only status always reflects the *latest* read: a file the user
    // repairs mid-session makes the store writable again.
    this.writeBlockedReason = null;

    let text: string;

    try {
      if (!(await this.fileSystem.exists(this.path))) {
        return { entries: new Map(), text: null };
      }

      text = await this.fileSystem.readFile(this.path);
    } catch (error) {
      this.blockWrites(`could not be read (${(error as Error).message})`);
      console.warn('TagMetadataStore: .clutter/tags.json could not be read; tag definitions are unavailable.', error);
      return { entries: new Map(), text: null };
    }

    const parsed = parseTagMetadataFile(text);

    if (!parsed.ok) {
      await this.quarantine(text, parsed.reason);
      return { entries: new Map(), text: null };
    }

    for (const warning of parsed.warnings) {
      console.warn(`TagMetadataStore: .clutter/tags.json: ${warning}`);
    }

    // The text we diff against is the file's own bytes: an update that
    // yields identical bytes (e.g. a no-op patch, or a v1 file already in
    // canonical form) writes nothing.
    return { entries: parsed.entries, text };
  }

  private async quarantine(text: string, reason: string): Promise<void> {
    if (this.lastQuarantinedText === text) {
      return;
    }

    const copyPath = `${this.path}.corrupt-${this.now()}`;

    try {
      await this.fileSystem.writeFile(copyPath, text);
      this.lastQuarantinedText = text;
      console.warn(
        `TagMetadataStore: .clutter/tags.json is ${reason}. Opened with no tag definitions; the original was kept at ${copyPath}.`
      );
      // The corrupt original stays at tags.json until the next update
      // replaces it — a copy of the user's bytes now exists, so that
      // replacement loses nothing.
    } catch (error) {
      this.blockWrites(`is ${reason} and could not be backed up (${(error as Error).message})`);
      console.warn(
        'TagMetadataStore: .clutter/tags.json is corrupt and could not be backed up; it will not be overwritten this session.',
        error
      );
    }
  }

  private blockWrites(reason: string): void {
    this.writeBlockedReason = reason;
  }
}
