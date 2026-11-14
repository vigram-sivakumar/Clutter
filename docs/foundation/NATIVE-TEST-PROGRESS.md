# Native test progress and next action

Updated 2026-11-14, revision 0.27. Maintain this alongside START-HERE at every native
handoff. Evidence sources are explicit. The first 07 report has now been uploaded/reviewed;
manual conversation results and stored verdicts remain distinct.

## Observed so far

| Item                        | Status and evidence                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch 03 application        | User terminal reports committed as cdafd1c7. Initial MacOSX26.5.sdk compilation failed on property/actor errors.                                                                                                                                                                                                                  |
| Compiler correction 04      | User terminal reports commit f68d7d8c. Subsequent terminal and screenshot show the .app compiled, signed and launched. Do not keep describing native launch as unattempted.                                                                                                                                                       |
| Native session              | Terminal reports native-2026-11-14T07-39-23-399Z.json. This file is on the user's Mac; its contents have not been supplied or inspected here.                                                                                                                                                                                     |
| Guarded step fixture checks | Screenshot at 13:28:43 shows 4 passed / 0 failed / 0 blocked. Scope: automated fixture commands inside WKWebView, not OS keyboard/IME/accessibility.                                                                                                                                                                              |
| Origin fixture checks       | Not reported; do not infer from the step window.                                                                                                                                                                                                                                                                                  |
| Old NM-01 partial trial     | User reports last-cell navigation created one row and entered New. This was only one variation and the old proposal is now superseded; never mark full NM-01 passed from it.                                                                                                                                                      |
| Native keyboard feedback    | User identifies whole-cell text selection as wrong and confirms the table contract linked below.                                                                                                                                                                                                                                  |
| Current NM-01               | After 06, user reports row focus “perfect” and column focus “Tested it works.” Candidate window not specified; no JSON reviewed. These are bounded manual reports, not full NM-01 acceptance.                                                                                                                                     |
| Two-mode selection          | User explicitly confirms Escape retains highlighted cell without caret, Tab cycles cell highlight, Enter returns to editing. After 07, user reports Escape, selected-cell Shift+Tab, Enter-to-edit (ThreeX), selected-cell Tab and the final-cell boundary work; asks to move on. Candidate window unspecified; no JSON reviewed. |
| NM-02 cross-view history    | User reports the guided FOREIGN undo and redo checks work in Guarded step, then Origin-aware history. No report JSON or exact guarded-step warning/result supplied; record bounded reported passes.                                                                                                                               |
| NM-03                       | Blocked/unavailable: user says no Japanese/Chinese/Korean input source enabled. No real native composition passed; preserve this gate.                                                                                                                                                                                            |
| NM-04 menu Undo/Redo        | User individually confirmed four guarded-step menu checks, then reports the same checks passed in Origin-aware. Both candidates have reported menu Undo/Redo passes in A/B. Menu dismissal/window-focus variants remain pending; no JSON reviewed.                                                                                |
| NM-05                       | User reports all guided clipboard/selection checks, including final table-paste undo restoring Four without growth, work in both candidates. Reported case coverage; saved JSON review/recorded verdicts pending.                                                                                                                 |
| NM-06–NM-08                 | Not formally reported; the uploaded 07 report stores these cases as not-run.                                                                                                                                                                                                                                                      |
| Native JSON report review   | native-2026-11-14T08-53-44-634Z.json reviewed: exact 07 source/web hashes matched before changes; 20 origin and 26 step fixture runs all pass (four repeated checks each). All 15 manual cases not-run; zero attempts. Startup latestCapture says not ready; no later manual capture.                                             |
| Table triple-click          | User reports triple-click incorrectly selects the cell. Reproduced both candidates; shared text-range override tested on Linux. Native NM-09 added; retest pending in 09.                                                                                                                                                         |

## Settled decisions — do not reopen as default questions

[Table contract](table-interaction-contract.md) owns the exact rules. Enter moves
down the same column and does nothing at the bottom. Shift+Enter is an in-cell
line break. Tab/Shift+Tab arrive at cell text end with no whole-text selection.
Escape switches to highlighted-cell selection without a caret; Tab/Shift+Tab then
move the highlight, and Enter restores editing. No Escape-to-handle action.
Final-cell Tab stays put. Row/column handles are the explicit creation mechanism;
adding either axis preserves the original active cell, caret/selection and focus.
The user permits replacing the entire existing app/editor implementation.

## Reported table checks after patch 07

The user individually confirmed Escape from Four, Shift+Tab to Three without a
caret, Enter to editing with ThreeX, and Tab from selected One to selected Two.
After the final-cell Tab prompt, they said “everything works, let's move to next
step of things.” Record that as a user-reported final-boundary pass and readiness
to proceed, not a detailed native trace or acceptance of both candidates. Row and
column insertion focus were already reported working after 06. Earlier failed
and superseded behaviour remains in historical evidence. These reports do not
qualify every NM-01 variation or the full native/editor matrix.

## Reported NM-02 checks after patch 07

Guarded step: user answered “Yes it works” to the A abcd / B FOREIGN / A undo
preservation test, then “yes” to redo. Exact content and whether conservative undo
was refused were not supplied. Do not assert a successful semantic inverse or an
inspected native trace from these replies.

