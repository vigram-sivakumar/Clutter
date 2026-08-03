# Clutter — Durability Model

## Purpose and scope

This document defines the durability vocabulary Clutter's architecture already implements, so that future ADRs and implementation work can refer to a specific stage by name instead of re-deriving what "saved" means each time the question comes up.

**This is not an ADR.** It makes no decision, proposes no feature, and changes no code. It is a precise description of guarantees the current, frozen architecture (`architecture-specification.md`) already makes — and, equally precisely, guarantees it does not make. Where a future capability (undo, version history, cloud sync, atomic writes) would extend or add a stage, that capability is named as out of scope for today's architecture, not sketched or designed here.

**How to use this document:** a future ADR proposing a change to persistence, editing, or sync behavior should state which stage(s) it affects, using the names below, and whether it changes that stage's guarantee or adds a new one. "This strengthens Durable's guarantee against power loss" or "this adds a new stage between Committed and Durable" are the kinds of statements this vocabulary exists to make possible.

---

## Stage 1: Committed

**What enters this stage:** a user-authored edit (title or body) that has been committed to a `DocumentSession` via `DocumentSession.commit(transaction)`, producing a new immutable `DocumentRevision`. Content sitting in an unfocused, uncommitted editor buffer (raw keystrokes not yet blurred/committed) has not yet entered this stage at all — it exists only in the DOM, with no guarantee whatsoever.

**Guarantee provided:** the edit is captured as the session's current, authoritative in-memory state — `session.currentRevision` reflects it, and any subscriber to that session (`session.subscribe`) observes it. Within the running application process, for as long as it keeps running, this is the true state of the document.

**Explicitly does not guarantee:**
- Survival of an application crash, an OS crash, or power loss — nothing at this stage exists outside the process's memory.
- That disk space, permissions, or any other precondition for eventually writing this content actually holds — commit succeeds unconditionally, regardless of whether a subsequent write could ever succeed.
- Recoverability of what a commit overwrote — there is no history of prior revisions retained past the current and last-saved pointers; a destructive edit committed here is, from this stage's perspective, indistinguishable from any other edit.

**Owning subsystem:** `DocumentEditing` (`DocumentSession`, `DocumentRevision`, `DocumentRegistry`) — per its own contract, this subsystem owns only the live edit buffer and has no knowledge of `Page`, `Vault`, or whether the id it's tracking is backed by anything durable.

**Future capabilities that belong outside this stage, not inside it:**
- **Undo/redo** would consume the sequence of `DocumentRevision`s this stage already produces, but does not exist today — only the current and last-saved revision are retained, not a log. `DocumentRevision`'s own documentation names undo/redo as an anticipated consumer of the immutable-revision concept, not something this stage currently provides.
- **A local durable buffer** (something surviving a crash before the file is written) would sit between this stage and Durable — no such intermediate stage exists today; the only transition out of Committed is directly to Durable, with nothing in between.

---

## Stage 2: Durable

**What enters this stage:** a committed revision's markdown (from Committed), or a metadata patch, passed to the Persistence Gate (`PagePersistenceCoordinator`) and run through `writeParseRebuildReplace` — write to disk, re-parse exactly what was written, rebuild the `Page`, replace it in `Vault`.

**Guarantee provided:** as of a successful `writeFile` call, the content was handed to the operating system's file-write path, and `Vault`'s in-memory model was verified against a fresh re-parse of exactly what was written — not assumed from what the caller intended to write. This write-then-reread-to-verify pattern is a genuinely stronger guarantee than "the write call didn't throw." On failure, `Vault` is left exactly as it was before the attempt — the guarantee of internal consistency between `Vault` and disk holds whether or not the individual write succeeds.

