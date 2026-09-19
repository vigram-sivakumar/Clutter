# Table Rewrite — Implementation Plan for ADR-034

**Status:** Migration preparation complete (2026-09-17); Architecture E itself not yet implemented. The old implementation named in §B's "Deleted" table has been removed (old rendering `ViewPlugin`, its five dedicated caret keymaps/guards, their tests, and the `.cm-table-*` CSS), and the old wiring stripped from `buildEditorExtensions.ts` — `tableGeometry.ts`/`tableAlignment.ts` (+ its test) are retained unchanged, per §B's "Retained" table. No table rendering is currently wired; a pipe table renders as plain unstyled text pending Architecture E. This document remains the blueprint to follow for that implementation — it does not itself authorize implementation, and each milestone in §E still needs its own `tsc`/test/commit discipline per the project's standing workflow.

This plan implements [ADR-034](./adr/034-table-architecture-html-projection-active-cell-editor.md) (real HTML `<table>` projection + one reusable active-cell CodeMirror 6 editor). It does not revisit or reopen ADR-034's decision — Architecture D vs E is settled. Where this plan proposes something ADR-034 didn't explicitly settle, that is flagged as a **new decision** with its own reasoning, not silently assumed.

## Pre-implementation scoping (per `implementation-rules.md` §1)

- **Migration phase:** post-migration feature work — this does not map to Phase 1–6 of `architecture-target.md` (those phases are complete/closed per ADR-016). It is a UI/Features-layer rewrite of one presentational subsystem.
- **Subsystems affected:** UI/Features only — specifically `features/markdown/editor/codemirror/table/` and its wiring in `buildEditorExtensions.ts`/`createEditorView.ts`/`MarkdownEditor.tsx`, plus `codemirror/embed/` (note-embed rendering of tables). **Not affected:** `DocumentEditing`, `PageOperations`, `Vault`, the Persistence Gate, `Workspace`, the Composition Root. Table content is, and remains, ordinary Markdown text flowing through the exact same keystroke → `DocumentSession.commit()` → autosave path every other editor keystroke already uses today — this rewrite is invisible to that entire stack.
- **Ownership rules that apply:** none of the Vault/Gate/facade rules (1–6, 8–13 in `ARCHITECTURE_RULES.md`) — this is presentation-layer CM6 internals, not a Vault-domain capability. Rule 7 (dependencies point downward) applies in the ordinary sense that editor code must not reach upward into `application/`/`vault/`. The general implementation-rules principle of extending existing abstractions rather than inventing new ones (§2 rule 6, §1 "already-approved abstraction") applies directly and is the basis for §7 below.
- **Invariants that must remain true:** Markdown stays the sole source of truth (ADR-034); root CM6 stays the sole document/transaction/history owner (ADR-034); `DocumentEditing`'s contract is untouched; the existing composition order between table decorations and other inline decorations (WikiLink/Tag/Date/emphasis — see §2/§9 below) is preserved for whatever content still renders as CM6 decorations.
- **Existing implementation being replaced:** all seven files under `codemirror/table/` except `tableGeometry.ts`/`tableAlignment.ts` (retained), and their seven test files — full inventory in §B. **Deletion complete as of 2026-09-17** (migration preparation, ahead of the Architecture E build itself — see the Status line above).
- **Existing implementation that must remain untouched:** `tableGeometry.ts`'s and `tableAlignment.ts`'s existing public APIs (extended, never broken); `NoteEmbedWidget.ts`/`embedLivePreview.ts`'s existing non-table behavior (Image/PDF embeds, collapse toggle, fold persistence); `createEditorView.ts`'s existing options and their defaults for the two existing callers (root editor, note embed).
- **Smallest correct change:** this plan touches only table rendering/interaction and the two small, additive options `createEditorView.ts` needs (§F). It does not touch selection/clipboard/resize (§11 below is explicitly future work, not built here), does not touch fold persistence, and does not touch any non-table decoration.

---

## A. Proposed architecture

