import { isTauri } from '@tauri-apps/api/core';
import { LocalVaultProvider } from '../vault/providers/LocalFileSystem';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { BrowserFileSystemWatcher } from '../vault/providers/BrowserFileSystemWatcher';
import { browserCoverImageUrlResolver } from '../vault/providers/BrowserCoverImageUrlResolver';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { DailyNotePath } from '../vault/ingest/DailyNotePath';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { PagePathResolver } from './page/PagePathResolver';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { VaultBuilder } from '../vault/ingest';
import { VaultScanner } from '../vault/ingest';
import { Workspace } from '../workspace/Workspace';
import { Vault } from '../vault/models/Vault';
import { VaultQuery } from '../vault/queries/VaultQuery';
import { PageOperations, SHUTDOWN_FLUSH_TIMEOUT_MS } from './page/PageOperations';
import { EffectivePageState } from './page/EffectivePageState';
import { MembershipSelector } from './membership/MembershipSelector';
import { FolderOperations } from './folder/FolderOperations';
import { ResourceArchiveMetadataStore } from '../vault/persistence/ResourceArchiveMetadataStore';
import { ResourceOperations } from './resource/ResourceOperations';
import { TaskOperations } from './task/TaskOperations';
import { TagOperations } from './tags/TagOperations';
import { FoldStateStore } from './editor/FoldStateStore';
import { CollectionViewConfigStore } from './collection/CollectionViewConfigStore';
import { TasksViewConfigStore } from './task/TasksViewConfigStore';
import { TagExpansionStore } from './tags/TagExpansionStore';
import { DailyNotesSidebarState } from './daily-notes/DailyNotesSidebarState';
import { WorkspaceSessionStore } from './workspace/WorkspaceSessionStore';
import { TagMetadataStore } from '../vault/persistence/TagMetadataStore';
import { FolderPathResolver } from '../vault/persistence/FolderPathResolver';
import { FolderCreator } from './folder/FolderCreator';
import { NavigationRouter } from './navigation/NavigationRouter';
import { DocumentRegistry } from '../engine/DocumentRegistry';
import { SaveCoordinator } from '../engine/SaveCoordinator';
import { PagePersistenceCoordinator } from '../vault/persistence/PagePersistenceCoordinator';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../vault/ingest/PageRebuilder';
import { MoveService } from '../vault/persistence/MoveService';
import { VaultEntryDuplicator } from '../vault/persistence/VaultEntryDuplicator';
import { LocalFileSystemWatcher } from '../vault/providers/LocalFileSystemWatcher';
import { VaultSyncService } from '../vault/sync/VaultSyncService';
import { reconcileVaultArchiveMetadata } from '../vault/sync/reconcileArchiveMetadata';
import { reconcileVaultTemplateMetadata } from '../vault/sync/reconcileTemplateMetadata';
import { persistSyncedPageDocument } from '../vault/sync/persistSyncedPageDocument';
import type { VaultFileSystem } from '../vault/providers/VaultFileSystem';
import type { CoverImageUrlResolver } from '../vault/providers/CoverImageUrlResolver';
import { localCoverImageUrlResolver } from '../vault/providers/LocalCoverImageUrlResolver';
import { registerVaultAssetScope } from '../vault/providers/registerVaultAssetScope';
import { importCoverAsset } from '../vault/importCoverAsset';
import { importAsset } from '../vault/asset/importAsset';
import type { Page } from '../vault/models/Page';
import { findRemoteImageDisplayName } from './asset/remoteImageDisplayName';
import { rewriteRemoteAssetReferences } from './asset/rewriteRemoteAssetReferences';
import { saveRemoteImage, type SaveToVaultResult } from './asset/saveRemoteImage';
import { importRemoteAsset } from '../vault/asset/importRemoteAsset';
import { fetchRemoteAsset } from '../vault/providers/fetchRemoteAsset';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { SelfWriteAwareFileSystem } from '../vault/providers/SelfWriteAwareFileSystem';
import { SelfWriteAwareWatcher } from '../vault/providers/SelfWriteAwareWatcher';
import { attachDevTools } from '@devtools/index';

/**
 * Composition root for the application layer.
 *
 * Owns the long-lived application services and shared runtime state.
 *
 * Two-phase construction: bootstrap(rootPath) constructs Platform + Vault
 * Ingest, scans and builds the Vault, then calls attachVault() internally
 * (not from AppShell — see ADR-014). bootstrap() no longer creates today's
 * note through the Gate (ADR-017 supersedes that part of ADR-014
 * Decision 1), nor scaffolds its directory ahead of the scan (ADR-019
 * retires that too, now that DailyNoteService.ensureFolderChain
 * materializes Daily Note folders at persist time instead): navigation
 * never creates durable knowledge, not even at boot. attachVault() still
 * runs inside bootstrap() regardless, since open() needs pageOperations
 * constructed before its resolve-or-draft call below can run.
 * open() starts the watcher and resolves today's note — the real page if
 * one exists, otherwise an unpersisted draft at its deterministic path,
 * computed here rather than carried from bootstrap() (ADR-019) — the one
 * documented seam a future startup-strategy parameter would extend.
 *
 * Responsibilities:
 * - Own the active Vault.
 * - Own the active Workspace.
 * - Own long-lived runtime services (Workspace, DocumentRegistry, SaveCoordinator, PageOperations, application services like page and folder services).
 * - The composition root owns the lifetime of all runtime services used by the application.
 * - Provide a single entry point for the UI.
 *
 * Does NOT:
 * - Render UI.
 * - Store document content.
 * - Implement document editing.
 */
