# Clutter Architecture v1.1

## Purpose

This document defines the architectural boundaries and decisions that guide Clutter development after the architecture audit.

The goal is to preserve a simple principle:

Markdown is the durable knowledge source. The Vault is the runtime interpretation. UI and features consume derived state.

---

# Core Principles

## 1. Markdown is the source of truth

User knowledge lives in files on disk.

The Vault, indexes, projections, caches, and UI state are rebuildable interpretations of that knowledge.

If the Vault is deleted, Clutter should be able to rebuild from Markdown.

---

## 2. Vault is runtime truth

During application runtime:

- Structure comes from Vault.
- Metadata comes from Vault.
- Relationships come from Vault.
- Projections come from Vault.

UI should not depend on stale snapshots.

---

## 3. Identity and location are separate

Every page has:

- Stable identity: frontmatter ID.
- Location: filesystem path.

Moving a file changes location, not identity.

Path-based identity exists only as a legacy fallback.

---

## 4. Events are triggers, not truth

Filesystem events only indicate that something may have changed.

The system must verify the final state from disk before applying meaning.

Example:

```
Filesystem event
        ↓
Read current file state
        ↓
Parse / rebuild
        ↓
Apply policy
        ↓
Update Vault
```

---

## 5. User mutations and external sync are separate

User actions:

```
UI intent
   ↓
Application services
   ↓
Persistence coordinator
   ↓
Disk + Vault rebuild
```

External changes:

```
Filesystem reality
   ↓
VaultSyncService
   ↓
Reconcile
   ↓
Disk correction if required
   ↓
Vault rebuild
```

They should not share ownership boundaries.

---

# Data Ownership

| Concern                   | Owner             |
| ------------------------- | ----------------- |
| Markdown files            | Filesystem        |
| Page identity             | Frontmatter ID    |
| Page structure            | Vault             |
| Editor buffer             | DocumentSession   |
| Navigation selection      | Workspace         |
| Search/tags/tasks indexes | Vault projections |

---

# Archive Policy

Archive lifecycle is metadata-driven.

`status: archived` defines archive lifecycle.

The Archive folder is an organizational location, not the lifecycle authority.

Automatic repair rule:

```
status === archived
AND
page is outside Archive folder

→ clear archive metadata
```

Clutter does not automatically archive pages because users place files inside an Archive folder.

---

# Persistence Boundaries

## App initiated writes

Owned by:

```
PageMutationService
        ↓
PagePersistenceCoordinator
        ↓
write → parse → rebuild → Vault
```

## External reconciliation writes

Owned by:

```
VaultSyncService
        ↓
Sync reconciliation helper
        ↓
write → parse → rebuild → Vault
```

Separate pipelines are intentional.

---

# Known Future Improvements

These are not architecture blockers:

1. Runtime folder synchronization.
2. External rename recovery improvements.
3. Legacy files migration to stable IDs.
4. Reduce DocumentSession to pageId + editor state.
5. Duplicate identity conflict resolution UI.
6. Optional shared low-level document writer extraction.

---

# Development Rule

Before adding features:

Respect ownership boundaries.

Avoid creating new sources of truth.

Prefer rebuilding derived state over synchronizing duplicated state.

# Architecture Status

Version: v1.1

Status: Frozen

Purpose:
This architecture is the baseline for feature development.

Future changes require explicit review against these principles.
