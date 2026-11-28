# List soft-break behaviour — progress

Updated 2026-11-28 (Asia/Kolkata).

## Current checkpoint — focused regression green; native alignment issue open

- Base: main `ddb97817b5ddbb52c70c59bbadbe7822cd703524`; controlled release v0.0.17, previous full regression 17,949/17,949 (recorded at runtime 560e07ad, not rerun).
- Branch: `testing/list-soft-breaks`, isolated under implementation rulebook §7; no shared branch or main changes.
- Diagnostic test commit: `f963ea692376d7b22b22cc23f0814f1b522e727a`. Runtime candidate and subsequent verification are recorded below.
- Owner agreed to investigate retaining Shift+Enter if a small architecture-compliant solution exists; otherwise discuss removing the custom prose behaviour. Separately accepted table-cell behaviour stays unchanged.
- Owner executed the focused suite on `5b9f5be0`: 132/132 passed; no independent local execution or native verification by agent. This is not yet an accepted runtime milestone.

## Contract and scope

Post-migration editor/UI feature (architecture specification §12); document editing (§9), existing PageOperations commit/save path, persistence and public subsystem signatures remain unchanged. Rules 1, 2, 6, 7, 12 and 14 and editor invariants apply; no second Markdown model, parser, keymap ownership, write path or history. Preserve genuine ordinary continuation paragraphs and existing nesting, marker styles, checked-to-unchecked task continuation, numbering safety, quote/code behaviour, IME, read-only rendering and table behaviour.

Enter creates a sibling of the current list item after explicit hard-break continuation, while Shift+Enter continues its text. Empty pending continuation followed by Enter should replace the pending break with a sibling rather than leaving a literal backslash. A new task is unchecked. Ordinary non-hard-break indentation keeps existing behaviour. Keep existing backslash source representation.

## Evidence and hypotheses

- Source: `enter/markdownEnterKeymap.ts` — `isListContinuationLine` and `continueMarkupPreservingStructure` deliberately defer continuation lines to generic newline; this does not distinguish explicit hard breaks. Decision of 2026-11-03 is locked for ordinary continuation paragraphs; narrow exception needs documentation when accepted.
- `softBreakInsert` tests paragraph ancestry, uses prefix indentation, and reuses an odd trailing backslash immediately before the caret without distinguishing an existing hidden HardBreak. At the visual end of a line already ending in a hard break, this may insert an empty source line instead of a second hard break. This is a source-level hypothesis, not a confirmed native reproduction.
- Existing `hardBreakMarkerDecoration.ts` exposes parser-backed `hardBreakBackslashEndingLine` and selection-dependent `isPendingBreak`. Prefer reuse over parallel detection. Two-space CommonMark breaks and native hidden-marker caret positions must be considered if modifying ownership.
- New 13 full-stack cases extend the existing real-keydown harness in `markdownContinuationLines.fullStack.test.ts`. Includes a normalized CSS-like reproduction (actual raw note source and precise caret position not yet supplied), both sides of an existing hard-break marker, sibling creation across list/task variants and pending break cleanup. Existing tests and assertions unchanged.

## Next gate

Run the targeted diagnostic suite on this revision and capture actual failures (source and caret assertions). Separately reproduce the precise original example in the sandbox; obtain raw source and caret position if different. Use the observed result to choose the smallest fix or escalate complexity. No production candidate or promotion before diagnosis. Then add coverage for relevant edge cases, review diff, run type/build, affected editor regressions and full `npm run test:run`, followed by native smoke tests and owner approval. Main and release approval separate. Do not reopen table rewrite.


## 2026-11-28 — diagnostic outcome and first runtime candidate

Owner supplied full-stack test output at diagnostic checkpoint: 63/74 passed, 11 failed, 7.53s; all 61 original tests passed. CSS-like mid-line and before-hidden-backslash cases passed. After-hidden-backslash case failed (inserted a normal blank line). All nine nonempty hard-break sibling cases failed, as did pending-break Enter (left literal backslash and exited indentation). Actual native CSS example remains unverified.

Candidate commits 616b3f1d (keymap) and 3f8c7344 (pending task detection); c3fe50bd adds six edge tests. Normalize caret to before an existing hidden backslash before computing Shift+Enter. In the existing Enter chain, handle explicit backslash continuations using the shared hard-break/pending detector, syntax-tree list owner, marker separator and nextOrderedMarker safety/renumber utilities; collapse a pending break into a sibling in one transaction. Recognise Task text as eligible for hard breaks and pending display. Ordinary continuation indentation is unchanged by intent. No new model, parser, service, CSS, persistence or table changes. First runtime candidate is unverified; no test claims. Remaining scope to assess after focused run: repeated breaks on empty lines, two-space imported hard breaks, continuation selection and nesting/number width boundaries, emoji and native custom quotes, task line spacing, caret/undo/save/reopen. Do not expand complexity without review. Native original example remains a required gate. Main unchanged. No promotion until full applicable gate and owner approval.


## 2026-11-28 — focused regression green

Owner's terminal output at 5b9f5be0 confirms 4/4 files, 132/132 tests, 7.82s (80 full-stack continuation, 26 soft-line-break, 18 marker decoration, 8 pending spacing). All 11 diagnostic failures now pass; no production or test changes in this ledger update. Before expanding runtime scope, verify actual native CSS-like reproduction and common list/task keyboard flows, including repeated Shift+Enter on an empty continuation, imported two-space breaks, quoted/emoji and nested items, ordered tails, caret and save/undo. Record source and exact caret for any failures; assess whether a bounded fix is possible rather than accumulating special cases. Full type/build, complete affected regression and full app gate remain outstanding. No promotion, integration or release.


## 2026-11-28 — native acceptance blocked by repeated-break alignment

Owner reports all other manual checks passed, except repeated Shift+Enter can visually indent a list item's marker even when it should remain at the original nesting level. Screenshot shows item 2's marker and first-row text shifted right relative to items 1, 3 and 4; its following lines start at the original list content column. Raw Markdown and exact caret sequence not yet supplied. This is not evidence of actual structural nesting versus stale/wrong line decoration; both remain possible. Existing listLineDecoration derives gutter from owning marker line and uses a distinct consumed-width property for continuation lines; inspect actual source and rendered classes/properties before changing ownership or CSS. No runtime change, no promotion; full gate remains pending. Request before/after source and minimal reproduction; preserve native passes already reported.


### Raw source follow-up

Owner supplied the Markdown file: the affected ordered marker is at column zero, six continuation lines have three leading spaces (the correct source marker column); later bullet items are also at column zero. This supports a presentation issue for the supplied source, not actual list nesting. The supplied source differs in numbering from the earlier screenshot; do not assume it captures the exact same transient DOM state. Existing marker-line CSS pulls back the entire gutter when consumed-width property is absent, while continuation rows set that property. Diagnostic test commit 1b92cab2 adds a sanitized body-only fixture using the exact ordered item and a repeated live Shift+Enter sequence between top-level siblings, checking source and the marker/continuation gutter attributes. No production fix yet. Run focused test, and if green distinguish native transient geometry from persisted render by reopening the note and inspecting the affected .cm-line computed styles (padding-left, text-indent, --list-indent-px, --list-line-consumed-px) against adjacent marker rows. Do not apply speculative CSS overrides. All other manual checks owner-reported passed; full/native gate remains open.
