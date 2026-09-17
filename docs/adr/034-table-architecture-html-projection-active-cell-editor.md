# ADR-034: Table Rendering — Real HTML `<table>` Projection + One Reusable Active-Cell CodeMirror 6 Editor

**Status:** Accepted (architectural basis for the upcoming table rewrite — no production Clutter table code has been changed yet). Implementation blueprint: [table-implementation-plan.md](../table-implementation-plan.md).

## Decision

Replace Clutter's current table rendering approach with: a real HTML `<table>` rendered as a CM6 block widget projecting the table's Markdown source range, with exactly **one** reusable CodeMirror 6 `EditorView` mounted into whichever cell is currently active. Root CM6 remains the sole Markdown document, sole transaction stream, and sole undo/redo history. This is referred to below as **Architecture E**.

## Why

The current architecture styles CM6's own line/block DOM as `display: table-row`/`table-cell`. Per [[editor-architecture-decisions]]'s fenced-code investigation and CM6 maintainer statements, CM6 assumes its lines/block widgets remain strictly vertically arranged; asking its own managed DOM to become a 2D table layout fights that invariant. This ADR was triggered by two disposable, non-production prototypes built specifically to settle the question empirically rather than by further guessing, both pinned to Clutter's exact installed versions:

```text
@codemirror/view      6.43.9
@codemirror/state     6.7.1
@codemirror/commands  6.11.0
@codemirror/language  6.12.4
@codemirror/lang-markdown 6.5.2
@lezer/markdown       1.7.2
```

## Architecture D — investigated and rejected

**Architecture D**: keep every Markdown table row as one ordinary `.cm-line`; give cell content independent width-constrained wrapping via `Decoration.mark` wrapping real CM6 content with `display: inline-block; width: Npx`, with a CM6 `layer()` drawing borders/handles on top.

**Result: FAIL**, confirmed by direct, instrumented testing against the pinned versions above, not by analogy:

- A real mouse `left_click` on the visual `" | Done |"` delimiter text on the last wrapped line of an inline-block-wrapped cell placed the CM6 caret at document position 112 — inside unrelated text elsewhere in that same cell, not at the click target.
- A full `coordsAtPos(pos)` → `posAtCoords(coords)` round-trip scan across every document position reproduced the same class of failure: position 160 round-tripped to position 85.
- Both are structural: they follow directly from CM6's own line-layout invariant (`.cm-line` content is not meant to host independently-width-constrained editable sub-regions), not from a fixable styling mistake.

**Retraction:** an earlier finding in this investigation claimed `ArrowDown` was completely inert inside the wrapped cell, cited as corroborating evidence. That claim is retracted — the Browser-pane automation tool used for testing was later found to not deliver `ArrowRight`/`ArrowDown` key events to a CM6 view at all, even to a plain, unmodified root editor with no table involved and a real mouse-click-established focus. This is a test-tooling limitation, not a CM6 or architecture finding. The FAIL verdict for Architecture D is unaffected — it rests entirely on the click-mapping and `coordsAtPos`/`posAtCoords` evidence above, both independent of keyboard delivery.

## Architecture E — prototyped and accepted

**Result: PASS**, against the same pinned versions, after fixing two real bugs found during testing (below). Verified: click-to-activate an inactive cell, caret placed at the clicked logical position, typing, translation into root transactions, cell switching (A→B→C→A) with full content/caret round-trip, column narrowing with a full-document `coordsAtPos`/`posAtCoords` round-trip showing **zero mismatches**, empty-cell click-and-type, undo/redo (via direct invocation — physical `Ctrl+Z` delivery hit the same keyboard-tooling limitation noted above), shared Markdown language extensions, and a structural row-insert.

### Mechanics

