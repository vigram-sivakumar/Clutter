# Clutter — Independent Architecture Assessment

Built from scratch by reading the source directly (vault pipeline, application layer, UI/app shell, features, orphaned packages, and the Tauri/Rust backend were each read in full, file by file, independently). No prior review or documentation was used as input; git history was consulted only as raw commit-log evidence for the evolution section, which is itself primary source material, not a conclusion inherited from anyone.

**Date:** August 1, 2026
**Scope:** ~245 production TypeScript/TSX files across `apps/app/src` (vault: 75, application/engine/workspace: 23, app shell + components: 84, features: 63), plus 12 orphaned files in `packages/`, and 3 Rust source files in `apps/app/src-tauri/src`.

---

## What Clutter Actually Is

Reverse-engineered from the code, not assumed: this is a **local-first markdown vault application** — folders and `.md` files on disk are the entire persistent state, browsed and edited through a Tauri desktop shell. There is no server, no database, no accounts. The product surface (from what's actually wired end-to-end in the UI) is: a folder tree, daily notes with a calendar picker, a still-primitive `contentEditable` markdown editor, tags/tasks extracted from note content and shown read-only in a sidebar, and an archive.

**Runtime shape**, derived directly from `Application.ts` and the render tree:

```
Rust (notify-based file watcher) → Tauri fs plugin (TS-side I/O) → VaultFileSystem
    → scan/parse/build pipeline → immutable Vault (in-memory model)
    → Workspace (nav state) → React (AppShell → AppLayout → PageHost) → features/*
```

**What is real vs. what is scaffolding**, verified by grep/reachability rather than assumed:

- Real, end-to-end: folder browsing, daily-note calendar navigation, note creation, markdown editing (basic blur-save only), archive.
- Visually present but functionally inert: search (`SearchPanel.tsx` literally renders `Work inprogress...`), tag clicks, task clicks/checkboxes, title editing (commit handler is a no-op), favorite/width-fill topbar buttons, sidebar "+"/"more" buttons, back/forward navigation history buttons, the `References` block on a page.
- Missing entirely: rename (throws `Not implemented`), a wired "move" UI, delete (implemented in the application layer but no UI calls it).

---

## Mental Model: Execution Paths Traced From Source

### Startup — `Application.open()` (`apps/app/src/core/application/Application.ts:65-144`)

Traced in exact order from the file:

1. `SelfWriteRegistry` — a shared counter so the filesystem watcher can recognize writes the app just made itself and not re-process them as external changes.
2. `LocalVaultProvider` (raw Tauri-fs-backed I/O) wrapped by `SelfWriteAwareFileSystem`, which tags every write into the registry from step 1.
3. `VaultInitializer.initialize(rootPath)` — creates the reserved folder skeleton (`Archive`, `Daily Notes`, `Inbox`, `Templates`, `.clutter/`) if missing.
4. A **bootstrap** `ResourceCreation` is constructed (no `Vault` exists yet) purely to let `DailyNoteService.ensureToday()` write today's daily note file directly to disk before any scan happens.
5. `VaultScanner.scan(rootPath)` walks the directory tree; every `.md` file goes through `DocumentLoader` → `FrontmatterParser` (a hand-rolled line-based YAML-subset parser, not a real YAML library) → six regex-based extractors (tag/task/link/embed/heading/block-reference) → `ScannedPageFactory`.
6. `VaultBuilder.build(scanResult)` resolves stable identities (`IdentityResolver`: frontmatter `id` if present, else the file path itself), builds immutable `Page`/`Folder` objects, and derives vault-wide projections (tags, tasks, embeds, a full link/knowledge graph) — constructing the `Vault`.
7. `reconcileVaultArchiveMetadata` — a one-time consistency pass repairing stale `status: archived` frontmatter for pages that were moved out of `Archive/` externally.
8. A **second** `ResourceCreation` is constructed, now with the real `Vault`, and becomes the one actually used at runtime — the bootstrap instance from step 4 is discarded after one use.
9. The `Application` constructor wires ~14 more objects: `Workspace`, `DocumentRegistry`, `SaveCoordinator`, `MoveService`, a shared `FrontmatterSerializer`, `PagePersistenceCoordinator`, `PersistenceService`, `ResourceDeletionService`, `PageApplicationService`, `FolderApplicationService`, `NavigationService`, the watcher pair (`LocalFileSystemWatcher` wrapped by `SelfWriteAwareWatcher`), `VaultSyncService`, `PageMutationService`.
10. The filesystem watcher starts; today's daily note is looked up in the freshly built `Vault` and opened via `NavigationService.openDailyNote`.

**Depth to first render: ~15 hops.** Two pieces of duplicate wiring are visible directly in the source: `ResourceCreation` is built twice with an otherwise-identical dependency set, and `FrontmatterParser`/`FrontmatterSerializer`/`PageRebuilder` are each independently instantiated more than once (once for the archive-reconciliation pass, again for the runtime coordinator) despite being stateless and shareable.

### Editing a note — the one fully working content-mutation path

```
MarkdownEditor (contentEditable, onBlur commit)
  → NotePageModel.updateMarkdown (forwards to a callback prop)
  → PageHost's callback → PageApplicationService.updateMarkdown
      → shouldPromoteDraft(markdown): pure predicate; if the page is a 'draft'
        and now has content, promoteDraftToActive() flips its status
      → DocumentSession.commit() → new DocumentRevision
      → SaveCoordinator.beginSave()
      → PersistenceService.save() → PagePersistenceCoordinator.enqueue(pageId, op)
          (per-page async queue — this is the only serialization point in the app)
          → [MoveService.movePage if the path needs to change]
          → FrontmatterSerializer.serializeDocument → fileSystem.writeFile
          → FrontmatterParser.parse (re-read what was just written)
          → PageRebuilder.rebuild → Vault.replacePage
              → Vault.refreshProjections() — full rebuild of tags/tasks/embeds/graph
                from every page's stored analysis, not an incremental patch
      → SaveCoordinator.completeSave()
```

`shouldPromoteDraft` is worth calling out on its own: it's a small, pure, directly-testable function that adds real product behavior (draft → active lifecycle) without adding a new layer or service — it lives inside the one file that already owns editing. It's the cleanest piece of business logic found anywhere in the application layer.

**Depth: ~10-11 layers**, roughly 20 files if every type/DTO touched along the way is counted.

### Create / Delete — two paths that don't join the queue above

`ResourceCreation.createNote` and `.createDailyNote` write straight to `fileSystem.writeFile` and then call `vault.addPage`/nothing at all (daily-note creation doesn't touch the Vault synchronously — it relies on the later scan or a subsequent open). `ResourceDeletionService.delete` calls `vault.removePage` then `fileSystem.deleteFile` directly. **Neither goes through `PagePersistenceCoordinator`'s per-page queue.** Concretely: if a save is in flight for a page (queued in the coordinator) at the same moment a create or delete touches an unrelated or even the same path, there is no shared lock between the two mechanisms — they are only safe today because the UI happens not to trigger them concurrently, not because the architecture prevents it.

### External file change (someone edits a note outside the app)

```
notify (Rust) → vault_watcher.rs classifies the raw event (created/changed/deleted,
    with a hand-rolled rename-pairing algorithm using a 300ms correlation window
    to stitch together the two halves of a move/rename on filesystems that don't
    report renames atomically) → emits `vault:file-change` to the TS side
  → LocalFileSystemWatcher → SelfWriteAwareWatcher (drops events the app caused itself)
  → VaultSyncService, serialized per-path via VaultSyncCoordinator (a generic
    async-exclusion primitive, no domain knowledge in it)
  → parse → PageRebuilder → vault.replacePage / addPage / removePage / updatePagePath
  → optional archive-metadata reconciliation
  → Vault.notify() → React re-renders via the `useVault` hook
```

This is a **second, independently-implemented "write→parse→rebuild→replace" pipeline** (`sync/persistSyncedPageDocument.ts`) that duplicates the same four-step shape as `PagePersistenceCoordinator.runOperation`, just keyed by a different coordinator (`VaultSyncCoordinator` vs. the coordinator's own per-page queue) for a different trigger (external change vs. app-initiated save). The duplication is defensible — the two pipelines serve genuinely different triggers with different failure semantics — but it is a second implementation of logic that reads as if it should be one.

### Who owns what — checked against actual code, not documentation

| Responsibility                                                                          | Owner (verified in source)                                                                                                                                                                                  | One clear owner?                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Domain model (pages, folders)                                                           | `Vault` — the only object with direct mutation methods (`addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder`); does zero filesystem I/O itself                                                | Yes                                                                                    |
| Filesystem I/O                                                                          | `VaultFileSystem` interface, one real implementation (`LocalFileSystem`)                                                                                                                                    | Yes                                                                                    |
| Parse/serialize markdown                                                                | `FrontmatterParser` / `FrontmatterSerializer`                                                                                                                                                               | Yes                                                                                    |
| Edit-save write path                                                                    | `PagePersistenceCoordinator`                                                                                                                                                                                | Yes, but only for this one path                                                        |
| Create                                                                                  | `ResourceCreation`                                                                                                                                                                                          | Yes, but bypasses the above                                                            |
| Delete                                                                                  | `ResourceDeletionService`                                                                                                                                                                                   | Yes, but bypasses the above                                                            |
| External sync repair                                                                    | `VaultSyncService` / `persistSyncedPageDocument`                                                                                                                                                            | Yes, but a second independent implementation of the same shape as the coordinator      |
| Navigation intent                                                                       | `NavigationService`                                                                                                                                                                                         | Nominally yes, but more than half its public methods (8 of 15) throw `Not implemented` |
| Business capability surface as a whole (create/edit/archive/restore/delete/move/rename) | **Split across 6 files** (`ResourceCreation`, `PageApplicationService`, `PageMutationService`, `ResourceDeletionService`, `MoveService`, `NavigationService`) with 3 different write-path shapes among them | **No**                                                                                 |

---

## Architecture Metrics (measured, not estimated)

| Metric                                                  | Value                                                                                                                                                                                                                                                                                                            | Source                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Vault pipeline production files / LOC                   | 75 files / 3,495 LOC                                                                                                                                                                                                                                                                                             | direct file read + wc              |
| Application + engine + workspace production files / LOC | 23 files / 2,045 LOC                                                                                                                                                                                                                                                                                             | direct file read + wc              |
| App shell + shared components files                     | 84 (47 in `app/`, 37 in `components/`)                                                                                                                                                                                                                                                                           | direct read                        |
| Features files                                          | 63 (daily-notes 26, notes 15, tasks 10, tags 7, collection 3, markdown 1, search 1; `cover/` and `resources/` are empty directories)                                                                                                                                                                             | direct read                        |
| Orphaned `packages/` files                              | 12, 5,025 LOC, zero importers anywhere in `apps/`                                                                                                                                                                                                                                                                | grep verified                      |
| Rust source files (excluding generated/build output)    | 3 (`main.rs` 7 LOC, `lib.rs` 30 LOC, `vault_watcher.rs` ~230 LOC source + ~350 LOC tests)                                                                                                                                                                                                                        | direct read                        |
| Independent write-to-disk / mutate-Vault call sites     | 7 (`VaultInitializer`, `persistSyncedPageDocument`, `PagePersistenceCoordinator`, `MoveService`, `ResourceCreation`×2 methods, `ResourceDeletionService`, `VaultSyncService`'s own direct Vault calls)                                                                                                           | traced in vault-pipeline audit     |
| `NavigationService` methods: implemented / stub         | 7 / 8 (of 15 public methods)                                                                                                                                                                                                                                                                                     | read method bodies                 |
| Speculative/unconsumed vault projections                | Knowledge graph, link resolution, embeds, aliases — all built, tested, and rebuilt on every mutation; zero non-test consumers found via grep for `.knowledgeGraph`, `.embeds()`, `.aliases` outside `core/vault`                                                                                                 | grep verified                      |
| Confirmed dead files (zero importers, verified by grep) | 7: `components/divider/Divider.tsx`, `components/icon-slot/IconSlot.tsx`, `components/overlay/index.ts` (unused barrel), `features/tags/helpers/groupFavoriteTags.ts`, `features/tasks/helpers/getCompletedTasks.ts`, `features/tasks/helpers/groupByDate.ts`, `features/tasks/helpers/renderCompletedTasks.tsx` | grep verified per-file             |
| Duplicate object construction in the composition root   | `ResourceCreation` (2×), `FrontmatterParser` (2×), `FrontmatterSerializer` (2×, one shared + one one-off), `PageRebuilder` (2×)                                                                                                                                                                                  | read `Application.ts` line by line |
| Total commits / span                                    | 939 commits, 2026-01-02 → 2026-07-31                                                                                                                                                                                                                                                                             | `git log`                          |

---

## Layer-by-Layer Audit

### Rust / Tauri boundary (`apps/app/src-tauri/`)

The cleanest-wired part of the codebase. Rust owns exactly one thing — native filesystem watching, including a genuinely well-designed rename-pairing algorithm (`vault_watcher.rs`) needed because macOS FSEvents doesn't correlate the two halves of a rename. Everything else (read/write/list/mkdir/delete) goes through the Tauri fs plugin directly from TypeScript, not custom Rust. The two registered commands (`start_vault_watcher`, `stop_vault_watcher`) have exactly one call site each, in `LocalFileSystemWatcher.ts`. No dead code, no partial integration, no speculative surface. **This is the layer to point to when arguing the team can build a minimal, correctly-scoped boundary.**

### Vault pipeline (`core/vault/`)

`Vault` is a genuine single source of truth: no filesystem I/O of its own, explicit invariant checks (duplicate-id detection, path-availability assertion), and every projection (tags/tasks/embeds/graph) is fully disposable and rebuilt from stored per-page analysis on every mutation — by design, trading O(n) rebuild cost for zero drift risk. That trade-off is reasonable at current file counts.

The problem isn't the model, it's the ingestion machinery built to feed it. A full link-resolution/knowledge-graph subsystem (`KnowledgeGraphBuilder`, `LinkResolver`, `PageIndex`, `GraphEdge`) is fully implemented, unit-tested, and rebuilt on every single page mutation — and has **zero consumers outside its own tests**, confirmed by grep. The same is true of embeds and aliases. Two of the six per-page extractors (heading, block-reference) exist solely to feed this dead-end graph. Tags and tasks, built with the identical extractor→builder pattern, _are_ real — the sidebar reads them — so this isn't "the whole knowledge layer is premature," it's specifically the link/graph/embed/alias branch of it.

### Application layer (`core/application/`)

This is where the ownership problem concentrated is most visible, and the recent history of the codebase (see Evolution, below) shows it getting more entrenched, not less, over time. Six services exist where the "one capability, one owner" principle (implied by the write-gate pattern that already works for edit and archive) would suggest one:

- **Three distinct write shapes** exist for what a user experiences as "save my data": (1) `PagePersistenceCoordinator`'s queued write→parse→rebuild→replace, used for edit/archive/restore; (2) `ResourceCreation`'s direct write with no queue, used for create; (3) `ResourceDeletionService`'s direct delete with no queue. Only the first has any protection against a concurrent operation on the same page.
- `NavigationService` is a facade whose implemented half (`openNote`, `openDailyNote`, `openFolder`, `openArchive`, `openInbox`, `createNote`, `openTemplates`) is genuinely useful, but its other half (`openFavorites`, `openAllNotes`, `createTask`, `openAllTasks`, `openSomedayTasks`, `openCompletedTasks`, `createTag`, `openAllTags`) throws — and these aren't dead stubs sitting unused; they're wired live to shortcut-key handlers in `features/tasks`, `features/tags`, and `features/notes`, meaning a user pressing the documented shortcut today gets a runtime exception.
- `PageMutationService.restorePage` is fully implemented and tested but has **zero callers anywhere in the UI** — "Restore" as a user action doesn't exist, only "Archive" does, despite both being implemented with equal care.
- `ResourceDeletionService.delete` is implemented, tested, wired into the composition root — but has no UI entry point at all. Delete, as a user-facing capability, does not exist yet, even though its backend is done.
- `PageApplicationService.renamePage` throws unconditionally; both `NotePageModel.rename()` and `updateDescription()` (on both note and daily-note view models) throw as well.

### Document engine (`core/engine/`)

Six files implementing session/revision/transaction/save-coordination for what is currently a plain `contentEditable` blur-save editor. Reading the code, this genuinely looks designed for a future richer editor (undo/redo, concurrent views, structured transactions) rather than what today's `MarkdownEditor.tsx` needs — that component's own top-of-file comment says it is "intentionally read-only" in its initial form and richer editing "will be introduced incrementally." The engine is well-built and well-tested; it's just early relative to the feature that would justify its full shape.

### UI layer (`app/`, `components/`, `features/`)

**Composition root:** `AppShell.tsx` hardcodes an absolute filesystem path to a specific developer's machine (`/Users/.../Personal/Vault`), with an explicit `// TODO: Replace with the folder picker.` comment acknowledging it. There is no router — navigation is entirely in-memory `Workspace` state (`activePageId`/`activeFolderId`), so a page reload loses all navigation position.

**Real duplication, not just naming similarity:** `NoteTopBarActions.tsx`, `FolderTopBarActions.tsx`, and `DailyNoteTopBarActions.tsx` are near-byte-identical ~60-line components differing only in which menu config they import. `NotePageModel.ts` and `DailyNotePageModel.ts` share the same shape including the same two throwing stub methods, copy-pasted rather than shared. Five different sidebar entry components (`Folder`, `Note`, `Tag`, `Task`, `DailyNote`) each independently wrap the shared `Entry` primitive with the same unwired "more" button.

**Shipped-ahead-of-its-data-model UI:** `Reference.tsx` (a "References" expandable summary row) is rendered in `Page.tsx` with **zero props**, even though its own type declares `isExpanded` and `onExpandToggle` as required — it can never expand and always shows all counts as zero. `Controls.tsx`'s back/forward history buttons are rendered permanently disabled with no handler at all; `Workspace` doesn't even track the history they'd need. This is the same shape as the no-op title-edit handler (`Page.Title.tsx` passes `onCommit={() => {}}` to `EditableText`, so typed title edits are silently discarded) — UI wiring exists, but nothing behind it does.

### Orphaned `packages/`

A complete, self-consistent, well-tested standalone block-based editor engine (568-line pure state/reducer core, a command layer, undo/redo history, a DOM renderer, a React controller — 5,025 LOC total) exists in `packages/engine` and `packages/editor`. It is not an npm workspace member (root `package.json`'s `workspaces` field is `["apps/*"]` only, and neither package even has its own `package.json`), it has zero import sites anywhere under `apps/`, and its one reference in `apps/app/tsconfig.json` (`include: [..., "../../packages/engine/editor"]`) points at a path that doesn't exist. Git history confirms it was superseded: it was extracted in a commit dated 2026-06-30 ("extract editor package (Phase 3)"), and the currently-live, differently-architected editor system (`core/engine/*`, `features/markdown/MarkdownEditor.tsx`) was built afterward, last touched 2026-07-29, using an entirely different vocabulary (no `PrimitiveOp`/`applyOp`/`EditorController` concepts anywhere in the live code). This is a fully dead architectural branch, not a partially-integrated one.

---

## Abstraction Justification Matrix

| Abstraction                                         | Real problem it solves                                                                                    | Serves today's product?                                                                                          | If removed tomorrow                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `VaultFileSystem` interface                         | Storage independence, testability (`InMemoryVaultFileSystem` exists for tests)                            | Yes                                                                                                              | Must hardcode Tauri fs calls everywhere                                                                                    |
| `SelfWriteRegistry` + wrapper pair                  | Prevents the watcher from re-processing the app's own writes as external changes — a real, hard bug class | Yes                                                                                                              | Sync echo bugs return                                                                                                      |
| `PagePersistenceCoordinator`                        | Serializes concurrent writes to the same page                                                             | Yes, for the 1 of 3 write paths that use it                                                                      | Data races return for edit/archive                                                                                         |
| `VaultSyncCoordinator`                              | Serializes concurrent external-change handling per path                                                   | Yes                                                                                                              | Race conditions on rapid external edits                                                                                    |
| `IdentityResolver`                                  | Stable IDs survive path renames                                                                           | Yes                                                                                                              | Renaming a file would orphan its identity                                                                                  |
| `shouldPromoteDraft`                                | Draft → active lifecycle rule                                                                             | Yes                                                                                                              | Notes would never leave draft status                                                                                       |
| `NavigationService`                                 | Named-intent facade over page/folder services                                                             | Partially — half its surface throws                                                                              | Wiring UI directly to the underlying services loses little; the stub half loses nothing since it doesn't work today anyway |
| `KnowledgeGraphBuilder`/`LinkResolver`/`PageIndex`  | Would resolve `[[links]]` into a queryable graph                                                          | **No current consumer**                                                                                          | Nothing in the running app changes; a real perf cost (full rebuild every mutation) disappears                              |
| `EmbedBuilder`/embed model                          | Would surface `![[embeds]]`                                                                               | **No current consumer**                                                                                          | Nothing changes                                                                                                            |
| Alias extraction                                    | Would support alternate note names/redirects                                                              | **No current consumer**                                                                                          | Nothing changes                                                                                                            |
| `core/engine` (6-file document session/save engine) | Structured editing lifecycle for a richer future editor                                                   | Overbuilt for today's blur-save `contentEditable`                                                                | Could collapse to `{markdown, dirty, revision}`; would need rebuilding if/when the richer editor lands                     |
| `packages/engine` + `packages/editor`               | A different, more complete block-editor design                                                            | **No — entirely unreachable from the running app**                                                               | Nothing changes; it isn't running today                                                                                    |
| `ResourceCreation`'s direct-write bypass            | Lets daily-note bootstrap happen before a `Vault`/session exists                                          | Yes, but the same bypass persists for regular note creation after the vault exists too, which has no such excuse | Would need routing through the coordinator, which is exactly the fix this review recommends                                |
| `ResourceDeletionService`'s direct-write bypass     | None found — deletion happens after the vault and coordinator both exist                                  | No — this is a newer instance of the same pattern with no bootstrap justification                                | Routing it through the coordinator costs nothing and closes a real race window                                             |

---

## Execution-Path Locality of Change

### Archive (implemented) — the pattern worth keeping

`PageHost` → `PageMutationService.archivePage` → `PagePersistenceCoordinator.enqueue` → (`MoveService` if the path changes) → `Vault.replacePage`. **5 essential files**, no forwarding-only hops inside the business logic itself. Adding a new caller (e.g., a command palette) requires exactly one new call site; the mutation logic doesn't change. This is the one place in the app where the stated goal ("implement once, expose everywhere") is actually achieved.

### Create Note (implemented, but worse than Archive)

`NavigationService.createNote` → `ResourceCreation.createNote` → `PagePathResolver` (collision-free naming) + `PageCreator`/`PageFactory` (content assembly) → direct `fileSystem.writeFile` → `vault.addPage`. **6 files, bypasses the one write-serialization mechanism that exists.** A second UI entry point for "create note" (e.g. drag-and-drop a template) would need to know to call `ResourceCreation` directly or through `NavigationService` — there's no single obvious answer, because the capability doesn't have one home.

### Delete (implemented backend, zero UI entry points)

`ResourceDeletionService.delete` → `vault.removePage` + `fileSystem.deleteFile`, fully wired into the composition root and unit-tested, but grep across `app/` and `features/` finds no caller. To ship "Delete Note" as a real feature today requires: one UI entry point, and ideally routing the existing service through the coordinator first (see Roadmap).

### Move (not implemented as a user-facing feature)

`MoveService.movePage` exists and is exercised today only as a side effect of Archive/Restore (when a page's parent folder changes). No standalone "Move to…" UI calls it directly. Building that feature with the current shape would touch: a UI entry point, `PageMutationService` (to add a public `movePage(pageId, destFolderId)` that calls the coordinator the same way archive does), and nothing else new — because the coordinator and `MoveService` are already built and already correct. **This is actually a low-cost feature to add**, contrary to what the proliferation of services elsewhere might suggest; the archive pattern already proves the path.

### Rename (not implemented at all)

`PageApplicationService.renamePage` throws unconditionally; there is no serializer/rebuilder support traced for a rename-only (no content change) update. This would need: a new coordinator operation shape (currently `runOperation` assumes either content changed or path changed via `MoveService`, not "title/frontmatter field changed, path unchanged"), plus UI wiring in three near-duplicate topbar components. Genuinely more work than Move, because the coordinator's operation shape doesn't have a slot for it yet.

---

## Folder Structure — Does It Reflect the Domain?

Reading the actual folder names against what a new engineer would need to answer ("where does Move Page live?", "where does Delete live?"): the current structure names pipeline _stages_ (`discover/understand/build/knowledge/sync`) rather than product _capabilities_. Someone looking for "how do I delete a note" has to already know it's under `application/deletion/`, not `application/page/` where `PageApplicationService` and `PageMutationService` (which owns archive, a very similar capability) both live. The three-way split between `application/creation/`, `application/deletion/`, and `application/page/` for what are conceptually one aggregate's lifecycle operations is the clearest folder-level evidence of the ownership fragmentation identified above.

`features/` folders, by contrast, do read as product domains (`daily-notes/`, `notes/`, `tasks/`, `tags/`) — that part of the tree is easy to navigate.

---

## Naming Audit

Reading class names against what they actually do:

- `NavigationService` — the name promises more than half the class delivers; 8 of 15 methods throw. Not a naming problem, an implementation gap the name papers over.
- `ResourceCreation` / `ResourceDeletionService` — inconsistent noun choice (`Resource`) versus the rest of the application layer's `Page`-prefixed names (`PageApplicationService`, `PageMutationService`). Minor, but it's a real signal that these weren't designed as part of one family.
- `PagePersistenceCoordinator` — accurately named; it does coordinate, it does own persistence.
- `MoveService` — accurately named for what it does, but it's not actually a public capability the way its name implies; it's a private collaborator of the coordinator and a step inside Archive.
- `core/engine` vs. `packages/engine` — a genuine collision. Anyone grepping for "engine" gets two unrelated systems, one dead. This should be resolved regardless of what happens to `packages/`.
- `ScannedPageFactory` — "Factory" for what is, on reading it, a straightforward DTO mapper; the name implies more machinery than the 10-ish line body has.

---

## Architecture Evolution — From Git History Directly

939 commits, January 2 to July 31, 2026. Reading the log itself (not any summary of it) shows a clear, repeating shape:

- **Editor churn dominates the early-to-mid history.** Commit messages trace ProseMirror → TipTap → a custom keyboard-rule engine, with explicit "Phase" numbering (`chore(editor): extract editor package (Phase 3)`, `feat(editor-core): Phase 2 - Define editor boundary contracts`, `refactor(editor): Phase 6 - keyboard rule engine architecture`), architectural-boundary enforcement via ESLint (`feat(arch): enforce architectural boundaries with ESLint`), and repeated "remove duplicate types/stores after Phase N migration" commits — a strong signature of layered rework that kept surfacing new duplication rather than eliminating it in one pass.
- **A monorepo package split happened and was later abandoned.** The `packages/engine`/`packages/editor` extraction (dated 2026-06-30) is real, tested, working code — and dead on arrival relative to the app that ships today, which moved on to a different design (`core/engine`) less than a month later (2026-07-29).
- **The vault pipeline is comparatively young and was built with its full shape upfront** — the knowledge-graph/link-resolution/embed/alias machinery exists at the same maturity level as tags/tasks despite having no consumer, which is the signature of building the general pipeline before the specific feature that would validate one branch of it.
- **The application-layer fragmentation is not shrinking.** The most recent application-layer commits in the log add `ResourceDeletionService` and refine `ResourceCreation`/`PagePathResolver` — both continuing the multi-write-path pattern rather than consolidating onto the one queue that already exists and works for edit/archive.

**Net reading:** editor complexity was churned and eventually simplified (the current `core/engine` is a clean, much smaller design than what came before it, even if the older `packages/` version is more complete on paper). Vault/application complexity, by contrast, has been additive — new capabilities keep landing as new parallel services rather than extensions of the one mechanism that already handles concurrency correctly.

---

# Findings, Organized by the Review's Own Success Criteria

## 1. Locality of change

**Met for exactly one capability (Archive).** Every other traced capability (Create, Delete, and the not-yet-built Rename) requires touching a different combination of files because there are three distinct write-path shapes instead of one. Move is the interesting exception: because it already reuses the Archive machinery internally, building a standalone "Move Page" UI feature would be cheap — the infrastructure already generalizes, it's just not exposed.

## 2. Stable capabilities

**Not met.** There is no `pageStore.move(...)`-style single entry point. A UI author today must know to call `NavigationService` for some things, `PageMutationService` for archive/restore, `ResourceCreation` directly for create (`NavigationService.createNote` does forward to it, so this one is partially unified), and there is no path at all for delete or rename from the UI layer.

## 3. Extensibility (storage backend)

**Partially met.** `VaultFileSystem` is a real, minimal interface (8 methods) with one concrete implementation and a working in-memory test double — genuine evidence the seam works. But path-string logic leaks well past that boundary: `MoveService`, `PagePathResolver`, `IdentityResolver`'s path-as-fallback-id, and `Vault`'s own `pagesByPath`/`foldersByPath` indexes all assume POSIX-style paths from a single local root. Swapping in a cloud backend would require touching all of those, plus the composition root (which hardcodes `LocalVaultProvider` and `LocalFileSystemWatcher`), even though the core `Vault`/UI/features layers would be untouched.

## 4. Change surface

Measured directly per capability above: Archive = 5 files, 0 wasted hops. Create = 6 files, 1 bypassed safety mechanism. Delete = fully built but 0 UI files (the change surface to _ship_ it is 1 file; the change surface to make it _safe_ is routing it through the coordinator first). Rename = not yet buildable without extending the coordinator's operation shape. The variance across these four numbers, for capabilities a user would consider structurally identical ("do something to a page"), is itself the clearest evidence that the change surface is determined by which service happened to implement a given capability rather than by the nature of the capability itself.

---

# Executive Verdict

**Keep:** the vault domain model (`Vault`), the storage interface (`VaultFileSystem`), the self-write-echo-suppression pattern, `PagePersistenceCoordinator`'s per-page queue, the Rust watcher boundary, and the `shouldPromoteDraft` style of adding logic (small, pure, inside an existing owner).

**Fix before adding another capability:** route `ResourceCreation` and `ResourceDeletionService` through `PagePersistenceCoordinator` instead of writing directly — this closes the one concrete correctness gap found (no serialization between create/delete and the edit/archive queue), and it's the same fix for both, since both bypasses have the identical shape.

**Consolidate, don't rewrite:** merge the public surface of `PageApplicationService`, `PageMutationService`, `ResourceCreation`, `ResourceDeletionService`, and `MoveService` into one capability-owning module. The internals (coordinator, `Vault`, `MoveService`) don't need to change — only the number of front doors does.

**Delete outright, no migration needed:** the 7 confirmed dead files, the `packages/engine`/`packages/editor` branch (5,025 LOC, zero reachability), and the unused `overlay` barrel export.

**Leave alone until a consumer exists:** the knowledge-graph/link/embed/alias machinery in `core/vault/knowledge`. It's not broken, it's just ahead of a feature that hasn't been built — don't spend effort ripping it out, but don't add to it either until something reads it.

| Dimension                        | Score (1-10) | Basis                                                                                                                                                                                                                      |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simplicity                       | 4            | 3 different write-path shapes for what is conceptually one operation category (mutate a page)                                                                                                                              |
| Maintainability                  | 5            | Genuinely strong test coverage where correctness matters most (persistence, sync, path resolution); ownership questions ("where does delete go") don't have a one-word answer                                              |
| Modularity                       | 6            | Vault/storage/Rust boundaries are clean and swappable; application-layer boundaries are not                                                                                                                                |
| Extensibility                    | 6            | Storage swap is realistic given the interface; new capabilities keep arriving as new parallel services instead of extending the one proven mechanism                                                                       |
| Locality of change               | 4            | 5 files for Archive vs. 6 files + a bypassed safety net for Create — the same class of feature costs different amounts for no principled reason                                                                            |
| Correctness                      | 7            | The one queue that exists is correct and tested; the two paths that avoid it (create, delete) are the actual risk, not because bugs have shown up yet but because nothing prevents them                                    |
| **Overall architectural health** | **5/10**     | Strong foundations (Vault, storage interface, Rust boundary, write queue) undermined by a pattern — new capability arrives as new bypass service — that has now repeated at least three times across the project's history |
