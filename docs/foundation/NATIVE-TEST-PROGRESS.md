# Native test progress and next action

## Current checkpoint — matched method blocker and GUI acquisition44, 2026-11-16

User43 commit14b45119: both H-T trial14-23-57/c24c7b81 and H-E14-27-05/6cc14187
emit recordExit1, SIGINT/SIGTERM and TOC10. Tauri log confirms recording reached20s
then stalled during finalization, export Document Missing Template Error; detailed
Electron stderr not supplied. No host defect/performance preference established.
H11 measurement acquisition/correlation BLOCKED. Both attempts retained;43 entry
now refuses CLI recording retries (original source remains in Git43/evidence hashes).

Replacement HM-GUI-44 changes acquisition driver only: manual Instruments Record/
Stop/Save, then existing CLI export for validation. Third-party tool author reports
similar macOS26 SIMULATOR behavior; not proof of this native desktop cause. No timeout
extension, OS/toolchain change, new event API or weaker H01 gate. One H-T GUI pilot.

Next apply44 and run manual44/prepare.mjs with completed36/H-T. It verifies/reuses
correct existing test window, or delegates explicit saved-session --reopen to37;
no duplicate window, fresh Space or direct-store write. Opens existing Instruments,
prints target PID/save directory/validation command. Do not record until template/
target instructions are clear. No CLI record command or input hook is started.
40 Linux tests pass (4 new+36 regressions); actual Mac44 prepare/GUI pilot pending.

Validation after manual Save: exact planned manual.trace in Git metadata, readable
TOC and required schemas. This is only acquisition-readability/schema gate, NEVER
latency/H11 pass. Actual input/producer/frame/clock join, uncertainty/overhead, shared
memory attribution, HP workloads and other H01 cases remain open. Stop after one
failed/uninformative GUI pilot with exact blocker; no more blind recording loops.
Shared UI/Core/platform contracts and P-37 greenfield scope unchanged; no host winner.


## Previous checkpoint — controlled input method trial43 (superseded above), 2026-11-16

User42 commit03c4256d: exports succeed, process-info1101 rows, frame lifetimes9,
displayed surfaces7. Process roster has no parent/responsible/coalition columns;
frame rows have no identified producer PID. Display summary mentions36534 (not
established as Clutter renderer); first3 sampled latency cells are sentinels. No
latency or complete memory attribution can be inferred. Idle trace inspection stops.
Raw42 terminal/result retained in evidence/host-controlled-method-43-2026-11-16.

Read runtime-qualification/remaining-gates.md for honest remaining H01 work. Most
full matched-host hard cases and HP workloads remain open despite useful Core/I1
and basic host checks. Next apply43, reopen saved H-T with37 --reopen, then run
controlled43/run.mjs for completed36/H-T. Wait for RECORDING STARTED, click View A
text with caret/no selected range, type lowercase a, b, c about2s apart, leave UI
open. This is one20s method trial, not a benchmark or replay of functional tests.

Controller verifies existing app/GUI binding, records same native template with
32/47/50s graceful CLI deadlines, and exports TOC. No event injection/listener, new
OS permissions, raw key logger, app source/Core/Space write path or native rebuild.
Typing uses the actual shared editor/Core like normal synthetic fixture edits.
Report never confirms input/presentation correlation just from recording success.
36 Linux tests pass (6 new+30 regressions); actual Mac43 recording pending. One
method trial per candidate: if linkage is missing, record exact H11 blocker rather
than more idle captures. No host winner, gate waiver or scope/migration change.


## Previous checkpoint — existing trace table export42 (superseded above), 2026-11-16

User41 commit41968700/capture2026-11-16T12-25-47-726Z-be47befa: all3 snapshots
have0 unavailable processes, stable membership, aliases accepted. Trace finishes
with graceful SIGINT/status0 and TOC export succeeds. User confirms79 tables and51
schema names. Prior parser incorrectly searched schema/name instead of table/schema;
42 fixes this without rerecording. Raw capture retained in new scoped evidence.

