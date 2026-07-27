Architecture Status

Version: 1.0
Status: Frozen

Changes to the architecture should be driven by implementation experience rather than speculation.

# Arc v3 – Implementation Plan

## Goal

Implement the Clutter Document Engine incrementally.

Each milestone should produce a working application while moving closer to the target architecture defined in `Engine.md`.

---

## Implementation Status (as of 2026-07-27)

This section records what has actually shipped against the plan below. Ground truth is the working tree, not this document — see `docs/architecture/Core Review.md` for the file-level audit trail behind every status below. Update this section, not the phase descriptions, as work lands; the phase descriptions remain the plan of record.

**Summary:** Phases 1–2 are functionally complete for the read/open path. Phase 3 exists structurally but is not wired to anything that calls it. Phase 4 is satisfied by a different mechanism than planned (see note). Phase 5 has not started. Phase 6 shipped one narrow vertical slice (Daily Note creation) ahead of the general command layer, which was a deliberate "build features first" deviation, not an oversight. Phase 7 has not started.

- **Phase 1 — Foundation: done**, with one caveat. `DocumentRegistry`, `DocumentSession`, `DocumentTransaction`, `DocumentRevision`, `DocumentState` all exist and are correctly scoped. `SaveCoordinator` exists as a file but is instantiated nowhere in the app — built, never integrated. Every open page is backed by a `DocumentSession`, confirmed.
- **Phase 2 — Open Document: partially done.** Open Page, attach-to-existing-session, and Close document all work (`PageApplicationService.openPage`/`closePage` via `DocumentRegistry`). Multi-view attach/detach and automatic disposal of inactive sessions were never built — `DocumentSession` has no attach/detach API, and `DocumentRegistry.close()` only removes on an explicit close call, not on last-view-detached.
- **Phase 3 — Editing: not started, despite the mechanism existing.** `DocumentSession.commit()`, `isDirty`, and revision tracking are implemented, but nothing in the app calls `commit()` — no editor is wired to it yet. Title changes, frontmatter edits, and task toggles are unimplemented. Practically: today's editor cannot save anything it types.
- **Phase 4 — PageFacts: satisfied by a different mechanism than planned, not by this one.** There is no `PageFacts` type and nothing derives facts from a committed `DocumentRevision`. Semantic extraction (tasks, tags, links, headings) happens instead in the Vault pipeline's Understand/Build/Knowledge stages, computed once at full-vault-scan time from raw file content — not incrementally from edits. This satisfies the *product* need today (the Vault has tags/tasks/links) but not the *architectural* invariant this phase describes (facts derived from commits). Worth an explicit decision on whether Phase 4 is still needed as designed once persistence exists, or whether the Vault-pipeline mechanism is the permanent answer.
- **Phase 5 — Persistence: not started.** No persistence queue, atomic writer, autosave, or recovery path exists. `SaveCoordinator` is inert (see Phase 1). This is the direct cause of the Phase 3 gap above — there's nowhere for a commit to go yet.
- **Phase 6 — Application Commands: one slice shipped out of order.** "Create page" exists for the Daily Note case specifically — `PageCreator`, `PageFactory`, `IdGenerator`/`UuidGenerator`, and `DailyNoteService` implement identity generation, frontmatter construction, and file writing for that one call site. A generic `PageApplicationService.createPage()` for arbitrary new pages is still a TODO in that file. Rename, Move, Delete, Restore, Duplicate, Archive, and Unarchive are all unimplemented. Note: Duplicate will need a frontmatter-stripping step that doesn't exist yet, since `Page.source.markdown` retains the original file's full frontmatter block.
- **Phase 7 — File Reconciliation: not started**, consistent with the deliberate decision to postpone file watching and incremental scanning until earned by a real need.

---

# Phase 1 – Foundation

## Objectives

- Introduce the runtime objects.
- Keep the current editor working.
- Avoid changing the UI.

### Deliverables

- DocumentRegistry
- DocumentSession
- DocumentTransaction
- DocumentRevision
- SaveCoordinator
- DocumentState

At the end of this phase, every open page should be backed by a `DocumentSession`.

A `DocumentSession` owns:

- currentRevision
- savedRevision
- dirty state
- document state

---

# Phase 2 – Open Document

## Objectives

Replace direct page loading with document sessions.

### Deliverables

- Open Page
- Attach to existing session
- Attach additional views to the same session
- Close document
- Detach views from a session
- Dispose inactive sessions

---

# Phase 3 – Editing

## Objectives

Move all document mutations through the `DocumentSession`.

### Deliverables

- Text transactions
- Title changes
- Frontmatter updates
- Task toggles
- Revision tracking
- Dirty state

---

# Phase 4 – PageFacts

## Objectives

Produce semantic knowledge from committed document revisions.

### Deliverables

- Generate `PageFacts` from `DocumentRevision`.
- Extract tasks, tags, links, headings, and properties.
- Publish updated facts to engine observers.
- Prepare incremental fact updates for future optimisation.

---

# Phase 5 – Persistence

## Objectives

Persist committed document state.

### Deliverables

- SaveCoordinator
- Persistence queue
- Atomic writer
- Autosave
- Recovery preparation
- Immutable document revisions
- Version-history ready persistence model

The `SaveCoordinator` is responsible for deciding when documents are persisted.

The `DocumentSession` remains responsible for editing.

---

# Phase 6 – Application Commands

## Objectives

Implement page-level commands.

### Deliverables

- Create page
- Rename page
- Move page
- Delete page
- Restore page
- Duplicate page
- Archive page
- Unarchive page

---

# Phase 7 – File Reconciliation

## Objectives

Handle external file system changes.

### Deliverables

- File watcher
- Detect external edits
- Detect renames
- Detect moves
- Session reconciliation

---

# Success Criteria

Arc v3 is complete when:

- Every open page is managed by a `DocumentSession`. — **met.**
- Every document change produces a committed `DocumentRevision`. — **not met.** The mechanism exists; nothing calls it yet.
- `PageFacts` are generated from committed revisions. — **not met as designed.** Equivalent data exists via the Vault pipeline instead (see Phase 4 note above).
- Persistence is coordinated by the Document Engine. — **not met.** No persistence exists for live edits.
- The Vault reconciles successfully after persistence. — **not yet applicable.** No persistence loop exists to reconcile after.
- The UI no longer modifies documents directly. — **unverified.** No editor currently appears wired to `DocumentSession` at all, so this hasn't been exercised either way — needs a UI-layer check, not an assumption.
- The architecture is ready for version history without requiring structural changes. — **plausible, unverified.** `DocumentRevision`'s immutable design supports it in principle, but nothing has exercised the revision chain yet.
