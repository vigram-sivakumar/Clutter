# ADR-049: Move zones — Templates are flat; Assets are a sealed hierarchy

**Status:** Accepted (amended: Templates are a flat collection)

## Context

Move had one hard rule (Daily Notes is opaque) and left the rest to the picker's choice of folders. Nothing stopped a note being moved into Templates or Assets, a Template being moved out, or an Asset being moved out of Assets — they were just not offered. "Use as template" is itself implemented as a Move into Templates.

## Decision

`ReservedResources.moveZoneOfPath()` classifies a path as `workspace` (vault root, Inbox, ordinary folders), `templates` or `assets`. `assertMoveWithinZone()` is called next to the existing Daily Notes guard in the one place each destination is resolved:

- **Templates are a flat collection.** A Template (a page inside Templates) is never moved — `MoveService.resolveMoveDestination` rejects any move of one — and Templates cannot contain folders (`FolderPathResolver.createFolderPath` rejects a folder inside Templates). A Template has no Move action and no Move picker.
- **Notes** move only within the workspace: never into Templates or Assets.
- **Assets** move only within Assets — the Assets root or a folder in it (`resolveResourceMoveDestination`).
- **Folders** stay in their own zone: an ordinary folder never moves into Templates or Assets, and one inside Assets moves only within it. A same-parent rename is not a move and is unaffected.
- **Sanctioned crossing:** "Use as template" passes `{ toTemplates: true }` through `PageOperations.move` and the Gate's `move` kind — the only way a note enters Templates — and only directly under the Templates root. An additive option, not a new kind or write path.

The Move picker is unchanged as a component. `buildMoveDestinationItems` takes a picker zone (`workspace`, the default, or `assets`) and pins that zone's root first, then its folders. The canonical `move-to` action is one definition for every kind; it is hidden for a Template. `moveZoneFor` decides an Asset's or a folder's picker root. Creating a template always creates it directly under the Templates root.

## Consequences

The invariants live in the domain layer, so no caller can bypass them; the picker offers exactly what the Gate will accept. Tests that encoded the old behavior (assets to ordinary folders, notes into Templates, Templates with subfolders) were updated. A folder that already exists inside Templates on disk (created outside Clutter) is read as an ordinary folder page and cannot be added to, moved into, or created within.