export class Application {
  public readonly vault: Vault;
  public readonly query: VaultQuery;
  public readonly workspace: Workspace;
  public readonly documentRegistry: DocumentRegistry;
  public readonly saveCoordinator: SaveCoordinator;
  /**
   * ADR-033: per-pageId CM6 fold-range persistence through
   * `.clutter/workspace.json`, loaded once in `bootstrap()` below. Not
   * Gate-backed, for the same reason TagOperations isn't (ARCHITECTURE_RULES.md
   * rule 2 — `.clutter/*` is application infrastructure, not Vault domain
   * content) and not owned by `Workspace` (fold state is editor content
   * state, not navigation state — see ADR-033's Decision for the full
   * rationale).
   */
  public readonly foldStateStore: FoldStateStore;
  /**
   * Persisted per-collection Layout/Properties/Sort configuration, through
   * a sibling top-level key of the same `.clutter/workspace.json`
   * `foldStateStore` above owns (`collectionViewConfig`, vs. `foldState`/
   * `embedCollapse`) — loaded once in `bootstrap()` below. Not Gate-backed
   * and not owned by `Workspace`, for the same reasons `foldStateStore`
   * isn't (see `CollectionViewConfigStore`'s own doc comment).
   */
  public readonly collectionViewConfigStore: CollectionViewConfigStore;
  /**
   * Persisted, shared Tasks-sidebar display configuration (Show completed /
   * Auto-sort completed), through a sibling top-level key of the same
   * `.clutter/workspace.json` `foldStateStore`/`collectionViewConfigStore`
   * above own (`tasksViewConfig`) — loaded once in `bootstrap()` below. Not
   * Gate-backed and not owned by `Workspace`, for the same reasons
   * `collectionViewConfigStore` isn't (see `TasksViewConfigStore`'s own doc
   * comment).
   */
  public readonly tasksViewConfigStore: TasksViewConfigStore;
  /**
   * Persisted Tags-sidebar expansion state (which tags' inline note lists
   * are expanded), through a sibling top-level key of the same
   * `.clutter/workspace.json` `foldStateStore`/`tasksViewConfigStore`
   * above own (`tagExpansion`) — loaded once in `bootstrap()` below. Not
   * Gate-backed and not owned by `Workspace`, for the same reasons
   * `foldStateStore` isn't (see `TagExpansionStore`'s own doc comment).
   */
  public readonly tagExpansionStore: TagExpansionStore;
  /**
   * Runtime owner of the Daily Notes sidebar's Earlier/Upcoming expansion
   * (ADR-035 §2) — in-memory, zero-dependency, deliberately not part of
   * `Workspace`. Constructed here so it outlives `DailyNotesList`'s
   * unmount on a sidebar-tab switch.
   */
  public readonly dailyNotesSidebarState: DailyNotesSidebarState;
  /**
   * The persistence boundary for workspace session state (ADR-035): the
   * `workspaceSession` key of the same `.clutter/workspace.json` the stores
   * above write to. Loaded and seeded in `bootstrap()`, restored and attached
   * at the end of `open()`, flushed in `close()`. `Workspace` and
   * `dailyNotesSidebarState` stay the runtime owners and never see it.
   */
  public readonly workspaceSessionStore: WorkspaceSessionStore;
  private readonly tagMetadataStore: TagMetadataStore;
  public pageOperations!: PageOperations;
  public folderOperations!: FolderOperations;
  public resourceOperations!: ResourceOperations;
  /**
   * `.clutter/resource-archive.json` — where each archived file came from and when it was archived.
   * The same instance the Persistence Gate writes through, so what the Archive page reads is what
   * was recorded; the UI only reads it (`read()`), never writes.
   */
  public resourceArchiveStore!: ResourceArchiveMetadataStore;
  public taskOperations!: TaskOperations;
  public tagOperations!: TagOperations;
  public navigation!: NavigationRouter;
  public vaultSyncService!: VaultSyncService;
  public effectivePageState!: EffectivePageState;
  public membershipSelector!: MembershipSelector;
  private readonly fileSystem: VaultFileSystem;
  private readonly coverImageUrlResolver: CoverImageUrlResolver;
  private readonly selfWriteRegistry: SelfWriteRegistry;
  private fileSystemWatcher!: LocalFileSystemWatcher | BrowserFileSystemWatcher;
  private rootPath!: string;
  /** Remote-image saves running right now, by URL — see saveRemoteImageToVault. */
  private readonly remoteImageSaves = new Map<string, Promise<SaveToVaultResult>>();
  private closed = false;
  private workspaceVaultReconciliationUnsubscribe!: () => void;