Known UI/owner sum62166080 bytes; all-same-user WebKit sums include other apps/shared
charges and cannot rank Clutter. No application aggregate footprint or native input
latency qualified. Trace availability is not actual event/presentation correlation.

Next apply42 and export existing capture with trace42/export.mjs --capture
2026-11-16T12-25-47-726Z-be47befa. Tauri need not be open. Three fixed table exports
(process-info, frame lifetimes, displayed surfaces),15s/4MiB limits per export;
proper XML structure/PID summaries through existing /usr/bin/python3. Missing tools,
oversized/failed exports remain blocked. Raw XML stays private/Git-internal, summaries
omit names/paths/application text. No recording/launch/probe/Space/permissions change.
30 Linux tests pass (6 new+24 regressions); actual Mac42 export not-run. Return the
safe JSON. Inspect actual table relationships/units before any attribution/latency
claim, then compare eligible Electron route without replaying old manual tests.


## Previous checkpoint — verified executable aliases41 (superseded above), 2026-11-16

User40 commitaabdc996: all16 WebKit failures were path-before-mismatch, not native
counter errors. User then ran checksum-verified read-only file checks: all16 have
sameFile=true and sameCanonicalPath=true. Evidence is transcribed explicitly in
host-executable-identity-41. These are actual aliases, not an OS permission denial.

41 preserves exact-path acceptance and adds a diagnostic alias match only with
same canonical path AND stable dev/inode/size/ctime metadata over repeated stat/
realpath observations. Missing/different/retargeted files and changed process/user/
start identity stay rejected. Paths remain private; reports show finite match method.
24 Linux tests pass (7 new identity +17 regressions). No app/Core/native/pin/budget
changes; no alias-based Space ownership or authentication inference.

Next apply41 with H-T qualification window still open, then run existing39 capture
for completed36/H-T. This takes fresh snapshots and ONE trace attempt using40's
graceful shutdown; original failed trace/logs remain untouched. No recompile/reopen
of signed app, new Space, old editor/manual replay or permission changes. Actual
Mac41 capture/graceful trace success pending. Shared WebKit accounting and trace
input-to-presentation correlation still cannot rank hosts or pass H01 workloads.


## Previous checkpoint — read/trace failure diagnostic40 (superseded above), 2026-11-16

User39 commit09c31e1c: Mac probe compile/sanity pass; UI/owner counters readable,
16 WebKit candidates unavailable in all3 snapshots, totals null. Trace reached5s
stop then wrapper timed out25s (ETIMEDOUT/status1). Export of existing partial trace
returned10: Document Missing Template Error. Underlying cause not established;
no application correctness failure or performance pass inferred. Preserve original
trace, logs and full uploaded terminal evidence in evidence/host-diagnostic-recovery-40.

40 adds bounded failure-stage/errno reporting and distinct path/identity mismatch
reasons without loosening guards. Future capture uses asynchronous graceful SIGINT
at12s, SIGTERM27s, final CLI-only SIGKILL30s, never app/process-group signalling;
trace export still validates readability independently. This is a harness correction,
not a proven Mac tracing fix. No recording is requested by the next command.

Next apply40 with existing Tauri qualification window open and run recovery40/
diagnose.mjs using completed36/H-T. One read-only process snapshot; no trace, new
Space, owner launch, rebuild of signed app, permissions workaround or test replay.
If UI was closed, reopen saved H-T via37 --reopen first; never --new for recovery.
17 Linux tests pass (7 new+10 regressions, including real child signal handling);
Mac40 diagnosis/finalization correction unrun. Return failureCounts/stages. Decide
from evidence, not blanket sudo, relaxed path checks or substituted RSS. P-38/P-39
shared UI/adapters and P-37 greenfield scope unchanged. No host winner.


## Previous checkpoint — shared UI and host diagnostics39 (superseded above), 2026-11-16

