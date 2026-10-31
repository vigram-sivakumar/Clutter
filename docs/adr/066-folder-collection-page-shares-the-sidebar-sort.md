# ADR-066: A folder's collection page shares the sidebar's sort and manual order

**Status:** Accepted (product decision, Vigram, 2026-10-31). Amends [ADR-055](./055-manual-sidebar-order.md), which kept a folder's sidebar sort and manual order independent of its collection-page sort.

## Context

A folder was ordered twice: its sidebar level by `sidebarSort` / `sidebarOrder`, and its collection page by `sort` (a property and a direction). Changing Manual to Name in the sidebar left the page unchanged, and the two menus offered different choices. ADR-055 chose this on purpose ("a folder's manual order is not shown on its collection page"); the product decision is now that a folder has **one** sort.

## Decision

1. **For an ordinary folder (`collectionDefinition.kind === 'folder'`), `sidebarSort` and `sidebarOrder` in `CollectionViewConfigStore` are the only sort.** Nothing new is stored and no key changes: the page and the sidebar level already read the same `folder:<id>` entry. The page no longer reads that entry's `sort` for such a folder (it is left in the file, unread).
2. **The choices are defined once** — `SIDEBAR_SORT_OPTIONS` (Name, Created time, Last edited, Manual) and the pick rule `pickSidebarSort` (re-picking flips the direction; another key starts in its default; Manual has no direction) in `core/properties/sidebarSort.ts`. The folder page's Configure → Sort by lists these rows (`CollectionViewMenu`'s `levelSort`), with the same tick and arrow as the sidebar's.
3. **One write** — `setLevelSort` (`features/notes/sidebar/sidebarOrderActions.ts`) is called by the sidebar's Sort by and the page's. Choosing Manual restores the saved order (seeding it from what is drawn only when none exists); leaving Manual never touches it.
4. **One ordering algorithm** — the page asks `levelEntries` (the sidebar's `sortLevelEntries`) for the level's order and draws its folders and notes by it (`CollectionBody`'s `entryOrder`). Notes and folders are one interleaved sequence in the sidebar; a page draws folders (grid) and notes (list) separately, so **each kind keeps its relative order from that sequence**.
5. **Live sync** — `PageHost` subscribes to the store and re-reads its entry, so a change made in the sidebar shows on the open page without reopening it (the sidebar already subscribed).

## Unchanged

Every other collection (Inbox, Templates, Daily Notes, Archive, Assets, Tasks, Favorites, tags, and the vault-root Workspace page) keeps its own property sort. The root's sidebar order stays under `sidebar:root` and still never reaches `view:workspace`. Reordering by drag stays in the sidebar; the page offers no insertion positions (ADR-055 addendum).

## Consequences

- A folder page's former property sort (Description, Cover image, …) is no longer offered for that folder. A saved one is ignored and, after the folder's next sort change, remains in the file unread.
- The page's Created time / Last edited follow the sidebar's rules: a folder has no dates, so under those two folders sort after dated notes, by name.
