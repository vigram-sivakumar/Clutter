# Production table rewrite progress

Last updated 25 November 2026 (Asia/Kolkata).

Resume on `feature/production-table-engine` in `vigram-sivakumar/Clutter`. The engine serves supported read-only tables. Whole-table deletion is the first editable command migrated. The remaining editable UI uses the legacy implementation.

This is the implementation ledger. Architecture belongs in [ADR-034](adr/034-table-architecture-html-projection-active-cell-editor.md) and range behavior in the [UX contract and prototype comparison](table-range-selection-clipboard-ux-contract.md). Follow [CLAUDE.md](../CLAUDE.md) and the [implementation rules](implementation-rules.md). Every verified milestone updates this file in its implementation commit and is pushed to the development branch. Merging into `main` requires owner approval.

## Architecture and invariants

- Root CodeMirror 6 owns Markdown, the only persistent source. Read the shared Clutter Lezer grammar to derive one rectangular model with cell source ranges. Reading a note or rendering an absent cell must preserve the source.
- Project a real HTML table using Clutter's inline renderer, CSS classes, alignments, width metadata and scroll container. Preserve mounted cell hosts across updates. Read-only embeds have no editing controls or nested editor.
- One reusable nested CM6 view per editable root, mounted only in the active cell. Forward minimal changes to root; keep typing, composition, focus and native text selection intact.
- One interaction state owns editing, selected cell, rectangle (anchor and head), row, column, whole table and no selection. Validate edits centrally, respect root filters and record selection intent with root history. Each structural action has one undo step; successive typing can group.
- Keep surrounding Markdown intact. Preserve the existing adjacent `{table-col-widths="…"}` syntax and move widths and alignments with their columns. Preserve unsupported input. Use the existing document save path.

## Feature matrix

“Engine” means the implementation can be exercised independently. “Live” means an application entry point uses it. Automated evidence below refers to the named suite at the recorded milestone. Production manual and native validation are pending for every row.

| Function | Production rewrite implementation | Evidence |
| --- | --- | --- |
| Read-only embeds, inline formatting, alignment, width display, rectangular ragged rows, stable scrollport | Live for supported tables; imported overflow, nested or unsupported sources use the compatibility renderer | M1 integration tests check source, DOM identity, widths, scroll position and overflow fallback |
| Nested cell editing, standard editing keys, caret placement, leading/trailing spaces, exact mapped edits | Engine adapter for materialised canonical cells; live editable projection and nested editor lifecycle still legacy | M1 engine tests cover disjoint changes, trailing spaces, stale edits, escaped pipes and filter refusal |
| Caret-free cell, range, row, column and whole-table selection; Shift+arrow/click, row-major Tab/Shift+Tab and edge exit, Enter/F2 to edit, Escape to select then clear without a root caret, select-all | Interaction helpers ported; focus, keyboard and pointer wiring pending | M1 unit tests cover interaction states, Tab boundaries and range geometry; actual focus needs runtime checks |
| Preserve native in-cell text drag, hand off on crossing a cell, extend rectangle, horizontal edge scroll and re-hit-test | Scroll geometry ported; pointer capture, frame loop, cancellation and disposal pending in the new editable projection | **Owner manually passed drag selection and horizontal auto-scroll in the prototype only.** M1 tests cover scroll bounds |
| Range typing/navigation/paste origin | Pending product decision for editable rollout; see differences below | Prototype unit tests encode current geometry; no production acceptance |
| Copy/cut/clear, internal Markdown, rich HTML, quoted TSV, ragged grids, overwrite/grow and outside-table creation | Engine helpers and validated transactions; clipboard event routing pending | M1 tests cover reverse ranges, escaping, refusals, growth, selection effects and a second table |
| Insert/delete/duplicate/reorder rows and columns, width resize, alignment and format | Model commands exist; editable controls still legacy except whole-table cascades | M1 engine tests cover structural sequences, metadata and history; menu/drag parity pending |
| Quick-add, row/column handles, drag reorder, resize handles, context menus and existing Clutter visuals | Existing UI retained; engine wiring and visual parity work pending | Legacy regression coverage; no rewrite UI sign-off |
| Whole-table deletion from either side or final column/header menu action | Live through the central root transaction; legacy state still owns arming and menu selection | M2 keyboard, menu, filter-refusal and exact undo/redo coverage |
| One root history for text, structural commands, paste and selection bookmarks | Engine implemented; live migration partial. Undo restores a caret-free bookmark for engine edits that carry one | M1 grouped typing and 100-step undo/redo tests; M2 live deletion. External edits relocating tables need integration coverage |

## Milestones, Git and verification

