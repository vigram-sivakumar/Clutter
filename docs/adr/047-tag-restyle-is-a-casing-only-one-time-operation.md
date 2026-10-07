# ADR-047: `TagOperations.restyle()` is a casing-only, one-time operation

**Status:** Accepted

## Context

The Tags sidebar's Tidy up menu offers a Style group (lowercase, Sentence case, Title Case) to clean up how existing tags are cased. Tag identity is already case- and separator-insensitive (`normalizeTagName`), so this changes only how a tag is *spelled* in Markdown and in `.clutter/tags.json`.

## Decision

`TagOperations.restyle(style)` is the one owner of this capability:

- **Casing only.** `applyTagStyle()` (next to `serializeTagName` in `vault/models/Tag.ts`) re-cases words and keeps every separator (`-`, `_`, whitespace) exactly as written. Three styles, no others; no acronym exclusions.
- **One-time action, never a setting.** The style is not stored (no field in `tags.json`, no preference) and has no effect on creating a new tag, which stays lower-case via `checkNewTagName()`/`declare()`.
- **One scan, only affected notes written.** It reuses `rewriteNotes` (the rename/remove planned batch): inline `#tags` and frontmatter `tags`, archived notes included, open editors' unsaved text via `mutateBody`, per-note changed-on-disk safeguard, partial results returned (`TagBatchResult`) and only logged — no UI for them. Idempotent: an already-matching vault reads and writes nothing.
- **Definitions** are written once through `TagMetadataStore`, and the spelling-keyed Configure/expansion state moves with the new spelling, both only when the batch is complete (as with `rename()`).

## Consequences

No new persistence, subsystem or write path. Profiling, not speculation, decides any further optimization (a note needing both frontmatter and body changes is written twice, as in rename).
