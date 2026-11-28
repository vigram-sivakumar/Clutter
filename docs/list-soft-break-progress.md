# List soft-break behaviour — progress

Updated 2026-11-28 (Asia/Kolkata).

## Current checkpoint — diagnostic candidate, unverified

- Base: main `ddb97817b5ddbb52c70c59bbadbe7822cd703524`; controlled release v0.0.17, previous full regression 17,949/17,949 (recorded at runtime 560e07ad, not rerun).
- Branch: `testing/list-soft-breaks`, isolated under implementation rulebook §7; no shared branch or main changes.
- Diagnostic test commit: `f963ea692376d7b22b22cc23f0814f1b522e727a`. No production code changes.
- Owner agreed to investigate retaining Shift+Enter if a small architecture-compliant solution exists; otherwise discuss removing the custom prose behaviour. Separately accepted table-cell behaviour stays unchanged.
- No automated execution or native WebKit/Tauri access in this session. New tests express proposed behaviour and may fail intentionally on the baseline; this is not an accepted runtime milestone.

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
