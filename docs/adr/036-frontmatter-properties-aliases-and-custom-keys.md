# ADR-036: Frontmatter Properties — Owned `aliases`, Derived Custom Properties, and `renameCustomProperty()`

**Status:** Accepted (implemented on `main`: `76c4db4`, `7f28734`, `3f28d86`, `3882d55`)

## Context

The page Properties panel (`components/property-list/`, fed by `app/layouts/page/buildPageProperties.ts`) grew from read-only display into editing, one Property at a time. Two of those steps changed what the Vault Ingest and `PageOperations` contracts must cover, and neither was reflected in `architecture-specification.md`:

1. **Aliases became editable.** `aliases` was parsed for link resolution (`Page.analysis.aliases`) but was *not* one of the keys Clutter writes: `FrontmatterParser` captured its raw lines into `PageFrontmatter.unownedLines` and `FrontmatterSerializer` wrote them back verbatim (`PageMetadata.unownedFrontmatter`). Editing aliases on top of that would have produced two writers of the same key — an edited list plus the verbatim old lines — or, if the verbatim lines were dropped, lost every alias written in a form the edit path didn't parse.

2. **Custom properties became visible and renamable.** Every frontmatter key Clutter doesn't own is preserved only as opaque raw lines. The user asked for custom properties' names to be editable inline, renaming one key in the current note's frontmatter only (`priority: high` → `importance: high`), keeping its value and type, never touching other notes, and rejecting names that collide — case-insensitively — with the canonical system keys.

Separately, §6's `PageOperations` Public API listing does not include `updateMetadata()`, although it has existed (and been referenced by §6's own Invariants) since the Cover Image / Description milestones. The new rename capability is a second metadata-shaped write the listing would also omit.

## Decision

### 1. `aliases` is an owned frontmatter key

- `aliases` joins `OWNED_FRONTMATTER_KEYS`. `FrontmatterParser` reads every form other tools write — block list, one-line flow list (`[a, "b, c"]`), a single scalar, quoted values — into `PageFrontmatter.aliases`; it is no longer captured into `unownedLines`.
- `PageMetadata.aliases?: readonly string[]` is the editable value. `PageBuilder`/`PageRebuilder` (via `resolvePageMetadata`) take it **from the parsed file** — an absent key is an empty list, so an external removal is never resurrected (unlike `tags`, which preserves the previous value on an absent key).
- `FrontmatterSerializer` writes it as a block list after `tags`, omitted while empty, quoting only values a plain YAML scalar would misread (shared quote/unquote rules: `ingest/frontmatter/frontmatterStringValue.ts`).
- `Page.analysis.aliases` stays — derived from the same parsed key, for link resolution — so the two can't disagree after any rebuild.
- `EditablePageMetadata` gains `aliases`; it is written through `updateMetadata()` like `tags`. Aliases are **not unique**: no uniqueness rule exists anywhere (a decision made after a short-lived guard was implemented and then removed).

### 2. `OWNED_FRONTMATTER_KEYS` is the one canonical system-key set

Moved to `ingest/frontmatter/ownedFrontmatterKeys.ts`. `FrontmatterParser` uses it to decide parse-vs-preserve; custom-property validation uses it as the reserved-name set. System Properties' user-facing labels ("Created", "Aliases") are presentation only, defined in `buildPageProperties`; identity is always the canonical key.

### 3. Custom properties are derived, never stored

`ingest/frontmatter/customFrontmatter.ts` holds pure functions over the preserved raw lines:

- `readCustomProperties(lines)` → `{ key, type, value }[]` in file order, the type inferred from how the value is written (number, `true`/`false`, ISO date/timestamp, `http(s)://` URL, block or flow list, else text; quoted values are text). Nothing is persisted about a custom property beyond its raw lines.
- `validateCustomPropertyName(lines, key, name)` → `'empty' | 'reserved' | 'unsupported' | 'taken' | null`. Names are trimmed (the parser's own key normalization). `reserved` is a case-insensitive match against `OWNED_FRONTMATTER_KEYS`. `unsupported` covers names this parser cannot read back as the same key (`:`, a line break, a leading YAML indicator such as `#` or `-`). `taken` is another key on the same page (exact match — YAML keys are case-sensitive; two equal keys would lose a value).
- `renameCustomProperty(lines, key, name)` rewrites only the key text of that key's line; its value lines and every other line stay byte-identical.

### 4. `PageOperations.renameCustomProperty(pageId, key, name)`

A dedicated facade method, not a widening of `updateMetadata()`:

- Validates with `validateCustomPropertyName` (the authoritative guard; the Properties UI calls the same function first only to give reject feedback). Rejects — with no write — on any problem, an archived page, or an unknown page; an unchanged name is a no-op.
- Writes through the Gate's existing `'save'` kind with a metadata patch `{ unownedFrontmatter: renamed }` — exactly the shape `updateMetadata()` already uses. No new `PersistenceOperation` kind; no other page is read or written.

### 5. §6's Public API listing records both metadata writes

`updateMetadata(pageId, patch: Partial<EditablePageMetadata>)` and `renameCustomProperty(pageId, key, name)` are added to the listing, with an invariant for the rename.

## Alternatives Considered

- **Keep `aliases` unowned and edit its raw lines.** Rejected: every consumer would need to parse and re-emit raw YAML, and the editable value would have no domain representation — the exact "projection is the only place a value lives" shape `ARCHITECTURE_RULES.md` rule 8 forbids in reverse.
- **Store custom properties in a new `PageMetadata.customProperties` field.** Rejected: a second representation of data the raw lines already hold, which must then be kept in sync on every parse, external edit and save. Deriving on demand keeps one source of truth and makes "a rename keeps the value byte-identical" true by construction.
- **Rename via `updateMetadata({ unownedFrontmatter })`.** Rejected: it would let any caller replace a page's preserved frontmatter wholesale, and leave the reserved-name rule to each caller — a business rule outside its facade (rule 5).
- **Validate reserved names against UI labels.** Rejected per the request: labels are presentation and can change; the canonical keys are what would actually collide on disk.
- **A vault-wide property schema (Obsidian-style `types.json`) for custom-property types.** Deferred: inference from the written value is enough for read-only display and rename. A typed schema is a separate decision for when custom property *values* become editable.

## Consequences

- An existing note's first save after this change moves `aliases` after `tags` and may re-quote values; alias values themselves are unchanged.
- Custom-property values remain read-only; nested mappings display as text. Editing values, adding properties, and typed schemas are future work that will need their own decision (likely including a schema ADR).
- `renameCustomProperty` enforces `taken` and `unsupported` in addition to the requested `empty`/`reserved` rules — both prevent data loss in this parser and YAML respectively, not product policy.
- §6's Public API listing still omits other existing methods (`updateDraftTitle`, `duplicate`, `commitEdit`, `flushAll`, `canRename`, the title/description edit-lifecycle methods, …). This ADR deliberately amends only the two metadata writes it concerns; reconciling the rest of the listing is a separate, documentation-only task.

## Why the chosen approach is preferred

It adds no new subsystem, no new `PersistenceOperation` kind, and no second representation of any frontmatter data. Every write still lands through the one Gate (`'save'` + metadata patch), every business rule sits in `PageOperations` with the UI only previewing it, and the one shared reserved-key set guarantees that "what the parser owns" and "what a custom property may not be renamed to" can never disagree.