- **The table is a real HTML `<table>`**, produced by `Decoration.replace({widget, block: true})` over the table's Markdown source range. This decoration **must** come from a `StateField`, not a `ViewPlugin` — CM6 throws `RangeError: Block decorations may not be specified via plugins` otherwise. This is a hard CM6 constraint, confirmed by hitting it.
- **Only the active cell gets a nested `EditorView`.** Inactive cells render plain text with a click handler that activates them.
- **A single nested `EditorView` is reused** across every cell activation — verified directly via an instance-creation counter that stayed at 1 through six-plus activations, including through a structural edit.
- **Root CM6 remains the sole document/history owner.** The nested editor's extensions include no `history()` field, so `undo`/`redo` are structurally no-ops there; a `Mod-z`/`Mod-y` binding in its keymap calls `undo(rootView)`/`redo(rootView)` directly. Root's own undo/redo of a change made through the nested editor correctly reconciles the nested editor's document afterward.
- **Nested edits are translated into root transactions**, not written to a shared document — CM6 has no primitive for one `EditorView` to render a live sub-range of another view's document (`EditorState.doc` is immutable and owned by one state). Each nested `ViewUpdate.changes` is offset by a tracked `activeAnchor.from` and dispatched as one root transaction, tagged with an annotation so the reconciliation path can distinguish self-forwarded changes from external ones (undo/redo, edits elsewhere).
- **Active-cell identity must be derived from tracked document position, remapped synchronously inside the `StateField`'s own `update()`**, not from a cached `(row, col)` index and not from position bookkeeping done in an `EditorView.updateListener`. `StateField.update()` runs synchronously during transaction application, before any `updateListener` fires for the same transaction — position tracking that a `StateField`'s own decorations depend on must live at that same synchronous layer, or the decorations get built from stale position data for the very transaction that moved it.

### Two real bugs found and fixed during the prototype

1. **Stale click-handler closures.** Inactive cells' click handlers closed over a cell's `{from, to}` range captured at widget-build time. Because the widget deliberately reuses its DOM across keystroke-only updates elsewhere in the table (via `WidgetType.eq()`, to avoid disrupting the live nested editor on every keystroke), those closures went stale the moment an earlier cell's edit shifted offsets — clicking an untouched cell mounted the wrong, offset substring. Fixed by re-resolving the live cell range from current root state at click time.
2. **StateField/updateListener ordering hazard.** Active-cell identity was originally re-derived from position inside an `updateListener`, which fires after the `StateField` already rebuilt decorations for the same transaction. A structural row-insert reproduced this concretely: typing into one cell, then inserting a row above it, silently mounted the (correct-content) editor into the *new* row's cell instead of the original one. Fixed by moving the position remap into the `StateField`'s own `update()`, ahead of decoration rebuild.

## What is explicitly rejected

- The current `display: table-row`/`table-cell` styling of CM6's own managed `.cm-line`/block DOM.
- Architecture D (pure visual overlay/layer + inline-block-wrapped real CM6 content) as a complete rendering architecture — its semantic/state-tracking ideas (see Retained, below) are not rejected, only its rendering mechanism.
- Browser `contenteditable` as the editing system.
- One `EditorView` per cell.

## What is retained

- Markdown as the canonical source of truth.
- Lezer/GFM parsing for table structure.
- Logical table coordinates/geometry (row/column/cell source-range resolution) — a `TableMap`-like derived model, not a second document model.
- A semantic table-selection concept (active cell, and eventually rectangular/row/column selection) as CM6 extension state distinct from ordinary text selection — not built in this prototype, but not contradicted by it.
- Root CM6 transactions and history as the single, authoritative stream.

## Known remaining risks

- **Root ↔ nested-editor synchronization is a real, non-trivial bookkeeping layer.** Both bugs found above were silent — neither threw, both simply associated the live editor with the wrong cell. This is a systemic risk class, not a one-off: any future operation that changes row/column identity (reorder, delete, paste-multiple-rows) must go through the same "resolve active cell from tracked position, never from a cached index" discipline, or risks silently reintroducing this bug class.
- **Structural row/column mutations** (insert/delete/reorder) are the highest-risk edit category for this reason and need explicit test coverage disproportionate to their apparent simplicity.
- Physical keyboard-shortcut delivery for undo/redo inside the nested editor was verified at the state/command layer, not via an end-to-end physical keypress (test-tooling limitation, noted above) — worth a real-browser manual check before shipping.
- IME/composition input was not tested (not feasible in the automation environment used); needs manual verification.

## Status

No production Clutter table code has been changed. This ADR is the architectural basis for the upcoming table rewrite; implementation should follow [[implementation-rules]]'s pre-implementation checklist against this decision before any production code changes.
