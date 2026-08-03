# 07 — Data Model Audit

Scope: `apps/app/src/core/vault/models/` (incl. `analysis/`, `graph/`, `occurrences/`), `core/vault/ingest/`, `core/vault/knowledge/`, `core/vault/persistence/`, `core/vault/sync/`. Cross-referenced against `docs/architecture-specification.md` §2–§5 and `docs/durability-model.md`.

## Summary

Clutter's data model is a flat, in-memory, doubly-indexed (by id and by path) collection of immutable `Page`/`Folder` records, rebuilt eagerly from Markdown+YAML-ish frontmatter files at startup and kept current by two serialized write paths (Persistence Gate, Sync). The core shape is small, well-typed, and disciplined about immutability. However: frontmatter parsing/serialization is a **hand-rolled, non-RFC YAML subset** with a **confirmed silent data-loss bug** (aliases are read but never re-written), identity is **path-derived by default** (frontmatter `id` is optional, so most vaults without persisted IDs have mutable identity), and every derived index (`VaultQuery` filters, tag/task projections) is an **O(n) full-vault linear scan or full rebuild**, run on every mutation. This is a deliberate, documented "correctness over performance... given current file counts" trade-off (spec §3 invariants) — it will not scale unchanged to large vaults without becoming a UI-jank source, though nothing here risks data corruption at that scale.

## Current Architecture

**Domain shape** (`core/vault/models/`):
- `Page` (`Page.ts:43-65`): `id`, `type: 'note'|'daily-note'`, `name`, `path`, `parentId`, `metadata: PageMetadata`, `source: { markdown }`, `analysis: PageAnalysis` (headings, aliases, blockReferences, tasks, tags, links, embeds).
- `PageMetadata` (`PageMetadata.ts`): icon, cover, description, favorite, status (`active`|`archived`), archivedAt, originalParentId/originalPath (used for archive/restore round-trip), createdAt, updatedAt. All nullable/optional except `favorite`/`status`.
- `Folder`/`FolderMetadata` (`Folder.ts`, `FolderMetadata.ts`): near-identical metadata shape to `Page`, independently duplicated (no shared base type).
- `Alias` (`Alias.ts`): `{ value: string }` — minimal, order-preserving list, not deduplicated at the model level.
- `graph/KnowledgeGraph.ts`, `graph/GraphEdge.ts`: `{ sourcePageId, targetPageId, kind: 'link' }[]` — no backlink index, no traversal helpers; explicitly TODO'd ("v1: Add outgoing relationship indexes... Derive backlinks").
- `occurrences/*`: `TagOccurrence`, `TaskOccurrence`, `LinkOccurrence`, `EmbedOccurrence` — all page-scoped DTOs produced by extractors, carrying `sourcePageId` back-references.

**Identity** (`core/vault/ingest/identity/IdentityResolver.ts:20-58`): prefers `frontmatter.id`; falls back to the page's own **path** as its id when absent (`source: 'derived'`). This means: (a) any vault whose files predate ID adoption has page identity == filesystem path, so a path collision or external rename before Clutter assigns a real id changes the page's identity outright (no continuity); (b) `Vault`'s "no duplicate ids" invariant (`Vault.ts:114-121`) is only meaningful once every page has a frontmatter id — a derived-id vault gets it "for free" only because paths are already unique by construction. The resolver's own doc comment flags this as a known, unaddressed compatibility mechanism ("Future save/import workflows should persist stable IDs...").

**Paths** (`core/vault/ingest/VaultPath.ts`): the one designated pure path-string helper — `filename`, `parentDirectory`, `isDescendantOf`. See Weaknesses/Hidden Coupling — this designation is **not honored** elsewhere in the codebase (evidence in report 09).

