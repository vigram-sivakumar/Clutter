Architecture Status

Version: 1.0
Status: Frozen

Changes to the architecture should be driven by implementation experience rather than speculation.

# Arc v2 – Vault Implementation

## Goal

Transform the original Vault implementation into a clear, phase-based architecture that separates responsibilities and provides a stable foundation for future features.

Arc v2 focused on converting Markdown files into runtime knowledge.

It deliberately excluded document editing, UI state, and persistence concerns, which are introduced in Arc v3.

---

# Architecture Outcome

The Vault now follows a four-stage pipeline.

```text
Discover
    ↓
Understand
    ↓
Build
    ↓
Knowledge
```

Each stage has a single responsibility and produces the input for the next stage.

---

# Phase 1 – Discover

## Objective

Locate every file and folder that belongs to the vault.

## Implemented

- `VaultScanner`
- `VaultScanResult`
- File system abstraction (`VaultFileSystem`)
- Local file system provider

## Output

- Scanned pages
- Scanned folders

No parsing or document understanding occurs during this stage.

---

# Phase 2 – Understand

## Objective

Read each discovered document and extract its meaning.

## Implemented

- `DocumentLoader`
- `MarkdownParser`
- `FrontmatterParser`
- Markdown analysis
- Frontmatter analysis
- Extractors

### Extracted facts

- Frontmatter
- Headings
- Tasks
- Tags
- Links
- Embeds
- Aliases
- Block references

## Output

- `ScannedPageAnalysis`

This stage understands documents but does not create runtime models.

---

# Phase 3 – Build

## Objective

Convert analysed documents into runtime objects.

## Implemented

- `PageBuilder`
- `VaultBuilder`
- `IdentityResolver`

## Runtime models

- `Page`
- `Folder`
- `Vault`

During this stage, every page receives a stable runtime identity.

That identity remains constant even if the page is renamed or moved.

The mechanism used to persist page identity is an architectural concern defined by the Vault architecture rather than the Build pipeline.

---

# Phase 4 – Knowledge

## Objective

Produce vault-wide knowledge derived from runtime pages.

## Implemented

- `TaskBuilder`
- `TagBuilder`
- `LinkBuilder`
- `EmbedBuilder`
- `KnowledgeGraphBuilder`
- `PageIndex`
- `LinkResolver`

## Output

- Task projections
- Tag projections
- Link projections
- Embed projections
- Knowledge graph

Knowledge is derived from the entire vault rather than individual pages.

These knowledge projections represent the Vault's current understanding of the knowledge space.

During editing, the Document Engine produces live `PageFacts` from committed document revisions.

After persistence, the Vault reconciles those changes so its knowledge projections reflect the latest durable state.

---

# Runtime Models

Arc v2 established a clear separation between parser models and runtime models.

Parser models exist only while understanding documents.

Runtime models are used by the rest of the application.

Examples include:

- Vault
- Page
- Folder
- Task
- Tag
- Link
- Embed
- Graph

---

# Occurrences

Occurrences represent where information appears inside pages.

Implemented occurrence models:

- TaskOccurrence
- TagOccurrence
- LinkOccurrence
- EmbedOccurrence

Occurrences are distinct from vault-wide projections.

---

# Folder Organisation

The Vault is organised around responsibilities rather than technologies.

```text
vault/
├── discover/
├── understand/
├── build/
├── knowledge/
├── models/
├── providers/
└── parsers/
```

Every phase exposes barrel (`index.ts`) exports.

---

# Major Decisions

- Discover, Understand, Build, and Knowledge are architectural responsibilities.
- Parsing and runtime model construction are separate concerns.
- Runtime models are independent of parser models.
- Occurrences represent locations within pages.
- Knowledge projections are rebuildable.
- Stable page identities are independent of filenames.
- The Vault represents knowledge only and does not edit documents.
- The Vault remains independent of the UI.

---

# Success Criteria

Arc v2 is complete when:

- Markdown can be scanned into runtime models.
- Runtime knowledge can be rebuilt from the vault.
- Knowledge projections are derived from runtime pages.
- The Vault remains independent of editing, persistence, and UI concerns.
- Arc v3 can build the Document Engine without changing the Vault architecture.
