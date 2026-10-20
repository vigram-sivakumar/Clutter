import { isTauri } from '@tauri-apps/api/core';
import { isFolderConfirmedMissing, probeSpaceFolder } from '../vault/providers/probeSpaceFolder';
import { VaultRootMissingError } from '../vault/providers/VaultRootMissingError';
import { isArchiveRetentionElapsed } from './archive/archiveRetention';
import { flushWorkspaceStateWrites } from '../vault/initialize/workspaceStateFile';
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
import { ParsedNoteCache, type ParsedNoteCacheBackend } from '../vault/persistence/parsedNoteCache';
import { TauriParsedNoteCacheBackend } from '../vault/providers/TauriParsedNoteCacheBackend';
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
import { ReferencesDisplayStore } from './references/ReferencesDisplayStore';
import { TemplateUsageStore } from './templates/TemplateUsageStore';
import { PreferredTemplatesStore } from './templates/PreferredTemplatesStore';
import { DailyNotesSidebarState } from './daily-notes/DailyNotesSidebarState';
import { WorkspaceSessionStore, type SidebarTab } from './workspace/WorkspaceSessionStore';
import { SpaceProfileStore, type SpaceProfile } from './space/SpaceProfileStore';
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
import { classifySupportedResourceFile } from '../vault/ingest/SupportedResourceKind';
import { isClutterInternalPath } from '../vault/initialize/ReservedResources';
import { findCoverCredit } from './page/coverCredit';
import { isUnsplashImageUrl } from '../integrations/unsplash/unsplashAttribution';
import { trackPhotoDownload } from '../integrations/unsplash/UnsplashApi';
import { importAsset, importAssetBytes, pastedAssetFileName } from '../vault/asset/importAsset';
import type { Page } from '../vault/models/Page';
import type { CoverCredit } from '../vault/models/PageMetadata';
import { findRemoteImageDisplayName } from './asset/remoteImageDisplayName';
import { rewriteRemoteAssetReferences } from './asset/rewriteRemoteAssetReferences';
import { saveRemoteImage, type SaveToVaultResult } from './asset/saveRemoteImage';
import { importRemoteAsset } from '../vault/asset/importRemoteAsset';
import { fetchRemoteAsset } from '../vault/providers/fetchRemoteAsset';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { SelfWriteAwareFileSystem } from '../vault/providers/SelfWriteAwareFileSystem';
import { SelfWriteAwareWatcher } from '../vault/providers/SelfWriteAwareWatcher';
import { attachDevTools } from '@devtools/index';

/** A change to the open Space's avatar: an emoji, an image still outside the Space (its picked file), or `null` to remove. */
export interface SpaceProfileChange {
  readonly avatar?:
    | { readonly type: 'emoji'; readonly emoji: string }
    | { readonly type: 'image'; readonly sourcePath: string }
    | null;
}

/**
 * What `Application.open()` shows at boot (the ADR-019/025/035 startup seam): the last session's active view
 * when it is still valid, or always today's Daily Note. Either way an invalid saved view falls back to today's
 * Daily Note.
 */