**Frontmatter** (`core/vault/ingest/frontmatter/{PageFrontmatter,FolderFrontmatter}.ts`, `FrontmatterParser.ts`, `FrontmatterSerializer.ts`):
- `FrontmatterParser.parse()` (`FrontmatterParser.ts:19-178`) is a **hand-written line-based parser**, not a YAML library: splits on `\n`, looks for `key: value`, has one special case for a single nested list key (`aliases`), coerces `true`/`false`/`null` string literals, and silently drops any key/shape it doesn't recognize (an unknown key with an unexpected type is simply not captured — no error, no warning). It does not handle multi-line strings, quoting, escaping, nested objects, or any array other than the hardcoded `aliases` list.
- `FrontmatterSerializer.serializePage()` (`FrontmatterSerializer.ts:43-74`) writes a **fixed, hardcoded field list**: `id, type, created, modified, favorite, icon, cover, description, status, archivedAt, originalPath, originalParentId`. **`aliases` is absent from this list.**
- **Confirmed data-loss bug (Verified):** `AliasExtractor` (`extractors/AliasExtractor.ts`) parses `frontmatter.aliases` into `page.analysis.aliases`, and `PageIndex` (`knowledge/PageIndex.ts:25-33`) builds a `pagesByAlias` lookup from it — so aliases are read and even indexed — but `FrontmatterSerializer.serializePage()` never emits `aliases` back into the YAML block, and `PageFrontmatter`'s own TS interface (`frontmatter/PageFrontmatter.ts`) doesn't declare an `aliases` field at all. Because every app-initiated save (`PagePersistenceCoordinator`'s `writeParseRebuildReplace`) re-serializes the full frontmatter from the `Page`/patch, not from the original file bytes, **the first time a user (or the app) saves a page that has manually-added `aliases:` frontmatter, those aliases are silently deleted from disk.** This is a real round-trip hole in a shipped, spec-compliant write path — not a hypothetical.

**Ingest → domain construction:** `VaultScanner` → `PageBuilder`/`FolderBuilder` (initial scan) and `PageRebuilder` (post-write reconstruction) both route through `PageAnalysisMapper` for occurrence mapping (per spec §2 invariant — verified, both call the same `analysisMapper.build*` methods: `PageBuilder.ts:47-57`, `PageRebuilder.ts:50-60`). `resolvePageMetadata()` (`ingest/resolvePageMetadata.ts`) is the single defaulting table shared between `PageBuilder` and `PageOperations`'s draft-promotion "is this a committed change" check — good, deliberate reuse, called out in its own doc comment.

**Vault as source of truth** (`core/vault/models/Vault.ts`): four backing `Map`s — `pagesById`, `pagesByPath`, `foldersById`, `foldersByPath` — kept atomically in sync on every mutation method (`addPage`/`replacePage`/`removePage`/`updatePagePath`/`addFolder`/`moveFolder`). Two eager live projections (`tagsByName`, `taskList`), rebuilt in full (`refreshProjections()`, `Vault.ts:218-231`) on every single mutation. Two lazy projections (`_embeds`, `_knowledgeGraph`), invalidated on mutation but rebuilt only on next access (`ensureLazyProjectionsFresh()`, `Vault.ts:239-248`) — this exactly matches spec §3a.

One divergence from the frozen spec: spec's `Vault` public API (§3) does not list `addFolder`, `getFolderByPath`, `isReservedFolder`, `notes()`, `dailyNotes()`, `pageCount`/`folderCount`/`tagCount`/`taskCount`/`embedCount`, and specifies `getReservedFolder(kind): Folder` (non-optional return); the shipped method (`Vault.ts:138-141`) returns `Folder | undefined`. These are all **additive, backward-compatible** extensions except the `getReservedFolder` optionality change, which is a real (minor) type-contract divergence — every call site must now null-check (confirmed necessary: `DailyNoteService.ts:57-63` and `NavigationRouter.ts:54-59` both do).

**Indexes / caches:**
- `Vault`'s own id/path maps: O(1) lookup, correctly maintained.
- `VaultQuery` (`core/vault/queries/VaultQuery.ts`): every method (`getChildPages`, `getFavoritePages`, `getArchivedPages`, `getRootFolders`, etc.) does `Array.from(vault.pages()/folders()).filter(...)` — an **O(n) scan over the entire vault**, on every call, with no memoization. Confirmed no caching layer exists between `VaultQuery` and `Vault`'s raw iterators.
- `PageIndex` (`knowledge/PageIndex.ts`): a separate, secondary index (by path/filename/alias) built **fresh on every `KnowledgeGraphBuilder.build()` call** (i.e., every lazy-projection rebuild) — not persisted across accesses, not shared with `Vault`'s own `pagesByPath` map (two independent by-path indexes exist simultaneously).

**Sync/reconciliation:** `VaultSyncService` (`core/vault/sync/VaultSyncService.ts`) handles created/changed/deleted/moved filesystem events via `VaultSyncCoordinator`'s per-path promise queue, calling the same `Vault` mutation methods the Gate uses. `persistSyncedPageDocument.ts` and the Gate's internal `writeParseRebuildReplace` are architecturally two call sites for one conceptual operation (per spec, intentionally not unified into one function since Sync and the Gate have different queues) — confirmed both do write→parse→rebuild→replace in the same order.

**Durability cross-reference** (`docs/durability-model.md`): the model here sits entirely inside "Durable" (Stage 2) once persisted — `LocalVaultProvider.writeFile` (per that doc) calls Tauri's `writeTextFile` with no fsync, no atomic rename. Nothing in the data model itself adds any stronger guarantee; `Page`/`Folder` objects are immutable value objects that get **replaced wholesale**, never patched in place, which is what makes "rebuild from source" (Rule 8, derived-data-disposable) sound — but it also means a `replacePage` after a partial/torn write (per Durable's own documented gap) reflects whatever the re-parse found, not what the caller intended.