User38 commit1bcd2783: actual Mac compile and cross-process physical-footprint
counter sanity PASS. All three experimental package size trials pass. Exact sizes,
probe/compiler/SDK hashes and limits are in evidence/host-process-capture-39-2026-11-16/
user-instrument38-result.json. No application footprint or presentation latency yet.

P-38/P-39 now confirmed: one shared web UI/editor, Core and command API; Mac first,
Windows/browser implemented through explicit capabilities/adapters from the start.
No duplicate native UI or split wrappers without demonstrated benefit. Read
shared-platform-contract.md. Swift remains a control; Tauri/Electron are shipping
shortlist. Browser backend connectivity/storage remains future implementation,
not an assumption that Node/SQLite or desktop permissions work inside browsers.

Next apply39, close any qualification windows, reopen H-T with the existing37
launcher --reopen and run instruments39/capture.mjs against completed36. One
candidate first. It captures three provisional process-counter snapshots and tries
one5s native Animation Hitches attach/export after memory sampling.10 new Linux
helper tests pass; actual Mac39 compile/capture/trace still not-run. Processes,
private traces and helper logs stay Git-internal; no endpoint/token/store reads,
app rebuilds or source/native-feature changes. No typing/manual suite requested.

All same-user WebKit matches are explicitly uncertain (may belong to other apps),
missing/changed counters become unavailable/null, no native renderer cost is called
zero. Sums are provisional and may double-count shared pages; they are not rigorous
bounds or ranking evidence. Trace table availability is not input-to-display latency;
trace failure remains blocked. H01 workload/environment/attribution/correlation and
remaining host correctness gates still must close; no host winner. Do not replay
prior manual tests or repeat successful38 calibration for bookkeeping (39 reuses
its native code and sanity check solely to validate the new diagnostic executable).


## Previous checkpoint — native instruments38 (superseded above), 2026-11-16

All three candidates have screenshot-confirmed Ready/two Alpha beta views and
user-reported shared edit/save + close/same-session reopen retention PASS. Expected
retained prefixes: H-T TAURI, H-E ELECTRON, H-S SWIFT. Native JSON reports were not
audited. Reopen does not establish cold owner restart or full H01 acceptance.
See evidence/host-instruments-38-2026-11-16/manual-results.json; raw screenshots
are preserved there. Do not repeat these checks for missing UI verdict clicks.

Next apply38 and run instruments38/prepare.mjs --run completed36 ID (full command
in the instrument guide). It verifies existing signed artifacts/archives, reports
complete installed logical/reported allocated bytes and compressed ZIP sizes, and
compiles a separate native cross-process physical-footprint counter calibration.
A temporary child touches64MiB, is read externally before/held/released, then exits.
No GUI/owner/session/Space/app is launched, rebuilt or modified by this command.

9 new Linux support tests pass; actual Mac instrument compilation/calibration and
sizes remain pending. This is instrumentation preparation, not an H01 benchmark.
Aggregate helper/shared-WebKit attribution and actual native presentation remain
unqualified; no RSS/JS heap/RAF/readiness substitute and no host winner. P-37
no-legacy-user/data-migration scope remains in force. Filename preference: spaces
in quoted downloaded-file paths in Bash. No status-only delivery needed.


## Previous checkpoint — GUI launch37 (superseded above), 2026-11-16

User commit31df10cf/run2026-11-16T10-35-45-751Z-5b4941c3 reports all three
candidates built, signed, strict-verified and packaged CLI/MCP smoke PASS.
Swift/Electron artifacts retained and verified; Tauri now passes too. No host
winner: GUI, installed lifecycle/security and performance remain unqualified.

Launcher37 opens one verified existing signed candidate without rebuilding it.
20 support tests pass on Linux, including actual factory boot/reboot with the
same Space and fresh private bootstrap. These are not Mac GUI or benchmark passes.
Next: apply37, launch H-S from the completed36 run, confirm Ready and Alpha beta
in both views. Do not repeat NC28 tests or launch other candidates yet.
P-37 greenfield scope is included: no legacy-user/data migration work.