**Explicitly does not guarantee:**
- Physical durability — no `fsync`/flush call exists in the current filesystem provider (`LocalVaultProvider.writeFile` calls Tauri's `writeTextFile` directly). A successful write means the OS accepted the bytes, not that they survived an OS crash or power loss occurring immediately after.
- Atomicity of the write itself — there is no write-to-temporary-file-then-rename pattern; the target path is written in place. A crash or power loss *during* the write can leave the file truncated or partially overwritten, which is a stronger failure than losing the newest edit: it can corrupt content that was already durable before this write began.
- Detection of filesystem-level corruption — there are no checksums; bytes read back as valid are trusted as valid, regardless of whether the underlying storage silently corrupted them.
- Recoverability from deletion — `deleteFile` calls a direct filesystem unlink (Tauri's `remove`), not a move to OS trash. Once a delete operation completes, this stage provides no path back. (`archive`, a distinct, deliberately softer operation that moves rather than deletes, is the only recoverable removal path this stage's owning subsystem provides — it is not a variant of the same guarantee as `delete`, it is a different operation with a different guarantee.)
- Resolution of concurrent writers — this stage has no knowledge of any other writer touching the same path; that concern belongs entirely to Reconciled.

**Owning subsystem:** the Persistence Gate (`PagePersistenceCoordinator`), backed by `Platform` (`VaultFileSystem`) for the actual write and `Vault` for the resulting in-memory state. This is also the sole write path for page/folder content — no other subsystem writes to disk or mutates `Vault` in response to an app-initiated action.

**Future capabilities that belong outside this stage, not inside it:**
- **Atomic writes** (temp-file-then-rename) and **explicit flush/fsync** would strengthen this stage's own guarantee without changing what stage they belong to — they are hardening of Durable, not a new stage.
- **Version history / snapshots** would consume revisions that reach this stage (analogous to how Ulysses' Snapshots and Notion's page history sit on top of, and are triggered independently from, their respective save mechanisms) but no retained history exists today — once a page is replaced in `Vault`, its prior on-disk state is not kept anywhere by this stage.
- **Cloud sync** is a separate, later stage this one would eventually feed into — Durable's guarantee is local-disk durability only and says nothing about any second copy existing anywhere.

---

## Stage 3: Reconciled

**What enters this stage:** a filesystem change Clutter did not itself just make — detected via `VaultFileSystemWatcher`, filtered through `SelfWriteAwareWatcher`/`SelfWriteRegistry` to exclude Clutter's own just-completed writes (identified by path, not content), and processed by `VaultSyncService` using the same write-parse-rebuild mechanism the Gate itself uses internally.

**Guarantee provided:** `Vault`'s in-memory model will come to match what the filesystem watcher reports for a given path, using the same trusted parse/rebuild logic the Gate's own writes use — not a separate, independently-trustworthy path. This is a consistency guarantee about `Vault`, not an additional durability guarantee about content: it cannot make anything more durable than Durable already made it, and if this stage never runs at all, whatever is on disk is still exactly as durable — `Vault` would simply be stale about it.

**Explicitly does not guarantee:**
- Resolution of a genuine write race — the self-write suppression mechanism solves one specific problem (don't reprocess Clutter's own echo of a write it already knows about), not the broader problem of two writers producing different content for the same path in the same narrow window. That scenario has no defined outcome today.
- Recovery of content lost to an external tool's own failure (a crashed external editor, a failed sync client writing to the vault) — a write that never reaches disk produces no watcher event and nothing for this stage to reconcile.
- Content recovery from an externally-deleted file — this stage will correctly remove `Vault`'s now-stale entry (preventing an internally inconsistent state), but provides no path to recover what was deleted.
- Anything about a *second* copy of the vault on another device — this stage reconciles one local filesystem against one local `Vault`; it has no concept of a remote counterpart.

**Owning subsystem:** `Sync` (`VaultSyncService`), backed by `Platform`'s watcher and the `SelfWriteAwareFileSystem`/`SelfWriteRegistry`/`SelfWriteAwareWatcher` machinery that lets it distinguish its own echo from genuine external change.

**Future capabilities that belong outside this stage, not inside it:**
- **Cloud sync** is not this stage under a different name. Today's `Sync` reconciles *local* filesystem changes made by *other local processes* against `Vault`. A cloud-sync layer would be an additional, later stage reconciling this device's `Vault` against a remote copy — a different problem (network partitions, multi-device conflicts, a genuine second source of truth) than this stage solves, even though both would be named "sync" colloquially. Conflating the two in future design conversations is the specific confusion this document exists to prevent.
- **True conflict resolution** (as opposed to echo suppression) belongs to whichever future capability — local or cloud — actually takes on the "two writers, different content, same path" problem. Nothing today has taken it on.

---

## Named gaps: capabilities with no stage today

These do not extend an existing stage — they would each be a new stage, or a property added to an existing one, and neither is proposed here. Listed for completeness, because a durability model that omits what's missing would misstate the guarantees above by implication.

- **Recoverable** (undo, version history): no stage today retains anything beyond the current and last-saved revision. A destructive edit that reaches Durable is exactly as permanent as any other edit that reaches Durable — there is no separate, coarser-grained checkpoint to fall back to, unlike Notion's or Ulysses' explicitly separate version-history mechanisms.
- **Cloud-synced**: no stage today has any concept of a copy of the vault existing anywhere other than this device's local filesystem. Single-device loss (device destroyed, stolen, or its disk failing) is unrecoverable by anything in this architecture, by design absence rather than by a stated, accepted trade-off — worth naming as a gap distinct from Committed's *deliberately* accepted in-memory-only trade-off.
- **Atomic writes / flush-to-disk**: not a new stage, but a strengthening of Durable's existing guarantee that doesn't currently exist — the difference between "the OS accepted this write" and "this write cannot be torn or lost by a crash immediately after."

---

## Summary

| Stage | Owns | Guarantees | Explicitly does not guarantee |
|---|---|---|---|
| **Committed** | `DocumentEditing` | Current state within the running process | Crash/power-loss survival; edit history |
| **Durable** | Persistence Gate + `Vault` | Written to disk and verified by re-parse; `Vault` never desyncs from a failed write | Physical flush; atomic/torn-write safety; corruption detection; delete recovery; concurrent-writer resolution |
| **Reconciled** | `Sync` | `Vault` eventually matches disk for externally-made changes | Genuine write-race resolution; external tool's own data loss; content recovery from external delete; anything cross-device |
| *(gap)* Recoverable | — none — | — | Any content history beyond current + last-saved |
| *(gap)* Cloud-synced | — none — | — | Any copy of the vault beyond this device |
