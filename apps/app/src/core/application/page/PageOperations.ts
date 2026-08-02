import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { Vault } from '../../vault/models/Vault';
import type { Page, PageType } from '../../vault/models/Page';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { VaultPath } from '../../vault/ingest/VaultPath';

export interface CreatePageOptions {
  readonly folderId: string | null;
  readonly title?: string;
}

/** The public shape UI reads for a draft it can't find in the Vault yet — see PageOperations.getDraft(). */
export interface DraftInfo {
  readonly folderId: string | null;
  readonly type: PageType;
  readonly title?: string;
}

/**
 * The minimal, non-Vault descriptor a draft (ADR-017) needs before it has a
 * real Page: enough for PageOperations to persist it correctly on first
 * save, and enough for the UI to render a title/type/folder for it while
 * unpersisted. Owned here, not by DocumentEditing (ADR-018) and not shared
 * as a type with it — DocumentSession knows only an id and markdown.
 *
 * deterministicPath is set only for entry points with a known target path
 * before any content exists (Daily Notes) — see openAtPath. Regular Notes
 * leave it unset; their path is resolved at persist time via
 * PagePathResolver, same as eager create() already does.
 */
interface DraftDescriptor {
  readonly folderId: string | null;
  readonly type: PageType;
  readonly title?: string;
  readonly deterministicPath?: string;
}

/**
 * Owns the entire lifecycle of a page as a single capability surface —
 * open, close, save, archive, restore, create, delete, move, and now the
 * earliest phase of that lifecycle: an unpersisted draft (ADR-017).
 *
 * Does not have rename(): no backing Persistence Gate operation kind
 * exists yet, and building one without a real caller would be exactly the
 * placeholder machinery this migration exists to avoid (see ADR-012).
 */
export class PageOperations {
  /** Draft descriptors, keyed by the id they were opened with (ADR-017 Decision item 2). */
  private readonly drafts = new Map<string, DraftDescriptor>();

  /**
   * Reverse lookup for deterministic-path entry points (Daily Notes): lets
   * a second "open Today" within the same session resolve to the same
   * already-open draft instead of minting a second one (ADR-017 §7).
   */
  private readonly draftIdByDeterministicPath = new Map<string, string>();

  constructor(
    private readonly vault: Vault,
    private readonly workspace: Workspace,
    private readonly documentRegistry: DocumentRegistry,
    private readonly saveCoordinator: SaveCoordinator,
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly pathResolver: PagePathResolver,
    private readonly pageCreator: PageCreator
  ) {}

  public async open(pageId: string): Promise<void> {
    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    this.documentRegistry.open(page.id, page.source.markdown);
    this.workspace.openPage(pageId);
  }

  /**
   * Read-only access to a draft's descriptor, for UI rendering when
   * `vault.getPage(pageId)` misses (ADR-017 §6/Decision item 8) — title,
   * type, and folder for something DocumentEditing (ADR-018) doesn't
   * know about, since it holds only an id and markdown. Undefined for
   * any id that's either a real page or not open at all.
   */
  public getDraft(pageId: string): DraftInfo | undefined {
    return this.drafts.get(pageId);
  }

  /**
   * Opens an unpersisted draft: a DocumentSession with no backing Vault
   * page, no Gate call, no Vault call (ADR-017 Governing Principle —
   * navigation never creates durable knowledge). The id is real and
   * stable from this point on; first save() persists it under this exact
   * id via the same Gate path create() uses (see persistDraft).
   */
  public async openDraft(
    options: CreatePageOptions & { readonly type?: PageType }
  ): Promise<string> {
    const id = this.pageCreator.generateId();
    const type = options.type ?? 'note';

    this.drafts.set(id, { folderId: options.folderId, type, title: options.title });
    this.documentRegistry.open(id, '');
    this.workspace.openPage(id);

    return id;
  }