  static async bootstrap(
    rootPath: string,
    /**
     * Threaded straight through to `PageOperations`'s own constructor
     * (`attachVault()` below) — see that class's own doc comment for why
     * it takes only the abstract `(markdown: string) => string` shape
     * rather than importing the concrete table-normalization module
     * itself. `AppShell.tsx` (the one place UI and this Composition Root
     * already meet) is the real caller that supplies it; every existing
     * test/dev call site that omits it keeps writing `revision.markdown`
     * verbatim, unchanged, per `PageOperations`'s own optional-hook
     * default.
     */
    normalizeMarkdownForSave?: (markdown: string) => string
  ): Promise<Application> {
    // Shared between the write side (SelfWriteAwareFileSystem) and the read
    // side (SelfWriteAwareWatcher) so the filesystem watcher can recognize
    // and drop its own echo of a write this app just made, instead of
    // VaultSyncService re-processing it as a second, duplicate change.
    const selfWriteRegistry = new SelfWriteRegistry();
    // Platform's documented extension point (spec §1): a second backend is
    // a new VaultFileSystem/VaultFileSystemWatcher pair, wired here and
    // only here — no other subsystem's code changes. InMemoryVaultFileSystem
    // already exists as the canonical non-Tauri VaultFileSystem
    // implementation (spec §1's testing strategy), so the web runtime reuses
    // it directly rather than duplicating its logic (implementation-rules.md
    // §2 rule 4) — a fresh, disposable in-memory vault, never the real
    // Tauri-backed one.
    const runningInTauri = isTauri();
    const rawFileSystem = runningInTauri
      ? new LocalVaultProvider(rootPath)
      : new InMemoryVaultFileSystem();

    if (!runningInTauri) {
      // The in-memory backend starts with no tracked paths at all; the scan
      // below requires the root to "exist" the same way a real vault
      // directory always does.
      await rawFileSystem.createDirectory(rootPath);
    } else if (!(await rawFileSystem.exists(rootPath))) {
      // First run, or a vault folder that is gone: start an empty vault there rather than fail the
      // scan below. (The folder is only created — nothing else is written until the user does something.)
      await rawFileSystem.createDirectory(rootPath);
    }

    const fileSystem = new SelfWriteAwareFileSystem(
      rawFileSystem,
      selfWriteRegistry,
      rootPath
    );

    const dailyNotes = new DailyNoteService();

    // No eager reserved-folder/file materialization here — the lazy
    // system-folder lifecycle (Reserved resource definition ≠ physical
    // existence): a missing reserved folder is a valid, ordinary state at
    // boot, discovered as absent by the scan below like any other empty
    // vault region. Each feature that actually needs one materializes it
    // immediately before the operation that requires it
    // (PagePersistenceCoordinator.ensureReservedFolderForOperation for
    // Archive, FolderOperations.ensureReservedFolder for Daily Notes,
    // ensureClutterDirectory for .clutter) — never a blanket startup pass.
    const scanner = new VaultScanner(fileSystem);
    const scanResult = await scanner.scan(rootPath);

    // ADR-033: per-note CM6 fold ranges are read here, once — the same
    // "read a small .clutter/*.json config at boot, tolerate absence"
    // shape the tags-metadata read below already establishes. Malformed
    // content is caught and discarded inside FoldStateStore.load() itself
    // (never thrown), so a corrupted workspace.json can never block boot.
    const foldStateStore = await FoldStateStore.load(fileSystem, rootPath);

    // Same "read a small .clutter/*.json config at boot, tolerate absence"
    // shape as foldStateStore above — a sibling top-level key of the same
    // reserved file, malformed content caught and discarded inside
    // CollectionViewConfigStore.load() itself, never thrown.
    const collectionViewConfigStore = await CollectionViewConfigStore.load(
      fileSystem,
      rootPath
    );

    // Same "read a small .clutter/*.json config at boot, tolerate absence"
    // shape as collectionViewConfigStore above — a sibling top-level key of
    // the same reserved file, malformed content caught and discarded inside
    // TasksViewConfigStore.load() itself, never thrown.
    const tasksViewConfigStore = await TasksViewConfigStore.load(fileSystem, rootPath);

    // Same "read a small .clutter/*.json config at boot, tolerate absence"
    // shape as tasksViewConfigStore above — a sibling top-level key of the
    // same reserved file, malformed content caught and discarded inside
    // TagExpansionStore.load() itself, never thrown.
    const tagExpansionStore = await TagExpansionStore.load(fileSystem, rootPath);

    // ADR-035: the last session's workspace state — same tolerant
    // "read a .clutter/workspace.json key once at boot" shape as the
    // stores above. Only loaded here; seeding happens once the Vault is
    // attached (below) and restoring the active view happens in open().
    const workspaceSessionStore = await WorkspaceSessionStore.load(fileSystem, rootPath);

    // Tag definitions (`.clutter/tags.json`) are loaded by their one owner,
    // TagMetadataStore — tolerantly: a missing file is "no definitions" and a
    // corrupt one is backed up and treated as empty, so this can never fail
    // the vault open. The same store instance is what TagOperations writes
    // through and what Sync reloads from on an external edit.
    const tagMetadataStore = new TagMetadataStore(fileSystem, rootPath);
    const tagMetadata = await tagMetadataStore.load();

    const builder = new VaultBuilder(new UuidGenerator());
    const { vault, reassignedPagePaths, reassignedFolderPaths } = builder.build(
      scanResult,
      tagMetadata
    );

    // A genuine duplicate id discovered during the initial scan was already
    // given a fresh id in-memory (VaultBuilder); repair the duplicate
    // file's own persisted frontmatter to match, the same way archive
    // metadata is repaired below — Ingest itself never writes to disk.
    for (const path of reassignedPagePaths) {
      const page = vault.getPageByPath(path);

      if (!page) {
        continue;
      }

      await persistSyncedPageDocument(
        {
          vault,
          fileSystem,
          serializer: new FrontmatterSerializer(),
          parser: new FrontmatterParser(),
          rebuilder: new PageRebuilder(),
        },
        page,
        page.source.markdown
      );
    }

    // Same repair, for a genuine duplicate folder id — written only when a
    // .folder.md already exists (see VaultSyncService's identical guard);
    // never manufactures one for a folder that never had it.
    const folderFrontmatterSerializer = new FrontmatterSerializer();

    for (const path of reassignedFolderPaths) {
      const folder = vault.getFolderByPath(path);
      const folderMetadataPath = `${path}/.folder.md`;

      if (!folder || !(await fileSystem.exists(folderMetadataPath))) {
        continue;
      }

      await fileSystem.writeFile(
        folderMetadataPath,
        folderFrontmatterSerializer.serializeFolderDocument(folder)
      );
    }

    const reconcileDeps = {
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    };
    await reconcileVaultArchiveMetadata(reconcileDeps);
    // ADR-041: same startup pass for the template marker (moves made while the app was closed).
    await reconcileVaultTemplateMetadata(reconcileDeps);

    const application = new Application(
      vault,
      fileSystem,
      selfWriteRegistry,
      runningInTauri ? localCoverImageUrlResolver : browserCoverImageUrlResolver,
      foldStateStore,
      collectionViewConfigStore,
      tasksViewConfigStore,
      tagExpansionStore,
      workspaceSessionStore,
      tagMetadataStore
    );

    application.rootPath = rootPath;

    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    application.attachVault(vault, pageCreator, dailyNotes, rawFileSystem, normalizeMarkdownForSave);

    // ADR-035 §7 step 5: restore the persisted sidebar chrome into its
    // runtime owners before anything renders. Pure in-memory setter calls;
    // nothing is persisted yet (the store only attaches at the end of
    // open()). Collapsed folders no longer in the Vault are skipped.
    workspaceSessionStore.seed(
      application.workspace,
      application.dailyNotesSidebarState,
      (folderId) => vault.getFolder(folderId) !== undefined
    );

    // ADR-017/ADR-019: today's note is no longer created through the Gate,
    // and no directory is scaffolded for it, here. open() below resolves
    // it — the real page if the scan found one, or an unpersisted draft at
    // its deterministic path otherwise — never a boot-time write.
    // dailyNotes.ensurePage() (the Gate-writing method ADR-017 replaced)
    // and ensureDirectoryForToday() (the scaffolding ADR-019 replaced) are
    // both retired.

    return application;
  }

