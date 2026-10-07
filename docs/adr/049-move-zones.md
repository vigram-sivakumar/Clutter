# ADR-049: Move zones — Templates and Assets are sealed hierarchies

**Status:** Accepted

## Context

Move had one hard rule (Daily Notes is opaque) and left the rest to the picker's choice of folders. Nothing stopped a note being moved into Templates or Assets, a Template being moved into an ordinary folder, or an Asset being moved out of Assets — they were just not offered. "Use as template" is itself implemented as a Move into Templates.

## Decision

`ReservedResources.moveZoneOfPath()` classifies a path as `workspace` (vault root, Inbox, ordinary folders), `templates` or `assets`. `assertMoveWithinZone()` is called next to the existing Daily Notes guard in the one place each destination is resolved:

- **Page** (`MoveService.resolveMoveDestination`): a page inside Templates (a Template) moves only within Templates; any other note moves only within the workspace.
- **Asset** (`resolveResourceMoveDestination`): must land inside Assets (the Assets root or a folder in it).
- **Folder** (`FolderPathResolver.resolveMoveDestination`): stays in its own zone — one inside Templates/Assets moves only within it, an ordinary folder never moves into either. A same-parent rename is not a move and is unaffected.
- **Sanctioned crossing:** "Use as template" passes `{ toTemplates: true }` through `PageOperations.move` and the Gate's `move` kind — the only way a note enters Templates. This is an additive option, not a new kind or write path.

The Move picker is unchanged as a component; `buildMoveDestinationItems` takes the zone and returns that zone's root as the first (pinned) row, then its folder hierarchy. The canonical `move-to` resource action is unchanged; the resource decides the zone (`moveZoneFor`).

## Consequences

The invariant lives in the domain layer, so no caller can bypass it; the picker offers exactly what the Gate will accept. Existing tests that moved assets to ordinary folders or notes into Templates encoded the old behavior and were updated.