| Milestone | Commit and message | Changes and evidence |
| --- | --- | --- |
| Production base | `e6bf7760` · fix: select the entire rendered task prefix instead of leaving a hidden bullet | Branched from recorded `origin/main` to isolate table work. Local `main` at initial audit matched prototype tip `e99a5e40`, 19 commits ahead of this base. |
| Prototype reference | `e99a5e40` · fix(prototype): constrain table overflow and hit-test visible drag-scroll client area | See `origin/prototype/table-engine:apps/app/devtools/table-next-lab.ts` and `docs/table-next-editing-lab.md` on that branch. Use it for behavioral comparison. |
| Prerequisite · complete | `c2b6ff8b` · Narrow the stored avatar before reading its image source | Isolated an inherited TypeScript error in `SpaceProfileStore.ts`. TypeScript and 111 profile tests passed. |
| M1 · complete | `18797076` · Introduce the table engine and stable read-only Markdown projection | Added `codemirror/table-engine/` model, commands, projection, mapped edits, clipboard, interaction and history. Wired read-only through `buildEditorExtensions.ts` and `tableWidgetField.ts`. Shared grammar reserves GFM delimiters from labelled dividers. TypeScript and 1,842 tests in 62 files passed. |
| M2 · complete | `7c5c63de` · Route editable whole-table deletion through root history | `tableDeletionSelection.ts` and `tableSelectionDeletion.ts` share the removal transaction in `table-engine/tableTransaction.ts`. Adjusted transaction placement in `tableCreatePaste.ts`. Width lines count toward the visible bottom edge. Confirmed malformed metadata survives deletion. Regression files are `tableDeletionSelection.test.ts` and `tableLiveWiring.test.ts`. |

| M3 · complete | Preserve table transaction annotations during caret correction | `tableRootSelectionSnap.ts` composes the selection correction with the original transaction. Engine regression tests exercise the actual root filter with validated structural edits, undo/redo and caller annotations. TypeScript and all 1,849 tests in 62 files passed. |

For M2, tests first reproduced orphaned widths from above, failure to arm from below a valid width line, and a filter rewrite being applied. The focused deletion run passed 100 tests; the live-wiring run passed 33. These runs overlap the broader suite. The final TypeScript check passed. The broader regression run passed all 1,847 tests in 62 files.

Run the milestone checks from the repository root.

```sh
node_modules/.bin/tsc --noEmit -p apps/app
npm run test:run -- src/features/markdown/editor/codemirror/table src/core/vault/ingest/grammar markdownLanguage.regression noteEmbed.test MarkdownEditor.paste.fullStack
```

## Open issues, roadmap and handoff

| State | Work to resume |
| --- | --- |
| In progress | Editable migration. Next connect a reusable nested editor to a stable cell host and dispatch through `createCellTransaction` before accepting nested changes. Test activation, switching cells/tables, refused edits, external edits and undo/redo with the real extension stack. Keep compatibility for unpadded, empty and missing source cells. |
| Pending | Move selection ownership and root-history restoration into the new editable projection. Wire and test drag cancellation/blur/disposal, clipboard formats and multi-table paste. Exercise reverse drags and actual browser focus. |
| Decision needed for range rollout | Prototype arrows/Tab/Enter use the head; the earlier contract uses the anchor. Printable input replaces a single selected cell in the prototype. It ignores multi-cell typing; the contract inserts at the anchor's remembered caret. Prototype paste starts top-left; the contract starts at the drag anchor. Keep selection after cut/clear/paste. Record the owner's resolution and add distinguishing tests before changing the live behavior. |
| Pending | Route remaining menu commands, drag reorder/resize, alignment, quick-add and format through the engine. Verify source and widths across each edit and undo, header promotion, last-axis removal, autosave/reopen, multiple tables and explicit-width overflow. Compare real Clutter visuals. |
| Blocked on parity and validation | Run full application regression and native macOS WKWebView checks for IME composition/commit/cancel, history, clipboard, focus, drag and scrolling. Record build, environment and observed outcomes. Then retire superseded legacy components. |

**Architecture status.** The implementation adds no persistence or history owner. Editable controls still use several legacy selection fields during migration to the agreed single interaction state.

**Migration gaps.** Imported cell padding support is still pending. Review found the root caret filter discarded annotations, so M3 addresses that prerequisite first. Structural engine commands currently serialize the addressed table, so an edit can canonicalize source padding. Ordinary mapped typing requires canonical cell padding. The compatibility renderer handles source outside the engine's supported shape. Unsupported clipboard structures include merged cells and oversized grids. Full application regression, native IME and production manual acceptance are outstanding.

**Legacy inventory.** The new projection replaces static rendering for supported read-only tables. M2 replaces whole-table deletion dispatch while retaining its existing keyboard and menu entry points. Keep `tableWidget.ts`, `tableWidgetField.ts`, `tableActiveCellController.ts`, legacy selection fields, keymaps, structural commands, overlays and tests through the gates above. Inline rendering, shared grammar, width syntax, CSS and breakout measurement remain shared dependencies. No legacy subsystem has been removed.
