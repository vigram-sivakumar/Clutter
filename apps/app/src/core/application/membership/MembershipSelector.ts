import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';
import type { VaultResource } from '../../vault/models/VaultResource';
import type { Vault } from '../../vault/models/Vault';
import type { VaultQuery } from '../../vault/queries/VaultQuery';
import type { EffectivePage, EffectivePageState } from '../page/EffectivePageState';
import { ASSETS_DIRECTORY_NAME } from '../../vault/initialize/ensureAssetsDirectory';
import { VaultPath } from '../../vault/ingest/VaultPath';

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
    return (
      folder.parentId === null &&
      !this.isSystemFolder(folder) &&
      !this.isAssetsStorageFolder(folder) &&
      this.isVisibleFolder(folder)
    );
  }

  /**
   * Whether `folder` is the physical, managed Assets/ storage folder —
   * Clutter's default import destination for supported resources, a
   * filesystem detail distinct from the "Assets" logical collection (every
   * VaultResource anywhere in the vault, see getAllVisibleResources).
   * Deliberately NOT a reserved folder (Vault.isReservedFolder/
   * ReservedResources.ts are untouched): a reserved folder can't be
   * renamed/deleted and is excluded from scanning-adjacent concerns
   * app-wide, neither of which applies here — Assets/ is an ordinary,
   * fully-synced folder that merely doesn't render as a normal row in
   * FolderTree. Path/parentId-aware rather than name-only, mirroring
   * isSystemFolder's own reasoning: a nested folder that happens to be
   * named "Assets" (e.g. Projects/Assets) is not this folder.
   */
  public isAssetsStorageFolder(folder: Folder): boolean {
    return folder.parentId === null && folder.name === ASSETS_DIRECTORY_NAME;
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

  /**
   * Every VaultResource (image/pdf) that should currently be shown as a
   * child of parentId — the resource-scoped counterpart to
   * getVisibleChildPages. No EffectivePageState involved: a resource has no
   * draft/session concept to reconcile (ADR-020's Committed/Durable merge
   * is a Page-only question), so this reads straight from VaultQuery,
   * narrowed by the same two presentation rules getVisibleChildPages
   * already applies — dot-prefix hiding (isVisiblePage, already generic
   * over any `{ name }`) and effective-archive exclusion.
   */
  public getVisibleChildResources(parentId: string): VaultResource[] {
    if (this.isEffectivelyArchived(parentId)) {
      return [];
    }

    return this.query
      .getChildResources(parentId)
      .filter((resource) => this.isVisiblePage(resource));
  }

  /**
   * Every root-level VaultResource that should currently be shown — the
   * resource-scoped counterpart to getWorkspaceFolders' root-level
   * treatment, narrowed only by dot-prefix hiding (root itself is never
   * archived, same as getWorkspaceFolders' own omission of that check).
   */
  public getRootResources(): VaultResource[] {
    return this.query
      .getRootResources()
      .filter((resource) => this.isVisiblePage(resource));
  }

  /**
   * Whether a resource is currently archived — determined entirely by
   * location, not a metadata flag: `VaultResource` deliberately carries no
   * `status`/`archivedAt` of its own (§3b — see the approved Resource
   * mutation design), so unlike a Page/Folder, there is no second signal
   * to check alongside physical location. `ResourceOperations.
   * archiveResource()` relocates a resource into the reserved Archive/
   * folder and nowhere else, so "is this resource's path inside Archive/"
   * is the sole and complete answer, at any nesting depth.
   *
   * Deliberately not answered by isEffectivelyArchived(resource.parentId):
   * that predicate asks "is the *containing folder* itself archived"
   * (folder.metadata.status === 'archived', per ADR-026 §5) — the reserved
   * Archive folder's own status is 'active' (it's a container, never
   * itself an archived entity), so a resource sitting directly inside it
   * would pass that check and be wrongly treated as visible.
   */
  public isResourceArchived(resource: VaultResource): boolean {
    const archiveFolder = this.vault.getReservedFolder('archive');

    if (!archiveFolder) {
      return false;
    }

    return (
      resource.path === archiveFolder.path ||
      VaultPath.isDescendantOf(resource.path, archiveFolder.path)
    );
  }

  /**
   * Every visible resource anywhere in the vault — the "Assets" logical
   * collection (ADR-023-style membership, not a folder-scoped read): a
   * resource physically inside the managed Assets/ folder and one placed
   * anywhere else are equally members. Same two presentation rules as
   * every other resource/page query — dot-prefix hiding and
   * effective-archive exclusion — applied per-resource against its own
   * parentId, since results here span every folder in the vault at once,
   * not one caller-chosen folderId. Also excludes a resource archived
   * directly into Archive/ itself (isResourceArchived) — a case
   * isEffectivelyArchived alone can't catch, see that method's own doc
   * comment.
   */
  public getAllVisibleResources(): VaultResource[] {
    return this.query
      .getAllResources()
      .filter(
        (resource) =>
          this.isVisiblePage(resource) &&
          !this.isEffectivelyArchived(resource.parentId) &&
          !this.isResourceArchived(resource)
      );
  }

  /**
   * Every visible resource currently archived — the resource-scoped
   * counterpart to VaultQuery.getArchivedPages(), but computed here (not
   * VaultQuery) since "archived" for a resource is isResourceArchived's
   * structural, path-based question, not a bare metadata-flag filter the
   * way a page's `status === 'archived'` is. Feeds the Archive view's
   * resource rows (ArchiveCollectionBody), the same way getArchivedPages()
   * feeds its folders/notes today.
   */
  public getArchivedResources(): VaultResource[] {
    return Array.from(this.vault.resources()).filter(
      (resource) => this.isVisiblePage(resource) && this.isResourceArchived(resource)
    );
  }
}
