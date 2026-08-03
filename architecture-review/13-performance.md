# 13 — Performance Analysis

Synthesis report. Consolidates the Performance Analysis sections scattered across reports 01–11 into one coherent picture, plus reconciles overlapping/duplicate findings. No independent profiling was performed in this session — no benchmark or profiler was run; every claim here is either **Verified** (read directly from source, describing what the code does) or explicitly flagged as unmeasured (**Hypothesis**/**Likely**), consistent with how the source reports labeled them. The absence of any perf test files anywhere in `core/vault/` (confirmed in report 07) means none of this has ever been measured in-repo.

## Summary

There is exactly one root performance shape in this codebase, and it shows up in five different places across five different reports: **read paths that are cheap in isolation are called unconditionally, unmemoized, on every relevant re-render or mutation, over the entire vault, rather than being scoped to what actually changed.** No individual instance of this is a bug — each is a reasonable, explicitly-chosen trade-off (per report 07, "correctness over performance... given current file counts," `Vault.ts:198`) — but the pattern repeats without any offsetting index or memoization layer anywhere in the stack, which means the app's performance envelope degrades predictably, uniformly, and without warning as vault size or feature count grows. Nothing found in this investigation is a *correctness* risk at scale — Rule 8 ("derived data is disposable") is exactly what makes all of this cheap to fix later without data-loss risk.

## The Pattern, Traced Top to Bottom

1. **`Vault.refreshProjections()` rebuilds `tagsByName`/`taskList` from every page in the vault, on every single mutation** — not just the changed page (Report 07, Performance Analysis; `Vault.ts:219`, `projectionBuilder.buildEager(this.pagesById.values())` operates on the whole map). A routine autosave becomes an O(n) recompute across the entire vault's tag/task extraction, on the single JS thread, with no worker offload found anywhere in `core/vault/knowledge/`.

2. **`VaultQuery`'s every method is an unmemoized `Array.from(vault.pages()/folders()).filter(...)` over the whole vault** — `getChildPages`, `getFavoritePages`, `getArchivedPages`, `getRootFolders`, all of it (Report 07, Evidence; `VaultQuery.ts:36-96`). No caching layer exists between `VaultQuery` and `Vault`'s raw iterators, despite `Vault.subscribe()` already telling every caller exactly when something changed.

3. **`PageIndex` (a secondary by-path/filename/alias index) is rebuilt fresh on every lazy-projection access** (Report 07), duplicating work `Vault`'s own `pagesByPath` map already does, with no sharing between the two.

4. **`useVault`'s subscription re-renders the entire application shell on any vault mutation anywhere**, not scoped to the affected subtree — it's called once at `AppLayout`'s level, wrapping the whole `Sidebar`+`PageHost` tree (Report 11, Performance Analysis). React's reconciliation limits the *practical* DOM cost of this, but the *computation* cost (every `VaultQuery` call downstream re-scanning) is not free just because the DOM diff is cheap.

5. **Feature-layer list rendering has no virtualization or memoization anywhere found**: `FolderTree` recurses per folder level with no windowing (Report 04); `DailyNotesList.collectMonthSections` walks every year × every month folder on every render (Reports 04, 08); `toCollectionPageModel` recomputes the full child list on every render (Report 08). None of these guard against an unrelated `Vault` mutation triggering a full re-scan of a list nothing in that list actually changed.

6. **`Overlay`'s `useOverlayPosition` recalculates on every render while open**, with no memoization guard found in the files read (Report 03, Performance Analysis) — the least consequential instance of the pattern (overlays are typically few and short-lived), but the same shape.

7. **The `theme-transitioning` CSS class applies a `transition` rule to every element and pseudo-element under `[data-themeable]` for 200ms around every theme toggle** (`theme.css:3-10`, selector list includes `*`, `*::before`, `*::after` recursively) (Report 01, Performance Analysis). Plausible layout/paint cost on a very large DOM (a long document with thousands of editor nodes); not measured.

## What Is Genuinely Fine

- Icon resolution (`AppIcon` → `iconRegistry[icon]`) is a single object-property lookup with zero indirection cost, and all icons are statically bundled with no lazy-loading/flash risk (Report 02).
- `Workspace.notify()` is a flat `Set` iteration, O(subscriber count), trivial at any realistic scale (Report 06).
- CSS custom-property recalculation on theme switch is native-browser-cheap with no required JS re-render for pure-CSS consumers (Report 01).
- Startup cost (one full scan + one full projection build) is unavoidable and reasonable — O(n) once, not a steady-state concern (Report 07).

## Root Cause, Named Once

Every item in "The Pattern" above traces to the same missing piece: **there is no indexed-by-parent or indexed-by-filter structure anywhere in the data layer.** `getChildPages(parentId)` computes its answer by filtering the *entire* page list every single call; there is no `Map<parentId, Page[]>` maintained incrementally alongside `Vault`'s existing id/path maps (Report 07, Alternative Designs). Building that one structure — which remains fully disposable/rebuildable per Rule 8, so it doesn't compromise the "derived data is disposable" invariant — would directly address items 1, 2, 3, and 5 above simultaneously, since they are all downstream consumers of the same missing capability.

## Severity Assessment

At the app's explicitly-stated current design point ("hundreds" of pages, per `Vault.ts:198`), **none of this is a live problem** — every report independently arrives at "fine today, untested at scale," not "already slow." The risk is entirely forward-looking: nothing in the current test suite or CI would catch a regression here, and nothing would announce the crossover point where it starts to matter (no perf test exists anywhere in the repo per report 07's direct check).

## Recommendations

1. **Add one parent-indexed map inside `Vault`, maintained incrementally alongside the existing id/path maps**, and rewire `VaultQuery.getChildPages`/`getChildFolders` to use it. Single highest-leverage fix — addresses items 1, 2, 5 at once without touching the disposable-derived-data invariant.
2. **Add a scoped/selector-based subscription variant** (`useVault(vault, selector)`) so a component can opt into "re-render only when this specific slice changed" instead of every mutation forcing a full-shell re-render (Report 11, Alternative Designs). Not urgent given React's cheap DOM diffing, but directly reduces the *computation* fan-out described in item 4.
3. **Memoize `DailyNotesList.collectMonthSections` and `toCollectionPageModel`'s child-list computation** against their actual inputs (folder id + vault version), not just leave them to recompute on every parent re-render.
4. **Add the first performance/benchmark test to the repo**, scoped to `Vault` mutation + `VaultQuery` read cost at a synthetic "10,000 page" fixture — this is the only way to convert every "Likely"/"Hypothesis" label in this report into a measured, trackable number, and to catch a future regression before it ships.
5. **Profile the `theme-transitioning` wildcard-selector cost on a large document** — the cheapest of these to verify (open a large note, toggle theme, check the performance panel) and currently pure speculation in report 01.

## Confidence Level

- **Verified**: every code-shape claim in "The Pattern" section (all read directly from source by the originating reports).
- **Likely**: that the app "feels fine" today at realistic vault sizes — consistent across every report, none contradicts it.
- **Hypothesis**: the magnitude of degradation at 10k+ pages, and the `theme-transitioning` large-DOM cost — neither has ever been measured in this codebase.

## Next Investigation Areas

- Build the synthetic large-vault fixture and actually run it (recommendation 4) — every other recommendation in this report is speculative until this exists.
- Check the Rust/Tauri side (`vault_watcher.rs`, `src-tauri/`) for equivalent unindexed-scan patterns — out of scope for every report in this set, since all eleven investigated only the TypeScript/React side.
