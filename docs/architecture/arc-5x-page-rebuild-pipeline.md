# Arc 5.x — Page Rebuild Pipeline

## Status

**Proposed**

This document defines the architecture for rebuilding immutable `Page` domain models after persisted content changes. It extends Arc 5 without changing its architectural boundaries.

---

# Problem Statement

Arc 5 established the editing and persistence pipeline:

```text
MarkdownEditor
        ↓
DocumentSession
        ↓
PersistenceService
        ↓
VaultFileSystem
```

A successful save updates the Markdown file on disk, but the in-memory `Vault` must also reflect the new document state.

The current implementation exposes a missing architectural capability:

- `PageBuilder` only constructs Pages during vault discovery.
- `PersistenceService` must not construct domain objects.
- `Vault` must not analyze Markdown.

A dedicated rebuild pipeline is therefore required.

---

# Design Goals

The rebuild pipeline must:

- Preserve immutable Page identity.
- Produce a brand-new immutable `Page`.
- Recompute all page-local derived analysis.
- Be reusable by every operation that changes a Page.
- Keep persistence, analysis, and Vault responsibilities separate.

---

# Architectural Decisions (Frozen)

The following decisions are architectural guarantees and are no longer considered open questions:

- Persisted Markdown is the canonical source of truth.
- Durable persistence always precedes rebuilding.
- `PageRebuilder` must never block successful persistence.
- Immutable `Page` instances are always replaced, never mutated.
- Discovery and rebuilding remain separate pipelines.
- Page-local analysis is rebuilt synchronously.
- Global indexes evolve independently from page rebuilding.
- `DocumentSession` is the live editing model; the `Vault` is the immutable in-memory read model.

---

# Discovery vs Rebuild

Discovery:

```text
Filesystem
    ↓
Vault Scanner
    ↓
PageBuilder
    ↓
Vault
```

Rebuild:

```text
Existing Page
        +
Committed Changes
        ↓
PageRebuilder
        ↓
New Immutable Page
        ↓
Vault.replacePage(...)
```

Although both produce `Page` instances, they solve different problems and intentionally remain separate pipelines.

---

# Proposed Component

Introduce a new component:

```text
PageRebuilder
```

`PageRebuilder` is a sibling of `PageBuilder`.

It is responsible only for rebuilding existing immutable Pages after committed changes.

It is not responsible for:

- filesystem access
- persistence
- workspace updates
- global indexes
- UI state

---

# Inputs

The rebuild pipeline consumes:

- Existing immutable `Page`
- Committed changes (initially Markdown, later additional page mutations)

Future change types may include:

- Markdown
- Name
- Path
- Parent
- Metadata

---

# Output

The rebuild pipeline produces exactly one result:

```text
New immutable Page
```

The returned Page:

- preserves identity
- preserves relationships
- refreshes derived analysis
- reflects committed changes

The original Page is never mutated.

---

# Responsibilities

`PageRebuilder` owns:

- rebuilding page-local analysis
- preserving immutable identity
- producing the replacement Page

`PersistenceService` owns:

- save orchestration
- filesystem writes
- invoking the rebuild pipeline
- updating the Vault
- completing the save lifecycle

`Vault` owns:

- replacing immutable Page instances
- maintaining internal indexes

---

# Explicit Non-Responsibilities

The rebuild pipeline must never:

- write files
- parse the vault
- rebuild global indexes
- update KnowledgeGraph
- update Search
- update Workspace
- own save sequencing

Global indexes will consume rebuilt Pages through their own incremental pipelines.

---

# Save Sequence

```text
DocumentSession
        ↓
PersistenceService
        ↓
Serialize document
        ↓
Write file
        ↓
PageRebuilder
        ↓
New immutable Page
        ↓
Vault.replacePage(...)
        ↓
SaveCoordinator.completeSave(...)
```

This sequence keeps persisted Markdown as the source of truth while ensuring the in-memory Vault is refreshed before the save lifecycle completes.

### Rationale

Durable persistence is the commit point for the editing pipeline.

A failure while rebuilding derived analysis must never prevent valid Markdown
from being written to disk.

If rebuilding fails after a successful write:

- the Markdown file remains correct,
- the `Vault` may temporarily contain a stale `Page`,
- a future rebuild or full vault scan can safely reconstruct the correct
  immutable `Page`.

This intentionally prioritizes durability over derived state consistency.

---

# Future Consumers

The rebuild pipeline will be reused by:

- Markdown edits
- Rename
- Move
- Archive
- Restore
- Duplicate
- Filesystem watcher
- Conflict resolution
- Future re-indexing

No feature should reconstruct `Page` objects independently.

---

# Architectural Principles

- One canonical rebuild pipeline.
- Immutable Pages are always replaced, never mutated.
- Local page analysis is synchronous.
- Global indexes evolve independently.
- Discovery and rebuilding remain separate responsibilities.

---

# Reliability Requirement

Crash-safe persistence is a mandatory implementation requirement.

The filesystem implementation should eventually adopt an atomic write strategy
(write temporary file → flush → atomic rename) so a crash during persistence
cannot leave a partially written Markdown file.

This requirement is independent of the rebuild pipeline and applies to every
future persistence operation.

---

# Open Questions

Implementation work will resolve:

1. Exact `PageRebuilder` public API.
2. Representation of committed changes.
3. Reuse of existing page-analysis mapping logic.
4. Save queue integration.
5. Filesystem watcher integration.

These are implementation decisions and do not change the architectural guarantees defined above.