  constructor(
    vault: Vault,
    fileSystem: VaultFileSystem,
    selfWriteRegistry: SelfWriteRegistry,
    coverImageUrlResolver: CoverImageUrlResolver = localCoverImageUrlResolver,
    // Defaults to an empty, non-persisting store for the many existing
    // tests that construct Application directly without exercising fold
    // state (ADR-033) — real boot always passes a loaded store from
    // bootstrap() below.
    foldStateStore: FoldStateStore = FoldStateStore.empty(fileSystem, ''),
    // Same default-to-empty-store reasoning as foldStateStore above, for
    // the many existing tests that construct Application directly without
    // exercising collection-view persistence.
    collectionViewConfigStore: CollectionViewConfigStore = CollectionViewConfigStore.empty(
      fileSystem,
      ''
    ),
    // Same default-to-empty-store reasoning as collectionViewConfigStore
    // above, for the many existing tests that construct Application
    // directly without exercising Tasks-view persistence.
    tasksViewConfigStore: TasksViewConfigStore = TasksViewConfigStore.empty(fileSystem, ''),
    // Same default-to-empty-store reasoning as tasksViewConfigStore above,
    // for the many existing tests that construct Application directly
    // without exercising Tags-sidebar expansion persistence.
    tagExpansionStore: TagExpansionStore = TagExpansionStore.empty(fileSystem, ''),
    // Same default-to-empty-store reasoning, for tests that construct
    // Application directly without exercising session persistence.
    workspaceSessionStore: WorkspaceSessionStore = WorkspaceSessionStore.empty(fileSystem, ''),
    // Same default reasoning, for tests that construct Application directly
    // without exercising tag-definition persistence.
    tagMetadataStore: TagMetadataStore = new TagMetadataStore(fileSystem, '')
  ) {
    this.vault = vault;
    // Constructed once, here, per ARCHITECTURE_RULES.md rule 6 — UI reads
    // through this shared instance via props, never by constructing its
    // own VaultQuery(vault) locally.
    this.query = new VaultQuery(vault);
    this.fileSystem = fileSystem;
    this.coverImageUrlResolver = coverImageUrlResolver;
    this.selfWriteRegistry = selfWriteRegistry;
    this.foldStateStore = foldStateStore;
    this.collectionViewConfigStore = collectionViewConfigStore;
    this.tasksViewConfigStore = tasksViewConfigStore;
    this.tagExpansionStore = tagExpansionStore;
    this.workspaceSessionStore = workspaceSessionStore;
    this.tagMetadataStore = tagMetadataStore;
    this.workspace = new Workspace();
    this.dailyNotesSidebarState = new DailyNotesSidebarState();
    this.documentRegistry = new DocumentRegistry();
    this.saveCoordinator = new SaveCoordinator();
  }

