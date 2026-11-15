# Native test progress and next action

## Latest — build20, 2026-11-14

- User reports recovery completed; screenshot confirms mounted A/B, not additional
  typed-text recovery or JN-01 completion.
- Blocker: alternate clicking whitespace after text in different table cells;
  caret/highlight jumps to another cell's beginning. Not repeated same-cell clicks.
- Expected: selection/caret stay in clicked cell; no content mutation until typing.
- Build20 bounds click destination by DOM cell. Linux table suite70 product passes,
  two expected raw history control failures retained. Before: two mapped-hit product
  failures; physical whitespace clicks already passed in Chromium. Mac retest pending.
- Next: protected normal quit, apply20/rebuild (old store retained and setup archived),
  retest only alternating whitespace clicks in A/B, then resume JN-01 if clear.
- No extra pass inferred from screenshot or prior accidental verdict clicks.


Updated 2026-11-14, revision 0.36. Maintain this alongside START-HERE at every native
handoff. Evidence sources are explicit. The first 07 report has now been uploaded/reviewed;
manual conversation results and stored verdicts remain distinct. The fresh09
report now verifies both NM-09 verdicts and ready captures.

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
| NM-06                       | Deferred/untested at user request: user corrects earlier familiarity reply and says they have never used VoiceOver and do not want to prioritise it. Do not repeat the onboarding/test prompt by default or mark accessibility passed.                                                                                            |
| NM-07                       | Guarded Bold toolbar and Origin Command-B typing routes reported passed. Step close/reopen retains AEDIT/BEDIT; reopened A undo removes only AEDIT, redo restores it while retaining BEDIT, all reported passed. Origin toolbar unavailable; no fresh saved07 verdict reviewed.                                                   |
| NM-08                       | Guarded step: user reports RECOVER survives in-page Protect & restart with Fail saves, both failures block close with CLOSE_BLOCKED, then both flags off permit close and preserve B's text. Same-session lab protection only; saved verdict/report capture next.                                                                 |
| Native JSON report review   | native-2026-11-14T08-53-44-634Z.json reviewed: exact 07 source/web hashes matched before changes; 20 origin and 26 step fixture runs all pass (four repeated checks each). All 15 manual cases not-run; zero attempts. Startup latestCapture says not ready; no later manual capture.                                             |
| Table triple-click          | Guided09 replacement/undo reported passed in both. Fresh native-2026-11-14T09-38-40-422Z.json now stores NM-09 pass/one attempt/ready error-free capture in each; build/source/web hashes match09, restored 2×2 table and A/B equality verified. Multiline native not inferred.                                                   |

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

## Reported native NM-09 results after 09

After bundle09 instructions, user said done next; then success for the Guarded
step triple-click Four, type X, Command-Z sequence and success for the repeated
Origin-aware sequence. Expected text-only selection/replacement/undo, Four restored
in both A/B and unchanged table dimensions. Record the bounded variation as
reported passed in both candidates, not a reviewed snapshot or multiline native
pass. User reports 09 completed; no new commit hash/report reviewed yet.

## Fresh09 report verifies saved results

User confirmed Origin NM-09 picker ended pass, then marked Guarded step and
uploaded native-2026-11-14T09-38-40-422Z.json (updated09:42:39Z). Original/report
review retained in evidence/r07-21-2026-11-14/. All source and web hashes match09.
Each window stores one NM-09 pass attempt with ready=true, no capture error and
matching authority/A/B documents. Snapshot tables are One/Two, Three/Four (2×2).
No load errors. Both have one four-check fixture pass run; these are not native
input proof. Remaining manual verdicts are not-run in this fresh session.

The09 recording check is verified; no current capture failure remains established.
Do not alter the historical07 report or promote earlier conversation results into
stored verdicts. Manual gesture details are user observations, supported by saved
verdicts/result snapshots here, not independently replayed by the agent.

## User priority correction: defer VoiceOver

User corrects the earlier yes: they have not used VoiceOver and say it need not
be prioritised. NM-06 is deferred and untested, not passed. Respect this priority
and continue other qualification. Do not ask again or start VoiceOver onboarding
by default. Keep accessibility as explicit later qualification; no app code or
acceptance requirement is silently removed by deferring this manual session.

## Reported NM-07 formatting routes

Guarded step: user says success after selecting beta, clicking Bold in the lab
and typing X without clicking the editor again; expected Alpha X with X bold in
A/B. Origin: user notes there is no Bold button. Source origin.html confirms the
lab only exposes Undo/Redo/Reset. User instead tests selected beta, Command-B,
then X and reports success. Record keyboard formatting passed, not Origin toolbar
focus; that route is unavailable in this lab. No new native JSON reviewed for
these trials. Do not repeat or conflate the routes.

## Reported NM-07 step view lifetime/history

