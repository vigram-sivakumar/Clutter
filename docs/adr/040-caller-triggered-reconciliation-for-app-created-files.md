# ADR-040: Caller-triggered reconciliation for files the app creates outside the Gate

**Status:** Accepted (design review, Vigram, 2026-10-04)

## Context

Clutter writes some files that are not Pages or Folders and so never go through the Persistence Gate: asset files (Upload, Save to vault) and, per [ADR-028](./028-duplicate-via-filesystem-copy.md), raw duplicates. The Vault only learns about such a file through Sync. Until now the only trigger for that was the OS file watcher: ADR-028 deliberately leaves these writes unsuppressed so the watcher *observes* them "exactly as an externally-created file", and `duplicate()` waits on the Vault with no timeout, assuming "an OS-level filesystem event is expected to arrive".

That assumption is fine when nothing depends on the file being known *right now*. Save to vault does: it rewrites notes and covers to point at the new file, and a Markdown image resolves only through a `VaultResource` that is already in the Vault. Rewriting before Sync has registered the file left images broken (and the Assets view empty) until a reload. The macOS watcher itself is prompt (a measured ~12 ms from write to `Create`/`Modify` events), and the Rust watcher is recursive over the whole vault root and filters nothing, so this was a sequencing dependency, not a watcher defect: the caller acted on a file the Vault did not yet know.

There are two genuinely different situations, and only the first is what the spec's Sync section describes:

```
external change  -> watcher -> Sync
the app itself made a change to a known exact path -> ??? 
```

## Decision

`VaultSyncService.reconcileKnownPath(absolutePath)` is the supported way for the app to say "this exact path changed — reconcile the Vault with disk, and tell me when that is done."

- **Same interpretation, second trigger.** It runs the same `handleChanged` -> `reconcilePath` logic a watcher event gets (add / refresh / remove, decided from disk), on the same per-path `VaultSyncCoordinator` lane. There is no second implementation of "how a file becomes a vault entity", which is the single-owner property ADR-028 protects.
- **Generic, not Save-to-vault specific.** It is named for what it is (reconcile a path the app knows about), works for a file or directory, a create, update or delete, and is available to any future non-Gate write.
- **Awaitable and honest.** It resolves after the Vault reflects disk and propagates failures, so a caller can verify the result before acting on it.
- **Idempotent with the watcher.** A later watcher event for the same path finds the entity tracked and only refreshes its metadata; the lane prevents the two from interleaving, and `reconcileResourceFile` re-checks after its awaits so concurrent lanes cannot double-add.
- **Not for Gate-owned content.** Pages and Folders keep going through the Persistence Gate. This must never be used to route a `PageOperations`/`FolderOperations` write through Sync.

Save to vault's invariant, enforced by `saveRemoteImage`'s step order and tested: **a remote image is rewritten to a local reference only after the local file has been written and registered in the Vault.** Download -> write -> `reconcileKnownPath` -> verify the Vault has the resource -> rewrite. If any step fails, nothing is rewritten.

## Alternatives Considered

- **Wait for the watcher, with a timeout.** Consistent with ADR-028, but ties correctness to OS event delivery and gives a caller nothing to await on failure; a missed or late event becomes either a hang (as `duplicate()`'s unbounded wait would) or a spurious error.
- **Call `vault.addResource` directly after the write.** Rejected for the reason ADR-028 already gives: it makes the app-initiated write a second source of truth for what was added, diverging from Sync's own reconciliation.
- **A Gate `create-resource` operation kind.** Heavier, and resources have no content or identity the Gate owns today; revisit if resources ever gain app-owned metadata.

## Consequences

- The spec's Sync section no longer says "no other public methods": it has this one, with the invariant above. Sync still only *reacts to disk state*, now also when prompted.
- `duplicate()` still relies on the watcher with no timeout (unchanged here). If that ever proves flaky, `reconcileKnownPath` is the available fix, applied deliberately.
- The self-write mechanism is untouched. `writeBinaryFile` stays unsuppressed (its doc comment explains why); `copyFile` stays suppressed for its first echo, which is harmless only because a copy also produces a later `Modify` event that is not suppressed. Callers that need certainty should not rely on that and should call `reconcileKnownPath`.
