import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { Vault } from '../../vault/models/Vault';
import type { Page, PageType } from '../../vault/models/Page';
import type { PageMetadata } from '../../vault/models/PageMetadata';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { VaultPath } from '../../vault/ingest/VaultPath';
import { resolvePageMetadata } from '../../vault/ingest/resolvePageMetadata';
import type { PageFrontmatter } from '../../vault/ingest/frontmatter/PageFrontmatter';
import type { FolderOperations } from '../folder/FolderOperations';
import type { DailyNoteService } from '../daily-notes/DailyNoteService';

export interface CreatePageOptions {
  readonly folderId: string | null;
  readonly title?: string;
}

/**
 * The subset of PageMetadata a caller may set through updateMetadata().
 * Deliberately excludes status/archivedAt/originalPath/originalParentId
 * (owned solely by archive()/restore()), createdAt (owned solely by page
 * creation), and updatedAt (derived by the rebuild pipeline on every
 * write) — those fields already have a single owner elsewhere, and
 * updateMetadata() must not become a second way to reach them.
 */
export type EditablePageMetadata = Pick<
  PageMetadata,
  'description' | 'icon' | 'cover' | 'favorite'
>;

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
    private readonly pageCreator: PageCreator,
    private readonly folderOperations: FolderOperations,
    private readonly dailyNoteService: DailyNoteService
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

  /**
   * Updates a still-unpersisted draft's title — pure in-memory replacement
   * of the DraftDescriptor entry, no Vault call, no Gate call, no disk
   * write on its own (ADR-017's "no durable knowledge before first save"
   * principle). persistDraft() already reads descriptor.title at persist
   * time; this ensures a typed title reaches it instead of falling back to
   * 'Untitled'.
   *
   * A non-empty, changed title is a committed, persistent, user-owned
   * change — the same category promoting the draft via a body save already
   * is — so it promotes here too, through the exact same persistDraft()
   * helper, for every draft type except Daily Notes (descriptor
   * .deterministicPath set): a Daily Note's title is derived from its date
   * and never consumed by persistDraft's deterministic-path branch, so
   * committing it carries no user intent to make today's note real — only
   * its own body/metadata commits do, unchanged from before this milestone.
   *
   * "Committed change" is verified here, not assumed from the caller: the
   * comparison is against descriptor.title itself (mirrors EditableText's
   * own change check), so a caller that isn't the current UI — a future
   * plugin, an accidental duplicate call — cannot trigger a spurious
   * promotion by calling this with a value that isn't actually new.
   *
   * Only valid for a genuine draft: this.drafts.has(pageId) is both
   * necessary and sufficient to check that, since persistDraft() deletes
   * the descriptor at the exact moment a draft is promoted (no window
   * where both a descriptor and a Vault page exist for the same id).
   *
   * Drafts have no Vault entry (ADR-017), so Workspace — the only object
   * already tracking which id is the current workspace target — is the
   * sole available signal that the active draft's presentation-relevant
   * state changed (ADR-006's amendment), for the case where this call
   * doesn't promote (Daily Notes). Once promotion happens, Vault's own
   * notify (fired by persistDraft's Gate 'create') is what UI already
   * observes — this call still refreshes Workspace either way, which is
   * redundant but harmless in the promoting case, not a second mechanism.
   */
  public async updateDraftTitle(pageId: string, title: string): Promise<void> {
    const descriptor = this.drafts.get(pageId);

    if (!descriptor) {
      throw new Error(`No draft descriptor for page: ${pageId}`);
    }

    if (title === (descriptor.title ?? '')) {
      return;
    }

    this.drafts.set(pageId, { ...descriptor, title });
    this.workspace.refresh();

    if (descriptor.deterministicPath) {
      return;
    }

    const body = this.documentRegistry.get(pageId)?.currentRevision.markdown ?? '';

    await this.persistDraft(pageId, body);
  }

  public close(pageId: string): void {
    this.workspace.closePage(pageId);
    this.documentRegistry.close(pageId);
    // No armed timer may survive a closed session (autosave-execution-model.md
    // §5) — cancelled explicitly here rather than relied upon to merely
    // resolve as a harmless no-op if it fires, since a cancelled timer
    // structurally cannot fire at all.
    this.saveCoordinator.cancelTimers(pageId);
    this.drafts.delete(pageId);
  }

  public getSession(pageId: string): DocumentSession | undefined {
    return this.documentRegistry.get(pageId);
  }

  /**
   * Commits a new revision into the page's open session without persisting
   * it — the Committed-stage half of autosave (durability-model.md, Stage
   * 1), decoupled from the Durable-stage write save() performs
   * (autosave-execution-model.md §3.1). No Gate call, no draft-promotion
   * check, no DocumentState transition beyond what DocumentSession.commit()
   * itself already does (a no-op commit leaves state untouched; a real one
   * stays in whatever state it was already in — Clean or Saving).
   *
   * A silent no-op if the page has no open session: mirrors §4.1's
   * treatment of a save request for a session that no longer exists —
   * nothing to commit into, nothing to do.
   *
   * A real (non-no-op) commit arms/resets this session's autosave timers
   * (autosave-execution-model.md §5) — checked via DocumentSession.commit()'s
   * own return value (a no-op returns the same revision reference it was
   * already holding), so an identical-content commit never wastes a timer
   * reset on nothing actually having changed.
   */
  public commitEdit(pageId: string, markdown: string): void {
    const session = this.documentRegistry.get(pageId);

    if (!session) {
      return;
    }

    const revisionBefore = session.currentRevision;
    const revisionAfter = session.commit(new DocumentTransaction(markdown));

    if (revisionAfter === revisionBefore) {
      return;
    }

    this.saveCoordinator.scheduleSave(session, () => {
      void this.requestSave(pageId);
    });
  }

  /**
   * The single entry point every background save trigger (debounce, blur,
   * navigation-away, shutdown-flush) calls — never save() directly, and
   * never SaveCoordinator directly (autosave-execution-model.md §3).
   *
   * Carries no payload: a save request is a signal ("make this session
   * durable if it isn't already"), not content — the content to persist is
   * always read fresh from the session's own currentRevision at the moment
   * it's actually needed, never captured by the caller.
   *
   * Drives the session to a stable Durable state, not just one attempt:
   * if new content commits while this call's own save is still in flight,
   * that content is picked up and saved too, within this same call, before
   * it resolves — so a caller awaiting requestSave() (e.g. a future
   * shutdown flush) can rely on its resolution meaning "durable," not
   * "attempted once." See autosave-execution-model.md §2 (T9/T10) and §4.1.
   *
   * Never throws: every failure this method's own save() call can produce —
   * synchronous (archived page, missing session) or asynchronous (a Gate
   * failure) — is caught here and converted into the session's SaveError
   * state via SaveCoordinator.failSave(), so a background trigger that
   * doesn't await this call's result can never produce an unhandled
   * rejection (autosave-execution-model.md §1.3a, §6).
   */
  public async requestSave(pageId: string): Promise<void> {
    const session = this.documentRegistry.get(pageId);

    if (!session) {
      return;
    }

    for (;;) {
      const decision = this.saveCoordinator.evaluate(session);

      if (decision === 'suppress') {
        return;
      }

      try {
        await this.save(pageId, session.currentRevision.markdown);
      } catch {
        // Two distinct failure shapes reach here (§1.3a's T11a vs T11b),
        // and only one of them still needs handling at this point:
        //
        // T11b (async Gate failure): save() already routed this through
        // saveCoordinator.failSave() and transitioned the session to
        // SaveError *before* re-throwing — nothing further to do here.
        // Calling rejectSaveRequest() again would still leave the state
        // correct (SaveError), but would fire a second, redundant
        // notify() for a state that hasn't actually changed again.
        //
        // T11a (synchronous validation failure — archived page, missing
        // session): save() threw *before* beginSave() ever ran, so the
        // session's state is untouched — still whatever it was before
        // this call (never SaveError from this attempt). Checking state
        // here is what distinguishes the two: only T11a leaves it as
        // anything other than SaveError, and only T11a is what
        // rejectSaveRequest() needs to handle.
        if (session.state !== DocumentState.SaveError) {
          this.saveCoordinator.rejectSaveRequest(session);
        }
        return;
      }
    }
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

  /**
   * Updates user-editable metadata (description, icon, cover, favorite) for
   * a page — persisted or still a draft.
   *
   * Persisted branch (unchanged from before this milestone): deliberately
   * does not touch DocumentSession or SaveCoordinator — a metadata edit is
   * not a document-revision event, so it persists the Vault's current
   * durable body (page.source.markdown) alongside the patch, leaving any
   * dirty editor buffer untouched. Reuses the Gate's 'save' kind (see
   * PagePersistenceCoordinator) rather than a dedicated operation kind,
   * since the write-parse-rebuild-replace pipeline it needs is exactly the
   * one 'save' already runs. Same archived-page guard as save(): metadata
   * is part of a page's editable surface, not a structural property like
   * status/path, so an archived page stays fully view-only until restored.
   *
   * Draft branch: a patch is a committed, persistent, user-owned change —
   * the same category as a title or body commit — only for the keys whose
   * value actually differs from what a blank page would already have.
   * "Blank page" is resolvePageMetadata({}) — the exact defaulting
   * PageBuilder itself uses for missing frontmatter, not a
   * separately-maintained table, so this check never needs revisiting when
   * a new EditablePageMetadata field is added (Description milestone,
   * draft-promotion generalization). A patch matching every field's
   * default (e.g. { favorite: false } on a draft that was never favorited)
   * is not a committed change: no promotion, no error, a true no-op — the
   * check is enforced here, not assumed from the caller, so a future
   * caller that isn't today's UI cannot trigger a spurious promotion.
   *
   * Daily Notes (descriptor.deterministicPath set) do not participate —
   * same exclusion as updateDraftTitle, and for the same reason: nothing
   * about interacting with a Daily Note's not-yet-meaningful pre-promotion
   * state should make today's note real. Metadata has no in-memory home on
   * a draft the way title does (DraftDescriptor carries no metadata
   * field — no entry point sets any before promotion), so a Daily Note
   * draft is treated the same as any id with nowhere to persist metadata.
   */
  public async updateMetadata(
    pageId: string,
    patch: Partial<EditablePageMetadata>
  ): Promise<void> {
    const page = this.vault.getPage(pageId);

    if (page) {
      if (page.metadata.status === 'archived') {
        throw new Error(
          `Cannot edit archived page: ${pageId}. Restore it before editing.`
        );
      }

      const result = await this.coordinator.enqueue(pageId, {
        kind: 'save',
        content: page.source.markdown,
        metadata: patch,
      });

      if (result.status === 'abandoned') {
        throw new Error(`Page not found: ${pageId}`);
      }

      return;
    }

    const descriptor = this.drafts.get(pageId);

    if (!descriptor || descriptor.deterministicPath) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const defaults = resolvePageMetadata({});
    const keys = Object.keys(patch) as (keyof EditablePageMetadata)[];
    const isCommittedChange = keys.some((key) => patch[key] !== defaults[key]);

    if (!isCommittedChange) {
      return;
    }

    const body = this.documentRegistry.get(pageId)?.currentRevision.markdown ?? '';

    await this.persistDraft(pageId, body, patch);
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
   * Shared by create(), save()'s first-save branch, updateDraftTitle()'s
   * promotion branch, and updateMetadata()'s draft branch: resolves the
   * destination path (deterministic, if the descriptor was opened via
   * openAtPath — Daily Notes; collision-free via PagePathResolver,
   * otherwise), builds the document for the id the draft already has, and
   * enqueues the one Gate `create` call every caller uses. The only write
   * path from "this page doesn't exist in the Vault yet" to disk —
   * whichever kind of committed change triggered promotion (title, body,
   * or metadata), it converges here, never a second creation path.
   *
   * metadataPatch carries an editable-metadata patch when the first
   * persistent change was a metadata edit rather than a title/body one —
   * translated from EditablePageMetadata's string|null shape to
   * PageFrontmatter's string|undefined shape (null means "no value", which
   * frontmatter expresses by omitting the key, not by writing it) before
   * reaching PageCreator, which stays typed purely in terms of
   * PageFrontmatter.
   *
   * For a Daily Note, the parentId used here is re-resolved via
   * DailyNoteService.ensureFolderChain rather than trusting
   * descriptor.folderId (captured at draft-open time by openAtPath's own
   * best-effort folder lookup, which silently falls back to null whenever
   * the month folder hasn't been scanned or created yet — no directory is
   * scaffolded ahead of time, per ADR-019). Materializing the folder chain
   * only happens here, at the moment of an actual save — never at
   * open/navigation time, per ADR-017's governing principle.
   */
  private async persistDraft(
    id: string,
    body: string,
    metadataPatch?: Partial<EditablePageMetadata>
  ): Promise<Page> {
    const descriptor = this.drafts.get(id);

    if (!descriptor) {
      throw new Error(`No draft descriptor for page: ${id}`);
    }

    const destination = descriptor.deterministicPath
      ? {
          path: descriptor.deterministicPath,
          parentId:
            descriptor.type === 'daily-note'
              ? await this.dailyNoteService.ensureFolderChain(
                  this.vault,
                  this.folderOperations,
                  descriptor.deterministicPath
                )
              : descriptor.folderId,
        }
      : this.pathResolver.createNotePath(
          descriptor.folderId,
          descriptor.title ?? 'Untitled'
        );

    const content = this.pageCreator.buildContent(
      id,
      descriptor.type,
      body,
      metadataPatch ? this.toFrontmatterMetadataPatch(metadataPatch) : undefined
    );

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

  /**
   * EditablePageMetadata's string|null fields mean "explicitly no value";
   * PageFrontmatter's string|undefined fields mean the same thing by
   * omitting the key (FrontmatterSerializer only skips undefined values —
   * writing a literal null would end up as the text "null" in the file).
   * Only keys actually present in the patch are translated, so a caller
   * that didn't mention a field never clears it.
   */
  private toFrontmatterMetadataPatch(
    patch: Partial<EditablePageMetadata>
  ): Partial<Pick<PageFrontmatter, 'description' | 'icon' | 'cover' | 'favorite'>> {
    const result: Partial<
      Pick<PageFrontmatter, 'description' | 'icon' | 'cover' | 'favorite'>
    > = {};

    if ('description' in patch) {
      result.description = patch.description ?? undefined;
    }
    if ('icon' in patch) {
      result.icon = patch.icon ?? undefined;
    }
    if ('cover' in patch) {
      result.cover = patch.cover ?? undefined;
    }
    if ('favorite' in patch) {
      result.favorite = patch.favorite;
    }

    return result;
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
    // Same reasoning as close() — a deleted page's session must not leave
    // a timer behind that could still fire against it.
    this.saveCoordinator.cancelTimers(pageId);
    this.drafts.delete(pageId);

    await this.coordinator.enqueue(pageId, { kind: 'delete' });

    this.workspace.closePage(pageId);
  }
}
