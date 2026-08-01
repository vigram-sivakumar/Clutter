# Clutter — Architecture Specification (Frozen)

This is the specification implementers build against, derived from `docs/architecture-target.md`. Where the target document explains *why* a subsystem exists and *what it should evolve into*, this document freezes *what its contract is* — public API shapes, lifecycle, invariants, and concurrency guarantees — so that Phase 1 of the migration can start without re-litigating design decisions mid-implementation.

Naming convention used throughout: `+` = public API (importable from outside the subsystem's own folder), `-` = internal collaborator (never imported from outside).

---

## 1. Platform

### Responsibilities
Provide OS-level file I/O and change notification, with zero knowledge of vaults, pages, or folders.

### Public API

```ts
+ interface VaultFileSystem {
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<void>;
    moveFile(from: string, to: string): Promise<void>;
    createDirectory(path: string): Promise<void>;
    readDirectory(path: string): Promise<DirectoryEntry[]>;
  }

+ interface VaultFileSystemWatcher {
    start(rootPath: string): Promise<void>;
    stop(): Promise<void>;
    subscribe(listener: (event: VaultFileChange) => void): Unsubscribe;
  }

+ type VaultFileChange =
    | { kind: 'created'; path: string }
    | { kind: 'changed'; path: string }
    | { kind: 'deleted'; path: string }
    | { kind: 'moved'; from: string; to: string };
```

### Internal collaborators
`- LocalFileSystem` (Tauri fs plugin adapter), `- LocalFileSystemWatcher` (Tauri event listener + `invoke('start_vault_watcher'|'stop_vault_watcher')`), `- SelfWriteRegistry`, `- SelfWriteAwareFileSystem`, `- SelfWriteAwareWatcher`, and the Rust module (`vault_watcher.rs`) behind the two invoked commands.

### Lifecycle
Constructed once by the Composition Root during `bootstrap()`. `start()` is called once the Vault exists (watcher events are meaningless before there's a model to reconcile into). `stop()` is called on `Application.close()`. No other lifecycle states.

### Invariants
- `VaultFileSystem` methods are the *only* way any TypeScript code touches disk. No subsystem outside Platform calls a Tauri fs API directly.
- Every write made through `SelfWriteAwareFileSystem` is registered in `SelfWriteRegistry` *before* the OS-level write completes, so the watcher can never observe the write before it knows to ignore it.
- The watcher never emits an event for a path currently registered as a pending self-write.

### Concurrency model
No concurrency control of its own — Platform is a pass-through to OS calls. Concurrency is the Persistence Gate's and Sync's problem, not Platform's. Rename-pairing inside `vault_watcher.rs` uses a bounded 300ms correlation window (this is a Platform-internal detail, not part of the public contract — callers only ever see the resolved `moved` event).

### Ownership
Platform owns the storage seam. It must never own path-shape assumptions beyond the interface's own `string` type — any splitting/joining of path segments happens in `vault/path/` (§3), not here.

### Extension points
A second backend (cloud, git-backed, etc.) is a new pair of `VaultFileSystem`/`VaultFileSystemWatcher` implementations, wired at the Composition Root. No other subsystem's code changes.

### Testing strategy
`- InMemoryVaultFileSystem` and `- FakeVaultFileSystemWatcher` (already exist) are the canonical test doubles; every subsystem above Platform tests against these, never against `LocalFileSystem`. Platform's own tests exercise the Rust rename-pairing logic directly (already covered — `vault_watcher.rs`'s test module is the model to keep extending) and a thin TS-side test that `LocalFileSystemWatcher` correctly maps Tauri events to `VaultFileChange`.

### Example
```ts
const fs = new LocalFileSystem();
await fs.writeFile('/vault/Notes/Idea.md', '# Idea\n');
// SelfWriteAwareFileSystem wraps `fs` so the watcher started below ignores this exact write.
```

---

## 2. Vault Ingest

### Responsibilities
Pure transformation: raw file bytes → typed, identity-resolved `Page`/`Folder` objects. No vault-wide state, no I/O ordering.

### Public API

```ts
+ class VaultScanner {
    scan(rootPath: string): Promise<VaultScanResult>;
  }

+ class PageBuilder {
    build(input: { parentId: string; page: ScannedPage }): Page;
  }

+ class PageRebuilder {
    rebuild(existing: Page, parsed: ParsedMarkdown): Page;
  }

+ class FrontmatterParser {
    parse(content: string): ParsedMarkdown;
  }

+ class FrontmatterSerializer {
    serializeDocument(page: Page): string;
  }

+ class IdentityResolver {
    resolvePage(scanned: ScannedPage): string;
    resolveFolder(scanned: ScannedDirectory): string;
  }
```

### Internal collaborators
`- DocumentLoader`, `- ScannedPageFactory`, `- MarkdownAnalyzer`, `- FrontmatterAnalyzer`, the six `- *Extractor` classes (Tag/Task/Link/Embed/Heading/BlockReference), `- PageAnalysisMapper`.

### Lifecycle
Stateless. Every class is either constructed once at the Composition Root and reused, or constructed fresh per call with no cost (all are pure functions over their inputs — no instance state survives between calls). There is no "open/close" lifecycle here.

### Invariants
- `PageBuilder` and `PageRebuilder` both route through the same `PageAnalysisMapper` — there is exactly one mapping from extractor DTOs to domain occurrence types, never two.
- Identity resolution is deterministic: same frontmatter `id` (or same path, if no `id`) always resolves to the same id, across both the initial scan and any later rebuild.
- Ingest never calls `Vault` mutation methods and never calls `VaultFileSystem.writeFile`/`deleteFile`/`moveFile` — read-only with respect to disk (`readFile`/`readDirectory` only), and has no reference to a `Vault` instance at all.

### Concurrency model
None needed — every operation is a pure function of its input. Safe to call concurrently for different files; the caller (Persistence Gate or Sync) is responsible for not calling `rebuild` twice concurrently for the *same* page, which is exactly what their queues exist to prevent.

### Ownership
Owns: parsing/serialization format, identity resolution rules, extraction rules. Must never own: vault-wide indexes (that's `Vault`), write-ordering (that's the Persistence Gate/Sync).

### Extension points
A new extractor (e.g., a future "mentions" extractor) is a new file implementing the same extractor shape, registered in `MarkdownAnalyzer`'s fan-out list — no other Ingest file changes.

### Testing strategy
Every extractor is unit-tested against markdown fixtures in isolation. `PageBuilder`/`PageRebuilder` are tested for identity-resolution stability (same input → same id across builds) and for round-trip fidelity (`serializeDocument` → `parse` → equivalent `Page`).

### Example
```ts
const scan = await scanner.scan('/vault');
const page = pageBuilder.build({ parentId: folder.id, page: scan.pages[0] });
```

---

## 3. Vault Domain Model

### Responsibilities
Be the single in-memory source of truth for what pages and folders exist and what is known about them.

### Public API

```ts
+ class Vault {
    getPage(id: string): Page | undefined;
    getPageByPath(path: string): Page | undefined;
    getFolder(id: string): Folder | undefined;
    getReservedFolder(kind: ReservedFolderKind): Folder;
    pages(): Iterable<Page>;
    folders(): Iterable<Folder>;
    tags(): Iterable<Tag>;
    tasks(): Iterable<TaskOccurrence>;
    knowledgeGraph(): KnowledgeGraph;   // lazy — builds on first call after invalidation, see §3a
    embeds(): Iterable<Embed>;         // lazy, same pattern
    subscribe(listener: () => void): Unsubscribe;

    // mutation methods — callable only from vault/persistence/ and vault/sync/, enforced by lint boundary
    addPage(page: Page): void;
    replacePage(page: Page): void;
    removePage(id: string): void;
    updatePagePath(id: string, newPath: string): void;
    moveFolder(id: string, newParentId: string): void;
  }

+ class VaultQuery {
    constructor(vault: Vault);
    getRootFolders(): Folder[];
    getChildFolders(parentId: string): Folder[];
    getChildPages(parentId: string): Page[];
    getFavoriteFolders(): Folder[];
    getFavoritePages(): Page[];
    getArchivedPages(): Page[];
    getVisibleRootFolders(): Folder[];
  }
```

### Internal collaborators
`- VaultProjectionBuilder`, `- TagBuilder`, `- TaskBuilder`, `- EmbedBuilder`, `- KnowledgeGraphBuilder`, `- LinkResolver`, `- PageIndex`.

### Lifecycle
Constructed once, at startup, by `VaultBuilder` from the initial scan. Lives for the app's entire session. Never reconstructed — every mutation is in-place plus a `notify()`, not a rebuild-from-scratch of the `Vault` object itself (only its *projections* rebuild).

### Invariants
- No duplicate ids among pages, and none among folders (checked at construction and on every `addPage`).
- `pagesByPath`/`foldersByPath` are always consistent with `pagesById`/`foldersById` — every mutation method updates both maps atomically (synchronously, no partial-update window observable to any reader).
- `Vault` performs zero filesystem I/O — verified by the absence of any `VaultFileSystem` reference in its constructor or method signatures.
- Live projections (tags, tasks) rebuild fully on every mutation, as today — this is a correctness-over-performance choice that stays, given current file counts.

### 3a. Lazy projection invariant
- `knowledgeGraph()`/`embeds()` are invalidated (not rebuilt) on every mutation, and rebuilt only on the next call to either getter. Two consecutive calls with no intervening mutation return the same cached object (referential stability, so React consumers relying on the eventual backlinks UI don't over-render).

### Concurrency model
Single-threaded JS, mutated synchronously by exactly two callers (Persistence Gate, Sync) — both of which serialize their own calls per-page/per-path before they ever reach `Vault`. `Vault` itself assumes it is never called reentrantly for the same page from two different mutation calls; this assumption is enforced upstream, not inside `Vault`.

### Ownership
Owns all page/folder state and derived projections. Must never own: business rules about *when* a mutation should happen (that's `PageOperations`), disk writes (Persistence Gate/Sync), or navigation state (`Workspace`).

### Extension points
A new live projection (e.g., a future "recently edited" list) is a new `- *Builder` invoked from `VaultProjectionBuilder`, plus a new getter on `Vault` — following the same shape as `tags()`/`tasks()`. A new *lazy* projection follows the `knowledgeGraph()` pattern instead.

### Testing strategy
Invariant tests (duplicate-id rejection, path/id map consistency after every mutation type) are the highest-value tests in the whole codebase and should be exhaustive. Projection tests verify rebuild-on-mutation for live projections and invalidate-then-rebuild-on-access for lazy ones.

### Example
```ts
vault.subscribe(() => rerender());
const notes = new VaultQuery(vault).getChildPages(folder.id);
```

---

## 4. Sync

### Responsibilities
Reconcile filesystem changes made outside the app into the Vault.

### Public API

```ts
+ class VaultSyncService {
    constructor(vault: Vault, fileSystem: VaultFileSystem, watcher: VaultFileSystemWatcher, ...);
    // no other public methods — it is a subscriber wired once, not called into
  }
```

### Internal collaborators
`- VaultSyncCoordinator` (generic per-key async exclusion, no domain knowledge), `- ArchiveMetadataReconciler`, `- reconcileArchiveMetadata`, and the shared `- writeParseRebuildReplace` helper (new — see below).

### Lifecycle
Constructed once at the Composition Root, after the Vault exists. Subscribes to the watcher immediately; unsubscribes on `Application.close()`. Runs for the entire app session with no other state transitions.

### Invariants
- Every external event is serialized per-path through `VaultSyncCoordinator` before touching the `Vault` — two external events for the same path never race.
- Sync never initiates a write that the app itself didn't already make on disk — it only *reacts*, it never originates a change. (The one exception, archive-metadata repair, rewrites frontmatter to match an already-external move — it does not change the user's content.)
- Sync's write step for metadata repair uses the same `- writeParseRebuildReplace` internal helper the Persistence Gate uses for its own writes (see §5) — one implementation of "write → parse → rebuild → replace," shared, even though the two triggers (external event vs. app-initiated) remain separate entry points with separate queues.

### Concurrency model
One `VaultSyncCoordinator` instance, keyed by path. Two events for different paths process concurrently; two events for the same path serialize.

### Ownership
Owns the external-change reconciliation policy. Must never own app-initiated writes — if a bug ever routes a `PageOperations` call through Sync's queue instead of the Persistence Gate's, that's an architecture violation, not a valid alternate path.

### Extension points
A future "conflict resolution" feature (e.g., prompting the user when an external edit collides with an unsaved app edit) is new logic inside `VaultSyncService`'s event handler — it doesn't need a new subsystem.

### Testing strategy
Concurrency tests: fire two rapid events for the same path, assert they process in order and the Vault ends in a consistent state. Reconciliation tests: move a page out of `Archive/` externally, assert frontmatter is repaired.

### Example
```ts
// Wired once, never called directly:
new VaultSyncService(vault, fileSystem, watcher, documentRegistry, frontmatterSerializer);
```

---

## 5. Persistence Gate

### Responsibilities
Be the only mechanism that writes a page/folder to disk and mutates the Vault on the app's behalf, with per-page serialization guaranteeing no two operations on the same page race.

### Public API

```ts
+ class PagePersistenceCoordinator {
    enqueue<T>(pageId: string, operation: PersistenceOperation): Promise<T>;
  }

+ type PersistenceOperation =
    | { kind: 'save'; content: string }
    | { kind: 'create'; path: string; content: string }
    | { kind: 'delete' }
    | { kind: 'move'; destinationFolderId: string }
    | { kind: 'rename'; title: string }
    | { kind: 'archive' }
    | { kind: 'restore' };
```

### Internal collaborators
`- writeParseRebuildReplace` (shared with Sync), `- MoveService` (invoked internally when `kind` implies a path change: move/archive/restore), Vault Ingest's `FrontmatterSerializer`/`FrontmatterParser`/`PageRebuilder`, `Vault` mutation methods.

### Lifecycle
Constructed once at the Composition Root, after the Vault exists (it needs a `Vault` reference to mutate). Holds one queue per page id, created lazily on first `enqueue` for that id, garbage-collected implicitly once empty (no explicit cleanup needed — queues are plain promise chains, not persistent objects).

### Invariants
- **Every** disk write for a page — save, create, delete, move, rename, archive, restore — enqueues through this one class. No other file calls `fileSystem.writeFile`/`deleteFile`/`moveFile` for page content.
- Two operations enqueued for the same `pageId` execute strictly in enqueue order; operations for different `pageId`s execute concurrently.
- Every operation that changes a page's path (move/archive/restore) delegates path computation and the actual `moveFile` call to `MoveService`, never inlines it.
- On any step failure (write fails, parse fails), the queue for that page rejects the current operation and continues processing subsequent ones — one failed save never wedges the queue.

### Concurrency model
One `Promise`-chain queue per `pageId`, keyed in a `Map<string, Promise<unknown>>`. This is the single most important concurrency primitive in the app — every other subsystem's safety claims about "atomic" page mutation ultimately reduce to this queue's correctness.

### Ownership
Owns *how* a write happens safely. Must never own *whether* a write should happen (that's `PageOperations`'s job — the Gate has no concept of "should this draft promote," it only knows "write this content").

### Extension points
A new operation kind (e.g., `duplicate`) is a new variant on `PersistenceOperation` plus a new `case` in the internal dispatcher — the queue mechanism itself doesn't change.

### Testing strategy
This is the subsystem where concurrency tests matter most: enqueue a `save` and a `delete` for the same page back-to-back and assert they resolve in order with a consistent final Vault state; enqueue operations for two different pages and assert they don't block each other (timing-based test or explicit instrumentation).

### Example
```ts
await coordinator.enqueue(pageId, { kind: 'save', content: newMarkdown });
await coordinator.enqueue(pageId, { kind: 'archive' });
```

---

## 6. Application Layer — `PageOperations`

### Responsibilities
Own the entire lifecycle of a page as a single capability surface: the one file every caller (UI, shortcuts, future plugin/automation/API surfaces) calls for anything page-related.

### Public API

```ts
+ class PageOperations {
    open(pageId: string): Promise<void>;
    close(pageId: string): void;
    create(options: CreatePageOptions): Promise<string>;   // returns new pageId
    save(pageId: string, markdown: string): Promise<void>;
    archive(pageId: string): Promise<void>;
    restore(pageId: string): Promise<void>;
    delete(pageId: string): Promise<void>;
    move(pageId: string, destinationFolderId: string): Promise<void>;
    rename(pageId: string, title: string): Promise<void>;
    getSession(pageId: string): DocumentSession | undefined;
  }
```

### Internal collaborators
`- PagePersistenceCoordinator` (all writes), `- DocumentSession`/`- DocumentRegistry`/`- SaveCoordinator` (editing lifecycle, §9), `- shouldPromoteDraft`/`- promoteDraftToActive`, `Vault` (read-only queries), `Workspace` (post-operation state updates, e.g. closing a deleted page).

### Lifecycle
Constructed once at the Composition Root. No internal state of its own beyond its collaborators — `DocumentRegistry` holds the actual per-page session state.

### Invariants
- Every method that changes disk state calls exactly one `PagePersistenceCoordinator.enqueue`.
- `save()` is the only method that can trigger draft promotion, and it does so via `shouldPromoteDraft`, never inline.
- `delete()` and `close()` on the same page never race — `delete()` closes the session (via `DocumentRegistry`) before enqueuing the disk delete, so no save can complete against a page mid-deletion.
- No method here ever calls `VaultFileSystem` directly.

### Concurrency model
`PageOperations` itself holds no locks — all serialization is delegated to the Persistence Gate. Calling `save(id, a)` and `move(id, b)` concurrently from the UI is safe *because* both end up enqueued on the same per-page queue, not because `PageOperations` does anything special.

### Ownership
Owns page-lifecycle business rules (draft promotion, validation, session cleanup on delete). Must never own write-ordering (Gate), parsing (Ingest), or vault-wide state (`Vault`).

### Extension points
A new page-level capability (e.g., `duplicate`) is a new method here plus a new `PersistenceOperation` kind in the Gate — never a new standalone service file.

### Testing strategy
One test suite per method, plus integration tests that exercise a realistic sequence (create → save → archive → restore → delete) against the in-memory Platform double, asserting `Vault` state and `Workspace` state after each step.

### Example
```ts
const id = await pageOperations.create({ folderId, title: 'Untitled' });
await pageOperations.save(id, '# Hello');
await pageOperations.archive(id);
```

---

## 7. Application Layer — `FolderOperations`

### Responsibilities
The same lifecycle ownership as `PageOperations`, scoped to folders.

### Public API

```ts
+ class FolderOperations {
    open(folderId: string): Promise<void>;
    create(name: string, parentId: string): Promise<string>;
    move(folderId: string, destinationFolderId: string): Promise<void>;
    rename(folderId: string, name: string): Promise<void>;
  }
```

### Internal collaborators
`PagePersistenceCoordinator` (folder-scoped operations reuse the same Gate, keyed by folder id instead of page id), `Vault`, `Workspace`.

### Lifecycle, invariants, concurrency, ownership, extension points, testing
Identical pattern to `PageOperations` (§6), scoped to folders. Notably: `Vault.moveFolder`'s existing cascade logic (updating every descendant page's path) is invoked from here, through the Gate, not called directly by any UI code — today it's fully implemented but has no application-layer caller; this specification is what gives it one.

### Example
```ts
await folderOperations.create('Projects', rootFolderId);
await folderOperations.move(folderId, newParentId);
```

---

## 8. Navigation / Intent Router

### Responsibilities
Translate named, view-level user intents into `Workspace` state changes and/or `VaultQuery` reads, for intents that don't correspond to a single `PageOperations`/`FolderOperations` call.

### Public API

```ts
+ class NavigationRouter {
    openArchive(): void;
    openInbox(): void;
    openTemplates(): void;
    openFavorites(): void;
    openAllNotes(): void;
    openAllTasks(): void;
    openSomedayTasks(): void;
    openCompletedTasks(): void;
    openAllTags(): void;
  }
```

Note what is **absent** compared to today's `NavigationService`: `openNote`, `openDailyNote`, `createNote`, `createTask`, `createTag` are deleted from this class — callers use `PageOperations.open`/`.create` directly, since those methods added no logic beyond forwarding.

### Internal collaborators
`Vault`/`VaultQuery` (read-only, for filtered views), `Workspace` (state changes).

### Lifecycle
Constructed once at the Composition Root. Stateless beyond its collaborators.

### Invariants
- No method body here is ever a bare forward to a single `PageOperations`/`FolderOperations` call — if it becomes one after a refactor, the method is deleted and callers redirected (enforced by code review, not tooling).
- Never calls the Persistence Gate directly — if an intent needs to mutate a page/folder, it delegates to `PageOperations`/`FolderOperations`, it doesn't reimplement the mutation.

### Concurrency model
None needed — pure read/navigate operations, no writes.

### Ownership
Owns cross-cutting/view-level navigation intent. Must never own an aggregate's lifecycle logic.

### Extension points
A new "view" (e.g., "open recently edited") is a new method here backed by a new `VaultQuery` method — no new subsystem.

### Testing strategy
Each method tested against a fixture `Vault` for correct `Workspace` state after the call.

### Example
```ts
router.openAllTasks(); // workspace.activeView = 'all-tasks'; UI reads vault.tasks() filtered accordingly
```

---

## 9. `DocumentEditing` (formerly `core/engine`)

### Responsibilities
Own the live edit buffer, revision tracking, and save-lifecycle state for pages currently open in an editor — kept as `PageOperations`'s internal collaborator, not a peer application-layer service.

### Public API (internal to `application/` — not exported outside it)

```ts
- class DocumentRegistry {
    open(pageId: string, initialContent: string): DocumentSession;
    get(pageId: string): DocumentSession | undefined;
    close(pageId: string): void;
  }

- class DocumentSession {
    commit(content: string): DocumentTransaction;
    beginSave(): void;
    markSaved(revision: DocumentRevision): void;
    markSaveFailed(error: Error): void;
    subscribe(listener: () => void): Unsubscribe;
  }
```

### Internal collaborators
`- DocumentRevision`, `- DocumentTransaction`, `- DocumentState`, `- SaveCoordinator`.

### Lifecycle
A `DocumentSession` is created on `PageOperations.open()` and destroyed on `PageOperations.close()`. It is not persisted — closing and reopening a page creates a fresh session seeded from the Vault's current content.

### Invariants
- `SaveCoordinator` guards against stale completions: if save #1 is still in flight when save #2 begins, save #1's eventual completion must not overwrite save #2's in-progress state.
- A `DocumentSession` never writes to disk itself — it only tracks state and hands a committed transaction to `PageOperations.save()`, which is what talks to the Gate.

### Concurrency model
One `SaveCoordinator` entry per page id, tracking the currently in-flight save's identity so a late-arriving completion for a superseded save is discarded rather than corrupting state.

### Ownership
Owns in-memory edit state only. Must never own persisted state (that's `Vault`) or the actual write (that's the Gate).

### Extension points
This is the seam a future richer editor (structured blocks, concurrent cursors, undo/redo) extends — `DocumentTransaction` is deliberately already shaped as a discrete, replayable unit for that reason. No redesign needed to grow into that; it's sized for today and shaped for tomorrow.

### Testing strategy
State-machine tests: verify every legal transition (Loading→Clean→Saving→Clean, Saving→SaveError, stale-completion rejection) and that illegal transitions are impossible to construct.

### Example
```ts
const session = documentRegistry.open(pageId, page.content);
const tx = session.commit(newMarkdown);
session.beginSave();
// ... PageOperations.save() enqueues the write via the Gate, then:
session.markSaved(newRevision);
```

---

## 10. Workspace

### Responsibilities
Own transient navigation UI state: active page/folder, open pages, expanded folders.

### Public API

```ts
+ class Workspace {
    openPage(pageId: string): void;
    openFolder(folderId: string): void;
    closePage(pageId: string): void;
    toggleFolderExpanded(folderId: string): void;
    isPageOpen(pageId: string): boolean;
    isFolderExpanded(folderId: string): boolean;
    get activePageId(): string | undefined;
    get activeFolderId(): string | undefined;
    subscribe(listener: () => void): Unsubscribe;
  }
```

### Internal collaborators
None — this is already a minimal, self-contained subsystem (unchanged from today).

### Lifecycle
Constructed once at the Composition Root, lives for the app session. In-memory only — does not persist across restarts (this is intentional, not a gap, per the target document).

### Invariants
Exactly one of `activePageId`/`activeFolderId` is set at a time (opening a page clears the active folder and vice versa).

### Concurrency model
Synchronous, single-threaded — no async operations, no races possible.

### Ownership
Owns navigation UI state. Must never own persisted product data or write logic.

### Extension points
Persisting workspace state (the currently-dead `.clutter/workspace.json`) would be a new `- WorkspaceSnapshot` serializer reading/writing through `VaultFileSystem` — decide deliberately if/when this becomes a product requirement; don't half-build it speculatively.

### Testing strategy
Unit tests for the mutual-exclusivity invariant and subscriber notification.

### Example
```ts
workspace.openPage(pageId);
useWorkspace(workspace).activePageId; // pageId
```

---

## 11. Composition Root

### Responsibilities
Construct every subsystem in the correct order and wire dependencies. Own nothing else.

### Public API

```ts
+ class Application {
    static async bootstrap(rootPath: string): Promise<Application>;
    attachVault(vault: Vault): void;
    async open(): Promise<void>;
    close(): void;

    readonly vault: Vault;
    readonly workspace: Workspace;
    readonly pages: PageOperations;
    readonly folders: FolderOperations;
    readonly navigation: NavigationRouter;
  }
```

### Lifecycle
`bootstrap(rootPath)` — constructs Platform + Vault Ingest + a minimal Persistence Gate sufficient for the pre-Vault daily-note-ensure step; performs that daily-note-ensure; runs the initial scan and build. `attachVault(vault)` — constructs everything else (`PageOperations`, `FolderOperations`, `NavigationRouter`, `Sync`), now that a real `Vault` exists. `open()` starts the watcher and navigates to today's note. `close()` stops the watcher and tears down subscriptions.

### Invariants
- This is the only file in the codebase that imports `LocalFileSystem`/`LocalFileSystemWatcher` concretely — everything else imports the interface types.
- No conditional business logic — the only branches allowed here are "does the vault already have today's note," which is a bootstrap-ordering question, not a product rule.
- No object is constructed more than once for the same purpose (the two-phase split exists precisely so the pre-Vault and post-Vault construction needs are each satisfied by exactly one instance, not two overlapping ones).

### Concurrency model
N/A — construction is sequential and awaited; no concurrent construction paths exist.

### Ownership
Owns wiring. Explicitly must never own a capability's implementation.

### Extension points
Swapping Platform implementations, or adding a new top-level subsystem, both happen here and only here.

### Testing strategy
An integration test that calls `bootstrap()` + `attachVault()` + `open()` against the in-memory Platform doubles and asserts every expected object is constructed exactly once (this test is what makes the "no duplicate construction" invariant enforceable, not just documented).

---

## 12. UI / Features

### Responsibilities
Render the product; dispatch user actions to `PageOperations`/`FolderOperations`/`NavigationRouter` via props.

### Public API
N/A in the subsystem-contract sense — this is the consumer, not a service with a contract other code depends on. The contract runs the other direction: every feature component's props are typed against the facade interfaces above.

### Internal collaborators
Shared `components/` primitives; `VaultQuery` (constructed once, passed down — never `new VaultQuery(vault)` inside a component body).

### Lifecycle
Standard React component lifecycle; no special rules beyond receiving facades as props/context rather than importing `Application` directly.

### Invariants
No feature component imports a concrete application-layer class; all receive typed facade references from `PageHost`/composition.

### Concurrency model
N/A (React's own scheduling).

### Ownership
Owns presentation only.

### Extension points
New features are new folders under `features/`, following the existing callback-prop pattern.

### Testing strategy
Component tests with mock facades (`PageOperations`/`FolderOperations` test doubles implementing the same interface) — never a real `Application` instance in a UI unit test.

---

## Sequence Specifications

Each sequence lists the exact call chain implementers should produce. `Gate` = Persistence Gate, `Ops` = `PageOperations`/`FolderOperations`.

### Startup

```
AppShell
  → Application.bootstrap(rootPath)
      → Platform: construct LocalFileSystem, wrap in SelfWriteAwareFileSystem
      → Platform: VaultInitializer.initialize(rootPath)   [ensure reserved folders]
      → minimal Gate + Ingest: ensure today's daily note exists (create-if-absent,
        via the same 'create' PersistenceOperation kind used post-boot — no separate
        bypass path, per Invariant §5)
      → Ingest: VaultScanner.scan(rootPath) → VaultBuilder.build(scanResult) → Vault
  → Application.attachVault(vault)
      → construct full Gate, PageOperations, FolderOperations, NavigationRouter,
        Sync (Sync subscribes to the watcher here, not before — no events are
        meaningful before the Vault exists)
  → Application.open()
      → watcher.start(rootPath)
      → pages.open(vault.getPageByPath(todayNotePath).id)
  → AppLayout renders, PageHost shows today's note
```

### Save

```
MarkdownEditor.onBlur(content)
  → PageOperations.save(pageId, content)
      → DocumentSession.commit(content) → DocumentTransaction
      → SaveCoordinator.beginSave()
      → shouldPromoteDraft(content) → [if true] promoteDraftToActive()
      → Gate.enqueue(pageId, { kind: 'save', content })
          → FrontmatterSerializer.serializeDocument
          → VaultFileSystem.writeFile
          → FrontmatterParser.parse (re-read)
          → PageRebuilder.rebuild
          → Vault.replacePage → notify()
      → SaveCoordinator.completeSave()
      → DocumentSession.markSaved(newRevision)
```

### Create

```
UI "New Note" action
  → PageOperations.create({ folderId, title })
      → PagePathResolver.createNotePath(folderId, title)  [collision-free path]
      → PageCreator.create() → { id, content }
      → Gate.enqueue(newPageId, { kind: 'create', path, content })
          → VaultFileSystem.writeFile
          → FrontmatterParser.parse
          → PageBuilder.build
          → Vault.addPage → notify()
      → Workspace.openPage(newPageId)
  → returns newPageId to caller
```

### Delete

```
UI "Delete" menu item
  → PageOperations.delete(pageId)
      → DocumentRegistry.close(pageId)   [close any open session first]
      → Gate.enqueue(pageId, { kind: 'delete' })
          → VaultFileSystem.deleteFile
          → Vault.removePage → notify()
      → Workspace.closePage(pageId)
```

### Rename

```
UI title edit, onCommit(newTitle)
  → PageOperations.rename(pageId, newTitle)
      → Gate.enqueue(pageId, { kind: 'rename', title: newTitle })
          → FrontmatterSerializer.serializeDocument (frontmatter title field only,
            content and path unchanged)
          → VaultFileSystem.writeFile
          → FrontmatterParser.parse → PageRebuilder.rebuild
          → Vault.replacePage → notify()
```

### Move

```
UI "Move to…" action, destinationFolderId
  → PageOperations.move(pageId, destinationFolderId)
      → Gate.enqueue(pageId, { kind: 'move', destinationFolderId })
          → MoveService.movePage(current, computed-destination)
              → VaultFileSystem.createDirectory (if needed)
              → VaultFileSystem.moveFile
          → Vault.updatePagePath → notify()
```

### Archive

```
UI "Archive" action
  → PageOperations.archive(pageId)
      → Gate.enqueue(pageId, { kind: 'archive' })
          → MoveService.movePage(current, Archive/...)
          → Vault.updatePagePath
          → FrontmatterSerializer.serializeDocument (status: archived)
          → VaultFileSystem.writeFile
          → FrontmatterParser.parse → PageRebuilder.rebuild
          → Vault.replacePage → notify()
```

### External file change

```
OS file event → notify (Rust) → vault_watcher.rs classify + rename-pair
  → Tauri emit('vault:file-change')
  → LocalFileSystemWatcher → SelfWriteAwareWatcher (drop if self-write) → VaultSyncService
      → VaultSyncCoordinator.enqueue(path, handler)
          → [created]  Ingest.build → Vault.addPage
          → [changed]  writeParseRebuildReplace-equivalent read path:
                       Ingest.parse → PageRebuilder.rebuild → Vault.replacePage
          → [deleted]  Vault.removePage
          → [moved]    Vault.updatePagePath
          → reconcileArchiveMetadata (if the move crossed the Archive/ boundary)
      → Vault.notify() → React re-renders
```

---

## Why This Stays Coherent After 300 More Features and 1,000 More Commits

**Every new feature answers "where does this go?" in one step, not several.** There are exactly two kinds of new work: a new verb on an existing aggregate (goes on `PageOperations`/`FolderOperations`, backed by a new `PersistenceOperation` kind if it writes) or a new aggregate entirely (Templates, Attachments, whatever the product grows into — gets its own `*Operations` facade following the identical shape: open/create/mutate/delete, backed by the same Gate). There is no third option, which is exactly what prevents the six-way fragmentation this project already lived through once from recurring — a contributor under deadline pressure has nowhere convenient to bolt on a bypass, because the "convenient" path (add a method to the facade they already have open) is also the correct one.

**The concurrency guarantee is centralized, so correctness doesn't degrade as surface area grows.** Today's actual bug risk was three independently-reasoned write paths. In this spec there is exactly one queue (§5) that every write funnels through, regardless of which of the 300 future features triggered it. Adding feature #301 cannot reintroduce a race condition between it and feature #1, because both were forced through the same per-page queue by construction, not by convention someone has to remember.

**Layers only point downward, and that's mechanically checkable, not just documented.** The dependency diagram in the target document has one direction. An ESLint boundary rule (already precedented in this project's own git history) can enforce "nothing outside `vault/persistence` and `vault/sync` imports `Vault`'s mutation methods" and "nothing outside `application/` imports a concrete `PagePersistenceCoordinator`." That turns architectural drift from something a code reviewer has to notice into something CI rejects — the single biggest reason the current six-service fragmentation was able to happen unnoticed for months.

**Speculative work is contained, not eliminated, by an explicit rule rather than vigilance.** The knowledge graph, embeds, and aliases are allowed to exist ahead of their UI — that's not forbidden — but Coding Rule 4 makes "no new unconsumed machinery" a review-time question with a yes/no answer, rather than a judgment call that erodes gradually. 300 features from now, there will likely still be some ahead-of-need code; the rule keeps it bounded to deliberate, named exceptions instead of an accumulating pattern.

**The parts that were already correctly scoped don't move, so the surface area that could regress is smaller than it looks.** Platform, Vault Ingest's parsing rules, `Vault`'s core mutation methods, and `Workspace` are unchanged by this specification. A design that touches everything to fix a fragmented sixth of the codebase would spend the next year re-earning trust in parts that already worked; this one spends its migration budget exactly where the review found the actual problem and leaves the rest alone, which is also why five out of six months of the migration plan in the target document are additive (ship Move, ship Delete, ship Restore) rather than corrective.

**The specification is falsifiable, not aspirational.** Every invariant above names its enforcement mechanism (a lint rule, a specific test, or an explicit code-review checklist item) rather than stating a hope. A specification whose rules can't be checked decays the same way the current `NavigationService` decayed from "the future API" into "half of it throws" — nobody was ever forced to notice the gap opening. This one is designed so the gap between spec and code shows up in CI before it shows up in a review document a year from now.
