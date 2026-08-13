import type { Vault } from '../../vault/models/Vault';
import type { VaultQuery } from '../../vault/queries/VaultQuery';
import type { Workspace } from '../../workspace/Workspace';
import type { PageType } from '../../vault/models/Page';
import type { PageOperations } from './PageOperations';

type Unsubscribe = () => void;

/**
 * Per-id reconciliation of what's Committed (an open DocumentSession/draft)
 * with what's Durable (a Vault page) — ADR-020's merge contract, Categories
 * 1-4. The complete, deliberately minimal read model for page-list
 * rendering (ADR-020's M3 amendment) — a presentation read model, not a
 * second domain model: `description`/`icon`/`favorite` are the only
 * Category 2/4 fields included, because they're the only ones a page-list
 * row needs to render without a second Vault read. `Page`'s `analysis`,
 * timestamps, `path`, and `status` are deliberately excluded; add a field
 * only when a shipped consumer demonstrably needs it, never speculatively.
 * `favorite` was added for the sidebar's per-row Favorite/Unfavorite menu
 * item, which needs current state to pick its label — same exception
 * ARCHITECTURE_RULES.md rule 13 already documents for getFavoritePages():
 * a draft never has a persisted `favorite` (PageMetadata field, no
 * DraftDescriptor equivalent), so it always resolves to `false`
 * pre-promotion.
 */
export interface EffectivePage {
  readonly id: string;
  readonly type: PageType;
  readonly folderId: string | null;
  readonly isDraft: boolean;
  readonly name: string;
  readonly description: string | null;
  readonly markdown: string;
  readonly icon: string | null;
  readonly favorite: boolean;
}

/**
 * ADR-020: an Application-Layer read projection reconciling Vault (Durable)
 * with PageOperations'/DocumentEditing's in-memory state (Committed) — for
 * consumers that need "what should currently be shown," not just "what's
 * been persisted."
 *
 * Owns subscriptions, never state (ADR-020 §7): every EffectivePage is
 * recomputed on each call from Vault, PageOperations.getDraft(), and any
 * open DocumentSession's current revision — nothing here is an independent
 * cache. The one thing retained across calls is the set of active
 * DocumentSession unsubscribe handles, which is subscription bookkeeping,
 * not a projected value (ADR-020's pre-implementation amendment).
 *
 * Workspace.subscribe is used to learn when the open-id set changes only
 * because it's currently the sole observable proxy for DocumentSession
 * existence (ADR-020 §4's named caveat) — DocumentRegistry has no
 * subscribe/notify of its own. This is an implementation dependency, not
 * the conceptual one.
 */
export class EffectivePageState {
  private readonly sessionUnsubscribes = new Map<string, Unsubscribe>();
  private readonly listeners = new Set<() => void>();
  private readonly vaultUnsubscribe: Unsubscribe;
  private readonly workspaceUnsubscribe: Unsubscribe;
  private disposed = false;

  constructor(
    private readonly vault: Vault,
    private readonly query: VaultQuery,
    private readonly pageOperations: PageOperations,
    private readonly workspace: Workspace
  ) {
    this.vaultUnsubscribe = this.vault.subscribe(() => this.notify());
    this.workspaceUnsubscribe = this.workspace.subscribe(() => {
      this.syncSessionSubscriptions();
      this.notify();
    });
    this.syncSessionSubscriptions();
  }

  /**
   * Reconciled state for a single id — a Vault page, an open draft, or
   * both (during the narrow promotion window; see resolve()'s precedence).
   * Undefined if the id is neither a Vault page nor a currently-open draft.
   */
  public getPage(id: string): EffectivePage | undefined {
    return this.resolve(id);
  }

  /**
   * Every page that should currently be considered a child of folderId
   * (null = root) — Vault's durable children plus any open draft targeting
   * this folder that hasn't been promoted yet. Ordering is an internal
   * implementation detail (ADR-020's amendment): today's durable order is
   * preserved exactly, with not-yet-persisted drafts appended after it.
   * This is not a public contract — it is not configurable and must not be
   * relied on beyond "durable pages keep their existing relative order."
   */
  public getChildPages(folderId: string | null): EffectivePage[] {
    const durablePages =
      folderId === null ? this.query.getRootPages() : this.query.getChildPages(folderId);

    const durableIds = durablePages.map((page) => page.id);

    const draftOnlyIds = this.workspace.openPages.filter((id) => {
      if (this.vault.getPage(id)) {
        return false;
      }

      const draft = this.pageOperations.getDraft(id);
      return draft !== undefined && draft.folderId === folderId;
    });

    return [...durableIds, ...draftOnlyIds]
      .map((id) => this.resolve(id))
      .filter((entry): entry is EffectivePage => entry !== undefined);
  }

