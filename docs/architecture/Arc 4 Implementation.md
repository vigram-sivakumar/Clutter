Architecture Status

Version: 1.0
Status: Draft — implementation plan for Arc 4

Every claim in this document is derived from inspecting the actual repository (verified 2026-07-27), not from prior summaries. File paths and line-level evidence are cited throughout. Where the codebase already answers a question, that answer is stated as fact, not opinion.

# Arc 4 — Folders and the Concept of "Openable Things"

## Pre-work: six questions, answered from the code

### 1. What exactly is a "page" in the current architecture?

A `Page` (`core/vault/models/Page.ts`) is a markdown file with a stable `id`, a `PageType` (`'note' | 'daily-note'` — line 10), a `parentId`, `PageMetadata`, durable `PageSource.markdown`, and extracted `PageAnalysis`. Operationally, "being a page" means three things are true: it was produced by `PageBuilder` during a vault scan, it is addressable via `Vault.getPage(id)`, and it _can_ be opened into a live `DocumentSession` via `PageApplicationService.openPage()`.

Folders are explicitly excluded from this. `VaultScanner.scanDirectory` filters `.folder.md` out of `pageFiles` by name (`entry.name !== '.folder.md'`) before anything becomes a `ScannedPage`. So today, **"page" means "editable document," not "anything the user can navigate to."** This distinction is the reason Folder pages don't fit the existing pipeline — not a naming accident.

### 2. Is Workspace fundamentally document-centric or page-centric?

Document-centric, despite the field name. `Workspace` (`core/workspace/Workspace.ts`) exposes exactly `_activePageId`, `openPageIds`, `openPage()`, `closePage()`, `isPageOpen()` — every one of these exists to track ids that pair 1:1 with a `DocumentSession` via `PageApplicationService`. `Workspace` has zero knowledge of `Folder`, `Tag`, or anything non-document. It is, honestly, a _document-session tracker_, not a general "what is the user looking at" tracker. That's a correct design for what it's needed for so far — it just doesn't yet cover folders.

### 3. How should Folder pages fit into the current architecture?

As a second, independent "thing being viewed" that never touches the `DocumentSession` pipeline. A folder needs: identity (`Folder.id`), metadata (icon/favorite, and — see below — description/cover once added), and its direct children, which are already computable via the existing `getChildFolders`/`getChildPages` helpers (`features/notes/helpers/`). It is a read-only projection over data the `Vault` already holds, never an editable document.

### 4. Does Workspace/PageApplicationService/PageHost naturally support Folder pages, or is a new abstraction needed?

No, and a _small_ new abstraction is needed — not a redesign. Evidence: `PageHost.tsx` dispatches purely off `session.page.type`, where `session` comes from `pageService.getSession(activePageId)`. There is no `session` for a folder, ever — `DocumentRegistry`/`PageApplicationService` only ever construct sessions from `Vault.getPage()`, and folders never register there. `Workspace.activePageId` is the one field representing "what's shown"; it cannot represent "a folder is shown" without conflating a folder id with a page id, which would be actively wrong (nothing stops a folder id and a page id from being the same string in principle, and every consumer of `activePageId` assumes it resolves through `Vault.getPage`).

The fix is one new field and one new branch, not a rewrite: a parallel `activeFolderId` on `Workspace`, and one more case in `PageHost` before its existing switch.

### 5. Should folders, tags, favorites, tasks, and search all share one navigation model?

Not yet — and there's already evidence in the repo for why not. `FavoriteEntry` (`features/notes/models/FavoriteEntry.ts`) already shows a working, minimal pattern for listing heterogeneous vault items together: `{ id, title, type: 'note' | 'folder' }`. That's a **display/list** concern, and it's already solved where it's needed (the Favorites section).

The **workspace-open** concern is different, and unifying it prematurely isn't justified. Only Notes, Daily Notes, and — after this milestone — Folders will have real "opening behavior" in the application. Tags, Tasks, and Search do not currently support opening behavior, and no such abstractions are present in the repository. Introducing a shared navigation model for these would be speculative and unsupported by current evidence.

Arc 4 is intentionally scoped to Folder pages only. Tag or Task pages should only influence the architecture once they become real implementations.

### 6. Is there an architectural inconsistency that should be resolved before implementing FolderPage?

