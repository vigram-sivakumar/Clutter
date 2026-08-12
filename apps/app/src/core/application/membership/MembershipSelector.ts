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
    if (this.isEffectivelyArchived(folderId)) {
      return [];
    }

    return this.effectivePageState
      .getChildPages(folderId)
      .filter((page) => this.isNotesPage(page) && this.isVisiblePage(page));
  }

  /**
   * Every page that should currently be considered a Daily Notes child of
   * folderId — same structural source as getNotesChildPages, narrowed to
   * Daily Notes membership instead. Root-level (folderId: null) results are
   * exactly the "unplaced" Daily Note drafts a not-yet-materialized
   * year/month folder chain leaves with no real folder to be a child of.
   */
  public getDailyNoteChildPages(folderId: string | null): EffectivePage[] {
    if (this.isEffectivelyArchived(folderId)) {
      return [];
    }

    return this.effectivePageState
      .getChildPages(folderId)
      .filter((page) => this.isDailyNotePage(page) && this.isVisiblePage(page));
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
   * ADR-026 §5: a page or folder nested inside an archived folder must not
   * appear in ordinary workspace views even though its own `status` is
   * left untouched by folder archive (ADR-026 §2 — only the archived
   * folder's own metadata changes). Structural exclusion already handles
   * the common case for free (an archived item's own `parentId` moves to
   * Archive/, so it no longer appears as a child of its old parent at
   * all) — this predicate exists for the case that isn't already
   * structural: a still-reachable-by-id folder (e.g. a stale breadcrumb or
   * a directly-opened nested folder) whose *ancestor*, not itself, was
   * archived. Takes the containing folder id (null = vault root, never
   * archived) rather than a Folder/Page item, so both getVisibleChildFolders
   * and getVisibleChildPages/getNotesChildPages/getDailyNoteChildPages —
   * which already know the parent id they're querying — can guard with one
   * call instead of re-deriving an item's own status here (already handled
   * structurally, see above).
   */
  public isEffectivelyArchived(folderId: string | null): boolean {
    let currentId = folderId;

    while (currentId !== null) {
      const folder = this.vault.getFolder(currentId);

      if (!folder) {
        return false;
      }

      if (folder.metadata.status === 'archived') {
        return true;
      }

      currentId = folder.parentId;
    }

    return false;
  }

  /**
   * Workspace membership for a root folder (ADR-023 §4, resolving the
   * two-definition bug the ADR's Context section documents): a root folder
   * belongs to Workspace unless it's a system/reserved folder (Archive,
   * Inbox, Templates, Daily Notes, .clutter). This is the single
   * implementation both the sidebar's FolderTree and the Workspace
   * collection page (toCollectionPageModel) now consume — resolved in
   * favor of ReservedResources.ts's documented intent ("reserved folders...
   * should not surface in generic folder navigation") over ADR-022's
   * literal text, which described the Workspace page as unfiltered; see
   * ADR-022's amendment recording this correction.
   */
  public isWorkspaceFolder(folder: Folder): boolean {
    return folder.parentId === null && !this.isSystemFolder(folder) && this.isVisibleFolder(folder);
  }

  /** Every root folder that belongs to Workspace — see isWorkspaceFolder. */
  public getWorkspaceFolders(): Folder[] {
    return this.query.getRootFolders().filter((folder) => this.isWorkspaceFolder(folder));
  }

  /**
   * Presentation-only visibility: a name starting with `.` is hidden from
   * Clutter's UI, at every tree depth — not just system/reserved folders.
   * This is deliberately separate from isSystemFolder/isWorkspaceFolder:
   * `.clutter` is hidden for both reasons at once (system AND dot-prefixed),
   * but `.obsidian`/`.Untitled`/a user's own `.Project` are hidden by this
   * rule alone — they are ordinary, fully-synced vault content, never
   * excluded from scanning or sync (VaultScanner/VaultSyncService only ever
   * exclude `.clutter` itself, via isClutterInternalPath — see
   * docs/architecture-specification.md and ReservedResources.ts). Renaming
   * `Project` -> `.Project` externally still updates the Vault (Sync's
   * job); this predicate only decides whether the *already-synced* result
   * renders, which is why it lives here and not in VaultScanner/Sync.
   */
  public isHiddenName(name: string): boolean {
    return name.startsWith('.');
  }

  public isVisibleFolder(folder: Folder): boolean {
    return !this.isHiddenName(folder.name);
  }

  public isVisiblePage(page: Pick<EffectivePage | Page, 'name'>): boolean {
    return !this.isHiddenName(page.name);
  }

  /**
   * Every child folder of parentId that should render — the nested-level
   * counterpart to getWorkspaceFolders' root-level dot-hiding. Nested
   * folders have no Workspace/system-folder membership question (only the
   * root does — see isWorkspaceFolder's doc comment and FolderTree.tsx),
   * but they still need this one presentation filter applied, so this
   * wraps VaultQuery.getChildFolders() the same way getWorkspaceFolders
   * wraps getRootFolders() rather than leaving nested callers to reapply
   * isVisibleFolder themselves.
   */
  public getVisibleChildFolders(parentId: string): Folder[] {
    if (this.isEffectivelyArchived(parentId)) {
      return [];
    }

    return this.query
      .getChildFolders(parentId)
      .filter((folder) => this.isVisibleFolder(folder));
  }

  /**
   * Every child page of parentId that should render, regardless of type —
   * the un-narrowed counterpart to getNotesChildPages/getDailyNoteChildPages
   * for surfaces (a folder's own Collection page) that show every page a
   * folder contains, not just one type's.
   */
  public getVisibleChildPages(parentId: string | null): EffectivePage[] {
    if (this.isEffectivelyArchived(parentId)) {
      return [];
    }

    return this.effectivePageState
      .getChildPages(parentId)
      .filter((page) => this.isVisiblePage(page));
  }
}