  /**
   * Every page that should currently be considered a favorite — Vault's
   * favorited (durable-only, per ARCHITECTURE_RULES.md rule 13's
   * documented exception: the favorite flag lives in PageMetadata, which a
   * draft never has) pages, reconciled the same way getChildPages()
   * reconciles folder membership, so a favorited-but-currently-open page
   * reflects its live, uncommitted content rather than only what's on
   * disk. The single owner of this reconciliation — Favorites' sidebar
   * list and the Favorites collection page (ADR-022) both call this
   * instead of each re-deriving their own resolve-or-fallback logic.
   */
  public getFavoritePages(): EffectivePage[] {
    return this.query
      .getFavoritePages()
      .map((page) => this.resolve(page.id))
      .filter((entry): entry is EffectivePage => entry !== undefined);
  }

  /**
   * Every page (note or daily note alike) referencing the given tag —
   * durable-only by construction, unlike getChildPages()/getFavoritePages():
   * a draft has no Page.analysis (tags are extracted only from scanned
   * Vault content), so there is no equivalent "draft mentions this tag"
   * case to reconcile. Still resolved through resolve() rather than
   * returned as raw Pages, so a currently-open page's live, uncommitted
   * title/description/icon show correctly, same as every other
   * page-list read here.
   */
  public getPagesByTag(name: string): EffectivePage[] {
    return this.query
      .getPagesByTag(name)
      .map((page) => this.resolve(page.id))
      .filter((entry): entry is EffectivePage => entry !== undefined);
  }

  /**
   * The number of DocumentSessions currently subscribed to — exposed
   * read-only for tests to assert against directly, mirroring
   * DocumentRegistry.size's precedent, not a value any production
   * consumer needs.
   */
  public get subscribedSessionCount(): number {
    return this.sessionUnsubscribes.size;
  }

  public subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Unsubscribes from Vault, Workspace, and every currently-tracked
   * DocumentSession. Idempotent, mirroring Application.close()'s own
   * idempotency (safe under React Strict Mode / repeated teardown calls).
   * Must run before DocumentRegistry.clear() in Application.close()'s
   * sequence — see ADR-020 §5.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.vaultUnsubscribe();
    this.workspaceUnsubscribe();

    for (const unsubscribe of this.sessionUnsubscribes.values()) {
      unsubscribe();
    }

    this.sessionUnsubscribes.clear();
    this.listeners.clear();
  }

  /**
   * Category 1-4 reconciliation for one id, per ADR-020 §3. A Vault page
   * (if one exists) is authoritative for identity and durable-structural
   * fields (folderId, description, icon — none of which a draft or an
   * open session ever tracks); an open session/draft, if any, overrides
   * only the Committed-tracked label inputs (name pre-promotion via
   * DraftInfo, markdown always via DocumentSession) — never the reverse.
   */
  private resolve(id: string): EffectivePage | undefined {
    const page = this.vault.getPage(id);
    const draft = page ? undefined : this.pageOperations.getDraft(id);

    if (!page && !draft) {
      return undefined;
    }

    const session = this.pageOperations.getSession(id);

    return {
      id,
      type: page ? page.type : (draft as NonNullable<typeof draft>).type,
      folderId: page ? page.parentId : (draft as NonNullable<typeof draft>).folderId,
      isDraft: !page,
      name: page ? page.name : ((draft as NonNullable<typeof draft>).title ?? ''),
      description: page ? page.metadata.description : null,
      markdown: session ? session.currentRevision.markdown : (page ? page.source.markdown : ''),
      icon: page ? page.metadata.icon : null,
      favorite: page ? page.metadata.favorite : false,
    };
  }

  /**
   * Diffs Workspace's own open-id set (the sole observable proxy for
   * DocumentSession existence, per this class's own doc comment) against
   * the ids this class currently holds a session subscription for, adding
   * and removing subscriptions to match. Called on construction and on
   * every Workspace notification — never maintains its own independent
   * copy of the open-id set, only the resulting unsubscribe handles.
   */
  private syncSessionSubscriptions(): void {
    const openIds = new Set(this.workspace.openPages);

    for (const [id, unsubscribe] of this.sessionUnsubscribes) {
      if (!openIds.has(id)) {
        unsubscribe();
        this.sessionUnsubscribes.delete(id);
      }
    }

    for (const id of openIds) {
      if (this.sessionUnsubscribes.has(id)) {
        continue;
      }

      const session = this.pageOperations.getSession(id);

      if (!session) {
        continue;
      }

      this.sessionUnsubscribes.set(
        id,
        session.subscribe(() => this.notify())
      );
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
