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
- `validateCustomPropertyName(lines, key, name, otherNames?)` → `'empty' | 'reserved' | 'unsupported' | 'taken' | null`. Names are trimmed (the parser's own key normalization). `reserved` is a case-insensitive match against `OWNED_FRONTMATTER_KEYS`. `unsupported` covers names this parser cannot read back as the same key (`:`, a line break, a leading YAML indicator such as `#` or `-`). `taken` is another key on the same page — compared ignoring letter case (amended: see "Amendment — adding custom properties"; `Priority` and `priority` cannot coexist), the property's own key never conflicting with itself, with an optional `otherNames` for names held only in the UI.
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
- `renameCustomProperty` enforces `taken` and `unsupported` in addition to the requested `empty`/`reserved` rules. `unsupported` prevents data loss in YAML; `taken` began as the same (exact match) and became product policy (case-insensitive) in the amendment below.
- §6's Public API listing still omits other existing methods (`updateDraftTitle`, `duplicate`, `commitEdit`, `flushAll`, `canRename`, the title/description edit-lifecycle methods, …). This ADR deliberately amends only the two metadata writes it concerns; reconciling the rest of the listing is a separate, documentation-only task.

## Why the chosen approach is preferred

It adds no new subsystem, no new `PersistenceOperation` kind, and no second representation of any frontmatter data. Every write still lands through the one Gate (`'save'` + metadata patch), every business rule sits in `PageOperations` with the UI only previewing it, and the one shared reserved-key set guarantees that "what the parser owns" and "what a custom property may not be renamed to" can never disagree.

## Amendment — case-insensitive system keys, preserved until edited

Frontmatter written outside Clutter often capitalizes keys (`Aliases:`, `Created:`). These are now recognized as the system property they name, with three distinct pieces of state:

1. **Identity** — `matchSystemKey(rawKey)` (`ownedFrontmatterKeys.ts`) maps a key to its canonical system key by an exact normalized comparison: trimmed, case-insensitive (`Aliases`, `ALIASES`, `aLiAsEs` → `aliases`). Never fuzzy or semantic: `Date Created` stays a custom property. The parser handles the key under its canonical name, so it is never surfaced as a custom property, and differently-cased aliases take part in link resolution. One exception: the retired `type` key matches only exactly, because the parser recognizes it solely to drop it — a user's own `Type:` stays a preserved custom key rather than being deleted on save.
2. **Original spelling** — `PageMetadata.frontmatterKeySpellings` (canonical key → the file's spelling, only for keys spelled differently), taken from the reparsed file like `unownedFrontmatter`. `FrontmatterSerializer.serializePage` writes each system key under that spelling, so opening a note or saving an unrelated change never rewrites it.
3. **Edited** — `PageOperations.updateMetadata()` drops the spelling entries for exactly the properties in its patch, so the first intentional edit of a property writes its canonical key; other properties keep their spelling.

Reserved custom-property names use the same registry, case-insensitively (`isReservedPropertyName`). Clutter has no `lastEdited` key — its system key for that is `modified`.

## Amendment — dismissable list pills

Every list Property's pills are dismissable, like Aliases': the system Tags (removing that tag from frontmatter `tags` through `updateMetadata()`; Tags gains no add), and list custom properties through `PageOperations.removeCustomPropertyItem(pageId, key, index, value)`. That method follows `renameCustomProperty()`'s shape — `removeCustomListItem` (`customFrontmatter.ts`) removes only that item's text, every other line byte-identical; the Gate's `'save'` with a metadata patch; this page only — and refuses, with no write, when the item at `index` no longer has `value` (the file changed since it was shown). Custom property values otherwise stay read-only (superseded: see "Amendment — adding custom properties").

## Amendment — Tags is editable

Supersedes "Tags gains no add" above. The system Tags Property is fully editable (add and remove) whenever the host supplies `onCommitTags` and the page isn't archived: `buildPageProperties` marks it `editable: true`, and the existing `TagPropertyValue` editor commits the page's complete frontmatter `tags` through `PageOperations.updateMetadata(pageId, { tags })` — the same Gate-backed write the dismiss button already used, so there is no new write path. Autocomplete is the editor's own `createTagSuggester`. Only frontmatter `tags` change; inline `#tags` in the body are never touched. Editability remains an explicit adapter decision, not inferred from the `tag` type.

## Amendment — adding custom properties

Users can add a custom property from the Properties section's "+ Add a property" row (see "Amendment — the "+ Add a property" row" below), and every custom value is editable. All of it extends the existing custom-property infrastructure; no schema, store or write path is added.

**Typed empties.** A custom property's type is still never stored — it is inferred from how its value is written. An empty value has nothing to infer from, so the types that can be empty and are not text carry theirs as a trailing YAML comment on the key line: `due: # date`, `estimate: # number`, `site: # url` (a null to every other YAML reader, and kept byte-identical on later saves). An empty list is `key: []` and reads as an empty list (so removing the last list item empties the list rather than removing the property), an empty text value is `key:`, and a boolean has no empty state (unchecked is `false`). Clearing a typed scalar therefore never turns it into text. A comment that is not one of these three hints is just text, as before. This is the smallest representation that keeps the type without a parallel definition system: the key line is still the one source of truth.

**Writes.** `PageOperations` gains `addCustomProperty(pageId, name, property)` (appends one property after every existing line, validated, written so it reads back as exactly its type) and `setCustomPropertyValue(pageId, key, type, value)` (replaces one scalar's value; `null` clears it keeping its type), beside the existing `setCustomPropertyList`, `renameCustomProperty` and `removeCustomPropertyItem`. All five share one private `saveCustomFrontmatter`: the archived/unknown-page guard, then the Gate's `'save'` with a metadata patch carrying this page's new preserved frontmatter lines — this page only, every other line byte-identical, no new Gate kind. Values are spelled by `formatCustomScalar` and refused unless they read back as the declared type; a text value that would read as another type (`42`, a date, a URL) is double-quoted to stay text, and a URL is stored as an absolute `http(s)` URL (`toCustomUrl`: a bare domain gains `https://`, anything else — an email, `mailto:` — is not storable as a URL).

**One name rule, case-insensitive.** `validateCustomPropertyName` is the single rule for adding and renaming: non-empty, not a system key in any case, readable as a key, and unique among the page's custom keys **ignoring letter case**. A property may change only its own letter case. Existing files that already hold two keys differing only by case are left alone; the rule applies to names being added or changed.

**Draft rows.** "Add properties → a type" adds an unnamed row to the Properties list — transient UI state (`useCustomPropertyDrafts`), dropped when the page changes, never persisted. Its name field takes focus; a valid, unique name persists the property at once through `addCustomProperty` (empty and typed, as above); Escape, an empty name, or a rejected name when focus leaves removes the row. The type is chosen first and never asked for again. The list (`AddPropertyMenu`) shows the custom types from the property type registry (`label`/`custom` on each definition) and any system properties the host reports as available; it holds no list of its own. The item is offered whenever the host supplies `onAddCustomProperty` (not for an archived page), and unlike Emoji, Cover image and Description it is never used up. Which system properties can be available — per-note hiding and showing — is not part of this amendment and is the next design step.

**Editability stays explicit.** Custom text, number, boolean, date and URL values are editable only when the host supplies `onSetScalarValue` and the page is not archived; lists when it supplies `onCommitListValue`; a type never implies editability.

## Amendment — system property terminology and stored identity

User-facing terminology for the system timestamps is **Created**, **Last edited** and **Last opened**; the older wording ("Modified", "Updated", "Date created", "Date updated") is retired everywhere it was shown. Internal names are unchanged: the frontmatter key stays `modified` (and `created`), the model field stays `updatedAt`, and the collection views keep persisting `lastOpened` / `created` / `updated`.

The labels are defined once, in the system property definitions (`core/properties/systemProperties.ts`, `systemPropertyDefinitions` / `systemPropertyLabel`), keyed by the canonical internal key (`tags`, `aliases`, `created`, `modified`, `lastOpened`). Every user-facing place reads from there rather than writing its own string: `buildPageProperties` (the Properties list rows), the Add properties menu (which is handed system properties labelled from the same definitions), and the collection views (`collectionFieldLabel`, which says that the collection's `updated` field is the `modified` Property) for the Table headers and the Properties and Sort by menus.

**Stored identity is the key, never the label.** Anything persisted about a system property — including the per-note show/hide of system properties, once designed — must store the canonical key (`modified`), not its display wording ("Last edited"), so that changing UI copy can never invalidate stored configuration. `Last opened` is defined but not yet a Property on the page's Properties list.

## Amendment — which properties a note shows (`properties.visible`)

Nothing is shown by default. A note shows a Property only when its **canonical key** is listed in its own frontmatter:

```yaml
properties:
  visible:
    - tags
    - Due date
```

- **Keys, never labels.** The entries are canonical keys — `tags`, `aliases`, `created`, `modified` for the system Properties (`modified` is shown as "Last edited"; there is no `lastEdited` key) and a custom property's actual frontmatter key. `lastOpened` is a collection-view field, not note metadata, so it is never listed. Renaming UI copy can never invalidate stored configuration.
- **Absent means none.** No `properties.visible` shows no Properties; there is no migration and no default list. The Properties block is omitted entirely while nothing is shown.
- **Separate from existence and value.** Visibility only decides what is listed. A property's frontmatter value is untouched whether or not it is shown, and a listed custom key that is not in the frontmatter shows nothing. Rows follow the list's order — the order the properties were added.
- **Option B: preserved raw lines.** `properties` is a *reserved raw key* (`RESERVED_RAW_FRONTMATTER_KEYS`), deliberately **not** in `OWNED_FRONTMATTER_KEYS`: the flat, line-based `FrontmatterParser` gains no nested-YAML support and keeps capturing its lines, which `FrontmatterSerializer` writes back byte-identical like every other preserved line. `propertyVisibility.ts` reads and writes the `visible` list from `PageMetadata.unownedFrontmatter` — derived on demand, never a second representation, the same as custom properties. Anything else under `properties:` is preserved untouched. `properties` is never listed as a custom property and cannot be used as a custom property name, in any letter case.
- **Show, then hide.** `PageOperations.showProperty(pageId, key)` appends a system key or the key of an existing custom property (never reordering the entries already there; already shown is a no-op; a missing custom key or the reserved key is refused). A new custom property's key is appended in the same save that creates it (`addCustomProperty`), and renaming a shown custom property rewrites its entry in place in the same save (`renameCustomProperty`), so it stays shown. Hiding is `hideProperty` (see "Amendment — a property's menu"). All of them are the existing `saveCustomFrontmatter` — one Gate `'save'` with a metadata patch, this page only. There is no `setPropertyVisibility`: show and hide are separate, explicit operations, and per-note ordering beyond insertion order is the next design step.
- **Add properties.** The Add properties menu (opened from the section's "+ Add a property" row) lists, in groups: the system Properties not shown (labelled from the system property definitions), the custom properties that exist but are not shown (by their actual key), and the new custom types (from the property type registry). Choosing an existing property shows it (`showProperty`); choosing a type adds a draft row as above, made visible once named.

## Amendment — a property's menu: Hide, Clear, Delete

Hovering a Property's name replaces its type icon with a horizontal-dots button that opens a menu of **Hide**, **Clear**, a divider, and **Delete**. Each action is offered only where it applies, and each is supplied by the adapter (`buildPageProperties`) — never inferred from a type or name:

- **Hide** (every listed Property, system or custom): `PageOperations.hideProperty(pageId, key)` removes only that canonical key from `properties.visible` (`removeVisibleProperty`). The rest of the list keeps its order, the `visible:` line stays (empty if that was the last entry), every other line is byte-identical, and the Property's value is untouched — so it comes back, under "Hidden", in Add properties. Hiding something not listed is a no-op.
- **Clear** (custom properties, Tags, Aliases): empties the value and keeps the Property. It reuses the existing writes — a scalar via `setCustomPropertyValue(…, null)` (a typed empty such as `due: # date`, never a fall back to text; a boolean becomes `false`), a list via `setCustomPropertyList(…, [])`, Tags and Aliases via `updateMetadata`. Created and Last edited are system-maintained and cannot be cleared.
- **Delete** (custom properties only): `PageOperations.deleteCustomProperty(pageId, key)` removes the property's lines (`removeCustomProperty`) and its `properties.visible` entry in the same single save. A system Property, a key that isn't a custom property, and the reserved `properties` key are refused with no write. It takes effect immediately, with no confirmation or undo (the architecture has no undo; a hidden property can be shown again, a deleted one cannot).
- **Drafts and archived pages:** an unnamed draft row has no menu (nothing exists yet), and an archived page offers no actions.

## Amendment — the "+ Add a property" row

The Properties list always ends with a `+ Add a property` row (`AddPropertyRow`, passed to `PropertyList` as its `footer`), so adding is possible even when nothing is shown. It is absent only on an archived page. It is the only way to add properties: the title controls have no add pathway (see "Amendment — the Properties section: `properties.show`").

The interaction is deliberately minimal — there is no intermediate draft state:

1. **Click the row.** The Add properties menu opens, anchored to it. The row itself never changes: no replaced label, no blank or placeholder row, no input, nothing focused. It is visually stable at all times.
2. **Choose a property.** An existing property (a system one, or a hidden custom one) is shown (`showProperty`). A new custom type starts the draft custom property: its row appears above the `+ Add a property` row with that type's icon and a focused "Property name" field, caret at the start, ready to type. Naming it persists it as before (typed empty, key added to `properties.visible` in the same save); Escape or an empty/rejected name abandons it with nothing written.
3. **Dismiss the menu** (Escape, a click outside) without choosing: nothing changes and nothing is written.

The menu closing after a choice never returns focus to the row, so a draft's name field keeps the focus it just took. This amendment adds no write and no persistence path, and no Hide behavior.

## Amendment — the Properties section: `properties.show`

Whether a note shows its Properties section at all is a second, independent setting under the same reserved `properties` key:

```yaml
properties:
  show: true
  visible:
    - tags
    - created
```

- **`properties.show`** controls the whole section. `show: true` shows it; `show: false` or no `show` hides it — hidden is the default, so nothing is written to establish it (a note is never given `show: false` just to say so). The section is the Properties list and its "+ Add a property" row; hidden, neither is rendered.
- **`properties.visible`** keeps its meaning: which individual properties the section lists. The two never affect each other: toggling the section leaves `visible` byte-identical, and adding, hiding, renaming or deleting properties leaves `show` alone. Here the section is shown and lists only Tags and Created.
- **Same Option B storage.** `show` is read and written by `propertyVisibility.ts` (`readPropertiesSectionVisibility`, `setPropertiesSectionVisibility`) from the preserved raw lines — the flat `FrontmatterParser` is unchanged, `properties` stays a reserved raw key, and anything else under `properties:` is preserved byte-identically. Only a direct child `show` counts. An existing `show:` line is rewritten in place (spelling, indentation and any trailing comment kept); showing with none adds `show: true` as the block's first entry (creating the block if needed); hiding with none changes nothing. `show` and `visible` are never listed as custom properties (they live inside the reserved block), though a custom property of the same name remains possible.
- **The write.** `PageOperations.setPropertiesSectionVisibility(pageId, show)` — the existing `saveCustomFrontmatter` (one Gate `'save'` with a metadata patch, this page only, an archived page refused). Setting what it already is writes nothing.
- **The title control.** The page header's More actions menu has one item for it: **Show properties** while the section is hidden, **Hide properties** while it is shown. It only changes `properties.show` — it opens no picker and never touches `properties.visible`. It replaces the earlier title-section "Add properties" pathway, which is removed rather than kept alongside. Hiding the section also drops any unnamed property draft, so it cannot reappear when the section is shown again. An archived page's section can't be toggled (it still shows if its file says `show: true`).

