# Clutter Architecture Review — v1.1

Status: in progress. Reviewed layer by layer per `Clutter Architecture Review Plan`.
Legend: ✅ keep · ✏️ modify · ⏸️ postpone · ❓ open question

---

## Phase 1 — Core Philosophy (in progress)

Decision under test: Markdown = source of truth, Vault = in-memory representation, Indexes = derived, UI = projection.

Observations from `Vault.ts` (see Phase 3 below) that bear on this:

- `Vault` does no filesystem I/O itself — confirmed by its doc comment and by construction (constructor takes already-parsed `pages`/`folders`/`tags`/`tasks`/`embeds`). ✅ consistent with Markdown-as-source-of-truth.
- However, `updatePagePath()` and `replacePage()` mutate the in-memory `Page` directly (`{...page, path}`) without going back through the frontmatter/content parsing pipeline that produced the original `Page`. If that pipeline is not perfectly reproducible from the resulting object, the in-memory Vault can drift from what re-parsing the file would produce. ❓ Needs a Phase 5 cross-check (see below).
- Nothing in `Vault.ts` re-derives its state from disk on demand — recovery from a corrupted in-memory cache depends entirely on whatever orchestrates a full rebuild (not in this file). ❓ open question: is "rebuild Vault from Markdown" a cheap, always-available operation, or only run at startup?

---

## Phase 2 — Domain Model

### Page (`models/Page.ts`)

```ts
interface Page {
  id: string;
  type: PageType;
  name: string;
  path: string;
  parentId: string | null;
  metadata: PageMetadata;
  source: PageSource;
  analysis: PageAnalysis;
}
```

- `id` is documented as stable across rename/move (`IdentityResolver.resolvePage`). Immutability is a *convention*, not enforced — nothing stops a caller from constructing a `Page` with a different `id` for the same file. Low risk today since only `PageBuilder`/`PageRebuilder` construct pages.
- `path` is correctly *not* part of identity — `Vault` keys pages primarily by `id` and treats `pagesByPath` as a secondary index that gets updated on move (`updatePagePath`, `replacePage`). ✅ correct call.
- `name` is derived from the filename (`PageBuilder.getPageName`), not frontmatter, even though `PageMetadata`-adjacent concerns (description, icon, etc.) do come from frontmatter. ❓ worth confirming this is intentional — if a user wants a display name different from the filename, there's currently no path for that.
- `analysis` (headings, aliases, block refs, tasks, tags, links, embeds) lives directly on `Page`, and `Vault` *also* keeps vault-wide flattened arrays (`taskList`, `embedList`) that are populated once at construction time and never reconciled with `replacePage`/`addPage`/`removePage`. **This is a real bug risk**, not just a coupling concern — see Phase 3 finding below.

### Folder (`models/Folder.ts`)

```ts
interface Folder {
  id: string; name: string; path: string; parentId: string | null; metadata: FolderMetadata;
}
```

- Folder is a distinct type from `Page`, not a `Page` subtype/variant — deliberate per the model shapes (no `source`/`analysis`). Reasonable if folders never carry document content.
- `Vault` has no `foldersByPath` index, only `foldersById` — asymmetric with pages, which have both. If any consumer needs "find folder for this filesystem path" (e.g., the file watcher, which naturally emits paths), that lookup doesn't exist yet. ❓ flagged for Phase 3 discussion below.
- Rename/move handling for folders has no equivalent to `Page.updatePagePath` — no `updateFolderPath` on `Vault`. ❓ open question: how are folder renames currently propagated?

### Task

- `TaskOccurrence` is stored both as `Page.analysis.tasks` (owned by the page) and flattened into `Vault.taskList` at construction. There is no `updateTasksForPage` step wired into `replacePage`, so **`Vault.taskList` goes stale the first time any page is edited, archived, or rebuilt after startup.** This is the most concrete correctness issue found in this file — see below.

---

## Phase 3 — Vault Architecture (deep review — `apps/app/src/core/vault/models/Vault.ts`)

### Structure

