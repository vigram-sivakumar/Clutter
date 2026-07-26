Architecture Status

Version: 1.0
Status: Frozen

Changes to the architecture should be driven by implementation experience rather than speculation.

# Arc v3 – Implementation Plan

## Goal

Implement the Clutter Document Engine incrementally.

Each milestone should produce a working application while moving closer to the target architecture defined in `Engine.md`.

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

- Every open page is managed by a `DocumentSession`.
- Every document change produces a committed `DocumentRevision`.
- `PageFacts` are generated from committed revisions.
- Persistence is coordinated by the Document Engine.
- The Vault reconciles successfully after persistence.
- The UI no longer modifies documents directly.
- The architecture is ready for version history without requiring structural changes.