Yes, one very concrete one: `renderNotesTree.tsx` already renders every folder row in the sidebar with `onClick={() => {}}` — a literal no-op (`features/notes/helpers/renderNotesTree.tsx`, `<FolderEntry ... onClick={() => {}} />`). This isn't a UI surface that needs to be built; it's an existing dead handler waiting for something real to call. Wiring it up is part of this milestone, not a separate task.

Second: `FolderFrontmatter`/`FolderMetadata` have no `description`/`cover` fields (confirmed by direct inspection — both interfaces list only `id`/`icon`/`favorite`). This must be extended in this milestone, since it's the literal subject of the FolderPage goal — deferring it means shipping FolderPage with permanently-empty fields again.

---

## Goals

- Make folders a first-class "openable" concept in the Workspace, without pretending they are editable documents.
- Complete the folder domain model (`description`, `cover`) so FolderPage can render real data instead of hardcoded placeholders.
- Wire the existing dead sidebar click handler so folders are actually reachable.
- Ship a working, read-only FolderPage: title, description, cover, breadcrumbs, direct child folders, direct child notes.

## Scope

- `Workspace` gains an `activeFolderId`, mutually exclusive with `activePageId`.
- A new `FolderApplicationService`, parallel to `PageApplicationService` but without a `DocumentRegistry` dependency (folders never have sessions).
- `FolderFrontmatter` → `FolderMetadata` → `VaultBuilder` extended with `description`/`cover`, mirroring the existing `PageFrontmatter`/`PageMetadata`/`PageBuilder` pattern exactly.
- `buildBreadcrumbs` overloaded for `Page | Folder`, sharing one private ancestor-walk internally, because Folder is now a second real caller that needs the same walk with a different final crumb — without growing the module's public surface.
- `FolderPageModel` / `toFolderPageModel`, following the exact shape of `NotePageModel`/`DailyNotePageModel`.
- `FolderPage.tsx` updated to receive a model instead of hardcoding `title`/`description`.
- `PageHost` gains a folder branch.
- The sidebar's dead `onClick={() => {}}` on folder rows is wired to actually open a folder.

## Non-goals

- Recursive folder trees inside FolderPage (direct children only, exactly as scoped).
- Expand/collapse UI within FolderPage.
- Drag & drop, search, or filters within FolderPage.
- A References section.
- Markdown editing for folders (they are not documents).
- Unifying Tags/Tasks/Search into the same "open" model — no evidence for this yet (see Q5).
- Rename/move/delete for folders.
- Fixing the sidebar tree's separate, pre-existing expand/collapse bug (`Folder.tsx`'s `isExpanded`/`onExpandToggle` props exist but `renderNotesTree.tsx` never passes `onExpandToggle`, so every folder currently renders fully expanded with a non-functional caret). This is real and worth a ticket, but it's unrelated to folder-opening and should not be bundled into this milestone.

### Architectural boundary

- Arc 4 introduces Folder pages only.
- It deliberately does not define a common abstraction for future Tag, Task, Search, or other workspace views.
- Those should be evaluated when they exist as real implementations, following the project's evidence-first philosophy.
- The only architectural commitment made in Arc 4 is that folders become independently openable without entering the DocumentSession pipeline.

## Architecture changes

