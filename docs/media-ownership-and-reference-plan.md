# Media ownership and collision handling (2026-11-25)

Product direction agreed: Assets is an intentional library, not an inventory of every file used by notes.

## Implemented groundwork

- Numeric create/move/import naming, timestamped archive naming, and local duplicate naming use the shared candidate-selection pipeline in `core/shared/naming/resolveCollisionFreeName.ts`. Their existing suffix and reject/confirm policies remain distinct.
- Automatic filesystem destination retries for imports, local duplicate and archive use `retryDestinationCollision`; exclusive writes remain authoritative.
- New Space avatar images live in `.clutter/media/`, outside the Vault index. After the new profile is saved, only the previous generated managed avatar is eligible for automatic removal. Old library assets are never automatically deleted.
- Remote references are excluded from the Assets collection presentation, without removing catalog/reference data.

## Remaining coordinated media work (not yet implemented)

- Reserve visible-on-disk `Attachments/`, lazily created, hidden in normal Clutter navigation and Assets. Keep ordinary library files separate, including a library image used as a cover.
- Route pasted/dropped media and uploaded covers/icons to this location, rather than to Assets. Existing files have no reliable import intent, so leave them where they are. Do not migrate or delete them automatically.
- Generate space-wide collision-free imported media names via the shared pipeline. Short WikiLink references require a shared, uniqueness-aware resolver across editor, autocomplete, graph, asset catalog, move/rename and cleanup, including archive provenance. An external duplicate must not silently retarget an existing reference; ambiguous filenames must fail closed. Preserve existing explicit path semantics. Do not generate short references before every relevant consumer is ready.
- Save to Assets: the same user-facing action for remote and locally managed media; local promotion must move (not duplicate), preserve all supported references including unsaved and archived content, and provide recovery if reference rewrites fail. Current asset-move logic reports incomplete rewrites after the physical move and does not provide an all-or-nothing transaction. This is a blocker for the stronger promotion guarantee.
- Delete unused files: manual review only, exclusively managed attachments, recheck before removal, use Trash. Protect live/archived notes, templates, covers, icons, unsaved content and recovery/undo history; refuse cleanup when completeness is uncertain. No automatic deletion of user library files. Do not ship this destructive action until the reference and recovery safety checks exist.
- Runtime tests and packaged macOS checks are required before release; the current commits were made through repository access without executing the test suite.
