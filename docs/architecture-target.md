# Clutter — Target Architecture (12-Month Horizon)

This is an evolutionary design, not a rewrite. It starts from the independent assessment in `docs/architecture-assessment.md` and keeps every subsystem that assessment found to be working and correctly scoped: `Vault` as the domain model, `VaultFileSystem` as the storage seam, the self-write echo-suppression pattern, the Rust watcher boundary, `Workspace` as navigation state, and the feature-callback UI pattern. It replaces exactly one thing: the fact that "mutate a page" currently has three different implementations with three different safety guarantees. Everything else changes shape only where the current shape is actively blocking the stated goal (one capability, one owner, one write path).

Nothing here proposes touching the Rust layer, the ingest pipeline's parsing logic, or the domain model's field shapes. Those are sound.

---

## Subsystem-by-Subsystem Design

For each subsystem: why it exists, what it owns, what it must never own, who may call it, what it may depend on, and who may depend on it.

### 1. Platform (`platform/` — was `src-tauri/` + the provider implementations)

**Why it exists:** Isolate OS/runtime-specific I/O (native filesystem watching, raw file operations) from everything that reasons about vaults, pages, or folders.

**Owns:** Rust `notify`-based watching and rename-pairing (unchanged — this layer is already correctly scoped); the concrete `VaultFileSystem`/`VaultFileSystemWatcher` implementations (`LocalFileSystem`, `LocalFileSystemWatcher`); the `SelfWriteRegistry` echo-suppression pair.

**Must never own:** Any knowledge of what a "page," "folder," or "vault" is. Must never own path-shape assumptions beyond what the `VaultFileSystem` interface itself defines (this is currently violated — see §11).

**Who may call it:** Only the Ingest and Persistence Gate subsystems, and only through the `VaultFileSystem`/`VaultFileSystemWatcher` interfaces — never a concrete class.

**May depend on:** Nothing else in the app. It is the leaf.

**May be depended on by:** Ingest, Persistence Gate, Sync. Nothing above the application layer should ever import from here.

### 2. Vault Ingest (`vault/ingest/` — merges today's `discover/` + `understand/` + `build/`)

**Why it exists:** Turn raw file bytes into typed, identity-resolved domain objects. This is one job today split across three folders for no reason a new contributor can discover from the names.

**Owns:** Scanning, frontmatter parsing/serialization, the six content extractors, identity resolution, and the two build paths (initial `PageBuilder`, incremental `PageRebuilder`) — kept as two entry points into one shared mapping layer (`PageAnalysisMapper`), exactly as today.

**Must never own:** Vault-wide state (no maps of all pages/folders — that's the domain model's job) or write-ordering/concurrency (that's the Persistence Gate's job — Ingest is a pure function of "bytes in, `Page`/`Folder` out").

**Who may call it:** Vault Ingest is called during startup scan by the Composition Root, and during every mutation by the Persistence Gate and Sync (both need "reparse this file into a Page").

**May depend on:** Platform (`VaultFileSystem.readFile`), nothing else.

**May be depended on by:** Persistence Gate, Sync, Composition Root (startup only).

### 3. Vault Domain Model (`vault/model/` — today's `models/` + the mutation methods currently on `Vault`)

**Why it exists:** Be the one place that answers "what pages and folders exist right now, and what do we know about them." This is already correctly built and should not change shape.

**Owns:** The `Vault` object itself, all page/folder state, id/path indexes, and the *live* projections — tags and tasks (the two with real consumers). Enforces its own invariants (no duplicate ids, path availability) exactly as today.

**Must never own:** Filesystem I/O (confirmed already true — keep it that way), and must never own projections without a consumer (see §3a).

**Who may call it:** Persistence Gate and Sync are the only two subsystems allowed to *mutate* it (`addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder`). Everything else — features, application-layer read paths, UI — may only *read* it, ideally through `VaultQuery`.

**May depend on:** Vault Ingest (for the `Page`/`Folder` shapes it stores), nothing else.

**May be depended on by:** Everything above it. This is intentional — it's the domain model, the one thing every layer is allowed to know about.

