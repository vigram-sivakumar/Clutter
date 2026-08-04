# ADR-022: Workspace/Favorites as Active-View Variants, Not Folders

**Status:** Accepted (design frozen; implementation may proceed against this contract)

## Context

Two new navigation destinations are needed: clicking the sidebar's "Workspace" section header should show root-level folders+notes as a collection page; clicking "Favorites" should show the favorited folders+notes as a collection page. `docs/architecture-evolution-roadmap.md` §3 already names the gap this falls into ("Workspace Active-View Model") and states this exact kind of change requires a spec §10 amendment before implementation. This ADR is that amendment, scoped narrowly to the two views actually needed now.

Investigation established:

- `Workspace.activeFolderId`/`activePageId` (spec §10) are mutually exclusive by invariant, and every consumer of `activeFolderId` (`FolderOperations.open`, `PageHost.tsx`, `toCollectionPageModel`) assumes a real, path-backed `Vault` `Folder` — `vault.getFolder(id)` is called and throws if not found.
- Root has no backing `Folder`: `ReservedFolderId` lists only clutter/daily-notes/archive/inbox/templates. Root content only exists today via `VaultQuery.getRootFolders()`/`getRootPages()` (`parentId === null` filters), consumed only by the sidebar's `FolderTree`.
- Favorites has no single-folder backing at all — `getFavoriteFolders()`/`getFavoritePages()` is a cross-cutting aggregate (any folder/page anywhere with `metadata.favorite`), not one folder's children.

## Decision

### Why Workspace/Favorites are views, not folders

Both are aggregations defined by a *query*, not a location in the folder tree. Workspace-root is "every folder/page with `parentId === null`" — already exactly `VaultQuery.getRootFolders()`/`getRootPages()`. Favorites is "every folder/page with `metadata.favorite === true`" — already exactly `getFavoriteFolders()`/`getFavoritePages()`. Neither corresponds to a single node with an `id`/`path`/`parentId` a Vault write path could create, rename, move, or archive — the defining property of every real `Folder`. Modeling them as folders would require inventing a `Folder` not backed by anything on disk, breaking every consumer that currently assumes `vault.getFolder(id)` resolving means "this is a real, addressable location."

### Why not sentinel folder ids

Rejected: passing a fabricated, non-existent id (`'__root__'`, `'__favorites__'`) through `activeFolderId` would require every current consumer of that field — `FolderOperations.open`'s existence check, `PageHost.tsx`'s `vault.getFolder` lookup, `toCollectionPageModel`'s `Folder`-shaped parameter — to grow a special case for "this id doesn't really exist, treat it differently." That's a second implementation hiding inside the first: the field's type (`string | null`, meaning a real Vault folder id) would silently start meaning two different things depending on the value, with no static signal at any call site. It also collides with the existing invariant that `activeFolderId === null` already means "nothing folder-shaped is active" — reusing `null`, or any sentinel, to mean something as specific as "show root" makes the field's meaning implicit and undocumented instead of typed.

### How they fit the existing active-view model

Adopt the tagged union the roadmap already specifies (§3, "Workspace Active-View Model"), scoped to exactly the two variants needed now:

```ts
type ActiveView =
  | { type: 'page'; id: string }
  | { type: 'folder'; id: string }
  | { type: 'filtered-view'; view: FilteredViewKind };

type FilteredViewKind = 'workspace' | 'favorites';
```

`Workspace` replaces its two separate optional fields (`activePageId`/`activeFolderId`) with one `activeView: ActiveView | null`, preserving the existing invariant in a stronger form — exactly one of "a page," "a folder," or "a filtered view" is active at a time, expressed by the type system instead of by convention across two nullable fields. Existing `activePageId`/`activeFolderId` getters remain as derived accessors over `activeView` (e.g. `activeView?.type === 'page' ? activeView.id : null`), so no existing call site (`PageHost`, `FolderTree`, sidebar selection checks) needs to change. `openPage(id)`/`openFolder(id)` remain the entry points UI already uses; both set `activeView` under the hood. A new `openFilteredView(view: FilteredViewKind)` is the third entry point, called only by `NavigationRouter.openWorkspace()`/`openFavorites()` — `ADR-005` already named these as the intended real implementations, currently absent/stubbed.

`PageHost` gains one new branch, parallel to its existing `activeFolderId` branch: when `activeView.type === 'filtered-view'`, build a `CollectionPageModel` from `VaultQuery.getRootFolders()`/`getRootPages()` (workspace) or `getFavoriteFolders()`/`getFavoritePages()` (favorites) — the same query methods the sidebar's `FolderTree`/`FavoriteList` already call, via `buildEntryPresentation` (already shared, `core/presentation`) — rather than from a single folder's children. `toCollectionPageModel`'s `folder: Folder` parameter is loosened to also accept the filtered-view case, producing the same `CollectionPageModel` shape either way; nothing downstream of it (`CollectionBody`) changes.

`getSystemLocationPresentation`'s registry gains the label/icon source for these two views' page titles and section headers (`'workspace'`/`'favorites'` entries), consistent with how reserved folders already get their titles from that same registry rather than a hardcoded string.

## Alternatives Considered

- **A parallel `activeSystemView` field alongside the existing two.** Rejected: it would be a second navigation concept living beside the first rather than extending it, reintroducing the two-different-mechanisms fragmentation `ARCHITECTURE_RULES.md` rule 1 warns against.
- **Sentinel folder ids.** Rejected above.
- **A full `ActiveView` union with every eventually-planned variant (all-tasks, all-tags, etc.) built now.** Rejected: `implementation-rules.md` rule 13 ("never build unconsumed speculative machinery") — only `'workspace'`/`'favorites'` have a shipped consumer today. `FilteredViewKind` is written as an extensible union specifically so adding `'all-tasks'` later is a one-line addition, not a redesign, but it isn't added until it has a real caller.

## Consequences

- `Workspace`'s public shape changes (spec §10 amendment): `activePageId`/`activeFolderId` become derived read-only accessors over a single `activeView` field; `openFilteredView` is a new entry point. No existing caller of `activePageId`/`activeFolderId`/`openPage`/`openFolder` needs to change.
- `NavigationRouter.openWorkspace()`/`openFavorites()` become real (per ADR-005's original naming intent) — the first of the still-stubbed view-level intents to ship.
- `PageHost`/`toCollectionPageModel` gain one shared branch/parameter case for filtered views; no second `CollectionPageModel`-building implementation is introduced — sidebar and page continue reading the same `VaultQuery`/`buildEntryPresentation` composition already established.
- `openAllNotes`/`openAllTasks`/`openSomedayTasks`/`openCompletedTasks`/`openAllTags` remain explicitly out of scope — `FilteredViewKind` is positioned to absorb them later without another spec amendment, but none is added speculatively here.

## Why This Approach Is Preferred

It resolves the actual gap (`Workspace` has no room for a view that isn't a real folder or page) by finishing the exact tagged-union shape the roadmap already committed to, rather than inventing an alternative shape or a second mechanism alongside the existing one. Workspace and Favorites become ordinary variants of one active-view concept instead of a special case, which is what lets every downstream consumer (`PageHost`, selection-state checks, future views) keep treating "what's currently shown" as one piece of state instead of two-plus-an-exception.
