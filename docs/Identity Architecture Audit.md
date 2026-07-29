# Identity Architecture Audit

**Date:** 2026-07-29  
**Scope:** Critical item C1 — deep read-only investigation of page and folder identity  
**Method:** Traced every identity touchpoint in code; simulated external workflows; cross-checked prior audit claims; inspected live vault files  
**Constraint:** No code changes, no migration recommendations — tradeoffs only

---

## Executive Summary

Clutter's **stated principle** is clear:

> Path is location. ID is identity.

The **implementation partially follows this principle**. Pages and folders created through `PageCreator` receive a persisted frontmatter ID and behave correctly across rename, move, archive, and restore. The user's current vault (`/Users/sivakuv3/Documents/Personal/Vault`) already uses frontmatter IDs on every file.

However, the codebase contains an explicit **compatibility fallback** that violates the principle:

```
if frontmatter.id missing → id = absolute filesystem path
```

This fallback is not a edge case — it is the default for any imported Obsidian note, any manually created markdown file, and any legacy content. Worse: the first app-initiated save **persists the absolute path into frontmatter as the `id`**, which creates cross-machine identity corruption under Git sync.

**Verdict on C1:** The prior audit finding is **confirmed and understated**. Identity architecture is the highest-risk foundation gap. The problem is not merely "path fallback exists" — it is that the system has no identity migration path, no duplicate-ID recovery, no tracking of identity quality, and several runtime behaviors that silently diverge disk from Vault.

---

## Table of Contents