## Evidence

- Aliases round-trip gap: `AliasExtractor` reads → `PageBuilder.ts:49`/`PageRebuilder.ts:52` populate `analysis.aliases` → `FrontmatterSerializer.ts:50-63` (the `entries` array) has no `aliases` entry → `PageFrontmatter.ts` interface has no `aliases` field.
- Path-derived identity: `IdentityResolver.ts:40-57`.
- Hand-rolled frontmatter parser: `FrontmatterParser.ts:60-178` (no YAML library import anywhere in `ingest/`).
- `Vault` mutation atomicity: `Vault.ts:274-306` (`replacePage`), `Vault.ts:308-323` (`addPage`), each pairs the `*ById`/`*ByPath` map update synchronously before `notify()`.
- Eager vs. lazy projection split: `Vault.ts:167-248`.
- O(n) query scans: `VaultQuery.ts:36-96`, every method.
- `getReservedFolder` optionality divergence from spec §3: `Vault.ts:138-141` vs. spec line 159 (`getReservedFolder(kind): Folder`).

## Strengths

- Immutable value objects throughout (`readonly` fields everywhere in `Page`/`Folder`/`PageMetadata`) — no accidental in-place mutation of domain state.
- Single mapping table (`PageAnalysisMapper`) shared by both build paths — verified, not just claimed.
- Clear separation of "live" vs. "lazy" projections, matching spec, with a real, testable invalidation contract (`Vault.ts:200-201` region).
- `resolvePageMetadata` reuse between ingest defaulting and application-layer draft-promotion checks avoids a second, drifting defaults table.

## Weaknesses

- **Aliases data-loss bug** (Verified) — see above. This is the single most concrete bug found in this investigation.
- Hand-rolled frontmatter parser has no error signaling for malformed/unsupported YAML — a file with an array field other than `aliases`, a multiline string, or a quoted value with a colon in it will silently produce wrong or missing data with no diagnostic.
- Two independent by-path indexes exist (`Vault.pagesByPath`, `PageIndex.pagesByPath`), rebuilt separately, with no shared cache — wasted work and a source of future drift if one is ever updated without the other being considered.
- `VaultQuery`'s total absence of memoization means every sidebar re-render that calls `getChildPages`/`getFavoritePages` re-scans the whole vault, even though `Vault.subscribe()` already tells callers exactly when something changed.

## Hidden Assumptions

- That most pages will have a persisted frontmatter `id` in practice — the architecture supports (and defaults to) path-derived identity but treats it in code as if it were the exception ("compatibility mechanism"), not the common case for any vault imported from plain Markdown.
- That `aliases` frontmatter is either never user-authored or never round-tripped through the app — neither is stated anywhere; the gap is silent.
- That vault size stays in the "hundreds" range — explicitly stated in `Vault.ts:198` ("this is a correctness-over-performance choice that stays, given current file counts").

## Hidden Coupling

- `PageIndex` and `Vault` both independently know "path is the canonical secondary key" — that assumption is duplicated rather than the `PageIndex` being built from/sharing `Vault`'s own map.
- `resolvePageMetadata` defaults are used by both `PageBuilder` (ingest) and `PageOperations.updateMetadata` (application layer) as the single "what does blank/default metadata look like" source — correct reuse, but it does mean an ingest-layer change to defaults silently changes application-layer draft-promotion behavior; no test currently asserts that coupling explicitly beyond the code comment.

## Behavior Analysis

Every save (even a metadata-only edit, since `updateMetadata` reuses the `'save'` Gate kind) runs the full write→disk→re-read→re-parse→rebuild→replace cycle (`durability-model.md` Stage 2) — this means every save also implicitly and silently re-serializes (and thus can silently drop) any frontmatter field the model doesn't know about, aliases being the one confirmed live case.

## UX Analysis