One `StateField` (`tableWidgetField`) per root `EditorView` produces a `Decoration.replace({block:true})` widget for every table in the document, rendered as a real HTML `<table>`. Exactly one small, reusable, non-history CM6 `EditorView` (owned by a per-root-editor controller object, `TableActiveCellController`) is mounted into whichever `<td>` is currently active; every other cell renders as static HTML. Keystrokes in the nested editor are translated into root-document transactions through a tracked position anchor that is remapped **synchronously inside the StateField's own `update()`**, not from an `updateListener` — this ordering is load-bearing, not a style preference (§D, §5). Root CM6 remains the sole document, the sole transaction stream, and the sole undo/redo history, exactly as ADR-034 requires.

## B. File/module changes

### Retained, unchanged in signature

| File | Disposition |
|---|---|
| `table/tableGeometry.ts` | **Retained**, extended (new `findAllTables()` — §7). Already Lezer-tree-based and rendering-mechanism-agnostic by explicit design (its own doc comments say so) — this is exactly the "already-approved abstraction" `implementation-rules.md` asks to extend rather than reinvent. |
| `table/tableAlignment.ts` | **Retained**, unchanged. Pure function over the alignment row's raw text; independent of rendering mechanism. |
| `table/tableAlignment.test.ts` | **Retained**, unchanged. |

### Deleted (old rendering + old shared-caret keymaps)

| File | Why it goes |
|---|---|
| `table/tableDecoration.ts` | The `ViewPlugin` producing `display:table-row`/`table-cell` decorations — this *is* the architecture ADR-034 rejects. |
| `table/tableDeletionGuard.ts` | Protected hidden `\|` characters and row-boundary newlines living in a shared editable line. Under Architecture E the nested cell editor's own document contains no pipe characters at all — this entire problem class disappears (§7). |
| `table/tableArrowKeymap.ts`, `table/tableTabKeymap.ts`, `table/tableEnterKeymap.ts`, `table/tableArrowDownKeymap.ts`, `table/tableVerticalKeymap.ts` | All five assume one shared root-editor caret moving through the table's raw Markdown text. Under Architecture E, the root caret never sits inside a table's source range while it's rendered (the range is a replaced block); navigation instead moves *which cell is active*, dispatched from the nested editor's own keymap. Replaced by `tableCellNavigation.ts` (below), which reuses these files' underlying logic (row-major ordering, ragged-row column preservation, header/last-row special cases) via `tableGeometry.ts`'s existing traversal functions — the *scenarios* these files' tests cover carry forward; the *dispatch mechanism* does not (see Migration Rules note in §14/§E).
| Their seven `*.test.ts` files | Deleted alongside their implementation, in the same commit, only after each scenario they cover has an equivalent test against the new implementation (`implementation-rules.md` §1, §5 Failure Conditions — no test may simply disappear). |

### New

