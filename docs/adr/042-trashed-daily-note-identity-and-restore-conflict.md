# ADR-042: A trashed Daily Note keeps its identity; a restore that finds its day taken asks instead of failing

**Status:** Accepted (design review, Vigram, 2026-10-06)

## Context

Two behaviours of a Daily Note in the Trash were wrong.

1. **It stopped being a Daily Note.** A page's type was a pure function of its *current path* (`Vault.resolvePageType` / `PageBuilder`): a Daily Note only while it sits in `Daily Notes/…`. Archiving flattens it into `Archive/`, so it became an ordinary note — shown with the raw `2026-10-06` filename instead of the Daily Note date title, with an editable title, and with the full Note menu. Its date was never lost (the filename and `metadata.originalPath` both carry it); the *classification* was.
2. **Restoring it could fail.** Restore returns a page to `metadata.originalPath`. If a Daily Note for that day had since been created, the move hit the occupied path and the restore rejected with "Path already in use" — leaving the note in the Trash with no way forward. (`MoveService.resolveRestoreDestination` documented "no Inbox fallback: original path or vault root" as the approved contract.)

## Decision

1. **One type rule, in one place.** `resolvePageType(vaultRoot, path, metadata)` (`vault/initialize/ReservedResources.ts`, beside `isDailyNotePath`) is the rule: a page is a Daily Note when its path is a Daily Note path **or** it is archived and its `originalPath` was one. `PageBuilder` (initial scan) and every `Vault` mutation that recomputes type (`replacePage`, `updatePagePath`, the folder-move cascade) call it; the private `Vault.resolvePageType(path)` is removed. Type is still derived, never persisted. Everything keyed on `page.type` — the date title and its read-only title (`isPageTitleEditable`), the Daily Note top-bar menu, list labels, breadcrumbs — follows with no Trash-specific code.

2. **Leaving the Trash resets identity to the path.** Restore clears `originalPath`/`status`, so after a restore the current path alone decides: back in `Daily Notes/` it is a Daily Note again; restored anywhere else (the Inbox fallback below) it is an ordinary note. Nothing is renamed on the way in or out — `name` stays the canonical date.

3. **A taken restore path is a conflict the caller answers, never an overwrite.** The Gate's `restore` operation throws `RestoreConflictError` (carrying the occupant's id) when `resolveRestoreDestination`'s path belongs to another page. `PageOperations.restore(pageId, { onConflict? })` returns `{ status: 'conflict', existingPageId }` for that, and otherwise `{ status: 'restored', movedToInbox }` (previously `void`; existing callers are unaffected). The two answers:
   - **`'inbox'`** — the Gate op carries `conflict: 'inbox'`: the Inbox is ensured (`ensureReservedFolderForOperation('inbox')`) and the destination is `MoveService.resolveMoveDestination(page, inbox)`, the existing collision-free naming every Move into a folder uses. No second naming scheme; an Inbox note of the same name is never overwritten.
   - **`'replace'`** — the occupant is permanently deleted through `PageOperations.delete` (the Gate's `delete`), then the restore proceeds. This is the one destructive path and is only reachable from the explicit **Replace** choice (product decision, 2026-10-06).
   The no-conflict restore is unchanged, and the "original folder gone → vault root" fallback is unchanged: the Inbox is used **only** for this conflict.

4. **UI.** `PageHost` asks with the app's `Confirmation` ("Restore Daily Note — A Daily Note for October 6 already exists. What would you like to do?", **Move to Inbox** primary, **Replace** destructive, a close (×) to dismiss and leave the note in the Trash). `Confirmation` gained an optional alternate action (a second button in place of Cancel, plus the close button); `Toast` gained an optional action. After Move to Inbox a toast "Restored to Inbox" offers **Open**. The toast is owned by `AppLayout`; `PageHost` raises it through an `onShowToast` prop.

## Consequences

- A page can now be `type: 'daily-note'` while living in `Archive/`. Consumers that mean "a Daily Note that exists for that day" must exclude archived ones: the calendar's noted-dates does (`datesWithNotes`); the Daily Notes sidebar already walks the `Daily Notes/` folders so is unaffected; wiki-link suggestions already drop archived pages; embed suggestions deliberately keep archived Daily Notes embeddable (their own documented rule, now actually reachable).
- The Daily Notes nav row (previous / today / next) now also shows on a trashed Daily Note, as it does for any Daily Note page.
- Tasks inside a trashed Daily Note keep their date-implied due date (as they had before archiving).
- `MoveService.resolveRestoreDestination` is unchanged; the conflict is detected in `runRestore`, where the Vault is consulted for the occupant, not in the resolver.
- Amends the "type is a pure function of its current path" statement in `Vault`/`PageBuilder`/`FrontmatterSerializer` comments: it is a pure function of path **and archive metadata**.

## Alternatives Considered

- **A Trash-specific Daily Note title formatter** — rejected: a second formatting rule, and it leaves the trashed note editable and with the wrong menu. The identity, not the formatter, was missing.
- **Persisting `type` in frontmatter** — rejected: type is deliberately derived (the retired `type` key is dropped on save); it would reintroduce a value that can disagree with the path.
- **Presentation-only `isDailyNoteIdentity(page)` helper** — rejected: a second place that classifies Daily Notes, to be remembered at every surface.
- **Auto-restoring to the Inbox with only a toast** — rejected in favour of asking: Replace is a legitimate choice, and silently relocating a note is a surprise.
