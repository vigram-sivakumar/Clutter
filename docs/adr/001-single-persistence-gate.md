# ADR-001: One Persistence Gate for All Page/Folder Writes

**Status:** Accepted

## Context

The independent assessment found three independently-implemented write paths for page content: a queued, per-page-serialized path (`PagePersistenceCoordinator`) used for edit-save and archive/restore; and two unqueued direct-write paths — `ResourceCreation` writing straight to `fileSystem.writeFile` for note/daily-note creation, and `ResourceDeletionService` writing straight to `fileSystem.deleteFile`. Only the first path had any protection against a concurrent operation on the same page. Sync additionally has its own, structurally similar but independently implemented write-parse-rebuild-replace pipeline for externally-triggered repairs.

None of this had caused a visible bug at the time of review — the UI happens not to trigger create/delete concurrently with a save today. But "hasn't happened yet" is not the same as "prevented," and the number of write paths was trending upward, not downward, across recent commits (deletion was the newest addition, following the same unqueued pattern as creation).

## Decision

`PagePersistenceCoordinator` (renamed conceptually to "the Persistence Gate" in the specification) becomes the only mechanism through which page or folder content is written to disk or the `Vault` is mutated on the app's behalf. Its operation vocabulary expands from `{save, move}`-shaped internal use to a full `PersistenceOperation` union covering create, save, delete, move, rename, archive, and restore. Every one of these enqueues through the same per-page queue.

Sync keeps its own separate queue (`VaultSyncCoordinator`, keyed by path) for externally-triggered reconciliation, because it genuinely has different failure semantics (the file already changed on disk; there's nothing to "roll back"), but shares the Gate's internal write-parse-rebuild-replace helper so the *shape* of that logic exists once, not twice.

## Alternatives Considered

- **Keep three write paths, add manual coordination between them.** Rejected: would require every future capability's author to remember to check against every other path's in-flight operations — an ever-growing manual coordination burden instead of a structural guarantee.
- **Merge Sync's queue into the Gate's queue entirely (one queue for everything).** Rejected: app-initiated and externally-triggered writes have genuinely different failure modes (a failed app save should surface to the user and can be retried; a failed sync-repair should log and move on, since the user didn't initiate it). Forcing them through one queue would mean building failure-branching logic to distinguish them anyway, with no benefit over keeping two queues that share their internal write mechanics.
- **Leave `ResourceCreation`/`ResourceDeletionService` as documented, intentional exceptions.** Rejected: "documented bypass" was already the status quo (a comment in `ResourceCreation` explicitly acknowledged the daily-note bypass as intentional) and it did not prevent the pattern from being extended to deletion. A documented exception that keeps growing isn't a contained exception.

## Consequences

- Every future capability that touches disk must be expressed as a `PersistenceOperation` variant, which is a small but real constraint on how new features are built — it's a constraint by design (see ARCHITECTURE_RULES.md, rule 2 and rule 12).
- The one genuine architectural exception — creating today's daily note before a `Vault` exists at all, during Composition Root bootstrap — is handled by giving bootstrap its own minimal Gate instance (see ADR-008), not by carving out a second bypass.
- Concurrency testing effort concentrates on one class (`PagePersistenceCoordinator`) instead of being spread thin across three, which is a net testing-effort reduction even though the class itself grows.

## Why This Approach Is Preferred

It converts "no two writes to the same page can race" from a fact that happens to be true today (because the UI doesn't trigger the unsafe combination yet) into a structural guarantee that holds regardless of what future features do. It costs one migration (routing two existing, already-tested services through a new operation-kind mechanism) rather than an ongoing tax on every future contributor's vigilance.
