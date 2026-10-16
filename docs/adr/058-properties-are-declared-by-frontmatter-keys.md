# ADR-058: Properties are declared by their frontmatter keys — `showProperties` replaces `properties.visible` and `properties.show`

**Status:** Accepted (product direction, Vigram, 2026-10-16). Clean break: Clutter has no users yet, so there is no compatibility reader and no migration for the old format. Supersedes the `properties.visible` / `properties.show` parts of ADR-036's final amendment.

## Context

Which properties a note listed was configuration kept beside the data: a reserved `properties:` block with a `visible` list (the system properties a note shows) and `show: false` (hide the section), rewritten by every property change. The keys themselves already said what a note has — a custom property was listed because its key existed, and the physical order of the entries was the list's order — so the `visible` list only duplicated, for four system keys, what a key's presence says. And with the dates now coming from the file (ADR-057), `created` / `modified` no longer need to hold a date.

## Decision

1. **A property is declared by its key.** A system property is listed when its canonical key is one of the file's top-level entries (`PageMetadata.frontmatterEntryOrder`, which the parser records and the serializer follows):
   - `created: true` declares Created and `modified: true` declares Last edited. Their values come exclusively from the file's birth / modification time (ADR-057); the key is written as `true` and its value is never read.
   - `tags` and `aliases` are declared by their keys, **including when empty** (`tags: []`).
   - A custom property is listed because its key exists.
   The order of the entries is the order of the list.
2. **`showProperties: false` hides the whole section** and nothing else — no key or value is touched. Absent, or any other value, means shown (default `true`); the key is removed to show, `true` is never written. It is a presentation setting, not a property: a preserved raw line, a reserved raw key (never a row, never a custom-property name, any letter case). No nested `properties` mapping.
3. **Adding / removing.** Adding a system property declares its key (appended after the entries: `tags: []`, `aliases: []`, `created: true`, `modified: true`); any property change also lifts `showProperties: false`. Removing one deletes its entry **and its value** (tags/aliases emptied; the dates have no value to clear). Delete all removes every custom property and every declared system property with its value, plus `showProperties`. Body `#tags` are unaffected.
4. **Removed, not migrated.** `properties.visible`, `properties.show`, `properties.order`, their readers/writers (`addVisibleProperty`, `removeVisibleProperty`, `normalizePropertiesConfig`, `adoptLegacyOrder`, `removePropertiesBlock`, …), the "configuration block goes last" rule and the date-value handling for `created` / `modified` (`PageFrontmatter.created` as a string, `PageMetadata.createdAt` / `updatedAt`) are gone. `properties` is now an ordinary custom-property name. A file that still has `created: <date>` is read as declaring Created and rewritten as `created: true` by its next save; a file with a `properties:` block shows it as a custom property.

## Consequences

- **A note made in Clutter declares no dates** (amended 2026-10-16: `PageCreator` writes neither `created` nor `modified`; creating or persisting a note never lists either). Created and Last edited appear only when added through Properties or inherited from a template that declares them; the "Add a property" title control appears only on a note with none of the keys.
- **Remove is destructive for system properties** (it used to be "unlist only"): Removing Tags deletes the note's frontmatter tags.
- A draft's first property change persists the draft, then declares the property against the file's own order. Listing a system property (e.g. Created) on a draft writes only that key (the two dates are independent).
- `PARSER_VERSION` is 4 (the parser no longer reads `created` / `modified`).

## Alternatives considered

- *Keep a read-only legacy reader and migrate on first edit* — built, then removed at the product owner's direction: it was code and tests for data that does not exist yet.
- *Keep `visible` and also declare by key* — two sources of truth for four keys.
- *`properties: { show: false }`* — a nested mapping for one boolean; a top-level `showProperties` keeps the flat parser flat.