## Native report reviewed — 2026-11-15

Uploaded joined-native-2026-11-15T11-38-29-475Z.json retained verbatim with SHA256
and review in evidence/r08-native-manual-2026-11-15. Report identifies build20,
Mac arm64, runtime24.22.1 and SQLite3.53.4; captures JN01/02 pass, HN01/02 pass,
last accepted revision27 with equal A/B and pending0/0, PROTECTED content.
Report ends before later RESTART/reconnect/CLI-read conversation: only owner-connect
and fail_protection-on events captured. JN03/04 retain user-reported passes; do not
invent instrumented evidence or demand repeat tests for missing picker captures.
No conflicting failed manual verdict found. Native reload still not manually exercised.
Next substantive gates: canonical task move/history closure JG12, then external
PNG/PDF retained-root publication JG13. No production/stack acceptance yet.


## App-closed continuity confirmed — 2026-11-15

User confirms the same-session inspectCurrent/packaged CLI read after Command-Q
printed RESTART saved: true. Numeric revision/output not supplied. JN-04 now has
bounded user-reported pass for owner restart and app-closed accepted document read.
JN-01 through JN-04 all have user-reported passes; preserve these without requiring
repeat runs due to picker/verdict mistakes. Raw native JSON review is next, before
closing native qualification. Do not infer distribution, IME, VoiceOver, entity/
asset JG-12/13, production readiness or stack acceptance from these four cases.


## Latest manual checkpoint — 2026-11-15

- JN-02 user-reported pass: actual bottom-right Tab stays put after user-added row;
  Shift-Tab caret at prior cell end; Escape/Shift-Tab/Enter modes; add-row keeps active
  cell/focus and immediate X insertion. No raw native report reviewed.
- JN-03 initial close with only Fail protection enabled was expected, not a failure.
  With Fail saves + fresh PROTECTED + Fail protection, native close was blocked (PASS).
  Disabling Fail protection allowed close; Experiment/Reopen retained PROTECTED.
  Disabling Fail saves and Resume A propagated text; user supplied status revision36,
  SQLite owner, pending A:0. No B queue counter was supplied; do not invent one.
- JN-04 restart portion user reports RESTART visible in both views after Pause A,
  typing, Protect pending, Crash/reconnect, Resume A. App-closed same-Space CLI read
  remains the next check. Do not rerun earlier steps or claim all JG-11 accepted.


## User-reported update — 2026-11-15

- Build20 alternating-cell whitespace click correction: user confirms fixed on Mac.
- JN-01: user reports success after LOCAL insertion/shared visibility, real Close/reopen A,
  and Command-Z/Shift-Command-Z with HEADLESS preserved. Bounded manual report;
  raw native JSON has not been reviewed. No broader native acceptance inferred.
- Next: JN-02 table keyboard/focus, in small steps. Start final-cell Tab boundary,
  then Shift-Tab to preceding cell with caret at text end. No broad old-suite rerun.


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

## Implementation26 — 2026-11-16 (not a new native run)

23 new EditorView/context/protection cases run in jsdom;44 runtime tests total.
No native keyboard/geometry/IME/window-close/flush qualification is inferred.
Prior user manual passes stand. No manual replay or lab launch requested for26.
START-HERE owns the current next step: media API, then supported targeted native route.

## Implementation27 — 2026-11-16 (API, not a new native run)

Media API/history/publication/editor compatibility now pass (63 runtime cases).
Next is a targeted NEW Core native composition contract/build, not an old lab rerun.
Actual image/PDF presentation and pending media close/reload handling remain open.
No native input/flush/security pass or manual replay requested just to apply27.

## NEW Core28 — 2026-11-16 (actual Mac run NEXT)

77 automated runtime/helper cases and old regressions pass. Mac Swift compilation,
NC28-01…04 manual observations, PDFKit/image/close/native inputs NOT RUN. User applies
28 and launches npm run native:core28, reports Ready/compiler output before NC28-01.
Use native:core28:reopen for SAME session; do not run --new for recovery. Native UI
Show report reveals sanitized attempts; do not request endpoint/bootstrap files.
Old joined/native/manual passes stay historical, not passes of this changed route.

