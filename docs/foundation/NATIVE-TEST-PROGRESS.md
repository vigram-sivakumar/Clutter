# Verification and open-risk ledger

## Previous user observations (before new product entry53)

The user manually passed shared two-view edits, A remount, text undo/redo, native
close and same-Space reopen. Earlier qualification work also exercised synthetic
media/protection/recovery flows; those are observations of their actual old proof
instances, not a native pass for this new entry. Some verdict buttons were clicked
accidentally; the user explicitly confirmed the manual tests passed. Do not require
repetition for bookkeeping or invent exact machine-captured coverage.

Caret displacement occurred intermittently, then became unreproducible. Linux
regressions for selected stale-selection mechanisms passed; no confirmed new Mac
fix/full native caret pass. User asked to move on. VoiceOver was deferred.

## Architecture decision and retired measurement

F010 accepted Tauri/shared web UI/PM-Y/TypeScript Core/SQLite as implementation
baseline. All three experimental hosts built and basic GUI checks were observed,
not a performance winner. H11 native input→producer→presentation linkage remained
unqualified. Matched CLI trace captures failed export (Document Missing Template);
manual trace schemas alone did not establish latency. No percentile/ranking inferred.
Comparison/profiling is closed as an implementation-entry prerequisite.

## Current product entry53

93/93 current-scope integration tests, strict TypeScript,38-source boundary checks,
locked npm install plan and browser/Node pack checks pass. Read scoped evidence for
exact commands/results. Automated coverage executes actual
Core/SQLite/editor views and peer CLI/MCP plus the React browser bundle under jsdom:
page create/list/open, DOM input, page navigation, retained inactive-page drafts,
failed save+protection close refusal, successful retry, persisted readback, Core query
scope/pagination/restart, unknown-create retry, and bounded stable context identities.
This is Linux integration coverage, not native macOS interaction/IME/layout assurance.

The old proof-native/alias/draft-controller test cases were retired with their
implementations; they are not counted as passing. Necessary Core/editor/media/recovery/
crash/transport tests moved with the mechanisms, and current-product cases replace
obsolete demo assumptions. Old109 and new count describe different source scopes.

A separate Chromium headless pilot could not start because the host denied its
process-singleton socket (Operation not permitted). No elevation/workaround, browser
input or screenshot result claimed from that pilot. jsdom executes real PM DOM/model
and React/transport paths but has no layout/presentation engine.

User reports PASS for switching between notes in53. The new window is observed
through that manual result; no raw compiler/signature or close/reopen pass inferred.
Remaining bounded check: save/close/same-Space reopen, unless separately confirmed.
No profiler or broad legacy suite replay. Windows/browser builds, full editor/task/
media/property/navigation UX, installed security/durability/format/identity, scale
and shipping distribution remain open. Use synthetic Spaces until their gates close.

## 2026-11-17 — navigation contract clarified (latest instruction)

User PASS for switching between notes in53. No independent tab/pane/back-forward or
new close/reopen pass inferred. Same-note split tests are consistency tests, not a
product restriction. After intermediate discussion, the user's explicit final rule:
Window -> Tabs -> per-tab split layout -> note panes. Ordinary note opening navigates
within the current tab/active pane with Back/Forward history. New tab is an explicit
menu action; split is an explicit menu action within the active tab. Both different
and same notes may appear in splits. Tab layouts/history stay separate; all accepted
content has one authority. Earlier pane-owned tabs/global existing-tab focus default
were superseded, not implemented. No new navigation code/test pass yet.

## 2026-11-17 — navigation54 source validation

User's final navigation instruction is P-40: current-tab/active-pane normal opening,
Back/Forward per pane, explicit new-tab and in-tab split menu actions. 54 implements
this, superseding intermediate designs without restoring old controllers. Current
102 Linux tests pass (93 at53 +7 navigation/state tests +2 additional rendered-bundle
cases). Strict TS checks apply to Core/runtime TS; UI/MJS mechanisms are covered by
behavioral tests and actual bundles.41 shared source files pass boundary checks.

Rendered React/PM/jsdom coverage uses real private transport/SQLite, not mocked text
reducers: same tab normal navigation, independent per-tab split layouts, same-note
updates, hidden-tab failed save/protection, successful retry and same-window layout
restore. A separate actual owner restart recovers protected work in the original
hidden tab after loading the same persisted IDs. UI-only metadata endpoint tests
reject non-UI access, retain the prior record on write failure, leave registered
editors usable, and block an unregistered new view until a successful retry. Pure
state/IO cases cover history branching, scoped IDs, stale/conflicting/exact retry,
corrupt/oversized rejection and close waiting for navigation acknowledgement.

Initial UI attempt found a fixture selecting the old same-text tab before React
switched it; the fixture now waits for the specific pane identity. It also exposed
registered editors being hidden after a metadata close-write failure; registration
tracking now distinguishes existing safe contexts from unregistered views. The
passing run and preceding scoped attempts are retained in54 evidence. No native
macOS, browser-layout, gesture, IME or new caret fix pass is inferred.

