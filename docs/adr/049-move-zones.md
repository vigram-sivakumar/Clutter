# ADR-049: Move zones — Templates are flat; Assets are a sealed hierarchy

**Status:** Accepted (amended twice: Templates were made flat, then made an ordinary workspace location again — see "Amendment: Templates are movable")

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


## Amendment: Templates are movable

Templates is an ordinary workspace location again, for moves and for folders. `moveZoneOfPath()` no longer has a `templates` zone: only Assets stays sealed. Consequences:

- A note or folder moves into Templates (any depth) and out again, using the existing Move picker, `PageOperations.move` and `FolderOperations.move`. The `toTemplates` option and the "a Template is never moved" guard are removed; nothing is copied or recreated, so ids and metadata are kept.
- Folders can be created inside Templates (`FolderPathResolver.createFolderPath` no longer refuses).
- Template status stays derived from location (ADR-041): `Vault.isFolderWithinReservedFolder(…, 'templates')` for the UI; the `kind: template` marker is written/removed for a moved note by `PageOperations.move` and, for every page, by Sync's reconciliation at startup and on external changes. A moved folder's descendants are reclassified by location immediately; their on-disk marker is repaired by that reconciliation.
- The Move picker lists Templates (and its folders) directly below the vault root (`buildMoveDestinationItems`). Templates is offered only once it exists (ADR-030). The cover picker opts out.

## Amendment: an Asset may leave Assets, per Space, when its references can be kept

- **Opt-in, off by default.** A Space can allow assets and asset folders to move out of Assets into the workspace's ordinary folders: `allowMovingAssetsToFolders` in the Space profile (`.clutter/workspace.json`), present only when on, so each Space has its own and a Space that never chose behaves exactly as above. The Settings toggle ("Allow moving assets to folders", Assets page) is behind `featureFlags.allowMovingAssetsSetting` and is hidden for now; the behavior is not flagged and works for any Space whose saved value is on.
- **Off: unchanged.** An asset or asset folder moves within Assets, and into Assets; into the workspace it is refused with the same error as before.
- **On: the same Move picker, the same operations.** `buildMoveDestinationItems` for an Asset (and for a folder inside Assets) lists the ordinary folders after Assets — the vault root only for a folder (only a folder may be moved there), and not Inbox or Templates, which take notes. The same check is made in the Gate: `MoveService.resolveResourceMoveDestination` and `FolderPathResolver.resolveMoveDestination` call `assertAssetsMayMoveTo`, which asks the Space's `AssetMovePolicy`, so a caller that skips the picker is refused all the same. Destination validation (Daily Notes, archived folders, into itself, auto-suffix on a collision) is unchanged.
- **References are updated, or the move is refused.** A move does not rewrite references on its own, and references are exact vault-relative paths (ADR-039). So, when a move takes an asset out of Assets (or back in, once it has been out) and the Space allows it, the Gate first asks the policy to **plan** the reference updates, before the filesystem is touched (`prepareReferenceUpdates` → `planMovedAssetReferences`), then moves, then **commits** them (`rewriteMovedAssetReferences`): `![[…]]` embeds and `[[…]]` links to the file's exact path (`rewriteReferenceTargets`), Markdown images (`ImageReferenceExtractor.replaceSource`), note covers (hidden or not) and folder covers (`updateMetadata`), and the Space avatar (`SpaceProfileStore.setAvatar`), in every note including archived ones (`allowArchived`) and in an open editor's unsaved text (`mutateBody`). For an asset folder, every file in it is mapped old path → new path and all references to any of them are updated. Moves within Assets are unchanged and do no reference work.
- **Conservative.** Only a reference that is exactly the file's vault-relative path is rewritten. One that finds the file spelled another way (`./Assets/x.png`, percent-encoded) is not guessed at: the move is refused. So is a move when a note that needs updating changed on disk outside Clutter (never overwritten), when an unsaved new note uses the file, when an archived folder (which cannot be edited) uses it as a cover, when the new path has characters a reference cannot hold, or when the check itself fails. Each refusal is an `AssetMoveRefusedError` with a reason and a message that says nothing was moved. Unresolved names, aliases, raw HTML, web addresses and anything in another Space are not references to the file and are left alone.
- **Not atomic.** The move and the updates are separate steps. If the file has moved and an update then fails, the move is not undone and nothing is overwritten: `moveResource` / `FolderOperations.move` return an `AssetMoveReferenceSummary` (every old → new path, how many places were updated, and each place that still points at an old path, with its id, path and the error), the Application reports it to the user (`subscribeAssetMoveFeedback`), and the updates are idempotent, so they can be run again from that summary. There is no general transaction or automatic rollback.
- **Not covered.** Renaming an asset or an asset folder, and moves within Assets, still do not update references (as before). Moving an asset folder out takes its files along but a folder moved out cannot be moved back into Assets (an ordinary folder never moves into Assets).
