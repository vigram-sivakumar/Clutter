# Clutter Architecture v1.0

**Status:** Frozen\
**Version:** 1.0\
**Last Updated:** 2026-07-23

---

# Vision

> **Clutter is a local-first knowledge application built on an open
> Markdown vault. The vault owns the user's knowledge. Clutter provides
> interpretation, indexing, and a modern editing experience while
> remaining compatible with the broader Markdown ecosystem.**

The editing experience should feel modern and powerful, while the stored
data remains open, portable, AI-friendly, and understandable without
Clutter.

---

# Implementation Philosophy

The implementation should remain as simple as possible while preserving the architectural invariants defined in this document.

Principles:

- Build the simplest solution that satisfies current requirements while preserving the frozen architectural invariants.
- Introduce complexity only when it unlocks meaningful capability.
- Every abstraction should remove more complexity than it introduces.
- Prefer composition over inheritance.
- Hide implementation details behind stable interfaces only at proven volatility boundaries.
- Optimize for readability, maintainability, and testability over cleverness.
- Evolve the architecture incrementally rather than through speculative design.

# Core Principles

1.  **The vault owns the knowledge.**
2.  **Markdown is the canonical page format.**
3.  **Users own the filesystem organization.**
4.  **Clutter reflects the physical structure of the vault whenever possible. Virtual views are introduced only when they provide capabilities that cannot be represented by the filesystem alone (for example, Tags, Search, and Backlinks).**
5.  **Clutter-managed pages have stable identities independent of filenames and
    locations.**
6.  **Views interpret pages without changing storage.**
7.  **The editor is rich; the storage remains simple.**
8.  **Derived information is computed from the vault, not authored.**
9.  **Complexity is introduced only when it unlocks meaningful
    capability.**
10. **Clutter progressively adopts existing Markdown instead of
    requiring migration.**

---

# 1. The Vault

The vault is the authoritative source of user knowledge.

It contains:

- Markdown pages
- Images
- PDFs
- Audio
- Video
- Other user-authored resources

Clutter never stores user knowledge exclusively inside an application
database.

---

# 2. Markdown

Markdown is the canonical storage format for pages.

Pages remain readable and editable in:

- Clutter
- VS Code
- Cursor
- Obsidian
- GitHub
- Any Markdown editor

Clutter extends Markdown conservatively while preserving
interoperability.

---

# 3. Human-Owned Organization

Users organize folders however they choose.

Clutter never requires predefined folder structures.

The filesystem answers:

> Where did the user place this?

Clutter prefers physical folders over virtual classifications whenever the storage model naturally supports them.

Examples include:

- Inbox/
- Archive/
- Templates/
- Assets/

These represent real folders in the vault rather than virtual application concepts.

> What does this page mean?

---

# 4. Stable Page Identity

Every Clutter-managed page has an immutable Page ID.

```yaml
---
id: p_01JY...
type: note
---
```

The Page ID never changes.

The following may change:

- Filename
- Folder
- Title

Identity never changes.

---

# 5. Progressive Adoption

Clutter supports plain Markdown without modification.

Imported pages may contain:

- No frontmatter
- Obsidian wiki links
- Standard Markdown links
- Unknown frontmatter
- Unknown Markdown extensions

Clutter reads them without error.

A page is **adopted** the first time Clutter needs to persist
Clutter-specific metadata.

Examples:

- User sets an icon
- User sets a cover
- User creates an ID-dependent reference
- User copies a block link
- User explicitly adopts the page

Ordinary reading and text editing alone do not require adoption.

During adoption Clutter adds only the minimum required metadata.

```yaml
---
id: p_01JY...
type: note
---
```

---

# 6. Metadata

Metadata belongs to one of three categories.

## Shared Metadata

Stored with the page and shared wherever the page travels.

Examples:

- id
- type
- icon
- cover
- aliases
- favorite
- created
- updated
- status
- date

Shared metadata represents durable page properties.

## Workspace State

Workspace state belongs to the vault, not the page.

It restores how the user was working without modifying the underlying knowledge.

Examples:

- Expanded sidebar folders
- Expanded or collapsed tree nodes
- Folded headings
- Folded toggles
- Folded task hierarchies
- Active view
- Panel sizes
- Scroll position
- Cursor position

Workspace state is stored outside Markdown.

## Computed Metadata

Derived from the vault.

Examples:

- Search index
- Backlinks
- Graph
- Task index
- Reading time
- Word count

Computed metadata is always rebuildable.

---

# 7. Pages

Pages are the fundamental knowledge object.

Examples:

- Note
- Daily Note

Daily Notes are ordinary pages with additional metadata.

```yaml
type: daily-note
date: 2026-07-23
```

Both use the same editor.

---

# 8. Shared Page Header

Every page renders the same header contract.

Possible fields include:

- Icon
- Cover
- Title
- Description
- Properties

Different page kinds may render the header differently while sharing the
same structure.

---

# 9. Views

Views are interpretations of pages.

Views are **not** storage types.

Examples:

- Folder
- Tag
- Archive
- Search
- Favorites
- Recent

Examples:

- Archived → `status == archived`
- Folder → Child pages
- Tag → Pages containing the tag

Views never redefine the storage model.

Folder navigation reflects the physical directory structure of the vault. Other views, such as Tags, Search, and Backlinks, are computed interpretations that do not redefine the underlying storage model.

---

# 10. Rich Editor

Clutter provides a modern editing experience.

Features include:

- Slash commands
- Drag handles
- Hover chrome
- Drag & drop
- Keyboard shortcuts
- Rich previews

Pipeline:

```text
Markdown
    ↓
Parser
    ↓
Semantic Model
    ↓
React Components
    ↓
Rich Editor
```

Markdown remains the persistence format.

---

# 11. Blocks

Blocks are an editor concept.

Examples:

- Heading
- Paragraph
- Task
- Quote
- List
- Code
- Image

Blocks are parser nodes, not database entities.

---

# 12. Demand-Driven Block Identity

Blocks do not receive persistent identities automatically.

A block receives a stable ID only when a feature requires an external, durable reference to that block.

Examples:

- Copy Link to Block
- Embed Block
- Comments
- Annotations

Workspace continuity features such as folded headings, folded toggles, folded task trees, cursor position, and scroll position should rely on the editor's document model rather than permanent block IDs whenever possible.

Identity is introduced only when it unlocks meaningful capability.

---

# 13. References

Clutter stores references using a deterministic, self-describing Markdown representation while resolving them to stable Page IDs at runtime.

Persistence, runtime identity, and presentation belong to different layers.

```text
Markdown representation
[[Projects/Architecture|Architecture]]
        ↓
Link resolver
        ↓
Page ID
```

Persistence uses a vault-relative path so the relationship remains reconstructible from Markdown alone.

Runtime resolution binds each reference to a stable Page ID for efficient lookup, navigation, backlinks, graph construction, and rename operations.

Presentation may render the page title or the supplied alias without exposing the persisted path.

Clutter accepts multiple imported reference formats, including:

- Path-qualified wiki links
- Filename-only wiki links
- Standard Markdown links
- Other supported imported formats

When Clutter writes or rewrites references, it emits a single deterministic canonical representation.

Reference resolution is based on the persisted Markdown representation and never relies on hidden bindings that cannot be reconstructed from the vault.

---

# 14. Index

The index accelerates interpretation.

Examples:

- Search
- Backlinks
- Graph
- Task extraction
- Timeline
- Thumbnails

The index is never authoritative.

Deleting the index must never delete user-authored knowledge.

The index is always rebuildable from the vault.

---

# 15. Separation of Responsibilities

Layer Responsibility

---

# 16. Runtime Data Flow

The runtime pipeline is intentionally layered. Each component has a single responsibility.

```text
Filesystem
    ↓
Vault Provider
    ↓
Vault Scanner
    ↓
Document Loader
    ↓
Frontmatter Parser
    ↓
Page Builder
    ↓
Vault
    ↓
Views
    ↓
React UI
```

The runtime pipeline describes the conceptual flow of data. Runtime implementation details are documented separately in the System Design document.

## Responsibilities

**Vault Provider**

Provides filesystem access through an abstract interface.