Origin-aware history: after clarification, user opened Experiment > Origin-aware
candidate (window title R07 · Origin-aware history), reported the repeated undo
test successful, then confirmed redo works. Expected prompts were FOREIGNAlpha
beta after undo and abFOREIGNcdAlpha beta after redo; these are reported passes,
not raw text captured independently. Other NM-02 typing/paragraph variations and
full semantic history remain unqualified. No JSON reviewed. No code changed.

## Reported NM-03 / NM-04 progress

NM-03 is blocked for this session: the user has no Japanese, Chinese or Korean
input source enabled. Do not ask again without changed circumstances, demand
installation, mark composition passed, or remove it from release qualification.

In Experiment > Guarded step candidate, user reported four successes: A typed
TEST and Edit > Undo removed it, Edit > Redo restored it; B typed SECOND and
Edit > Undo removed SECOND while preserving TEST, then Edit > Redo restored
SECOND. Reports are user affirmatives, not inspected JSON/text snapshots. Menu
routing worked for these variations; full native focus/menu acceptance is open.

The user subsequently said “I tested the same in the Origin aware candidate as
well. it passed.” Record the repeated A/B menu Undo/Redo checks as reported passed
in Origin-aware too. Exact raw text/report was not supplied. Do not repeat those
completed prompts or infer all NM-04 focus/window variations passed.

## Reported menu dismissal checks

User reports success in Origin-aware, then success in Guarded step for the
paragraph caret between l and p in Alpha beta, opening Edit, pressing Escape,
and typing X without clicking again (expected AlXpha beta in both views).
These are bounded affirmative reports; no raw text/JSON inspected. Preserve both
passes and do not repeat by default. Window-switch focus remains unqualified.

## Reported window-switch checks

User reports success returning to Guarded step View B at the Gamma delta end
caret through Experiment > Origin-aware candidate and back, typing X without
clicking (Gamma deltaX in guarded-step A/B; Origin unchanged). They then report
success for the reverse direction from Origin-aware View B and back (Origin A/B
Gamma deltaX; Guarded step unchanged). Both directional variations are reported
passed. The uploaded 07 JSON has no snapshots/verdicts for these reports; remaining NM-04 variants are not inferred.

## Reported NM-05 backward selection checks

Origin-aware: user answered works to backward selection of beta in Alpha beta,
replacement with X (Alpha X in both views), then separately works to Command-Z
restoring Alpha beta. Guarded step: user answered works to repeating the same
replacement/undo sequence. Bounded user reports only; no raw text/JSON inspected.
No need to repeat these prompts by default. Other clipboard variants remain open.

## Reported NM-05 external paste checks

User separately answered works for bold Clipboard test copied from TextEdit and
Command-V into a new paragraph after Gamma delta in Guarded step, then Paste
and Match Style into another empty paragraph yielding plain text. User then
separately answered works for the same rich paste and plain-style paste in
Origin-aware. All four bounded checks are reported passed and mirrored in A/B;
no raw clipboard content or native JSON inspected. Do not repeat by default.

## Reported NM-05 cross-view cut/paste and table paste

User reports works in both for: cut beta from Alpha beta in A and paste after
Gamma delta plus a space in B, yielding Gamma delta beta without duplicate;
copy bold Clipboard test from TextEdit, double-click Four and Command-V, replacing
that word with bold content without growing the table; repeat using Edit > Paste
and Match Style to replace Four with plain text without growth. These are bounded
user reports for both candidates; no raw text, clipboard or native JSON inspected.

## Reported NM-05 final table paste undo

User replies works in both to Command-Z in the same view after table Paste and
Match Style, without resetting. Expected Four restored in A/B and unchanged table
dimensions. Record as reported passed in both candidates; no raw JSON inspected.
This completes the guided clipboard sequence, not the full editor/native matrix.

## Uploaded report review and triple-click correction

Original report and SHA-256/review are retained in evidence/r07-18-2026-11-14/.
No load errors. Exact 07 source and web hashes matched before regression changes.
All repeated fixture runs pass, but these are four checks per run, not 184 distinct
acceptance scenarios or OS input proof. Both windows have zero manualAttempts and
all case statuses not-run. Keep conversation successes as user reports; the file
does not contain those saved manual verdicts. Its latestCapture is the startup
08:53:45Z Capture API not ready result, not evidence of an ongoing capture failure.

User then reports triple-click should select all text inside a cell, not the cell.
Both candidates reproduce the library default; 09 overrides it through the shared
public handler/command. Text and multi-paragraph ranges, empty cells, replacement,
undo, unchanged cell structure and existing double-click behaviour are covered.
No production/dependency/Swift change. Existing 07 reports stay historical.

## Next user action: NM-09 triple-click fix retest

Quit the old lab with Command-Q after retaining its saved JSON. Apply the
Clutter R07 Triple Click Fix 09 bundle (the helper checks whether 07 or documentation
08 is present and applies the matching verified patch). Rebuild with native:mac.
In Experiment > Guarded step candidate select NM-09, run Fixture checks, then
triple-click Four. Expected the word's text selected in editing mode, not the
whole cell in cell-selection mode. Observe this before replacement/undo and the
Origin-aware repeat. Previously reported manual successes remain historical;
new build retest is scoped to the fix and affected interactions.

After this fix's retest, verify one manual verdict actually saves: select NM-05,
click Pass, confirm the picker says pass, then Reveal saved JSON report and review
a fresh file. The uploaded 07 report has no manual attempts and only startup
capture readiness; do not infer the current capture is broken or re-run all tests.

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
