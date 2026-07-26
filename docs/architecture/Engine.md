# Clutter Engine

## Purpose

The Clutter Engine is the core runtime responsible for loading, editing, persisting, and interpreting knowledge.

It provides a single authoritative model for every open document so that all parts of the application observe the same state rather than maintaining independent copies.

The engine is independent of the UI. Editors, sidebars, search, graph, plugins, and future AI capabilities are consumers of the engine rather than owners of the data.

---

# Core Principles

## Markdown is the durable source of truth

Markdown files are the user's data.

Clutter never replaces Markdown with a proprietary database.

Everything else can be rebuilt from the vault.

---

## One authoritative document

Each open page has exactly one live document session.

Every editor, tab, panel, and future window works with that same session.

---

## Derived knowledge

Tasks, tags, links, headings, backlinks, search indexes, graph data, and future AI metadata are derived from document content.

They are never edited directly.

---

## Separate concerns

The engine separates:

- Domain state
- Workspace state
- Window state
- View state

Each evolves independently.

---

## Reactive by design

Changes flow through one authoritative model.

Consumers observe changes instead of manually synchronising with each other.

---

# Core Objects

The engine is built around a small set of core runtime objects. Every feature should belong to one of them.

## Vault

Represents a knowledge space.

Owns:

- Pages
- Folders
- Assets
- Vault settings

Does not own:

- Open editors
- UI state
- Live document content

## VaultRuntime

Represents one opened vault.

Owns the active runtime services required while a vault is open.

Examples:

- Document registry
- File watching
- Persistence
- Knowledge updates

Does not own durable user content.

## Page

Represents the stable identity of a document.

Owns:

- Page identity
- Current path
- Basic metadata

Does not own the live editable text.

## DocumentSession

Represents the single authoritative editable version of an open page.

Every editor viewing the same page attaches to the same session.

## DocumentRegistry

Represents the runtime registry of open documents.

Owns:

- Active `DocumentSession`s
- Session creation
- Session lookup
- Session disposal

Ensures there is at most one active `DocumentSession` for each page within a running `VaultRuntime`.

## DocumentRevision

Represents an immutable committed version of a document.

Every successful document transaction produces a new `DocumentRevision`.

A revision represents a stable point in time that can be used for persistence, recovery, version history, synchronisation, and future collaboration.

## DocumentTransaction

Represents a proposed change to a document.

A transaction describes _what_ should change.

When committed by a `DocumentSession`, it produces a new immutable `DocumentRevision`.

## PageFacts

Represents the semantic interpretation of a page.

Contains derived information such as:

- Tasks
- Tags
- Links
- Headings
- Properties

It is always derived from a specific committed `DocumentRevision`.

## Workspace

Represents how the user is currently working.

Owns:

- Open tabs
- Navigation history
- Expanded folders
- Selected page
- Panel layout

It references the Vault but does not own the knowledge itself.

## DocumentState

Represents the current lifecycle state of an open document.

Typical states include:

- Loading
- Clean
- Dirty
- Saving
- Conflict
- Disposed

The exact states may evolve, but the concept remains part of the `DocumentSession`.

---

# Engine Entry Point

The Document Engine is created when a vault is opened.

The Vault remains the authoritative representation of the user's knowledge.

The Engine provides the runtime required to open, edit, and persist that knowledge.

```text
Open Vault
      ↓
VaultRuntime
      ↓
Vault
      ↓
DocumentRegistry
      ↓
Open Page
      ↓
Create or Attach DocumentSession
```

The `Vault` is responsible for representing pages, folders, assets, and derived knowledge.

The `DocumentRegistry` is responsible for creating and managing live document sessions for those pages.

This connects the Vault pipeline (Discover → Understand → Build → Knowledge) with the Document Engine without mixing their responsibilities.

---

# Document Lifecycle

A page becomes editable only after it is opened.

The engine is responsible for creating and managing the live editing session.

```text
Page
    ↓
Open
    ↓
DocumentRegistry
    ↓
Create or Attach DocumentSession
    ↓
Editor Views
    ↓
Document Transactions
    ↓
DocumentRevision
    ↓
PageFacts
    ↓
Persistence
    ↓
Close
```

## Open

When a page is opened, the engine asks the `DocumentRegistry` for a document session.

If one already exists, it is reused.

Otherwise a new session is created.

## Attach

Every editor, split view, tab, or future window displaying the same page attaches to the same `DocumentSession`.

There is never more than one authoritative editable session for a page within a running `VaultRuntime`.

## Close

Closing a view detaches it from the session.

The session remains alive while at least one view is attached.

When the last view closes, the engine may dispose of the session after ensuring any pending work has completed.

---

# Mutation Model

The engine distinguishes between application commands and document transactions.

Although both change the system, they operate at different levels and have different responsibilities.

## Application Commands

Application commands represent user intentions that affect the domain.

Examples:

- Create Page
- Rename Page
- Move Page
- Duplicate Page
- Archive Page
- Delete Page
- Restore Page
- Open Page
- Close Page

Application commands may:

- Validate business rules.
- Coordinate multiple services.
- Trigger persistence.
- Produce one or more document transactions.