  /**
   * Constructs every subsystem that needs a live Vault. Called once,
   * internally, at the end of bootstrap() — not by AppShell — since
   * bootstrap() needs the fully-attached Gate before it can ensure today's
   * daily note through it. Kept as its own method, matching the frozen
   * spec's public shape, so the two construction phases stay a named,
   * testable seam rather than one undifferentiated block.
   */
  public attachVault(
    vault: Vault,
    pageCreator: PageCreator,
    dailyNoteService: DailyNoteService,
    // ADR-028: Duplicate's raw filesystem copy must be observed by the
    // watcher, not suppressed as a self-write, so it needs the raw
    // VaultFileSystem — never `this.fileSystem` (the self-write-aware
    // wrapper every other collaborator here writes through). Defaults to
    // `this.fileSystem` only so existing attachVault() call sites in
    // tests, which don't exercise duplicate() and construct Application
    // with a single unwrapped fake, are unaffected.
    rawFileSystem: VaultFileSystem = this.fileSystem,
    // See `bootstrap()`'s own doc comment on this same parameter, and
    // `PageOperations`'s constructor doc comment for why it's threaded
    // through as an opaque function rather than constructed here.
    normalizeMarkdownForSave?: (markdown: string) => string
  ): void {
    const moveService = new MoveService(vault, this.fileSystem);
    const duplicator = new VaultEntryDuplicator(rawFileSystem);

    // Single instance shared by PageOperations for both edit-save and
    // structural mutations, so every write to a given page is serialized
    // through the same per-page queue.
    const frontmatterSerializer = new FrontmatterSerializer();
    this.resourceArchiveStore = new ResourceArchiveMetadataStore(this.fileSystem, vault.root);
    const persistenceCoordinator = new PagePersistenceCoordinator(
      this.fileSystem,
      vault,
      frontmatterSerializer,
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService,
      this.resourceArchiveStore
    );
    // The resource-scoped counterpart to PageOperations/FolderOperations —
    // needs only the Gate itself (rename-resource/archive-resource/
    // restore-resource are already fully self-contained there, per Step 4),
    // so it has no construction-order dependency on anything below.
    this.resourceOperations = new ResourceOperations(persistenceCoordinator);

    // Constructed before PageOperations: PageOperations' Daily Note persist
    // path (DailyNoteService.ensureFolderChain) needs a real FolderOperations
    // to materialize missing year/month folders — the same instance
    // NavigationRouter already depends on below, not a second one.
    //
    // prepareNavigation resolves this.pageOperations lazily (via `this`,
    // not a captured local) — FolderOperations is constructed before
    // PageOperations exists, the same construction-order constraint
    // SaveCoordinator's timer callback already works around (M5). The
    // closure itself is a bare forward with no decision in it — the
    // actual "what should happen before navigation" logic lives in
    // PageOperations.flushActivePage(), not here (spec §11's own
    // invariant against business logic in the Composition Root).
    this.folderOperations = new FolderOperations(
      vault,
      this.workspace,
      persistenceCoordinator,
      new FolderPathResolver(vault),
      new FolderCreator(new UuidGenerator()),
      () => this.pageOperations.flushActivePage(),
      this.documentRegistry,
      this.saveCoordinator,
      // ADR-025's fallback hook, shared verbatim with PageOperations below —
      // post-delete-navigation consistency fix: the same closure, not a
      // second implementation of "what's the fallback page."
      () => {
        void this.openFallbackPage();
      },
      (pageIds) => this.pageOperations.flushPagesBeforeArchive(pageIds)
    );
    this.pageOperations = new PageOperations(
      vault,
      this.workspace,
      this.documentRegistry,
      this.saveCoordinator,
      persistenceCoordinator,
      new PagePathResolver(vault),
      pageCreator,
      this.folderOperations,
      dailyNoteService,
      // ADR-025: same lazy-`this`-closure shape as FolderOperations'
      // prepareNavigation hook above — PageOperations is constructed
      // before openFallbackPage() has any reason to exist as anything but
      // a method on `this`, and the closure itself decides nothing (the
      // fallback-page policy lives entirely in openFallbackPage() below).
      () => {
        void this.openFallbackPage();
      },
      duplicator,
      normalizeMarkdownForSave
    );
    this.navigation = new NavigationRouter(
      this.folderOperations,
      this.pageOperations,
      vault,
      this.workspace
    );
    // ADR-031: task mutation routes through PageOperations.mutateBody(),
    // which is what decides (per-page) whether the write targets an open
    // DocumentSession or the Gate's existing 'save' kind — TaskOperations
    // itself no longer touches Vault or the Gate directly.
    this.taskOperations = new TaskOperations(this.pageOperations);
    // Not Gate-backed, deliberately — tag definitions are application
    // configuration (.clutter/tags.json), not Vault domain content, so they
    // are outside the Persistence Gate's scope (ARCHITECTURE_RULES.md rule
    // 2). TagMetadataStore is the single reader/writer of that file;
    // TagOperations writes definitions through it and edits notes only
    // through PageOperations.
    this.tagOperations = new TagOperations(
      vault,
      this.tagMetadataStore,
      this.fileSystem,
      this.pageOperations,
      this.collectionViewConfigStore,
      this.tagExpansionStore
    );
    // ADR-020: constructed after query/workspace/pageOperations all exist
    // above — the projection reconciling Vault (Durable) with
    // PageOperations/DocumentEditing (Committed) state. No production
    // consumer yet; this milestone only wires its lifecycle.
    this.effectivePageState = new EffectivePageState(
      vault,
      this.query,
      this.pageOperations,
      this.workspace
    );
    // ADR-023: the read-side classification layer — for a page/folder plus
    // a named product concept (Notes, Daily Notes, a system folder,
    // Archive), the one place that decides membership. Constructed after
    // query/effectivePageState, its only inputs. Workspace-folder
    // membership (FolderTree, toCollectionPageModel) is its first migrated
    // consumer (Phase 2 of the ADR's rollout).
    this.membershipSelector = new MembershipSelector(
      vault,
      this.query,
      this.effectivePageState
    );
    this.fileSystemWatcher = isTauri()
      ? new LocalFileSystemWatcher()
      : new BrowserFileSystemWatcher();

    // VaultSyncService subscribes to the self-write-aware wrapper, not the
    // raw watcher, so it never sees an echo of a write PagePersistenceCoordinator
    // just made through the equally-wrapped `fileSystem` above. The raw
    // watcher itself is still what owns the Tauri subscription/start/stop
    // lifecycle below.
    const syncWatcher = new SelfWriteAwareWatcher(
      this.fileSystemWatcher,
      this.selfWriteRegistry
    );
    this.vaultSyncService = new VaultSyncService(
      vault,
      this.fileSystem,
      syncWatcher,
      this.documentRegistry,
      frontmatterSerializer,
      new UuidGenerator(),
      this.tagMetadataStore
    );

    // Recovers from an external deletion (Sync's handleDeleted, or any
    // other Vault mutation) removing the page/folder Workspace currently
    // has active — e.g. deleting the open Archive folder, or any other
    // folder/note, out from under the app in Finder. VaultSyncService
    // stays filesystem->Vault only (no Workspace/navigation knowledge) and
    // Workspace stays Vault-oblivious (no Vault dependency); this is the
    // one Application-owned seam that already holds both, reusing the
    // same close()-then-fallback-if-empty shape PageOperations.delete()/
    // FolderOperations.delete() already use, verbatim, keyed only on "does
    // the active id still exist" — no per-folder or Archive-specific
    // branch. Registered last, after every Vault mutation that happens
    // during boot/scan has already settled and before Workspace has any
    // active id (open() runs after attachVault() returns), so it cannot
    // observe a stale id and redirect before a real selection exists.
    //
    // Loops rather than checking once: Workspace.closePage()'s own
    // fallback selects the previous open tab from openPageIds without any
    // Vault knowledge (Workspace stays Vault-oblivious by design), so that
    // selection can itself be a page the very same Vault mutation/cascade
    // also removed (e.g. two open tabs deleted together by one external
    // folder delete). Each iteration either closes a dangling page/folder
    // — which strictly shrinks openPageIds, guaranteeing termination — or
    // finds the current activeView already valid and stops. Only once the
    // loop settles on a genuinely valid (or empty) activeView does it fall
    // through to openFallbackPage(), so PageHost never renders an id this
    // reconciliation pass already knows is gone.
    //
    // A page "exists" here if it's either a real Vault page or a live
    // draft (ADR-017) — a draft has no Vault entry by design, so an
    // unrelated Vault mutation (any other page's save, any folder change)
    // must not be read as "the active draft is gone." Folders have no
    // draft concept (spec §7), so activeFolderId is checked against Vault
    // alone.
    this.workspaceVaultReconciliationUnsubscribe = vault.subscribe(() => {
      for (;;) {
        const { activePageId, activeFolderId } = this.workspace;

        if (
          activePageId &&
          !vault.getPage(activePageId) &&
          !this.pageOperations.getDraft(activePageId)
        ) {
          this.workspace.closePage(activePageId);
          continue;
        }

        if (activeFolderId && !vault.getFolder(activeFolderId)) {
          this.workspace.closeFolder(activeFolderId);
          continue;
        }

        break;
      }

      if (!this.workspace.activeView) {
        void this.openFallbackPage();
      }
    });

    // Optional, dev-only: exposes window.__clutter_devtools for e2e tests.
    // No-op unless import.meta.env.DEV && VITE_DEVTOOLS=true (see attachDevTools).
    attachDevTools(this);
  }