A user who hand-edits frontmatter aliases outside the app (a very Obsidian-like workflow this app's format otherwise resembles) will lose that data the first time they touch the page inside Clutter, with zero warning. This is a trust-eroding failure mode for a note-taking app whose entire value proposition is "your files, safely."

## Product Analysis

Aliases are modeled, extracted, and indexed (`PageIndex.pagesByAlias`) but have **no UI consumer found** in this investigation (no alias editor was located under `features/`) — so today the bug is latent (only affects hand-authored frontmatter) rather than reachable through the product's own UI. This should be confirmed against the features/UX report (13/others) before treating it as low-severity — if any UI path lets a user set an alias, the bug becomes immediately reachable.

## Performance Analysis

- Startup: one full scan + one full projection build — O(n) in vault size, unavoidable and reasonable.
- Steady-state: every single mutation (including a routine autosave) rebuilds `tagsByName`/`taskList` from **every page in the vault** (`Vault.ts:219` — `projectionBuilder.buildEager(this.pagesById.values())` operates on the whole map, not just the changed page). For a vault with tens of thousands of pages and per-page tag/task extraction cost, this turns "user pauses typing, autosave fires" into an O(n) recompute on the UI thread (JS is single-threaded; no evidence of a worker offload anywhere in `core/vault/knowledge/`).
- `VaultQuery` calls compound this: a sidebar showing child pages re-scans all pages on every render triggered by any vault change, not just changes relevant to that folder.

## Scalability Analysis

At "hundreds" of pages (the explicitly stated design point) this is a total non-issue. At "tens of thousands," three things degrade, without any code change needed to trigger them: (1) `refreshProjections()`'s per-mutation full rebuild, (2) `VaultQuery`'s per-render full scans, (3) `PageIndex`'s per-lazy-access full rebuild. None of these are correctness risks — they are exactly the kind of thing Rule 8 (derived data is disposable) is designed to make cheap to fix later (rebuild from scratch is always safe) — but they are real, predictable latency risks that the current data model does not defend against with any partial-update or indexed-by-parent structure (e.g., there is no `Map<parentId, Page[]>` anywhere — `getChildPages` computes it by filtering the entire page list every time).

## Alternative Designs

- A real YAML library (already a common, small, well-audited dependency) for frontmatter would close the aliases bug class entirely and remove the "silently drops unknown fields" risk, at the cost of the deterministic-field-order guarantee the current hand-rolled serializer intentionally provides (`FrontmatterSerializer.ts:46-49` comment) — would need explicit key-order configuration to preserve that.
- A parent-indexed `Map<parentId, Set<id>>` maintained incrementally inside `Vault` (alongside the existing id/path maps) would turn `VaultQuery.getChildPages`/`getChildFolders` into O(1) lookups without touching the "derived data is disposable" invariant, since the index itself would still be fully reconstructable.

## Trade-offs

The current design optimizes for **simplicity and provable correctness** (full rebuild can never drift, by construction) over **performance at scale**. That is a reasonable, explicitly-stated choice for the app's current size, but it is not free: it means "does this scale to 10k+ pages" is currently answered by "probably feels laggy, not by "no," and there is no perf test in the suite (confirmed: no benchmark/perf test files found under `core/vault/`) to catch a regression or confirm/deny this hypothesis.

## Confidence Level

- Aliases data-loss bug: **Verified** (traced end-to-end: extractor → model → serializer, confirmed absent field in both the serializer's hardcoded list and the frontmatter type).
- Path-derived identity as default: **Verified** (`IdentityResolver.ts`).
- O(n) scan behavior in `VaultQuery`/`refreshProjections`: **Verified** (source read directly).
- Scalability impact magnitude ("laggy at 10k+ pages"): **Likely**, not measured — no benchmarks exist in-repo to confirm actual latency numbers.
- No alias UI consumer: **Likely** (absence-based finding from this investigation's scope; not exhaustively verified against every feature file — flagged for the features/UX investigators).

## Next Investigation Areas

- Confirm with the features/UX report whether any UI path writes `aliases` frontmatter today (would upgrade the data-loss bug from "latent" to "reachable").
- Confirm with the performance/scalability report whether any perf testing exists elsewhere in the repo (e.g., e2e, Rust side) that this investigation didn't check.
- Check whether `docs/adr/` contains an ADR specifically discussing frontmatter format choice (hand-rolled vs. YAML lib) — if not, this is worth flagging as an undocumented architectural risk rather than a deliberate trade-off.
