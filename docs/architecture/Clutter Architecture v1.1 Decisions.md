# Clutter Architecture v1.1 Decisions

**Date:** 2026-07-29  
**Status:** Approved — Architecture v1.1 frozen  
**Purpose:** Second validation pass against Clutter's frozen philosophy. Reclassifies audit Critical findings, settles architectural decisions, and defines what v1.1 will and will not change.

**Related documents:**

- [`docs/Clutter Architecture Audit Report.md`](../Clutter Architecture Audit Report.md)
- [`docs/Identity Architecture Audit.md`](../Identity Architecture Audit.md)
- [`docs/architecture/Vault.md`](Vault.md)
- [`docs/architecture/03-persistence.md`](03-persistence.md)

---

## Frozen Philosophy (Preserved Unless Proven Wrong)

These decisions remain binding for v1.1:

| Principle                                    | Status                           |
| -------------------------------------------- | -------------------------------- |
| Markdown files are durable truth             | **Preserved**                    |
| Vault is a rebuildable runtime model         | **Preserved**                    |
| DocumentSession owns temporary editor state  | **Preserved**                    |
| Workspace owns navigation state              | **Preserved**                    |
| UI never reads structural data from session  | **Preserved** (verified in code) |
| MoveService stays physical movement only     | **Preserved**                    |
| PageMutationService owns user intent         | **Preserved**                    |
| Sync interprets external reality             | **Preserved**                    |
| Projections are disposable                   | **Preserved**                    |
| No abstractions because other apps have them | **Preserved**                    |

---

## Critical Findings — Reclassification

| ID     | Original label                | Reclassified as                                       | v1.1 action                                                     |
| ------ | ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **C1** | Path-derived IDs              | **Real architecture violation** (scoped)              | Smallest safe migration — see Identity Strategy                 |
| **C2** | Folder sync                   | **Intentional design tradeoff** (v1) + future concern | Defer runtime folder sync; document restart recovery            |
| **C3** | Two write pipelines           | **Incorrect assumption** (partially)                  | Do not merge; clarify ownership boundaries                      |
| **C4** | DocumentSession Page snapshot | **Intentional design tradeoff** + cleanup debt        | Shrink to `pageId` when convenient — not a blocker              |
| **C5** | External move rebuild         | **Incorrect assumption**                              | Location change only; update path/parent/name — no full rebuild |
| **C6** | Duplicate IDs                 | **Real architecture violation** (edge case)           | Startup error acceptable for v1; improve message only           |
| **C7** | Type checking                 | **Separate tooling concern**                          | Track independently; do not block architecture work             |

---

## Decision 1: Identity Strategy

### Re-validation of C1

**Do not treat path-derived IDs as an accidental bug.** They are an explicit, documented compatibility mechanism in `IdentityResolver.ts`:

> _"Path-derived identities exist only to support Markdown that has not yet adopted persistent IDs."_

However, they **violate Invariant 6** (_identities stable across rename/move_) and the stated principle _ID = identity, Path = location_. This is a **real architecture violation for imported/legacy files**, not for Clutter-native files.

### Questions answered

**Are path IDs only for legacy/imported files?**

**Yes, by design.** Path-derived IDs apply only when `frontmatter.id` is absent at scan/build time. They affect:

- Obsidian imports (no Clutter ID)
- Manually created `.md` files
- Legacy vault content

They do **not** affect:

- Daily notes (`PageCreator` → UUID)
- Any future app-created pages via `PageCreator`
- The user's current vault (all 11 files already have frontmatter IDs)

**Do all new Clutter-created pages get UUIDs?**

**Yes — for the only creation path that exists today.**

| Creation path                  | ID source                    | Code                        |
| ------------------------------ | ---------------------------- | --------------------------- |
| Daily notes                    | UUID via `PageCreator`       | `DailyNoteService.ensure()` |
| Future page create (not built) | Would use `PageCreator`      | Not wired yet               |
| External import                | Frontmatter or path fallback | `PageBuilder.build()`       |
| Startup scan of existing files | Frontmatter or path fallback | `PageBuilder.build()`       |