  /**
   * Resolve-or-draft for an entry point with a known target path before
   * any content exists (Daily Notes' "Today", a future Calendar date).
   * Never calls the Gate itself — either opens the real page, reopens an
   * already-open draft for this exact path, or opens a fresh one.
   *
   * Resolves the parent folder from `path` itself (same lookup
   * DailyNoteService.ensurePage() used to do inline before ADR-017
   * retired it) rather than requiring every caller to duplicate that
   * lookup — both current callers (Application.open() at boot, and the
   * "Start your day..." shortcut) need the exact same resolution.
   */
  public async openAtPath(
    path: string,
    options: { readonly type: PageType; readonly title?: string }
  ): Promise<string> {
    const existing = this.vault.getPageByPath(path);

    if (existing) {
      await this.open(existing.id);
      return existing.id;
    }

    const existingDraftId = this.draftIdByDeterministicPath.get(path);

    if (existingDraftId && this.documentRegistry.get(existingDraftId)) {
      this.workspace.openPage(existingDraftId);
      return existingDraftId;
    }

    const directory = VaultPath.parentDirectory(path);
    const parentFolder = this.vault.getFolderByPath(directory);
    const id = this.pageCreator.generateId();

    this.drafts.set(id, {
      folderId: parentFolder ? parentFolder.id : null,
      type: options.type,
      // Defaults to the same name PageBuilder.getPageName() would derive
      // once this is actually persisted (filename minus .md), so the
      // title shown while drafting doesn't visibly change the moment it
      // saves. Computed here, once, rather than requiring every caller
      // (boot, "Start your day...") to duplicate PageBuilder's naming rule.
      title: options.title ?? this.deriveNameFromPath(path),
      deterministicPath: path,
    });
    this.documentRegistry.open(id, '');
    this.workspace.openPage(id);
    this.draftIdByDeterministicPath.set(path, id);

    return id;
  }

  /** Mirrors PageBuilder.getPageName() — filename minus a trailing .md. */
  private deriveNameFromPath(path: string): string {
    const fileName = VaultPath.filename(path);

    return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
  }

  public close(pageId: string): void {
    this.workspace.closePage(pageId);
    this.documentRegistry.close(pageId);
    this.drafts.delete(pageId);
  }

  public getSession(pageId: string): DocumentSession | undefined {
    return this.documentRegistry.get(pageId);
  }

  /**
   * Archived pages are view-only: editing one is rejected until it is
   * restored. This is the one business rule this method owns — it re-reads
   * the Vault rather than trusting the session's own snapshot, so a page
   * archived after its session was opened is caught on the very next edit.
   * Only applies once a page is real; a draft is never archived.
   *
   * If pageId has no Vault page yet, this is the draft's first save
   * (ADR-017 §4 — shouldPromoteDraft, "!vault.getPage(id)"): it persists
   * through the same Gate `create` path create() uses (persistDraft),
   * instead of the ordinary `save` kind. This is only ever a guess made
   * here for which Gate call to make — correctness against a second,
   * racing save on the same still-unpersisted draft is the Gate's own
   * dequeue-time guard (PagePersistenceCoordinator.runCreate), not this
   * check (ADR-017 §4 concurrency correction).
   */
  public async save(pageId: string, markdown: string): Promise<void> {
    const session = this.documentRegistry.get(pageId);

    if (!session) {
      throw new Error(`No open document session for page: ${pageId}`);
    }

    const page = this.vault.getPage(pageId);
    const isDraft = !page && this.drafts.has(pageId);

    // !page alone doesn't mean "draft" — a page opened normally can be
    // removed out from under its still-open session (e.g. by Sync). Only
    // an id this class itself registered via openDraft()/openAtPath()/
    // create() is a genuine draft; anything else missing from the Vault
    // is the pre-existing "vanished" error, unchanged.
    if (!page && !isDraft) {
      throw new Error(`Page not found: ${pageId}`);
    }

    if (page && page.metadata.status === 'archived') {
      throw new Error(
        `Cannot edit archived page: ${pageId}. Restore it before editing.`
      );
    }

    session.commit(new DocumentTransaction(markdown));
    this.saveCoordinator.beginSave(session);

    const revision = session.currentRevision;

    try {
      if (page) {
        const result = await this.coordinator.enqueue(pageId, {
          kind: 'save',
          content: revision.markdown,
        });

        if (result.status === 'abandoned') {
          this.saveCoordinator.failSave(session, revision);
          return;
        }
      } else {
        await this.persistDraft(pageId, revision.markdown);
      }

      this.saveCoordinator.completeSave(session, revision);
    } catch (error) {
      this.saveCoordinator.failSave(session, revision);
      throw error;
    }
  }

