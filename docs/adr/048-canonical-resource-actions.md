# ADR-048: Canonical resource actions — one definition per resource, groups and dividers derived

**Status:** Accepted

## Context

Every resource (Note, Daily Note, Folder, Asset, Tag, Task) exposes actions on several surfaces (sidebar row, Favorites row, topbar More menu, overlays). Each surface was a hand-written `*Menu.config` that decided its own items, order, labels, `disabled` rules and `separatorBefore` dividers, plus its own `if (id === …)` dispatch ladder. The audit found the result: Move sat before Location in Note menus and after it in Folder menus; topbar menus had no dividers while sidebars did; Favorites rows listed Reveal/Copy path with no dispatch; Version history was a menu item with no handler; the Reveal/Copy-path glue and the folder-archive confirmation were each written several times.

`OverflowMenuItemConfig` (rendered by every surface) already has the one primitive we need — `separatorBefore` — but deliberately offers no group model. The repo already has the pattern for the missing half: `CollectionDefinition.actions` declares capabilities in one place and the page binds handlers elsewhere.

## Decision

A small presentation layer, `core/presentation/resourceActions/`:

- **Canonical definitions** per resource kind: `id` (also the handler key), label, icon, semantic **group**, **order** within the group, `availability(context)` (`enabled` | `unavailable` | `hidden`). Definitions are data; domain behavior stays in `PageOperations` / `FolderOperations` / `ResourceOperations` / `TagOperations` / `TaskOperations`, which are not touched.
- **Fixed group order:** `identity` → `organize` → `view` → `location` → `lifecycle` → `destructive`. Move is in `organize`.
- **`buildResourceActionMenu(kind, context, surface)`** filters by the surface's explicit omit list, applies availability (`unavailable` renders disabled on the topbar — ADR-017 item 9 — and is omitted elsewhere), sorts by group then order, and sets `separatorBefore` on the first item of every group after the first. Output is the existing `OverflowMenuItemConfig[]`; `OverflowMenu`/`Menu` are unchanged.
- **Surface rules are explicit data** (`resourceActionSurfaces.ts`): e.g. the topbar omits Rename and Change icon (inline title / header icon control); Favorites omits Rename; Sort by is sidebar-only. Not accidental omissions.
- **Handlers:** an action id keys a handler map (`Record<id, () => void>`), the shape the topbar already used. Sidebar rows replace their dispatch ladders with one map lookup. Surface-specific *behavior* of one capability (Duplicate-and-open on the topbar vs. duplicate-in-place in the sidebar) is a different handler passed by the surface; the capability is still the one `PageOperations.duplicate`.
- **Not built:** no policy engine, inheritance, runtime composition, or action framework for non-resource menus. Collection, header, embed and editor menus are untouched.

## Replaces (migrated one resource at a time, old files deleted with each migration)

`noteSidebarMenu.config.ts`, `noteTopBarMenu.config.ts`, `dailyNoteSidebarMenu.config.ts`, `dailyNoteTopBarMenu.config.ts`, `folderSidebarMenu.config.tsx`, `folderTopBarMenu.config.ts`, `resourceSidebarMenu.config.ts`, `tagSidebarMenu.config.ts`, the inline Tag-page menu in `PageHost.tsx`, the inline menu in `Task.tsx`, and `buildLocationActionMenuItems` (its Copy-path submenu is now `buildCopyPathSubmenu`). `resourceActionLabels.ts` is kept as the home of the shared label constants the definitions read. `archiveTopBarMenu.config.ts` (Empty trash) is a Trash-page action and stays.

## Consequences

Adding an action means adding one definition with its group/order; every surface that doesn't omit it places it and its divider identically. Topbar menus gain group dividers and the Note topbar's order converges on the sidebar's (Favorite first). Guards (scoped to resource-action menus only): no hand-written `separatorBefore` in migrated configs, and every canonical action id has a registered handler. No new write path, no Gate or facade change.

## As implemented

- Surfaces: `sidebar`, `favorites`, `topbar`, `overlay` (asset More actions). A profile has an `omit` list and an `omitWhen(kind, context)` rule for kind- or state-specific omissions (e.g. the topbar's Reveal in Finder is for an ordinary, active Note only; Restore/Delete are not in sidebars, except for Tags and Tasks, which have no Trash).
- Handlers: one id-keyed map per resource family — `buildPageMenuHandlers`, `buildFolderMenuHandlers`, `buildAssetMenuHandlers`, `buildTagMenuHandlers` (a Task row's map is its supplied operations). Reveal in Finder / Copy path have one implementation, `createLocationActions`.
- Guards (resource-action menus only): no hand-written `separatorBefore: true` in the listed consumers; every canonical action emitted on a surface has a registered handler; definitions are well-formed.
- Deliberately unchanged: embed menus (Position, Remove, the PDF embed's own Download), the header More menu, collection menus, Trash page's Empty trash, `OverflowMenu`/`Menu`, every `*Operations` facade and the Gate.
