import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import type { Vault } from '../../vault/models/Vault';
import { DestinationExistsError, type VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type { FolderOperations } from '../folder/FolderOperations';
import type { PageOperations } from '../page/PageOperations';
import { mintShippedFolderSource, mintShippedPageSource } from './ShippedSource';
import {
  MAX_INSTALL_ATTEMPTS,
  readWelcomeInstallLedger,
  writeWelcomeInstallLedger,
  type WelcomeInstallLedger,
} from './WelcomeInstallLedger';
import type { WelcomeEntry, WelcomeManifest } from './welcomeContentManifest';

/**
 * What an install or a resume ended as.
 *
 * - `installed`: every entry is finished.
 * - `skipped`: it did not start (the Space is not empty, or an install was already started or finished).
 * - `failed`: it stopped. `retry` is what the ledger now says about a later attempt, so the toast never promises
 *   more than is recorded: `scheduled` (recorded as `installing`), `none` (recorded as complete/abandoned), or
 *   `unknown` (the ledger could not be written, so a retry may or may not happen).
 */
export type WelcomeInstallResult =
  | { readonly status: 'installed' }
  | { readonly status: 'skipped'; readonly reason: 'not-empty' | 'already-started' }
  | { readonly status: 'failed'; readonly retry: 'scheduled' | 'none' | 'unknown' };

/**
 * What `verifyInstall` found. `checked` is the number of manifest entries looked at (27 for the shipped content);
 * `missing` lists the paths that are not as shipped.
 */
export type WelcomeVerification =
  | { readonly ok: true; readonly checked: number }
  | { readonly ok: false; readonly checked: number; readonly missing: readonly string[] };

export interface WelcomeContentServiceDeps {
  readonly vault: Vault;
  readonly fileSystem: VaultFileSystem;
  readonly rootPath: string;
  readonly pageOperations: Pick<PageOperations, 'createFromSource'>;
  readonly folderOperations: Pick<FolderOperations, 'createFromSource' | 'ensureReservedFolder'>;
  /** Makes the Vault learn about a file written outside the Gate (ADR-040). */
  readonly reconcileKnownPath: (absolutePath: string) => Promise<void>;
  readonly manifest: WelcomeManifest;
}

/** What `performEntry` found: written, or refused because something was already there / the parent is gone. */
type EntryOutcome = 'done' | 'skipped';

/** A parent that was expected but is not a live folder: the facade refuses a child with this id as `parent-unknown`. */
const UNRESOLVED_PARENT = 'unresolved-parent';

/**
 * ADR-067: installs the bundled welcome content into a completely empty Space (ADR-070: asked only by the Welcome Screen's open
 * sequence), never twice into the same Space, and finishes an interrupted install.
 *
 * It owns the workflow, not a capability: every page and folder write is a Gate `enqueue` made by the two facades'
 * `createFromSource` (and `ensureReservedFolder` for Templates); this class enqueues nothing itself. The image is
 * the one non-Gate write (assets are outside the Gate's scope, ARCHITECTURE_RULES.md rule 2), made create-only at
 * its exact path and registered with `reconcileKnownPath`.
 *
 * Nothing here can overwrite a file: every write is create-only, entries are started at most once, and a resume
 * never writes an entry the ledger lists as finished or as in flight (so a file the user deleted is never brought
 * back, and the one file that was in flight at a crash is never guessed at).
 */
export class WelcomeContentService {
  private readonly parser = new FrontmatterParser();
  private running: Promise<WelcomeInstallResult | null> | null = null;
  private readonly folderIds = new Map<string, string>();

  constructor(private readonly deps: WelcomeContentServiceDeps) {}

  /**
   * A first-run install into this Space. Starts only when the Space's Vault is empty and no ledger exists, so it
   * can never add to a folder that has content or run twice.
   */
  public install(): Promise<WelcomeInstallResult> {
    return this.exclusive(() => this.runInstall()) as Promise<WelcomeInstallResult>;
  }

  /** Finishes an interrupted install, or returns `null` when there is nothing to resume. */
  public resumeIfNeeded(): Promise<WelcomeInstallResult | null> {
    return this.exclusive(() => this.runResume());
  }

  /**
   * Whether a finished install really left everything the manifest lists, as shipped. Called before a first-run Space
   * is opened, so a Space is never shown with the welcome content half there.
   *
   * `null` when there is nothing to verify: no ledger, or an install that is still unfinished or was abandoned (those
   * are reported by their own result, and the ledger is never rewritten to hide them). Otherwise every entry is
   * checked: each directory exists, `Templates` is the Vault's reserved folder, each marker folder is in the Vault
   * under the id its `.folder.md` carries, each note is a Vault page at its path with its shipped id, and the image
   * is on disk with its shipped size. A failed check is recorded as an abandoned install (the content is not
   * complete, and there is nothing a resume could write), and returned.
   */
  public async verifyInstall(): Promise<WelcomeVerification | null> {
    const { fileSystem, rootPath, manifest } = this.deps;
    const ledger = await readWelcomeInstallLedger(fileSystem, rootPath);
    const finished =
      ledger !== null &&
      (ledger.outcome === 'installed' || (ledger.state === 'installing' && ledger.completed === ledger.total && !ledger.inFlight));
    if (!finished) return null;

    const missing: string[] = [];
    for (const entry of manifest.entries) {
      if (!(await this.isAsShipped(entry))) missing.push(entry.path);
    }
    if (missing.length === 0) return { ok: true, checked: manifest.entries.length };

    console.error('The welcome content is not complete:', missing);
    try {
      await writeWelcomeInstallLedger(fileSystem, rootPath, { ...ledger, state: 'complete', outcome: 'abandoned' });
    } catch (error) {
      console.error('Recording the incomplete welcome content failed:', error);
    }

    return { ok: false, checked: manifest.entries.length, missing };
  }

  /**
   * The Space has been shown to the user: from here on a file that was in flight at an interruption is never written
   * again (it could have been deleted). Called by the first-run gate when it opens the Space. Best effort: a ledger
   * that cannot be written keeps `shown: false`, which only ever matters for an install that is still unfinished.
   */
  public async markShown(): Promise<void> {
    const { fileSystem, rootPath } = this.deps;
    const ledger = await readWelcomeInstallLedger(fileSystem, rootPath);
    if (ledger === null || ledger.shown !== false) return;

    try {
      await writeWelcomeInstallLedger(fileSystem, rootPath, { ...ledger, shown: true });
    } catch (error) {
      console.error('Recording that the Space was shown failed:', error);
    }
  }

  private async isAsShipped(entry: WelcomeEntry): Promise<boolean> {
    const { vault, fileSystem } = this.deps;
    const path = this.absolute(entry.path);

    try {
      if (!(await fileSystem.exists(path))) return false;

      if (entry.kind === 'directory') {
        if (entry.folder === 'reserved') return vault.getReservedFolder('templates') !== undefined;
        if (entry.folder === 'plain' || !entry.loadMarker) return true;

        return vault.getFolderByPath(path)?.id === this.frontmatterId(await entry.loadMarker(), entry.path);
      }

      if (entry.kind === 'markdown') {
        return vault.getPageByPath(path)?.id === this.frontmatterId(await entry.load(), entry.path);
      }

      // The image is compared byte for byte with the bundle when the file system can read bytes, else by size.
      const bytes = await entry.load();
      if (fileSystem.readBinaryFile) {
        const onDisk = await fileSystem.readBinaryFile(path);

        return onDisk.length === bytes.length && onDisk.every((byte, index) => byte === bytes[index]);
      }

      return fileSystem.stat ? (await fileSystem.stat(path)).size === bytes.length : true;
    } catch {
      return false;
    }
  }

  private exclusive<T extends WelcomeInstallResult | null>(work: () => Promise<T>): Promise<T> {
    if (this.running) return this.running.then(() => work());
    const started = work().finally(() => {
      if (this.running === started) this.running = null;
    });
    this.running = started;

    return started;
  }

  private vaultIsEmpty(): boolean {
    const { vault } = this.deps;
    for (const _page of vault.pages()) return false;
    for (const _folder of vault.folders()) return false;

    return vault.resourceCount === 0;
  }

  private async runInstall(): Promise<WelcomeInstallResult> {
    const { fileSystem, rootPath, manifest } = this.deps;

    if (!this.vaultIsEmpty()) return { status: 'skipped', reason: 'not-empty' };
    if ((await readWelcomeInstallLedger(fileSystem, rootPath)) !== null) {
      return { status: 'skipped', reason: 'already-started' };
    }

    // Nothing is written until the ledger exists: a failure before this point leaves the Space untouched.
    let ledger: WelcomeInstallLedger;
    try {
      ledger = {
        version: 1,
        plan: await manifest.plan(),
        total: manifest.entries.length,
        completed: 0,
        inFlight: false,
        attempts: 1,
        state: 'installing',
        // The first-run gate keeps the Space hidden until this is complete and verified.
        shown: false,
      };
      await writeWelcomeInstallLedger(fileSystem, rootPath, ledger);
    } catch (error) {
      console.error('Starting the welcome content install failed:', error);
      return { status: 'failed', retry: 'none' };
    }

    return this.run(ledger);
  }

  private async runResume(): Promise<WelcomeInstallResult | null> {
    const { fileSystem, rootPath, manifest } = this.deps;
    const ledger = await readWelcomeInstallLedger(fileSystem, rootPath);
    if (ledger === null || ledger.state !== 'installing') return null;

    // Three attempts in total, the first install included. This also bounds a crash loop: every resume that starts
    // is counted before it does anything.
    if (ledger.attempts >= MAX_INSTALL_ATTEMPTS) return this.abandon(ledger);

    let plan: string;
    try {
      plan = await manifest.plan();
    } catch (error) {
      console.error('Reading the bundled welcome content failed:', error);
      return this.abandon(ledger);
    }
    // A different Clutter, different content: this partial install is never continued against it.
    if (plan !== ledger.plan || manifest.entries.length !== ledger.total) return this.abandon(ledger);

    let next: WelcomeInstallLedger = { ...ledger, attempts: ledger.attempts + 1 };
    if (ledger.inFlight && ledger.shown === false) {
      // The Space has never been shown to anyone, so nobody can have deleted the file that was in flight: if it is
      // absent it was never written. It is attempted again, with the same create-only write as every other entry
      // (a file already there refuses it and is left alone). This is the one difference from a shown Space.
      next = { ...next, inFlight: false };
    } else if (ledger.inFlight) {
      // The entry that was being written at the last update is finished without being written, whatever the disk
      // shows: absent could mean never written or deleted since, and the ledger cannot tell them apart. A file that
      // is there is only registered with the Vault (read-only), never written.
      const entry = manifest.entries[ledger.completed];
      if (entry) await this.registerExisting(entry);
      next = { ...next, completed: ledger.completed + 1, inFlight: false };
    }

    try {
      await writeWelcomeInstallLedger(fileSystem, rootPath, next);
    } catch (error) {
      // The attempt could not be counted, so it does not run: the ledger is exactly as it was.
      console.error('Recording the welcome content retry failed:', error);
      return { status: 'failed', retry: 'unknown' };
    }

    return this.run(next);
  }

  private async run(start: WelcomeInstallLedger): Promise<WelcomeInstallResult> {
    const { fileSystem, rootPath, manifest } = this.deps;
    let ledger = start;

    for (let index = ledger.completed; index < manifest.entries.length; index += 1) {
      const entry = manifest.entries[index];
      if (!entry) break;
      const inFlight: WelcomeInstallLedger = { ...ledger, completed: index, inFlight: true };

      try {
        await writeWelcomeInstallLedger(fileSystem, rootPath, inFlight);
      } catch (error) {
        console.error('Recording the welcome content progress failed:', error);
        return { status: 'failed', retry: 'unknown' };
      }
      ledger = inFlight;

      try {
        await this.performEntry(entry);
      } catch (error) {
        console.error(`Installing the welcome content stopped at “${entry.path}”:`, error);
        return this.fail(ledger, error);
      }

      const finished: WelcomeInstallLedger = { ...ledger, completed: index + 1, inFlight: false };
      try {
        await writeWelcomeInstallLedger(fileSystem, rootPath, finished);
      } catch (error) {
        console.error('Recording the welcome content progress failed:', error);
        return { status: 'failed', retry: 'unknown' };
      }
      ledger = finished;
    }

    try {
      await writeWelcomeInstallLedger(fileSystem, rootPath, { ...ledger, state: 'complete', outcome: 'installed' });
    } catch (error) {
      // Every entry is finished, so a later resume has nothing left to write. Only the tombstone is missing.
      console.error('Recording the finished welcome content install failed:', error);
    }

    return { status: 'installed' };
  }

  /** The install stopped on `error`: record a retry only when one is allowed and the record is actually written. */
  private async fail(ledger: WelcomeInstallLedger, error: unknown): Promise<WelcomeInstallResult> {
    const { fileSystem, rootPath } = this.deps;
    const canRetry = !isPermanent(error) && ledger.attempts < MAX_INSTALL_ATTEMPTS;

    try {
      await writeWelcomeInstallLedger(
        fileSystem,
        rootPath,
        canRetry ? ledger : { ...ledger, state: 'complete', outcome: 'abandoned' }
      );
    } catch (writeError) {
      console.error('Recording the welcome content outcome failed:', writeError);
      return { status: 'failed', retry: 'unknown' };
    }

    return { status: 'failed', retry: canRetry ? 'scheduled' : 'none' };
  }

  private async abandon(ledger: WelcomeInstallLedger): Promise<WelcomeInstallResult> {
    try {
      await writeWelcomeInstallLedger(this.deps.fileSystem, this.deps.rootPath, {
        ...ledger,
        state: 'complete',
        outcome: 'abandoned',
      });
    } catch (error) {
      console.error('Recording the welcome content outcome failed:', error);
      return { status: 'failed', retry: 'unknown' };
    }

    return { status: 'failed', retry: 'none' };
  }

  private absolute(path: string): string {
    return `${this.deps.rootPath}/${path}`;
  }

  /** The id of a parent directory's folder: the one this run made, else the Vault's folder at that path, else none. */
  private parentFolderId(path: string): string | null {
    const slash = path.lastIndexOf('/');
    if (slash < 0) return null;

    const parentPath = path.slice(0, slash);
    const known = this.folderIds.get(parentPath) ?? this.deps.vault.getFolderByPath(this.absolute(parentPath))?.id;

    return known ?? UNRESOLVED_PARENT;
  }

  private async performEntry(entry: WelcomeEntry): Promise<EntryOutcome> {
    const { fileSystem, pageOperations, folderOperations, reconcileKnownPath } = this.deps;
    const path = this.absolute(entry.path);

    try {
      if (entry.kind === 'directory') {
        if (entry.folder === 'reserved') {
          const folder = await folderOperations.ensureReservedFolder('templates');
          this.folderIds.set(entry.path, folder.id);

          return 'done';
        }

        // The marker's text (a lazily loaded chunk in the app) and its id are read BEFORE the directory exists. Once
        // the directory is there the OS watcher reports it and Sync registers it, under a path-derived id if no
        // `.folder.md` is in it yet; any await that yields between the directory and the marker's write lets that
        // happen first, and the Gate's `addFolder` is then refused ("Folder path already in use"). Nothing may yield
        // between the exclusive create below and the `createFromSource` call except the Gate's own file calls.
        const marker = entry.folder === 'marker' && entry.loadMarker ? await entry.loadMarker() : null;
        const markerId = marker === null ? null : this.frontmatterId(marker, entry.path);
        const parentId = this.parentFolderIdForFolder(entry.path);

        // Exclusive: an existing directory (a folder, a file, a link) refuses this, and is left untouched.
        await fileSystem.createDirectory(path, { exclusive: true });
        if (marker === null || markerId === null) return 'done';

        const outcome = await folderOperations.createFromSource(
          mintShippedFolderSource({ path, parentId, content: marker, id: markerId })
        );
        if (outcome.status === 'created') this.folderIds.set(entry.path, outcome.id);

        return outcome.status === 'created' ? 'done' : 'skipped';
      }

      if (entry.kind === 'markdown') {
        const content = await entry.load();
        const outcome = await pageOperations.createFromSource(
          mintShippedPageSource({
            path,
            parentId: this.parentFolderId(entry.path),
            content,
            id: this.frontmatterId(content, entry.path),
          })
        );

        return outcome.status === 'created' ? 'done' : 'skipped';
      }

      if (!fileSystem.writeBinaryFile) throw new Error('This file system cannot write binary files');
      await fileSystem.writeBinaryFile(path, await entry.load());
      await reconcileKnownPath(path).catch((error: unknown) => {
        // The file is written and the watcher will register it; the install is not failed by this.
        console.warn(`Registering “${entry.path}” with the Vault failed:`, error);
      });

      return 'done';
    } catch (error) {
      // Something already there is the answer, not a failure: the entry ends and the file is left alone.
      if (isAlreadyThere(error)) return 'skipped';
      throw error;
    }
  }

  /** A folder directly in the Space root has no parent folder; a deeper one needs its parent's id. */
  private parentFolderIdForFolder(path: string): string | null {
    return path.includes('/') ? this.parentFolderId(path) : null;
  }

  private frontmatterId(content: string, path: string): string {
    const id = this.parser.parse(content).frontmatter.id;
    if (typeof id !== 'string' || id === '') throw new Error(`The bundled file “${path}” has no id`);

    return id;
  }

  /** A file the Vault does not know yet, registered read-only (never written). */
  private async registerExisting(entry: WelcomeEntry): Promise<void> {
    if (entry.kind === 'directory') return;
    const path = this.absolute(entry.path);

    try {
      if (await this.deps.fileSystem.exists(path)) await this.deps.reconcileKnownPath(path);
    } catch (error) {
      console.warn(`Registering “${entry.path}” with the Vault failed:`, error);
    }
  }
}

/**
 * The two failure classes this workflow acts on, recognised by the typed fields of the write errors rather than by
 * importing the atomic writer's classes: `AtomicWriteContract.test.ts` keeps the writer's importers to a short, named
 * list, and this workflow is not on it. `name`, `reason` and `retryable` are the errors' own typed fields, never message
 * text.
 */
interface NotCommittedLike {
  readonly name: 'AtomicNotCommittedError';
  readonly reason: string;
  readonly retryable: boolean;
}

function isNotCommitted(error: unknown): error is NotCommittedLike {
  return error instanceof Error && error.name === 'AtomicNotCommittedError' && typeof (error as { reason?: unknown }).reason === 'string';
}

/** Something was already at the destination: the answer to a create-only write, not a failure. */
function isAlreadyThere(error: unknown): boolean {
  return error instanceof DestinationExistsError || (isNotCommitted(error) && error.reason === 'destinationExists');
}

/** A failure that trying again cannot change. Anything not typed as permanent is retried (the attempt cap bounds it). */
function isPermanent(error: unknown): boolean {
  return isNotCommitted(error) && error.reason !== 'destinationExists' && error.retryable === false;
}