## Compiler follow-up29 — 2026-11-16

User applied/committed28 (e2613ec2), but Mac Swift compilation failed at
Main.swift:107: callAsyncJavaScript requires `in:in:`. Fix29 corrects the label
and adapts the completion closure. No Ready/NC28 manual pass is recorded.
Apply29, rerun `npm run native:core28`, and report Ready or compiler output first.
Do not use --new/reset for this failure; no valid28 session was created yet.
Prior77 runtime/TS/regression evidence remains historical, not a Mac compile pass.
Current instructions: START-HERE.md. No main/production/runtime owner changes.

## Native interaction follow-up30 — 2026-11-16

User confirms29 runs; screenshot Ready. NC28-01 remains incomplete: one remount
click left A closed, toolbar Undo/Redo jumped caret. Fix30 recreates A immediately
over the same context and retains local selection/history. Toolbar preserves mapped
current caret/range and focuses its target view; keyboard history defaults unchanged.
Three focused automated checks added; actual Mac retest pending. See fix30 review
for current test results. Older29 compiler-failure next-action text is superseded.

NEXT: apply30; safely close current lab; run `npm run native:core28 -- --new` for an
explicit NEW corrected synthetic run, preserving old bundle/store/report/locator.
Reopen runs its original bundle and cannot load patched source. No upgrade/reset
of an existing Space is attempted. Never use --new for recovery. Retest NC28-01
only; do not claim its Pass or advance02 until user confirms both issues fixed.
START-HERE.md is the current checkpoint. No main/app/real-vault changes.

### User confirmation after fix30 — 2026-11-16

User: "perfect worked" after corrected NC28-01 retest. Record user-reported PASS
for one-click A remount/history and toolbar mapped caret/selection; raw report not
reviewed. Next NC28-02 only in current session;03/04 not-run. This checkpoint is
local until included in next patch; do not ask user to apply a status-only patch.

### NC28-02 confirmation — 2026-11-16

User reports "pass" after image/cover/native PDF/replacement instructions. NC28-02
is user-reported PASS, raw report not reviewed. Next03 first stage: Fail media +
Fail journal, Add sample image, red close refuses. Do not mark03 Pass yet.04 not-run.
Current-session work only; no --new, no typing during03, no status-only patch.

### NC28-03 confirmation — 2026-11-16

User passed each guided stage: failed journal refused close; durable journal allowed
close; same-session reopen retained pending request; retry with media failure cleared
published in both views and count0. NC28-03 user-reported PASS; raw report not read.
Next04 failed-save + failed-protection close refusal FIRST; full04 still not-run.
Do not repeat01–03 or use --new. Checkpoint remains local until next scoped patch.

### NC28-04 progress — 2026-11-16

User confirms unsafe-close refusal, protected close, explicit Recover protected A,
then successful save and service restart retaining PROTECTED in both views. Initial
old-data screenshot preceded clicking Recover; user corrected that omission and
recovery passed. Final app-closed same-Space CLI read still pending;04 NOT complete.
No raw report audit, no new session or broad replay. Local checkpoint awaits delivery.

## Completion checkpoint31 — 2026-11-16

Supersedes earlier pending-test next actions. NC28-01…04 user-reported PASS; supplied
app-closed CLI JSON confirms PROTECTED at sequence38. Raw native reports not audited.
I1 disposable integration milestone complete; see i1/completion-review.md (relative
to foundation root). No production baseline/G-Q acceptance.31 is docs-only, no new
tests. Next bounded production host/runtime contract and pre-measurement D11 inputs;
no repeated native/manual suite or user-vault work. START-HERE is the resume point.

## H01 contract32 checkpoint — 2026-11-16