  /**
   * Starts the filesystem watcher, then decides what shows at boot — the
   * startup-strategy seam ADR-019/ADR-025 named, with its first non-default
   * branch (ADR-035 §7): restore the last session's active view if it is
   * still valid against the Vault, otherwise open the fallback page
   * exactly as before. Only once that has completed does
   * WorkspaceSessionStore start observing, so neither the seeded state nor
   * the fallback navigation can overwrite the saved session before it was
   * restored.
   */
  public async open(): Promise<void> {
    await registerVaultAssetScope(this.rootPath);
    await this.fileSystemWatcher.start(this.rootPath);

    await this.restoreLastSessionOrFallback();

    this.workspaceSessionStore.attach({
      workspace: this.workspace,
      dailyNotesSidebarState: this.dailyNotesSidebarState,
      // ADR-035 §6: a draft (no Vault entry) never survives a restart, so
      // it's never written as restorable.
      isPersistableView: (view) => view.type !== 'page' || this.vault.getPage(view.id) !== undefined,
    });
  }

  /**
   * Restore-or-fallback, never throwing: a failure while opening either
   * one is logged and boot continues, the same outcome the previous
   * fire-and-forget `void this.openFallbackPage()` had.
   */
  private async restoreLastSessionOrFallback(): Promise<void> {
    try {
      const savedView = this.workspaceSessionStore.restoredSession.activeView;
      const restored = savedView ? await this.navigation.restore(savedView) : false;

      if (!restored) {
        await this.openFallbackPage();
      }
    } catch (error) {
      console.error('Application: failed to open the startup page.', error);
    }
  }