**Should migration happen now or only when a page is modified?**

**Only when a page is opened or modified — not at scan time.**

Rationale aligned with philosophy:

- Markdown is truth — Clutter should not mass-write files the user hasn't touched
- Obsidian compatibility — silent bulk modification of imported vaults violates trust
- `03-persistence.md` already states: _"Legacy documents with path-based or missing IDs must be migrated to stable IDs on first load or save"_

**Exception:** If first save would persist a path-as-ID into frontmatter (the harmful case), migration must assign a UUID **before** that write occurs.

### Smallest safe migration strategy (v1.1)

```
On PageApplicationService.openPage(pageId):
  IF page has no frontmatter id on disk (or id equals absolute path):
    Generate UUID
    Queue write through PagePersistenceCoordinator (user intent lane)
    Do NOT migrate silently at scan

On PersistenceService.save (first save of unmigrated page):
  IF page.id is path-derived OR frontmatter id matches absolute path pattern:
    Assign UUID before serialize
    Write UUID to frontmatter

Never:
  - Mass-migrate at startup scan
  - Change existing valid frontmatter IDs (page_ai, f_projects, etc.)
  - Introduce separate identity store outside markdown
```

### Identity decisions (approved pending review)

| Decision          | Choice                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Primary identity  | Frontmatter `id` field in markdown                                                                |
| ID format         | Any stable string (UUID preferred for new pages; custom strings valid)                            |
| Path as ID        | Transitional fallback only — must migrate before rename/move/save                                 |
| Migration trigger | First open or first save — not startup scan                                                       |
| Migration writer  | `PagePersistenceCoordinator` (user lane) — not sync lane                                          |
| Invariant 6       | Applies to all pages with frontmatter ID; path-derived pages are explicitly exempt until migrated |

---

## Decision 2: Sync Philosophy

### The core question

> Should Clutter trust events, or should events only tell Clutter when to inspect reality?

### Decision (proposed)

**Events tell Clutter when to inspect reality. Disk is authoritative.**

This aligns with _Markdown = durable truth_ and rejects the idea that OS notifications carry semantic knowledge.

```
Filesystem event
  ↓
Signal to inspect (not a command to trust blindly)
  ↓
Read actual disk state
  ↓
Interpret → update Vault
```

### Option A vs Option B

|                    | Option A: Watcher primary + startup recovery                              | Option B: Watcher optimization + periodic reconcile        |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Description**    | Events drive runtime updates; full scan on startup recovers missed events | Events are hints; periodic diff against disk catches drift |
| **Current code**   | Mostly this — except `handleMoved` skips disk read                        | Not implemented                                            |
| **Philosophy fit** | Strong — startup rebuild is already canonical recovery                    | Also strong long-term, but adds complexity                 |
| **v1.1**           | **Adopt**                                                                 | **Defer**                                                  |

**v1.1 sync model:**

1. **Runtime:** Watcher signals inspection. Handlers read disk before Vault mutation (fix `handleMoved` gap).
2. **Recovery:** Full vault scan at startup (`Application.open`) — already implemented.
3. **No periodic reconciliation** in v1.1 — defer until missed-event rate is measured or user workflow requires it.
4. **App closed changes:** Handled by startup scan — acceptable for v1.

This is Option A with an explicit rule: **events are triggers, not truth.**

Comparable patterns:

- **Obsidian:** Watcher + mtime cache; startup loads all files; re-reads on change
- **VS Code:** Watcher notifies; reads file on change; startup doesn't re-scan open files but disk is authoritative when read
- **Git checkout:** No runtime watcher for git itself; next read/scan reflects reality — Clutter's startup scan is equivalent

### Sync lane ownership (preserved — C3 re-validation)

**Do not merge app persistence and sync into one pipeline.**

The prior architecture decision stands:

