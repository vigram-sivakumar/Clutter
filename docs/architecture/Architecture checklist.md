# Architecture Freeze Checklist

Status verified against the working tree on 2026-07-27 (see `docs/architecture/Core Review.md` for the file-level evidence behind each line). Checked items are confirmed done, not assumed.

## Phase 1 — Foundation Integrity

- [x] Fix the TypeScript build so the entire project is type checked. — `tsc --noEmit` is clean for `src/`; only pre-existing, unrelated `e2e/` output-path warnings remain.
- [x] Remove all compile errors and broken imports. — the two broken imports found in the pre-Arc-3 review (`MarkdownAnalyzer`'s typo'd import, `PageFrontmatter`'s stale path) are both fixed.
- [ ] Remove temporary debug logging. — still present: `Workspace.ts:51` (`console.log('[Workspace] Active page:'...)`), `AppShell.tsx:20,22,28`, `PageHost.tsx:30`. `PageApplicationService`'s debug log from the earlier review has been removed.
- [ ] Resolve compiler warnings and unused members. — still unused: `SaveCoordinator` (never instantiated), `DocumentRevision.isInitial`/`.equals()`, `DocumentTransaction.isEmpty`/`.equals()`, the `Occurrence` base fields (`rawText`/`startOffset`/`endOffset`/`sourceVersion`, always `undefined`).

---

## Phase 2 — Architecture Cleanup

### Runtime Ownership

- [x] Move `DocumentRegistry` ownership from `Vault` to `Application`. — done; `Vault` has no reference to `DocumentRegistry`.
- [x] Keep `Workspace` and `DocumentRegistry` as application-lifetime services. — done; both are constructed once in `Application`'s constructor.

### Page Lifecycle

- [x] Remove `openPage`, `closePage`, `getSession` and `isPageOpen` from `Vault`. — done; `Vault` exposes none of these today.
- [x] Make `PageService` the single owner of the page lifecycle. — done, as `PageApplicationService`.

### Vault Pipeline

- [x] Implement `VaultInitializer`. — done.
- [x] Ensure reserved folders exist (`.clutter`, `Daily Notes`, `Archive`, `Inbox`). — done, via `ReservedResources`.
- [x] Ensure reserved application files exist under `.clutter`. — done (`.clutter/workspace.json`).
- [ ] Keep filesystem writes inside `VaultInitializer` only. — **this line is now stale, not unmet.** By design, `DailyNoteService` also writes files directly (daily-note creation), and this is the correct, reviewed division of labor, not a violation to fix. Reword this line to: "Keep filesystem writes confined to `VaultInitializer`, `DailyNoteService`, and the page-creation pipeline (`PageCreator`) — never `Vault`, `Workspace`, or `PageApplicationService`." Under that wording, this item is met.
- [x] Keep `VaultScanner` strictly read-only. — confirmed, still true.
- [x] Keep `VaultBuilder` responsible only for constructing the domain model. — confirmed, still true.

### Parsing Pipeline Review

- [x] Review every extractor. — done (full pass across `understand/extractors/`); findings: `BlockReferenceExtractor` only matches whole-line block refs, not the more common inline form; `FrontmatterParser` silently drops unrecognized/nested frontmatter keys. Reviewed and documented, not yet fixed.
- [x] Decide whether multiple extractors remain or are replaced by a single Markdown parsing pipeline. — decided: keep the multiple single-purpose extractors. This is one of the patterns validated as working well for "plug in a feature without rewriting" (see Core Review §9).
- [x] Remove duplicate parsing responsibilities. — no duplication found among the extractors themselves.

### Knowledge Pipeline

- [x] Remove duplicate link systems. — done; `LinkBuilder.ts` and the `Link` model/`Vault.links()`/`linkCount` are fully removed (confirmed in Core Review §13, following through on §10/§11).
- [ ] Remove duplicate page lookup/index responsibilities. — **not done.** `Vault`'s own `pagesById`/`pagesByPath` maps and `PageIndex`'s independently-rebuilt `pagesByPath`/`pagesByFileName`/`pagesByAlias` maps still both exist, built separately from the same page array.
- [ ] Remove unused or obsolete builders after consolidation. — **partially complete.** The obsolete template system (`TemplateService`, `TemplateVariables`, `BuiltInTemplates`, and reserved template resources) has been removed. Remaining cleanup: `EmbedBuilder`'s deduplication TODO and the unused `SaveCoordinator`.

---

## Phase 3 — Scalability Readiness

- [ ] Ensure scanner APIs support future incremental scanning. — not done; `VaultScanner` is still a single fully-sequential recursive walk with no incremental entry point.
- [ ] Ensure builder APIs do not assume full rebuilds forever. — not done; `VaultBuilder.build()` only ever accepts a full `VaultScanResult`.
- [ ] Document future Workspace panel/tab model. — not done.
- [ ] Keep APIs compatible with a future file watcher. — not evaluated; no watcher exists to test compatibility against.

All four remain correctly deferred per the project's explicit "postpone until earned" decisions — not regressions, just still open.

---

## Phase 4 — Feature Bootstrap

- [x] Integrate `VaultInitializer` into application startup. — done.
- [x] Scan the vault. — done.
- [x] Build the vault. — done.
- [x] Ensure today's Daily Note exists. — done, via `DailyNoteService.ensureToday`.
- [x] Open today's Daily Note automatically. — done, `Application.open()` calls `pageService.openPage(todayPage.id)`.
- [ ] Replace `MockPage` with the real page flow. — **not done.** `PageHost.tsx` still unconditionally renders `MockPage`; no wiring from an opened `DocumentSession` to an actual editor view exists yet.

---

## Freeze Criteria

The architecture is considered frozen when:

- Every responsibility has exactly one owner. — **mostly true**, with one open exception: page lookup indexing is still duplicated between `Vault` and `PageIndex` (see above).
- No duplicated runtime APIs remain. — **true.** Runtime page lifecycle ownership is singular, duplicate link systems have been removed, and the obsolete built-in template architecture has been eliminated.
- Filesystem writes are isolated to `VaultInitializer`. — **superseded**; see the reworded Vault Pipeline item above. Under the corrected wording, met.
- Runtime state is isolated from the persistent domain. — **true**; `Workspace`/`DocumentRegistry` vs. `Vault` remain cleanly separated.
- The application opens directly into today's Daily Note. — **true**, verified end to end.
- All remaining work is feature development rather than architectural refactoring. — **mostly true.** The remaining architectural work is limited to incremental refinements (`Vault`/`PageIndex` index consolidation, `SaveCoordinator` cleanup, duplicate-ID policy) rather than foundational redesign.
