import type { Page } from '../models/Page';
import type { PageMetadata } from '../models/PageMetadata';
import type { PageFrontmatter } from '../ingest/frontmatter/PageFrontmatter';
import type { Folder } from '../models/Folder';
import type { FolderMetadata } from '../models/FolderMetadata';
import type { VaultResource } from '../models/VaultResource';
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
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';
import { resolveResourceRestoreDestination } from './resolveResourceRestoreDestination';
import {
  isDailyNotesFolderOrDescendant,
  reservedFolderRelativePath,
  type ReservedFolderId,
} from '../initialize/ReservedResources';

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
  | { readonly kind: 'move'; readonly destinationFolderId: string | null }
  | { readonly kind: 'rename'; readonly title: string }
  | {
      readonly kind: 'create-folder';
      readonly path: string;
      readonly parentId: string | null;
      readonly content: string;
    }
  | { readonly kind: 'delete-folder' }
  // ADR-024 §4's originally-specified unified kind, reached here per the
  // ADR's own implementation-sequencing amendment: 'rename-folder' shipped
  // first as an interim, explicitly time-boxed kind, then was retired and
  // merged into this one once FolderOperations.move() shipped with its
  // Folder Picker UI — Vault.moveFolder() was already one method for both
  // move and rename, so this is one Gate kind for it, not two.
  // `destinationFolderId: null` means the vault root, matching
  // Folder.parentId's own type; `name` is present only for a rename or a
  // combined move+rename — FolderOperations.move() omits it,
  // FolderOperations.rename() supplies the folder's own current parentId
  // as destinationFolderId plus the new name.
  | { readonly kind: 'move-folder'; readonly destinationFolderId: string | null; readonly name?: string }
  // ADR-026 §0/§3: deliberately not the page-scoped 'archive'/'restore'
  // kinds — a folder id can never reach a page-scoped kind name without an
  // early branch (runOperation() resolves vault.getPage(id) before its
  // general switch), and a folder's directory-preserving relocation is a
  // different operation from a page's flatten-to-Archive/ move, not a
  // parameterization of the same one (same reasoning
  // 'delete-folder'/'move-folder' already established).
  | { readonly kind: 'archive-folder' }
  | { readonly kind: 'restore-folder' }
  // Metadata-only folder patch (e.g. favorite) — the folder-scoped
  // counterpart to 'save's optional `metadata`, but its own kind rather
  // than piggybacking on 'save': a folder has no body `content` to write,
  // and 'save' is dispatched only after the page-existence guard below,
  // which a folder id never passes. Backed by Vault.updateFolderMetadata()
  // (no path/parentId change), not archiveFolder/moveFolder.
  | { readonly kind: 'update-folder-metadata'; readonly metadata: Partial<FolderMetadata> }
  // The shared lazy system-folder lifecycle: the one Gate kind every
  // reserved Vault folder (Daily Notes, Archive, and any future one) is
  // ensured through, immediately before the operation that needs it —
  // nothing eagerly materializes a reserved folder at startup anymore, so
  // "missing" is this kind's ordinary starting state, not an exceptional
  // one. Deliberately a distinct kind from 'create-folder': it writes no
  // .folder.md (a reserved folder never carries an identity file, see
  // ReservedResources.RESERVED_RESOURCES) and always resolves to the
  // fixed, well-known reserved path, never a user-chosen, collision-free
  // name. Keyed by `reservedFolderId` in the queue (not a page/folder id —
  // there isn't one yet), so two concurrent callers recovering the same
  // reserved folder serialize instead of racing.
  | { readonly kind: 'ensure-reserved-folder'; readonly reservedFolderId: ReservedFolderId }
  // Resource-scoped kinds (Rename/Archive/Restore only — no create/delete/
  // move/favorite yet, per the approved Resource mutation scope). Distinct
  // `-resource` names for the same reason 'archive-folder'/'restore-folder'
  // are kept distinct from 'archive'/'restore': a resource id must never
  // reach the page-scoped switch below (runOperation() resolves
  // vault.getPage(id) before it), and a resource's persistence (a bare
  // fileSystem.moveFile — no frontmatter, so no write-parse-rebuild-replace
  // pipeline) is a genuinely different mechanism from a page's, not a
  // parameterization of the same one.
  | { readonly kind: 'rename-resource'; readonly title: string }
  | { readonly kind: 'archive-resource' }
  | { readonly kind: 'restore-resource' }
  // The resource-scoped counterpart to 'move' — an arbitrary destination
  // folder rather than the fixed Archive/ destination 'archive-resource'
  // resolves to. `destinationFolderId: null` means the vault root, same
  // convention 'move'/'move-folder' already use.
  | { readonly kind: 'move-resource'; readonly destinationFolderId: string | null }
  // Permanently deletes a resource — the resource-scoped counterpart to
  // 'delete', reachable only from the archived-resource hover action (see
  // ResourceOperations.deleteResource()'s own doc comment): the UI never
  // exposes this for a normal, non-archived resource.
  | { readonly kind: 'delete-resource' };

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
    }
  | {
      readonly status: 'folder-metadata-updated';
      readonly folder: Folder;
    }
  | {
      readonly status: 'resource-renamed';
      readonly resource: VaultResource;
    }
  | {
      readonly status: 'resource-archived';
      readonly resource: VaultResource;
    }
  | {
      readonly status: 'resource-restored';
      readonly resource: VaultResource;
    }
  | {
      readonly status: 'resource-moved';
      readonly resource: VaultResource;
    }
  | {
      readonly status: 'resource-deleted';
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
    private readonly moveService: MoveService,
    // Trailing and defaulted so every existing call site (production and
    // the many test fixtures that construct this Gate without caring about
    // resources) keeps compiling unchanged — same reasoning Vault's own
    // constructor already applies to its trailing `resources` parameter.
    private readonly resourceArchiveStore: ResourceArchiveMetadataStore = new ResourceArchiveMetadataStore(
      fileSystem,
      vault.root
    )
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

    if (operation.kind === 'move-folder') {
      return this.runMoveFolder(id, operation.destinationFolderId, operation.name);
    }

    if (operation.kind === 'archive-folder') {
      return this.runArchiveFolder(id);
    }

    if (operation.kind === 'restore-folder') {
      return this.runRestoreFolder(id);
    }

    if (operation.kind === 'update-folder-metadata') {
      return this.runUpdateFolderMetadata(id, operation.metadata);
    }

    if (operation.kind === 'ensure-reserved-folder') {
      return this.runEnsureReservedFolder(operation.reservedFolderId);
    }

    // Resource-scoped kinds, keyed by resource id — dispatched here, like
    // every folder-scoped kind above, for the same reason: the
    // page-existence guard right below would incorrectly abandon them (a
    // resource id never resolves via vault.getPage).
    if (operation.kind === 'rename-resource') {
      return this.runRenameResource(id, operation.title);
    }

    if (operation.kind === 'archive-resource') {
      return this.runArchiveResource(id);
    }

    if (operation.kind === 'restore-resource') {
      return this.runRestoreResource(id);
    }

    if (operation.kind === 'delete-resource') {
      return this.runDeleteResource(id);
    }

    if (operation.kind === 'move-resource') {
      return this.runMoveResource(id, operation.destinationFolderId);
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
   *
   * Move applies only to Notes and Folders (approved contract) — a Daily
   * Note has no Move action and cannot be a Move source, checked here
   * (not only by the UI's menu omission) so no caller can bypass it. An
   * archived page may not be moved either, mirroring runArchive's `already
   * archived` guard — Archive is a status-driven pseudo-location, not a
   * normal Move source. The destination-side half of the Daily Notes
   * contract ("nothing moves in") lives in
   * MoveService.resolveMoveDestination, the one place every destination
   * for this kind is computed.
   */
  private async runMove(
    current: Page,
    destinationFolderId: string | null
  ): Promise<PersistenceResult> {
    if (current.type === 'daily-note') {
      throw new Error(`Cannot move a Daily Note: ${current.id}`);
    }

    if (current.metadata.status === 'archived') {
      throw new Error(`Cannot move an archived page: ${current.id}`);
    }

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
   * Materializes a reserved folder (Daily Notes, Archive, ...) on demand —
   * the shared lazy system-folder lifecycle: nothing creates these
   * eagerly at startup anymore, so "missing" covers both "deleted
   * externally, reconciled away by VaultSyncService.handleDeleted()" and
   * "never materialized because nothing has needed it yet" — this method
   * doesn't distinguish the two, and doesn't need to.
   *
   * Idempotent: if the folder is already in Vault (this check re-run at
   * dequeue time, same reasoning as every other kind's own guard), returns
   * it unchanged rather than creating a second one — this is what makes it
   * safe for two concurrent callers to both call this for the same
   * reserved folder id (they serialize through this kind's own per-id
   * queue slot; the second one to run finds the first's result already in
   * Vault).
   *
   * Deliberately a bare `createDirectory()`, no `.folder.md` — unlike
   * runCreateFolder's shape. A reserved folder never carries an identity file (see
   * ReservedResources.RESERVED_RESOURCES: every reserved folder entry is a
   * bare `{type: 'folder', path}`, no paired file), so a reserved folder
   * recreated mid-session must come out identical to one created at boot —
   * writing a `.folder.md` here would make it observably different from
   * every other reserved folder, and would be reusing 'create-folder''s
   * user-folder shape for something that isn't one (ARCHITECTURE_RULES.md
   * rule 5: never blur an aggregate's ownership boundary as a side effect
   * of a nearby fix). `frontmatter: null` (not `{}`) is what tells
   * FolderBuilder/IdentityResolver there is no identity file to read from
   * — the same path-derived-id fallback a fresh boot scan would produce
   * for this exact folder.
   */
  private async runEnsureReservedFolder(
    reservedFolderId: ReservedFolderId
  ): Promise<PersistenceResult> {
    const existing = this.vault.getReservedFolder(reservedFolderId);

    if (existing) {
      return { status: 'folder-created', folder: existing };
    }

    const path = `${this.vault.root}/${reservedFolderRelativePath(reservedFolderId)}`;

    await this.fileSystem.createDirectory(path);

    const built = this.folderBuilder.build({
      parentId: null,
      directory: { path, parentPath: null, frontmatter: null },
    });

    try {
      this.vault.addFolder(built);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the recreated reserved folder after a successful write: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'folder-created', folder: built };
  }

  /**
   * The one call every Gate-layer operation that depends on a reserved
   * folder makes before proceeding — Archive today (runArchive/
   * runArchiveFolder), the same shape any future Gate-layer reserved-
   * folder dependency would use. Routes through the public `enqueue()`
   * entry point (not a direct call to runEnsureReservedFolder) so it
   * serializes against every other caller of 'ensure-reserved-folder' for
   * the same reservedFolderId — including FolderOperations.
   * ensureReservedFolder()'s own callers (e.g. DailyNoteService) — through
   * the one shared per-id queue, rather than racing a second, unserialized
   * path to the same result. Safe to call reentrantly from inside an
   * already-dispatching runOperation(): 'archive'/'daily-notes'/etc. are
   * queue keys distinct from the page/folder id currently being
   * processed, so this awaits an independent queue chain, never the one
   * this call itself is running inside.
   */
  private async ensureReservedFolderForOperation(
    reservedFolderId: ReservedFolderId
  ): Promise<void> {
    const result = await this.enqueue(reservedFolderId, {
      kind: 'ensure-reserved-folder',
      reservedFolderId,
    });

    if (result.status !== 'folder-created') {
      throw new Error(
        `Failed to ensure reserved folder ${reservedFolderId}: ${
          result.status === 'abandoned' ? result.reason : result.status
        }`
      );
    }
  }

  /**
   * Permanently deletes a folder and its entire physical subtree (ADR-024,
   * amended — see "Amendment (delete invariant correction)"). A single
   * recursive VaultFileSystem.deleteFile(path, { recursive: true }) call
   * removes everything under the folder's own path — Vault-tracked pages
   * and folders, .folder.md files, and anything on disk the Vault model
   * never tracked (OS artifacts, externally-dropped files, Assets' own
   * image files) — scoped strictly to this folder's path, never touching
   * anything outside it. Vault.removeFolder() then reconciles the
   * in-memory model in one call; it already performs its own full
   * descendant cascade independent of disk state, so no separate
   * enumeration is needed here.
   */
  private async runDeleteFolder(folderId: string): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    if (await this.fileSystem.exists(folder.path)) {
      await this.fileSystem.deleteFile(folder.path, { recursive: true });
    }

    this.vault.removeFolder(folderId);

    return { status: 'folder-deleted' };
  }

  /**
   * Moves and/or renames a folder in place (ADR-024 §4's unified
   * 'move-folder' kind — one Gate kind backs both FolderOperations.move()
   * and FolderOperations.rename(), since Vault.moveFolder() is already one
   * method for both). moveFile() already cascades a directory move to
   * every nested path (LocalFileSystem — a thin wrapper over the Tauri fs
   * plugin's generic rename(); InMemoryVaultFileSystem — fixed to match),
   * so one call moves the folder and everything inside it;
   * Vault.moveFolder() then applies the identical cascade to the
   * in-memory model.
   *
   * Daily Notes is opaque to Move in both directions (approved contract):
   * a folder that is the reserved Daily Notes folder, or lives inside it,
   * may never be relocated by this operation, regardless of destination —
   * checked here (not only in the resolver) so a same-parent rename of a
   * Daily-Notes-resident folder is rejected too, not just a reparenting
   * move. The destination-side half of the same contract lives in
   * FolderPathResolver.resolveMoveDestination, the one place every
   * destination for this kind is computed.
   *
   * An archived folder may not be moved — Archive is a status-driven
   * pseudo-location, not a normal destination or source for Move; mirrors
   * runArchive's `already archived` guard, one aggregate over.
   */
  private async runMoveFolder(
    folderId: string,
    destinationFolderId: string | null,
    name?: string
  ): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    if (folder.metadata.status === 'archived') {
      throw new Error(`Cannot move an archived folder: ${folderId}`);
    }

    if (isDailyNotesFolderOrDescendant(this.vault.root, folder.path)) {
      throw new Error(`Cannot move a folder out of Daily Notes: ${folderId}`);
    }

    const destination = new FolderPathResolver(this.vault).resolveMoveDestination(
      folderId,
      destinationFolderId,
      name
    );

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

    await this.ensureReservedFolderForOperation('archive');

    const archivePatch = this.computeArchiveMetadataPatch(current.path, current.parentId);
    const destination = this.moveService.resolveArchiveDestination(current);

    // Same collision guard MoveService.movePage() applies for every other
    // structural change (rule: never silently overwrite another tracked
    // page's file) — checked before any write, since this method calls
    // fileSystem.moveFile() directly rather than movePage().
    const occupant = this.vault.getPageByPathCaseInsensitive(destination.path);

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

    await this.ensureReservedFolderForOperation('archive');

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
    const occupant = this.vault.getFolderByPathCaseInsensitive(destination.path);

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

  /**
   * Metadata-only folder patch (favorite, ...) — no path/parentId change,
   * so unlike runArchiveFolder/runRestoreFolder there is no directory move:
   * only the target's own `.folder.md` is rewritten, mirroring runOperation's
   * 'save' branch (metadata-only, disk-before-Vault) but via
   * Vault.updateFolderMetadata() instead of replacePage().
   */
  private async runUpdateFolderMetadata(
    folderId: string,
    metadata: Partial<FolderMetadata>
  ): Promise<PersistenceResult> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      return {
        status: 'abandoned',
        reason: `Folder no longer exists in the vault: ${folderId}`,
      };
    }

    const finalFolder: Folder = {
      ...folder,
      metadata: { ...folder.metadata, ...metadata },
    };

    await this.fileSystem.writeFile(
      `${finalFolder.path}/.folder.md`,
      this.serializer.serializeFolderDocument(finalFolder)
    );

    this.vault.updateFolderMetadata(folderId, metadata);

    return { status: 'folder-metadata-updated', folder: this.vault.getFolder(folderId)! };
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
   * Guards the "one path maps to one resource" invariant at the one point
   * it actually matters for a filesystem move: before the disk write, not
   * only after. Vault.updateResourcePath() (called at the end of every
   * resource operation below) already re-checks this itself — see its own
   * assertResourcePathAvailable — but that check alone would let a
   * collision succeed on disk (fileSystem.moveFile already ran) before
   * being rejected in memory, leaving disk and Vault inconsistent. The
   * page-scoped equivalent of this same defense-in-depth shape already
   * exists in MoveService.movePage()'s own inline collision check, ahead
   * of its own moveFile call — this mirrors that, resource-scoped.
   */
  private assertResourceDestinationAvailable(
    path: string,
    exceptResourceId: string
  ): void {
    const occupant = this.vault.getResourceByPathCaseInsensitive(path);

    if (occupant && occupant.id !== exceptResourceId) {
      throw new Error(`Path already in use by another resource: ${path}`);
    }
  }

  /**
   * Renames a VaultResource in place — the resource-scoped counterpart to
   * runRename, one aggregate over. Unlike a page/folder rename, there is no
   * frontmatter to rewrite (VaultResource carries none — see §3b), so this
   * is strictly a filesystem move plus a Vault path update, nothing else:
   * no write-parse-rebuild-replace pipeline, because there is no content or
   * frontmatter to round-trip.
   *
   * If `resource` currently sits inside the reserved Archive/ folder (the
   * UI never offers Rename for one today, but this dispatch has no
   * archived-status guard of its own — same UI-only-restriction precedent
   * runDeleteResource/runDelete already establish), its
   * `.clutter/resource-archive.json` provenance record is re-keyed to the
   * new archived path via updateArchivedPath — otherwise Restore would look
   * up the *old* archived path and find nothing, silently stranding the
   * resource in Archive/ with no way back to its original location.
   */
  private async runRenameResource(
    resourceId: string,
    title: string
  ): Promise<PersistenceResult> {
    const resource = this.vault.getResource(resourceId);

    if (!resource) {
      return {
        status: 'abandoned',
        reason: `Resource no longer exists in the vault: ${resourceId}`,
      };
    }

    const previousPath = resource.path;
    const destination = this.moveService.resolveResourceRenameDestination(resource, title);

    if (destination.path !== resource.path) {
      this.assertResourceDestinationAvailable(destination.path, resource.id);
      await this.fileSystem.moveFile(resource.path, destination.path);
    }

    if (this.isInsideArchive(previousPath) && destination.path !== previousPath) {
      await this.resourceArchiveStore.updateArchivedPath(previousPath, destination.path);
    }

    try {
      this.vault.updateResourcePath(resourceId, destination.path, destination.parentId);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the renamed resource after a successful move: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'resource-renamed', resource: this.vault.getResource(resourceId)! };
  }

  /** Whether `path` sits inside the reserved Archive/ folder, if one is tracked yet. */
  private isInsideArchive(path: string): boolean {
    const archiveFolder = this.vault.getReservedFolder('archive');
    return archiveFolder !== undefined && VaultPath.isDescendantOf(path, archiveFolder.path);
  }

  /**
   * Archives a VaultResource: relocates it into the reserved Archive/
   * folder (resolveResourceArchiveDestination — same reserved-folder lookup
   * and collision-free-naming rule as a page's archive, extension
   * preserved instead of `.md` appended) and records its provenance in
   * ResourceArchiveMetadataStore's `.clutter/resource-archive.json` —
   * VaultResource carries no `status`/`archivedAt`/`originalPath` fields of
   * its own (unlike Page/Folder — see the approved Resource mutation
   * design), so this file is the sole record of where to restore to.
   *
   * Ordering matters: the provenance record is written only after the
   * filesystem move has actually succeeded — if fileSystem.moveFile above
   * throws, `record()` is never reached, so no provenance is ever recorded
   * for a resource that never actually moved.
   */
  private async runArchiveResource(resourceId: string): Promise<PersistenceResult> {
    const resource = this.vault.getResource(resourceId);

    if (!resource) {
      return {
        status: 'abandoned',
        reason: `Resource no longer exists in the vault: ${resourceId}`,
      };
    }

    await this.ensureReservedFolderForOperation('archive');

    const destination = this.moveService.resolveResourceArchiveDestination(resource);
    const originalPath = resource.path;

    if (destination.path !== resource.path) {
      this.assertResourceDestinationAvailable(destination.path, resource.id);
      await this.fileSystem.moveFile(resource.path, destination.path);
    }

    await this.resourceArchiveStore.record(destination.path, originalPath);

    try {
      this.vault.updateResourcePath(resourceId, destination.path, destination.parentId);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the archived resource after a successful move: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'resource-archived', resource: this.vault.getResource(resourceId)! };
  }

  /**
   * Restores a VaultResource from Archive/ — the symmetric counterpart to
   * runArchiveResource. resolveResourceRestoreDestination (Step 3) already
   * encodes the full destination rule (original path if its parent still
   * exists, else the managed Assets/ folder, ensuring/registering it on
   * demand) and reads `.clutter/resource-archive.json` itself; this method
   * only sequences the move and the provenance-record cleanup around it.
   *
   * Ordering matters, same as archive: the provenance record is removed
   * only after the filesystem move has actually succeeded — if either the
   * collision guard or fileSystem.moveFile above throws, `remove()` is
   * never reached, so a failed restore leaves the record intact for a
   * retry rather than silently losing the resource's only known original
   * location.
   *
   * No collision-free renaming at the resolved destination — Restore never
   * auto-renames, for Page/Folder or here; assertResourceDestinationAvailable
   * is what makes an occupied destination fail loudly instead.
   */
  private async runRestoreResource(resourceId: string): Promise<PersistenceResult> {
    const resource = this.vault.getResource(resourceId);

    if (!resource) {
      return {
        status: 'abandoned',
        reason: `Resource no longer exists in the vault: ${resourceId}`,
      };
    }

    const destination = await resolveResourceRestoreDestination(
      resource,
      this.vault,
      this.fileSystem,
      this.resourceArchiveStore
    );

    if (destination.path !== resource.path) {
      this.assertResourceDestinationAvailable(destination.path, resource.id);
      await this.fileSystem.moveFile(resource.path, destination.path);
    }

    await this.resourceArchiveStore.remove(resource.path);

    try {
      this.vault.updateResourcePath(resourceId, destination.path, destination.parentId);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the restored resource after a successful move: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'resource-restored', resource: this.vault.getResource(resourceId)! };
  }

  /**
   * Permanently deletes a resource — the resource-scoped counterpart to
   * runDelete, one aggregate over. Reachable only from the archived-
   * resource hover action (ResourceOperations.deleteResource()'s own doc
   * comment); this dispatch itself has no archived-status check, mirroring
   * how runDelete has none either — the restriction is UI-only, the same
   * precedent PageOperations.delete()/the Note topbar's Delete-only-when-
   * archived menu gating already establish (this class never re-derives a
   * UI-only rule).
   *
   * Also removes any `.clutter/resource-archive.json` provenance record
   * for this resource (a no-op if none exists, e.g. deleting a resource
   * that was never archived) — a deleted resource must leave no stale
   * provenance a future Restore could act on.
   */
  private async runDeleteResource(resourceId: string): Promise<PersistenceResult> {
    const resource = this.vault.getResource(resourceId);

    if (!resource) {
      return {
        status: 'abandoned',
        reason: `Resource no longer exists in the vault: ${resourceId}`,
      };
    }

    await this.fileSystem.deleteFile(resource.path);
    await this.resourceArchiveStore.remove(resource.path);
    this.vault.removeResource(resourceId);

    return { status: 'resource-deleted' };
  }

  /**
   * Moves a VaultResource into an arbitrary destination folder — the
   * resource-scoped counterpart to runMove, one aggregate over. Like
   * runRenameResource, this is a bare filesystem move plus a Vault path
   * update: no frontmatter, no write-parse-rebuild-replace pipeline.
   *
   * Unlike runMove, there is no archived-status guard here: an archived
   * resource is never reachable through this kind in the first place (the
   * only Move UI entry point — the sidebar/Assets row menu — is mutually
   * exclusive with the archived-row hover actions, per Resource.tsx's own
   * `archiveActions` priority), so there is nothing to defend against, the
   * same reasoning runDeleteResource/runRenameResource already apply to
   * their own UI-only restrictions.
   */
  private async runMoveResource(
    resourceId: string,
    destinationFolderId: string | null
  ): Promise<PersistenceResult> {
    const resource = this.vault.getResource(resourceId);

    if (!resource) {
      return {
        status: 'abandoned',
        reason: `Resource no longer exists in the vault: ${resourceId}`,
      };
    }

    const destination = this.moveService.resolveResourceMoveDestination(
      resource,
      destinationFolderId
    );

    if (destination.path !== resource.path) {
      this.assertResourceDestinationAvailable(destination.path, resource.id);
      await this.fileSystem.moveFile(resource.path, destination.path);
    }

    try {
      this.vault.updateResourcePath(resourceId, destination.path, destination.parentId);
    } catch (error) {
      return {
        status: 'abandoned',
        reason: `Vault rejected the moved resource after a successful move: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return { status: 'resource-moved', resource: this.vault.getResource(resourceId)! };
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
