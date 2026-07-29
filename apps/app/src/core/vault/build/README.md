

# Vault Build Pipeline

## Purpose

This package is responsible for constructing the immutable in-memory `Vault`
from files discovered on disk.

Its responsibility ends once the initial `Page` and `Folder` domain models have
been created.

## Current Pipeline

```text
Filesystem
    ↓
Vault Scanner
    ↓
PageBuilder
    ↓
Vault
```

## Editing Is Not Part of This Pipeline

Editing an existing page is a different responsibility from discovering pages.

A page edit starts with an existing immutable `Page` together with newly
committed Markdown and must produce a new immutable `Page` with refreshed
analysis.

That responsibility intentionally does **not** belong to `PageBuilder`.

## Planned Rebuild Pipeline (Arc 5.x)

```text
Existing Page
        +
Committed Markdown
        ↓
Page Rebuild Pipeline
        ↓
Refreshed Analysis
        ↓
New Immutable Page
        ↓
Vault.replacePage(...)
```

This rebuild pipeline will be reused by:

- Markdown edits
- Rename
- Move
- Archive / Restore
- Filesystem watcher
- Conflict resolution
- Future re-indexing

Keeping rebuilding separate from discovery preserves the single responsibility
of `PageBuilder` while providing one canonical path for refreshing immutable
Pages.