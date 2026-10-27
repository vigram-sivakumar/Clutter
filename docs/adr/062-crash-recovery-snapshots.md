# ADR-062: Crash recovery — session-tagged snapshots of unsaved work, kept outside the vault

**Status:** Proposed (implemented in the working tree; the desktop-app behaviour — force-quit, the real data directory — is not yet verified, see *Verification*). Builds on [ADR-001](./001-single-persistence-gate.md), [ADR-053](./053-persistent-parsed-note-cache.md) and `docs/durability-model.md`.

## Context

Unsaved work lives only in memory (`DocumentSession` for a body, `FieldEditState` for a title or description, a draft descriptor for a note that has no file yet). A crash, Force Quit, logout or Dock Quit bypasses the close flow, so everything typed since the last successful save is lost. `durability-model.md` records this as the *Committed* stage's accepted limit. No other mechanism preserves editor revisions: `editorHistoryCache` is session-lifetime, `localStorage` holds UI preferences, and `.clutter/workspace.json` keeps a note's source only as a fold-state staleness guard.

## Decision

1. **Recovery snapshots are a separate safety net; the vault stays the source of truth.** They are application infrastructure, not page content, so they do not go through the Persistence Gate (`ARCHITECTURE_RULES.md` rule 2 scopes the Gate to vault domain content) and never write into a vault.
2. **Where.** `<appData>/recovery/<vaultKey>/<note>.<session>.json` (macOS: `~/Library/Application Support/<bundle id>/recovery`), via the fs plugin and the `$HOME/**` scope the app already has; no new native code or capability. The web runtime has no data directory: it uses `localStorage` (a development surface). `vaultKey` is `space-<Space profile id>` when the Space has one (stable across a folder rename), else `root-<fingerprint of the root path>`; both are read.
3. **What.** One JSON record per note with unsaved work, holding only the unsaved fields (body with the editor revision, title, description), the note's id, label and path, a draft's folder/type/tags, and the vault's own values at capture time (a fingerprint of the body, the saved title and description). No credentials, preferences or other state. A draft is told apart by `kind`, never by id.
4. **Session-tagged files.** Each session writes only `<note>.<8-hex session>.json`. A record left by a crashed session is never overwritten by the next session editing the same note, and a session only ever removes its own files.
5. **When.** A snapshot is written 1 s after the last change and at least every 5 s of continuous editing (`RECOVERY_DEBOUNCE_MS`, `RECOVERY_MAX_WAIT_MS`), never per keystroke. Each write reads the note's state when it runs, one note's writes run strictly one after another, so a delayed older snapshot cannot replace a newer one. Writes are temp-file-then-rename, so a failed write leaves the earlier record intact; a failed write retries up to 3 times, 5 s apart, and never changes the outcome of the vault save. A snapshot is also written at shutdown and when the vault is lost.
6. **Cleanup is revision-aware.** A record is removed only when, at that moment, the note has nothing unsaved in any channel (body, title, description). Saving revision N while N+1 is waiting leaves the record, rewritten with N+1. A record is removed also on explicit Discard, after a restore has been re-protected by this session's own record, or after a "save as new note" succeeded. A failed vault save keeps the record.
7. **Startup.** After the vault loads, records from earlier sessions are classified against the vault: **already-saved** (the vault holds the recovered text: record removed), **recoverable** (the vault still matches the snapshot's base), **conflict** (the vault changed, or the note is archived), **missing-note**, **draft**. Nothing is applied automatically. If the vault cannot be opened, nothing is classified and no record is removed. Unreadable or malformed files are ignored and left in place.
8. **Restore never overwrites.** *Recoverable*: the text re-enters the editor as an ordinary unsaved edit (`commitEdit`/`commitTitle`/`commitDescription`), is saved by autosave through the Gate, and the old record is removed only after this session's own record protects it. *Conflict*, *missing-note*, *draft*: the only offer is a new note (`PageOperations.create`, collision-free naming). Decide later keeps every record; a persistent top-bar notice reopens the review.
9. **Closing with "Close and lose changes"** keeps the record (the user did not discard the recovery copy). The dialog wording still says the changes will be lost; whether to say they will be offered for recovery is a product decision left open.

## Limits (not guaranteed)

- Edits made after the last completed snapshot are lost: up to about 1 s after the last keystroke, 5 s while typing continuously, plus the time of one write. A crash while a write is in flight leaves the previous record.
- Atomicity is a same-directory rename; there is no `fsync`, so power loss may lose the newest snapshot (never corrupt an older one, as far as the rename guarantees).
- Table normalisation can make a saved note differ from the recovered text; the result is a *conflict*, which still offers a new note, never a loss.
- Recovery data is a **second copy of user content** (possibly sensitive) outside the vault, unencrypted, in the app's data directory. It is removed on a confirmed save or an explicit discard. A stale record for a deleted vault stays until the user discards it; there is no age-based deletion because deleting unsaved work without being asked is the failure this feature exists to prevent.
- Other Spaces' records are never touched (keys differ), and a renamed Space keeps its records when it has a profile id.

## Alternatives considered

- *Writing recovery into the vault (`.clutter/`)*: a second write path beside the Gate, visible to Sync and the watcher, and unavailable exactly when the vault is.
- *A fixed file per note*: a new session editing the same note would overwrite the crashed session's record.
- *Journalling every keystroke*: more I/O and a larger design for a bounded gain.
- *A new Rust writer*: the fs plugin's rename already gives atomic replacement for a file this small, and the existing capability covers it.

## Verification

Unit and integration tests cover the journal, classification, restore, discard, the app-wide status and the Tauri storage against a mocked fs plugin. The web runtime was exercised in a browser with forced failures and reloads. **Not verified:** the packaged desktop app, the real data directory, an actual process kill, and Force Quit.