#### 3a. Deferred/lazy projections (link graph, embeds, aliases)

**Decision: keep the code, change when it runs.** The knowledge graph, embed index, and alias index are well-built and have real future value (backlinks, embed rendering) but zero current consumers, and today they're rebuilt on every single mutation regardless. Target state: these three projections move behind a `vault.knowledgeGraph()`-style lazy getter that builds on first access and invalidates on the next mutation, rather than rebuilding unconditionally inside `refreshProjections()`. This is not a rewrite — `KnowledgeGraphBuilder`/`LinkResolver`/`EmbedBuilder` don't change internally, only when they're invoked. It removes real per-save CPU cost today and costs nothing when backlinks/embeds ship, because the lazy getter is the same call site a future feature would use anyway.

### 4. Sync (`vault/sync/` — unchanged in spirit)

**Why it exists:** Reconcile external filesystem changes (edits made outside the app) into the domain model.

**Owns:** Watch-event classification, per-path serialization (`VaultSyncCoordinator`), and archive-metadata repair.

**Must never own:** App-initiated writes. Sync only ever reacts to events Platform reports; it must never be a second way for the *app* to write a page (today `persistSyncedPageDocument` is structurally identical to the Persistence Gate's own write pipeline — target state consolidates the "write → parse → rebuild → replace" step into one shared internal function that both Sync and the Persistence Gate call, so there's one implementation of that shape even though there remain two triggers and two queues, which is legitimate since the triggers have genuinely different failure semantics).

**Who may call it:** Nothing calls Sync — it's a subscriber, wired once by the Composition Root.

**May depend on:** Platform (watcher), Vault Ingest (parse/rebuild), Vault Domain Model (mutate).

**May be depended on by:** Nobody. Sync is a leaf consumer, not a service other code calls into.

### 5. Persistence Gate (`vault/persistence/` — today's `PagePersistenceCoordinator`, scope expanded)

**Why it exists:** Be the *only* place that serializes concurrent writes to the same page and the *only* place that turns a domain-level intent ("save this content," "create this page," "delete this page," "move this page") into an actual disk write. This is the single most important consolidation in this design: today this coordinator only covers edit/archive/restore; every other mutation writes around it.

**Owns:** The per-page write queue, and now *every* operation shape that touches disk for a page: content save, create, delete, move, archive/restore (archive and restore are just a move + a status change, already true today). One queue, one set of operation types, instead of three independent write mechanisms.

