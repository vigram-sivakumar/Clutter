# System Design

**Status:** Living Document

## Purpose

This document describes how Clutter is implemented.

While the Architecture document defines the long-term principles and invariants of the system, this document explains the current runtime design and may evolve as the implementation grows.

---

# Scope

This document defines:

- Runtime models
- Module responsibilities
- Dependency direction
- Runtime data flow
- Vault opening
- Vault scanning
- Markdown parsing
- Metadata validation
- Catalog construction
- Views
- Derived indexes
- Editing and persistence
- Filesystem watching
- Error handling
- Performance considerations
- Extension points

This document intentionally does not redefine architectural principles.

---

# Guiding Principles

- Keep the implementation as simple as possible.
- Introduce abstractions only when they remove more complexity than they add.
- Prefer composition over inheritance.
- Every module should have one reason to change.
- Separate platform concerns from domain logic.
- Keep runtime models independent from infrastructure.

---

## Runtime Identity

A runtime `Page` has two independent identifiers with different responsibilities.

## Runtime Data Flow

Opening a vault currently consists of scanning the filesystem and materializing the runtime resource model.

```text
Filesystem
    │
    ▼
VaultProvider
    │
    ▼
VaultScanner
    │
    ▼
DocumentLoader
    │
    ▼
FrontmatterParser
    │
    ▼
PageBuilder
    │
    ▼
Page[]
    │
    ▼
Vault
```

Each stage has a single responsibility:

| Component         | Responsibility                                           |
| ----------------- | -------------------------------------------------------- |
| VaultProvider     | Access the underlying filesystem.                        |
| VaultScanner      | Discover Markdown files and orchestrate page creation.   |
| DocumentLoader    | Read and parse Markdown documents.                       |
| FrontmatterParser | Extract frontmatter and Markdown body.                   |
| PageBuilder       | Construct runtime `Page` objects.                        |
| Vault             | Represent the current runtime view of the scanned vault. |

## Vault

Vault is the canonical runtime representation of the resources belonging to a vault and the invariants governing those resources.

It owns the runtime resource model (such as pages, folders, and assets) and provides canonical identity lookup for those resources.

### Runtime Boundary

`Vault` owns the canonical runtime resources discovered within a vault and the invariants governing those resources.

Resources currently include pages and will later expand to include folders and other vault-owned resources such as assets.

Derived capabilities such as search, backlinks, graph relationships, and task indexes consume the vault's resources but are not themselves part of the vault's source of truth.

Vault does not own workspace state, application lifecycle, UI state, or derived capabilities such as search or graph indexes. Those are separate collaborators that depend on the vault rather than becoming part of it.

### Design Principle

Vault owns canonical resources. Derived capabilities (such as search, backlinks, graph views, and task indexes) consume the vault’s resources but are not themselves part of the vault’s source of truth.

### Design Note

The scanner currently returns a `Vault` directly.

A separate `OpenVault` orchestration layer is intentionally deferred until opening a vault involves additional responsibilities beyond scanning, such as restoring workspace state, starting filesystem watchers, or initializing derived indexes.

This follows Clutter's implementation philosophy of introducing abstractions only when they provide meaningful value.

### Planned Evolution

The current implementation materializes folder metadata as a `Page` with `type: "folder"` to keep the scanning pipeline simple.

This is an implementation detail rather than the intended runtime model.

The planned design is to introduce a first-class `Folder` runtime model.

At that point:

- Filesystem directories will materialize as `Folder` objects.
- `.folder.md` will become the persistence representation of folder metadata rather than a runtime page.
- `Vault` will own both `Page` and `Folder` resources.
- If assembling heterogeneous resources introduces meaningful complexity, a dedicated `VaultBuilder` may be introduced to construct the runtime `Vault`.

This evolution will be driven by implementation needs rather than speculative abstraction.

### Page ID

The page ID is the immutable identity of a page.

It is stored in the page's frontmatter and never changes, even if the page is renamed or moved.

The ID is used by Clutter for all internal relationships, including:

- Backlinks
- Graph relationships
- Favorites
- Recently opened pages
- Open tabs
- Workspace state
- Cached indexes

### Page Path

The page path is the current filesystem location of the page.

It is derived from the vault during scanning and is not persisted in frontmatter.

The path is used for filesystem operations, including:

- Reading files
- Writing files
- Moving files
- Renaming files
- File watching
- Detecting external changes

Unlike the page ID, the path may change whenever the user reorganizes the vault.

### Wiki Links

Markdown remains human-readable and portable.

Wiki links are stored using human-readable page references rather than page IDs.

When a page name is unique within the vault, Clutter stores a simple page reference:

```md
[[Project Alpha]]
```

If multiple pages share the same name, Clutter automatically stores a vault-relative qualified reference:

```md
[[Personal/Project Alpha]]
```

During indexing, Clutter resolves every wiki link to the target page's immutable ID and stores that relationship internally.

As a result:

- Markdown remains readable and compatible with other editors.
- Runtime relationships remain stable and independent of filesystem paths.
- Internal features such as backlinks, graph relationships, favorites, and workspace state reference pages by their immutable IDs rather than their paths.

### Wiki Link Resolution

Clutter resolves wiki links using the following order:

1. Resolve a unique page name.
2. Resolve a qualified vault-relative page reference (for example `[[Personal/Finance]]`).
3. If multiple matches still exist, prompt the user to choose the intended page.

Once resolved, Clutter stores the relationship internally using the target page's immutable ID.

The Markdown itself remains unchanged and continues to contain only human-readable wiki links.
---

# Planned Sections

1. Terminology
2. Dependency Map
3. Runtime Models
4. Runtime Data Flow
5. Opening a Vault
6. Vault Provider
7. Vault Scanner
8. Markdown Parsing
9. Metadata Validation
10. Folder Metadata (.folder.md)
11. Vault
12. Views
13. Derived Indexes
14. Editing & Serialization
15. Save & Conflict Handling
16. Filesystem Watching
17. Workspace State
18. Error Handling
19. Performance
20. Extension Points
21. Testing Strategy

---

# Current Status

This document is intentionally incomplete.

Each section will be expanded as the corresponding implementation is introduced, reviewed, and stabilized.
