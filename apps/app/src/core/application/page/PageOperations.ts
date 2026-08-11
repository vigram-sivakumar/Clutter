import type { DocumentSession } from '../../engine/DocumentSession';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { FieldEditState } from '../../engine/FieldEditState';
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
import { DailyNotePath } from '../daily-notes/DailyNotePath';
import type { VaultEntryDuplicator } from '../../vault/persistence/VaultEntryDuplicator';

/**
 * How long PageOperations.flushAll() (the shutdown flush) waits for
 * pending saves before giving up and letting the application close
 * anyway. A placeholder value, not a tuned one — same status as
 * SaveCoordinator's AUTOSAVE_DEBOUNCE_MS/AUTOSAVE_CEILING_MS
 * (autosave-strategy-analysis.md §7 Risk 2 explicitly defers exact
 * tuning as a product decision, separate from this architecture).
 */
export const SHUTDOWN_FLUSH_TIMEOUT_MS = 5000;

/**
 * The title channel's own debounce/ceiling — deliberately longer than the
 * body's (SaveCoordinator.AUTOSAVE_DEBOUNCE_MS/AUTOSAVE_CEILING_MS), since
 * persisting a title change is a real filesystem rename (visible to git,
 * external tools, and other pages' by-name link resolution), not an
 * in-place content rewrite — materially more expensive per write, so the
 * title channel should coalesce more aggressively than the body does.
 * Placeholder values, not tuned ones, same status as the body's constants.
 */
