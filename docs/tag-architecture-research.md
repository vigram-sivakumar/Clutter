# Tag Architecture Research — Clutter

**Status:** Research report / recommendation. Not an ADR yet, no code changed. Several recommendations amend frozen contracts and need an ADR (called out in §14).
**Date:** 2026-10-07
**Method:** Read the current tag code (`TagExtractor`, `tagScanner`, `tagSyntax`, `TagBuilder`, `TagOperations`, `Application.attachVault`, `FrontmatterParser`, `VaultSyncCoordinator`, the Rust `vault_watcher.rs`) and checked the external claims against primary sources (links in §15). Where a claim is from memory rather than a fetched source, it is marked **(unverified)**. Performance numbers are **reasoned estimates, not measurements**; §9 gives the benchmark that would settle them.

---

## 0. The headline: most of the proposal is already built, and the real problems are elsewhere

The proposal in the brief ("Markdown = usage, `.clutter/tags.json` = configuration, index = derived") is **already Clutter's shipped design**:

| Proposal element | Already in the code |
|---|---|
| `.clutter/tags.json` | Yes. `{"tags": {"<normalized name>": {icon?, favorite?}}}`, owned by `TagOperations`, outside the Gate (rule 2 `.clutter/*` carve-out) |
| Name-based identity | Yes. `normalizeTagName()` is the single identity function |
| Markdown is the source of tag usage | Yes. `TagBuilder` derives `Tag[]` from `page.analysis.tags` + `page.metadata.tags` |
| Derived, rebuildable projection | Yes. `Vault.tags()` is rebuilt from pages; nothing persisted (ADR-004) |
| Frontmatter and inline are one logical tag | Yes. Same `normalizeTagName` key; independent sources (`PageMetadata.tags` is never merged with body tags) |
| Rename rewrites Markdown | Yes, `TagOperations.rename()` |

So the question is not "which architecture", it is **"what is wrong or missing in the one we have"**. Findings, in order of severity (all verified by reading the code):

1. **`rename()` is not correct.** (a) It rewrites with its own regex and no code-range exclusion, so `#old` inside fenced code or an inline code span is rewritten. The extractor skips fenced code, so these are the same occurrences the sidebar does not count. (b) It selects affected pages only from `page.analysis.tags`, so **frontmatter `tags:` entries are never renamed** and a note whose only use is frontmatter is not touched at all. (c) It does not move the `tags.json` entry, so a renamed tag **loses its icon/favorite**. It does move `CollectionViewConfigStore` and `TagExpansionStore` state, so this one is an oversight. (d) `Promise.all` over every affected page: no ordering, no partial-failure report, no check that the file hasn't changed since the plan was made.
2. **Three hand-maintained copies of the tag grammar**, deliberately not shared (`TagExtractor.ts` regex, `tagScanner.ts`, `TagOperations.ts` regex), and they already disagree with the editor parse tree: the extractor indexes `#tag` inside **inline code spans and indented code blocks** (it only excludes `FencedCode`; `allCodeRanges()` exists in `markdownCodeRanges.ts` and is used only by `ImageReferenceExtractor`), while the editor's Lezer `Tag` node never fires inside `InlineCode`. Result: the sidebar can count a tag the editor doesn't render as one. The comments justify duplication by the layering rule (ingest must not import from features). That reasoning is right, but the fix is to move the single grammar **down**, not to copy it sideways (§5).
3. **The "tags exist without usage" requirement is explicitly contradicted by `TagBuilder`**, whose doc comment states a metadata-only entry "never manufactures a Tag". Supporting declared tags is a contract change to the projection (§6, §14).
4. **`tags.json` robustness is thin.** `Application.attachVault` runs a bare `JSON.parse` at boot, so a corrupt file **fails vault attach**. Writes are non-atomic `plugin-fs` `writeFile` calls (acknowledged out of scope in `durability-model.md`). `updateMetadata()` read-modify-writes with no queue (unlike `workspace.json`, which got one in ADR-035 §9), so two quick edits can lose one. The parse/normalize logic is duplicated between `Application` and `TagOperations`. External edits to `tags.json` are never noticed (no `.clutter` handling anywhere under `core/vault/sync/`).
5. **Grammar is narrower than every comparable app and silently truncates.** `[A-Za-z0-9_-]+` means `#café` becomes the tag `caf`, `#日本語` is not a tag, `#foo/bar` becomes `foo`. Silent truncation is worse than either accepting or rejecting.
6. **`normalizeTagName` folds `-`/`_` to a space** (`design-system` ≡ `design_system` ≡ `Design System`). That is a deliberate product decision and is consistent across frontmatter and inline, so I keep it, but it is the one place Clutter diverges from Obsidian's identity model (where `-` and `_` are distinct characters), and it has no Unicode normalization.

What I would **not** do: introduce tag IDs, SQLite, per-tag files, a persisted tag index, or a parallel "tag subsystem". Everything needed fits the existing facade (`TagOperations`), the existing projection (`TagBuilder`), and the existing watcher.

---

## 1. Executive recommendation

1. **Keep `.clutter/tags.json`** as the single tag-configuration file. Harden it (schema v2, atomic write, serialized writes, tolerant load, external reload). Don't switch to YAML/SQLite/per-tag files.
2. **Keep name-based identity.** Normalized name is the key; no internal tag IDs.
3. **One tag grammar, in the lowest layer** (`core/vault/ingest/`), implemented as the existing Lezer `MarkdownConfig` and used by **both** the editor and the extractor. Extraction walks the parse tree for `Tag` nodes. Delete the three regex copies. This makes code spans, escapes, links, and HTML correct by construction.
4. **Introduce "declared tags"** (an entry in `tags.json` that is intentionally unused) as a first-class state, and have the projection be `used ∪ declared`.
5. **Make rename a planned, verified batch** built on the same grammar, covering inline **and** frontmatter **and** the `tags.json` key, with an explicit merge mode. No undo (consistent with `durability-model.md`); the operation is idempotent and resumable instead.
6. **Do not build a persisted index now.** The Vault is already an in-memory projection (ADR-004, rule 13: no speculative machinery). If scan time measures too high, the first persisted cache should be a generic **per-page analysis cache** shared by tags/tasks/links/search, stored **outside the vault** (app-data dir keyed by vault id), not tag-specific and not necessarily SQLite.
7. **Frontmatter and inline tags stay two sources of one logical tag.** No auto-sync between them.

I agree with the stated principle in §25 with two amendments (§12).

---

## 2. Markdown semantics (what the specs actually say)