| File | Purpose |
|---|---|
| `table/tableWidget.ts` | `WidgetType` subclass building the real `<table>` DOM; mounts/unmounts the active-cell nested editor into the correct `<td>`; renders inactive cells' formatted (not plain-text) Markdown (§9/§C). Same shape as `NoteEmbedWidget.ts` (`toDOM`/`destroy`/`eq`). |
| `table/tableWidget.css` | New CSS for the real `<table>`/`<td>` layout, replacing `MarkdownEditor.css:1567-1614`'s `display:table-row/cell` block. Co-located per this codebase's existing convention (`NoteEmbedWidget.css`, `ImageWidget.css`, `PdfEmbedWidget.css` are each separate files next to their widget). |
| `table/tableWidgetField.ts` | The `StateField<DecorationSet>` (§D). Owns the position-remap-before-rebuild ordering (§5). |
| `table/tableActiveCellController.ts` | Owns the single reusable nested `EditorView`, `activeAnchor` tracking, forward-to-root translation, undo/redo delegation, graceful deactivation on structural loss (§4/§6/§13). One instance per root `EditorView`, not an app-wide singleton (§D). |
| `table/tableCellNavigation.ts` | The nested editor's own keymap: Tab/Shift-Tab/Enter/Arrow move *which cell is active* via the controller, using `tableGeometry.ts`'s existing row/cell traversal. Replaces the five deleted keymap files' dispatch logic while reusing their underlying navigation math. |
| `table/renderInlineMarkdown.ts` | Small, CM6-independent function rendering one cell's raw Markdown text (bold/italic/code/links/WikiLinks) to sanitized inline HTML for **inactive** cells, using the same inline parser configuration `buildEditorExtensions.ts` already sets up (§9 — flagged as a real gap the prototype didn't need to solve, see Cross-check). |
| New test files mirroring the above (`tableWidgetField.test.ts`, `tableActiveCellController.test.ts`, `tableCellNavigation.test.ts`, `tableWidget.test.ts`, `renderInlineMarkdown.test.ts`) | Migrate scenarios from the deleted test files (empty-cell entry/exit, row-major crossing, ragged-row column preservation, alignment classes, header/delimiter-row special cases, composition with WikiLink/Tag/Date/emphasis, undo/redo, structural insert) against the new mechanism. |

### Small, additive changes to existing shared files