## Document Transactions

Document transactions represent changes to the content of an open document.

Examples:

- Typing
- Delete text
- Paste
- Toggle a task
- Edit frontmatter
- Change a page title

A transaction is always committed by the `DocumentSession`.

Editors propose changes.

`DocumentSession` decides whether those changes become the authoritative state.

Each committed transaction produces a new immutable `DocumentRevision`.

## Ownership Rule

No UI component modifies a document directly.

Every content change must pass through the active `DocumentSession`.

This guarantees that every observer sees the same committed document state.

---

# State Boundaries

Different kinds of state have different lifetimes and responsibilities.

The engine keeps them separate to avoid coupling the document model to the user interface.

## Domain State

Represents the user's knowledge.

Examples:

- Vault
- Pages
- DocumentSession
- PageFacts

This state is shared by every consumer of the engine.

## Workspace State

Represents how the user is currently working.

Examples:

- Open tabs
- Active page
- Expanded folders
- Navigation history
- Panel layout

Workspace state references the domain but never owns it.

## Window State

Represents state that belongs to one application window.

Examples:

- Window bounds
- Active pane
- Window-specific layout

Different windows may present the same workspace differently.

## View State

Represents state that belongs to one view of one document.

Examples:

- Cursor position
- Text selection
- Scroll position
- Folded sections
- Temporary editor decorations

View state is temporary and never becomes part of the document.

## Ownership Rule

When introducing new state, first decide which boundary owns it.

If the state describes the user's knowledge, it belongs to the domain.

If it describes how the user is interacting with that knowledge, it belongs to the workspace, window, or view.

---

# Reactive Flow

Every feature in Clutter reacts to one authoritative document state rather than communicating directly with other features.

A single user action flows through the engine in a predictable sequence.

```text
User Action
      ↓
Editor
      ↓
DocumentSession
      ↓
DocumentTransaction
      ↓
DocumentRevision
      ↓
PageFacts
      ↓
Observers
      ├── Sidebar
      ├── Tabs
      ├── Tasks
      ├── Search
      ├── Graph
      ├── Properties
      └── Plugins
      ↓
Persistence
```

## Reactive Principle

Consumers never notify each other directly.

For example, the editor does not update the sidebar, search, graph, or task list.

Instead, every consumer observes the same authoritative document state and reacts only to committed changes.

## Benefits

This model ensures:

- One source of truth.
- Consistent UI.
- Independent features.
- Easier testing.
- Future extensibility for plugins, AI, and collaboration.

Adding a new feature should require subscribing to the engine rather than modifying existing features.

---

# Persistence Model

Markdown files are the durable source of truth.

The engine keeps documents in memory only while they are actively needed.

Persistence is responsible for safely synchronising the in-memory document state with the Markdown files on disk.

```text
DocumentSession
        ↓
Committed Transaction
        ↓
DocumentRevision
        ↓
Persistence Queue
        ↓
Atomic Markdown Write
        ↓
File System
```

## Persistence Principle

The `DocumentSession` owns the live document.

Persistence never edits the document.

It only writes the latest committed state to disk.

## Autosave

Autosave observes committed document transactions.

It decides _when_ a document should be written.

It does not decide _what_ is written.

## File Watching

External file changes are treated as document changes.

The engine reconciles those changes with the active `DocumentSession` instead of bypassing it.

## Ownership Rule

Only the persistence layer reads from and writes to the file system.

All other parts of the application interact with documents through the engine rather than accessing Markdown files directly.

---

# Vault Reconciliation

A successful persistence operation does not complete the document lifecycle.

After a committed `DocumentRevision` has been written to Markdown, the Vault reconciles its runtime representation so that every derived projection reflects the latest durable state.

```text
DocumentRevision
        ↓
Persistence
        ↓
Markdown
        ↓
Vault Reconciliation
        ↓
Updated Runtime Knowledge
```

During reconciliation the Vault may:

- Refresh the affected page.
- Rebuild affected knowledge projections.
- Update indexes.
- Refresh graph relationships.

Only the affected knowledge should be refreshed whenever possible.

The Document Engine remains responsible for editing documents.

The Vault remains responsible for representing the current state of the knowledge space.

# Design Invariants

The following rules define the architectural boundaries of the Clutter Engine.

These invariants should remain true regardless of future features or implementation details.

1. Markdown files are the durable source of truth.
2. A page has at most one active `DocumentSession` within a running `VaultRuntime`.
3. Every content change is committed through the `DocumentSession`.
4. Every committed `DocumentRevision` is immutable.
5. `PageFacts` are always derived from a committed `DocumentRevision` and are never edited directly.
6. Features observe the engine instead of communicating directly with each other.
7. Workspace, Window, and View state never own domain state.
8. Persistence writes committed document state but never modifies it.
9. External file changes are reconciled through the engine rather than bypassing it.
10. New features should integrate by subscribing to the engine instead of introducing independent document state.
11. The engine remains independent of any specific editor, UI framework, or plugin implementation.

These invariants serve as the architectural checklist for every future feature and refactor.
