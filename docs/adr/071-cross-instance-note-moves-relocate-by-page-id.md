# ADR-071: Cross-instance note moves relocate the Vault entry by page id; the guarded restore write accepts an already-applied correction

**Status: Accepted** (2026-11-12). Individual notes only; folder movement is not covered. Builds on [ADR-043](./043-sync-never-trusts-a-paired-rename-destination.md) and [ADR-063](./063-atomic-vault-saves.md). No new subsystem, write path or communication channel.

## Context

Several Clutter instances can open one vault. Each has its own `Vault`, `SelfWriteRegistry`, `DocumentRegistry` and `VaultSyncService`; the only thing they share is the disk. When one instance moves a note, the others see it through the filesystem watcher, which (macOS gives no rename correlation) may report `moved`, `deleted` then `created`, `created` then `deleted`, or crossed pairs. Sync treated a vanished tracked file as a deletion and the new file as a new page, so the page was removed and re-added: its tab closed and its `DocumentSession` was orphaned. A repeated move could also remove the page through a `created` event for a path the page had already left. Separately, restore (`move`, then a guarded metadata rewrite) reported `AtomicExternalChangeError` when Sync's archive-metadata repair had already written the same rewrite between the two steps, although the note was restored.

## Decision

1. **Relocation by id** (`VaultSyncService`). When a tracked page's file is gone (`relocateOrRemovePage`), Sync looks for an untracked `.md` page file whose frontmatter `id` equals the page's id and applies the move to it (`applyMove`, with ADR-043's destination checks). The `Page`, its id, the tab and the `DocumentSession` are kept. The lookup lists the vault tree and reads only untracked Markdown files; a listing failure means "not found". When a `created` file claims the id of a tracked page whose old path no longer exists, it is adopted as the same move through a non-blocking hand-off to the page's own lane. A refused or failed move falls back to the previous behaviour once (`fallbackOnRefusal: false` on this path) and never recurses. Only a page still tracked at the vanished path is removed.
2. **Every vanished-path removal goes through that relocation**, including `reconcileFileEntity`'s gone-again branch, which a stale `created(old path)` reaches without passing `reconcilePath`.
3. **Genuine deletion and genuine copies are unchanged**: no same-id file means removal; a same-id file while the original still exists is a duplicate and gets a fresh id.
4. **Restore idempotency** (`PagePersistenceCoordinator.replaceFileGuarded`). On a fingerprint mismatch, if the file on disk equals the exact document about to be written, the write is skipped and the normal success path continues. Any other content still throws `AtomicExternalChangeError`; the conditional (`replaceIf`) write and the session/Vault fingerprint rules are untouched.

## Consequences

- A note moved by another instance keeps its Vault entry, open tab and unsaved edits, including across repeated moves.
- A moved note whose frontmatter `id` was edited away at the same time degrades to remove + add, as before.
- The restore correction is limited to an exact match; a different concurrent repair would still be reported.
- Not covered: folder moves, and the real macOS event ordering is inferred rather than captured (validated manually with two instances).

## Tests

`VaultSyncService.crossInstanceMove.test.ts` (event orders, crossed renames, validation failure, refused relocation, genuine deletion, genuine copy, dirty session, repeated move with a stale `created`) and `PagePersistenceCoordinator.restoreIdempotent.test.ts` (already-applied rewrite skips the write; an external body edit still throws; normal restore unchanged).
