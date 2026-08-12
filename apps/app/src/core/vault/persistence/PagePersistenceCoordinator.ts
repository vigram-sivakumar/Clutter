import type { Page } from '../models/Page';
import type { PageMetadata } from '../models/PageMetadata';
import type { PageFrontmatter } from '../ingest/frontmatter/PageFrontmatter';
import type { Folder } from '../models/Folder';
import type { FolderMetadata } from '../models/FolderMetadata';
import { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { PageBuilder } from '../ingest/PageBuilder';
import { FolderBuilder } from '../ingest/FolderBuilder';
import { FolderPathResolver } from './FolderPathResolver';
import type { ScannedPage, ScannedDirectory } from '../ingest/VaultScanResult';
import { VaultPath } from '../ingest/VaultPath';
import { MoveService } from './MoveService';

/**
 * Every disk write for a page — save, create, archive, restore, delete,
 * move, and rename — is expressed as one of these and enqueued through
 * PagePersistenceCoordinator. This is the only vocabulary any caller uses;
 * there is no other way to reach a write.
 *
 * 'create-folder' is the one folder-scoped kind: folder operations reuse
 * this same Gate, keyed by folder id instead of page id, per spec §7.
 */
export type PersistenceOperation =
  | {
      readonly kind: 'save';
      readonly content: string;
      // Optional metadata patch, applied to the current Page before
      // re-serializing (see writeParseRebuildReplace) — lets a metadata-only
      // update (PageOperations.updateMetadata) reuse this same kind and the
      // same write-parse-rebuild-replace pipeline body saves already use,
      // instead of a second operation kind that would just call the same
      // helper again (ARCHITECTURE_RULES.md rule 12; implementation-rules
      // §6 "merge instead of expand").
      readonly metadata?: Partial<PageMetadata>;
    }
  | {
      readonly kind: 'create';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  | { readonly kind: 'archive' }
  | { readonly kind: 'restore' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'move'; readonly destinationFolderId: string }
  | { readonly kind: 'rename'; readonly title: string }
  | {
      readonly kind: 'create-folder';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  | { readonly kind: 'delete-folder' }
  // ADR-024 amendment: interim, explicitly time-boxed kind — same-parent
  // path change only (no destinationFolderId in its shape, so it cannot
  // express a move even by caller error). Retired and merged into the
  // originally-specified unified 'move-folder' kind once FolderOperations.move()
  // ships with its Folder Picker UI; see the ADR's implementation-sequencing
  // amendment.
  | { readonly kind: 'rename-folder'; readonly name: string }
  // ADR-026 §0/§3: deliberately not the page-scoped 'archive'/'restore'
  // kinds — a folder id can never reach a page-scoped kind name without an
  // early branch (runOperation() resolves vault.getPage(id) before its
  // general switch), and a folder's directory-preserving relocation is a
  // different operation from a page's flatten-to-Archive/ move, not a
  // parameterization of the same one (same reasoning
  // 'delete-folder'/'rename-folder' already established).
  | { readonly kind: 'archive-folder' }
  | { readonly kind: 'restore-folder' };

export type PersistenceResult =
  | {
      readonly status: 'saved';
      readonly page: Page;
    }
  | {
      readonly status: 'deleted';
    }
  | {
      readonly status: 'abandoned';
      readonly reason: string;
    }
  | {
      readonly status: 'folder-created';
      readonly folder: Folder;
    }
  | {
      readonly status: 'folder-deleted';
    }
  | {
      readonly status: 'folder-renamed';
      readonly folder: Folder;
    }
  | {
      readonly status: 'folder-archived';
      readonly folder: Folder;
    }
  | {
      readonly status: 'folder-restored';
      readonly folder: Folder;
    };

/**
 * Sole owner of the write -> parse -> rebuild -> vault.replacePage pipeline
 * for page content.
 *
 * Every writer of page content — edit-saves, archive, restore, and any
 * future structural mutation — must go through here. A single per-page queue
 * serializes every write targeting a given page, and each queued operation
 * is handed the Vault's latest committed Page for that id at the moment it
 * actually runs (not whatever the caller captured when it enqueued), so a
 * later operation always builds on the result of an earlier one instead of
 * silently overwriting it.
 *
 * Does NOT know about DocumentSession, DocumentRevision, or SaveCoordinator.
 * Callers are responsible for translating their own vocabulary (a committed
 * revision, an archive request, ...) into a PersistenceOperation.
 */
export class PagePersistenceCoordinator {
  private readonly queues = new Map<string, Promise<unknown>>();

  // Constructed once here, for this Gate's own lifetime — a separate,
  // stateless PageBuilder instance from the one VaultBuilder owns for the
  // initial scan, since the two serve genuinely different lifecycles (see
  // ADR-011). Not a duplicate construction of the same long-lived purpose.
  // Assigned in the constructor body (not a field initializer) since it
  // needs `vault.root`, only available once the `vault` parameter binds.
  private readonly pageBuilder: PageBuilder;
  // Same reasoning as pageBuilder above, for folders.
  private readonly folderBuilder = new FolderBuilder();

  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly vault: Vault,
    private readonly serializer: FrontmatterSerializer,
    private readonly parser: FrontmatterParser,
    private readonly rebuilder: PageRebuilder,
    private readonly moveService: MoveService
  ) {
    this.pageBuilder = new PageBuilder(vault.root);
  }

  /**
   * Enqueues a persistence operation for the given page or folder id.
   *
   * The operation runs only once every previously enqueued operation for
   * the same id has settled, and (for page kinds) is dispatched against the
   * Vault's current Page for that id as of that point in time. Folder
   * operations share this same queue, keyed by folder id instead of page
   * id (spec §7) — the two id spaces never collide in practice, and this
   * class doesn't need to distinguish them ahead of dispatch.
   */
  public enqueue(
    id: string,
    operation: PersistenceOperation
  ): Promise<PersistenceResult> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.runOperation(id, operation));

    this.queues.set(id, next);

    return next.finally(() => {
      if (this.queues.get(id) === next) {
        this.queues.delete(id);
      }
    });
  }

  private async runOperation(
    id: string,
    operation: PersistenceOperation
  ): Promise<PersistenceResult> {
    // 'create' and 'create-folder' are dispatched before the existing-page
    // guard below, because their usual target does not exist in the Vault
    // yet. 'create' is not exempt from that guard, though (see runCreate's
    // own dequeue-time check, ADR-017 §4) — deferred-persistence callers (a
    // promoted draft's first save) can enqueue a second 'create' for an id
    // the first one already persisted, so 'create' itself resolves the id's
    // current Vault state at dequeue time instead of assuming it, same as
    // every other kind. 'create-folder' has the same dequeue-time guard
    // (runCreateFolder), for the same reason.
    if (operation.kind === 'create') {
      return this.runCreate(id, operation);
    }

    if (operation.kind === 'create-folder') {
      return this.runCreateFolder(id, operation);
    }

    // Folder-scoped kinds, keyed by folder id (spec §7) — dispatched here,
    // like 'create'/'create-folder' above, because the page-existence
    // guard right below would incorrectly abandon them (a folder id never
    // resolves via vault.getPage).
    if (operation.kind === 'delete-folder') {
      return this.runDeleteFolder(id);
    }

    if (operation.kind === 'rename-folder') {
      return this.runRenameFolder(id, operation.name);
    }

    if (operation.kind === 'archive-folder') {
      return this.runArchiveFolder(id);
    }

    if (operation.kind === 'restore-folder') {
      return this.runRestoreFolder(id);
    }

    const current = this.vault.getPage(id);

    if (!current) {
      return {
        status: 'abandoned',
        reason: `Page no longer exists in the vault: ${id}`,
      };
    }

    switch (operation.kind) {
      case 'save': {
        const target = operation.metadata
          ? { ...current, metadata: { ...current.metadata, ...operation.metadata } }
          : current;
        return this.writeParseRebuildReplace(target, operation.content);
      }
      case 'archive':
        return this.runArchive(current);
      case 'restore':
        return this.runRestore(current);
      case 'delete':
        return this.runDelete(current);
      case 'move':
        return this.runMove(current, operation.destinationFolderId);
      case 'rename':
        return this.runRename(current, operation.title);
    }
  }

  /**
   * Unlike save/archive/restore, a pure move changes neither file content
   * nor frontmatter — there is nothing to re-serialize or re-parse, so this
   * does not go through writeParseRebuildReplace. movePage already updates
   * the Vault's path index internally.
   */
  private async runMove(
    current: Page,
    destinationFolderId: string
  ): Promise<PersistenceResult> {
    const destination = this.moveService.resolveMoveDestination(
      current,
      destinationFolderId
    );

    const updated: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
    };

    await this.moveService.movePage(current, updated);

    return { status: 'saved', page: this.vault.getPage(current.id)! };
  }

  /**
   * Renames a page in place (completes the rename() capability spec §6
   * always listed but left unimplemented — ADR-012's disposition). Same
   * parent only, mirroring runRenameFolder's shape exactly, one aggregate
   * over: like a pure move, this changes neither file content nor
   * frontmatter, so it doesn't go through writeParseRebuildReplace —
   * movePage() already updates the Vault's path (and, since it recomputes
   * `name` from the new path, title) index internally.
   */
  private async runRename(current: Page, title: string): Promise<PersistenceResult> {
    const destination = this.moveService.resolveRenameDestination(current, title);

    const updated: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
    };

    await this.moveService.movePage(current, updated);

    return { status: 'saved', page: this.vault.getPage(current.id)! };
  }

  private async runDelete(current: Page): Promise<PersistenceResult> {
    await this.fileSystem.deleteFile(current.path);
    // Only possible caller of removePage for an app-initiated deletion is
    // this dispatch, reached only after the existing-page guard above, so
    // there is no double-delete race for removePage to reject here — the
    // per-page queue already prevents a second delete for the same id from
    // reaching this point concurrently.
    this.vault.removePage(current.id);

    return { status: 'deleted' };
  }

  private async runCreate(
    pageId: string,
    operation: {
      readonly kind: 'create';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  ): Promise<PersistenceResult> {
    // Dequeue-time existence check (ADR-017 §4 concurrency correction): a
    // second 'create' enqueued for the same id — possible once persistence
    // can be deferred past a single synchronous call, e.g. two rapid saves
    // on the same still-unpersisted draft — must not write a second file or
    // call Vault.addPage a second time. If the id was already persisted by
    // an earlier operation in this same per-page queue, treat this as the
    // save it actually is against the page's real, already-established
    // path, via the same helper 'save' already uses. This is the only
    // guard 'create' needed; every other kind already had its own.
    const existing = this.vault.getPage(pageId);

    if (existing) {
      // 'create's content is always a full serialized document (frontmatter
      // + body, per PageCreator/PageFactory) — not the body-only markdown
      // writeParseRebuildReplace (shared with 'save') expects. Parse it
      // first to recover the body.
      const { frontmatter, body } = this.parser.parse(operation.content);

      // A losing 'create' in a promotion race (ADR-017 §4's guard, now
      // reached from any of title/body/metadata) can be a metadata-only
      // promotion attempt whose entire payload is this frontmatter — if it
      // were discarded here, the user's change would be silently lost even
      // though this dispatch reports success. Only the explicitly-present
      // editable fields are merged (never 'created'/'modified'/'status'/
      // etc., which the losing attempt's own content is stale for — the
      // winning create already established those); an absent field here
      // must never overwrite one the winner already set.
      const metadataPatch = this.extractEditableMetadataPatch(frontmatter);
      const target =
        Object.keys(metadataPatch).length > 0
          ? { ...existing, metadata: { ...existing.metadata, ...metadataPatch } }
          : existing;

      return this.writeParseRebuildReplace(target, body);
    }

    await this.fileSystem.writeFile(operation.path, operation.content);

    // Reuses the same parse pipeline VaultScanner/DocumentLoader use during
    // scan — ParsedMarkdown's fields are structurally identical to
    // ScannedPage's, minus path/directoryPath, so this is not a hand-rolled
    // extraction, it's the existing one.
    const parsed = this.parser.parse(operation.content);
    const scannedPage: ScannedPage = {
      path: operation.path,
      directoryPath: VaultPath.parentDirectory(operation.path),
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    };

    const built = this.pageBuilder.build({
      parentId: operation.parentId,
      page: scannedPage,
    });

    try {
      this.vault.addPage(built);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the created page after a successful write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'saved', page: built };
  }

  /**
   * Mirrors runCreate, one aggregate over: writes the directory and its
   * .folder.md (the persisted-identity file — see FolderCreator), then
   * registers the resulting Folder in the Vault. Unlike a page, a folder
   * has no separate 'save' path to fall back on for its dequeue-time
   * double-create guard — a second 'create-folder' for an id this queue
   * already persisted simply returns that already-registered Folder.
   */
  private async runCreateFolder(
    folderId: string,
    operation: {
      readonly kind: 'create-folder';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  ): Promise<PersistenceResult> {
    const existing = this.vault.getFolder(folderId);

    if (existing) {
      return { status: 'folder-created', folder: existing };
    }

    await this.fileSystem.createDirectory(operation.path);
    await this.fileSystem.writeFile(
      `${operation.path}/.folder.md`,
      operation.content
    );

    // Reuses the same parse pipeline VaultScanner/DocumentLoader use during
    // scan, same as runCreate does for pages.
    const parsed = this.parser.parse(operation.content);
    const scannedDirectory: ScannedDirectory = {
      path: operation.path,
      parentPath: null, // unused by FolderBuilder — parentId is passed explicitly below
      frontmatter: parsed.frontmatter,
    };

    const built = this.folderBuilder.build({
      parentId: operation.parentId,
      directory: scannedDirectory,
    });

    try {
      this.vault.addFolder(built);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the created folder after a successful write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'folder-created', folder: built };
  }

  /**
   * Cascade-deletes a folder and everything nested inside it (ADR-024 §5).
   * Reuses Vault.getDescendantFoldersAndPages() — the one implementation of
   * this subtree walk — for both the disk-deletion order and, ultimately,
   * Vault.removeFolder()'s own cascade.
   *
   * Deletes bottom-up: every descendant page's file first (order doesn't
   * matter among these — they're leaves), then every descendant folder's
   * directory deepest-first, then the target folder's own directory last.
   * This is why no recursive-delete Platform capability is needed
   * (ARCHITECTURE_RULES.md rule 4's Alternative B, rejected in the ADR):
   * by construction, every path still inside a directory has already been
   * removed by the time that directory itself is deleted, so the existing
   * single-entry deleteFile() is always deleting an empty directory.
   */
  private async runDeleteFolder(folderId: string): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    const { folders: descendantFolders, pages: descendantPages } =
      this.vault.getDescendantFoldersAndPages(folderId);

    for (const page of descendantPages) {
      await this.fileSystem.deleteFile(page.path);
    }

    // Deepest-first (longest path first) — a parent directory must still
    // be empty of tracked descendants when its own deleteFile() call runs.
    const foldersInnermostFirst = [...descendantFolders, folder].sort(
      (a, b) => b.path.length - a.path.length
    );

    for (const folderToDelete of foldersInnermostFirst) {
      const folderMetadataPath = `${folderToDelete.path}/.folder.md`;

      if (await this.fileSystem.exists(folderMetadataPath)) {
        await this.fileSystem.deleteFile(folderMetadataPath);
      }

      await this.fileSystem.deleteFile(folderToDelete.path);
    }

    this.vault.removeFolder(folderId);

    return { status: 'folder-deleted' };
  }

  /**
   * Renames a folder in place (ADR-024's interim 'rename-folder' kind —
   * never reparents; see the ADR's implementation-sequencing amendment).
   * moveFile() already cascades a directory move to every nested path
   * (LocalFileSystem — a thin wrapper over the Tauri fs plugin's generic
   * rename(); InMemoryVaultFileSystem — fixed to match), so one call moves
   * the folder and everything inside it; Vault.moveFolder() then applies
   * the identical cascade to the in-memory model.
   */
  private async runRenameFolder(
    folderId: string,
    name: string
  ): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    const destination = new FolderPathResolver(this.vault).resolveRenamePath(folderId, name);

    if (destination.path !== folder.path) {
      await this.fileSystem.moveFile(folder.path, destination.path);
      this.vault.moveFolder(folderId, destination.path, destination.parentId);
    }

    return { status: 'folder-renamed', folder: this.vault.getFolder(folderId)! };
  }

  /**
   * ADR-026 §0: the archive metadata-patch computation is fully shared
   * business logic between a page's archive and a folder's — only the
   * persistence (flatten-move vs. directory-relocate) differs. `Page`'s
   * `updatedAt` is folded in by runArchive's own caller, since
   * `FolderMetadata` has no `updatedAt` field to carry it.
   */
  private computeArchiveMetadataPatch(
    currentPath: string,
    currentParentId: string | null
  ): Pick<PageMetadata, 'status' | 'archivedAt' | 'originalPath' | 'originalParentId'> {
    return {
      status: 'archived',
      archivedAt: new Date().toISOString(),
      originalPath: currentPath,
      originalParentId: currentParentId,
    };
  }

  /**
   * Archiving both relocates the page and rewrites its metadata, so unlike
   * a pure move/rename (movePage()) or a pure content/metadata save
   * (writeParseRebuildReplace()), it needs both — but composing those two
   * existing primitives in sequence (movePage() then
   * writeParseRebuildReplace()) commits two separate Vault mutations,
   * exposing a real intermediate state (path already under Archive/,
   * status still 'active') between them.
   *
   * Relocates via a single atomic fileSystem.moveFile() — the same
   * primitive MoveService.movePage() itself uses for every other
   * cross-path change (rename/move/restore) — rather than a write-then-
   * delete pair: moveFile is wrapped by SelfWriteAwareFileSystem (the
   * watcher's echo of it is suppressed) and, being one OS-level rename,
   * has no window where both the old and new files exist. The corrected
   * frontmatter is then written in place at the (already-relocated)
   * destination path — a same-path write, with none of a cross-path
   * write's duplicate-file risk — and only then is the fully-archived Page
   * committed via replacePage() (already the correct primitive for "path
   * and metadata change together," mirroring Vault.archiveFolder()'s
   * folder-side equivalent) as the single Vault mutation/notify.
   *
   * Idempotent on retry: if an earlier attempt already completed the move
   * but failed before the frontmatter write or the Vault commit, the
   * source no longer exists and the file already sits at the destination.
   * Detected via fileSystem.exists() (an existing primitive, no new
   * mechanism) so a retry skips the now-impossible move instead of
   * throwing "source not found" and getting permanently stuck — the same
   * failure shape identified for Folder Archive, closed here the same way.
   */
  private async runArchive(current: Page): Promise<PersistenceResult> {
    if (current.metadata.status === 'archived') {
      throw new Error(`Page is already archived: ${current.id}`);
    }

    const archivePatch = this.computeArchiveMetadataPatch(current.path, current.parentId);
    const destination = this.moveService.resolveArchiveDestination(current);

    // Same collision guard MoveService.movePage() applies for every other
    // structural change (rule: never silently overwrite another tracked
    // page's file) — checked before any write, since this method calls
    // fileSystem.moveFile() directly rather than movePage().
    const occupant = this.vault.getPageByPath(destination.path);

    if (occupant && occupant.id !== current.id) {
      throw new Error(`Path already in use by another page: ${destination.path}`);
    }

    const page: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
      metadata: {
        ...current.metadata,
        ...archivePatch,
        updatedAt: archivePatch.archivedAt,
      },
    };

    if (current.path !== page.path) {
      const candidateAlreadyMoved =
        !(await this.fileSystem.exists(current.path)) &&
        (await this.fileSystem.exists(page.path));

      // Bare path existence is not proof this is our own prior partial
      // attempt — an untracked orphan, a stale Vault path, or an external
      // race could produce the same shape. Only a matching persisted id
      // proves it; anything else falls through to the normal move, which
      // fails loudly on a genuine unexpected collision instead of
      // silently overwriting it.
      const alreadyMoved =
        candidateAlreadyMoved &&
        (await this.destinationMatchesArchivedPage(page.path, current.id));

      if (!alreadyMoved) {
        await this.fileSystem.moveFile(current.path, page.path);
      }
    }

    const document = this.serializer.serializeDocument(page, current.source.markdown);

    await this.fileSystem.writeFile(page.path, document);

    const parsed = this.parser.parse(document);
    const rebuilt = this.rebuilder.rebuild(page, parsed);

    this.vault.replacePage(rebuilt);

    return { status: 'saved', page: rebuilt };
  }

  /**
   * Confirms the file already sitting at a would-be archive destination is
   * genuinely the page being archived, not merely something present at the
   * deterministic Archive/<name> path. Reuses the same FrontmatterParser
   * every other read in this class already uses — no new identity system.
   * Any failure to confirm (missing, unreadable, malformed, or a different
   * id) returns false, never true — the caller treats that identically to
   * "not our prior move."
   */
  private async destinationMatchesArchivedPage(
    path: string,
    expectedId: string
  ): Promise<boolean> {
    try {
      const content = await this.fileSystem.readFile(path);
      return this.parser.parse(content).frontmatter.id === expectedId;
    } catch {
      return false;
    }
  }

  /**
   * ADR-026 §2/§3: archives a folder by relocating its entire subtree as
   * one directory move into Archive/ (Vault.archiveFolder's cascade —
   * mirrors runDeleteFolder/runRenameFolder's existing directory-safe
   * extension of the page-scoped pattern), then persists the target
   * folder's own new frontmatter to disk — the folder-scoped counterpart
   * to runArchive's write, since a folder's archived
   * status/archivedAt/originalPath/originalParentId live in its
   * `.folder.md`, not just in memory. Descendant folders'/pages' own files
   * are untouched (ADR-026 §2 — only the target folder's own metadata
   * changes); their new location is handled entirely by the one directory
   * move.
   *
   * The final `.folder.md` is built from `folder`/`archivePatch`/
   * `destination` — already-known, pre-mutation data — and written to disk
   * before `vault.archiveFolder()` runs, so disk fully reflects the final
   * archived state before the single Vault mutation commits and notifies.
   * Never reads the Vault back merely to construct that document (the
   * previous shape did, reading `vault.getFolder(folderId)` only after
   * already mutating it, which put the disk write after the Vault commit —
   * the one write in this file that inverted the Gate's otherwise
   * consistent disk-before-Vault ordering).
   *
   * Idempotent on retry: a directory move is a single atomic OS rename, so
   * there is no rollback to perform if the subsequent `.folder.md` write
   * fails — the move already fully happened, correctly, and cannot be
   * undone or repeated. What made a retry fail permanently before this fix
   * is that the *next* call still asked "does folder.path exist?" using
   * the Vault's stale (pre-move) belief and tried to move a source that no
   * longer existed. Detected via fileSystem.exists() (an existing
   * primitive — no rollback/transaction framework introduced) so a retry
   * recognizes the folder is already at its destination and only redoes
   * the `.folder.md` write and the Vault commit.
   */
  private async runArchiveFolder(folderId: string): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    if (folder.metadata.status === 'archived') {
      throw new Error(`Folder is already archived: ${folderId}`);
    }

    const archivePatch = this.computeArchiveMetadataPatch(folder.path, folder.parentId);
    const destination = new FolderPathResolver(this.vault).resolveArchiveDestination(folderId);

    const finalFolder: Folder = {
      ...folder,
      name: VaultPath.filename(destination.path),
      path: destination.path,
      parentId: destination.parentId,
      metadata: { ...folder.metadata, ...archivePatch },
    };

    const candidateAlreadyMoved =
      folder.path !== destination.path &&
      !(await this.fileSystem.exists(folder.path)) &&
      (await this.fileSystem.exists(destination.path));

    // A directory being present proves nothing about its contents — never
    // treat bare directory existence as proof this is our own prior
    // partial move. Only a matching persisted `.folder.md` id proves it.
    // No `.folder.md` (or one with no id, or a different id) means
    // identity cannot be established; fall through to the normal move,
    // which fails loudly on a genuine unexpected collision instead of
    // silently annexing someone else's directory. Deliberately no
    // empty-directory or other heuristic fallback.
    const alreadyMoved =
      candidateAlreadyMoved &&
      (await this.destinationMatchesArchivedFolder(destination.path, folderId));

    if (!alreadyMoved) {
      await this.fileSystem.moveFile(folder.path, destination.path);
    }

    await this.fileSystem.writeFile(
      `${finalFolder.path}/.folder.md`,
      this.serializer.serializeFolderDocument(finalFolder)
    );

    this.vault.archiveFolder(folderId, destination.path, destination.parentId, archivePatch);

    return { status: 'folder-archived', folder: this.vault.getFolder(folderId)! };
  }

  /**
   * Confirms a directory already sitting at a would-be archive destination
   * is genuinely the folder being archived. Only a persisted `.folder.md`
   * id proves this — the same source of truth IdentityResolver already
   * treats as authoritative for folder identity elsewhere. A folder with
   * no persisted id has no stable, path-independent identity to verify by
   * design (IdentityResolver falls back to a path-derived id, which can
   * never match a real destination's own persisted id) — not a gap this
   * method needs to special-case. Any failure to confirm (no `.folder.md`,
   * unreadable, no id, or a different id) returns false, never true.
   */
  private async destinationMatchesArchivedFolder(
    destinationPath: string,
    expectedId: string
  ): Promise<boolean> {
    const metadataPath = `${destinationPath}/.folder.md`;

    try {
      if (!(await this.fileSystem.exists(metadataPath))) {
        return false;
      }

      const content = await this.fileSystem.readFile(metadataPath);
      return this.parser.parse(content).frontmatter.id === expectedId;
    } catch {
      return false;
    }
  }

  /**
   * ADR-026 §2/§3 (implemented per the amendment's follow-up milestone):
   * symmetric counterpart to runArchiveFolder — relocates the folder's
   * whole subtree back to the caller-resolved restore destination
   * (FolderPathResolver.resolveRestoreDestination, mirroring
   * MoveService.resolveRestoreDestination's page-side contract exactly:
   * keyed on the folder's own `originalPath` alone, parent-exists → exact
   * originalPath, else vault root, no Inbox, no originalParentId lookup),
   * then persists the target folder's own cleared archive metadata.
   * Descendant folders'/pages' own metadata is untouched, for the same
   * reason runArchiveFolder leaves them untouched — their new location is
   * handled entirely by the one directory move.
   *
   * Same disk-before-Vault ordering and idempotent-on-retry shape as
   * runArchiveFolder: the final `.folder.md` is built from already-known,
   * pre-mutation data and written to disk before `vault.restoreFolder()`
   * runs, and a retry after a partial failure recognizes (via
   * fileSystem.exists() + destinationMatchesArchivedFolder) that the
   * directory already moved, redoing only the `.folder.md` write and the
   * Vault commit.
   */
  private async runRestoreFolder(folderId: string): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    if (folder.metadata.status !== 'archived') {
      throw new Error(`Folder is not archived: ${folderId}`);
    }

    // Mirrors runRestore's own inline metadata clear exactly (kept inline
    // there too, per rule — no new shared restore abstraction introduced
    // just to avoid two parallel four-field literals).
    const restorePatch: Pick<
      FolderMetadata,
      'status' | 'archivedAt' | 'originalPath' | 'originalParentId'
    > = {
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    };
    const destination = new FolderPathResolver(this.vault).resolveRestoreDestination(folderId);

    // Same collision guard runArchiveFolder applies at its own destination —
    // checked before any write, since this method calls fileSystem.moveFile()
    // directly rather than a shared move helper.
    const occupant = this.vault.getFolderByPath(destination.path);

    if (occupant && occupant.id !== folder.id) {
      throw new Error(`Folder path already in use: ${destination.path}`);
    }

    const finalFolder: Folder = {
      ...folder,
      name: VaultPath.filename(destination.path),
      path: destination.path,
      parentId: destination.parentId,
      metadata: { ...folder.metadata, ...restorePatch },
    };

    const candidateAlreadyMoved =
      folder.path !== destination.path &&
      !(await this.fileSystem.exists(folder.path)) &&
      (await this.fileSystem.exists(destination.path));

    const alreadyMoved =
      candidateAlreadyMoved &&
      (await this.destinationMatchesArchivedFolder(destination.path, folderId));

    if (!alreadyMoved) {
      await this.fileSystem.moveFile(folder.path, destination.path);
    }

    await this.fileSystem.writeFile(
      `${finalFolder.path}/.folder.md`,
      this.serializer.serializeFolderDocument(finalFolder)
    );

    this.vault.restoreFolder(folderId, destination.path, destination.parentId, restorePatch);

    return { status: 'folder-restored', folder: this.vault.getFolder(folderId)! };
  }

  private async runRestore(current: Page): Promise<PersistenceResult> {
    if (current.metadata.status !== 'archived') {
      throw new Error(`Page is not archived: ${current.id}`);
    }

    const now = new Date().toISOString();
    const destination = this.moveService.resolveRestoreDestination(current);

    const page: Page = {
      ...current,
      path: destination.path,
      parentId: destination.parentId,
      metadata: {
        ...current.metadata,
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
        updatedAt: now,
      },
    };

    await this.moveService.movePage(current, page);

    return this.writeParseRebuildReplace(page, current.source.markdown);
  }

  /**
   * Picks only the user-editable metadata fields that are explicitly
   * present in a parsed frontmatter object — never the system-owned ones
   * (status/archivedAt/originalPath/originalParentId/created/modified),
   * and never a field the frontmatter simply omits, so an absent key can
   * never be mistaken for "clear this field" and overwrite a value another
   * concurrent write already established.
   */
  private extractEditableMetadataPatch(frontmatter: PageFrontmatter): {
    description?: PageMetadata['description'];
    icon?: PageMetadata['icon'];
    cover?: PageMetadata['cover'];
    favorite?: PageMetadata['favorite'];
  } {
    const patch: {
      description?: PageMetadata['description'];
      icon?: PageMetadata['icon'];
      cover?: PageMetadata['cover'];
      favorite?: PageMetadata['favorite'];
    } = {};

    if (frontmatter.description !== undefined) {
      patch.description = frontmatter.description;
    }
    if (frontmatter.icon !== undefined) {
      patch.icon = frontmatter.icon;
    }
    if (frontmatter.cover !== undefined) {
      patch.cover = frontmatter.cover;
    }
    if (frontmatter.favorite !== undefined) {
      patch.favorite = frontmatter.favorite;
    }

    return patch;
  }

  /**
   * Shared by every kind above: serialize the given Page/markdown pair,
   * write it to disk, re-parse what was written, and rebuild the Vault's
   * Page from that. Sync's own metadata-repair write path shares this same
   * shape (see VaultSyncService), so the mechanics of "write, then trust
   * only what a re-read confirms" exist in exactly one place.
   */
  private async writeParseRebuildReplace(
    page: Page,
    markdown: string
  ): Promise<PersistenceResult> {
    const document = this.serializer.serializeDocument(page, markdown);

    await this.fileSystem.writeFile(page.path, document);

    const parsed = this.parser.parse(document);
    const rebuilt = this.rebuilder.rebuild(page, parsed);

    try {
      this.vault.replacePage(rebuilt);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the persisted page after a successful write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'saved', page: rebuilt };
  }
}
