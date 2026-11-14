# Native test progress and next action

Updated 2026-11-14, revision 0.16. Maintain this alongside START-HERE at every native
handoff. Evidence sources are explicit; no native JSON report has been uploaded yet.

## Observed so far

| Item                        | Status and evidence                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch 03 application        | User terminal reports committed as cdafd1c7. Initial MacOSX26.5.sdk compilation failed on property/actor errors.                                                                              |
| Compiler correction 04      | User terminal reports commit f68d7d8c. Subsequent terminal and screenshot show the .app compiled, signed and launched. Do not keep describing native launch as unattempted.                   |
| Native session              | Terminal reports native-2026-11-14T07-39-23-399Z.json. This file is on the user's Mac; its contents have not been supplied or inspected here.                                                 |
| Guarded step fixture checks | Screenshot at 13:28:43 shows 4 passed / 0 failed / 0 blocked. Scope: automated fixture commands inside WKWebView, not OS keyboard/IME/accessibility.                                          |
| Origin fixture checks       | Not reported; do not infer from the step window.                                                                                                                                              |
| Old NM-01 partial trial     | User reports last-cell navigation created one row and entered New. This was only one variation and the old proposal is now superseded; never mark full NM-01 passed from it.                  |
| Native keyboard feedback    | User identifies whole-cell text selection as wrong and confirms the table contract linked below.                                                                                              |
| Current NM-01               | After 06, user reports row focus “perfect” and column focus “Tested it works.” Candidate window not specified; no JSON reviewed. These are bounded manual reports, not full NM-01 acceptance. |
| Two-mode selection          | User explicitly confirms Escape retains highlighted cell without caret, Tab cycles cell highlight, Enter returns to editing. Implementation 07 needs native retest.                           |
| NM-02–NM-08                 | Not formally reported. Practice edits/screenshots are not passing verdicts.                                                                                                                   |
| Native JSON report review   | Pending. No architecture, framework or editor accepted.                                                                                                                                       |

## Settled decisions — do not reopen as default questions

[Table contract](table-interaction-contract.md) owns the exact rules. Enter moves
down the same column and does nothing at the bottom. Shift+Enter is an in-cell
line break. Tab/Shift+Tab arrive at cell text end with no whole-text selection.
Escape switches to highlighted-cell selection without a caret; Tab/Shift+Tab then
move the highlight, and Enter restores editing. No Escape-to-handle action.
Final-cell Tab stays put. Row/column handles are the explicit creation mechanism;
adding either axis preserves the original active cell, caret/selection and focus.
The user permits replacing the entire existing app/editor implementation.

## Next user action

1. Quit the old lab with Command-Q so old code/cases are not mixed with a new build.
   Keep its saved report; it remains historical evidence.
2. Apply `Clutter R07 Table Selection Modes 07.patch` after 06, then run
   `npm run native:mac` from the experiment folder. No dependency changes.
3. In the guarded step window, run Fixture checks, then select the revised NM-01.
4. Guide **one variation at a time**. First: click Four and press Escape. Expected:
   Four stays highlighted, the caret disappears and focus does not jump to a handle.
   Next separately check Tab/Shift+Tab move only the cell highlight, then Enter
   returns to editing. Preserve the reported 06 insertion-focus passes; do not infer
   a full native case or both candidate windows passed from them.
5. Record pass/fail/blocked in the native UI, with actual chords/input source.
   Request the saved JSON after meaningful progress/failure, not an invented pass.

## Next agent action

Read START-HERE, this log, table contract, latest evidence and experiment README.
Inspect git state; stay on architecture/clutter-foundation and preserve user work.
Keep new work under docs/foundation/ and leave production untouched. Do not pull
main into this branch just because another chat updated production independently.
Do not reset/clean, redo completed discovery, revert confirmed table decisions to
library defaults or equate original controls with the current requirements.

Separate four things in updates: confirmed policy; prototype choices; executed
Linux evidence; observed native evidence. Keep raw controls and earlier artifacts.
Current structural origin undo is guarded conservatively; broader semantic history,
headless API/persistence parity, full editor matrix and provider consistency remain
open. Passing the revised table case alone does not complete R07 or authorize R08.