export const TITLE_AUTOSAVE_DEBOUNCE_MS = 4000;
export const TITLE_AUTOSAVE_CEILING_MS = 60000;

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
 * open, close, save, archive, restore, create, delete, move, rename, and
 * the earliest phase of that lifecycle: an unpersisted draft (ADR-017).
 *
 * rename() completes the capability spec §6 always listed but left
 * unimplemented pending a real caller (ADR-012's disposition) — Notes'
 * inline title-edit affordance is that caller, mirroring
 * FolderOperations.rename()'s shape exactly (same-parent path change via
 * the Gate's 'rename' kind). Only for a real, persisted page — a still-open
 * draft's title is updateDraftTitle()'s job, unchanged.
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

  /**
   * Tracks the currently in-flight requestSave() promise per page id, so a
   * concurrent call for the same id joins the real, already-running
   * attempt instead of independently evaluating and immediately
   * suppressing (found during M8's pre-implementation audit — without
   * this, PageOperations.flushAll() could believe a page was flushed
   * while a save started by an earlier, unawaited trigger — e.g. a
   * debounce timer — was still genuinely in progress). Populated and
   * cleared entirely within requestSave() itself; nothing else reads or
   * writes this map.
   */
  private readonly inFlightSaves = new Map<string, Promise<void>>();

  /**
   * Per-persisted-page title edit/save state — the title channel's
   * counterpart to DocumentRegistry's per-page DocumentSession, but never
   * shared with DocumentEditing (ADR-018 — title is domain identity, not
   * something the engine owns). Lazily created on a persisted page's first
   * commitTitle() call; a page with no title-editing activity has no
   * entry here at all. Never populated for a draft — a draft's title is
   * updateDraftTitle()'s job, unchanged (no commit/persist split needed
   * before the draft is promoted).
   */
  private readonly titleStates = new Map<string, FieldEditState<string>>();

  constructor(
    private readonly vault: Vault,
    private readonly workspace: Workspace,
    private readonly documentRegistry: DocumentRegistry,
    private readonly saveCoordinator: SaveCoordinator,
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly pathResolver: PagePathResolver,
    private readonly pageCreator: PageCreator,
    private readonly folderOperations: FolderOperations,
    private readonly dailyNoteService: DailyNoteService,
    /**
     * Composition-Root-injected hook, same shape as FolderOperations'
     * prepareNavigation — lets delete() ask "open whatever the app
     * considers its fallback page" without this class knowing what that
     * is (today: Application.openFallbackPage() resolves-or-drafts
     * today's Daily Note). Keeps the fallback-page decision an
     * application-policy concern (Composition Root, per ADR-019's own
     * framing of that decision) rather than duplicating it here.
     */
    private readonly openFallbackPage: () => void,
    /**
     * Backs duplicate() only (ADR-028). Holds the raw, non-self-write-
     * suppressed VaultFileSystem — every other collaborator here writes
     * through `coordinator` (the Persistence Gate) instead. Injected
     * rather than constructed here so PageOperations still never calls
     * VaultFileSystem directly, matching every other collaborator that
     * holds a filesystem reference on this class's behalf. Optional so
     * the many existing unit-test call sites that never exercise
     * duplicate() don't need an unrelated update just to keep
     * constructing this class — Application always supplies a real one
     * (see attachVault()); duplicate() itself throws if it's missing.
     */
    private readonly duplicator?: VaultEntryDuplicator
  ) {}

  /**
   * NAVIGATION SUPPORT ONLY — not a general-purpose persistence API.
   *
   * This exists to answer exactly one question: "the active page is about
   * to change (or be cleared) — does whatever was active need flushing
   * first?" It is the shared implementation behind every navigation entry
   * point's outgoing-page save request (autosave-execution-model.md §2,
   * T5) — this facade's own open()/openDraft()/openAtPath()/create(), and
   * (indirectly, via the page-agnostic prepareNavigation hook —
   * FolderOperations.ts) FolderOperations.open(). It is public only
   * because the Composition Root's wiring closure for that hook needs to
   * reach it from outside this class, not because it's meant to be a
   * second, more convenient way to trigger a save from arbitrary code.
   *
   * Do NOT call this to "make sure a page is saved" outside of a
   * navigation transition — for that, call requestSave(pageId) directly
   * (autosave-execution-model.md §3), which operates on an explicit id
   * regardless of what Workspace currently considers active. This method
   * exists specifically because navigation code doesn't have (and
   * shouldn't need) that id in hand — it reads workspace.activePageId
   * itself, at the moment it's called, which is only a meaningful
   * question to ask immediately before that value is about to change.
   * Calling it from unrelated code would silently couple that code to
   * "whatever happens to be the active page right now," which is almost
   * never what an unrelated caller actually wants.
   *
   * Every call site in this file calls this *after* its own validation/
   * existence checks and *before* the corresponding workspace.openPage()
   * — never the reverse — so a navigation attempt that's about to fail
   * never triggers a flush for a switch that isn't actually happening.
   * Fire-and-forget by design (autosave-strategy-analysis.md §1 —
   * navigation must not block on the outgoing save's completion);
   * requestSave() itself never throws (autosave-execution-model.md
   * §1.3a), so there is nothing to catch here.
   */
  public flushActivePage(): void {
    const activePageId = this.workspace.activePageId;

    if (activePageId) {
      const bodySave = this.requestSave(activePageId);
      // Navigation-away is a "nothing dirty may survive this moment"
      // boundary for the whole page, not just its body — an uncommitted,
      // still-debouncing title rename must not be silently dropped here
      // any more than an unsaved body edit is. A no-op if this page has no
      // title-editing activity (requestTitleSave()'s own guard).
      const titleSave = this.requestTitleSave(activePageId);

      // Once both channels have settled — after promotion would have
      // happened, if this flush's content was enough to trigger one — an
      // unpersisted draft that's still sitting unpromoted has nothing left
      // to keep it alive. Chained, not awaited: flushActivePage() itself
      // stays fire-and-forget (doc comment above), this is just what runs
      // once the forgotten fire resolves.
      void Promise.all([bodySave, titleSave]).then(() =>
        this.discardAbandonedDraft(activePageId)
      );
    }

    // This is the same pre-navigation flush boundary FolderOperations.open()
    // already calls this method for (via prepareNavigation) — extended to
    // cover the reverse direction: navigating into a page must flush an
    // outgoing folder's pending name edit the same way navigating between
    // folders already does. A no-op if no folder is active or it has no
    // name-editing activity (flushActiveFolder()'s own guards).
    this.folderOperations.flushActiveFolder();
  }

  /**
   * The other half of flushActivePage()'s navigation-away contract: a
   * draft that was never promoted (persistDraft() deletes it from
   * `drafts` the moment it is — ADR-017) has nothing left to keep it
   * alive once its owning flush has settled and the user has actually
   * moved on. Three guards, each necessary:
   *
   * - `activePageId !== pageId` — the user may have navigated straight
   *   back to this exact draft before this callback ran; still-active
   *   drafts are never discarded out from under the person looking at
   *   them.
   * - `drafts.has(pageId)` — promotion (a real save) already deleted the
   *   entry; nothing to discard, this is now a real page.
   * - not `SaveError` — a draft that had real content but whose save
   *   attempt genuinely failed still has that content sitting in its
   *   session, unpersisted; discarding it here would silently destroy
   *   unsaved work instead of surfacing the failure.
   * - `canAutoDiscardDraft(descriptor)` — today's Daily Note draft is a
   *   product-level exception (not an ordinary abandoned draft): it acts
   *   as a persistent scratchpad for the current day, so it must survive
   *   navigating away empty. See canAutoDiscardDraft/shouldRetainDraft.
   */
  private discardAbandonedDraft(pageId: string): void {
    if (this.workspace.activePageId === pageId) {
      return;
    }

    const descriptor = this.drafts.get(pageId);

    if (!descriptor) {
      return;
    }

    if (this.documentRegistry.get(pageId)?.state === DocumentState.SaveError) {
      return;
    }

    if (!this.canAutoDiscardDraft(descriptor)) {
      return;
    }

    this.close(pageId);
  }

  /**
   * The one place that decides whether a draft is fair game for *any*
   * automatic lifecycle transition — not just discardAbandonedDraft's
   * "close it," but findReusableDraftId's "silently repurpose it for a
   * different target" too. Both are the same underlying question (may the
   * system make this draft disappear without the user asking it to?), so
   * both consult this single predicate rather than each carrying their own
   * copy of the Today's-Daily-Note exception. A future automatic
   * transition should do the same — never re-derive "is this protected"
   * locally.
   *
   * Ordinary drafts (Notes, and any Daily Note draft other than today's)
   * are fair game — see the ADR-017 reasoning discardAbandonedDraft's own
   * doc comment already gives. Today's Daily Note is the sole named
   * exception: a product rule, not an implementation detail, kept here as
   * its own predicate (rather than inlined into each call site) so a
   * future draft type that earns persistence semantics has exactly one
   * place to extend, per this method's counterpart shouldRetainDraft.
   */
  private canAutoDiscardDraft(descriptor: DraftDescriptor): boolean {
    return !this.shouldRetainDraft(descriptor);
  }

  /**
   * True only for a draft targeting today's Daily Note path — the single
   * source of truth both canAutoDiscardDraft (discardAbandonedDraft's
   * guard) and findReusableDraftId (openDraft's/openAtPath's reuse guard)
   * consult. Compared against a freshly computed path (not cached) so the
   * exception tracks the actual calendar day rather than whatever day the
   * draft was opened on — a Daily Note draft opened just before midnight
   * and abandoned just after is "yesterday's" by the time this runs, and
   * yesterday's Daily Note is an ordinary draft (see canAutoDiscardDraft),
   * not today's.
   */
  private shouldRetainDraft(descriptor: DraftDescriptor): boolean {
    if (!descriptor.deterministicPath) {
      return false;
    }

    return descriptor.deterministicPath === this.todayDailyNotePath();
  }

  private todayDailyNotePath(): string {
    return DailyNotePath.absoluteFrom(this.vault.root, new Date());
  }

  /**
   * `options.recordHistory` (default true) passes straight through to
   * `workspace.openPage()` — ADR-027. The only caller that ever passes
   * `false` is `NavigationRouter.back()`/`.forward()`, replaying a
   * history entry through the normal open path (so session creation and
   * outgoing-page flush still happen exactly as they do for any other
   * open) without re-recording the replay as a new navigation.
   */
  public async open(
    pageId: string,
    options?: { readonly recordHistory?: boolean }
  ): Promise<void> {
    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    // Flush right before the navigation actually happens, not before the
    // existence check above — a failed open() (unknown id) never switches
    // the active page, so it shouldn't trigger a flush either.
    this.flushActivePage();
    this.documentRegistry.open(page.id, page.source.markdown);
    this.workspace.openPage(pageId, options);
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
   *
   * Reuses an existing empty draft of the same type instead of minting a
   * new one, so repeated "New Note" clicks converge on one sidebar
   * entry rather than accumulating empty ones (see findReusableDraftId).
   * A draft that already holds real content is never reused — the
   * caller gets a genuinely new draft alongside it, exactly as before
   * this behavior existed. On reuse, the descriptor is still overwritten
   * with this call's own options — the same "the request's own target
   * wins" rule openAtPath's retarget branch follows — so a caller that
   * does pass a folderId/title isn't silently ignored just because an
   * existing empty draft happened to be reusable.
   */
  public async openDraft(
    options: CreatePageOptions & { readonly type?: PageType }
  ): Promise<string> {
    const type = options.type ?? 'note';
    const reusableId = this.findReusableDraftId(type);

    if (reusableId) {
      this.drafts.set(reusableId, { folderId: options.folderId, type, title: options.title });
      this.flushActivePage();
      this.workspace.openPage(reusableId);
      return reusableId;
    }

    const id = this.pageCreator.generateId();

    this.drafts.set(id, { folderId: options.folderId, type, title: options.title });
    this.flushActivePage();
    this.documentRegistry.open(id, '');
    this.workspace.openPage(id);

    return id;
  }

  /**
   * Resolve-or-draft for an entry point with a known target path before
   * any content exists (Daily Notes' "Today", a future Calendar date).
   * Never calls the Gate itself — either opens the real page, reopens an
   * already-open draft for this exact path, retargets a reusable draft
   * (still empty, different path) onto this one, or opens a fresh one.
   *
   * Resolves the parent folder from `path` itself (same lookup
   * DailyNoteService.ensurePage() used to do inline before ADR-017
   * retired it) rather than requiring every caller to duplicate that
   * lookup — both current callers (Application.open() at boot, and the
   * calendar's date-select) need the exact same resolution.
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
      this.flushActivePage();
      this.workspace.openPage(existingDraftId);
      return existingDraftId;
    }

    const target = this.resolveDraftTarget(path, options);
    const reusableId = this.findReusableDraftId(options.type);

    if (reusableId) {
      // Retarget in place — same session, same id, only the descriptor
      // (and the reverse path lookup) changes. DocumentSession/
      // DocumentRegistry carry no path/date identity to update (ADR-018),
      // and EffectivePageState re-derives from the descriptor on every
      // call (ADR-020 §7), so nothing else needs to be told. This is the
      // same in-place descriptor mutation updateDraftTitle() already
      // performs for one field, generalized to all of them.
      const staleDescriptor = this.drafts.get(reusableId);

      if (staleDescriptor?.deterministicPath) {
        this.draftIdByDeterministicPath.delete(staleDescriptor.deterministicPath);
      }

      this.drafts.set(reusableId, target);
      this.draftIdByDeterministicPath.set(path, reusableId);
      this.flushActivePage();
      this.workspace.openPage(reusableId);

      return reusableId;
    }

    const id = this.pageCreator.generateId();

    this.drafts.set(id, target);
    this.flushActivePage();
    this.documentRegistry.open(id, '');
    this.workspace.openPage(id);
    this.draftIdByDeterministicPath.set(path, id);

    return id;
  }

  /**
   * The folderId/title/deterministicPath a draft targeting `path` should
   * carry — shared by openAtPath's fresh-mint and retarget branches so
   * neither reimplements the parent-folder lookup or title-defaulting
   * rule (Rule 4).
   */
  private resolveDraftTarget(
    path: string,
    options: { readonly type: PageType; readonly title?: string }
  ): DraftDescriptor {
    const directory = VaultPath.parentDirectory(path);
    const parentFolder = this.vault.getFolderByPath(directory);

    return {
      folderId: parentFolder ? parentFolder.id : null,
      type: options.type,
      // Defaults to the same name PageBuilder.getPageName() would derive
      // once this is actually persisted (filename minus .md), so the
      // title shown while drafting doesn't visibly change the moment it
      // saves. Computed here, once, rather than requiring every caller
      // (boot, the calendar's date-select) to duplicate PageBuilder's
      // naming rule.
      title: options.title ?? this.deriveNameFromPath(path),
      deterministicPath: path,
    };
  }

  /**
   * A draft is reusable when it exists, has a live session, is still
   * empty, and isn't protected by the retention policy — the business-
   * intent question openDraft()/openAtPath() ask; callers don't need to
   * know *why* a draft qualifies, only whether one does. "Empty" is
   * body-only (see isEmptyDraft): anything still in `drafts` is, by
   * construction, guaranteed to have no committed title or metadata
   * already — updateDraftTitle()/updateMetadata() promote (and remove the
   * descriptor) the instant either commits, for every type except Daily
   * Notes, whose title is derived from its date and never user-committed
   * in the first place. So body content is the only thing left that can
   * make a still-open draft non-empty, for both Notes and Daily Notes
   * alike.
   *
   * The retention check (shouldRetainDraft) matters specifically for
   * Daily Notes: without it, an empty today's-note draft is otherwise
   * indistinguishable from any other empty daily-note draft, so opening a
   * *different* date here would silently repurpose today's draft in place
   * (openAtPath's retarget branch mutates the existing descriptor rather
   * than minting a new one) — an automatic loss discardAbandonedDraft's
   * own guard can't see, since reuse never calls close(). Same policy,
   * same predicate as that guard (canAutoDiscardDraft/shouldRetainDraft) —
   * every automatic transition that can make a draft disappear consults
   * it, rather than each carrying its own copy of the exception.
   */
  private findReusableDraftId(type: PageType): string | undefined {
    for (const [id, descriptor] of this.drafts) {
      if (descriptor.type !== type) {
        continue;
      }

      if (!this.documentRegistry.get(id)) {
        continue;
      }

      if (!this.canAutoDiscardDraft(descriptor)) {
        continue;
      }

      if (this.isEmptyDraft(id)) {
        return id;
      }
    }

    return undefined;
  }

  private isEmptyDraft(id: string): boolean {
    const session = this.documentRegistry.get(id);

    return (session?.currentRevision.markdown ?? '').trim() === '';
  }

  /** VaultPath.pageName — the one shared implementation (rule 4). */
  private deriveNameFromPath(path: string): string {
    return VaultPath.pageName(path);
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
    this.disposeTitleState(pageId);
  }

  /**
   * Tears down a page's title channel, if it has one — the title
   * counterpart to DocumentRegistry.close()'s session teardown, called
   * from both close() and delete() for the same reason: no armed timer or
   * live FieldEditState may outlive the page it belongs to.
   */
  private disposeTitleState(pageId: string): void {
    const titleState = this.titleStates.get(pageId);

    if (!titleState) {
      return;
    }

    this.saveCoordinator.cancelTimers(this.titleChannelKey(pageId));
    titleState.markDisposed();
    this.titleStates.delete(pageId);
  }

  /**
   * Escape's channel-side counterpart: reverts the title channel's pending
   * value back to whatever's actually persisted and cancels its armed
   * timer, so a cancelled edit cannot silently persist later on its own
   * debounce/ceiling schedule (EditableText.onCancel, fired only on
   * Escape). Does not touch anything already durable — if a debounce/
   * ceiling already fired and completed (or is currently in flight)
   * before Escape was pressed, that write is not undone; this only
   * cancels work that hasn't happened yet, using the exact same
   * commit()/cancelTimers() primitives commitTitle() itself uses, not a
   * new rollback mechanism.
   */
  public cancelTitleEdit(pageId: string): void {
    const titleState = this.titleStates.get(pageId);

    if (!titleState) {
      return;
    }

    titleState.commit(titleState.savedValue);
    this.saveCoordinator.cancelTimers(this.titleChannelKey(pageId));
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

    this.saveCoordinator.scheduleSave(session.id, () => {
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
   *
   * Concurrent calls for the same pageId share one underlying attempt: if
   * a call is already in flight for this id, this returns that exact same
   * promise rather than starting a second, independent evaluation. This
   * matters beyond mere efficiency — it's what lets a caller like
   * flushAll() correctly await a save that a different, earlier, never-
   * awaited trigger (e.g. a debounce timer) already started, instead of
   * the redundant call's own evaluate() seeing Saving, suppressing, and
   * resolving immediately while the real write is still in progress.
   */
  public requestSave(pageId: string): Promise<void> {
    const existing = this.inFlightSaves.get(pageId);

    if (existing) {
      return existing;
    }

    const promise = this.runRequestSave(pageId).finally(() => {
      if (this.inFlightSaves.get(pageId) === promise) {
        this.inFlightSaves.delete(pageId);
      }
    });

    this.inFlightSaves.set(pageId, promise);

    return promise;
  }

  private async runRequestSave(pageId: string): Promise<void> {
    const session = this.documentRegistry.get(pageId);

    if (!session) {
      return;
    }

    for (;;) {
      const decision = this.saveCoordinator.evaluate(session.state, session.isDirty);

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

  /** The title channel's SaveCoordinator key — distinct from `pageId` so it can never collide with the body channel's timers/stale-guard entries for the same page. */
  private titleChannelKey(pageId: string): string {
    return `${pageId}:title`;
  }

  /**
   * Commits a persisted page's title in memory only — the title-channel
   * counterpart to commitEdit() (autosave-execution-model.md §3.1's
   * "commit without persisting" contract), then arms the title channel's
   * own, longer-cadence timers (TITLE_AUTOSAVE_DEBOUNCE_MS/CEILING_MS —
   * see their own doc comment for why title uses a different policy than
   * the body while sharing the identical SaveCoordinator mechanism).
   *
   * Only valid for a real, persisted page — a draft's title has no
   * separate commit/persist split and continues to go through
   * updateDraftTitle() unconditionally; a caller mistakenly calling this
   * for a draft id fails loudly here rather than entering a save loop
   * that can only ever fail (the Gate's 'rename' kind abandons for an id
   * with no Vault page).
   */
  public commitTitle(pageId: string, title: string): void {
    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const titleState = this.titleStates.get(pageId) ?? new FieldEditState(page.name);

    this.titleStates.set(pageId, titleState);
    titleState.commit(title);

    this.saveCoordinator.scheduleSave(
      this.titleChannelKey(pageId),
      () => {
        void this.requestTitleSave(pageId);
      },
      { debounceMs: TITLE_AUTOSAVE_DEBOUNCE_MS, ceilingMs: TITLE_AUTOSAVE_CEILING_MS }
    );
  }

  /**
   * The title channel's counterpart to requestSave() — same single-entry-
   * point, coalescing, and never-throws contract, evaluated against the
   * page's FieldEditState<string> instead of its DocumentSession. Every
   * trigger that should flush a still-debouncing title (its own timer,
   * blur, navigation-away, shutdown) calls this; a body-only trigger
   * (the body's own debounce) never does, so the two channels' cadences
   * stay genuinely independent (see SaveCoordinator's class doc comment).
   *
   * A silent no-op if this page has no title-editing activity (no
   * FieldEditState was ever created) — mirrors runRequestSave()'s "no
   * session" no-op for a page that was never opened.
   */
  public requestTitleSave(pageId: string): Promise<void> {
    const key = this.titleChannelKey(pageId);
    const existing = this.inFlightSaves.get(key);

    if (existing) {
      return existing;
    }

    const promise = this.runRequestTitleSave(pageId).finally(() => {
      if (this.inFlightSaves.get(key) === promise) {
        this.inFlightSaves.delete(key);
      }
    });

    this.inFlightSaves.set(key, promise);

    return promise;
  }

  private async runRequestTitleSave(pageId: string): Promise<void> {
    const titleState = this.titleStates.get(pageId);

    if (!titleState) {
      return;
    }

    const key = this.titleChannelKey(pageId);

    for (;;) {
      const decision = this.saveCoordinator.evaluate(titleState.state, titleState.isDirty);

      if (decision === 'suppress') {
        return;
      }

      const value = titleState.currentValue;

      titleState.beginSave();
      this.saveCoordinator.beginChannelSave(key, value);

      try {
        await this.rename(pageId, value);

        if (this.saveCoordinator.completeChannelSave(key, value)) {
          titleState.markSaved(value);
        }
      } catch {
        // Mirrors runRequestSave()'s T11a/T11b split: rename() can throw
        // either before enqueueing (page not found — a title-channel
        // entry for a since-deleted page) or after a Gate failure. Either
        // way, only a still-current (non-stale) failure should transition
        // this channel to SaveError — a superseded attempt's failure must
        // not clobber a newer, still-in-flight or already-succeeded one.
        if (this.saveCoordinator.failChannelSave(key, value)) {
          titleState.markSaveFailed();
        }
        return;
      }
    }
  }

  /**
   * Shutdown flush (autosave-execution-model.md §7): flushes every
   * session that either has unsaved content or is already mid-save,
   * bounded by timeoutMs so a single hung write can never block
   * application exit indefinitely. Called once, from Application.close(),
   * before that method's own teardown sequence (watcher stop, service
   * disposal, timer cancellation, registry clear) — this must run first,
   * while every session is still live, since disposal makes a session's
   * commit()/beginSave()/markSaved()/markSaveFailed() inert (M1/M4) and
   * DocumentRegistry.clear() removes it from getAll() entirely.
   *
   * No special-casing between an already-Saving session and a dirty-but-
   * idle one — both are simply passed to requestSave(), uniformly.
   * Because requestSave() now shares one in-flight promise per id, a
   * Saving session's requestSave() call joins whatever attempt is already
   * running (rather than seeing Saving, suppressing, and resolving
   * immediately) — flushAll() genuinely waits for it, not just for a
   * redundant no-op.
   *
   * Every session's flush runs independently via Promise.allSettled —
   * never sequential await in a loop — so one slow or permanently-failing
   * document (e.g. archived out from under its session) never delays or
   * blocks another's successful flush, mirroring the Gate's own per-page
   * failure isolation. requestSave() itself never throws (§1.3a), so
   * "settled" and "resolved" are equivalent here in practice — allSettled
   * is used anyway as the explicit, defensive form of that guarantee.
   */
  public async flushAll(timeoutMs: number): Promise<void> {
    const dirtyOrSaving = this.documentRegistry
      .getAll()
      .filter((session) => session.isDirty || session.state === DocumentState.Saving);

    // Shutdown is the same "nothing dirty may survive this moment"
    // boundary flushActivePage() already applies to navigation, extended
    // to every open page's title channel, not just the active one's.
    const dirtyOrSavingTitlePageIds = [...this.titleStates.entries()]
      .filter(
        ([, titleState]) =>
          titleState.isDirty || titleState.state === DocumentState.Saving
      )
      .map(([pageId]) => pageId);

    if (dirtyOrSaving.length === 0 && dirtyOrSavingTitlePageIds.length === 0) {
      return;
    }

    const flushes = Promise.allSettled([
      ...dirtyOrSaving.map((session) => this.requestSave(session.id)),
      ...dirtyOrSavingTitlePageIds.map((pageId) => this.requestTitleSave(pageId)),
    ]);

    await Promise.race([
      flushes,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
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
   * Duplicates a persisted page (ADR-028) — a raw filesystem copy, not a
   * Gate `create`. The copy is written through `duplicator`'s raw,
   * unsuppressed VaultFileSystem so the filesystem watcher observes it as
   * it would an externally copied file; VaultSyncService.handleCreated's
   * existing duplicate-id resolution then assigns the copy a fresh id and
   * persists it to frontmatter, the same path an external duplicate
   * already takes.
   *
   * The destination path is whatever `duplicator` (ultimately, the
   * storage provider) returns — this method never computes, inspects, or
   * validates that string (ADR-029): naming a duplicate is provider
   * policy, not an Application concern. Resolves once the Vault reflects
   * the new page at that path, then selects it (mirrors create()'s
   * "select the new item" behavior) — never opens a second draft or calls
   * the Gate itself.
   *
   * Only valid for a real Vault page; there is nothing to duplicate for a
   * still-open, unpersisted draft.
   */
  public async duplicate(pageId: string): Promise<string> {
    if (!this.duplicator) {
      throw new Error('PageOperations.duplicate: no VaultEntryDuplicator configured');
    }

    const page = this.vault.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const destinationPath = await this.duplicator.duplicateFile(page.path);
    const newPageId = await this.waitForPageAtPath(destinationPath);

    this.workspace.openPage(newPageId);

    return newPageId;
  }

  /**
   * Resolves once a page exists in the Vault at `path` — duplicate()'s
   * only caller, since a raw filesystem copy has no synchronous return
   * value the way a Gate `create` does. Vault.subscribe's listener carries
   * no path, so every event re-checks getPageByPath directly rather than
   * inspecting the event's own shape (cheap: this only runs while a
   * duplicate is in flight, and unsubscribes on its first hit).
   */
  private waitForPageAtPath(path: string): Promise<string> {
    const existing = this.vault.getPageByPath(path);

    if (existing) {
      return Promise.resolve(existing.id);
    }

    return new Promise((resolve) => {
      const unsubscribe = this.vault.subscribe(() => {
        const page = this.vault.getPageByPath(path);

        if (page) {
          unsubscribe();
          resolve(page.id);
        }
      });
    });
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
    this.flushActivePage();
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
   * Renames a persisted page in place — same-parent path change only,
   * mirroring FolderOperations.rename()'s shape exactly. No existence check
   * of its own, same reasoning as move()/delete(): relies on the Gate's
   * dequeue-time guard. Only valid for a real Vault page; a still-open
   * draft's title goes through updateDraftTitle() instead, which has no
   * Gate call to make until the draft is otherwise promoted.
   */
  public async rename(pageId: string, title: string): Promise<void> {
    const result = await this.coordinator.enqueue(pageId, {
      kind: 'rename',
      title,
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
   *
   * The missing lifecycle transition this closes (see ADR-025): closePage()
   * already tries to restore a previously-open page for us — that's
   * Workspace's own navigation-history job, unchanged here. What was
   * missing is the next step when there is no previous page to restore:
   * without it, the app was left with no active page/folder at all after
   * deleting the last one open. We only ever ask the Composition Root to
   * open its fallback page — we never decide what that page is.
   */
  public async delete(pageId: string): Promise<void> {
    this.documentRegistry.close(pageId);
    // Same reasoning as close() — a deleted page's session must not leave
    // a timer behind that could still fire against it.
    this.saveCoordinator.cancelTimers(pageId);
    this.drafts.delete(pageId);
    this.disposeTitleState(pageId);

    await this.coordinator.enqueue(pageId, { kind: 'delete' });

    this.workspace.closePage(pageId);

    if (!this.workspace.activeView) {
      this.openFallbackPage();
    }
  }
}
