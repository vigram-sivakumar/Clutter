# ADR-072: Delete Permanently moves the item to the macOS Trash (`NSFileManager trashItemAtURL`); `deleteFile` stays a hard delete

**Status: Accepted** (2026-11-12). Builds on [ADR-001](./001-single-persistence-gate.md), [ADR-024](./024-folder-aggregate-lifecycle.md), [ADR-026](./026-folder-archive-lifecycle.md) and [ADR-063](./063-atomic-vault-saves.md). Changes the "recoverability from deletion" statement in `docs/durability-model.md`. Adds no subsystem, write path or recovery system. The UI label stays **Delete Permanently**. The API was chosen after the Finder Put Back test below. **Not verified:** behaviour in a signed, App Sandbox build (a release-validation requirement; see *Sandbox and distribution*).

## Context

Permanently deleting an archived note, folder or resource calls `VaultFileSystem.deleteFile`, then the Tauri command `delete_path`, then `std::fs::remove_file`, `remove_dir_all` or `remove_dir`. The bytes are unlinked at once. An item deleted from any other Mac app can be recovered from Finder's Trash; an item deleted from Clutter cannot.

`deleteFile` has callers that are not user deletions and must stay hard deletes: temp-file cleanup (`writeFileAtomic`), duplicate rollback (`VaultEntryDuplicator`), and asset cleanup (`SpaceProfileStore`). The Gate's three user-delete steps (`runDelete`, `runDeleteFolder`, `runDeleteResource`) already remove the disk item first and mutate the Vault second, and `Application` clears caches only after the Gate reports success.

## Decision

1. **A new, separate operation.** `VaultFileSystem.trashFile(path)` and a new Tauri command `trash_path`. `deleteFile` and `delete_path` are unchanged hard deletes.
2. **The Gate's user-delete steps use `trashFile`:** `runDelete`, `runDeleteFolder`, `runDeleteResource`. No other code calls it (ARCHITECTURE_RULES rule 2, extended to `trashFile`).
3. **Restore-conflict replacement trashes too.** `PageOperations.delete(id, { allowActive: true })` replaces the user note occupying a restore destination; that note goes to the Trash, through the same `delete` Gate kind. Nothing else changes in Archive or Restore.
4. **Native only, no fallback.** The implementation is a macOS system API. If moving to the Trash fails, the error is returned and nothing is deleted: no retry through `remove_file`, `remove_dir_all` or `deleteFile`. On other platforms the command returns an "unsupported" error.
5. **Order of effects is unchanged and is now a contract.** The Vault entry, resource-archive metadata, parsed-note cache entries and every other derived state are removed only after `trashFile` resolves. A rejection leaves all of them in place and propagates to the caller.
6. **Same authorization.** `trash_path` uses `authorize_entry` and `holds_a_space` exactly as `delete_path` does: absolute path, no `..`, inside the runtime fs scope of an authorized Space, a link judged by its own name and never followed, and a Space folder (or a folder holding one) refused. It takes no `recursive` flag; a directory moves as one unit.
7. **UI copy.** The label "Delete Permanently" is kept. Confirmation texts that say the action cannot be undone (`folderActionConfirmation.ts`, `archiveTopBarMenu.config.ts`) must stop promising irreversibility; their wording is a separate copy task.

## API selection

Both candidates were run on this machine (macOS 26.6, unsandboxed command-line test, disposable files; `NSWorkspace` was not run for a directory, link or read-only parent):

| Observed | `NSFileManager trashItemAtURL` | `NSWorkspace recycleURLs` |
|---|---|---|
| File | to `~/.Trash/<name>` | same |
| Directory with nested files | one move, whole tree | not run for a directory; same system service |
| Name collision | system renames: `<name> HH-MM-SS-mmm.md` | same pattern |
| Symlink | the link moves, the target is untouched | not run |
| Missing item | `NSCocoaErrorDomain` 4, synchronous | `NSCocoaErrorDomain` 4, in the completion handler, empty result map |
| Read-only parent | `NSCocoaErrorDomain` 513, synchronous | not run |
| Called from a background thread | synchronous | works; the handler ran on another queue |

The two are indistinguishable in location, naming and error codes. They differ in two ways:

- **Put Back (tested in Finder, 2026-11-12).** An item trashed with `NSFileManager trashItemAtURL` shows **Put Back** in Finder; an item trashed with `NSWorkspace recycleURLs` does **not**. This reverses the expectation recorded when this ADR was proposed, which came from documentation and community reports and was wrong for this macOS version. Both items were also found in `~/.Trash` of the same user that runs Finder (the Finder window had only shown a stale view).
- **Shape.** `NSFileManager` is synchronous and returns a Rust `Result`; `NSWorkspace` is asynchronous and would need a `block2` completion handler bridged back to the calling thread.

Decision: **`NSFileManager trashItemAtURL`**, because it gives normal Finder Trash behaviour including Put Back, and is synchronous. It needs only the `NSFileManager` feature of `objc2-foundation`, already a dependency. `NSWorkspace recycleURLs` is rejected (no Put Back). The `trash` crate is rejected: on macOS its default goes through Finder by AppleScript, which needs the Apple Events entitlement and a user prompt and would work in a development build but not under App Review; adding a crate to reach an API already reachable through the objc2 crates we have is not justified.

## Sandbox and distribution