Mac54 build/basic navigation/close/reopen awaits user observation. Still synthetic
Spaces only. The current UI is not the final visual design, and tab/pane closing,
reorder/resize and installed cross-process/window/security/durability/scale/release
work are not completed by this slice. From stage3 onward, user agrees UX first,
one question at a time, before implementation.

## 2026-11-17 — note transitions55

User reports navigation54 works, but routine switching showed “Preparing view…”.
The confirmed requirement is natural note switching without blanking, flicker or
loading messages. This is a stage2 correction, not stage3 implementation.

55 keeps the current editor mounted while preparing a destination. New view IDs
are durably registered and destination contexts primed before publishing the route.
The previous content briefly stays read-only during preparation so typing cannot
land in the wrong note. Unaffected split-pane DOM stays mounted. Visited contexts
and their scoped identity promises are reused; returning to registered notes does
not wait for disk/transport layout bookkeeping. Those metadata updates are coalesced
for120ms; Save/Close checkpoint the latest state and serialize outstanding writes.
Failed preparation retains the previous visible note and supports retry. No second
body cache, Core owner, schema, dependency, native host or storage source change.

104/104 Linux integration tests, strict Core/runtime TypeScript and41-source boundary
checks pass. Production React/PM bundle with real Core/SQLite verifies stable old
DOM while registration is delayed, sibling-pane identity, navigation failure/retry,
warm navigation without disk acknowledgement and close waiting for metadata.
jsdom has no layout/presentation engine: Mac55 visual smoothness, caret, IME and
native close/reopen are pending. No timing/instant-switch or shipping claim.
Evidence: [review](evidence/note-transitions-55-2026-11-17/review.json).

NEXT: apply55, close the prior development window, npm run desktop -- --new (fresh
synthetic Space; earlier sessions retained). Create notes with different text; click
between them and use Back/Forward, then switch the active note in a split. Expect
no Preparing view/blank flash and the other pane to stay stable. Reopen this session
with npm run desktop:reopen. No old profiler/manual suite replay. After this scoped
feedback, discuss stage3 UX ONE question at a time before implementing that stage.

## 2026-11-17 — stable lifecycle56

User55 ordinary navigation is “much better”, but New Page and split opening still
flash. The user requested common architectural correction, then authorized proceeding.
56 implements that stage2 correction; stage3 UX/code has NOT begun.

One coherent UI lifecycle now covers opening/creation/splits/tabs: stable React shell,
tab and pane hosts; pane IDs independent of page binding; actual PM surfaces prepared
in inert/hidden geometry wrappers before reveal; synchronous ready-surface attachment
in layout effects; retained recent views and view-local bookmarks/scroll. Existing
editors stay editable during normal preparation. No global busy/disabled/opacity or
contenteditable cycle; only real close freezes the window. Separate creation states
prevent an ordinary pending request from displaying Retry creation. Repeated creation
activation joins the same request; an uncertain retry reuses its operation ID.

The UI operation coordinator captures destination IDs, rebases structural changes,
and guards publication/focus by intent generation. Newer same-pane routes can bypass
obsolete preparation without discarding accepted results. Close still waits for all
outstanding/superseded preparation and metadata, then guards ALL retained contexts.
New recovery IDs remain registered before editing. Warm layout bookkeeping remains
coalesced and serialized. Accepted creation updates the sidebar from an authoritative
page.read projection; it does not refresh the whole list to reveal the new note.
Scoped shell/index/navigation/status subscriptions avoid global status rerenders.

SurfaceRegistry owns DOM resources/leases only, not document bodies or semantic policy.
It retains at most16 inactive surfaces after preparation settles, plus attached active
views (and temporary reserved preparation). Eviction calls view unmount and retains
EditorSession/context/history/protection; it does not discard document work. React
owns containers; PM owns editable DOM. Core/editor/runtime/native/dependency sources
are unchanged. No second authority/cache of document JSON was introduced.

109/109 Linux tests, strict Core/runtime TS and42-source boundary checks pass. Actual
production React/PM/Core/SQLite checks cover delayed creation/registration/editor
opening, stable shell/pane and cached PM identities, no unrelated disabled churn,
editable source panes during split preparation, current user focus winning late
completion, same-note reconciliation and protected hidden-tab work after owner restart.
Additional tests cover superseded-route close barriers, rebased structural actions,
exact uncertain create retry and bounded surface-resource eviction. Browser test
Response.json now parses in jsdom's own realm; hidden-tab buttons are excluded from
simulated visible clicks. These are harness corrections, not weakened Core validation.
Evidence: [review](evidence/view-lifecycle-56-2026-11-17/review.json).

NEXT: apply/commit56, close the prior dev window and npm run desktop -- --new (fresh
synthetic Space; old sessions retained). Confirm New Page, Open in split, ordinary
switching/Back/Forward and tab switching leave surrounding UI stable. New split
width/reflow is expected; dimming, blank content and caret flashes are defects.
Native56 paint/IME/selection/scroll results are PENDING; jsdom cannot establish no
blank frame or input-to-presentation latency. No old profiler/manual suite replay.
Future same-session reopen: npm run desktop:reopen. After this scoped feedback,
stage3 starts with UX discussion ONE question at a time, before implementation.

