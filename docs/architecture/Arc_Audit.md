# Clutter Architecture Audit

Status: Research only
Code changes during audit: None unless explicitly noted

Purpose: Validate the foundation before feature development and separate real architectural gaps from incorrect assumptions.

---

# 1. Core Philosophy Confirmed

## Durable truth

Markdown files are the durable source of truth.

The vault must remain usable without Clutter. Users can rename, move, edit, sync, or manage files using normal filesystem tools.

Clutter adapts to the vault; the vault does not depend on Clutter.

---

# 2. Source of Truth Ownership

## Vault owns

- Page identity index
- Current file location
- Folder hierarchy
- Metadata loaded from disk
- Tags, tasks, links and projections
- Runtime knowledge model

Vault state must be rebuildable from disk.

## Workspace owns

- activePageId
- activeFolderId
- navigation state

Workspace should not store Page objects.

## DocumentSession owns

- Editor buffer
- Revisions
- Dirty state
- Save lifecycle
- Future cursor/selection state

DocumentSession must not become another Vault.

---

# 3. Identity Model

Frozen rule:

```
Frontmatter ID = permanent identity
Path = current location
```

Example:

```
Projects/Clutter.md
id: page_clutter
```

Move:

```
Archive/Clutter.md
id: page_clutter
```

Same page. Only location changed.

Path-derived identity exists only for legacy markdown files without IDs.

Migration rule:

```
First Clutter persistence/import:
Missing ID → generate UUID → write frontmatter
```

---

# 4. Persistence Boundaries

## User initiated changes

```
UI action
 ↓
PageMutationService
 ↓
PagePersistenceCoordinator
 ↓
MoveService (if required)
 ↓
serialize
 ↓
write
 ↓
parse
 ↓
rebuild
 ↓
replace Vault
```

## External changes

```
Filesystem signal
 ↓
VaultSyncService
 ↓
Read disk
 ↓
Build/Rebuild page
 ↓
Validate policies
 ↓
Repair if required
 ↓
Update Vault
```

These are intentionally separate pipelines.

---

# 5. MoveService Boundary

Frozen:

MoveService is a generic physical movement primitive.

It knows:

- source path
- destination path
- collision handling
- filesystem move

It does not know:

- Archive
- Restore
- Inbox
- Metadata
- Lifecycle state

---

# 6. Archive Model

Archive folder is a physical organization location.

`status: archived` is lifecycle metadata.

They are related but not identical.

## Repair rule

If:

```
status === archived
AND
file is outside Archive/
```

then:

```
status = active
archivedAt = null
originalPath = null
originalParentId = null
```

Do not automatically archive files because they are placed in Archive/ externally.

---

# 7. Watcher Philosophy

The watcher is not truth.

The watcher is only a trigger:

```
OS filesystem
 ↓
Rust watcher
 ↓
LocalFileSystemWatcher
 ↓
VaultSyncService
 ↓
Vault
 ↓
React UI
```

Do not create separate logic for:

- Google Drive
- Git
- Dropbox
- iCloud

All sources should eventually enter the same reconciliation path.

---

# 8. External Change Principle

Do not trust event type.

Bad:

```
moved event
 ↓
assume restore
```

Preferred:

```
Something changed
 ↓
Read actual file state
 ↓
Build Page
 ↓
Check consistency
 ↓
Repair if needed
```

Events are triggers. State decides.

---

# 9. Confirmed Good Areas

✅ Markdown as durable truth

✅ Vault as runtime truth

✅ PageBuilder and PageRebuilder symmetry

✅ Page identity through frontmatter IDs

✅ MoveService purity

✅ Separate user mutation and external sync pipelines

✅ Archive metadata reconciliation approach

---

# 10. Remaining Audit Areas

Status: Completed

The remaining audit areas were reviewed. Findings are documented below. No foundation-level redesign is required.

---

## Runtime folder synchronization

Finding:
External folder changes are not synchronized while Clutter is running.

Evidence:
VaultBuilder correctly rebuilds folders during startup. Runtime VaultSyncService currently handles markdown page events but does not process folder lifecycle events.

Risk:
Medium. External folder creation, rename, and deletion require restart or rescan to reflect in the Vault.

Decision:
Keep the watcher architecture. Folder synchronization belongs in VaultSyncService, not the filesystem watcher.

Action:
Add folder runtime synchronization before advanced external filesystem workflows.

---

## External rename recovery

Need to validate delete/create sequences:

```
delete old path
create new path
```

Questions:

- Does identity survive?
- Does Vault recover correctly?
- Are duplicate IDs handled safely?

---

## Duplicate IDs

Current behavior should not silently fix.

Two files claiming the same ID means the user must decide.

Future:

Recovery UI or conflict handling.

---

## DocumentSession cleanup

Current UI uses Vault for structural presentation.

Remaining risk:

DocumentSession still contains a Page snapshot.

Future cleanup:

Session should only hold pageId + editor state.

Not blocking.

## Identity Audit Result

Finding:
Path-derived identities may break on rename/move.

Evidence:
IdentityResolver prefers frontmatter IDs. Path IDs exist only as fallback.

Risk:
Legacy files without IDs can lose identity after rename.

Decision:
Accept current architecture. Stable IDs are already the target model.