### CommonMark / GFM
- `#tag` is **not a Markdown construct**. CommonMark's ATX heading rule requires "at least one space or tab" after the `#`s unless the heading is empty; the spec's own examples list `#5 bolt` and `#hashtag` as *not* headings. So `#design` is plain paragraph text at the block level and `# Heading` is a heading. There is nothing to disambiguate; **block parsing claims `# ` first, so the inline Tag parser never sees it.** This matches the existing locked decision in `editor-architecture-decisions.md`.
- Heading markers are block-level and win over inline precedence; a code span cannot rescue a line from being a heading. (`` `#x` `` at line start is still paragraph text with a code span, because there is no `# ` after the hash.)
- Backslash escapes (`\#design`): `\#` is an ASCII-punctuation escape → literal `#`. In Lezer this is an `Escape` inline element that consumes both characters, so the `Tag` parser (triggered by `#`) is never entered at that position. **Needs a regression test**, because the parser is called at each position and the order of `parseInline` entries matters.
- GFM adds Strikethrough, Table, TaskList, Autolink. None claim a bare `#`. Autolink URLs (`https://x.com/a#frag`) contain `#` mid-token; the "preceded by whitespace/line start" rule excludes them.

### How other apps define a tag
- **Obsidian** (fetched): letters, digits, `_`, `-`, `/` (nesting), and "commonly accepted Unicode characters, including emojis"; **must contain at least one non-numerical character** (`#1984` invalid, `#y1984` valid); no spaces; **case-insensitive matching, original casing displayed**; frontmatter tags must be a YAML list. The page does not document tag behavior in code; my recollection is that Obsidian ignores tags in code blocks/spans **(unverified)**.
- **Bear**: supports multi-word tags (`#multi word#`) and nested `#a/b` **(from memory; the FAQ URL I tried returned 404, unverified)**. The closing-`#` form is the only popular spec of "tags with spaces" and costs real ambiguity (`#a b #c`). Don't adopt it.

### Recommended inline grammar (Clutter)