1. **`Workspace`** — add `_activeFolderId: string | null`, `openFolder(id)`, `closeFolder()`, `activeFolderId` getter. `openFolder` must clear `_activePageId`, and `openPage` must clear `_activeFolderId` — enforced inside `Workspace` itself, not left to callers to remember. Exactly one of the two can be active at a time.
2. **`FolderApplicationService`** (new) — mirrors `PageApplicationService`'s shape: validates the folder exists in `Vault`, then delegates to `Workspace`. Has no `DocumentRegistry` dependency, because opening a folder never creates a session.
3. **`Application`** — owns a `folderService: FolderApplicationService` alongside the existing `pageService`.
4. **`FolderFrontmatter` / `FolderMetadata` / `VaultBuilder`** — add `description?: string` and `cover?: string` to the frontmatter type, `description: string | null` and `cover: string | null` to the metadata type, and thread them through `VaultBuilder`'s folder-mapping step exactly the way `PageBuilder` already does for pages.
5. **`buildBreadcrumbs.ts`** — overload the existing exported function for `Page | Folder`, sharing one private, unexported `walkAncestors(parentId, vault)` helper between both overloads. Do **not** export the shared walk as its own public function — nothing outside this file needs it directly, only these two entry points do, so the smaller public surface is strictly better than a second exported name for the same amount of de-duplication.
6. **`FolderPageModel` / `toFolderPageModel`** (new) — same shape discipline as `NotePageModel`: the page component receives fully-prepared data, never raw `Folder`/`Page` objects.
7. **`FolderPage.tsx`** — receives `model: FolderPageModel`, deletes its hardcoded `title`/`description` literals. Renders `PageTopBar` directly with `breadcrumbs={model.breadcrumbs}` — **do not** create a `FolderTopBar` wrapper. `NoteTopBar`/`DailyNoteTopBar` exist to carry per-type trailing actions (favorite/width/overflow buttons); Folder has no such actions yet, so a wrapper component would have nothing to add over calling `PageTopBar` directly. Build `FolderTopBar` only when a real, distinct trailing-action requirement shows up.
8. **`PageHost`** — add a branch that checks `workspace.activeFolderId` before falling through to the existing page-type switch.
9. **`renderNotesTree.tsx` / `Sidebar.Notes.tsx` / `Sidebar.tsx`** — thread a new `onOpenFolder(folderId: string): void` callback down to replace the dead `onClick={() => {}}`, mirroring the existing `onOpen`/`onOpenNote` callback already used for notes. Keep them as two separate named callbacks rather than one combined `{id, type}` dispatcher — at exactly two cases, two named functions are at least as clear as a discriminated union and require no new type.

## Workspace invariant

This is the single most important behavioral rule this milestone introduces, so it's stated here explicitly rather than left inside a risk bullet:

> At any time, exactly one of `activePageId` or `activeFolderId` may be non-null. `Workspace` is responsible for enforcing this invariant internally — `openPage()` clears `activeFolderId`, and `openFolder()` clears `activePageId`. Callers (application services, UI) must never manage this themselves.

Every other design decision in this milestone assumes this holds. `PageHost`'s dispatch order (check `activeFolderId` first, then fall through to the page-type switch) is only safe because both can never be non-null simultaneously.

## New types/interfaces

```ts
// core/workspace/Workspace.ts (additions)
class Workspace {
  private _activeFolderId: string | null = null;
  openFolder(folderId: string): void; // clears _activePageId
  closeFolder(): void;
  get activeFolderId(): string | null;
}

// core/application/folder/FolderApplicationService.ts (new)
class FolderApplicationService {
  constructor(
    private workspace: Workspace,
    private vault: Vault
  ) {}
  openFolder(folderId: string): Folder; // throws if not found, mirrors PageApplicationService.openPage
  closeFolder(): void;
}

// core/vault/understand/frontmatter/FolderFrontmatter.ts (additions)
interface FolderFrontmatter {
  id?: string;
  icon?: string;
  favorite?: boolean;
  description?: string; // new
  cover?: string; // new
}

// core/vault/models/FolderMetadata.ts (additions)
interface FolderMetadata {
  readonly icon: string | null;
  readonly favorite: boolean;
  readonly description: string | null; // new
  readonly cover: string | null; // new
}

// app/layouts/page/topbar/buildBreadcrumbs.ts
// Overload the existing public function instead of exporting the shared
// walk separately — nothing outside this file needs the walk directly,
// only these two entry points, so it stays a private implementation detail.
function buildBreadcrumbs(page: Page, vault: Vault): Breadcrumb[];
function buildBreadcrumbs(folder: Folder, vault: Vault): Breadcrumb[];
// walkAncestors(parentId, vault) is a private, unexported helper shared
// by both overloads.

// features/notes/page/folder/FolderPageModel.ts (new)
interface FolderChildItem {
  id: string;
  title: string;
  icon?: SystemIcon;
  emoji?: string;
  onClick(): void;
}

interface FolderPageModel {
  title: string;
  description: string;
  coverImage: string | null;
  breadcrumbs: Breadcrumb[];
  childFolders: FolderChildItem[];
  childNotes: FolderChildItem[];
}

function toFolderPageModel(
  folder: Folder,
  vault: Vault,
  actions: { onOpenFolder(id: string): void; onOpenNote(id: string): void }
): FolderPageModel;
```

## Files to create

