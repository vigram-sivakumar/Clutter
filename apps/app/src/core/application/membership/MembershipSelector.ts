import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';
import type { Vault } from '../../vault/models/Vault';
import type { VaultQuery } from '../../vault/queries/VaultQuery';
import type { EffectivePage, EffectivePageState } from '../page/EffectivePageState';

/**
 * ADR-023: for a page or folder plus a named product concept, answers
 * whether it is a member — deterministically, from the page's/folder's own
 * identity (`type`, reserved-folder status), never from a consumer's ad hoc
 * inspection of `folderId`/path/folder hierarchy.
 *
 * A classification layer, distinct from EffectivePageState's reconciliation
 * responsibility (ADR-020). It consumes Vault/VaultQuery/EffectivePageState
 * output as its only input and holds no state of its own — every answer is
 * derivable, at any instant, purely as a function of those three sources
 * (ADR-023 §7's purity invariant, mirroring ADR-020 §7's for
 * EffectivePageState).
 *
 * Must never own: storage/identity (Vault), Committed/Durable reconciliation
 * (EffectivePageState), mutation/validity decisions (PageOperations/
 * FolderOperations), presentation formatting/ordering (View Models), or
 * rendering (React components). See ADR-023 §5.
 */
export class MembershipSelector {
  constructor(
    private readonly vault: Vault,
    private readonly query: VaultQuery,
    private readonly effectivePageState: EffectivePageState
  ) {}

  /**
   * Notes membership (ADR-023 §4): a page belongs to Notes if its type
   * makes no other named claim on it — today, exactly the pages that are
   * not Daily Notes. Identity-driven (`page.type`), never `folderId`-driven
   * — this is the fix for the bug where a Daily Note draft with
   * `folderId: null` was indistinguishable from a root-level Note.
   */
  public isNotesPage(page: EffectivePage): boolean {
    return page.type === 'note';
  }

  /**
   * Daily Notes membership (ADR-023 §4): identity-driven (`page.type`),
   * never folder-hierarchy-driven. A Daily Note draft is a member even
   * before its year/month folder chain has been materialized on disk
   * (folderId: null) — this is what lets an unplaced draft still resolve
   * as a Daily Note rather than silently falling through to no feature at
   * all.
   */
  public isDailyNotePage(page: EffectivePage): boolean {
    return page.type === 'daily-note';
  }

  /**
   * Every page that should currently be considered a Notes child of
   * folderId (null = root) — same source as EffectivePageState.getChildPages,
   * narrowed to Notes membership. Folder location (`folderId`) is still used
   * structurally (which folder's children to look at), but never as the
   * qualification test for whether an individual page belongs to Notes —
   * `type` decides that (ADR-023 §7, "identity-driven, never
   * topology-driven").
   */
  public getNotesChildPages(folderId: string | null): EffectivePage[] {
    return this.effectivePageState
      .getChildPages(folderId)
      .filter((page) => this.isNotesPage(page));
  }

  /**
   * Every page that should currently be considered a Daily Notes child of
   * folderId — same structural source as getNotesChildPages, narrowed to
   * Daily Notes membership instead. Root-level (folderId: null) results are
   * exactly the "unplaced" Daily Note drafts a not-yet-materialized
   * year/month folder chain leaves with no real folder to be a child of.
   */
  public getDailyNoteChildPages(folderId: string | null): EffectivePage[] {
    return this.effectivePageState
      .getChildPages(folderId)
      .filter((page) => this.isDailyNotePage(page));
  }

  /**
   * System/reserved-folder classification (ADR-023 §4) — delegates to
   * Vault.isReservedFolder(), the one path/parentId-aware implementation,
   * rather than re-deriving reserved-ness from the folder's name alone.
   * The single place every consumer should ask "is this a system folder,"
   * collapsing the several independent strictness levels the ADR-023 audit
   * found (name-only, name+path, presentation-eligible) into this one call.
   */
  public isSystemFolder(folder: Folder): boolean {
    return this.vault.isReservedFolder(folder);
  }

  /**
   * Archive membership, in the feature-visibility sense (ADR-023 §4) —
   * durable-only by construction (a draft can never be archived; this is a
   * Category-4 field with no Committed counterpart, per ADR-020 §3), so it
   * operates on Vault's Page, not EffectivePage. Delegates to
   * VaultQuery.getArchivedPages()'s existing predicate rather than
   * re-deriving it, so this becomes the one place a future consumer asks
   * "is this page archived" instead of re-checking `metadata.status`
   * independently.
   */
  public isArchivedPage(page: Page): boolean {
    return page.metadata.status === 'archived';
  }

  /**
   * NOT YET WIRED TO ANY CONSUMER (Phase 1 of ADR-023's rollout — this
   * layer coexists with the current implementations until Phase 2).
   *
   * Workspace membership for a root folder. Placeholder definition,
   * matching today's sidebar behavior (VaultQuery.getVisibleRootFolders():
   * exclude every reserved folder) — this is the answer FolderTree's
   * "Workspace" section currently renders. It does NOT yet match
   * toCollectionPageModel's Workspace page, which reads
   * VaultQuery.getRootFolders() unfiltered, per ADR-022's stated design.
   * That divergence (ADR-023's Context section, "conformance gap against
   * ADR-022") must be resolved — confirming which of the two is the
   * intended product behavior — before this method is wired to either
   * consumer in Phase 2. Implemented here as a placeholder purely so the
   * layer's shape is complete; not to be treated as the resolved answer.
   */
  public isWorkspaceFolder(folder: Folder): boolean {
    return folder.parentId === null && !this.isSystemFolder(folder);
  }

  /** See isWorkspaceFolder's placeholder caveat above. */
  public getWorkspaceFolders(): Folder[] {
    return this.query.getRootFolders().filter((folder) => this.isWorkspaceFolder(folder));
  }
}