  /**
   * The application's fallback-page policy (ADR-025, following up on the
   * seam ADR-019 named): currently always today's Daily Note, opening the
   * real Vault page if one exists, otherwise an unpersisted draft at its
   * deterministic path (ADR-017 §7/Decision item 7). The path is computed
   * here, not cached (ADR-019) — no directory is scaffolded for it ahead
   * of time; PageOperations.openAtPath()'s draft-promotion path
   * materializes the Daily Note's folder chain on first save, via
   * DailyNoteService.ensureFolderChain. Never writes through the Gate
   * itself.
   *
   * Two callers: open() at boot, and PageOperations.delete() (via the
   * constructor-injected callback in attachVault()) when deleting the
   * active page leaves the workspace with no page/folder to fall back to.
   * Neither caller — nor PageOperations itself — knows what the fallback
   * page is; that decision lives only here, matching ADR-019's framing of
   * this as the Composition Root's one documented seam for a future
   * startup-strategy choice (Open Today's Note / Restore Last Session /
   * Open Empty Workspace) — not implemented yet, so today's Daily Note is
   * still the only branch.
   */
  private async openFallbackPage(): Promise<void> {
    const todayNotePath = DailyNotePath.absoluteFrom(this.vault.root, new Date());
    const todayPage = this.vault.getPageByPath(todayNotePath);

    // Awaited so open() (ADR-035) only starts session persistence once the
    // fallback is actually active; the delete-time callers still invoke
    // this fire-and-forget, exactly as before.
    if (todayPage) {
      await this.pageOperations.open(todayPage.id);
      return;
    }

    await this.pageOperations.openAtPath(todayNotePath, {
      type: 'daily-note',
    });
  }

  /**
   * Imports an external file into the vault's Assets — into `Assets/` itself, or into the folder
   * inside it that the Assets page is showing (`destinationFolderPath`, absolute) — and registers it
   * with the Vault through Sync, like any imported asset. Returns the vault-relative reference.
   */
  public async importAsset(sourceAbsolutePath: string, destinationFolderPath?: string): Promise<string> {
    // Nothing is added to an archived folder.
    const destinationFolder = destinationFolderPath ? this.vault.getFolderByPath(destinationFolderPath) : undefined;

    if (destinationFolder && this.vault.isFolderEffectivelyArchived(destinationFolder.id)) {
      throw new Error(`Cannot add to an archived folder: ${destinationFolder.id}`);
    }

    const reference = await importAsset(this.fileSystem, this.rootPath, sourceAbsolutePath, destinationFolderPath);

    await this.vaultSyncService.reconcileKnownPath(`${this.rootPath}/${reference}`);

    return reference;
  }

  /**
   * Copies an external image into `{vaultRoot}/Assets/` and returns the
   * vault-relative reference for frontmatter storage. Non-Gate write —
   * same carve-out as TagOperations' `.clutter/*` writes.
   *
   * The copy is reconciled into the Vault before this resolves (ADR-040)
   * instead of waiting on the file watcher: a copy produces a single OS
   * `created` event, and `SelfWriteAwareFileSystem.copyFile` registers that
   * very event as a self-write to suppress, so the watcher never told Sync
   * about an uploaded asset and it stayed invisible until the next scan.
   */
  public async importCoverAsset(sourceAbsolutePath: string): Promise<string> {
    const reference = await importCoverAsset(this.fileSystem, this.rootPath, sourceAbsolutePath);

    await this.vaultSyncService.reconcileKnownPath(`${this.rootPath}/${reference}`);

    return reference;
  }