- **`createEditorView.ts`** gains one new option, `enableHistory?: boolean` (default `true`, preserving both existing callers' behavior exactly). The nested cell editor is the first caller to pass `enableHistory: false` — required because `history()`/`historyKeymap` are currently added **unconditionally** (confirmed: not gated by any existing option), and ADR-034 requires the nested editor to have no independent history field at all, not merely a neutered one.
- **`buildEditorExtensions.ts`** gains the table-specific wiring: `tableWidgetField` in the always-included `rendering` array (replacing `tableDecoration()`); `tableCellNavigation()`/the controller wiring only in the `!readOnly` editing branch (mirroring exactly how the six old table keymaps are already gated today — §9).
- **`MarkdownEditor.tsx`**'s existing unmount cleanup gains one call: `tableActiveCellController.destroy()`, alongside the existing `editorHistoryCache`/`foldStateStore` writes (§13).
- **`MarkdownEditor.css`**'s table block (lines 1567–1614) is deleted, replaced by `tableWidget.css`.

## C. Data flow

```
Root Markdown document (unchanged: DocumentSession → autosave, exactly as today)
        │
        ▼
tableWidgetField (StateField, rebuilds on docChanged)
        │
        ├─ findAllTables(state)              [tableGeometry.ts, new function]
        ├─ controller.remapActiveAnchor(tr)  [BEFORE rebuild — §5]
        └─ for each table:
              resolve active-cell key from controller.activeAnchor, if any
              → Decoration.replace({ widget: TableWidget(table, activeCellKey), block:true })
        │
        ▼
TableWidget.toDOM()
        │
        ├─ active <td>  → controller.nestedView.dom (the one reusable EditorView)
        └─ every other <td> → renderInlineMarkdown(cellText) as static HTML + click-to-activate

Nested EditorView (active cell only)
        │  keystroke → ViewUpdate.changes
        ▼
controller.forwardToRoot(changes)  — offset by activeAnchor.from, tagged, dispatched on root
        │
        ▼
Root transaction  →  tableWidgetField.update() sees it, remaps anchor, rebuilds  (cycle repeats)
        │
        └─ (if NOT self-forwarded: undo/redo, edit elsewhere) → controller.reconcileNestedFromRoot()
              [from EditorView.updateListener — safe here, doesn't gate decoration correctness]
```

## D. State ownership

| State | Owner | Lifetime |
|---|---|---|
| The Markdown document | Root `EditorView` / `DocumentSession` (unchanged) | Page-session, persisted |
| Table decorations (`DecorationSet`) | `tableWidgetField` (`StateField`) | Recomputed every relevant transaction; never persisted |
| Which cell is active, tracked position anchor | `TableActiveCellController` (plain object, not a `StateField`) | **One instance per root `EditorView`** (constructed alongside the editor, destroyed on unmount) — not an app-wide singleton and not Composition-Root-wired; this is editor-instance-scoped UI state, the same category as `editorHistoryCache`'s per-editor cache, not a subsystem `ARCHITECTURE_RULES.md` rule 11 governs |
| The nested `EditorView`'s own document | The nested `EditorView`'s own `EditorState` | Ephemeral — replaced wholesale on every cell switch, never read by anything outside the controller, never serialized (§10) |
| Future: rectangular/row/column/table selection | A **separate** `StateField<TableSelection \| null>` (§11) | Same lifetime as `tableWidgetField`, deliberately not folded into it (mirrors `imageUiStateField`'s precedent of one field per orthogonal concern) |

## E. Implementation sequence

Each milestone: additive where possible, `tsc` clean, full relevant test suite green, commit only on green, one milestone per commit (per the project's standing git-commit-workflow instruction and `implementation-rules.md` §3–4).

**M0 — `tableGeometry.ts` extension.** Add `findAllTables(state): TableInfo[]`. Pure addition, no existing call site changes. *Tests:* multi-table document, zero-table document, table adjacent to other block content. *Risk:* low — same tree-walk pattern as existing `findEnclosingTable`, just without the position filter.

**M1 — `tableWidgetField` + `tableWidget.ts` (render-only, no activation).** Build the `StateField` and the real `<table>` widget rendering every cell as static text via `renderInlineMarkdown`. Not yet wired into `buildEditorExtensions.ts` — built and tested standalone. *Tests:* decoration shape for multi-row/column/nested-tables-adjacent cases migrated from `tableDecoration.test.ts`; `renderInlineMarkdown` unit tests for bold/italic/code/links/WikiLinks, migrated from the composition cases in `tableDecoration.test.ts`. *Risk:* CM6's block-decoration-must-come-from-a-StateField constraint (confirmed in the ADR-034 prototype) — verify early, don't assume.

**M2 — `TableActiveCellController` + nested `EditorView` lifecycle.** Build the controller: lazy nested-view creation, mount/unmount into a `<td>`, `activeAnchor` tracking and remap-before-rebuild wiring into `tableWidgetField.update()`, forward-to-root translation, reconciliation via `updateListener`. `createEditorView.ts` gains `enableHistory`. Still not wired into the live editing path — exercised via direct unit tests against a test `EditorView`, same style as the ADR-034 prototype's verification. *Tests:* click-activate, type-and-forward, switch cells (A→B→C→A) with a nested-view-instance-creation counter asserting reuse, undo/redo reconciliation, empty-cell activation. These are the exact scenarios the ADR-034 prototype already validated — port them, don't re-derive them from scratch. *Risk:* the two bug classes the prototype found (stale closures, StateField/updateListener ordering) — write a regression test for each specifically, not just a happy-path test.

**M3 — Structural-change safety.** Row insert/delete correctly re-associating (or gracefully deactivating) the active cell (§6), including the two edge cases the prototype didn't exercise: active row deleted entirely, active cell's whole table deleted. *Tests:* each edge case explicitly, asserting the controller deactivates cleanly (no dangling nested view, no crash) rather than mounting into a wrong cell. *Risk:* this is the highest-risk milestone — the prototype's own bug history shows this class of issue is silent, not exception-throwing.

**M4 — `tableCellNavigation.ts`.** Tab/Shift-Tab/Enter/Arrow keymaps on the nested editor, using `tableGeometry.ts`'s existing traversal functions. *Tests:* migrate every scenario from the five deleted keymap test files (row-major crossing, empty-cell entry/exit, ragged-row column preservation, header/last-row special cases). *Risk:* confirm each migrated scenario's *assertion* (not just its *setup*) still makes sense against "moves which cell is active" rather than "moves a shared caret" — a mechanical port without re-checking assertions could pass trivially while testing the wrong thing.

**M5 — Read-only/note-embed gating.** Wire `tableWidgetField` into `buildEditorExtensions.ts`'s always-included `rendering` array; wire `tableCellNavigation`/controller activation into the `!readOnly` branch only. *Tests:* a table inside a note embed renders as a real `<table>` but clicking a cell does nothing (no activation); a table in the top-level editor activates normally. *Risk:* this is exactly the "one EditorView per cell" trap in miniature if done wrong — verify explicitly that no nested editor is ever constructed for a read-only embed's table (§Cross-check).

**M6 — Cutover.** In one commit: delete `tableDecoration.ts` + five keymap files + their seven test files (after confirming M0–M5's tests cover every migrated scenario); switch `buildEditorExtensions.ts`/`MarkdownEditor.tsx` to the new wiring (including the unmount-cleanup controller-destroy call); delete `MarkdownEditor.css`'s old table block. Never a state with both systems wired simultaneously (`ARCHITECTURE_RULES.md` rule 12's spirit, `implementation-rules.md` §2 rule 8, Migration Rules checklist). *Tests:* full existing table-adjacent test suite green (WikiLink/Tag/Date/emphasis composition, Setext-vs-table precedence, nested/adjacent tables) — these are regression checks, not new tests. *Manual verification required before this milestone closes* (§F): IME/composition in the nested editor (never verified — tooling limitation in the ADR-034 prototype), physical `Ctrl+Z`/arrow-key keyboard shortcuts end-to-end in a real browser (same reason).

## F. Risks and required tests, by category

- **Silent mis-association (highest risk, proven to recur).** Both real bugs found in the ADR-034 prototype were silent — no exception, just the editor mounted into the wrong cell. M2/M3 must have explicit regression tests for both bug shapes (stale closures on inactive-cell click targets; StateField-vs-updateListener ordering), not just happy-path coverage, and M3 must add tests for the two structural edge cases the prototype never exercised (active row deleted; active cell's table deleted).
- **Visual regression for inactive cells (new, not present in old code).** Today, every cell — active or not — renders live formatted Markdown via CM6 decorations. Under Architecture E, only the active cell is a CM6 view; inactive cells need `renderInlineMarkdown` (§B/§9) to avoid regressing to plain text. This needs its own test suite (bold/italic/code/links/WikiLinks, matching `tableDecoration.test.ts`'s existing composition coverage) before M6, not an afterthought.
- **Read-only/embed activation leak.** M5 must prove, not assume, that a table inside a note embed never spawns a nested editor — a single missed gate here silently reintroduces "one EditorView per cell" in the one context (embeds) most likely to have many tables rendered simultaneously off-screen.
- **Lifecycle leaks.** Root editor unmount must destroy the controller's nested view (§13, wired in M6). A table widget's `destroy()` (called when its own range is removed) must not blindly tear down the shared controller's nested view if that widget wasn't the one hosting it — only the table currently holding the active cell may do so. Needs an explicit test: delete an *inactive* table while a *different* table's cell is being edited; assert the active nested editor survives untouched.
- **Untestable-by-automation items — require manual, real-browser verification before M6 closes.** IME/composition input in the nested editor; physical keyboard delivery of `Ctrl+Z`/`Ctrl+Shift+Z` and Tab/Arrow navigation end-to-end. The ADR-034 prototype could not verify these (its automation tool didn't deliver key events to any CM6 view, plain or nested) — this plan inherits that gap explicitly rather than assuming it's fine because the underlying mechanism was code-reviewed.
- **Paste of literal `|` into a cell.** Not resolved by this plan — flagged as an open product decision (escape on paste vs. accept as literal text) to settle during M4, not silently decided by whichever behavior falls out of not handling it.

---

## §7 detail — `tableGeometry.ts` / `tableAlignment.ts` reuse

Reused **unchanged**: `findEnclosingTable`, `getRowCellBounds`, `getNavigableRows`, `resolveLogicalCell`, `resolveCellAt`, `findCellIndexAt`, `LogicalCell`/`CellBounds`, `isAlignmentRow`, `buildEmptyRowText`/`emptyRowCellOffset`/`insertRowAfterPosition` (the last three needed again, unmodified, for row-insert — §11), and `tableAlignment.ts`'s `parseTableAlignment` in full. All of this is already Lezer-tree-based, not CSS/pixel-dependent — exactly the reuse `tableGeometry.ts`'s own doc comments anticipated.

**Extended:** `findAllTables(state)` is new (§M0) — existing functions only resolve the table *enclosing a given position*, sufficient for the old caret-driven keymaps but insufficient for a `StateField` that must enumerate every table up front.

**Repurposed, not reused as-is:** `resolveTableRowAtCursor`, `isAtCellStart`/`isAtCellEnd`, `startOfCellContent`/`endOfCellContent`, `isImmediatelyAfterTable`/`isImmediatelyBeforeTable` were built for root-editor guard keymaps operating on the root caret. That specific call site disappears (the root caret never sits inside a table's source range once it's block-replaced), but the same *logic* (what counts as "start of cell content") is directly reusable inside `tableCellNavigation.ts`, called against the *nested* editor's own small local document instead of the root's.

**Made largely moot:** `tableDeletionGuard.ts`'s entire responsibility (protecting hidden `|` characters and row-boundary newlines from accidental deletion) disappears, not because it's rebuilt elsewhere, but because the nested editor's local document never contains a pipe character or a row-boundary newline at all — it is just the cell's plain text. This is a genuine complexity reduction, not a gap.

## §9 detail — read-only / note-embed rendering

A note embed already renders its content via a nested, read-only `EditorView` built from the same `buildEditorExtensions({readOnly: true, ...})` factory (`NoteEmbedWidget.ts`). A table inside an embedded page must still render as a real `<table>` (for correct layout inside the embed), via the same `tableWidgetField`, but must **never** activate an editable nested cell editor — gated by including `tableCellNavigation`/controller-activation wiring only in `buildEditorExtensions.ts`'s existing `!readOnly` branch (the exact same gate the six old table keymaps already use today, extended to the new pieces rather than inventing a second gating mechanism). This also settles the theoretical "nesting depth" concern (a nested read-only embed containing a table, whose cell, if activated, would need a grandchild `EditorView`) — it never arises, because activation is impossible in a read-only context by construction.

---

## Cross-check against ADR-034

- **Considered and rejected during this plan:** rendering every *inactive* cell as its own small read-only nested `EditorView` (reusing the note-embed pattern) to get live Markdown formatting "for free." **This would directly contradict ADR-034's explicit rejection of "one EditorView per cell."** Rejected for that reason; §B/§9 instead specify a plain, CM6-independent `renderInlineMarkdown` function — genuinely new code, but a pure rendering function, not a second editing surface, and not a capability ADR-034 already assigns elsewhere.
- **No contradiction found** in: nested editor's ephemeral, non-persisted document (§10, matches ADR-034's requirement directly); root-only history via `enableHistory: false` (matches ADR-034's "root history remains authoritative" verbatim); active-cell identity re-derived from tracked position inside the `StateField`'s own `update()` (matches ADR-034's explicit "remapped synchronously during StateField updates" requirement verbatim — this plan does not weaken or reinterpret it); reuse of `tableGeometry.ts` (ADR-034 lists it under "Retained" without further constraint; this plan's extension is additive, not a rewrite).
- **One point ADR-034 left implicit, made explicit here:** "one reusable nested EditorView" is scoped **per root `EditorView` instance**, not one process-wide singleton. ADR-034's own prototype only ever had one root editor in scope, so this didn't need disambiguating there; if Clutter ever renders two root editors simultaneously (e.g. a future split-pane view), each gets its own controller and nested view. This is consistent with ADR-034's intent (it forbids per-*cell* views, not per-*root-editor* controller state) but is a genuine clarification this plan is adding, not something ADR-034 already said.
