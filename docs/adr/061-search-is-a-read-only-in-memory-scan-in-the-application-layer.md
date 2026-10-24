# ADR-061: Search is a read-only, in-memory scan owned by the Application layer

**Status:** Accepted (product decision, Vigram, 2026-10-24 — stated in the task that implemented it). Adds no Persistence Gate operation and no write path. Builds on [ADR-020](./020-effective-page-state-projection.md) and ARCHITECTURE_RULES.md rule 8 ("derived data is disposable").

## Context

`features/search/SearchPanel.tsx` was an unimplemented stub, and nothing in the codebase searched page bodies or ranked results. Facts established from the code (not from earlier notes):

- The immutable `Vault` already retains every note body (`Page.source.markdown`, body only — frontmatter is split off), so a scan needs no extra I/O. ADR-053 measured a 1,000-note, 5.0 MB space.
- Editor content is newer than the Vault: a body edit commits to a `DocumentSession` immediately and reaches the Vault only after the autosave debounce (2 s, 30 s ceiling). `EffectivePageState` already reconciles the two for page lists and already aggregates `Vault`, `Workspace` and every open `DocumentSession` notification into one `subscribe`.
- A persisted page's title edit lives in `PageOperations.titleStates` (a `FieldEditState`), saved on its own 4 s debounce, and nothing observed it.
- The editor's document is CM6's, which splits on `\r\n?|\n`: offsets into a CRLF string are not offsets into the editor document.

## Decision