**Must never own:** Business rules about *when* something should happen (e.g., it doesn't decide whether a draft should promote to active — that stays in `PageOperations`, see §6) or UI concerns. It only owns *how a write happens safely*, never *whether* it should.

**Who may call it:** Only `PageOperations` and `FolderOperations` (§6). Nothing in the UI, features, or navigation layer ever calls it directly — this is what makes it safe to change its internals later without touching 200 files.

**May depend on:** Platform, Vault Ingest, Vault Domain Model.

**May be depended on by:** `PageOperations`, `FolderOperations` only.

### 6. Application Layer — Capability Facades (`application/` — replaces today's 6-way split)

**Why it exists:** This is the fix for the review's central finding. Today "mutate a page" is implemented across `PageApplicationService`, `PageMutationService`, `ResourceCreation`, `ResourceDeletionService`, `MoveService`, and half of `NavigationService`. The target collapses these into two capability facades — one per aggregate the product actually has (Page, Folder) — each with exactly one file that owns its whole lifecycle.

**Owns:**
- `PageOperations`: open, close, create, save, archive, restore, delete, move, rename, duplicate (once built) — every verb that applies to a page, all routed through the Persistence Gate, all in one place. Also owns the business rules that decide *whether* something happens (draft-promotion stays here, exactly as `shouldPromoteDraft` already models correctly today — this file is the one part of the current application layer that needs to survive unchanged in spirit).
- `FolderOperations`: open, create, move, rename for folders.
- `DocumentEditing` (today's `core/engine`, kept as an internal collaborator of `PageOperations`, not a peer service): the edit-buffer/revision/save-lifecycle machinery. It does not shrink in this design — the review noted it's ahead of the current editor's needs, but "ahead of need" isn't the same as "wrong," and ripping it out only to rebuild it when the richer editor lands is wasted motion. It stays, un-expanded, as `PageOperations`'s implementation detail.

**Must never own:** Filesystem paths, YAML/frontmatter shape, or write-ordering (all of that is the Persistence Gate's and Vault Ingest's job — `PageOperations` calls them, it doesn't reimplement them). Must never be called directly by React components for anything that mutates state — only through the callback-prop pattern features already use correctly today.

**Who may call it:** UI (via callback props, as today), keyboard shortcuts, and — this is the point — any *future* caller (command palette, plugin API, REST endpoint, automation) without `PageOperations` itself changing. This is the literal `pageStore.move(...)` goal from the original brief, finally achievable because there's one file to expose it from.

**May depend on:** Persistence Gate, Vault Domain Model (read-only queries), Workspace (to update nav state after an operation, e.g. closing a deleted page).

**May be depended on by:** Navigation/Intent Router (§7), UI features, shortcut handlers, and nothing else — no other application-layer file should depend on `PageOperations`, because there shouldn't be any other application-layer files left doing overlapping work.

### 7. Navigation / Intent Router (`application/navigation/` — today's `NavigationService`, scope corrected)

**Why it exists:** Translate a named user intent ("open favorites," "create a task") into the right combination of `PageOperations`/`FolderOperations` calls plus `Workspace` state changes, for intents that don't map 1:1 onto a single operation.

**Owns:** Only intents that are genuinely compound or view-routing in nature (e.g., "open all tasks" = filter + navigate; that's not a page/folder operation, it's a view). It does **not** own create/delete/save/move/archive — those are `PageOperations`/`FolderOperations` calls directly, with no forwarding layer in between (today `NavigationService.openNote` forwards 1:1 to `PageApplicationService.openPage`; a facade that forwards unconditionally is not adding value and should be deleted, not preserved).

**Must never own:** Anything that would duplicate a `PageOperations`/`FolderOperations` method with no added logic. **Rule of thumb: if a `NavigationService` method's body is a single forwarding call, delete the method and have the caller call `PageOperations` directly.**

**Who may call it:** UI, shortcuts — for the subset of intents that are genuinely view-level, not aggregate operations.

**May depend on:** `PageOperations`, `FolderOperations`, `Workspace`, Vault Domain Model (read-only, for things like "all tasks" queries).

**May be depended on by:** UI, shortcut handlers.

### 8. Workspace (`workspace/` — unchanged)

**Why it exists:** Own transient navigation UI state (active page/folder, open pages, expanded folders) — separate from the persistent domain model, because reloading the app should not require deciding whether "which folders were expanded" is vault data.

**Owns:** Exactly what it owns today. This subsystem was already correctly scoped and sized; no change.

**Must never own:** Anything that survives a restart as product data (that's the Vault's job) or anything about *how* a page is saved (that's the Persistence Gate's job).

**Who may call it:** `PageOperations`, `FolderOperations`, and the Navigation/Intent Router (to update state after an operation); read by UI via `useWorkspace`.

**May depend on:** Nothing.

**May be depended on by:** Application layer, UI.

### 9. Composition Root (`Application.ts` — scope clarified, see §14)

**Why it exists:** Be the one file that knows how every concrete subsystem is wired together, so nothing else in the codebase needs to.

**Owns:** Object construction and lifecycle (open/close), and nothing else — no business logic, no write logic. Today it already mostly satisfies this; the fix is eliminating the duplicate constructions (two `ResourceCreation`s, two `FrontmatterParser`s, two `PageRebuilder`s) that exist because the bootstrap daily-note-creation step needs a page-writer before the Vault exists. Target: a single, explicit two-phase construction (`bootstrap()` then `attachVault()`) so the duplication is one documented seam instead of four separately-duplicated objects.

**Must never own:** Any capability implementation. If `Application.ts` ever contains an `if` statement deciding *what* should happen (as opposed to *in what order things get constructed*), that logic has leaked from where it belongs.

**Who may call it:** `AppShell` only.

**May depend on:** Every subsystem (it's the composition root — this is its job).

**May be depended on by:** Nothing (composition roots are never imported by the things they compose).

### 10. UI / Features (`app/`, `features/`, `components/` — unchanged in pattern, cleaned up in duplication)

**Why it exists:** Render the product; own presentation only.

**Owns:** Layout, styling, presentational logic (grouping, formatting), and dispatch to the application layer via callback props — the pattern already used correctly by most of `features/` today.

**Must never own:** Direct construction of application-layer objects (`new VaultQuery(vault)` inside a component, as three files do today, is a violation — `VaultQuery` instances should be constructed once, at the composition root or inside `PageOperations`'s read side, and passed down). Must never import a capability's concrete implementation, only its interface/facade.

**Who may call it:** N/A (it's the top of the graph).

**May depend on:** `PageOperations`, `FolderOperations`, Navigation/Intent Router, Workspace, Vault Domain Model (read-only, via `VaultQuery`).

**May be depended on by:** Nothing.

### 11. Storage Extensibility Seam (cross-cutting, not a folder — a rule)

**Why it matters as its own item:** The review found the `VaultFileSystem` interface is real, but path-string assumptions leak past it (in `MoveService`/`PagePathResolver`/`IdentityResolver`/`Vault`'s own indexes). Target state doesn't require abstracting paths today — that would be speculative, since there's exactly one backend. It requires a **rule**: no new code outside Platform may assume POSIX path semantics (string-splitting on `/`, `lastIndexOf('/')`, etc.) — path composition/parsing goes through one small `VaultPath` helper in Vault Ingest. This makes a second backend a "swap Platform + `VaultPath`" change instead of a grep-and-hope migration, without building a backend abstraction nobody needs yet.

### 12. `packages/engine` + `packages/editor`

**Decision: delete.** This is not "replace a working system" — the assessment confirmed zero reachability, zero workspace membership, and a superseding implementation already live for a month. Deleting unreachable code is not a redesign decision, it's cleanup. If a richer block editor is prioritized later, it should be designed against the *current* `DocumentEditing`/`PageOperations` seam, not resurrected from a design that predates it.

---

## Dependency Diagram (target state)

```
                         ┌─────────────────┐
                         │  Composition     │  (constructs everything, owned by no one)
                         │  Root            │
                         └────────┬─────────┘
                                  │ wires
                                  ▼
┌──────────────┐   reads/dispatches   ┌───────────────────────────┐
│  UI/Features  │ ───────────────────▶│  PageOperations /          │
│ (app/,        │                     │  FolderOperations /        │
│  features/,   │◀───────────────────  │  Navigation-Intent Router  │
│  components/) │   callback props     └────────────┬───────────────┘
└──────┬────────┘                                    │ calls
       │ reads (VaultQuery)                           ▼
       │                                    ┌───────────────────┐
       │                                    │  Persistence Gate  │
       │                                    │  (write queue)     │
       │                                    └─────────┬──────────┘
       │                                              │ calls
       ▼                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vault Domain Model                        │◀── mutated only by
│              (Vault, Page, Folder, projections)               │    Persistence Gate + Sync
└───────────────────────────┬───────────────────────────────────┘
                             │ built from
                             ▼
                      ┌─────────────┐        ┌──────┐
                      │ Vault Ingest │◀──────│ Sync  │
                      └──────┬──────┘        └───┬──┘
                             │ reads/writes       │ watches
                             ▼                    ▼
                      ┌─────────────────────────────┐
                      │          Platform            │
                      │ (VaultFileSystem, watcher,   │
                      │  Rust notify layer)          │
                      └───────────────────────────────┘

Workspace: depended on by PageOperations/FolderOperations/Navigation (write) and UI (read via useWorkspace);
depends on nothing. Drawn separately because it's parallel to the Vault, not layered under it.
```

**Rule encoded in this diagram:** arrows only point downward or sideways-at-the-same-level (UI↔UI, e.g. features calling shared components). Nothing below the Application Layer line ever imports from above it. This is the one rule that, if enforced (see Coding Rules, and optionally via the ESLint boundary mechanism the project already used once, per git history), prevents the fragmentation from recurring.

---

## Ownership Diagram

| Data / behavior | Sole owner | Everyone else's relationship to it |
|---|---|---|
| Whether a page exists, its content, its metadata | `Vault` | Read via `VaultQuery`/direct getters; never mutated directly |
| Whether a write to disk has happened, and in what order | Persistence Gate | Called only by `PageOperations`/`FolderOperations` |
| Whether a draft is promoted, whether a rename is valid, etc. (business rules) | `PageOperations` / `FolderOperations` | Called by UI/Navigation; never duplicated elsewhere |
| What folder/page is currently open, expanded, etc. | `Workspace` | Updated by the application layer after an operation; read by UI |
| What a raw file's bytes mean (frontmatter, extracted tags/tasks/etc.) | Vault Ingest | Called by Persistence Gate, Sync, and Composition Root's startup scan only |
| Whether an incoming filesystem event is real or an echo of our own write | `SelfWriteRegistry` (Platform) | Consulted by Sync and Platform's watcher wrapper only |
| Named user intents that span more than one operation or are pure navigation | Navigation/Intent Router | Called by UI/shortcuts; never contains a capability's actual logic |

---

## Capability Map

| Capability | Facade method | Backing mechanism | UI entry point(s) today → target |
|---|---|---|---|
| Open a note/daily note | `PageOperations.open(pageId)` | `DocumentEditing` session lookup | Already works; unchanged |
| Save edited content | `PageOperations.save(pageId, markdown)` | Persistence Gate write op | Already works; unchanged |
| Create a note | `PageOperations.create(options)` | Persistence Gate write op (**changed**: currently bypasses it) | Works today unsafely; target makes it safe with no UI change |
| Delete a note | `PageOperations.delete(pageId)` | Persistence Gate write op (**changed**: currently bypasses it, and has no UI caller at all) | Backend exists, unreachable; target adds one UI entry point (e.g. context-menu item) and routes it safely |
| Archive / Restore | `PageOperations.archive(pageId)` / `.restore(pageId)` | Persistence Gate write op (already correct shape) | Archive is wired; Restore isn't — target adds the UI call, no backend change needed |
| Move | `PageOperations.move(pageId, destFolderId)` | Persistence Gate write op (already exists as `MoveService`, just not exposed) | Not wired today; cheapest capability to ship — one facade method, one UI entry point |
| Rename | `PageOperations.rename(pageId, title)` | Persistence Gate needs a new operation shape (metadata-only write, no path/content change) | Not implemented; genuinely new work in the Gate, then trivial to expose |
| Create/open/move a folder | `FolderOperations.*` | Same Persistence Gate, folder-scoped ops | Open works; create/move don't exist yet |
| View "all tasks," "favorites," etc. | `NavigationRouter.*` | Read-only `VaultQuery` + `Workspace.openFolder`-style state change | Half-stubbed today; target implements the ones the product actually wants, deletes the rest rather than leaving them as throwing placeholders |

**Rule this map enforces:** every row has exactly one facade method and exactly one backing mechanism. If a future feature needs a new capability, it gets a new method on an existing facade (or, if it's a genuinely new aggregate — e.g. Templates — a new facade following the same shape), never a new standalone service file.

---

## Application-Layer Responsibilities (summary)

`PageOperations` and `FolderOperations` are the entire application layer for aggregate operations. Between them they own:

1. Validating an operation is legal (e.g., can't delete a page that doesn't exist, can't move a page into itself).
2. Deciding business-rule side effects of an operation (draft promotion on save, closing a deleted page's editor session, updating `Workspace` after a move).
3. Translating the validated, decided operation into exactly one call into the Persistence Gate.
4. Nothing else. No parsing, no path computation, no direct filesystem calls, no direct `Vault` mutation — those three are explicitly the Persistence Gate's and Vault Ingest's jobs.

The Navigation/Intent Router owns only cross-cutting or view-level intents that don't correspond to a single aggregate operation. If a `NavigationRouter` method's entire body would be `return this.pageOperations.foo(...)`, that method doesn't belong in the router — callers should hold a reference to `PageOperations` directly.

---

## Folder Organization (target)

```
apps/app/src/
  platform/
    filesystem/           # VaultFileSystem interface + LocalFileSystem impl
    watcher/               # VaultFileSystemWatcher interface + LocalFileSystemWatcher impl
    self-write/            # SelfWriteRegistry + the two SelfWriteAware wrappers
    testing/               # InMemoryVaultFileSystem, FakeVaultFileSystemWatcher

  vault/
    ingest/                # scan + parse + build, merged (today's discover+understand+build)
      extractors/
      identity/
    model/                 # Vault, Page, Folder, projections (tags/tasks live; graph/embed/alias lazy)
      graph/                # kept, just invoked lazily — not deleted
    sync/                   # VaultSyncService, VaultSyncCoordinator, archive reconciliation
    persistence/            # the expanded Persistence Gate (create/save/archive/restore/move/delete/rename ops)
    path/                   # the VaultPath helper (§11) — the one place path-string logic lives outside platform
    query/                  # VaultQuery (read-only)

  application/
    page/
      PageOperations.ts     # the one file for page lifecycle
      shouldPromoteDraft.ts # business rules stay colocated, as today
    folder/
      FolderOperations.ts
    navigation/
      NavigationRouter.ts   # only genuinely compound/view intents survive here
    editing/                 # today's core/engine, renamed to avoid any future collision,
                              # kept as PageOperations's internal collaborator
      DocumentSession.ts
      DocumentRegistry.ts
      SaveCoordinator.ts
      DocumentRevision.ts
      DocumentTransaction.ts
    workspace/
      Workspace.ts           # unchanged

  app/                       # shell, layouts, hooks — unchanged pattern
  features/                  # unchanged pattern; fixes are de-duplication, not restructuring
  components/                # unchanged

apps/app/src-tauri/           # unchanged — already correctly scoped
```

**What actually moves vs. what just gets a new name:** `models/`, `discover/`, `understand/`, `build/` physically merge (fewer files, not just renamed folders — `ScannedPageFactory`, extractors, and identity resolution collapse their current cross-file indirection). `application/*` is a real consolidation: 6 files' worth of overlapping responsibility become 2. `core/engine` moves and is renamed but its internals are untouched. `app/`, `features/`, `components/` don't move at all — the review found their *pattern* sound; only specific duplicated files within them get merged (see Migration Plan, Phase 3).

---

## Composition Root Responsibilities

`Application.ts` (or its successor, still one file) is responsible for, and only for:

1. **Two-phase construction**, explicit and documented as such: `bootstrap(rootPath)` constructs Platform + Vault Ingest + just enough of the Persistence Gate to let the daily-note-ensure step happen before a `Vault` exists; `attachVault(vault)` constructs everything else. This replaces today's implicit duplication (two `ResourceCreation`s built independently) with one seam that's named and has exactly one reason to exist.
2. **Object lifecycle**: `open()`/`close()`, starting/stopping the watcher.
3. **Dependency wiring only** — passing constructed objects to other constructors. Zero conditionals about *what* the app does; only *in what order it comes alive*.
4. **Being the only file that imports concrete implementations** of Platform interfaces (`LocalFileSystem`, `LocalFileSystemWatcher`). Every other file imports the interface.

It is explicitly not responsible for: deciding how a save happens (Persistence Gate), deciding whether a draft promotes (`PageOperations`), or anything reachable from a user action.

---

## Architectural Invariants

These should almost never change, and each is paired with how it's enforced so it doesn't quietly erode the way the review found several current ones have:

1. **The Vault is the only place that holds "what pages/folders exist."** Enforced by: nothing outside `vault/model/` and `vault/persistence/`+`vault/sync/` ever calls a `Vault` mutation method — verified by an ESLint boundary rule (the project has done this before, per git history) restricting `vault/model` mutation-method imports to those two folders.
2. **There is exactly one path from "user or sync wants to write a page" to "bytes hit disk."** Enforced by: `VaultFileSystem.writeFile`/`deleteFile`/`moveFile` are only importable from `vault/persistence/` and `vault/sync/` — an ESLint boundary rule, not a comment, is what keeps `PageOperations` from "just quickly" writing a file directly the way `ResourceCreation` does today.
3. **Every capability has exactly one facade method, and consumers never bypass it.** Enforced by: `PageOperations`/`FolderOperations` are the only exports from `application/page/` and `application/folder/` that anything outside the application layer imports — internal collaborators (`DocumentSession`, business-rule helpers) are not exported from the package's public entry point.
4. **Storage is swappable behind `VaultFileSystem` + `VaultPath`.** Enforced by: no `string.split('/')`/`lastIndexOf('/')` path logic outside `vault/path/` and `platform/` — lint rule or code-review checklist item, since this one is harder to mechanically enforce than the other three.
5. **Business rules live beside the operation they modify, not in a separate "rules" layer.** (`shouldPromoteDraft` is the model — this invariant is about *preventing* a rules/policy layer from being invented later, not building one now.)
6. **The UI never imports a concrete application-layer implementation, only the facade type.** Enforced by: features receive `PageOperations`/`FolderOperations` (or narrower callback props derived from them) via props from `PageHost`/composition, never via a direct import of `Application`.

---

## Coding Rules for Future Contributors

1. **Before adding a new `*Service.ts` file to `application/`, ask: does `PageOperations` or `FolderOperations` already own this aggregate?** If yes, add a method there. A new top-level application-layer file is only justified by a genuinely new aggregate (e.g., Templates, once that's a real feature), not a new verb on an existing one.
2. **Every filesystem write for a page or folder goes through the Persistence Gate — no exceptions, including bootstrap code.** If bootstrap timing is a problem (as it is for the first daily note, before the Vault exists), solve it with the composition root's two-phase construction, not with a second write path.
3. **If a facade method's body is a single unconditional forward to another method, delete it.** This is what's currently wrong with half of `NavigationService` — a name that promises orchestration but delivers pass-through.
4. **Don't build a projection, index, or extractor for a feature that doesn't have a UI consumer yet**, with one documented exception: if the projection is genuinely cheap to derive from data already being extracted for a live feature (as tags/tasks are), it's fine to keep it lazy and unused rather than deleting the extractor — the rule is about not adding new *unconsumed* machinery, not about deleting today's (see §3a: keep the graph, just make it lazy).
5. **Path logic is a code-review flag.** Any PR that manipulates a path string outside `vault/path/` or `platform/` should be asked to move that logic, even if it "only needs one line."
6. **New capabilities are exposed by adding a method to an existing facade or, for a new aggregate, creating one facade with the same shape (`open/create/save-or-equivalent/archive-or-equivalent/delete/move`).** Never expose a capability by having a UI component import an internal collaborator directly.
7. **Tests for a facade method should include a concurrency case** (does calling `create` and `save` on adjacent operations serialize correctly?) — this is the class of bug the current split write-paths are exposed to, and it's cheap to guard against once there's one queue to test against.

---

## Migration Plan (evolutionary, ~12 months, phased so the app keeps shipping)

### Phase 1 — Close the safety gap (weeks 1–3)

Highest priority because it's the one place the current architecture has an actual correctness risk, not just a clarity one.

1. Extend the Persistence Gate (`PagePersistenceCoordinator`) with `create` and `delete` operation types, alongside its existing content/move operations.
2. Migrate `ResourceCreation.createNote` and `ResourceDeletionService.delete` to enqueue through it instead of writing directly. `PagePathResolver` and the existing tests for both services carry over unchanged — only the write call site moves.
3. Leave `ResourceCreation.createDailyNote`'s bootstrap-time bypass as-is for now (it has a real reason: no Vault yet) but mark it as the one documented exception, to be closed in Phase 4 when the composition root gets its explicit two-phase split.
4. No UI changes in this phase. This phase is pure risk reduction, invisible to the product.

> **Executed differently than described above — see [ADR-011](./adr/011-phase1-persistence-gate-rescoping.md).** `ResourceCreation`, `ResourceDeletionService`, and `PagePathResolver` never existed on the branch this migration actually shipped from; steps 2–3 above describe a migration of code that wasn't there to migrate. Phase 1 was executed as: build `create`/`delete` fresh against the Gate's kind-based `PersistenceOperation` contract, with no new facade and no UI wiring (deferred to Phase 2, which is where a UI-reachable caller belongs). Read the ADR before treating steps 2–3 as an accurate description of what shipped.

### Phase 2 — Consolidate the application layer (weeks 4–8)

5. Create `PageOperations` as a new file; move `PageApplicationService`, `PageMutationService`, `ResourceCreation`, `ResourceDeletionService`, and `MoveService`'s public methods into it one at a time, each migration covered by the existing tests for that method (they were already well-tested independently — this is mechanical consolidation, not new logic).
6. Create `FolderOperations` the same way from `FolderApplicationService`.
7. Update `PageHost` and the three shortcut-handler files to call the new facades. This is the only UI-facing change in this phase, and it's a signature change, not a behavior change.
8. Delete the 5 now-empty source files once every method has moved and every caller updated.

### Phase 3 — Ship the cheap wins the consolidation unlocks (weeks 8–10)

9. Expose `PageOperations.move` and wire a "Move to…" UI entry point — this was already noted as the cheapest unbuilt capability, and Phase 2 makes it a one-line facade addition.
10. Expose `PageOperations.restore` in the UI (backend already correct).
11. Add one UI entry point for `PageOperations.delete` (backend already correct after Phase 1).
12. De-duplicate the three near-identical topbar components and the two near-identical page-model files into shared implementations parameterized by resource type — now that there's one facade underneath them, the duplication is purely presentational and safe to collapse.

### Phase 4 — Composition root and navigation cleanup (weeks 10–14)

13. Split `Application.open()` into explicit `bootstrap()`/`attachVault()`, closing the duplicate-construction findings (two `ResourceCreation`s, two `FrontmatterParser`s, two `PageRebuilder`s) as one deliberate seam instead of four accidental ones.
14. Delete `NavigationService` methods whose bodies are pure forwards; update their few call sites to call `PageOperations`/`FolderOperations` directly.
15. Implement or delete the remaining 8 stub methods based on actual product priority (this is a product decision, not an architecture one — the architectural fix is just "don't leave a throwing stub wired to a live keyboard shortcut," whichever way each one resolves).

### Phase 5 — Ingest folder merge and path rule (weeks 14–18)

16. Physically merge `discover/`+`understand/`+`build/` into `vault/ingest/`. Mechanical file moves plus collapsing `ScannedPageFactory`'s redundant wrapping — no logic changes.
17. Extract the `VaultPath` helper from the path-string logic currently scattered across `MoveService`/`PagePathResolver`/`IdentityResolver`, and add the ESLint boundary rule from Invariant 4.

### Phase 6 — Cleanup with zero migration risk (any time, low priority, can interleave)

18. Delete `packages/engine`/`packages/editor` (5,025 LOC, confirmed unreachable).
19. Delete the 7 confirmed dead files.
20. Make the knowledge-graph/embed/alias projections lazy (§3a) — pure performance change, no consumer to break.
21. Wire or delete the `Reference` component and the disabled `Controls` history buttons — product decision, not architectural, but flagged because shipping either way is cheap once decided.

### Explicitly out of scope for this migration

- Rewriting `core/engine`/`DocumentEditing` — kept as-is; only revisited when a richer editor is actually being built.
- Building a second storage backend — the `VaultPath` rule (Phase 5) is preparation, not implementation; building Google Drive/Dropbox support with no product commitment to it would repeat the exact mistake this review flagged in the knowledge graph.
- Introducing a router/URL-based navigation — `Workspace` state-driven navigation works for the current product shape; revisit only if deep-linking becomes a real requirement.

Each phase ships independently and leaves the app in a fully working state — there is no phase that requires a feature freeze, and every phase after Phase 1 is strictly optional relative to shipping the next product feature, which is the point: this plan is designed to be interleaved with normal feature work, not blocked behind it.