A tag is `#` + a **run**, where:
- **Preceded by** start-of-line or whitespace (keep today's rule; it is what keeps URL fragments and `foo#bar` out). Also allow after `(`, `[` and `"`? **No**: keep it strict; widen only on a concrete complaint.
- **Run** = maximal sequence of `[\p{L}\p{N}\p{M}_-]` (Unicode letters, numbers, combining marks, `_`, `-`). `/` is **reserved**: if the run is immediately followed by `/` + more run characters, treat the whole token as **not a tag** rather than truncating (see below).
- **Validity after lexing:** at least one non-digit (Obsidian's rule; it also makes `#123` issue references and `#1` not tags); trim trailing `-` / `_`; max length (§11).
- Terminates at anything else, so `#design.` `#design,` `#design)` `#design:` keep trailing punctuation outside the tag.

Examples:

| Input | Result | Note |
|---|---|---|
| `#design` | tag `design` | |
| `#design-system`, `#design_system` | tags (same identity) | |
| `#Design` | tag, same identity as `design`, casing preserved for display | existing "first-typed wins" |
| `#123` | **not a tag** | Obsidian rule; avoids issue/PR refs |
| `#C++` | tag `C` | same as Obsidian; the `++` is text |
| `#foo/bar` | **not a tag** today; reserved for nesting | truncating to `foo` silently is the current bug |
| `#foo.bar` | tag `foo`, then `.bar` text | `.` is sentence punctuation; don't support |
| `#café`, `#日本語`, `#設計` | tags | needs `\p{L}` |
| `#🎨` | not a tag in v1 | emoji are `\p{So}`, not letters; display emoji lives in metadata (§3). Revisit only if users ask |
| `foo#bar`, `http://x/#a` | not tags | preceding-context rule |
| `` `#x` ``, fenced/indented code, `\#x` | not tags | falls out of the parse tree |

Nested tags (`#a/b`) should be a deliberate later feature, not a side effect: they change identity (hierarchy), sidebar (tree), rename (prefix rename) and merge semantics. For now, **rejecting the whole token** preserves a clean upgrade path (a note containing `#a/b` today is not mis-indexed as `a`).

---

## 3. CodeMirror 6 / Lezer: how to detect inline tags

Verified from the `@lezer/markdown` README and from the existing `tagSyntax.ts`:
- `MarkdownConfig.defineNodes` + `parseInline` is the supported extension point; `InlineParser.parse(cx, next, pos)` is called at positions whose char is a registered trigger, and returns `cx.addElement(cx.elt('Tag', from, to))`.
- **Limitation:** `InlineContext` "cannot see before its offset" (start of the current block's inline content). `tagSyntax.ts` already documents and handles this (`pos <= cx.offset` ⇒ valid start).
- The parser feeds the tree to the editor's incremental parsing (fragment reuse), so there is no cost model to manage in the editor: an edit reparses the affected block.

Evaluation of the options asked about:

| Approach | Verdict |
|---|---|
| Regex over the document (today's extractor, rename, scanner) | **Reject.** Correct only until the first construct it doesn't know about (inline code, indented code, HTML blocks, link destinations, escapes). Today it already disagrees with the editor |
| Regex + code-range exclusion (what the extractor half-does) | **Reject as a stopping point.** It's a re-implementation of "what is inline text" |
| Separate scanner (`tagScanner.ts`) + Lezer glue | **Keep only the pure `scanTag(text, offset)` function** as the lexer inside the parser. It's fine as the *token lexer*; it must not be a second *extractor* |
| Custom Lezer inline parser (`tagSyntax.ts`) | **Yes. This is the answer.** Already exists and already fixes the editor |
| Parser + scanner combined | Same as above: parser decides *where*, scanner lexes *what* |
| Custom block grammar / overlay | Unnecessary. Tags are inline |

**Critical consequence:** if the same `MarkdownConfig` is used in the ingest layer, the extractor becomes:

```ts
// core/vault/ingest/tag/tagSyntax.ts  (moved down from features/markdown/editor/codemirror/tag/)
// core/vault/ingest/extractors/TagExtractor.ts
extract(content) {
  const tree = markdownParserWithTags.parse(content);   // already parsed today for code ranges
  const out = [];
  tree.iterate({ enter: n => { if (n.name === 'Tag') out.push(occurrenceFrom(content, n.from, n.to)); } });
  return out;
}
```

- **Dependency direction is fine:** `@lezer/markdown` is a pure library; `tagSyntax` has no UI imports. The editor imports it from `core` (features → core is the allowed direction). The current "must not import upward" objection only argues against ingest importing from features, not against moving the grammar down.
- **No extra parse cost:** `markdownCodeRanges.ts` already runs a full `@lezer/markdown` parse per scanned page. Reuse one parse for code ranges, tasks, headings (ADR-032) and tags.
- `Tag` nodes inside `Link` text are legitimately tags (`[see #design](x.md)`). Inside `URL`/`Autolink`/`InlineCode`/`FencedCode`/`CodeBlock`/`HTMLBlock`/`HTMLTag`/`CommentBlock` they are not parsed as `Tag` by construction.
- Extraction contract is unchanged (`ScannedTagOccurrence {name, startOffset, endOffset}`), so downstream (`TagOccurrence`, "Show in note", `getTagOccurrenceRanges`) is unaffected.
- **Frontmatter:** make sure the parse runs on the **body after frontmatter**, with offsets rebased (as `TaskExtractor` presumably does), otherwise a `#` in YAML comments (`# comment`) is a "heading" in the first block. Confirm in tests.

### Editor behaviors

- **Highlighting/at-rest rendering:** already built on the `Tag` node (`tagDecorations`, `TagWidget`). Keep. Style from `Tag` metadata (icon/color) via a resolver injected at the editor boundary (`resolveTag.ts` pattern; the editor never imports `Vault`).
- **Selection/cursor:** `tagSelectionSnap`, `tagEngagement` already exist. Not revisiting.
- **Click-to-open:** existing `tagActivation`/`tagMouseHandlers`. Keep.
- **Do not use decorations as the source of truth for "is a tag".** Decorations derive from the tree; extraction derives from the tree; both come from the same grammar.

### Autocomplete
Existing: `tagCompletionSource` + injected `GetTagSuggestions` + `createTagSuggester(vault)` (substring match on normalized identity, alphabetical, no creation row).

Recommended changes (small):
- **Source of candidates = `vault.tags()`** (the one projection, already includes metadata). After declared tags (§6) land, declared-but-unused tags appear automatically. Do not query `tags.json` or any index directly from the editor. This keeps one read path.
- **Ranking:** prefix matches first, then word-boundary matches (`des` → `design`, `ux-design`), then substring; tiebreak by `usageCount` desc then name. Fuzzy (subsequence) matching is a nice-to-have that costs nothing at 5,000 tags (a linear scan with a cheap scorer is microseconds-per-tag × 5,000 ≈ low single-digit ms, well under a frame), but start with prefix/word-boundary/substring tiers; the deterministic order is already a project preference.
- **New tag:** no explicit "create" row is needed (a tag exists by being typed); keep as is. If the user types `#` + something with no match, simply keep typing. Show a muted "new tag" hint only if UX wants it.
- **Insertion:** insert `#` + `serializeTagName(label)` (existing "lenient reader, strict writer" rule), i.e. `#design-system`, never an icon/color.
- **Row UI:** icon (emoji) + display label, optional color dot. `tagCompletionRow` exists; give it `icon`/`color` from `Tag`. Archived tags are filtered out here (§8).

---

## 4. Frontmatter vs inline tags

They are **one logical tag with two ways of attaching it to a note**, and the existing model is right to keep the two *sources* separate while sharing *identity*:

| Question | Recommendation |
|---|---|
| Same identity? | **Yes**: same `normalizeTagName`, same projection (`TagBuilder` already unions them) |
| Spaces in frontmatter? | **Read leniently, write canonically.** `tags: [design system]` is valid YAML and users will write it. Normalization already maps space ≡ `-`, so identity works; Clutter writes `design-system` |
| Spaces inline? | No (`#a b` is tag `a`) |
| Leading `#` in frontmatter value (`- "#design"`)? | Strip on read. Common user habit (Obsidian users do this and then get a mismatched tag **(unverified)**) |
| `Design` vs `design`? | Same identity, first-typed casing wins for display (existing) |
| Aliases (`design` ↔ `ui-design`)? | **No.** Aliases are a merge by another name and a permanent source of "why did this note show up under that tag". Merge is the supported operation (§7). Note ADR-036 aliases are *page* aliases for link resolution; don't conflate |
| Render frontmatter tags in the editor? | They already render in the Properties panel (`PropertyList` Tags editor). That is the right place; the Markdown editor shows the YAML text as text |
| Auto-add inline tags to frontmatter, or vice versa? | **No.** `PageMetadata.tags` documents this: copying would make every note with an inline tag look note-level-tagged and breaks the Tags sidebar's distinction between "tagged note" and "mentioned in a line". Two independent attachments, one tag |
| Semantics differ? | Yes, usefully: frontmatter = *note is about this*; inline = *this passage mentions this*. The sidebar already exposes the difference (note list vs occurrence lines). Keep `usageCount` as unique pages (existing), and expose `source: 'frontmatter' | 'inline'` per usage if a UI needs it |

**Parser check needed:** `FrontmatterParser` handles `- item` lists under `tags` (line ~101) and a `case 'tags'` path (line ~239). Add tests for flow lists `[a, b]`, quoted values, scalar `tags: a`, comma-separated scalar `tags: a, b` (Obsidian historically accepted this **(unverified)**), and `#`-prefixed values. `aliases` already supports every form (ADR-036 §1); `tags` should reach parity.

---

## 5. Tag identity

**Decision: normalized name is the identity. No internal IDs.**

| Concern | Name-based | Stable ID |
|---|---|---|
| Markdown contains | the name, the only thing that *can* be authoritative | needs a name↔ID table; the file has `#design`, not an ID |
| External editing | works: any editor produces valid usage | an externally typed `#new` has no ID; IDs get minted lazily → two machines mint different IDs for the same tag (Git/sync divergence) |
| Rename | rewrite files (costly, but it is what the text says) | O(1) metadata change, **but the text still says `#design`**, so the ID must be re-synced to the file text anyway, or the file lies |
| Merge | rewrite files | same: files still contain both names |
| Portability | other tools see names only | IDs are Clutter-only noise |
| Deleted/corrupt metadata | usage fully recoverable from Markdown; only style lost | lose the table ⇒ every ID orphaned |
| Git/sync | per-tag entries merge cleanly by name | ID generation adds conflict surface |

IDs only pay off if tags are **renamed without touching notes** (a display-name-over-ID model, like Notion/Anytype select options). That is incompatible with "Markdown remains portable and authoritative". Page IDs exist because *file paths are mutable and users rename files*; tag names are *the content itself*. The repo's own memory ("add no new IDs without a concrete need") agrees.

### Normalization rules (identity key)

1. Unicode **NFKC** + **case fold** (UAX #31 recommends NFKC for case-insensitive identifiers; `toNFKC_Casefold` also drops default-ignorable characters such as zero-width joiners). In JS: `s.normalize('NFKC').toLowerCase()` is a good-enough approximation; `toLowerCase()` is locale-independent (don't use `toLocaleLowerCase`).
2. Strip default-ignorable code points that slipped through (U+200B–U+200F, U+2060, U+FEFF, U+00AD) before comparing. The grammar's `\p{L}\p{N}\p{M}` already excludes most; this is for frontmatter and API input.
3. Fold runs of `-` / `_` / whitespace to a single space (**existing rule, kept**).
4. Trim.
5. Cap at 100 characters (post-normalization). Longer ⇒ not a tag (inline: the token is plain text; frontmatter: ignored with a warning).
6. Store **display name** = first-typed spelling in the vault (existing behavior), and **key** = normalized form. The key is what lives in `tags.json`.

Today's `normalizeTagName` does only #3 plus lowercase. Add NFKC and the invisible-character strip; this is a one-function change, but **it changes persisted keys for non-ASCII tags**, which today can't exist, so there is no migration risk.

**Confusables** (`design` vs `desіgn` with Cyrillic `і`): do **not** merge them. Merging hides a real distinction and can't be done safely. UTS #39 gives a skeleton algorithm for *detection*; the useful, cheap mitigation is a **warning when a new tag mixes scripts** (e.g. Latin + Cyrillic in one token) at creation time. Defer; it is a UX nicety, not a correctness issue. The sidebar showing two near-identical tags is, if anything, how users will notice and merge them.

---

## 6. Tag lifecycle and the "declared tag" requirement

State is derived from two independent facts: **used** (some note references it) and **declared** (an entry exists in `tags.json` that the user created/configured).

| State | used | declared | Visible in sidebar | In autocomplete |
|---|---|---|---|---|
| Implicit (typed once, never configured) | ✔ | ✘ | yes | yes |
| Configured | ✔ | ✔ | yes | yes |
| Declared-unused | ✘ | ✔ | yes (greyed, count 0) | yes |
| Gone (last use removed, never configured) | ✘ | ✘ | **no**, disappears | no |
| Archived | any | ✔ (`archived: true`) | hidden by default (filter) | **no** |

Rules:
- **Create tag** (explicit UI): writes `tags.json` entry with `declared: true`. Nothing is written to Markdown.
- **Configuring** an implicit tag (icon, color, favorite) *implicitly declares* it. This preserves today's behavior: metadata persists even if usage later drops to zero.
- **Last usage removed:** metadata **stays** (the entry is there). A configured tag does not vanish; an unconfigured one does (that is the existing, correct behavior).
- **Recreated later:** the same key finds the same entry; icon/color return. This falls out of name-based keys for free.
- **Archived** = *hide, don't block*: removed from autocomplete and default sidebar listing, existing usages remain valid and are still indexed; typing `#archived-tag` still works and just isn't suggested. Blocking usage is impossible to enforce for Markdown edited outside Clutter, so don't pretend to.
- **Delete** has two distinct meanings and the UI must not conflate them:
  - **Remove definition** (default, cheap, safe): delete the `tags.json` entry. If the tag is still used it reverts to implicit; if unused it vanishes.
  - **Remove from all notes** (destructive batch): same machinery as rename (§7) with an empty replacement: delete inline occurrences (and a leading separating space) and frontmatter entries. Needs a confirmation that states the note count, and the same plan/verify/apply flow.

### Required projection change

`TagBuilder.build(pages, tagMetadata)` currently iterates only used names. Change to: used names ∪ metadata keys where the entry is `declared !== false`. A used-only tag gets `declared: false`, `usageCount: n`. `Tag.usageCount` stays "unique pages" and may be 0. **This is an amendment to a documented contract** (the doc comment and the "only tags with metadata exist" behavior) ⇒ ADR. Orphan metadata (an entry with no `declared` flag from the old format) should be treated as declared on upgrade (§3 migration), since presence of an entry today is deliberate user configuration.

---

## 7. Rename and merge

### Is rename needed at all initially?
It already ships. Fix it rather than disable it.

### Correct design: plan → verify → apply, idempotent and resumable

1. **Plan (pure, no I/O).** From the in-memory `Vault`, list affected pages: any page whose inline occurrences (from the single grammar) **or** frontmatter `tags` match `oldKey`. Produce per-page edits as text ranges (inline: occurrence `startOffset+1..endOffset`; frontmatter: the YAML list item). Because occurrences already carry offsets, **no regex is needed at apply time**.
2. **Preflight.** Collision check (existing `findCollision`) except in merge mode (below). Reject archived pages or pages with an open dirty session? Use the existing `mutateBody` path, which already coordinates with live `DocumentSession`s (that is why it's the right primitive).
3. **Apply per page, serialized per page via the existing `VaultSyncCoordinator` key** (`page:<id>`), not `Promise.all` across the vault with no ordering. Each edit is re-validated against the current body: *re-extract* tags from the current markdown inside the `mutateBody` callback and rewrite only occurrences whose current key equals `oldKey` (never trust stale offsets; this is the compare-and-swap, and it also handles "the user/external editor changed the file after planning").
4. **Concurrency:** limit to a small number of in-flight pages (e.g. 8) so 3,000 affected notes don't open 3,000 writes simultaneously.
5. **Report** `{ rewritten, skipped, failed[] }`. Partial failure is normal (a file locked, a permission error). Because the operation is **idempotent** (re-running finds whatever still has `oldKey`), the "recovery" is "run it again". There is no all-or-nothing atomicity across files on a filesystem; pretending otherwise is false safety.
6. **Metadata last:** after pages are rewritten (even partially), **move the `tags.json` entry** `oldKey → newKey` (plus `CollectionViewConfigStore`/`TagExpansionStore` as today). If pages failed, keep the old entry too until a re-run completes? Simplest consistent rule: move metadata only when `failed.length === 0`; otherwise leave it and report. Re-running completes it.
7. **Undo:** not provided (`durability-model.md`: undo/version history is explicitly out of scope). The honest mitigation is the confirmation dialog stating the exact note count, plus the fact that the inverse rename restores the text if no merge happened. Do not implement a bespoke undo journal for one feature.
8. **External edits during rename:** step 3's re-extract inside the callback makes a changed file safe; a file deleted/renamed mid-run fails that page only (reported).
9. **Git:** a rename produces N modified files. That's inherent to name-in-text identity and is the same cost as renaming a heading everywhere; it is the price of portability (§5).

### Merge
`design` + `product-design` → `design`:
- Same pipeline, rename `product-design → design`, but **allowed when the target exists**; requires an explicit "merge" confirmation.
- **Metadata:** target's entry wins; fill missing fields from the source; drop the source entry.
- **Notes with both** (inline and/or frontmatter): frontmatter dedupe (don't write `design` twice); inline duplicates are harmless (it is text).
- Casing/separator-only change (`Project` → `project`, `a_b` → `a-b`) remains a same-identity rename (existing behavior), which still must rewrite text and still must move the key *string* in view-config stores (existing code handles that).

### Frontmatter rewrite
Use `FrontmatterParser`/`FrontmatterSerializer` (`PageOperations.updateMetadata` with a `tags` patch) rather than regexing YAML. It keeps `unownedLines` byte-identical. This guarantees the frontmatter half does not corrupt unrelated keys.

---

## 8. Tag metadata persistence: format comparison

Scenario sizes: 10k notes, 5k tags (most are *implicit* and have **no** `tags.json` entry; realistic configured/declared tags are tens to low hundreds), writes are rare (user edits a tag's icon).

That last point matters most: **`tags.json` only stores configuration, not usage.** Its size scales with *how many tags the user styled*, not with vault size. Most of the "5,000 tags / 500k occurrences" load is in the derived projection, not in this file.

| | `tags.json` (one file) | `tags.yaml` | SQLite | per-tag files | Frontmatter/"tag notes" | Hybrid: JSON file + derived index |
|---|---|---|---|---|---|---|
| Portability | Good: plain text, but Clutter-only | Good | Poor: binary, opaque to other tools | Good | **Best**: lives in Markdown | Good |
| Performance (5k entries / 200 configured) | Trivial (parse a few KB) | Trivial; slower parser | Overkill | 200 file reads at boot | 200 note reads | Trivial |
| Simplicity | **Highest**; already shipped | Needs a YAML dep + round-trip-preserving writer | Needs Rust-side DB layer, migrations | Needs dir lifecycle, filename escaping for Unicode/case-insensitive filesystems | Pollutes the note namespace; 5k tag notes? collision with real notes | Same as JSON |
| Git friendliness | Good *if* written deterministically (sorted keys, 2-space indent, trailing newline); concurrent edits to different tags merge line-wise; same tag/field = real conflict (correct) | Good, slightly nicer diffs | **Terrible**: binary, unmergeable, plus `-wal`/`-shm` | Best: one file per tag ⇒ conflicts only on the same tag, but this is also what sorted JSON gives for *different* tags | Good (notes are text) | Good |
| Corruption recovery | Atomic write + tolerant load makes it a non-issue; a hand-corrupted file loses *styling only*, never usage | Same; YAML is easier to hand-break (indentation) | Robust vs crash but a corrupt DB is unreadable by a human | Per-file blast radius | Same as notes | Same |
| External editing | Easy to hand-edit; watch + reload | Easy | Impossible | Easy | Easy | Easy |
| Scalability | Fine to tens of thousands of entries | Fine | Best at large scale | Poor at 5k entries (filesystem + watcher noise) | Poor | Fine |
| Migrations | `version` field + pure upgrade function | Same | Schema migrations | Per-file versions | Ad-hoc | Same |
| Complexity | Low | Low-medium | High | Medium | High | Low |

**Choice: one JSON file.** The Git argument for per-tag files is real but small; sorted, one-field-per-line JSON already yields line-level merges for edits to different tags, and a same-tag-same-field conflict is a true conflict that *should* surface. YAML buys nothing except comment support, at the cost of a round-tripping writer. SQLite is unsuitable for **configuration** (binary, unmergeable); see §9 for where it could be justified (derived data).

Workspace vs global: **per-vault, confirmed.** Tag meaning is vault-specific (`design` in one vault is unrelated to another), the file travels with the vault, and a global store would break "move the vault to another machine". A global *default palette* for suggesting colors to new tags is the only global thing worth having, and it is not metadata.

Portability: **losing icon/color when a vault is opened in another tool is acceptable.** Tags themselves (the knowledge) survive, because they are in the Markdown. Putting presentation into frontmatter would (a) have to be duplicated into every note using the tag or live in a "tag note", (b) turn a style edit into a 500-file diff, (c) conflict with the Clutter principle that `.clutter` holds application metadata. Obsidian itself has no tag colors in core (**unverified**), so portability expectations here are low.

### Recommended file (`.clutter/tags.json`, schema v2)

```json
{
  "version": 2,
  "tags": {
    "design": { "icon": "🎨", "color": "purple", "favorite": true, "declared": true },
    "design system": { "icon": "🧩" },
    "research": { "color": "blue", "archived": true }
  }
}
```

- **Keys are the normalized identity** (existing: `"design system"`, space form).
- `color` stores a **palette token name** (`"purple"`), not hex. Themes (light/dark) differ; tokens survive redesign. Allow a hex fallback only if a custom-color UI ships.
- Absent `declared` ⇒ treated as **declared** on v1→v2 upgrade (an entry today means deliberate configuration), and *new* implicit-then-configured tags write `declared: true`.
- Unknown fields are **preserved** on read-modify-write (forward compatibility; also protects hand edits and newer-version files).
- Deterministic serialization: keys sorted, 2-space indent, `\n` at EOF, so Git diffs are minimal.

### Write path (the robustness work)

1. **Atomic write.** Write `tags.json.tmp` in the same directory, `fsync`, rename over the target. `std::fs::rename` is atomic on POSIX; on Windows Rust's `rename` replaces an existing file (it uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`, **not** guaranteed atomic on all Windows filesystems/network shares). This is a **Platform-layer** capability (a Tauri command `write_file_atomic`), so it fixes `workspace.json` too instead of adding a tag-specific hack. `durability-model.md` lists atomic writes as out-of-scope today; this is the first concrete reason to schedule it, and it should be one platform primitive used by every `.clutter/*.json` writer.
2. **Serialize writers** through the existing `workspace.json` queue helper (or a sibling keyed by path) so `updateMetadata` calls cannot interleave. Fix the read-modify-write by reading *inside* the queued section, as ADR-035 §9 did.
3. **Tolerant load** in exactly one place (`readTagMetadata(fs, root)`), used by both `Application.attachVault` and `TagOperations`: parse failure ⇒ copy the bad file to `tags.json.corrupt-<timestamp>`, log a warning, start from empty, **never fail vault attach**. Each entry is validated individually (drop bad entries, keep good ones).
4. **Self-write suppression + external reload:** `SelfWriteAwareFileSystem` already registers Clutter's own writes. Add a `.clutter/tags.json` route in `VaultSyncService`: on external change, re-read via the tolerant loader and call `vault.setTagMetadata`. (Verified: nothing under `core/vault/sync/` currently references `.clutter`; the Rust watcher emits events for all paths, so check whether `.clutter` paths are filtered at the TS provider layer before relying on it.)
5. **Cross-process concurrency/locking:** don't add file locking. Single desktop process per vault is the model; the atomic rename + reload-on-change covers "another editor touched it". OS advisory locks differ across macOS/Linux/Windows and don't help with Git/sync tools that replace files.

---

## 9. Index design, performance, and SQLite

### What exists
Clutter holds all pages in memory in the `Vault`; `page.analysis.tags` stores occurrences (name + offsets); `TagBuilder` derives `Tag[]` on projection refresh (ADR-004, lazy). There is **no persisted index**. Search, backlinks and tasks use the same shape. Tags should keep reusing it.

### Do we need to persist occurrence positions?
- **In memory: yes, they already are** and are used by "Show in note" and sidebar line contexts.
- **On disk: no.** Positions go stale on any edit; recomputing from text is cheap for the opened note. A persisted index should store per-note *facts* (`pageId`, content hash/mtime, tag keys + which source), not offsets.

### Estimates (reasoned, not measured)
Assumptions: 10k notes × ~5 KB = ~50 MB of text; 500k inline occurrences ≈ 50 per note.
- **Cold scan = read + parse 10k files.** The `@lezer/markdown` parse is the dominant cost and is *already paid* (for code ranges, headings, tasks). Order-of-magnitude, parsing at ~10-50 MB/s in JS means ~1-5 s for 50 MB, plus file I/O through the Tauri IPC boundary (10k `readFile` calls, likely the larger cost; batching in Rust is the fix, not a DB). **Tags add essentially nothing** to this cost once extraction reuses the parse.
- **Projection (`TagBuilder`)**: one pass over 500k occurrences with one `Map.get` and a `normalizeTagName` call each. `toLowerCase().replace(/[-_]+/g,' ')` is on the order of 100-300 ns, so ~50-150 ms, which is **recomputed on every projection refresh**. Cheap fix: **normalize once at extraction** (store `key` on the occurrence) so `TagBuilder` only does `Map` operations (~10-20 ms), and make refresh **incremental per page** (subtract the page's old keys, add the new) rather than rebuilding all 10k pages after one keystroke-save. Do this only if profiling shows refresh on save is noticeable; per ADR-004 it's lazy anyway.
- **Memory:** 500k occurrence objects at roughly 80-120 B each (object header + three fields, strings shared if interned) is ~40-60 MB. Acceptable but the single largest tag-related cost; if it matters, store occurrences as typed arrays per page (`Uint32Array` offsets + interned key ids). Don't pre-optimize.
- **Editing:** the editor path is the Lezer incremental parse (block-local reparse) plus decorations; unaffected by vault size. Save → re-extract **one** page → update projection. No debouncing needed beyond the existing autosave cadence.
- **External changes:** the watcher already emits per-file events; each triggers re-read + re-extract of one page. A `git pull` touching 2,000 files is a burst, not a stream: coalesce on the TS side (collect for ~100-200 ms, process in a bounded-concurrency batch, refresh the projection once). The Rust side already does rename pairing; it doesn't need a general debounce.

### Rust vs TypeScript
Keep extraction in TypeScript: it must share the grammar with the editor (one definition, §3). Moving scanning to Rust would create a *second* grammar, the exact problem being removed. Rust's job is I/O: watcher, atomic write, and if needed a **bulk "read N files" command** to cut IPC round trips. Web Worker for the cold scan is the proven lever if the UI stalls; measure first.

### Is SQLite warranted?
- **Not for tag configuration** (§8).
- **Not for the tag index** at this scale: the working set (a few tens of MB) fits in memory, queries are "tags for a page / pages for a tag" (two `Map`s), and the vault *must* be loadable without any index.
- **When it would be:** startup scan becomes unacceptable (cache per-page analysis keyed by `(path, size, mtime, contentHash)` so only changed files are re-parsed), or full-text search (FTS5) arrives. Then a **single generic per-page analysis cache** serves tags, tasks, links, headings and search, not a tag table.
- **Where to put it:** SQLite in WAL mode needs shared memory (`-shm`) and cannot work over network filesystems and generates `-wal`/`-shm` side files that must stay together with the DB (SQLite docs: "WAL does not work over a network filesystem"; those same docs list the extra files as a reason it's less ideal as a single-file format). A vault folder inside iCloud/Dropbox/Git is exactly the hostile environment. **Put any index in the OS app-data directory keyed by vault id**, not in `.clutter` (or, if kept in `.clutter`, git-ignore it and document "safe to delete"). Because it's disposable, loss = a slower first launch, never data loss.

A simpler first persisted cache (before SQLite): one JSON/MessagePack blob per vault in app-data, `{version, pages: {path: {size, mtime, hash, tags:[key…], …}}}`, loaded at boot, validated by `(size, mtime)`, then re-hashed only on mismatch. Escalate to SQLite only if this blob exceeds roughly 50-100 MB or load time becomes meaningful.

### Reuse of search/backlink infrastructure
Yes, by construction: tags are one more field in `PageAnalysis`. Do not create `TagIndex`. (ARCHITECTURE_RULES rule 1, "one owner per capability"; implementation-rules §2.6/§2.13.)

### Benchmark that settles the estimates (do before building any cache)
Synthetic vault generator (10k notes, ~50 tags each, Zipfian tag popularity, 5k distinct) in `tests/`: record (1) cold scan wall time and peak RSS in the Tauri app, (2) `TagBuilder.build` time, (3) save-one-note → projection-refreshed time, (4) 2,000-file external burst. Gate the "build a cache" decision on a number (e.g. cold launch > 3 s).

---

## 10. External changes and watcher reconciliation

Verified: Clutter's own Rust watcher (`vault_watcher.rs`, `notify = "6"`) emits `created/changed/deleted/moved` with `isDirectory`, pairs rename halves by timing because FSEvents provides no tracker, and drops `.DS_Store`. The `notify` docs list the relevant caveats: network filesystems may emit no events, Linux inotify has per-user watch limits, editors differ (truncate vs replace) so "changed" may arrive as delete+create. Tauri's official `plugin-fs` also exposes `watch`/`watchImmediate` on top of the same crate, but Clutter's custom watcher is the established path and already handles renames; **do not add a second watcher.**

Tag-specific reconciliation (everything below reuses `VaultSyncService` + `VaultSyncCoordinator`):

| Event | Behavior |
|---|---|
| Note body edited externally (`#design → #research`) | Existing: re-read page → re-extract → projection refresh. Tags need no special handling once extraction is in `PageAnalysis`. `design` usageCount drops; if now unused and undeclared it vanishes |
| New `#tag` added externally | Same path. Appears as an implicit tag |
| Frontmatter changed externally | Same path (`resolvePageMetadata` re-derives `tags`; note it intentionally preserves previous `tags` on an absent key per ADR-036 §1 comment; confirm that is still desired for tags: an *external removal* of the whole `tags:` key currently does not clear the note's tags) |
| Note deleted/renamed/moved/folder moved | Existing page lifecycle. Page identity moves, tag usage follows the page; nothing tag-specific |
| `.clutter/tags.json` edited manually | **New**: reload through tolerant loader (§8.4), ignoring self-writes |
| `.clutter/tags.json` deleted | Treated as empty: tags remain (usage from Markdown), configured style lost. Do **not** auto-recreate eagerly (lazy lifecycle: written on first mutation, per ADR-030) |
| `.clutter` deleted | Same; also drops workspace state files (their own recovery). Index (if any) rebuilds |
| App crash mid-write | With atomic write: old or new file, never partial. Today: possible truncated JSON ⇒ with tolerant load, quarantined and recovered as empty |
| Rename in progress when external edit lands | §7 step 3: re-validate inside the callback |

Crash during a **rename batch**: some files rewritten, metadata not yet moved. Re-run rename (idempotent) completes it. Surface "N notes still use the old name" in the result UI instead of leaving it silent.

---

## 11. Security and robustness

Tags are never filesystem paths, so `#../../x` can't path-traverse: the grammar stops at `.`/`/`, and `tags.json` keys are JSON object keys, never joined into paths. Keep it that way: if a future feature writes per-tag files, escape the key. The cases that actually matter:

| Case | Impact | Handling |
|---|---|---|
| Very long tags (`#aaaa…` ×10k) | UI layout, JSON bloat, regex backtracking | Length cap 100 chars after normalization; token longer than that is plain text. The grammar has no nested quantifiers, so no ReDoS |
| Prototype keys (`#__proto__`, `#constructor`) | Plain-object property pollution | `TagBuilder`/stores use `Map` (good). Keep it; `Object.fromEntries` on write is safe (data properties), but never accumulate into `{}` by assignment |
| Zero-width / bidi control chars | Look-alike duplicates, invisible tags | Stripped from identity (§5); excluded by `\p{L}\p{N}\p{M}` so they end a token |
| Confusables (Cyrillic `і`) | Visually duplicate tags | Don't merge; optional mixed-script warning; users can merge via §7 |
| RTL tags | Display glitches in the chip | `unicode-bidi: isolate` on the tag widget; no logic change |
| Emoji | Not letters ⇒ not tags in v1 | Emoji are metadata `icon`, not name |
| Huge tag counts per note | 50k `#a` in one note | Existing extractor cost is linear; consider a per-note occurrence cap (e.g. 10,000) if ever observed |
| Hostile `tags.json` (huge/deep) | Boot hang | Size cap on read (e.g. 5 MB ⇒ treat as corrupt), per-entry validation |

---

## 12. Evaluating the stated principle

> Markdown is the source of truth for tag usage. Tag metadata is the source of truth for tag configuration. The index is derived data.

**Agree**, with two amendments:

1. **Tag *existence* is `used ∪ declared`**, and *declared* lives in metadata. "Tag definition ≠ tag usage" is right, but the projection must read **both** to decide what exists. Today it reads only usage, which is the contradiction in §6.
2. **Where metadata keys come from is Markdown's vocabulary.** The key is a name that must satisfy the Markdown grammar and the same normalization. Metadata is *authoritative for style* but is **never authoritative for identity**: if `tags.json` and Markdown disagree about what a name is, the grammar wins (e.g. a hand-edited key `"Design-System"` is normalized on load, as `readMetadata` already does).

One more clarification worth writing into the ADR: **the index must not be a prerequisite for correctness.** Clutter must open with `.clutter/index` absent, so every capability above is defined against the in-memory projection first.

---

## 13. Recommended data model (TypeScript)

Extend, don't replace, the existing `Tag`/`TagMetadataEntry`/`TagOccurrence`:

```ts
// core/vault/models/Tag.ts

/** Normalized identity. Branded so raw display strings can't be passed where a key is required. */
export type TagKey = string & { readonly __brand: 'TagKey' };

/** Presentation + declaration, persisted per tag in .clutter/tags.json. Keyed by TagKey. */
export interface TagMetadataEntry {
  readonly icon?: string;        // emoji or icon id; generic, as today
  readonly color?: string;       // palette token ("purple"), not hex
  readonly favorite?: boolean;
  readonly archived?: boolean;
  readonly declared?: boolean;   // intentionally exists even with 0 uses
  readonly description?: string;
  /** Unknown fields round-trip untouched (forward compat / hand edits). */
  readonly [extra: string]: unknown;
}

/** On-disk shape. `version` drives the pure upgrade function. */
export interface TagMetadataFile {
  readonly version: 2;
  readonly tags: Readonly<Record<string, TagMetadataEntry>>;
}

/** Vault-wide projection of one logical tag. Derived. Never persisted. */
export interface Tag {
  readonly key: TagKey;          // identity (new: no more recomputing normalizeTagName everywhere)
  readonly name: string;         // preferred display spelling (first-typed wins; for declared-unused: the key's title as typed at creation)
  readonly icon?: string;
  readonly color?: string;
  readonly favorite: boolean;
  readonly archived: boolean;
  readonly declared: boolean;
  readonly usageCount: number;   // unique pages; may be 0 for declared tags
}

/** Where on a page a tag was attached. Used for display + rename planning. */
export type TagSource = 'inline' | 'frontmatter';

export interface TagOccurrence extends Occurrence {
  readonly name: string;         // as typed (unchanged)
  readonly key: TagKey;          // normalized once, at extraction
}
```

`PageMetadata.tags` stays `readonly string[]` (as typed); its keys are computed in the projection. The one new function is `tagKey(raw: string): TagKey | null` (apply §5 rules, `null` if empty/over-long/all-digits), which **replaces** `normalizeTagName` as the only identity function (keep the old name as an alias during migration).

---

## 14. Governance (CLAUDE.md contract)

Applicable rules: single owner per capability (**`TagOperations`** owns tag lifecycle; `TagBuilder` owns the projection; the grammar module owns "what is a tag"). The `.clutter/*` write is outside the Gate (rule 2 carve-out already used for `tags.json`), but note-body and frontmatter writes in rename must keep going through `PageOperations.mutateBody/updateMetadata` → Gate. Dependencies point downward: grammar moves **down** into `core/vault/ingest`.

Divergences that need an **ADR before implementation** (suggest ADR-047, "Tags: single grammar, declared tags, planned rename"):
1. Moving `tagSyntax`/`scanTag` into Vault Ingest and retiring `TagExtractor`'s regex, `TagOperations`' regex, and the "intentionally unshared" copies (the existing comments encode the old decision).
2. `Tag` projection = used ∪ declared (changes `TagBuilder`'s documented contract).
3. `rename()` semantics (frontmatter + metadata key + merge mode + result report).
4. A Platform atomic-write primitive for `.clutter/*.json` (touches `durability-model.md`'s out-of-scope list).
5. `normalizeTagName` → `tagKey` (NFKC etc.).

Not an ADR topic: sidebar/autocomplete UI changes, color/icon pickers, benchmark.

---

## 15. Failure recovery summary

| Failure | Result |
|---|---|
| `.clutter/index` (if it exists) deleted | Rebuild from Markdown + `tags.json` on next launch. Nothing lost |
| `tags.json` deleted | Usage intact; styles/declared-unused tags lost. **Declared-unused tags vanish** (the only true data loss; mitigated by Git/backup and by the file being small and human-readable) |
| `tags.json` corrupt | Quarantined to `.corrupt-<ts>`, empty config, warning toast; per-entry validation keeps what parses |
| Crash mid-write | Atomic rename ⇒ old or new file |
| External edit of notes | Watcher → one-page re-extract → projection refresh |
| Git conflict in `tags.json` | Sorted/stable serialization ⇒ conflict only on the same tag+field; the user resolves in a text editor; a conflict-marker file fails JSON parse ⇒ tolerant-load quarantine rather than a crash. Offer "tags.json has conflict markers" detection (`<<<<<<<`) with a clear message |
| Rename partially applied | Idempotent re-run; result lists remaining notes |

---

## 16. Migration: JSON → SQLite (if ever)

Because the **domain model is the in-memory projection** and storage is behind `readTagMetadata`/`writeTagMetadata` (one pair of functions, added in phase 1), swapping storage changes only those two functions: nothing in `Tag`, `TagBuilder`, `TagOperations` or the UI cares. But, per §8-9, I would never move *configuration* to SQLite; only the *derived cache* might go there, and the cache is disposable, so "migration" is "delete and rebuild". The format version field covers the only real migration (v1→v2).

---

## 17. Implementation plan (incremental; each step verified + committed per CLAUDE.md)

**Phase 0: Decide and measure (no product code)**
- Write ADR-047 (§14). Build the synthetic-vault benchmark (§9) and record baselines.

**Phase 1: One grammar (fixes finding 2; user-visible bug fixes)**
- Move `tagSyntax.ts`/`tagScanner.ts` to `core/vault/ingest/tag/`; keep the editor importing from there.
- Extend lexer to `\p{L}\p{N}\p{M}_-`, reject all-digit, reject `foo/bar` token, length cap.
- Rewrite `TagExtractor` to walk the tree; delete the regex. Same parse as code ranges.
- Regression tests: inline code, fenced (backtick and tilde), indented code, `\#x`, in link text, in URL/autolink, HTML, headings (`# x`, `#x`), `#123`, `#café`, `#C++`, `#foo/bar`, frontmatter `# comment`, **extractor result ≡ editor `Tag` nodes on a shared corpus** (a property test over the same fixtures is the guard that prevents re-divergence).

**Phase 2: Identity + storage hardening (findings 4, 6)**
- `tagKey()`; store `key` on occurrences; `TagBuilder` keyed by it.
- Platform `write_file_atomic`; shared tolerant `readTagMetadata`; serialized read-modify-write; schema v2 + upgrade; deterministic serialization; unknown-field preservation; stop duplicating parse in `Application`.
- `.clutter/tags.json` external reload in `VaultSyncService` with self-write suppression.

**Phase 3: Declared tags (finding 3)**
- `TagBuilder` union; "Create tag" UI; `declared` flag; sidebar shows count-0 tags; autocomplete includes them. Archive flag + filters.

**Phase 4: Correct rename/merge/delete (finding 1)**
- Plan/verify/apply on the single grammar; frontmatter via `updateMetadata`; metadata key move; concurrency limit; result report; merge mode with confirmation; "remove from all notes" with confirmation.

**Phase 5: Editor polish**
- Autocomplete ranking tiers + icon/color in rows; bidi isolation on chip; mixed-script warning (optional).

**Phase 6 (conditional on Phase 0 numbers):** per-page analysis cache in app-data; incremental projection refresh; bulk-read Rust command. SQLite only if the cache outgrows a flat file or FTS arrives.

**Deferred on purpose:** nested tags (`#a/b`), emoji-as-name tags, tag aliases, per-tag Git-friendly files, tag IDs, a global tag store.

---

## 18. Architecture I would ship

1. **Markdown is the only source of tag usage.** One Lezer grammar (`Tag` node) in `core/vault/ingest`, used by the editor *and* by the extractor. Extraction walks the parse tree. The three regex copies are deleted.
2. **Identity = `tagKey(name)`**: NFKC + case-fold + invisible-char strip + `-`/`_`/space fold + length cap. No tag IDs. Display name = first-typed spelling.
3. **Frontmatter and inline tags are two sources of one tag.** Same key, never auto-synced, frontmatter read leniently and written canonically.
4. **Configuration = `.clutter/tags.json` (v2)**, per-vault, sorted deterministic JSON, `{icon, color(token), favorite, archived, declared, description}`, unknown fields preserved, written **atomically** through one serialized writer, loaded **tolerantly** (never blocks vault open), reloaded on external change.
5. **Tag existence = used ∪ declared**. Configured tags persist at zero usage; unconfigured ones vanish; recreated tags regain their style by key.
6. **The projection is in-memory and derived** (`TagBuilder`, extended). No persisted tag index. If the benchmark says startup is too slow, add a *generic* per-page analysis cache **outside the vault**, never a tag-specific table, never SQLite-for-config.
7. **Rename/merge/delete-from-notes = planned, per-page-serialized, re-validated, idempotent batches** over `PageOperations` (so the Gate, live sessions and the watcher all behave), covering inline + frontmatter + metadata key. Result report, no bespoke undo.
8. **External changes flow through the existing watcher/sync path**; add exactly one route (`.clutter/tags.json`).
9. **Autocomplete queries `vault.tags()` only**, tiered ranking, icon/color in rows, archived hidden, inserts `#canonical-name`.

### What we are currently getting wrong (summary)
- Rename: ignores frontmatter, rewrites inside code, drops the icon/favorite entry, no failure handling.
- Three tag grammars, already inconsistent with the editor (inline code counted as tags).
- The projection forbids declared tags, contradicting the product requirement.
- `tags.json`: bare `JSON.parse` at boot can block opening a vault; non-atomic, unserialized writes; duplicated parsing; external edits ignored.
- ASCII-only grammar that silently truncates `#café` and `#foo/bar`.
- (Design note, not a bug) `-`/`_` identity folding diverges from Obsidian; acceptable, but write it down in the ADR because it affects interop and rename.

---

## Sources

- CommonMark 0.31.2, ATX headings and backslash escapes: https://spec.commonmark.org/0.31.2/#atx-headings
- GitHub Flavored Markdown spec: https://github.github.com/gfm/
- `@lezer/markdown` (MarkdownConfig, InlineParser, InlineContext, incremental parsing): https://github.com/lezer-parser/markdown
- `@codemirror/lang-markdown`: https://github.com/codemirror/lang-markdown
- CodeMirror 6 reference (decorations, ViewPlugin, StateField, autocomplete): https://codemirror.net/docs/ref/
- Obsidian tags (character rules, nesting, case-insensitivity, non-numeric rule, frontmatter list form): https://obsidian.md/help/tags
- Unicode UAX #31 (identifier normalization, NFKC/case folding, default-ignorables): https://www.unicode.org/reports/tr31/ and UTS #39 (confusables): https://www.unicode.org/reports/tr39/
- SQLite WAL (shared memory, no network filesystems, `-wal`/`-shm` side files, large-transaction limits): https://www.sqlite.org/wal.html ; atomic commit: https://www.sqlite.org/atomiccommit.html ; application file format: https://www.sqlite.org/appfileformat.html
- `notify` crate known problems (network FS, inotify limits, editor save behavior): https://docs.rs/notify/6.1.1/notify/#known-problems
- Tauri v2 fs plugin (`watch`, `watchImmediate`; built on `notify`): https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/fs
- Local-first principles (Kleppmann et al., "Local-first software", Ink & Switch 2019): https://www.inkandswitch.com/local-first/
- Clutter internal: `docs/editor-architecture-decisions.md`, `docs/durability-model.md`, ADR-004, ADR-030, ADR-032, ADR-035 §9, ADR-036, `ARCHITECTURE_RULES.md`

*Not fetched / unverified: Bear's current hashtag documentation (FAQ URL 404'd), Obsidian's code-block tag handling, and Obsidian's tag-color support. Treat those three statements as recollection.*