  public async archive(pageId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, { kind: 'archive' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  public async restore(pageId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, { kind: 'restore' });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  /**
   * Eager, immediate-persist entry point for non-interactive/programmatic
   * callers (ADR-017 §6) — unlike openDraft(), this always reaches the
   * Gate before returning. Shares persistDraft's path-resolution and Gate
   * call with the draft-promotion path in save() (Rule 4/Rule 12): both
   * register a descriptor and call the same helper, never two independent
   * "resolve path, enqueue create" implementations.
   */
  public async create(options: CreatePageOptions): Promise<string> {
    const id = this.pageCreator.generateId();

    this.drafts.set(id, { folderId: options.folderId, type: 'note', title: options.title });

    await this.persistDraft(id, '');
    this.workspace.openPage(id);

    return id;
  }

  /**
   * Shared by create() and save()'s first-save branch: resolves the
   * destination path (deterministic, if the descriptor was opened via
   * openAtPath — Daily Notes; collision-free via PagePathResolver,
   * otherwise), builds the document for the id the draft already has, and
   * enqueues the one Gate `create` call either caller uses. The only
   * write path from "this page doesn't exist in the Vault yet" to disk.
   */
  private async persistDraft(id: string, body: string): Promise<Page> {
    const descriptor = this.drafts.get(id);

    if (!descriptor) {
      throw new Error(`No draft descriptor for page: ${id}`);
    }

    const destination = descriptor.deterministicPath
      ? { path: descriptor.deterministicPath, parentId: descriptor.folderId }
      : this.pathResolver.createNotePath(
          descriptor.folderId,
          descriptor.title ?? 'Untitled'
        );

    const content = this.pageCreator.buildContent(id, descriptor.type, body);

    const result = await this.coordinator.enqueue(id, {
      kind: 'create',
      path: destination.path,
      parentId: destination.parentId,
      content,
    });

    if (result.status !== 'saved') {
      throw new Error(
        `Failed to persist draft at ${destination.path}: ${
          result.status === 'abandoned' ? result.reason : result.status
        }`
      );
    }

    this.drafts.delete(id);

    if (descriptor.deterministicPath) {
      this.draftIdByDeterministicPath.delete(descriptor.deterministicPath);
    }

    return result.page;
  }

  public async move(pageId: string, destinationFolderId: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, {
      kind: 'move',
      destinationFolderId,
    });

    if (result.status === 'abandoned') {
      throw new Error(`Page not found: ${pageId}`);
    }
  }

  /**
   * Closes any open session before enqueueing the disk delete, so no save
   * can complete against a page mid-deletion. No existence check (ADR-017
   * §5/§7): a delete for a draft that was never persisted enqueues the
   * same `delete` kind as any other page and relies on the Gate's own,
   * already dequeue-time-correct "nothing to delete" guard — deciding
   * synchronously here whether to skip the Gate could race an in-flight,
   * not-yet-executed create for the same id and resurrect a "deleted"
   * draft once that create ran.
   */
  public async delete(pageId: string): Promise<void> {
    this.documentRegistry.close(pageId);
    this.drafts.delete(pageId);

    await this.coordinator.enqueue(pageId, { kind: 'delete' });

    this.workspace.closePage(pageId);
  }
}