1. **Ownership.** `SearchService` (`core/application/search/`) is an Application-layer read projection, the same kind as `EffectivePageState` and `MembershipSelector`. It is constructed once in `Application.attachVault` and handed to the UI as a prop. It never writes, never calls the Gate, and the Vault knows nothing about it (no Vault method, event or dependency is added for search).
2. **Derived data.** Everything Search holds is a disposable memo keyed by the immutable object it was derived from (`WeakMap<Page, …>`, `WeakMap<DocumentRevision, …>`): never persisted, never a source of truth, gone with the page. There is no index and no database. A search can only ever read Markdown; it cannot cause a file to be written.
3. **Live state.** Search reads the open `DocumentSession`'s current revision (and a draft's `DraftInfo`) in preference to `Page.source.markdown`, so it never waits for autosave. The UI refreshes by subscribing to `EffectivePageState.subscribe` (no second editor-state system), debounced ~120 ms, and only while the overlay is open. For titles, `PageOperations.getLiveTitle(pageId)` is the one small read-only facade addition (title-state ownership stays in `PageOperations`), and `commitTitle`/`cancelTitleEdit` call `Workspace.refresh()` — the precedent `updateDraftTitle` already set — so existing observers see title edits.
4. **Visible text and source ranges.** Matching runs over *visible* Markdown (formatting delimiters, link destinations, frontmatter and fence info strings removed; code content kept), built from the editor's own grammar (`markdownGrammarExtensions`). The source string is never normalized: text is first LF-normalized the way the editor document is, then visible text is a concatenation of verbatim source slices (an offset map is kept), and case/diacritic folding is applied to a derived copy that carries its own fold-index → code-point-start map. Every reported range is mapped back through both maps and snapped to whole code points.
5. **Why in-memory scanning first.** The data is already resident, the live overlay needs no invalidation machinery, and an index would add exactly the consistency problems (unsaved edits, external changes, archive/restore) the scan avoids. A persisted index is rejected (rule 8 and ADR-053's cache already cover the only expensive step). Whether an in-memory index is ever needed is decided by the recorded benchmark (`apps/app/scripts/benchmark-search.ts`), not assumed.
6. **Relevance.** One list, ordered by one number per page: `baseline of the place + quality points + proximity points + recency points`. Location is the primary signal and the baselines are far apart: an exact title match (exact, prefix, word prefix, substring) → a close (typo) title match → an exact alias → a close alias → the phrase in a heading or the body → words near each other in the body → the weakest body matches and tags. Quality and proximity (at most 65 points) separate pages within a place; recency adds at most 5 and only breaks ties; repeating a word adds nothing. A word of one or two letters matches only at the start of a word (so `New n` is not satisfied by every `n`) and two query words never share one occurrence. The numbers live in `matchPage.ts` (`BASE`, the weights) and the order is pinned by tests.
7. **Typo tolerance.** Titles and aliases only: a word of three or more letters may be one edit (substitution, insertion, deletion, adjacent swap — Damerau–Levenshtein distance 1, computed in linear time without a table) from a word of the title or alias, with the same first letter. Every query word must still match, exactly or by a typo. A close match always ranks below an exact match in the same place and is shown as a "Close match". Two edits for long words was considered and left out (it admits unrelated words).
8. **Visible text only.** Matching and snippets use the visible Markdown text (delimiters, link destinations, frontmatter and fence info strings removed; code content kept). Offsets are mapped back through a segment map and, for folding, a map that records only the code points whose folded length differs (nothing at all when no character changes length), so no range is ever an offset into a normalized string.
9. **Incremental work.** A search is a resumable job (`RankingJob`/`SearchJob`): every page is scored without parsing its Markdown, then pages are confirmed best first only as far as results are wanted. The overlay steps a job in ~8 ms slices, replaces it when the query or the vault changes (a replaced job is never stepped again, so it cannot show stale results), prepares the pages in idle slices while the query is empty, and asks the same job for the next page of results ("Show more results") instead of searching again.
10. **Modal.** The overlay keeps Tab and focus inside it and claims the global shortcuts that would otherwise act on the page behind it (the desktop menu bar's own accelerators belong to the OS and cannot be claimed from the page).
11. **Scope.** Notes and daily notes; titles, aliases, headings, tags and visible body text (task text included — one result per page, never a duplicate task result). Archive, Templates and dot-prefixed pages are excluded; drafts are included. Search is no longer a sidebar tab to rest on: a saved Search tab or startup preference opens Notes. Deferred: assets, filters, fuzzy matching in bodies, query operators, persistent indexing, a command palette.

## Alternatives Considered

- **A persisted or in-memory index now.** Rejected: unmeasured need, and it creates the staleness problems above.
- **A `SearchService.subscribe`.** Rejected (rule 9): it would be a pure forward of `EffectivePageState.subscribe`.
- **Matching raw Markdown.** Rejected by the product decision: it matches delimiters and URLs.
- **`@codemirror/search`.** Not installed and in-document only; it does not search the vault.

## Consequences

- Search sees exactly what the editor shows, including unsaved edits, drafts and unsaved titles.
- The first query pays for building each page's memo; later queries reuse it until the page changes.
- A word split across a link destination, HTML tag or comment (not formatting delimiters) is not found as one word; labeled-divider text and HTML blocks are not searched.
- `PageOperations` gains `getLiveTitle`, and title edits now notify Workspace observers.

## Measurements

Recorded 2026-10-24 with `apps/app/scripts/benchmark-search.ts` (not part of CI; no timing assertions anywhere). Node v24.11.0, darwin arm64, seeded synthetic vaults of ≈5 KB notes (headings, lists, tasks, links, wiki links, code, tags; about 40% of notes contain a non-Latin-1 character, deliberately pessimistic for folding). The pass measured is the real `RankingJob` (limit 50). `warm` = median of 25 repeats; times in ms. Memory counts the JS heap and ArrayBuffer backing stores after `gc()`.

**Memory** (retained, per note of ≈5 KB Markdown):

| | first version | now |
|---|---|---|
| after preparing every page (what a first query pays) | 17.7 KB (1k) · 17.8 KB (10k) · 18.1 KB (50k) — heap only | **7.9 KB** at 1k, 10k and 50k (heap; no off-heap) |
| after parsing every page's Markdown (worst case, if queries had confirmed them all) | not measured; ≈ 50 KB (32 heap + 18 off-heap), found afterwards on a 5k vault | **≈ 25 KB** (6–7 heap + 1.1–1.3 off-heap on top of the 7.9) |

Why it was large: the prefilter text was built with `String.replace`, which returns a rope of string slices that V8 keeps until it is first read (≈ 2× the string), and the first version kept the visible text, the folded text and a `Uint32Array` with an entry for every character of any note that had a single non-ASCII character. Now the prefilter is built with `join` (always flat), the visible text is read back out of the Markdown through the segment map instead of being kept, segments are two integers each, and the fold map holds only the length-changing code points (nothing for text like `Café`). The remaining 7.9 KB is the one folded copy of the note (two-byte for the 40% of notes with a non-Latin-1 character). The benchmark's earlier memory figure was also incomplete (it left out off-heap buffers and read the heap before V8 had flattened the ropes).

**Time**, first version → now (the relevance rework added title/alias/heading/tag/typo matching per page):

| Notes | prepare all pages | first query on unprepared pages, now (rare word; one search in sliced steps) | longest single slice now (8 ms budget) | repeat query, no match | repeat query, rare word | repeat query, common word |
|---|---|---|---|---|---|---|
| 1,000 | 24 → 31 | 33 in 4 slices | 8.5 | 0.4 → 1.2 | 3.2 → 4.2 | 5.8 → 4.8 |
| 10,000 | 217 → 271 | 339 in 41 slices | 8.5 | 4.2 → 13.6 | 33.6 → 40–45 | 45.3 → 27–31 |
| 50,000 | 1,201 → 1,388 | 1,866 in 218 slices | 8–68 | 24 → 85 | 168 → 237 | 226 → 159 |

(The first version prepared the pages and ran the first query as one blocking call (prepare time plus a cold query of 80–650 ms); both are now sliced, so total time is a little higher while the longest hold on the main thread is one slice. At 50,000 notes one slice of up to ≈ 70 ms remains: sorting every match when scoring ends.) Typing five prefixes with pages prepared: 5–62 ms (1k), 27–84 ms (10k), 122–198 ms (50k). The typo tolerance costs about 0.4 µs per page per query; heading, tag and alias matching about 0.3 µs more.

**Proposed product target (not an established fact):** a keystroke should settle in about 100 ms. By these numbers scanning meets that up to roughly 10,000 notes on this machine for ordinary queries, and does not at 50,000 (repeat queries 85–320 ms; one-letter and one-word-plus-a-letter queries 470–660 ms). Scanning should be considered too slow, and an in-memory index worth designing, if a real vault at the sizes users actually have exceeds that target on the slowest supported hardware. Measured evidence for what that index would have to beat: a repeat query at 50,000 notes is dominated by scanning the prepared text of every page.
