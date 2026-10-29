# ADR-064: A Space that is not open has its avatar changed by one guarded writer, never by the open Application

**Status: Accepted**

## Context

A Space's profile — its identity and avatar, and its settings — is the `space` key of that Space's own `.clutter/workspace.json`, plus, for an image avatar, a file in that Space's `Assets/`. While a Space is open, `SpaceProfileStore` (owned by its `Application`) is the one writer of the key. Settings could therefore change the open Space's avatar and nothing else's: `Settings.tsx` passed the avatar handler only when `selectedSpace.active`, and the page showed every other Space's avatar read-only. Renaming a Space had already been opened to inactive Spaces (ADR-056, `renameInactiveSpaceFolder`), and "Reset settings to defaults" already writes inactive Spaces' profiles directly (`clearSpaceProfileSettings`). Only the avatar was left behind, so a user had to open a Space to change how it looks.

**Is the restriction an invariant?** No. `ARCHITECTURE_RULES.md` rule 2 governs `Page`/`Folder` content; its Scope clause excludes `.clutter/*` and any file that never becomes a `Page`/`Folder` (assets included, as `importAsset` already relies on). The Persistence Gate is not involved in a profile at all, and an inactive Space has no Gate. The real invariant is **one writer of a Space's profile at a time**: the open Application while it is open, and nothing else. The restriction was a limitation of the first implementation, which only had the open writer.

The danger the restriction was guarding against is real, and is the thing this ADR must keep true: an `Application` loads its profile once, when the Space opens, and later writes whole profiles from that copy. A write to the file by anyone else that lands after the load is overwritten by the Application's next write.

## Decision

1. **One more writer, for a closed Space only: `setSpaceProfileAvatar(fileSystem, rootPath, change)`** in `SpaceProfileStore.ts`, next to `clearSpaceProfileSettings`, which is its precedent. It takes a file system rooted at the target Space (`openVaultFileSystem(path)`, so it follows the same atomic-save policy as the Application, ADR-063) and writes only under that root.
2. **The single-writer rule becomes explicit and has a guard.** `changeInactiveSpaceAvatar` (`app/spaces`) holds the existing `SpaceLifecycleGuard`, with a new kind `'editing-profile'`, for the whole change. While it is held the Space cannot be opened, renamed or removed (`switchSpace` and the other operations already refuse while the guard is held), so no Application can load a profile that this writer is about to replace. It refuses, writing nothing, when the guard is taken, when the path is not a registered Space, when it is the open Space (its avatar goes through its Application, unchanged), or when its folder cannot be reached (a missing folder is never written into, so `.clutter` is never created in a place that is gone).
3. **Order of work, for an image:** copy into that Space's `Assets/` through the existing `importAsset` (collision-free name, existing assets untouched) → read the profile as it is now → write the profile with the reference this call created. The reference stored is never a value supplied by the caller. If anything after the copy fails (unreadable file, a profile written by a newer Clutter, a refused write), the file this call created is deleted and nothing else; an earlier avatar's asset is never deleted, because notes may use it. A Space with no profile gets an identity in the same write, as `ensureIdentity` does for the open Space.
4. **Nothing is shown as saved before it is.** The settings page re-reads the Space's profile from disk only after `changed`; a refusal or failure returns `{ error }` shown on the page, in the same words as the open Space's (`describeSpaceProfileFailure`), and the registry's avatar list is untouched.
5. **The Settings UI is one workflow.** `SpacePage` is unchanged; `Settings.tsx` supplies `onChangeAvatar` for every Space (the active handler for the open one, a path-bound inactive handler for the others), the same shape `onRename` already has.
6. **Scope.** Only the avatar. Other profile properties are *settings* (default note folder, cover position, automatic cleanups, asset moves): they are controlled from pages that are not per-Space and edited through the open Space's store, and no page asks to edit them per Space. They are not given an inactive writer; "Reset settings" keeps its own.

## Alternatives considered

- **Pass the avatar handler for inactive Spaces to the Application of the open Space.** The open Application cannot write another folder: its file system is sealed to its root, and its store would write the wrong file. Rejected.
- **Open the other Space (switch) behind the scenes, change it, switch back.** Closes and reopens the Application, flushes the open note, and is exactly the cost the user is trying to avoid. Rejected.
- **Offer "switch to this Space to change its avatar".** Cheapest, and keeps the limitation. Kept as the fallback if this ADR is rejected.
- **A generic "write any profile key of any Space" service.** Not needed by any current page; invites the second-owner problem for settings. Rejected (rule 6 in `docs/implementation-rules.md`).
- **Let the settings component write the file.** Rejected: persistence stays out of presentation.
- **A new queue or per-Space lock.** `mergeAndWriteWorkspaceStateFile` already serializes writes of `.clutter/workspace.json` in-process and, with atomic saves, replaces only the content that was read; the guard removes the one race that remained (an open Application). A lock would be a second mechanism for the same thing.

## Consequences

- Every registered Space's avatar can be changed from its Settings page; the open Space behaves as before.
- While an avatar change is under way (a copy and a write), switching to, renaming or removing a Space is refused with "A space is being updated. Try again in a moment", and a second avatar change is refused as busy.
- **Not guarded:** another process (a second Clutter window, a hand edit) writing the same file. The change reads the profile immediately before writing and, with atomic saves, the write replaces only the content it read; without atomic saves, as for every other `.clutter/workspace.json` writer, the last writer wins.
- The open Space's avatar path still leaves an unreferenced copy in `Assets/` if its profile write fails (ADR-062's neighbour, unchanged here); the inactive path cleans up. Bringing the two to the same behaviour is a separate, small change.
- Removing an avatar never removes the image file from `Assets/`.

## Migration

None. No stored format changes: the same `space` key, the same `{ type: 'emoji' | 'image' }` shape, `version` 1. A profile with a higher `version` is left alone and the change is refused.

## Verification

`SpaceProfileStore.inactiveAvatar.test.ts` (isolated, in-memory file system): emoji and image, collision-free names, no profile, removal, two Spaces, a write that arrives while the image is copied, ordered concurrent calls, failed copy, failed write with cleanup, failed cleanup, newer version. `changeInactiveSpaceAvatar.test.ts`: guard held and released, busy, unregistered path, open Space, missing or unreachable folder, failure never reported as saved. `SettingsDialog.test.tsx`: the page routes the change to the right handler and shows an error. The real Tauri file system and the packaged app were not exercised by these.