  /**
   * "Save to vault" for a remote image — the whole pipeline, once per URL at a
   * time (a second click while one is running joins it instead of starting
   * another, and clicking again after it finished just reports zero uses left):
   *
   *   download + write to Assets/  (importRemoteAsset; named after the display
   *   text typed in the notes, and reusing a byte-identical copy already there)
   *     -> reconcile the file into the Vault through Sync (the Vault must know
   *        it before anything points at it, or note images can't resolve)
   *     -> rewrite every use of the URL (rewriteRemoteAssetReferences, through
   *        PageOperations/FolderOperations like any other edit).
   *
   * Rejects without rewriting anything if the download, validation, write or
   * registration fails. A rewrite that fails for some uses does not reject; it
   * is reported in the result (`failed`, `skippedArchived`, `skippedHidden`).
   * There is no undo: the saved file stays whatever the rewrites did, and the
   * result says exactly which uses changed.
   */
  public saveRemoteImageToVault(url: string): Promise<SaveToVaultResult> {
    const inFlight = this.remoteImageSaves.get(url);

    if (inFlight) {
      return inFlight;
    }

    const isPageArchived = (page: Page): boolean => this.vault.isPageEffectivelyArchived(page);
    const currentMarkdown = (page: Page): string =>
      this.documentRegistry.get(page.id)?.currentRevision.markdown ?? page.source.markdown;

    const run = saveRemoteImage({
      save: () =>
        importRemoteAsset(this.fileSystem, this.rootPath, url, fetchRemoteAsset, {
          displayName: findRemoteImageDisplayName(url, this.vault.pages(), currentMarkdown, isPageArchived),
        }),
      register: async (absolutePath) => {
        await this.vaultSyncService.reconcileKnownPath(absolutePath);

        if (!this.vault.getResourceByPath(absolutePath)) {
          throw new Error(
            'The image was saved, but the vault did not pick it up, so nothing was changed.'
          );
        }
      },
      rewrite: ({ reference }) =>
        rewriteRemoteAssetReferences({
          url,
          reference,
          pages: this.vault.pages(),
          folders: this.vault.folders(),
          currentMarkdown,
          isPageArchived,
          isFolderArchived: (folder) => this.membershipSelector.isEffectivelyArchived(folder.id),
          pageWriter: this.pageOperations,
          folderWriter: this.folderOperations,
        }),
    }).finally(() => this.remoteImageSaves.delete(url));

    this.remoteImageSaves.set(url, run);

    return run;
  }

  /**
   * Turns a persisted cover reference into a value suitable for `<img src>`.
   * External URLs pass through unchanged; vault-local `Assets/…` references
   * are resolved through the injected platform CoverImageUrlResolver.
   */
  public resolveCoverImageForDisplay(cover: string | null): string | null {
    if (cover === null) {
      return null;
    }

    if (cover.startsWith('http://') || cover.startsWith('https://')) {
      return cover;
    }

    // Any vault-relative reference (`Assets/…`, or another folder's image
    // picked from the Asset tab) — not an absolute path or a URL scheme.
    if (!cover.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(cover)) {
      return this.coverImageUrlResolver.toLoadableUrl(`${this.rootPath}/${cover}`);
    }

    return cover;
  }

  /**
   * Turns a VaultResource's own absolute path into a value suitable for
   * `<img src>` — the sidebar-resource counterpart to
   * resolveCoverImageForDisplay above, simpler because VaultResource.path
   * is always already an absolute vault path (unlike a persisted `cover`
   * reference, which may be a relative `Assets/…` string or an external
   * URL). Reuses the same injected coverImageUrlResolver instance — no new
   * resolver, no new wiring, and registerVaultAssetScope already scopes
   * the whole vault root, not just Assets/, so this works unmodified for a
   * resource anywhere in the vault.
   */
  public resolveResourceImageUrl(path: string): string {
    return this.coverImageUrlResolver.toLoadableUrl(path);
  }

  /**
   * Tears down the runtime graph this composition root created.
   *
   * Flushes every dirty or in-flight page first — while every session is
   * still live — then stops accepting filesystem events so no partially-
   * destroyed service can react to a late-arriving change, then disposes
   * subscriptions, then cancels timers and releases remaining state.
   * flushAll() must run before everything else here, not after: once
   * DocumentRegistry.clear() disposes every session (M1/M4), further
   * commit()/beginSave()/markSaved()/markSaveFailed() calls become inert
   * and there would be nothing left to flush.
   *
   * This is the orderly-shutdown entry point (autosave-execution-model.md
   * §7) — it knows nothing about *why* it's being called (window close,
   * app quit, a future vault-switch flow) or how that event is detected;
   * that's the caller's job (see AppShell.tsx's Tauri close-request
   * handling), kept deliberately outside this class so Application never
   * needs to import a platform/window API.
   *
   * Idempotent: safe to call more than once (React Strict Mode, repeated
   * unmounts, or an eventual vault-switch flow may all call this).
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    await this.pageOperations.flushAll(SHUTDOWN_FLUSH_TIMEOUT_MS);
    await this.folderOperations.flushAll(SHUTDOWN_FLUSH_TIMEOUT_MS);
    // ADR-035: after the page flush above, so a draft promoted by that
    // flush is already a real page and is written as restorable.
    await this.workspaceSessionStore.flush();
    this.workspaceSessionStore.dispose();
    await this.fileSystemWatcher.stop();
    this.vaultSyncService.dispose();
    // Cancel every armed autosave timer before dropping the sessions they
    // belong to — documentRegistry.clear() disposes each session but has
    // no concept of timers, and PageOperations.close()/delete() (the
    // usual place timers are cancelled) is never called for this
    // whole-vault teardown path. Found during M5's pre-implementation
    // audit (autosave-execution-model.md §5's "cleared at the same moment
    // the session is marked Disposed" applies here too, not just to the
    // single-session close() path).
    this.saveCoordinator.cancelAllTimers();
    // ADR-020 §5: must run before documentRegistry.clear() below — the
    // projection holds live DocumentSession subscriptions, and clear()
    // disposes every session, after which further interaction with them
    // is inert. Same ordering constraint flushAll() documents for itself
    // above, applied to a second consumer of the same resource.
    this.effectivePageState.dispose();
    this.workspaceVaultReconciliationUnsubscribe();
    this.documentRegistry.clear();
  }
}
