# ADR-055: Manual sidebar order — a `manual` sidebar sort and `sidebarOrder`, presentation state outside the Persistence Gate

**Status:** Accepted (product decision, Vigram, 2026-10-15). Extends the per-folder `sidebarSort` kept in `CollectionViewConfigStore` ([ADR-033](./033-fold-state-persistence.md)'s sibling-store posture, [ADR-035](./035-persist-workspace-session-state.md)'s file ownership).

## Context

The Notes sidebar orders a folder's children by one of Name, Kind, Created or Last edited (`SidebarSort`, stored per parent folder). Drag-and-drop can now move a note or folder into another folder through the existing `PageOperations.move` / `FolderOperations.move`, and shows insertion positions beside sibling rows — but there is nowhere to record "this one goes before that one". Notes and folders have no order on disk, and none should be added: a Markdown file must not change because a row was dragged.

## Decision

1. **`manual` is a fifth `SidebarSortKey`** ("Manual" in the folder's Sort by menu; it has no direction). Choosing it **restores the order the user saved** for that level; only a level with none yet **seeds it from what is drawn at that moment**, so no row jumps. Leaving Manual never touches the saved order, so Manual → another sort → Manual brings the arrangement back. **Positional reordering by drag is offered in a level sorted any way** (amended 2026-10-15, reversing the earlier "Manual only" rule): the insertion line appears at every valid position. Merely dragging changes nothing; a **successful positional drop** writes the level's Manual mode and its new order in one update — the order starts from what the level drew (its sort applied, or its saved manual order) with the item placed, so the tree never flickers back to the old order. A drop onto a folder without a position (a plain move) leaves the destination's sort alone; a cross-parent positional drop switches only the destination level (the source keeps its own sort). The vault root works the same way.
2. **`sidebarOrder` is stored beside `sidebarSort`** in the same `CollectionViewConfigStore` entry, persisted through the existing merge-and-write of `.clutter/workspace.json`:
   ```jsonc
   "folder:<parentId>": { "sidebarSort": { "key": "manual", "direction": "down" },
                          "sidebarOrder": ["n:<noteId>", "f:<folderId>", …] }
   "sidebar:root":      { …same… }   // the vault root: its own dedicated key
   ```
   - Ids are kind-prefixed (`n:` notes, `f:` folders) so a note and a folder never collide. One list per parent holds notes and folders as **one interleaved sequence** — a note may sit between two folders and a folder between two notes (amended 2026-10-15; the first version ordered each kind separately). Files are not part of manual order: a manual level draws the sequence, then its files.
   - Read defensively: non-strings and empty ids dropped, **first occurrence of a repeated id kept**, ids matching no child ignored. An order and its sort change in **one** `update()` — one file write.
   - **Listed items follow their stored positions; unlisted items (new, moved in, created outside the app) follow them, by name.** New items are not written into the list until that level is next reordered; a write always starts from the drawn order, which drops dead ids.
   - The root uses `sidebar:root`, **not** `view:workspace`: that is the Workspace collection *page's* configuration, and manual sidebar order must never reach a collection page. A folder's `sidebarOrder` is likewise independent of its collection-page `sort`.
   - The root is sorted from the Folders section's three-dot menu (below).
3. **Ordering is presentation state, outside the Persistence Gate.** Like `sidebarSort`, fold state and the other `.clutter/*` stores, it records no vault content, changes no file, and is best-effort (ADR-033's failure posture). It is not a durability stage. **Move operations are unchanged and know nothing about it**: an item moved into a manual parent is simply unlisted, so it appears after the listed ones, and a destination that is not manual keeps its saved order untouched. When a move made from the Notes sidebar (Move picker or drag) succeeds, the sidebar removes the item's id from the old parent's saved order (so coming back later puts it at the end); a failed move prunes nothing. Moves made elsewhere (the page topbar) leave a stale id, which is ignored on read. Ids that are path-derived (folders/notes without a persisted id) lose their position when their path changes across a restart and fall back to name order.
4. **Orchestration lives in the sidebar feature layer.** A drop on an insertion position: within the same parent, only the order is written. From another parent, the existing `Move` runs first and the order is written **only if it succeeds**; a failed or refused move writes nothing. The UI writes through the callback `Sidebar` already uses for sort and the store's `update()` — no new service, no facade method, no second source of truth for where an item lives.
5. **Insertion rules** (drop-target detection, not execution): any note or folder row is an anchor for any dragged note or folder, so a position is "before/after this row" in the parent's one shared sequence. The position is in the target row's own sibling list, never its children; "after" an expanded folder is after its whole rendered subtree (an expanded header has no "after" of its own). **A note is never placed in the root list** (a note always belongs to a folder); root folders can be reordered. A folder cannot go into itself or a descendant (`FolderOperations.canMove`). The position "after the last visible row" of a capped ("N more") list is not offered, and a position directly beside the dragged row is not shown (nothing would move). The anchor's kind travels with the target (`rowKind`) so its order id is `n:`/`f:` correctly.
6. **`FolderOperations.canMove(folderId, destinationFolderId | null)`** — a read-only twin of `move()` that runs the same checks (archived, Daily Notes, move zones, itself/descendant) through the same `FolderPathResolver` and enqueues nothing — is added so drag feedback and drop re-validation ask the move rules rather than restate them. It is a validity read, not a write path.

## Alternatives considered

- **`order` in each folder's `.folder.md`.** A Gate-backed write of every sibling per reorder; the vault root has no `.folder.md`; notes would need frontmatter changes. Rejected: it turns a sidebar gesture into content writes.
- **Teach `PageOperations`/`FolderOperations.move` about position.** Couples the Gate to a presentation concern and makes every move depend on the order store. Rejected.
- **Reuse `view:workspace` for the root.** Would leak sidebar order into the Workspace collection page's configuration. Rejected.
- **A separate order store/file.** `CollectionViewConfigStore` already owns the per-folder sidebar sort, parser and merge-and-write; a second owner would duplicate all three.

## Consequences

- Reordering never touches a note or folder file; deleting `.clutter/workspace.json` loses only the arrangement.
- Stale ids accumulate in a level's list until its next reorder; they are ignored on read.
- A folder's manual order is not shown on its collection page (which keeps its own sort).

## Addendum: the sort options (2026-10-15)

The folder menu's "Sort by" (and, through the Folders section's three-dot menu, the vault root's) offers **Name, Created time, Last edited and Manual**. All four order notes and folders as ONE sibling sequence per parent, files after it (`sortLevelEntries`); Kind, which grouped them, is retired from the menu (a stored `kind` reads as Name). A level with no stored sort reads as Name.

- **Name** — alphabetical, case-insensitive; equal names fall back to id so the order is stable.
- **Created time** — oldest first (`created`/`up`); **Last edited** — most recently edited first (`updated`/`down`). Re-picking the active key flips its direction. The timestamps are `PageMetadata.createdAt`/`updatedAt`; **folders have none** (`FolderMetadata` carries no dates), so under these two they count as missing, which sorts last, in name order — as do notes with a missing or blank date. Equal dates fall back to name.
- **`updatedAt` caveat.** It is the frontmatter `modified`, which saves carry over unchanged; only creation, archive and restore set it. So today Last edited follows creation order for notes edited inside the app. Making edits stamp it is a separate change to the persistence pipeline, not part of this one.
- Manual and its saved order are independent of the active mode: switching modes keeps the saved order, and a successful positional drop in any mode makes that level Manual (replacing the saved order with the drawn-and-placed one) — the root included.
- The Folders section's three-dot menu lists the four choices directly under a non-interactive "Sort by" heading (the same rows, tick and direction arrow as a folder menu's "Sort by" submenu). There is no "Reset to name order": picking Name restores name order and leaves the saved manual order intact.
- The selected mode and the manual order are stored per level and persist; starting or cancelling a drag never changes the mode, only a successful positional drop does (switching to Manual, which then stays selected), and Name is the default only where nothing is saved.

## Addendum: moving between surfaces (2026-10-15)

Notes and folders can be dragged into folders **across surfaces** — Collection View ↔ Collection View, Collection View ↔ Sidebar, Sidebar ↔ Sidebar — with one set of semantics and no manual ordering outside the sidebar:

- **One lifecycle, one resolver, one executor.** The Collection View (`useCollectionMoveDrag`, gated by `CollectionBody`'s `moveDrag`, given by `PageHost` for ordinary folders, Inbox, Templates and the vault root) uses `usePointerDrag`, `resolveDropTarget` (with `insideOnly`) and `executeDrop` — the sidebar's own. A card or note row is marked `data-drag-*` + `data-drag-inside-only`; a folder card is only ever an "into this folder" destination (the whole card). Dropping between cards, on a note or on empty space is no target.
- **Validation twice, from the domain.** `FolderOperations.canMove` and the new `PageOperations.canMove` (via `PagePersistenceCoordinator.canMovePage`, the read-only twin of the Gate's `move`) decide hover feedback and are asked again by `executeDrop` at the drop; the highlight never authorizes a move. Special destinations keep their one rule (`DROP_ZONE_ACCEPTS`: Templates takes notes and folders, Inbox notes only, Assets assets only), re-checked at the drop. A drop onto the folder an item is already in is a no-op.
- **The ghost may leave its container** (`usePointerDrag`'s `allowDragOutsideContainer`). Pointer tracking was always document-wide and the ghost is drawn in `document.body`; what held a sidebar drag in the sidebar was the ghost's alignment to the source's column. With the option on, the ghost keeps that alignment while the pointer is within the container and follows it out past the container's left or right edge. Off by default; the sidebar and the Collection View turn it on.