- **Entitlements: none added.** `Entitlements.plist` keeps `app-sandbox`, `files.user-selected.read-write`, `files.bookmarks.app-scope` and `network.client`. Not added: `automation.apple-events`, any temporary exception.
- The item is moved by the system into the user's real Trash (`~/.Trash`, or the volume's `.Trashes`), not the app container. Access to the source comes from the Space's bookmark and runtime scope, the same grant that allows `delete_path` today.
- Security-scoped access is held by the process; `trash_path` does not start or stop scopes itself.
- No new privacy-manifest category is expected; confirm in `docs/privacy-and-app-store.md`.
- **Release-validation requirement.** Not verified, and the ADR does not claim it: behaviour inside the App Sandbox from a bookmark-restored Space outside Documents, in a signed (Developer ID or App Store) build, on external, cloud-synced and non-APFS volumes. The tests above were unsandboxed. These go on the sandboxed test pass in `docs/mac-app-store-release-checklist.md` §6 and are only ticked when observed in such a build.

## Error handling

- **Failure keeps the item.** Any error leaves the file, the Vault entry, the archive metadata and the caches as they were. The Gate throws; `PageOperations`/`FolderOperations`/`ResourceOperations` report it through their existing failure path (to be confirmed when implementing).
- **Mapping** (Rust returns a string, as `delete_path` does):

| Condition | Cocoa error | Message |
|---|---|---|
| Missing | `NSFileNoSuchFileError` (4) | contains "No such file or directory", matching `delete_path` |
| No permission | `NSFileWriteNoPermissionError` (513) | a clear permission message |
| Volume has no Trash | unsupported-feature error | says the Trash is unavailable there |
| Unsupported platform | n/a | explicit "unsupported" error |

- A directory trash is one move, so no partially-deleted tree.
- A failed move after a successful one is not possible within one call; for `Delete all`, each item is its own call (as today) and one failure does not undo the earlier ones, which are in the Trash.
- An item recovered from the Trash returns without its archive metadata (it is removed on delete). Sync treats it as an archived or active item by location; ADR-026 already handles an item with no provenance (`RestoreNeedsDestinationError`, "Restore to…").

## Implementation notes

- `VaultFileSystem.trashFile` is declared **optional**, and every caller goes through `trashThrough(fileSystem, path)`, which rejects when a provider has none, never deletes. It is optional only because many test doubles implement `VaultFileSystem` and not all could be changed in the same commit as unfinished folder-sync work that implements it too; it should become required once that work lands.
- Rust: `macos_trash::move_to_trash` and `vault_entries::trash_path`; the authorization shared with `delete_path` is `authorize_removal`.
- `PageOperations.delete` and `FolderOperations.delete` close the editor sessions of the pages they delete and cancel their save timers **before** the Gate runs, as they did for a hard delete. Archived items are read-only, so there is no unsaved text to lose, and a failed move leaves the page in the Vault, where it opens again. The Vault entry, resource metadata, parsed-note cache and every derived store are cleared only after the Gate reports the delete as done.

## Consequences

- Permanently deleted items are recoverable from Finder, and "Delete Permanently" stays hard for internal cleanup.
- The delete path gains a macOS-only native dependency; `trash_path` is the only command that reaches the user's Trash.
- Disk space is not freed until the user empties the Trash.
- The watcher sees the item vanish exactly as it does today; no ordering change. The Trash is outside every Space.
- `docs/durability-model.md` line 42 ("not a move to OS trash") becomes false and must be reworded; the "Does not add trash" statements in ADR-024 and ADR-026 refer to an app-owned trash and are clarified, not contradicted.

## Tests

- **Rust, `vault_entries.rs`:** every `delete_path` safeguard against an injected fake trasher (out of scope, `..`, unauthorized, Space root and Space-holding folder refused whether or not the call is recursive, link judged by its own name, missing path); the mock-runtime command-boundary test; `tests/command_permissions.rs` (build.rs, capability and `lib.rs` must agree). A few macOS-only tests of the real call for a file, a directory and a collision, each cleaning up through the resulting URL.
- **Vitest:** `LocalFileSystem.trashFile` invokes `trash_path`. Gate tests for each of the three steps: success removes the Vault entry and runs cache cleanup; failure keeps the page, folder or resource, its archive metadata and its caches and propagates the error. A restore-conflict test that the occupying note is trashed, not hard-deleted. Wrapper pass-through (`AtomicWriteFileSystem`, `SelfWriteAwareFileSystem`, test wrappers). `deleteFile` callers (temp cleanup, duplicate rollback, asset cleanup) still hard-delete.
- **Sandbox automation (local only):** trash a disposable file and a folder in a bookmarked Space; assert they leave the Space and the item is not hard-deleted. Add a case for a link and for a Space-root refusal.
- **Manual, signed sandboxed build:** Finder Put Back, name collision, an external volume, a volume without a Trash.

## Documents to update when implemented

`docs/durability-model.md` (line 42); `docs/architecture-specification.md` (`VaultFileSystem` interface and the delete flow); `ARCHITECTURE_RULES.md` (rule 2 and its regression signature); ADR-024 and ADR-026 (clarification notes); `docs/building-and-distribution.md` (evidence row, with what was and was not verified); `docs/mac-app-store-release-checklist.md` §6; the `vault_entries.rs` module comment and the `deleteFile` doc comment in `VaultFileSystem.ts`.