Action:
Add migration workflow for legacy markdown without IDs in a future import/persistence arc.

## Frontmatter Parser Audit Result

Finding:
Frontmatter parsing could affect identity stability.

Evidence:
Parser preserves `id` and archive metadata fields correctly. Identity generation is handled separately.

Risk:
Legacy files without IDs require migration, not parser changes.

Decision:
Accept current design.

Action:
Remove stale serializer TODO comment later. Consider preserving unknown frontmatter fields when plugin/custom metadata support is introduced.

## Frontmatter Serializer Audit Result

Finding:
Serialization could affect identity and metadata durability.

Evidence:
Serializer writes stable IDs, archive metadata, and deterministic frontmatter ordering.

Risk:
Unknown user-defined frontmatter fields are currently not preserved.

Decision:
Accept current design for v1.1.

Action:
Consider frontmatter preservation layer when custom metadata/plugins are introduced.

## VaultBuilder Audit Result

Finding:
Vault reconstruction could lose identity or hierarchy.

Evidence:
VaultBuilder rebuilds pages, folders, and projections from scan results. Both pages and folders use IdentityResolver. Parent relationships are reconstructed from paths.

Risk:
Runtime folder synchronization remains unverified.

Decision:
Accept startup reconstruction architecture.

Action:
Audit VaultSyncService folder event handling separately.

## PageBuilder Audit Result

Finding:
Page reconstruction may lose identity or lifecycle metadata.

Evidence:
PageBuilder resolves identity through IdentityResolver, maps frontmatter metadata directly, and rebuilds analysis projections from scanned content.

Risk:
Legacy files without IDs remain dependent on path fallback.

Decision:
Accept current architecture.

Action:
Legacy ID migration belongs to future import/persistence work.

## VaultSyncService Audit Result

Finding:
Runtime synchronization mostly follows the state-based reconciliation model.

Evidence:
All external events flow through VaultSyncService. Handlers rebuild from disk where required and archive correction is evaluated from final page state.

Risk:
Folders are not synchronized as runtime filesystem objects. External folder creation/rename/deletion while the app is open is not handled.

Decision:
Accept event architecture.

Action:
Add folder synchronization strategy before feature expansion.
Audit duplicate ID handling in Vault.

## Vault Audit Result

Finding:
Vault identity and mutation safety may fail under conflicts.

Evidence:
Vault maintains separate ID and path indexes, rejects duplicate IDs, prevents path collisions, and rebuilds projections from Pages.

Risk:
Duplicate identity conflicts currently stop startup rather than providing user conflict resolution.

Decision:
Accept current safety model.

Action:
Add conflict resolution UX in future, not foundation work.

## DocumentSession Audit Result

Finding:
DocumentSession stores a full Page snapshot.

Evidence:
DocumentSession receives and stores Page but only requires initial markdown and stable identity for persistence.

Risk:
Future code may accidentally read structural Page data from session and create dual source of truth.

Decision:
Accept current design for v1.1. Not blocking.

Action:
Future cleanup: reduce DocumentSession dependency to pageId + editor state only.

## PagePersistenceCoordinator Audit Result

Finding:
Multiple page write paths exist.

Evidence:
PagePersistenceCoordinator handles user-initiated mutations. Sync reconciliation uses a separate writer because external filesystem interpretation is a different ownership boundary.

Risk:
Low. Future refactoring may extract shared mechanical document writing.

Decision:
Keep separate pipelines. Do not merge user mutation and external sync.

Action:
Clarify coordinator documentation to specify app-initiated persistence.

## VaultSyncCoordinator Audit Result

Finding:
Filesystem event ordering may cause rename ambiguity.

Evidence:
Coordinator correctly serializes operations by page identity or path. Delete/create rename sequences can use different keys because identity is temporarily unknown.

Risk:
External rename recovery requires higher-level event interpretation.

Decision:
Keep coordinator design.

Action:
Improve rename reconciliation later. Do not change sync coordinator.

## Runtime Folder Synchronization Audit Result

Finding:
External folder changes are not synchronized while the app is running.

Evidence:
VaultSyncService only processes markdown pages. Created events for folders are ignored and folder operations are not handled.

Risk:
Medium. External folder creation/rename/delete requires restarting Clutter or rescanning the vault.

Decision:
Keep current watcher architecture.

Action:
Add folder event handling to VaultSyncService before advanced external filesystem workflows.

---

# 12. Current Verdict

Foundation is strong.

The audit did not reveal a need for core architecture redesign.

Confirmed architectural decisions:

- Markdown remains durable truth.
- Vault remains runtime truth.
- Frontmatter IDs provide stable identity.
- Paths represent location only.
- User mutations and external sync remain separate pipelines.
- Events are triggers; final state decides reconciliation.
- Archive lifecycle is metadata-driven, not folder-driven.
- DocumentSession remains editor state, not a second Vault.

Accepted future hardening:

1. Runtime folder synchronization
2. External rename recovery improvements
3. Legacy ID migration workflow
4. DocumentSession reduction to pageId + editor state
5. Duplicate identity conflict resolution UX
6. Optional shared low-level document writer extraction

Architecture v1.1 can now be frozen.

Next phase:

Begin product feature arcs with the existing boundaries as guardrails.