export type StartupBehavior = 'last-opened-note' | 'todays-note';

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
   * When each template was last used (the inline "Start with template" suggestions rank by it), through the
   * `templateUsage` top-level key of the same `.clutter/workspace.json` — loaded once in `bootstrap()` below.
   * Not Gate-backed: application metadata, not document content (see `TemplateUsageStore`).
   */
  public readonly templateUsageStore: TemplateUsageStore;
  /** The templates the user chose as preferred (per Space, `.clutter/workspace.json`); same non-Gate posture. */
  public readonly preferredTemplatesStore: PreferredTemplatesStore;
  /**
   * Per-note References visibility/expansion (ADR-052), through the `referencesDisplay` top-level key of the
   * same `.clutter/workspace.json` — loaded once in `bootstrap()` below. Not Gate-backed and not owned by
   * `Workspace`, for the same reasons `foldStateStore` isn't (see `ReferencesDisplayStore`'s doc comment).
   */
  public readonly referencesDisplayStore: ReferencesDisplayStore;
  /**
   * Memo of `FrontmatterParser.parse` for the initial scan, persisted in the
   * application cache directory (ADR-053). Derived data, disposable: Markdown
   * stays authoritative, and every failure just means ordinary parsing.
   * Never written during startup; see `persistParsedNoteCache`.
   */
  private readonly parsedNoteCache: ParsedNoteCache;
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
  public readonly spaceProfileStore: SpaceProfileStore;
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
  // The vault's root folder was confirmed gone while this Application was open (see verifyRoot()).
  private rootLost = false;
  private readonly rootLostListeners = new Set<() => void>();
  private unsubscribeRootWatch: (() => void) | null = null;
  private pendingRootCheck: Promise<boolean> | null = null;
  /** Refuses every further write on the underlying local filesystem; null where there is none (web). */
  private sealFileSystem: (() => void) | null = null;
  /** The platform's "is this folder confirmed gone" check; replaceable only by tests. */
  private isRootConfirmedMissing: (path: string) => Promise<boolean> = isFolderConfirmedMissing;
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
    normalizeMarkdownForSave?: (markdown: string) => string,
    options: {
      /**
       * Where the parsed-note cache lives. Omitted: the native cache store
       * under Tauri and none in the web runtime. `null` disables the cache
       * entirely (every file is parsed, nothing is read or written).
       */
      parsedNoteCacheBackend?: ParsedNoteCacheBackend | null;
    } = {}
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
    } else if ((await probeSpaceFolder(rootPath)) === 'missing') {
      // Opening never creates the vault folder: a root that is gone is reported, not recreated
      // (creating a vault is an explicit user action, separate from opening one). Only a
      // *confirmed* absence lands here; a permission or scope error carries on and surfaces from
      // the scan below as before.
      throw new VaultRootMissingError(rootPath);
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
    // ADR-053. Never throws: a missing, corrupt, oversized, incompatible or
    // unavailable cache is simply an empty memo.
    const parsedNoteCache = await ParsedNoteCache.load(
      options.parsedNoteCacheBackend !== undefined
        ? options.parsedNoteCacheBackend
        : runningInTauri
          ? new TauriParsedNoteCacheBackend()
          : null,
      rootPath
    );
    const scanner = new VaultScanner(fileSystem, parsedNoteCache);
    const scanResult = await scanner.scan(rootPath);
    parsedNoteCache.logScanSummary();

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

    const templateUsageStore = await TemplateUsageStore.load(fileSystem, rootPath);

    // Same tolerant read-once shape: malformed content is discarded inside load(), never thrown.
    const preferredTemplatesStore = await PreferredTemplatesStore.load(fileSystem, rootPath);

    // ADR-052: same tolerant read-once shape — malformed content is discarded inside load(), never thrown.
    const referencesDisplayStore = await ReferencesDisplayStore.load(fileSystem, rootPath);

    // ADR-035: the last session's workspace state — same tolerant
    // "read a .clutter/workspace.json key once at boot" shape as the
    // stores above. Only loaded here; seeding happens once the Vault is
    // attached (below) and restoring the active view happens in open().
    const workspaceSessionStore = await WorkspaceSessionStore.load(fileSystem, rootPath);

    // The Space's own profile (identity, avatar): a read-only load of the `space` key — nothing is written
    // until the caller asks (`applySpaceProfile`).
    const spaceProfileStore = await SpaceProfileStore.load(fileSystem, rootPath);

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
      tagMetadataStore,
      templateUsageStore,
      referencesDisplayStore,
      parsedNoteCache,
      spaceProfileStore,
      preferredTemplatesStore
    );

    application.rootPath = rootPath;
    application.sealFileSystem =
      rawFileSystem instanceof LocalVaultProvider ? () => rawFileSystem.seal() : null;

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
    tagMetadataStore: TagMetadataStore = new TagMetadataStore(fileSystem, ''),
    // Same default reasoning, for tests that construct Application directly without exercising template usage.
    templateUsageStore: TemplateUsageStore = TemplateUsageStore.empty(fileSystem, ''),
    // Same default reasoning, for tests that construct Application directly without exercising References display.
    referencesDisplayStore: ReferencesDisplayStore = ReferencesDisplayStore.empty(fileSystem, ''),
    // Same default reasoning: tests that construct Application directly never use a parse cache.
    parsedNoteCache: ParsedNoteCache = ParsedNoteCache.disabled(),
    // Same default reasoning: tests that construct Application directly never touch the Space profile.
    spaceProfileStore: SpaceProfileStore = SpaceProfileStore.empty(fileSystem, ''),
    // Same default reasoning: tests that construct Application directly never use preferred templates.
    preferredTemplatesStore: PreferredTemplatesStore = PreferredTemplatesStore.empty(fileSystem, '')
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
    this.templateUsageStore = templateUsageStore;
    this.preferredTemplatesStore = preferredTemplatesStore;
    this.referencesDisplayStore = referencesDisplayStore;
    this.parsedNoteCache = parsedNoteCache;
    this.spaceProfileStore = spaceProfileStore;
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
      (pageIds) => this.pageOperations.flushPagesBeforeArchive(pageIds),
      // A permanently deleted template's preference goes with it; the closure decides nothing, the store
      // ignores pages that were never preferred.
      (pageIds) => this.preferredTemplatesStore.removeAll(pageIds)
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
      normalizeMarkdownForSave,
      (path) => this.fileSystem.readFile(path),
      // Same hook as FolderOperations' above, for a single page.
      (pageIds) => this.preferredTemplatesStore.removeAll(pageIds)
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

    // A deleted or moved path is a hint the vault root itself may have gone. Only a hint: the
    // watcher is not trusted to report the loss of its own root, so it just triggers the same
    // existence check the window-focus path uses. Subscribed before the sync service's own
    // subscription (made by the wrapper below) so the check starts first.
    this.unsubscribeRootWatch = this.fileSystemWatcher.subscribe((change) => {
      if (change.type === 'deleted' || change.type === 'moved') {
        void this.verifyRoot();
      }
    });

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
      // A default note folder that was deleted, archived or moved somewhere invalid goes back to Inbox.
      this.resolveDefaultNoteFolderId();

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

    // A saved default note folder that no longer exists, or is no longer a valid destination, goes back to Inbox as
    // the Space loads, not only on the next vault change.
    this.resolveDefaultNoteFolderId();

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
  public async open(options: { startup?: StartupBehavior; sidebarTab?: SidebarTab } = {}): Promise<void> {
    await registerVaultAssetScope(this.rootPath);
    await this.fileSystemWatcher.start(this.rootPath);

    // The user's configured default tab wins over the tab saved with the last session (seeded in
    // bootstrap()). Set before persistence attaches, so the saved session then records it like any change.
    if (options.sidebarTab) this.workspace.setActiveSidebarTab(options.sidebarTab);

    await this.restoreLastSessionOrFallback(options.startup ?? 'last-opened-note');

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
  private async restoreLastSessionOrFallback(startup: StartupBehavior): Promise<void> {
    try {
      // 'todays-note' skips the restore branch: the saved view is simply not consulted, so the fallback
      // (today's Daily Note) is the startup page. The saved session itself is untouched and keeps being
      // persisted from here on.
      const savedView =
        startup === 'last-opened-note' ? this.workspaceSessionStore.restoredSession.activeView : null;
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
   * Stores a file from the clipboard (an image or PDF, as bytes) in `Assets/` and registers it with the
   * Vault like any imported asset. Returns the vault-relative reference a Markdown embed uses.
   */
  public async importPastedAsset(name: string, mimeType: string, bytes: Uint8Array): Promise<string> {
    const reference = await importAssetBytes(
      this.fileSystem,
      this.rootPath,
      pastedAssetFileName(name, mimeType),
      bytes
    );

    await this.vaultSyncService.reconcileKnownPath(`${this.rootPath}/${reference}`);

    return reference;
  }

  /**
   * The open Space's profile, or `null` while it has no identity yet (a Space that predates identities,
   * or a folder that has never been opened by Clutter).
   */
  public get spaceProfile(): SpaceProfile | null {
    return this.spaceProfileStore.profile;
  }

  /** Where covers go on notes of this Space that have no saved position — Right until the Space chose otherwise. */
  public get defaultCoverPosition(): 'side' | 'above' {
    return this.spaceProfileStore.profile?.defaultCoverPosition ?? 'side';
  }

  /** Whether this Space deletes archived items after 30 days. Off unless the Space's own saved setting is on. */
  public get autoDeleteArchived(): boolean {
    return this.spaceProfileStore.profile?.autoDeleteArchived === true;
  }

  /**
   * Called when a Space setting (a template choice, the default note location, cover position, automatic cleanup)
   * could not be written to `.clutter/workspace.json`. The setting still holds for this session; the caller says
   * it was not saved. Returns the unsubscribe.
   */
  public subscribeSettingsWriteError(listener: (error: unknown) => void): () => void {
    const unsubscribers = [
      this.spaceProfileStore.subscribeWriteError(listener),
      this.preferredTemplatesStore.subscribeWriteError(listener),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  /**
   * The scheduled cleanup entry point: runs `purgeExpiredArchivedItems` only when this Space has the setting on.
   * The rule that cleanup never runs for a Space that did not turn it on lives here, with the setting, not with
   * whoever schedules it.
   */
  public async runArchiveCleanupIfEnabled(now: Date = new Date()): Promise<number> {
    return this.autoDeleteArchived ? this.purgeExpiredArchivedItems(now) : 0;
  }

  /** The cleanup run in progress, so a second request joins it instead of racing it. */
  private archiveCleanupInFlight: Promise<number> | undefined;

  /**
   * Permanently deletes the archived items that have been archived for 30 calendar days (`archiveRetention.ts`),
   * and returns how many it deleted. Whether to run it at all is the caller's decision — the app-wide "Automatically
   * delete archived items" setting is read by whoever schedules this, never here.
   *
   * Reuses the permanent deletes the Archive's own Delete uses (`PageOperations.delete`, `FolderOperations.delete`,
   * `ResourceOperations.deleteResource`), so every guard they have applies and there is no second deletion path. It
   * only considers an item sitting directly in `Archive/` (ADR-026: what is deeper goes with its folder, whose own
   * date decides) and goes by the `archivedAt` Clutter recorded when it archived it. An item with no usable date —
   * put there from outside Clutter, or an unreadable record — is left alone, and so is an archived asset an active
   * note still embeds. A restored item has left `Archive/` and no longer matches; a re-archived one has a new date.
   *
   * Safe to repeat: what is already gone is no longer a candidate. One item that cannot be deleted is left in place
   * and the rest continue; a missing vault root ends the run (nothing is recreated). Never throws.
   */
  public purgeExpiredArchivedItems(now: Date = new Date()): Promise<number> {
    this.archiveCleanupInFlight ??= this.runArchiveCleanup(now).finally(() => {
      this.archiveCleanupInFlight = undefined;
    });

    return this.archiveCleanupInFlight;
  }

  private async runArchiveCleanup(now: Date): Promise<number> {
    const vault = this.vault;
    const isDue = (path: string, archivedAt: string | null | undefined): boolean =>
      vault.isDirectlyInArchive(path) && isArchiveRetentionElapsed(archivedAt, now);
    let deleted = 0;

    const attempt = async (stillDue: () => boolean, remove: () => Promise<void>): Promise<boolean> => {
      // Looked at again right before deleting: it may have been restored, moved or deleted since the list was made.
      if (!stillDue()) {
        return true;
      }

      try {
        await remove();
        deleted += 1;
        return true;
      } catch (error) {
        // The vault is gone: stop, and do not touch anything else. Any other failure leaves that one item in place.
        return !(error instanceof VaultRootMissingError);
      }
    };

    try {
      for (const folder of Array.from(vault.folders())) {
        if (!isDue(folder.path, folder.metadata.archivedAt)) continue;

        const folderId = folder.id;
        const keepGoing = await attempt(
          () => {
            const current = vault.getFolder(folderId);
            return current !== undefined && isDue(current.path, current.metadata.archivedAt);
          },
          () => this.folderOperations.delete(folderId)
        );

        if (!keepGoing) return deleted;
      }

      for (const page of Array.from(vault.pages())) {
        if (!isDue(page.path, page.metadata.archivedAt)) continue;

        const pageId = page.id;
        const keepGoing = await attempt(
          () => {
            const current = vault.getPage(pageId);
            return current !== undefined && isDue(current.path, current.metadata.archivedAt);
          },
          () => this.pageOperations.delete(pageId)
        );

        if (!keepGoing) return deleted;
      }

      const archivedResources = await this.resourceArchiveStore.read();

      for (const resource of Array.from(vault.resources())) {
        const record = archivedResources.get(resource.path);

        if (!record || !isDue(resource.path, record.archivedAt)) continue;
        if (this.isEmbeddedByActiveNote(resource.name, record.originalPath)) continue;

        const resourceId = resource.id;
        const keepGoing = await attempt(
          () => {
            const current = vault.getResource(resourceId);
            return current !== undefined && isDue(current.path, archivedResources.get(current.path)?.archivedAt);
          },
          () => this.resourceOperations.deleteResource(resourceId)
        );

        if (!keepGoing) return deleted;
      }
    } catch {
      // Reading the archive records failed: nothing more is deleted this run, and the next run tries again.
    }

    return deleted;
  }

  /** Whether any note that is not archived embeds or links the file, by its original path or its file name. */
  private isEmbeddedByActiveNote(fileName: string, originalPath: string): boolean {
    const root = `${this.vault.root}/`;
    const original = originalPath.startsWith(root) ? originalPath.slice(root.length) : originalPath;
    const reference = (target: string) => target.split(/[#|]/)[0]!.trim().replace(/^\.\//, '');
    const matches = (target: string) => {
      const value = reference(target);
      return value === original || value === fileName || value.endsWith(`/${fileName}`);
    };

    return Array.from(this.vault.pages()).some(
      (page) =>
        !this.vault.isPageEffectivelyArchived(page) &&
        (page.analysis.embeds.some((embed) => matches(embed.target)) ||
          page.analysis.links.some((link) => matches(link.target)))
    );
  }

  /**
   * The folder new notes are created in by default, or `undefined` for Inbox. The saved folder is only honoured
   * while it is still a valid destination (it exists, isn't archived or hidden, isn't a reserved folder); if it
   * isn't, the setting is put back to Inbox here, so a deleted or archived folder never lingers as the choice.
   */
  public resolveDefaultNoteFolderId(): string | undefined {
    const saved = this.spaceProfileStore.profile?.defaultNoteFolderId;

    if (saved === undefined) {
      return undefined;
    }

    if (this.membershipSelector.isNoteDestinationFolder(saved)) {
      return saved;
    }

    void this.spaceProfileStore.setDefaultNoteFolder(undefined);
    return undefined;
  }

  /**
   * Settles the open Space's own profile after the user has confirmed it: gives the Space an identity if it
   * has none (the lazy migration of a Space that predates them), and applies the avatar change — `undefined`
   * leaves the avatar as it is, `null` removes it, an emoji sets it, and an image is copied into the Space's
   * `Assets/` (the usual asset convention) and stored as that vault-relative reference, so nothing depends
   * on the original file. Only ever called for the Space that is open, never merely because it was selected.
   */
  public async applySpaceProfile(change: SpaceProfileChange = {}): Promise<SpaceProfile> {
    const { avatar } = change;
    if (avatar === undefined) {
      return this.spaceProfileStore.ensureIdentity();
    }
    if (avatar === null) {
      return this.spaceProfileStore.setAvatar(undefined);
    }
    if (avatar.type === 'emoji') {
      return this.spaceProfileStore.setAvatar(avatar);
    }
    const reference = await this.importCoverAsset(avatar.sourcePath);
    return this.spaceProfileStore.setAvatar({ type: 'image', src: reference });
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

    // Looked up before the save: the rewrite step repoints the covers that held this URL at the
    // local copy, after which the credit can no longer be found by it.
    const downloadLocation = this.unsplashDownloadLocation(url);
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
    })
      .then((result) => {
        // An explicit save is a "download" in Unsplash's terms: reported only once the user's copy
        // exists (ADR-054) — the same report the Download action makes.
        this.reportUnsplashDownload(url, downloadLocation);

        return result;
      })
      .finally(() => this.remoteImageSaves.delete(url));

    this.remoteImageSaves.set(url, run);

    return run;
  }

  private unsplashDownloadLocation(url: string): string | undefined {
    return isUnsplashImageUrl(url) ? this.findCoverCredit(url)?.downloadLocation : undefined;
  }

  /**
   * Reports a user-requested download of an Unsplash photo — "Download" and "Save to vault"
   * alike (the latter is a download into Assets) — to Unsplash's download endpoint, as its
   * API guidelines require (ADR-054). Call it once the file exists. Asynchronous, best-effort
   * and never throwing. The location is the one recorded when the photo was picked; a
   * non-Unsplash image, or an Unsplash URL with no recorded location (a cover saved before
   * ADR-054, or one pasted into a note), has none to report, and nothing is sent.
   * `knownLocation` lets a caller that looked it up earlier pass it on.
   */
  public reportUnsplashDownload(url: string, knownLocation?: string): void {
    const location = knownLocation ?? this.unsplashDownloadLocation(url);

    if (location) {
      void trackPhotoDownload(location);
    }
  }

  /**
   * The photographer credit already recorded for an exact cover URL elsewhere
   * in the vault, or null (ADR-054) — so re-choosing an existing Unsplash
   * image (Assets tab, "Set as cover") doesn't drop its credit. Never invents
   * a credit and never calls the API.
   */
  public findCoverCredit(url: string): CoverCredit | null {
    return findCoverCredit(this.vault.pages(), this.vault.folders(), url);
  }

  /**
   * Turns a persisted cover reference into a value suitable for `<img src>`.
   * External URLs pass through unchanged; vault-local `Assets/…` references
   * are resolved through the injected platform CoverImageUrlResolver.
   *
   * A vault-local reference to a file the Vault indexes (images and PDFs outside
   * `.clutter`) resolves only while the Vault holds that file as a resource;
   * otherwise the result is `null` (no cover to draw). For those files the Vault
   * is the authority on existence — a webview's own image cache is not: Tauri's
   * asset protocol sends no cache validators, so the webview keeps serving a URL
   * it has already loaded after the file behind it is deleted, and a successful
   * load proves nothing. The stored reference is left as written, so the cover
   * returns by itself if the file does (restore, re-add). Every Vault change
   * re-renders its readers (useVault), which is what makes a permanent delete
   * take effect without a per-render disk check.
   *
   * A reference the Vault would never index (another extension, a `.clutter`
   * file, a path with `.`/`..`/empty segments) cannot be judged by it: it was
   * never in the index, so absence says nothing. Those keep resolving through the
   * loader as before, and carry the loader's own caching behavior.
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
      const absolutePath = `${this.rootPath}/${cover}`;

      // Case-insensitive because the disk the loader reads is, on the platforms this runs on.
      if (
        this.isIndexedVaultReference(cover, absolutePath) &&
        !this.vault.getResourceByPathCaseInsensitive(absolutePath)
      ) {
        return null;
      }

      return this.coverImageUrlResolver.toLoadableUrl(absolutePath);
    }

    return cover;
  }

  /**
   * Whether the Vault would have indexed the file this vault-relative reference names — the same
   * test the scan and Sync apply (a supported image/PDF extension, outside `.clutter`), plus a
   * canonical path: the index is keyed by exact paths, so `./x.png` or `a/../x.png` can't be
   * looked up in it even though the disk resolves them.
   */
  private isIndexedVaultReference(cover: string, absolutePath: string): boolean {
    const canonical = cover.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

    return (
      canonical &&
      classifySupportedResourceFile(cover) !== null &&
      !isClutterInternalPath(this.rootPath, absolutePath)
    );
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
  /**
   * Writes the parsed-note cache if the scan changed it (ADR-053). The caller
   * schedules this after the workspace has painted (AppShell), so it never
   * competes with window reveal, usability, the Gate or shutdown. Best effort:
   * never throws, never touches the Vault or any Markdown file.
   */
  public async persistParsedNoteCache(): Promise<void> {
    if (this.closed) {
      return;
    }
    const report = await this.parsedNoteCache.persist();
    if (report.writeStatus === 'failed' || report.writeStatus === 'skipped-oversize') {
      console.warn('[parsed-note-cache] not written:', report);
    }
  }

  /**
   * Subscribes to the loss of this vault's root folder (see verifyRoot()). Fires at most once, after
   * which this Application is unusable: its writes are refused and the caller is expected to close()
   * it and stop showing it. Returns the unsubscribe function.
   */
  public onRootLost(listener: () => void): () => void {
    this.rootLostListeners.add(listener);
    return () => {
      this.rootLostListeners.delete(listener);
    };
  }

  public isRootLost(): boolean {
    return this.rootLost;
  }

  /**
   * Confirms the vault's root folder still exists, and if it is confirmed gone treats the vault as lost
   * (see handleRootLost). Cheap (one `stat`), concurrent calls share one check, and only a confirmed
   * absence counts: a permission or scope failure, or any other I/O error, leaves the Application as
   * it is for the existing error paths. Called by the shell when the window regains focus and by the
   * watcher hint above — never polled. A no-op in the web runtime.
   */
  public async verifyRoot(): Promise<void> {
    if (this.closed || this.rootLost) {
      return;
    }

    this.pendingRootCheck ??= this.isRootConfirmedMissing(this.rootPath).finally(() => {
      this.pendingRootCheck = null;
    });

    if (await this.pendingRootCheck) {
      this.handleRootLost();
    }
  }

  /**
   * The root is gone. Everything that could still write for this vault is neutralised *before* anyone
   * is told: the filesystem is sealed (a queued, in-flight or debounced write is refused, and cannot
   * land even if the folder reappears), the session and autosave timers and the sync service stop, and
   * the parsed-note cache write is dropped. The in-memory vault is never persisted again. close()
   * afterwards skips every flush.
   */
  private handleRootLost(): void {
    if (this.closed || this.rootLost) {
      return;
    }

    this.rootLost = true;
    this.sealFileSystem?.();
    this.parsedNoteCache.cancel();
    this.workspaceSessionStore.dispose();
    this.saveCoordinator.cancelAllTimers();
    this.vaultSyncService.dispose();

    for (const listener of [...this.rootLostListeners]) {
      listener();
    }
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.rootLostListeners.clear();
    this.unsubscribeRootWatch?.();
    this.unsubscribeRootWatch = null;
    // Never delays shutdown: a write that has not started is dropped, and one
    // in flight is atomic and is not waited for.
    this.parsedNoteCache.cancel();

    // A lost root has nowhere to flush to (and the filesystem is sealed): skip straight to teardown.
    if (!this.rootLost) {
      await this.pageOperations.flushAll(SHUTDOWN_FLUSH_TIMEOUT_MS);
      await this.folderOperations.flushAll(SHUTDOWN_FLUSH_TIMEOUT_MS);
      // ADR-035: after the page flush above, so a draft promoted by that
      // flush is already a real page and is written as restorable.
      await this.workspaceSessionStore.flush();
      // Settings written in the background (templates, note location, cover position, cleanup): a change made just
      // before quitting must reach `.clutter/workspace.json`, which nothing else holds the process open for.
      await flushWorkspaceStateWrites();
    }
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
    this.pageOperations.dispose();
    this.workspaceVaultReconciliationUnsubscribe();
    this.documentRegistry.clear();
  }
}