- `core/application/folder/FolderApplicationService.ts`
- `features/notes/page/folder/FolderPageModel.ts`

## Files to modify

- `core/workspace/Workspace.ts`
- `core/application/Application.ts`
- `core/vault/understand/frontmatter/FolderFrontmatter.ts`
- `core/vault/models/FolderMetadata.ts`
- `core/vault/build/VaultBuilder.ts`
- `app/layouts/page/topbar/buildBreadcrumbs.ts`
- `features/notes/page/folder/FolderPage.tsx`
- `app/layouts/page/PageHost.tsx`
- `features/notes/helpers/renderNotesTree.tsx`
- `features/notes/sidebar/Sidebar.Notes.tsx`
- `app/layouts/sidebar/Sidebar.tsx`

## Implementation order

Each step should leave the project compiling (`tsc --noEmit`) before moving to the next.

1. Domain model first: `FolderFrontmatter` → `FolderMetadata` → `VaultBuilder`. No consumer yet; safe, isolated, verifiable by inspecting a built `Vault` in isolation.
2. `Workspace.activeFolderId` / `openFolder` / `closeFolder`, with mutual-exclusion enforced inside the class. No consumer yet.
3. `FolderApplicationService`, wired into `Application`.
4. Overload `buildBreadcrumbs.ts` for `Page | Folder`, extracting the shared walk into a private `walkAncestors` helper (not exported). **Verify Note/Daily Note breadcrumbs render identically before and after** — this is the one change in this milestone that touches already-working code.
5. `FolderPageModel` / `toFolderPageModel`.
6. `FolderPage.tsx` updated to consume the model; delete the hardcoded literals.
7. `PageHost` gains the `activeFolderId` branch.
8. Wire `renderNotesTree`'s dead `onClick`, threading `onOpenFolder` through `Sidebar.Notes.tsx` and `Sidebar.tsx`.
9. Manual verification: click a folder in the sidebar → FolderPage renders with real breadcrumbs and real children; click a child note → opens as a Note; click a child folder → navigates deeper and updates breadcrumbs.

## Risks

- **Mutual-exclusion bug.** If `openPage`/`openFolder` don't both clear the other's field, `Workspace` could end up with both `activePageId` and `activeFolderId` set, and `PageHost`'s branch order would silently decide which one wins. This must be a `Workspace` invariant, not caller discipline — write it once, inside the class.
- **Regression risk in the `buildBreadcrumbs` refactor.** This is the only step touching code two working page types already depend on. Confirm Note/Daily Note breadcrumbs are pixel-identical before and after the extraction.
- **No test fixture for `description`/`cover`.** Verifying the new `FolderFrontmatter` fields end-to-end requires a real `.folder.md` file in a test vault with those keys set — this doesn't exist yet and should be added alongside step 1.
- **Scope creep while touching `renderNotesTree.tsx`.** The pre-existing expand/collapse bug (see Non-goals) sits right next to the code being changed. Resist fixing it in the same pass — it's a real, separate issue with its own investigation needed.

## Why each change belongs in Arc 4, not a later milestone

- The `Workspace`/`FolderApplicationService`/`PageHost` changes are the direct, minimal answer to the exact gap identified in the prior review cycle (no seam for "a folder is open" — see Q4). This is the acknowledged blocker, not a nice-to-have to defer.
- The `FolderFrontmatter`/`FolderMetadata` extension is required for the stated FolderPage goal to be real. Deferring it means shipping FolderPage with permanently-empty description/cover fields — repeating the exact gap already caught in review.
- The `buildBreadcrumbs` refactor is justified now specifically because Folder is the second real caller needing ancestor-walking with a different final crumb — this is "two implementations reveal a pattern," the actual evidence bar this project has held itself to throughout, not premature generalization.
- Wiring the sidebar's dead `onClick` is required for any of this to be reachable by a user. Without it, everything else is invisible, unusable work — it cannot be deferred to a follow-up milestone without the rest of Arc 4 being unreachable.
- Explicitly **not** doing Tags/Tasks/Search unification, recursive trees, or drag-drop: none of these have a second or third real implementation to generalize from yet (Tags/Tasks/Search have zero "open" behavior today — see Q5). Building for them now would repeat the speculative-abstraction mistake this project has repeatedly caught and corrected in earlier reviews.