```
User intent:
  PageMutationService / PageApplicationService
  → PagePersistenceCoordinator
  → disk → rebuild → Vault

External reality:
  VaultSyncService
  → read disk → update Vault
  → corrective disk write ONLY when frontmatter contradicts filesystem reality
```

**C3 reclassification: Partially incorrect assumption.**

`persistSyncedPageDocument` is **not** a duplicate user-intent pipeline. It is explicitly documented:

> _"Sync-owned write pipeline for reconciling external filesystem changes... only VaultSyncService should call this when external events require correcting persisted frontmatter."_

This is equivalent to **repairing corrupted state** — like Git checkout leaving stale metadata that must be corrected to match reality. It does not violate philosophy if scoped to:

- Archive metadata repair (frontmatter says archived, file is outside `Archive/`)
- Future: frontmatter/disk contradictions detected during inspection

It would violate philosophy if sync lane:

- Initiated user lifecycle actions (archive, restore, rename) ❌ — currently does not
- Became a general write path for content edits ❌ — currently does not

**v1.1 rule:** Sync may write to disk only to reconcile frontmatter with observed filesystem reality. Sync never expresses user intent.

**Not required for v1.1:** Routing sync repair through `PagePersistenceCoordinator`. Different ownership, different trigger, different contract. Extraction of shared serialize/write/rebuild **helpers** is acceptable later if duplication becomes painful — not a merge of lanes.

---

## Decision 3: Archive Philosophy

### Current model (preserved)

- Archive is **user intent** via `PageMutationService.archivePage()`
- Expressed as frontmatter `status: archived` + physical move to `Archive/`
- `Archive/` folder alone does not imply archived status
- Restore is user intent via `PageMutationService.restorePage()`

### Sync role in archive (refined, not reversed)

`ArchiveMetadataReconciler` clears stale archive metadata when external reality contradicts frontmatter:

> _"The only automatic repair clears archive metadata when a page with status archived lives outside Archive/."_

**Reclassification:** This is **filesystem reality repair**, not user intent. Equivalent to: user moved file out of Archive/ in Finder without updating frontmatter. Clutter corrects frontmatter to match reality.

**It is NOT:**

- Auto-archiving when a file enters `Archive/` externally
- User-initiated restore

**v1.1 rule:** Sync may repair stale metadata to match disk. Sync may never initiate archive or restore lifecycle transitions.

---

## Decision 4: Persistence Ownership

### User-initiated writes

**Single owner:** `PagePersistenceCoordinator`

All user intent — edit save, archive, restore, future rename/move — flows through this coordinator. No exceptions except pre-Vault bootstrap (`VaultInitializer`, `DailyNoteService.ensureToday` for initial file creation before scan).

### Sync-initiated writes

**Owner:** `persistSyncedPageDocument` (sync lane only)

Scope: frontmatter repair when disk state contradicts persisted metadata.

### MoveService

**Physical movement only.** No archive concepts. Called by `PagePersistenceCoordinator` when path/parentId change. Does not know about user intent type.

### PageMutationService

**Owns user intent** for structural page operations: archive, restore, future rename/move/duplicate.

---

## Decision 5: DocumentSession Ownership

### Re-validation of C4

**What does session.page provide today?**

| Consumer                         | Uses                          | Field                     |
| -------------------------------- | ----------------------------- | ------------------------- |
| `PersistenceService.save()`      | `session.page.id`             | ID only                   |
| `SaveCoordinator`                | `session.page.id`             | ID only                   |
| `DocumentSession` constructor    | `page.source.markdown`        | Initial buffer seed       |
| UI (`PageHost`, `NotePageModel`) | **Does not use session.page** | Reads Vault for structure |

**Verified:** No feature UI reads `session.page.path`, `.metadata`, or `.name`. `PageHost` explicitly reads structural data from Vault (lines 76–78).

**Reclassification:** The frozen `Page` snapshot is **technical debt**, not a v1.1 blocker. Session effectively uses `pageId` + buffer seed. Refactoring to `{ pageId, buffer, saveState }` is cleanup aligned with philosophy — defer until next engine touch.

