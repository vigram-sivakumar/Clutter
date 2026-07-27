# Clutter Vault

> **Implementation status (2026-07-27):** the Discover → Understand → Build → Knowledge pipeline and the Vault's ownership boundaries described here match the current implementation.  
> Canonical page creation is now implemented through `PageCreator`, which generates stable page identities and timestamps before delegating Markdown construction to `PageFactory`.  
> Two open gaps against this document: (1) Invariant 6, "Page identities remain stable even when pages are renamed or moved," is **not yet true** — `IdentityResolver` falls back to the file's path as its ID when frontmatter has no `id`, so a rename changes the identity unless the file already carries an explicit `id`. (2) Page lookup by path/filename/alias is currently built twice — once in `Vault`'s own maps, once independently in `PageIndex` inside the knowledge stage — rather than as a single shared index. See `docs/architecture/Core Review.md` for the full audit.

## Purpose

The Vault is Clutter's knowledge model.

Its responsibility is to discover, understand, and represent the user's Markdown files as runtime objects that the rest of the application can use.

The Vault is **not** responsible for editing documents, managing UI state, or persisting changes. Those responsibilities belong to the Document Engine.

---

# Core Principles

## Markdown is the source of truth

Markdown files are the user's durable data.

The Vault can always be rebuilt from the contents of the vault folder.

---

## Build runtime knowledge

The Vault converts Markdown into runtime objects.

These runtime objects exist only while the vault is open.

They can always be recreated by scanning the vault again.

Examples include:

- Pages
- Folders
- Assets
- Tasks
- Tags
- Links
- Embeds
- Knowledge Graph

---

## Derived knowledge

Tasks, tags, links, embeds, and graph relationships are derived from page content.

They can be rebuilt at any time.

---

## Independent of the UI

The Vault has no knowledge of editors, sidebars, tabs, or windows.

It represents knowledge only.

---

# Runtime Pipeline

The Vault builds runtime knowledge in four stages.

```text
Discover
    ↓
Understand
    ↓
Build
    ↓
Knowledge
```

## Discover

Find every file and folder that belongs to the vault.

Output:

- Scanned files
- Scanned folders

## Understand

Read each document and extract its meaning.

Examples:

- Frontmatter
- Headings
- Tasks
- Tags
- Links
- Embeds
- Block references

## Build

Convert the extracted information into runtime models.

Examples:

- Page
- Folder
- Vault

## Knowledge

Produce vault-wide projections and relationships.

Examples:

- Tag index
- Link index
- Embed index
- Knowledge graph

Knowledge is derived from every page in the vault rather than from a single page.

These projections are rebuildable and are never treated as the authoritative source of truth.

---

# Ownership

The Vault owns:

- Pages
- Folders
- Assets
- Derived knowledge
- Runtime models
- Runtime page identities

The Vault does not own:

- Document editing
- Open documents
- UI state
- Workspace state
- Persistence
- Version history
- Live document content
- Document revisions
- Undo / Redo

---

# Relationship to the Document Engine

The Vault and the Document Engine have different responsibilities.

```text
Markdown Files
        ↓
Vault
        ↓
Page
        ↓
Open Vault
        ↓
VaultRuntime
      ├── Vault
      └── Document Engine
              ↓
      DocumentRegistry
              ↓
      DocumentSession
```

The Vault maintains runtime pages. New pages are created by the application layer (`PageCreator`) and become part of the Vault once they are discovered or registered.

Every page has a stable identity that is independent of its filename or location.

The Vault is responsible for preserving that identity throughout the page's lifetime, even when the page is renamed or moved.

The Document Engine opens those pages for editing, manages live document state, and persists committed changes back to Markdown.

The Vault remains responsible for representing the current state of the knowledge space.

The Document Engine is responsible for creating, editing, and committing live document state before those changes are reflected back into the Vault.

---

# Design Invariants

1. Markdown files are the durable source of truth.
2. The Vault can always be rebuilt from the vault folder.
3. The Vault never edits Markdown directly.
4. Runtime knowledge is derived from Markdown.
5. Runtime objects exist only for the lifetime of an opened vault.
6. Page identities remain stable even when pages are renamed or moved.
7. Knowledge projections are rebuildable.
8. The Vault is independent of the UI.
9. The Vault is independent of the Document Engine.
10. The Vault represents knowledge; the Document Engine manages editing.