Responsibilities:

- Read directories
- Read files
- Write files
- Hide platform-specific APIs (Tauri, cloud providers, etc.)

The provider never understands Markdown or Clutter concepts.

**Vault Scanner**

Traverses the vault.

Responsibilities:

- Walk the directory tree
- Discover Markdown documents
- Load documents
- Construct the runtime Vault

The scanner never parses Markdown itself.

**Document Loader**

Reads Markdown documents from the filesystem and delegates parsing.

Responsibilities:

- Read Markdown files.
- Invoke the Frontmatter Parser.
- Return parsed Markdown documents.

The Document Loader never constructs runtime domain objects.

**Frontmatter Parser**

Reads the supported Clutter frontmatter.

Responsibilities:

- Split frontmatter from body
- Parse supported metadata
- Preserve the Markdown body

The parser never accesses the filesystem.

**Page Builder**

Constructs validated runtime Page objects from parsed Markdown.

Responsibilities:

- Interpret supported Clutter metadata.
- Materialize runtime Page objects.
- Validate runtime page invariants.

The Page Builder is not responsible for filesystem access or persistence.

**Vault**

Represents the canonical runtime boundary for the resources belonging to a vault.

Responsibilities:

- Own runtime Page resources.
- Provide canonical page identity lookup.
- Enforce vault-level resource invariants.

The Vault does not own workspace state, application lifecycle, or derived capabilities such as search and graph indexes.

---

# 17. Architectural Invariants

## Identity

- Every Clutter-managed page has exactly one immutable Page ID.
- Moving or renaming a page never changes its ID.
- Duplicate IDs are explicit conflicts.

## Storage

- The vault is authoritative.
- User-authored knowledge is never stored only in the index.
- Unknown frontmatter is preserved.
- Unsupported Markdown is preserved whenever possible.
- Clutter does not unnecessarily rewrite files.

## Editing

- Parsing and serializing an unchanged page produces no meaningful
  changes.
- Editor operations produce deterministic Markdown.
- Block IDs are assigned on demand when a feature requires durable block identity.
- Workspace continuity should rely on the editor's document model whenever possible.
- The editor never requires every block to have identity.

## Indexing

- The index is rebuildable.
- External file changes are normal operation.
- Invalid pages remain visible and repairable.
- File watchers are optimization, not truth.
- Periodic reconciliation validates the index against the filesystem.
- The index is an optimization, never a dependency.
- Core vault functionality must continue to operate when the index is unavailable or rebuilding.

---

# Progressive Enhancement

Clutter should never require users to fully adopt its features to
benefit from the application.

A plain Markdown file should:

- Open correctly
- Be searchable
- Participate in backlinks when possible
- Participate in tags
- Be editable

Advanced capabilities requiring persistent identity become available
after adoption.

Workspace features should gracefully degrade.

If Clutter cannot confidently restore a piece of workspace state after significant document changes, that state may be discarded without affecting the user's knowledge.

---

# Workspace Continuity

Clutter preserves the user's workspace independently of the stored knowledge.

Workspace continuity includes:

- Expanded sidebar folders

- Active view

- Folded headings

- Folded toggles

- Folded task hierarchies

- Panel sizes

- Scroll position

- Cursor position

Workspace continuity is stored outside Markdown as part of the vault's workspace state.

Workspace continuity must never modify page content.

---

# Scope of This Document

This document defines the architectural principles and invariants of Clutter.

It intentionally does not define runtime implementation details, algorithms, component structure, or execution flow. Those are documented in the evolving System Design document.

# What Is Not Frozen

The following remain specification work:

- Vault format
- Markdown dialect
- Frontmatter schema
- Canonical reference serialization format
- Block ID syntax
- Parser implementation
- Serialization strategy
- AST implementation
- Index storage
- Editor implementation

---

# Next Specifications

1.  Vault Format Specification
2.  Markdown & Identity Specification
3.  Parser & Serialization Specification
4.  Indexer Specification
5.  Editor Specification

---

> **Any change affecting vault authority, page identity semantics,
> storage ownership, or the separation between storage and
> interpretation requires an explicit Architecture v2 decision.**