**v1.1 rule:** DocumentSession owns:

- `pageId` (stable reference)
- Editor buffer (`currentRevision.markdown`)
- Save state (`savedRevision`, `DocumentState`)

DocumentSession does **not** own structural page data. UI and services read structure from Vault.

**Sync → session.commit bypass:** Acceptable for external content sync when session is clean. Sync updates buffer to match disk — not user intent. Document as allowed behavior; do not route through `PageApplicationService` for this case.

---

## Decision 6: External Filesystem Handling

### Re-validation of C5

**When a file moves externally, is it a location change or a document mutation?**

**Location change only.** Path change does not imply content change.

**v1.1 behavior for external move:**

| Field             | Update? | Source                                     |
| ----------------- | ------- | ------------------------------------------ |
| `path`            | Yes     | Event + disk verification                  |
| `parentId`        | Yes     | Resolve from destination folder in Vault   |
| `name`            | Yes     | Derive from new filename                   |
| `source.markdown` | No      | Unless separate `changed` event            |
| `analysis.*`      | No      | Projections rebuild from unchanged content |
| `metadata.*`      | No      | Unless separate `changed` event            |

**Do not** run full `readFile → parse → PageRebuilder` on move. That violates _avoid unnecessary parsing_ and treats location change as content mutation.

**Gap in current code:** `handleMoved` updates path/parent but not `name`. This is a **small correctness fix**, not a full rebuild. Reclassified from Critical to normal fix.

**Philosophy:** Compare with Obsidian — rename in Finder updates file path in metadata cache without re-parsing content unless content event also fires.

### External folder handling (C2 re-validation)

**Is external folder manipulation a required v1 workflow?**

**Not for Clutter-native workflows.** Folder CRUD is listed as "Placeholder" in `04-crud.md`. `FolderApplicationService` only opens folders. Clutter does not yet create, rename, move, or delete folders through the app.

**Is external folder manipulation required for compatibility workflows?**

**Yes, eventually** — Obsidian, VS Code, Finder, and Git all manipulate folders. But v1.1 can accept:

- External folder changes → reflected on **restart** (full scan)
- External page changes within known folders → reflected at **runtime** (watcher)

**Reclassification:** C2 is an **intentional v1 deferral**, not an architecture violation. Folder sync becomes Important when folder CRUD is implemented — not a pre-feature blocker for page editing, archive, or daily notes.

**v1.1 rule:** Document that external folder create/rename/delete requires app restart to reflect in Vault. Fix silent skip in `handleCreated` when parent folder unknown — at minimum log/warn, or defer page until restart.

---

## Decision 7: Duplicate IDs (C6)

**Re-validation:** Duplicate frontmatter IDs cause startup failure (`Vault` constructor throws). Runtime import logs error and swallows.

**For v1.1:**

| Approach                                      | Adopt?                                                  |
| --------------------------------------------- | ------------------------------------------------------- |
| Startup error (fail closed)                   | **Yes** — acceptable for v1                             |
| Clear error message listing conflicting files | **Yes** — low effort improvement                        |
| Quarantine UI                                 | **No** — defer                                          |
| Auto-repair                                   | **No** — violates markdown = truth without user consent |
| Warning + continue                            | **No** — silent corruption worse than fail closed       |

Duplicate IDs indicate corrupted vault state or bad Git merge. Fail closed is correct for v1.

---

## Decision 8: Type Checking (C7)

**Re-validation:** Independent of architecture. `tsc --noEmit -p .` currently passes for `src/` (verified 2026-07-29). Prior Core Review findings about broken imports appear resolved. `tsc -b` reports e2e environment errors only.

**Decision:** Track in tooling/CI workstream. Do not block v1.1 architecture implementation.

---

## Decision 9: What v1.1 Will Implement vs Defer

### Implement (strengthens philosophy)