## 2026-11-17 — navigation/windows57

USER56 VISUAL PASS: “the flickering has stopped”. Preserve this scoped observation;
it is not a raw native compile/IME/full lifecycle qualification report. User agreed
that Open in split is disabled for a note already displayed in the current tab,
with an explicit enabling option; new tab and new window remain available. User
then authorized proceeding. These are stage2 changes; stage3 UX/code has NOT begun.

57 implements default allowDuplicateNoteInTab:false in the shared navigation model
and NoteMenu. canSplit/split guard the rule at execution/rebase, not just the button.
Only current pane pages in the target tab count: history, cached contexts and other
tabs/windows do not. Restoring an existing layout does not delete duplicate views.
Normal current-pane opening and Back/Forward remain the agreed P-40 navigation;
this is split admission, not a new focus-existing-pane override for normal clicks.
Passing allowDuplicateNoteInTab:true to mountWorkspace/WindowWorkspace enables the
underlying supported same-note splits. Consistency tests explicitly retain that mode.

Open in new tab still creates another tab. Open in new window uses an injected UI
host port; the Tauri mechanism creates another window in the SAME native process and
uses the SAME Space endpoint/token/Core owner, with a fresh window ID and its own
layout/editor contexts. The browser entry passes the requested initial page only
when no saved layout exists. Native windows start hidden and show after UI ready
(or show its error state); no new semantic authority or app-to-CLI writer is added.

Native host now has per-window nonce-bound close guards and an all-window quit barrier.
A refused quit resumes already-prepared peer windows and polling. New-window requests
have IDs, native replay records, a bounded acknowledgement timeout, and a UI close
barrier. A request acknowledgement confirms window creation, not editor load/native
qualification. Child locator records contain only window/page IDs, written privately
before reveal; no bodies/tokens enter those records. New window does NOT mean a new
independent application process. Windows lifecycle policy remains shared UI/Core.

Developer same-session child recovery is addressable: after ALL native windows close,
npm run desktop:reopen -- --window-id CHILD_WINDOW_ID reuses its saved layout/context
IDs. Descriptors live under Git metadata clutter-structured53/windows/<session-hash>/.
The normal reopen still uses the original window. This is developer recovery plumbing,
not a finished recent-windows/automatic session-restoration UX. No descriptor cleanup
or installed Windows platform qualification is implied. Previous sessions retained.

114/114 Linux tests, strict Core/runtime TS and42-source boundary checks pass. Production
React/PM/Core/SQLite runs two real UI windows through an injected host adapter, confirms
the same owner instance, shared accepted edits, independent DOM/context/close guards,
and menu admission. Additional bridge VM tests cover scoped request/reply/close/resume,
timeout/no token in emitted address, and private session-scoped child locators. Enabled
same-note split consistency remains tested. Native Rust compilation and actual Tauri
window creation/quit were NOT run: this Linux environment has no Rust compiler. No
native57 pass inferred from JS tests. Official Tauri API references are in scoped evidence.
Evidence: [review](evidence/navigation-windows-57-2026-11-17/review.json).

NEXT: close prior dev windows, apply/commit57, npm run desktop -- --new (fresh synthetic
Space; no dependency install). First verify the native build succeeds. Open a note's
menu: split disabled for its current tab; new tab enabled; new window opens the same
note. Edit/save in either window and observe the other update. Closing the second
window must leave the first usable. Actual app quit/all-window refusal is a separate
native guard check, not a passing result yet. Report first scoped result; no old host
profiling/manual suite replay. After this navigation feedback, discuss stage3 UX ONE
question at a time before implementing editor/title/familiar-UI features.

## 2026-11-17 — user57 result; advance to UX discussion

User: “it works thanks, proceed to next” after the requested default duplicate-split
and new-window note-opening check. Scoped native interaction PASS; no raw compile
log, all-window quit/refusal, protected-child reopen, IME or shipping pass inferred.
56 flicker PASS retained. Next is stage3 UX discussion one question at a time before
implementation. First question: initial focus in a new note, title or body; pending.
No stage3 code changed. No additional manual/profiling replay requested.

## 2026-11-17 — documentation checkpoint58

The stage3 UX conversation is consolidated in rebuild/stage3-ux.md. This is a
requirements record, NOT an implemented/tested editor. User56 flicker PASS and57
scoped navigation/new-window PASS remain separate from broader native qualification.
No additional native result is inferred and no application tests/builds were run
for this documentation-only change. Resume with the unanswered formatting-toolbar
action-list question, one question at a time, after the user resumes discussion.

## 2026-11-17 — plan59, no new execution result

Toolbar actions and preset-only colour choice are recorded. Stage3 implementation
plan is ready; next is3A. Source inspection identified the current scalar title,
body-only history/admission and unsupported active task placement. No editor/schema/
application/native change was made and no tests or builds were replayed for the plan.
Existing114 Linux and user56/57 scoped observations do not validate planned stage3 UX.