User confirms31 applied. Host/runtime contract is now in runtime-qualification/
contract.json and README.md (relative foundation root). Do not rewrite it or replay
NC28. Next safe host inventory JSON from user Mac, then bind candidate/version/host/
instruments before builds/timing. All H01 comparisons not-run. Single TS Core and
common independent Node owner; Tauri/Electron shortlist, Swift/WK control.32 does not
select shipping runtime or waive real-data/full-workload gates. START-HERE is current.

## Actual host/preflight33 checkpoint — 2026-11-16

User32 commit44c624ac; hardware inventory supplied M4 Pro48GiB/Mac16,7/14 logical
CPUs/macOS26.6.2 build25G83/native arm64. Source evidence and exact candidate
version metadata in host-preflight33 evidence + runtime-qualification/preflight-
manifest.json. H01/budgets unchanged;48GiB is not16GiB performance evidence.
Next run run-preflight.mjs for remaining existing tool/environment capabilities,
then matched isolated builds34. No repeated generic inventory or NC28 manual tests.
Framework binaries/checksums/complete locks/actual metrics remain unverified; no
measurements or shipping selection. Single pinned runtime lock and Core unchanged.
START-HERE supersedes older pending32 instructions. No new installs/app/vault changes.

## Matched build34 / P-36 checkpoint — 2026-11-16

User33 commit5bbd7f10, actual Mac tools supplied. No more inventory request.
Next apply34 and run runtime-qualification/build34/run.mjs; get Mac build summary/
error before GUI tests/benchmarks.7 support +80 runtime +strict TS pass in Linux,
not Mac compilation. Same Core resources/prepareClose across three host wrappers,
outputs Git-internal, smoke Spaces new/factory-only, old NC28 sessions untouched.
Product P-36 CONFIRMED: one integration connection/user-device, default all current
and future local Spaces, optional advanced restrictions; no separate Space codes
or repetitive prompts. Per-Space writers/internal transport handles stay separate.
See local-security-api-spec and integration-access-cases; no production auth pass.
START-HERE is current; do not repeat generic metadata or broad native editor suite.

## Build correction35 checkpoint — 2026-11-16

User34 commit8ed5331c; H-S ACTUAL built/signed/strict-verified/packaged CLI+MCP
smoke PASS. H-E nested framework signature FAIL; H-T missing-icon macro FAIL.
Fix35 icon/signing/retry ready;12 support tests pass, actual Mac fix not-run.
Next `build34/run.mjs --retry 2026-11-16T09-58-25-103Z-7838dcfb` (full foundation
path in START-HERE). Preserve old run/Swift pass, original locks/CommonCore/hashes,
rebuild failed candidates in new directory. No fresh dependency resolution, GUI,
benchmark, NC28 replay or another inventory. P-36 one-time all-Spaces UX stands.

### User retry35 result — 2026-11-16

Commit476e7f71/run2026-11-16T10-19-43-465Z-627d2e3f: Swift kept/verified PASS;
Electron nested signing, strict verify, packaged CLI/MCP smoke PASS. Tauri blocked
before compile by byte manifest comparison. Need actual original34 vs retry35
package.json/Cargo.toml difference; not diagnosed yet, no relaxed checks. Preserve
both passes; future retry must source locks from verified34 ancestor since35 stopped
before copying locks. No GUI/benchmarks. Local checkpoint pending next delivery.

## Confirmed normalization/fix36 checkpoint — 2026-11-16

Swift and Electron both actual build/sign/strict verify/CLI+MCP smoke PASS. User
Cargo diagnostic supplied: same exact versions, only CLI equivalent table/features=[]
normalization.36 generates exact observed bytes; strict comparisons/locks stay.
Partial retry follows verified ancestor report hashes for original34 locks/Swift
archive and35 Electron archive, retaining both passes and building only Tauri.
Next --retry 2026-11-16T10-19-43-465Z-627d2e3f (full command START-HERE).15 support
tests pass; Mac Tauri after36 pending, no GUI/metrics or repeated diagnostic/inventory.
P-36/default all current/future Spaces and existing Core/pins/signing remain unchanged.
