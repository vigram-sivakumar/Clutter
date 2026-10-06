# ADR-043: Sync never trusts a paired rename's destination — an external delete must not become a move onto an unrelated path

**Status:** Accepted (bug fix, Vigram, 2026-10-06)

## Context

Deleting today's Daily Note in Finder left it fully visible in Clutter (properties and all) although the file was gone.

macOS (FSEvents) gives the Rust watcher no rename correlation cookie, so `vault_watcher.rs` pairs a "path vanished" half with *any* "path appeared" half arriving within 300 ms. Finder rewrites `.DS_Store` in the folder whenever it trashes something, so the note's trash event was paired with the `.DS_Store` rewrite and reported as `moved(note.md -> .DS_Store)`. `VaultSyncService.handleMoved` checked only that the destination *exists*, then called `Vault.updatePagePath(page, '…/.DS_Store')`: the page stayed in the Vault, re-pathed onto a system file (a later autosave would have written note content over it). Startup was unaffected, because the scan never sees `.DS_Store` as a page, which is why a restart "fixed" it.

The delete event itself was received and the Vault removal logic was correct; the defect was trusting a best-effort pairing.

## Decision

1. **Sync (policy owner):** `handleMoved` commits a move only if the destination is the same kind of entity and nothing else owns it — a page needs a `.md` page path (not `.folder.md`/internal), a folder needs a directory, a resource needs the same supported kind — and the destination is not tracked by a different page/folder/resource. Otherwise it takes the existing fallback: reconcile *both* endpoints against disk. No new mechanism; the same convergence path an ordinary `deleted`/`changed` uses.
2. **Platform:** `vault_watcher.rs` drops `.DS_Store` events before classification, so OS metadata can neither be mistaken for a destination nor steal a genuine rename's other half.

No public API, Persistence Gate, or ownership change; spec §4's reactive-reconciliation contract is unchanged.

## Alternatives Considered

- **Only filter `.DS_Store`.** Fixes the observed case but not the same shape with any other unrelated rename inside the window (another note's atomic save, a sync client's temp file). Kept as defence in depth only.
- **Cross-check content/identity before moving.** The old file is gone, so there is nothing to compare; disk truth at both endpoints is the only reliable signal.
- **Remove rename pairing.** Rejected: it is the only way a real rename keeps page identity.

## Consequences

- A genuine rename whose other half is mis-paired degrades to remove + add; identity still survives through the frontmatter `id` in the file.
- Known, separate gap (not changed here): an externally deleted *open* page leaves its `DocumentSession` registered and non-active tabs dangling.