In Guarded step, user reports success after A appends AEDIT to Alpha beta, B
appends BEDIT to Gamma delta, then Close view A/Reopen view A leaves both edits
visible in both views. User then reports success for Command-Z in reopened A
removing only AEDIT while BEDIT remains, and success for Shift-Command-Z restoring
AEDIT while BEDIT remains. Bounded conversational reports; no fresh raw verdict or
snapshot for NM-07 inspected. Do not repeat these prompts by default.

## Reported NM-08 injected failure checks

User reports success with Fail saves enabled, appending RECOVER to Gamma delta
and using in-page Protect & restart: Gamma delta RECOVER remains in both views.
They then report success enabling Fail recovery as well and attempting Close
view A: close blocked with CLOSE_BLOCKED, text/view retained. Finally both flags
are turned off and Close view A succeeds while B retains Gamma delta RECOVER.
Both injected failures are off at this checkpoint. No OS-quit/crash, disk store,
power-loss or provider claim follows from this ephemeral WKWebView session.
These are user reports pending the new saved verdicts/captures; do not repeat
by default or leave the user thinking the fault switches must stay enabled.

## Latest report and user clarification

User supplies updated native-2026-11-14T09-38-40-422Z(1).json, updated09:56:44Z.
Original/review retained in evidence/r07-26-2026-11-14/. All source/web hashes match 09. All seven stored attempt captures are ready with no capture error. Origin
has two NM-07 Pass clicks; step has three. Both also retain one NM-09 Pass.
Treat these as repeated verdict clicks, not seven independent test executions.
User says earlier clicks were accidental and explicitly confirms all performed
manual tests passed. These confirmations remain valid; duplicates do not cancel
them. Preserve raw records and do not invent attempt attribution.

The report still has NM-08 not-run and no NM-08 attempts. Keep the conversational
protection/blocked-close/cleanup passes separate from this missing UI verdict.
Do not require another upload, rerun or button cleanup just to repair bookkeeping.
Origin notes are empty; Command-B/absent toolbar detail comes from conversation
and source, not from report notes. Other saved case labels remain not-run even
where earlier manual steps were confirmed. No raw report is edited or backfilled.

## Automated build 11 comparison after the manual session

All earlier confirmed manual passes remain intact. The matched Linux slice now
runs real CLI/MCP processes through the shared live-authority ingress. No new
manual cases were requested. HC-06 adds a destructive Origin view remount route
that was absent from the native lab UI; it exposes lost redo/new-edit tracking,
not a revocation of the user's earlier available-route passes.

[Comparison](r07-matched-comparison.md) records 30 candidate cases: 21 applied/pass,
8 explicit refusals,1 Origin lifecycle gap,0 unexpected failures in the final runs.
Strict qualification exits 1 for step HC-03 and origin HC-05/HC-06. Earlier raw
controls stay diagnostic failures. IME remains unavailable and VoiceOver deferred.

## Automated history fixes after comparison11

[Current fix](r07-history-ownership.md) resolves all three identified gates under
the unchanged 30-case contract. Origin history now belongs to the authority's
editing context; view destruction does not dispose it. Step mark/attribute guards
are range-scoped, Origin structural protection is table-scoped and mapped through
accepted changes. Outside changes permit undo; overlapping foreign work remains
protected. Strict exits 0:24 pass/6 explicit refusal,0 gaps/failures. Seven extra
browser lifecycle cases pass while the old raw lifecycle failure still reproduces.

These are build 12 headless/Linux/Chromium results, not new native manual passes.
Keep all earlier confirmed manual results and raw uploaded files intact. No broad
manual rerun or verdict-click cleanup is requested. A targeted native history/
selection smoke can be batched with the next integrated slice before architecture
acceptance. NM-03 remains unavailable and NM-06 deferred by user priority.

## Next action: same-session recovery, not a new builder

User accidentally reloaded the joined page; blank panes/JS error are an observed
bootstrap defect. No manual case passes and no SQLite deletion is established.
Apply19 in a separate Terminal and run native:joined:reopen. It reads the same
existing Space through the original packaged client, records safe diagnostics and
attempts to reopen the original app/session without reset or automatic restore.
Do not run the fresh-space builder, delete sessions or force-quit before checking.

Confirm whether text returns. Previously unprotected typing may be unrecoverable;
do not promise otherwise. Source19 adds document-start credentials/protected reload
for the next rebuilt host.10 helper +10 joined Linux passes; actual Mac reopen,
new Swift compile/reload policy and JG-11 remain unverified. JN-01 paused until data
and corrected host are checked. IME/VoiceOver and earlier passes unchanged.
[Evidence](evidence/r08-19-2026-11-14.json).

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
joined full-editor/API/durability parity, full editor matrix and provider consistency remain
open. Passing the revised table case alone does not complete R07 or authorize R08.
