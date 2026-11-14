# Clutter foundation continuation instructions

These instructions apply to this folder and its isolated experiments. Existing
production architecture rules still govern production; this pack does not replace
them by implication.

- Read START-HERE.md first, then NATIVE-TEST-PROGRESS.md, the current roadmap item
  and relevant contract/evidence. Inspect git state and preserve the user's work.
- Stay on architecture/clutter-foundation. Keep foundation work isolated here.
  Do not pull unrelated main changes, reset/clean, replace this branch, modify
  production, commit or push merely because a roadmap describes future work.
- The user permits replacing the entire implementation. Existing Markdown/editor
  mechanics impose no target constraint; effort/migration have zero selection weight.
- table-interaction-contract.md owns confirmed table behaviour. Enter moves down
  the same column and stops at the bottom; Shift+Enter is an in-cell break; Tab/
  Shift+Tab arrive at text end; final Tab stays put; handles add rows/columns.
  Adding an axis preserves the original active cell, caret/selection and focus.
  Escape keeps the same cell highlighted without a caret; selected-cell Tab/
  Shift+Tab move the highlight without entering text; Enter resumes editing.
  Triple-click selects all text inside the cell as a text range, not a cell.
  Do not route Escape to handles. Selection mode belongs to each view.
  Do not restore the withdrawn auto-growth or whole-cell-selection defaults.
- Preserve earlier test artifacts and raw controls. Legacy controls intentionally
  implement old policies and are not current product acceptance oracles. An expected
  diagnostic failure is never counted as a passing product acceptance test.
- Distinguish confirmed policy, provisional implementation, executed Linux tests
  and observed native results. Never infer complete native/editor acceptance from
  fixture checks, screenshots of practice edits, a successful build or test totals.
- Update START-HERE, the progress log, changelog and scoped evidence when code,
  requirements or meaningful native results change. Keep one current next action.
  Record blocked/not-run honestly; retain failing attempts and identify the build.
- Preserve explicitly confirmed manual results even if UI verdict clicks are
  missing or duplicated. Keep raw attempts intact; do not count clicks as test
  executions or require reruns just for bookkeeping.
- Guide manual testing one concrete variation at a time. Do not mark all NM-01
  passed from one successful substep. Ask one example-based question only for a
  genuinely unresolved material decision, not a settled requirement.
- Read r07-matched-comparison.md before continuing qualification. The 30-case
  comparison separates applied operations, refusals and lifecycle gaps; discovery
  exit 0 is not a qualified stack. Strict mode currently exits 1. No manual reruns
  are required for bookkeeping or for this automated slice.
- The origin candidate's structural history guard is conservative and provisional;
  native input, full semantic undo, CLI/MCP/durability parity and provider consistency
  remain separate gates. No editor/framework/storage architecture has been accepted.
- Deliver uniquely named incremental patches with a verified prior-content base.
  Match the downloaded filename exactly in quoted commands for
  /Users/sivakuv3/Downloads/Arc browser/. Explain prerequisites. Remember the user
  may be in the experiment subdirectory; change to the git root before git apply.