Indexes maintained:
- `pagesById: Map<string, Page>`
- `pagesByPath: Map<string, Page>`
- `foldersById: Map<string, Folder>`
- `tagsByName: Map<string, Tag>`
- `taskList: TaskOccurrence[]` (flattened, denormalized from `Page.analysis.tasks`)
- `embedList: Embed[]` (flattened, denormalized from `Page.analysis.embeds`)

### Findings

**1. Denormalized `taskList`/`embedList` are never updated after construction (bug).**
`replacePage()`, `addPage()`, `removePage()`, and `updatePagePath()` all mutate `pagesById`/`pagesByPath`, but none of them touch `taskList` or `embedList`. Since a page's `analysis.tasks`/`analysis.embeds` can change (e.g. `PageMutationService.archivePage` produces a `rebuiltPage` with re-parsed analysis, and `VaultSyncService.handleChanged` does the same for external edits), `Vault.tasks()`, `Vault.taskCount`, `Vault.embeds()`, `Vault.embedCount` will silently drift from reality as soon as any page changes post-startup.
- Impact: any UI bound to `vault.tasks()`/`taskCount` (e.g. a task list or count badge) will show stale data after the very first edit.
- This looks like exactly the class of bug the plan's Phase 7 note already found once for folders ("component held an old Vault reference") — same shape, different index.
- **Decision needed:** ✏️ modify — either (a) recompute `taskList`/`embedList` incrementally inside `replacePage`/`addPage`/`removePage` by diffing `existing.analysis` vs `page.analysis`, or (b) drop the flattened arrays entirely and make `tasks()`/`embeds()` computed generators that walk `pagesById.values()` on demand (mirrors how `notes()`/`dailyNotes()` already work). Option (b) is simpler and removes a whole class of sync bugs at the cost of O(pages) iteration per call — likely fine given `pagesById` is already iterated for `notes()`.

**2. Index asymmetry: pages have `byId` + `byPath`, folders/tags do not.**
`foldersById` has no `foldersByPath` counterpart; `tagsByName` is the only tag index (fine, tags are name-identified, no separate path). Given `VaultSyncService` and any future folder-rename support will naturally arrive with a filesystem *path*, not an id, folder lookups by path have no home yet.
- **Decision needed:** ❓ postpone until Phase 4 folder-sync design is discussed, but flag now: if folder rename/move is coming, `foldersByPath` should be added at the same time as `updateFolderPath`, mirroring the existing page pattern exactly.

**3. Mutation methods duplicate index-maintenance logic with subtly different bodies.**
`replacePage` and `updatePagePath` both do "delete old path key if changed, set new path key," but with different code paths and different event semantics (`replacePage` infers `page-changed` vs `page-moved` from whether `existing.path !== page.path`; `updatePagePath` always fires `page-moved` and constructs the updated page itself via spread). Two ways to move a page exist:
- `replacePage(pageWithNewPath)` (used by `PageMutationService`/`VaultSyncService` after rebuilding a full page)
- `updatePagePath(pageId, newPath)` (constructs the moved page internally via a bare spread, bypassing `PageRebuilder`)
`updatePagePath`'s bare `{...page, path}` means a path-only move does **not** go through the frontmatter/analysis rebuild pipeline that every other mutation path uses — its `analysis` (which may reference the old path, e.g. in derived link targets) is carried over unchanged. If nothing currently reads path-derived data out of `analysis`, this is latent; if anything does, it's silently wrong immediately after a move.
- ❓ Is `updatePagePath` actually called anywhere yet, or is it dead API surface ahead of use? Worth checking before deciding whether to fix or delete it.

**4. Event model is coarse but appropriately so for now.**
`VaultChangeEvent` is a 4-variant union (`page-changed` / `page-added` / `page-removed` / `page-moved`), each carrying just `pageId` (+ `path` for moves) — listeners must re-fetch from `Vault` rather than receiving a payload. This is a reasonable, low-risk shape (no stale payload data to go wrong) and matches "Vault is the single source of truth for current state, events are just invalidation signals." ✅ keep.
- No `folder-*`, `tag-*`, `task-*`, or `embed-*` events exist yet. Combined with finding #1, this means even if `taskList` were kept correct, there's no notification for "a task changed" — a task-aware UI would have to listen to `page-changed` and re-derive. Acceptable for now if nothing subscribes at task granularity yet.