| Item                                              | Rationale                                  |
| ------------------------------------------------- | ------------------------------------------ |
| Lazy identity migration on open/first-save        | Closes C1 without mass file modification   |
| Block save that would persist path-as-ID          | Prevents Git cross-machine corruption      |
| `handleMoved` updates path + parent + name        | Location change correctness (C5 fix)       |
| `handleMoved` verifies file exists at destination | Events trigger inspection, not blind trust |
| Clear duplicate-ID startup error                  | C6 minimal fix                             |
| Document folder restart requirement               | C2 honest deferral                         |
| Document sync lane corrective write scope         | C3 clarity                                 |

### Defer (not v1.1)

| Item                                   | Rationale                                                  |
| -------------------------------------- | ---------------------------------------------------------- |
| Runtime folder sync                    | No folder CRUD yet; restart recovery sufficient            |
| Periodic disk reconciliation           | Option B — measure need first                              |
| DocumentSession → pageId-only refactor | Cleanup, not blocker                                       |
| Merge sync/app write pipelines         | Violates deliberate lane separation                        |
| Quarantine UI for duplicate IDs        | Over-engineering for v1                                    |
| Full identity redesign (Option C)      | Conflicts with markdown-as-truth                           |
| Shared lock between coordinators       | Theoretical race; self-write suppression sufficient for v1 |
| mtime cache / scan exclusions          | Scalability — Decision 10                                  |

### Explicitly rejected

| Item                                     | Reason                                          |
| ---------------------------------------- | ----------------------------------------------- |
| Separate identity store outside markdown | Violates durable truth principle                |
| Mass UUID migration at startup scan      | Violates non-destructive import trust           |
| Full document rebuild on external move   | Conflates location change with content mutation |
| Sync-initiated archive/restore           | Violates user intent ownership                  |
| UI reading structural data from session  | Violates frozen philosophy                      |

---

## Decision 10: Scalability (Future — Not v1.1)

These audit findings are **real but deferred**:

- O(n) projection rebuild per edit
- Full vault scan on startup
- No scan exclusions (`.git`)
- Full markdown in memory
- Periodic reconciliation (Option B)

They do not violate philosophy. They become relevant at scale. No v1.1 action.

---

## Summary: Architecture v1.1 Principles

```
┌─────────────────────────────────────────────────────────────┐
│  MARKDOWN ON DISK = DURABLE TRUTH                           │
│  VAULT = REBUILDABLE RUNTIME PROJECTION                     │
│  EVENTS = SIGNALS TO INSPECT DISK                           │
│  STARTUP SCAN = RECOVERY                                    │
├─────────────────────────────────────────────────────────────┤
│  ID in frontmatter = identity                               │
│  Path = location                                            │
│  Migrate identity lazily on open/save                       │
├─────────────────────────────────────────────────────────────┤
│  USER INTENT → PagePersistenceCoordinator                   │
│  EXTERNAL REALITY → VaultSyncService → read disk → Vault    │
│  SYNC DISK WRITE → frontmatter repair only                  │
├─────────────────────────────────────────────────────────────┤
│  DocumentSession = pageId + buffer + save state             │
│  Vault = all structural reads                               │
│  MoveService = physical move only                           │
│  PageMutationService = user structural intent               │
└─────────────────────────────────────────────────────────────┘
```

---

## Approval Checklist

Before implementation begins, confirm:

- [ ] Identity: lazy migration on open/save — not scan-time mass write
- [ ] Sync: events signal inspection; disk is authoritative
- [ ] Sync: two lanes remain separate; sync repair scope is frontmatter correction only
- [ ] External move: location change only (path, parent, name) — no full rebuild
- [ ] Folders: runtime sync deferred; restart recovery documented
- [ ] Duplicate IDs: startup fail-closed acceptable for v1
- [ ] DocumentSession: pageId-only refactor deferred; not a blocker
- [ ] C7 type checking: separate workstream

---

_This document captures proposed v1.1 decisions. Implementation must not begin until approved._