1. [Stated Philosophy vs Implementation](#1-stated-philosophy-vs-implementation)
2. [Page Identity — Current Implementation](#2-page-identity--current-implementation)
3. [Page Identity Lifecycle — Traced Code Paths](#3-page-identity-lifecycle--traced-code-paths)
4. [Answers to Page Identity Questions](#4-answers-to-page-identity-questions)
5. [Folder Identity](#5-folder-identity)
6. [External Workflow Simulations](#6-external-workflow-simulations)
7. [Philosophy Compliance Matrix](#7-philosophy-compliance-matrix)
8. [Violations](#8-violations)
9. [Risks](#9-risks)
10. [Audit Finding Challenges](#10-audit-finding-challenges)
11. [Migration Options (Tradeoffs Only)](#11-migration-options-tradeoffs-only)

---

## 1. Stated Philosophy vs Implementation

### Documented principles

From `docs/architecture/Vault.md`:

- Invariant 6: *"Page identities remain stable even when pages are renamed or moved."*
- *"Every page has a stable identity that is independent of its filename or location."*
- Markdown files are the durable source of truth.

From `IdentityResolver.ts`:

- *"Persisted frontmatter IDs are authoritative."*
- *"Path-derived identities exist only to support Markdown that has not yet adopted persistent IDs."*
- *"Derived identities are transitional and should not be treated as permanently stable."*

From `Page.ts`:

- *"This identifier remains constant even if the page is renamed or moved."*

### Implementation reality

| Principle | Implemented? | Condition |
|-----------|-------------|-----------|
| ID ≠ path | **Partial** | Only when `frontmatter.id` exists |
| ID survives rename | **Yes** | Frontmatter ID only |
| ID survives move | **Yes** | Frontmatter ID only |
| ID survives restart | **Yes** | Frontmatter ID only |
| Path is not identity | **Violated** | Fallback uses absolute path as ID |
| Markdown is durable truth | **Yes** | ID stored in frontmatter on save |
| Vault is runtime projection | **Yes** | Rebuilt from disk at startup |

The gap between documentation and code is **acknowledged in Vault.md** (Invariant 6 marked as not yet true) but the full consequences — especially first-save path persistence and multi-machine Git corruption — are not documented.

---

## 2. Page Identity — Current Implementation

### 2.1 Identity resolution (single choke point)

**File:** `apps/app/src/core/vault/build/IdentityResolver.ts`

```typescript
if (frontmatterId) {
  return { id: frontmatterId, source: 'frontmatter' };
}
return { id: path, source: 'derived' };
```

- Used by `PageBuilder.build()` (initial scan, external import)
- Used by `VaultBuilder.build()` for folders
- **`source` is computed but never stored** on `Page` or `Folder` models — the runtime cannot distinguish fragile from stable identities

### 2.2 ID generation (app-initiated creation only)

**Chain:** `PageCreator.create()` → `UuidGenerator.generate()` → `PageFactory.create()` → `FrontmatterSerializer.serialize()`

| Step | File | Behavior |
|------|------|----------|
| Generate | `PageCreator.ts:17` | `crypto.randomUUID()` |
| Embed | `PageFactory.ts` | Serializes frontmatter including `id` |
| Write (daily note) | `DailyNoteService.ts:60` | Direct `writeFile` with content containing ID |
| Write (future pages) | Not yet implemented | Would go through persistence coordinator |

**Important:** Only `PageCreator` generates IDs. The scanner never generates new IDs — it only resolves existing ones or falls back to path.

### 2.3 ID persistence (disk write)

**File:** `FrontmatterSerializer.serializePage()`

Always writes `id: page.id` as the first frontmatter field. On any save through `PagePersistenceCoordinator`, the runtime `page.id` is written to disk — **including path-derived IDs**.

This means the first save of an imported file without frontmatter ID does **not** assign a UUID. It **cements the absolute path as the permanent frontmatter ID**.

### 2.4 ID preservation (rebuild)

**File:** `PageRebuilder.rebuild()`

```typescript
return {
  id: page.id,        // ALWAYS preserved from runtime page
  name: page.name,      // ALWAYS preserved (not re-derived from filename)
  path: page.path,      // ALWAYS preserved (updated separately via updatePagePath)
  // ... metadata and analysis rebuilt from parsed frontmatter
};
```

`PageRebuilder` **never reads `parsedMarkdown.frontmatter.id`**. Even if the user manually changes the ID in frontmatter on disk, a `handleChanged` sync event preserves the old runtime ID.

At **next app restart**, `PageBuilder` would read the new frontmatter ID — creating a runtime vs restart divergence.

### 2.5 Index structures

| Index | Key | Updated on move? |
|-------|-----|-----------------|
| `Vault.pagesById` | `page.id` | Entry stays same key; page object replaced |
| `Vault.pagesByPath` | `page.path` | Old path deleted, new path inserted |
| `DocumentRegistry.sessions` | `page.id` | Keyed by ID — survives path change |
| `SaveCoordinator.activeSaves` | `page.id` | Keyed by ID |
| `PagePersistenceCoordinator.queues` | `pageId` | Per-page queue |
| `VaultSyncCoordinator` | page ID or path fallback | Resolves to page ID once known |

### 2.6 Live vault inspection

All 11 markdown files in `/Users/sivakuv3/Documents/Personal/Vault` have frontmatter `id` fields:

| File | ID format |
|------|-----------|
| `AI.md` | `page_ai` (custom string) |
| `Machine Learning.md` | `page_ml` |
| `Projects/Clutter.md` | `page_clutter` |
| `Daily Notes/.../2026-07-29.md` | UUID (from `PageCreator`) |
| `Daily Notes/.../2026-07-25.md` | `daily_2026_07_25` (custom) |
| `Projects/.folder.md` | `f_projects` |

The user's vault is **already identity-migrated** with custom string IDs (not exclusively UUIDs). This matters for migration planning: Clutter accepts any string as ID, not just UUID format.

---

## 3. Page Identity Lifecycle — Traced Code Paths

### 3.1 Page creation (app-initiated)

```
PageCreator.create(type, body)
  → UuidGenerator.generate()           // new UUID
  → PageFactory.create(frontmatter)    // embed id in markdown
  → DailyNoteService.writeFile()       // or future persistence path
  → [startup scan]
  → VaultScanner → PageBuilder.build()
  → IdentityResolver: source = 'frontmatter'
  → Vault.addPage() [via scan, not addPage directly]
```

**Identity outcome:** Stable UUID in frontmatter and Vault.

### 3.2 Page loading (startup scan)

```
VaultScanner.scan(rootPath)
  → DocumentLoader.load(each .md)
  → FrontmatterParser.parse()
  → PageBuilder.build()
  → IdentityResolver.resolvePage(frontmatter.id, absolutePath)
  → VaultBuilder.build() → new Vault(pages, folders, ...)
  → Vault constructor: throws if duplicate page.id
```

**Identity outcome:** Frontmatter ID if present; otherwise absolute path as ID.

Paths are **absolute** in production (`LocalVaultProvider.readDirectory` returns `${parentPath}/${name}` starting from vault root). Unit tests use relative paths — test artifact only.

### 3.3 Page loading (runtime — open for editing)

```
PageApplicationService.openPage(pageId)
  → vault.getPage(pageId)              // lookup by ID
  → DocumentRegistry.open(page)        // creates DocumentSession(page)
  → session.page.id used thereafter
```

**Identity outcome:** Session bound to Vault page ID at open time. Session stores frozen `Page` snapshot including ID.

### 3.4 Edit save

```
PageApplicationService.updateMarkdown(pageId, markdown)
  → session.commit(transaction)
  → PersistenceService.save(session, revision)
  → PagePersistenceCoordinator.enqueue(pageId, operate)
  → operate(current from Vault) → { page: current, markdown }
  → FrontmatterSerializer.serializeDocument(page, markdown)  // writes page.id
  → writeFile → parse → PageRebuilder.rebuild(page, parsed)  // preserves page.id
  → vault.replacePage(rebuilt)
```

**Identity outcome:** ID unchanged. Frontmatter on disk updated with same ID.

### 3.5 Archive

```
PageMutationService.archivePage(pageId)
  → coordinator.enqueue: spread current page, change path + metadata
  → MoveService.movePage(current, updated)     // physical move + updatePagePath
  → serialize → write → rebuild → replacePage
```

**Identity outcome:** ID unchanged. Path changes to `Archive/{filename}`. `originalPath` and `originalParentId` stored in metadata/frontmatter.

Verified by `DocumentRoundTrip.test.ts` — archive metadata and ID survive round-trip.

### 3.6 Restore

```
PageMutationService.restorePage(pageId)
  → resolveRestoreDestination: original folder → Inbox → vault root
  → coordinator.enqueue: clear archive metadata, move back
```

**Identity outcome:** ID unchanged. Uses `originalParentId` to resolve folder — if folder was renamed in Vault, restore uses **current folder path** (tested in `PageMutationService.test.ts`: "uses the current folder path when the original folder was renamed").

### 3.7 External content change

```
VaultSyncService.handleChanged(path)
  → vault.getPageByPath(absolutePath)          // lookup by PATH
  → readFile → parse → PageRebuilder.rebuild(existingPage, parsed)
  → vault.replacePage(rebuilt)                   // ID preserved from existingPage
  → if session exists && !session.isDirty: session.commit(new body)
```

**Identity outcome:** Runtime ID preserved even if frontmatter ID on disk changed. Content and metadata rebuilt from disk; ID and name frozen from runtime.

### 3.8 External move/rename

```
VaultSyncService.handleMoved(fromPath, toPath)
  → vault.getPageByPath(absoluteFrom)            // lookup by OLD path
  → vault.updatePagePath(page.id, absoluteTo, parentId)
  → reconcileArchiveMetadataForPage(pageId)
```

**Identity outcome:** ID preserved. Path and parentId updated. **No disk read. No name update. No content rebuild.**

Explicitly tested in `VaultSyncService.test.ts`:
- *"moved: preserves page id and updates its path"*
- *"moved: content and metadata are left untouched by a pure location change"*

### 3.9 External import (new file)

```
VaultSyncService.handleCreated(path)
  → skip if not .md
  → skip if path already in vault
  → skip if parent folder not in vault          // SILENT SKIP
  → readFile → parse → PageBuilder.build()      // NEW identity resolution
  → vault.addPage(page)
```

**Identity outcome:** New ID from frontmatter or path. Throws if ID collides with existing page.

### 3.10 External delete

```
VaultSyncService.handleDeleted(path)
  → vault.getPageByPath → vault.removePage(page.id)
```

**Identity outcome:** ID removed from Vault. Open DocumentSession **not** disposed.

### 3.11 In-app rename

```
PageApplicationService.renamePage(pageId, title)
  → throw new Error('Not implemented')
```

**Identity outcome:** Not available. Users must rename via filesystem.

---

## 4. Answers to Page Identity Questions

### 1. Where is page ID generated?

| Context | Generator | Format |
|---------|-----------|--------|
| App creates page (daily note, future pages) | `UuidGenerator` / `PageCreator` | UUID v4 |
| Startup scan / external import | `IdentityResolver` | Frontmatter value OR absolute path |
| Edit save | Not generated — preserved | Existing `page.id` written back |
| PageRebuilder | Not generated — preserved | `page.id` from input |

**No code path generates a new UUID for an existing page that lacks one.**

### 2. Is it always stored in frontmatter?

| Context | Stored? |
|---------|---------|
| App-created pages | Yes — at creation time |
| After first save through persistence pipeline | Yes — `FrontmatterSerializer` writes `id:` |
| Imported file, never opened/saved in Clutter | **No** — remains path-derived in Vault only |
| Imported file, edited and saved | Yes — but value may be absolute path, not UUID |

### 3. Are any IDs derived from paths?

**Yes.** `IdentityResolver` line 53–55: when `frontmatter.id` is absent, `id = path` (absolute path in production).

Confirmed by `PageBuilder.test.ts`: *"derives identity from the file path when no frontmatter id exists"*.

### 4. Are any IDs regenerated?

**No** — with these nuances:

| Operation | ID behavior |
|-----------|-------------|
| `PageRebuilder.rebuild()` | Preserved |
| `Vault.updatePagePath()` | Preserved |
| `handleChanged` | Preserved |
| `handleMoved` | Preserved |
| App restart + rescan | **Re-resolved** — for path-derived pages at new path, this is effectively a new ID |
| User edits frontmatter ID on disk | Ignored at runtime; **used on restart** |

There is no "regenerate" intent, but restart after rename of a path-derived page produces a **new identity** because `PageBuilder` resolves ID from the new path.

### 5. What happens when a file is renamed?

#### With frontmatter ID (e.g. `id: page123`)

| Phase | ID | Path | Name | Disk frontmatter |
|-------|----|------|------|-----------------|
| Before | `page123` | `.../Design.md` | `Design` | `id: page123` |
| Watcher fires `moved` | `page123` | `.../Design System.md` | `Design` ❌ | unchanged on disk |
| User saves in app | `page123` | `.../Design System.md` | `Design` ❌ | `id: page123` (unchanged) |
| App restart | `page123` | `.../Design System.md` | `Design System` ✓ | `id: page123` |

**Runtime rename works for ID stability. Display name lags until restart.**

#### Without frontmatter ID (path-derived)

| Phase | ID | Path |
|-------|----|------|
| Before | `/vault/Projects/Design.md` | `/vault/Projects/Design.md` |
| Watcher fires `moved` | `/vault/Projects/Design.md` ❌ | `/vault/Projects/Design System.md` |
| App restart | `/vault/Projects/Design System.md` ❌ NEW ID | `/vault/Projects/Design System.md` |

**Two distinct failure modes:** runtime ID/path split, or restart identity loss.

### 6. What happens when a file moves folders?

Same as rename for page ID — `handleMoved` preserves ID, updates path and parentId.

**Additional folder-level issues:**
- Folder entity in Vault is **not updated** (no folder sync)
- Page `parentId` updated to new folder's ID if that folder exists in Vault
- If destination folder was created externally and not in Vault, `parentId` falls back to existing value (`page.parentId`)

### 7. What happens when a user edits markdown manually?

| Edit type | Runtime (watcher) | After restart |
|-----------|-------------------|---------------|
| Body content | Rebuilt via `PageRebuilder` | Same |
| Frontmatter metadata (icon, favorite, etc.) | Rebuilt from parsed frontmatter | Same |
| Frontmatter `id` changed | **Ignored** — old runtime ID kept | **New ID used** — identity change |
| Frontmatter `id` removed | **Ignored** — next app save writes old ID back | Path-derived ID assigned |
| File renamed + frontmatter untouched | ID preserved (if frontmatter ID) | ID from frontmatter |

---

## 5. Folder Identity

### 5.1 Do folders have stable IDs?

**Same mechanism as pages.** `IdentityResolver.resolveFolder(frontmatter?.id, directory.path)`.

`.folder.md` is optional. When present, it provides frontmatter including optional `id`.

**Example from live vault:** `Projects/.folder.md` has `id: f_projects`.

When `.folder.md` is absent, folder ID = absolute directory path.

### 5.2 Are folder IDs path-based?

**Conditionally.** Path-based when no `id` in `.folder.md`. The scanner always creates a directory entry for every folder it walks, regardless of `.folder.md` presence.

### 5.3 What happens when folders are renamed?

**No runtime sync.** `VaultSyncService` only handles `.md` file events. Folder rename/move is invisible to the sync layer.

**On app restart:** Full rescan. Folder gets new path. If no `.folder.md` ID, folder ID changes to new absolute path. All child page `parentId` references may point to **orphaned folder IDs**.

**In-memory only:** `Vault.moveFolder()` exists and correctly cascades path updates to descendant folders and child pages. **No application service calls it** — only tested in `Vault.test.ts`.

### 5.4 How does `.folder.md` participate?

| Role | Detail |
|------|--------|
| Discovery | `VaultScanner` reads `.folder.md` if present in directory |
| Identity | Optional `id` field in frontmatter |
| Metadata | icon, favorite, description, cover, status, archive fields |
| Persistence | **No write path exists** — folder metadata cannot be edited through app |
| Exclusion | `.folder.md` itself is not scanned as a page (`entry.name !== '.folder.md'` filter) |

### 5.5 What happens to child pages after folder rename?

#### External folder rename (runtime)

Individual `.md` files may receive `moved` events as the watcher detects file relocations. Each page:
- ID preserved (if frontmatter ID)
- Path updated
- `parentId` updated if destination folder exists in Vault

Folder entity remains at old path. Tree structure in UI may show inconsistent parent relationships.

#### External folder rename (after restart)

Full rescan rebuilds folder tree from disk. If `.folder.md` IDs exist, folder identities stable. Child page `parentId` correctly resolved via `VaultBuilder.resolveParentId()`.

#### In-app folder move (hypothetical)

`Vault.moveFolder()` would update all descendant folder paths and child page paths in memory. No disk operations exist for this path.

---

## 6. External Workflow Simulations

### Scenario A — Normal rename

**Before:**
```
Projects/Design.md
---
id: page123
---
```

**After (user renames in Finder):**
```
Projects/Design System.md
---
id: page123
---
```

**Step-by-step (app running):**

1. `vault_watcher.rs` detects rename via `RenamePairing` (300ms window)
2. Emits `{ type: 'moved', fromPath: 'Projects/Design.md', toPath: 'Projects/Design System.md' }`
3. `VaultSyncService.handleMoved`:
   - Looks up page at old absolute path → found, id = `page123`
   - `vault.updatePagePath('page123', newAbsolutePath, parentId)`
4. Page ID: `page123` ✓
5. Page path: updated ✓
6. Page name: **still `Design`** ✗ (not re-derived)
7. Disk file: frontmatter unchanged (still `id: page123`) ✓
8. Open session: keyed by `page123` — still valid ✓
9. Workspace active page ID: unchanged ✓
10. Links referencing `[[Design]]`: may still resolve via filename index if ambiguous

**After app restart:** Name becomes `Design System` (re-derived by `PageBuilder.getPageName()`).

**Verdict:** Identity stable. Display name stale until restart. **Principle upheld for ID.**

---

### Scenario B — Folder move

**Before:**
```
Projects/Design/Note.md   (id: page456, parentId: f_design)
Archive/                  (exists as reserved folder)
```

**After (user moves Design/ folder to Archive/):**
```
Archive/Design/Note.md
```

**Step-by-step (app running):**

1. Watcher emits `moved` for `Note.md` (possibly among other events)
2. `handleMoved`: page ID `page456` preserved, path updated to `.../Archive/Design/Note.md`
3. `resolveParentId('.../Archive/Design')`:
   - If `Archive/Design` folder was scanned at startup → parentId updated
   - If `Design/` was moved as a unit but folder entity not updated → **parentId may point to old `f_design` at old path**
4. Folder entity `f_design` still at `Projects/Design` path in Vault ✗
5. New folder `Archive/Design` may not exist in Vault at all ✗

**After app restart:**

1. Full rescan discovers `Archive/Design/` directory
2. If `Projects/Design/.folder.md` moved with folder and contains `id: f_design` → folder ID stable ✓
3. Child page `parentId` correctly resolved ✓

**Verdict:** Page ID stable (with frontmatter ID). Folder tree corrupt at runtime. Restart heals structure. **Principle partially upheld.**

---

### Scenario C — Git checkout (two machines)

**Setup:** Both machines have `Note.md` with `id: page123`. Same file synced via Git.

**Normal sync (content change on Machine A, pull on Machine B):**

1. Machine B watcher fires `changed`
2. `handleChanged`: reads disk, rebuilds page, preserves `page123`
3. Identity stable ✓

**Rename on Machine A (`Note.md` → `Renamed.md`), pull on Machine B:**

1. Depends on Git behavior — usually delete + create, or rename detection
2. If delete + create: `handleDeleted` removes page, `handleCreated` adds new page
   - If frontmatter preserved in rename commit: same `page123` ✓
   - If new file treated as create: same ID from frontmatter ✓
3. If moved event: same as Scenario A ✓

**Conflict: both machines create different files with same ID:**

```
A.md  id: page123
B.md  id: page123   (merge result)
```

1. Startup: `VaultBuilder` → `Vault` constructor → **`throw new Error('Duplicate page ID: page123')`**
2. App fails to open ✗

**Path-as-ID Git scenario (no frontmatter, saved on Machine A):**

1. Machine A: file at `/Users/a/Vault/Note.md`, no ID → path-derived
2. User saves in Clutter → frontmatter `id: /Users/a/Vault/Note.md`
3. Git push → Machine B at `/Users/b/Vault/Note.md`
4. Machine B loads: frontmatter ID = `/Users/a/Vault/Note.md`, path = `/Users/b/Vault/Note.md`
5. **Permanent ID/path mismatch on Machine B** ✗

**Verdict:** Frontmatter UUID/custom IDs work across Git. Duplicate IDs crash. Path-as-ID is **actively harmful** for Git workflows.

---

### Scenario D — Duplicate ID

**Two files:**
```
A.md  id: page123
B.md  id: page123
```

**Startup:**
```
VaultBuilder.build() → new Vault(pages, ...)
Vault constructor → throw Error('Duplicate page ID: page123')
Application.open() fails
```

**Runtime import (second file arrives while app open):**
```
handleCreated → PageBuilder.build() → id: page123
vault.addPage() → throw Error('Page already exists: page123')
VaultSyncService.dispatch().catch(console.error)
Error logged to console, silently swallowed
```

**What should happen (philosophy-aligned, not a recommendation):**

Options range from refuse-to-open (current) to quarantine-one-copy to last-writer-wins. Current behavior is the strictest: **fail closed at startup, fail silently at runtime**. For a knowledge management app, startup failure is preferable to silent merge, but runtime silent failure is dangerous.

---

## 7. Philosophy Compliance Matrix

| Principle | Frontmatter ID | Path-derived ID | Path saved as frontmatter ID |
|-----------|---------------|-----------------|-------------------------------|
| Markdown = durable truth | ✓ ID in frontmatter | ✗ ID not on disk until save | ✓ but wrong value |
| Vault = runtime projection | ✓ | ✓ (but wrong projection) | ✓ (corrupt projection) |
| ID = identity | ✓ | ✗ path is identity | ✗ machine-specific path is identity |
| Path = location | ✓ | ✓ until they diverge | ✗ ID encodes location |
| Move ≠ identity change | ✓ | ✗ | ✗ cross-machine |

---

## 8. Violations

### V1 — Path as identity fallback (Critical)

**Where:** `IdentityResolver.ts:53-55`  
**Principle violated:** ID = identity, Path = location  
**Documented?** Yes, as temporary compatibility — but no migration removes it

### V2 — First save persists path as ID (Critical)

**Where:** `FrontmatterSerializer.serializePage()` + path-derived runtime ID  
**Principle violated:** ID should be machine-independent  
**Not documented** in architecture docs

### V3 — PageRebuilder ignores frontmatter ID changes (Important)

**Where:** `PageRebuilder.rebuild()` line 28  
**Principle violated:** Markdown = durable truth (disk ID ≠ runtime ID after manual edit)  
**May be intentional** to prevent accidental identity break, but creates silent divergence

### V4 — Page.name not updated on external rename (Important)

**Where:** `PageRebuilder` preserves `page.name`; `handleMoved` doesn't re-read  
**Principle violated:** Path = location (name is filename-derived, should follow path)  
**Cosmetic at runtime**, self-heals on restart

### V5 — IdentitySource not stored (Important)

**Where:** `IdentityResolver` computes `source` but `Page` model has no field  
**Principle violated:** System cannot distinguish stable from fragile identities  
**Blocks** targeted migration and UI warnings

### V6 — No identity migration path (Critical)

**Where:** Entire codebase — no component assigns UUID to path-derived pages  
**Principle violated:** "Derived identities are transitional" (IdentityResolver comment)  
**Transitional becomes permanent** without migration

### V7 — Duplicate ID crashes app (Important)

**Where:** `Vault.ts` constructor line 103-104  
**Principle:** Fail closed — defensible but incompatible with Git merge workflows

### V8 — Folder identity not synced at runtime (Important)

**Where:** `VaultSyncService` — pages only  
**Principle violated:** Vault should reflect disk (folder tree drifts)

### V9 — Invariant 6 documented but not enforced (Critical)

**Where:** Design docs vs `IdentityResolver`  
**The invariant is a goal, not a guarantee**

---

## 9. Risks

### 9.1 Downstream impact of identity failures

| Feature | Depends on stable ID? | Failure mode |
|---------|----------------------|--------------|
| DocumentSession / tabs | Yes | Orphaned session if ID changes on restart |
| Save pipeline | Yes | Queue keyed by pageId — wrong ID = wrong file |
| Backlinks (future) | Yes | Edges keyed by sourcePageId/targetPageId |
| Knowledge graph | Yes | `GraphEdge.sourcePageId/targetPageId` |
| Task/tag occurrences | Yes | `sourcePageId` on every occurrence |
| Archive/restore | Yes | `originalParentId` references folder IDs |
| Favorites | No (uses page object) | Safe if ID stable |
| Search (future) | Partial | Path-based search works; ID-based index breaks |
| External sync | Yes | ID is sync coordinator key |

### 9.2 Risk severity by user workflow

| Workflow | Risk | Likelihood |
|----------|------|------------|
| Clutter-created pages only | Low | Current user vault |
| Obsidian import without IDs | **Critical** | Common for new users |
| Git sync between machines | **High** if path-as-ID | Common |
| Git merge duplicate IDs | **Critical** — app won't open | Occasional |
| External rename in Finder | Low (with frontmatter ID) | Common |
| External rename without ID | **Critical** | Occasional |
| Manual frontmatter ID edit | Medium — runtime/restart split | Rare |

### 9.3 Compounding risks

Identity failures compound with other audit findings:
- **C2 (folder sync):** Folder rename + page move = inconsistent tree
- **C4 (DocumentSession snapshot):** If ID changes on restart, open session references dead identity
- **C5 (shallow move handler):** Name/metadata staleness after rename

---

## 10. Audit Finding Challenges

### C1 confirmed, with refinements

The prior audit's C1 finding is **accurate**. This investigation adds nuance:

1. **Two failure modes for path-derived IDs**, not one: runtime ID/path split AND restart identity loss.
2. **First save makes things worse**, not better — persists machine-specific path as frontmatter ID.
3. **User's current vault is not affected** — all files already have frontmatter IDs (mixed format: custom strings and UUIDs).
4. **IdentitySource is dead data** — computed but never persisted; no code checks identity quality before rename/move.
5. **PageBuilder tests use relative paths** — production uses absolute paths; test doesn't reflect production derived ID format.

### Claims verified as correct

- `PageRebuilder` preserves ID ✓
- `handleMoved` preserves ID ✓
- `FrontmatterSerializer` writes ID on save ✓
- Duplicate IDs crash at startup ✓
- Archive/restore preserve ID ✓

### Claims refined

| Prior claim | Refinement |
|-------------|------------|
| "Path-derived IDs break on rename" | Break in two ways: runtime split OR restart new ID |
| "Frontmatter ID edits ignored" | Correct at runtime; takes effect on restart — split-brain period |
| "IdentityResolver fallback" | Also produces cross-machine corruption when saved to frontmatter |

### Claims challenged (partially)

| Prior claim | Challenge |
|-------------|-----------|
| "C1 blocks all users today" | User's vault has IDs on all files — C1 blocks import/Git workflows, not daily use for this vault |
| "Must use UUID" | Live vault uses custom string IDs (`page_ai`, `f_projects`) — any string works |
| "Need full identity redesign" | Philosophy-aligned fix may be simpler: migrate path→UUID, store in frontmatter, enforce at boundaries |

---

## 11. Migration Options (Tradeoffs Only)

> **This section explains tradeoffs only. No option is recommended. Decision follows team discussion.**

### Option A — Minimal fix

**Concept:** Stop the bleeding without large architectural change.

**Likely includes:**
- On scan, detect missing frontmatter ID → generate UUID → queue one-time write to disk
- Store `identitySource` on Page model (or separate set of "unmigrated" IDs)
- Block or warn on rename/move for pages where `identitySource === 'derived'`
- Detect path-format IDs in frontmatter (`id.startsWith(vault.root)`) → treat as unmigrated
- Duplicate ID at startup → show error with file paths, don't silent crash

| Dimension | Impact |
|-----------|--------|
| **Existing data** | Pages without ID get UUID written on next scan/open. Custom IDs (`page_ai`) untouched. Path-as-ID pages get new UUID. |
| **User vault compatibility** | User's vault likely unaffected (all files have IDs). Would fix any hidden path-as-ID pages. |
| **Obsidian compatibility** | First open of Obsidian vault triggers ID assignment. Adds `id:` to files — Obsidian ignores unknown frontmatter. **Changes user's files on disk.** |
| **Git/cloud sync** | Eliminates path-as-ID corruption. Duplicate ID still needs handling (warn/refuse). |
| **Effort** | Small — targeted changes to scan + serializer guard |
| **Risk** | Low — but doesn't fix folder sync, name staleness, or PageRebuilder ignoring ID changes |
| **Philosophy alignment** | Partial — achieves ID ≠ path for new migrations but doesn't redesign boundaries |

**Tradeoff:** Fast and safe for current user, but leaves structural identity boundary issues (PageRebuilder, sync layer) untouched.

---

### Option B — Proper migration

**Concept:** Comprehensive identity lifecycle with explicit migration phase.

**Likely includes everything in Option A, plus:**
- Dedicated migration pass at startup: scan → identify → write → verify
- `identitySource` tracked on Page; exposed to application layer
- `PageRebuilder` policy decision: trust frontmatter ID on external change vs preserve runtime ID (with conflict detection)
- `handleMoved` re-reads file and rebuilds (name, metadata, analysis)
- Duplicate ID → quarantine workflow (exclude from vault, surface in UI, don't crash)
- Folder `.folder.md` ID migration same as pages
- In-app rename/move implemented with ID preservation guarantees
- Identity change event (when frontmatter ID legitimately changes) → notify graph/backlinks

| Dimension | Impact |
|-----------|--------|
| **Existing data** | One-time migration writes UUIDs to all files lacking stable IDs. Path-as-ID frontmatter overwritten. Custom string IDs preserved if already stable. |
| **User vault compatibility** | High — user's custom IDs remain. Migration is no-op for well-formed vaults. |
| **Obsidian compatibility** | All imported files get Clutter IDs on first open. Irreversible file modification unless user removes frontmatter. Obsidian-compatible (ignores extra fields) but **not Obsidian-identical** (Obsidian uses paths, not frontmatter IDs). |
| **Git/cloud sync** | UUID in frontmatter syncs correctly. Duplicate ID quarantine prevents crash. Merge conflicts need UI. |
| **Effort** | Medium-large — migration pass + sync fixes + conflict UI |
| **Risk** | Medium — migration pass writes to every unmigrated file; must be idempotent and interrupt-safe |
| **Philosophy alignment** | Strong — achieves all stated invariants with explicit migration period |

**Tradeoff:** Right balance for a local-first KM app. Requires careful migration UX (progress, rollback, dry-run). Modifies user files once.

---

### Option C — Full identity redesign

**Concept:** Separate identity from markdown entirely.

**Examples of what this could mean:**
- `.clutter/identity/` or SQLite database mapping `id ↔ current path`
- Content-addressable IDs (hash-based)
- Obsidian-style path-as-primary-key with symlinks for stability
- Central identity server (violates local-first)

| Dimension | Impact |
|-----------|--------|
| **Existing data** | Major migration — frontmatter IDs may become secondary or redundant |
| **User vault compatibility** | Low unless migration tool handles all existing frontmatter IDs |
| **Obsidian compatibility** | Likely diverges further from Obsidian model |
| **Git/cloud sync** | Depends on design — separate identity store may not sync via Git |
| **Effort** | Very large — new subsystem, migration, sync reconciliation |
| **Risk** | High — contradicts "Markdown = durable truth" unless identity also in markdown |
| **Philosophy alignment** | **Conflicts** with stated Clutter philosophy unless identity store is clearly secondary/cache |

**Tradeoff:** Only justified if frontmatter-ID approach is deemed fundamentally insufficient (e.g., need identity without modifying user files). Current codebase investment (FrontmatterSerializer, IdentityResolver, PageCreator) suggests this is the wrong direction for Clutter.

---

### Comparison summary

| Criterion | Option A | Option B | Option C |
|-----------|----------|----------|----------|
| Time to implement | Weeks | 1-2 months | 3+ months |
| Philosophy alignment | Partial | Strong | Weak (likely) |
| Obsidian import safety | Moderate | Good | Varies |
| Git safety | Moderate | Good | Varies |
| Modifies user files | Some | One-time migration | Major |
| Fixes folder identity | No | Partial | Depends |
| Reversible | Mostly | Migration rollback needed | Hard |
| Supports custom string IDs | Yes | Yes | Depends |

---

## Appendix A: Identity Touchpoint File Index

| File | Role in identity |
|------|-----------------|
| `core/vault/build/IdentityResolver.ts` | ID resolution (frontmatter or path) |
| `core/vault/build/PageBuilder.ts` | Initial page identity at scan/import |
| `core/vault/build/PageRebuilder.ts` | Identity preservation on rebuild |
| `core/vault/build/VaultBuilder.ts` | Folder identity + parentId resolution |
| `core/application/page/PageCreator.ts` | UUID generation for new pages |
| `core/shared/identity/UuidGenerator.ts` | `crypto.randomUUID()` |
| `core/vault/understand/FrontmatterParser.ts` | Reads `id:` from YAML |
| `core/vault/understand/FrontmatterSerializer.ts` | Writes `id:` to YAML |
| `core/vault/sync/VaultSyncService.ts` | External change identity handling |
| `core/vault/models/Vault.ts` | Duplicate ID enforcement, path indexes |
| `core/application/move/MoveService.ts` | Physical move, ID unchanged |
| `core/application/page/PageMutationService.ts` | Archive/restore, ID unchanged |
| `core/engine/DocumentRegistry.ts` | Sessions keyed by page ID |
| `core/engine/DocumentSession.ts` | Frozen Page snapshot with ID |

## Appendix B: Test Coverage for Identity

| Test | What it proves |
|------|---------------|
| `PageBuilder.test.ts` | Frontmatter ID used; path fallback works |
| `PageRebuilder.test.ts` | Metadata rebuild; ID not explicitly tested for preservation |
| `DocumentRoundTrip.test.ts` | ID preserved through serialize→parse→rebuild |
| `VaultSyncService.test.ts` | Move preserves ID; change preserves ID |
| `Vault.test.ts` | Duplicate path rejected; updatePagePath works |
| `PageMutationService.test.ts` | Archive/restore preserve ID; renamed folder restore |

**Not tested:**
- Path-derived ID + external rename (runtime and restart)
- Frontmatter ID manually changed on disk
- Duplicate ID at startup
- Path-as-ID frontmatter on second machine
- Folder rename identity

---

*End of Identity Architecture Audit. No code was modified. Decision on migration option is deferred pending team review.*