**5. Constructor invariants are solid.**
Duplicate ID checks for pages/folders/tags in the constructor are good — the class refuses to represent an invalid vault state at construction time rather than degrading silently later. ✅ keep.

**6. `Vault` has no way to add/remove/rename folders or tags after construction**, only pages. Given the plan explicitly asks "how does folder rename work?" in Phase 2, the answer today is: **`Vault.ts` has no API for it at all.** Whatever currently handles folder rename (if anything does) must be doing it outside this class, or folder rename isn't implemented yet. ❓ needs confirmation before Phase 4/6 review.

### Mutation ownership (cross-file, per plan's "Mutation ownership" question)

Traced call sites into `Vault.replacePage`:
- `PageMutationService.archivePage` (user-initiated structural mutation) → rebuild via `PageRebuilder` → `vault.replacePage`.
- `VaultSyncService.handleChanged` (external file-change-triggered mutation) → rebuild via `PageRebuilder` → `vault.replacePage`, then separately reconciles the live `DocumentSession` if one exists and isn't dirty.

Both paths go through `PageRebuilder` before touching `Vault`, so — with the caveat of finding #3 above (`updatePagePath` bypasses this) — **mutation is centralized through one rebuild pipeline feeding one `Vault` API.** ✅ keep, once `updatePagePath` is either aligned or removed.

One smaller note: `VaultSyncService.handleChange` has `console.log` debug statements left in (`'SYNC CHANGE'`, `'RESOLVED'`, `'PAGE'`) — not architectural, but worth cleaning up before this is considered settled. ✏️ minor.

---

## Phase 4 — Filesystem Layer

Not yet reviewed in depth. One relevant thread already surfaced from Phase 3: `VaultSyncService.resolvePath()` does `${vault.root}/${relativePath}` to turn the watcher's relative path into the absolute path that `pagesByPath` is keyed on (paths from `VaultScanner` appear to be absolute, seeded from the absolute `vaultPath` passed to `scan()`). This matches the plan's noted "Rust → relative path, Vault → absolute path" issue, and confirms `VaultSyncService` is currently where that normalization happens. Whether that's the *right* place is still open — pending full `providers/` review.

## Phase 5 — Build Pipeline

Not yet reviewed. Flagged dependency from Phase 3: confirm `PageRebuilder`'s parsing path is identical to `PageBuilder`'s startup parsing path (plan's core Phase 5 concern), since `Vault`'s correctness guarantees above assume every mutation goes through equivalent rebuild logic.

## Phase 6 — Application Layer

Not yet reviewed.

## Phase 7 — UI State Architecture

Not yet reviewed. Prior known bug (stale Vault reference in a folder-consuming component, fixed via `useVault()`) is the same *shape* of bug as Phase 3 finding #1 (stale denormalized state) — worth keeping in mind as a recurring pattern to design against, not just patch instance-by-instance.

## Phase 8 — Naming & Code Quality

Not yet reviewed.

---

## Decisions Log

| # | Item | Decision | Status |
|---|------|----------|--------|
| 1 | `Vault.taskList`/`embedList` go stale after any page mutation | Fix required | ✏️ pending fix approach (recompute vs. on-demand) |
| 2 | `foldersByPath` missing | Add when folder move/rename is implemented | ⏸️ postponed to Phase 4 |
| 3 | `updatePagePath` bypasses rebuild pipeline | Confirm call sites, then fix or delete | ❓ pending investigation |
| 4 | `VaultChangeEvent` shape | No change | ✅ keep |
| 5 | Constructor duplicate-ID validation | No change | ✅ keep |
| 6 | `console.log` debug statements in `VaultSyncService` | Remove | ✏️ minor, low priority |
| 7 | No folder/tag mutation API on `Vault` | Confirm whether folder rename exists anywhere today | ❓ pending investigation |
