# Clutter rebuild working rules

Read START-HERE.md, ../../ARCHITECTURE_RULES.md and ../architecture.md. Product and
table contracts in this folder own confirmed target behavior. Historical class/API
specifications are retired; Git history is the archive, not an implementation constraint.

- Work on architecture/clutter-foundation in Clutter Structured. Clutter Markdown is
  the independent main worktree. Inspect/preserve user work; no reset/clean, main
  merge/switch, automatic commit or push. User applies delivered incremental patches.
- User explicitly authorizes complete replacement: both full/compact Markdown,
  CM6, old vault/persistence/domain/native logic, UI controllers, tests and docs.
  Keep only code that fits the selected architecture. No courtesy reuse, compatibility
  façade, duplicate writer or existing-user/data migration project.
- One Core/SpaceService and command catalogue. UI/CLI/MCP are peer clients. Rust and
  desktop runtime own mechanisms, not semantic page/task/save/undo policy.
- One shared React web UI/editor for Mac/Windows/future browser. PM owns editable DOM;
  React owns surrounding components. Do not restore OS-specific feature UIs or React
  body mirrors. Implement NodeView renderer adapters when rich components need them.
- Page/window/pane/context identities and lifetimes differ. Closing/navigating a view
  never silently discards pending work/history. Window close guards every retained
  page and unresolved mutation, not just the visible editor.
- No active product/test imports from docs/research/hardcoded node_modules. Module
  directions in ../../tools/check-boundaries.mjs enforce the selected split. Exact
  native locks are checked in; no old experiment cache or new lock export required.
- Root command is npm run desktop. Current builds/locators use Git metadata
  clutter-structured53. New product entry does not consume old proof sessions.
  Use synthetic content until installed format/security/durability gates close.
- Confirmed table/keyboard behavior survives the teardown: Enter down same column
  stops at bottom; Shift+Enter inserts a break; final Tab stays; Escape retains cell
  highlight without caret; selected-mode Tab moves highlight, Enter edits; triple
  click selects text; axis handles preserve active cell/caret/focus. Tables are R2,
  not currently rendered by the paragraph-only first product slice.
- Preserve user-observed prior native passes and intermittent/unreproduced caret
  risk. No repeated old manual/profiling suite for bookkeeping. H11 input/presentation
  measurement stayed blocked; no latency ranking was established. F010 ends that
  research as an implementation-entry prerequisite. Do not restart it unasked.
- Integration access remains one connection per user/device across local Spaces by
  default, optional restrictions, no per-Space enrollment codes. Tasks retain one identity/location with eventual full-page body/properties scope;
  stage3 UX starts them inline until explicit icon conversion. No semantic subtasks.
- Update current checkpoint, scoped evidence and concise outcome/risk ledger for
  meaningful changes. Separate Linux integration checks, user manual observations,
  native compile results and shipping qualifications. Deleted obsolete tests are not
  passing tests. Run checks relevant to the change, not a growing research project.
- Deliver source-only incremental patch ZIP against the latest delivered tree;
  verify apply/reapply/main refusal. No generated binaries/cache/private sessions.
  Download names in quoted user Bash paths use SPACES. User Mac root is
  /Users/sivakuv3/Documents/Personal/projects/Clutter Structured.

## UX agreement from stage3 onward

User instruction2026-11-17: finish the already-authorized stage2 navigation work.
Before implementation of EACH stage starting with stage3 (editor/familiar UI),
discuss expected UX with the user. Ask ONE question at a time, record their answers
and resolve that stage's UX before coding it. Do not batch questions or infer the
new UX from retired controllers/sample UI. Do not re-ask already confirmed behavior.
This is the requested product workflow, not permission for more architecture research.

## Latest confirmed navigation refinement (57)

User56 reports flickering stopped. P-42 disables duplicate split admission by default
for a note currently displayed in the current tab; allowDuplicateNoteInTab:true is
an explicit enabling prop. Histories/contexts/other tabs do not block splitting.
Do not silently change normal open/Back/Forward into focus-existing-pane routing.
New tab creates a tab; new window is another native window with the same Space owner,
not another semantic process/authority. Preserve per-window close and all-window quit
barriers. User57 reported the scoped split-policy/new-window check works. Full
quit/refusal, protected-child recovery and shipping qualification remain pending;
114 Linux tests do not establish those native outcomes.

## Stage3 UX decision authority (documentation58)

Read [the consolidated record](rebuild/stage3-ux.md) before proposing or implementing
stage3 behavior. It owns final title/list/marquee/task/media/table decisions and
supersedes older proposals. At58 no stage3 code had begun. After58, the user resumed UX
and approved all proposed formatting actions plus whole-block background colour.
Preset colours ONLY are confirmed. The [stage3 implementation plan](rebuild/stage3-implementation-plan.md) is prepared;
60 implements3A. Verify the scoped Mac title/body checklist next, then3B; do not restart serial UX questions about minor details. Ask only genuine material
blockers one at a time. Do not re-ask the action list or custom colours, and do not
claim stage3 implementation is complete.
Do not treat user56/57 scoped native passes as complete lifecycle qualification.

## Capability60 handoff

User explicitly wants one complete capability per delivery before the next.3A title/
body is implemented in the minimal working UI; familiar components are a later UI
integration, not a parallel save pipeline. Read rebuild/title-body-60.md. Scalar title
and body-v1 writes are removed; content schema2 has title+body in one Y fragment.
CLI/MCP use the same Core and have real process integration coverage. Targeted Mac
checks remain; no native pass is inferred from Linux. Build60 with --new, not old
session reopen. No old-data migration or dependency changes. Next implementation3B
only after this capability's scoped check; use already recorded UX decisions.

## Capability61 continuation

3A user Mac checklist passed in full.61 adds only paragraph/H1–H6/separator insertion
with slash query/menu and shared history; read rebuild/block-insertion-61.md for the
next scoped Mac check. One capability complete/verified before lists or formatting.
User added A01–A05 Ctrl+A behavior: body block text first, all body blocks second,
NEVER title; title selects itself only; Escape clears selection. Implement in3C with
block selection, not as an independent temporary whole-document selection path.
No native61 pass inferred. Ctrl+A, lists, toolbar/tasks/images/tables are not done.

## Correction62 — separator is a focus exception

User61 says all looks good except separator focus, explicitly confirmed caret must
move into a normal paragraph BELOW separator (create if absent). S09 overrides S06
only for separator.62 does this in the shared structural transaction, converts its
inline suffix continuation to paragraph, and preserves existing later headings.
Ordinary heading/paragraph insertion still keeps original caret. Basic H1–H6 CSS
was already present; a newly inserted empty heading below an original paragraph can
explain the apparent mismatch. Read rebuild/separator-62.md; targeted Mac check next.
No new feature, no native/lock/dependency changes, no inferred native62 pass.

## Latest separator decision63 — supersedes62

User explicitly removed cursor-jump override: strip only /separator; if block then
empty add divider ABOVE; otherwise BELOW. Keep that same block, type, complete
remaining inline content and mapped selection. No new paragraph, suffix splitting
or forced normal-size conversion. Read rebuild/separator-63.md.63 applies over61/62;
verify two scoped Mac cases before next capability. Earlier62 instructions are
historical and MUST NOT be reinstated. Ctrl+A remains queued for3C.

## Capability64 — lists, not formatting or block selection

Both63 separator cases are user PASS.64 implements ordered/unordered list insertion,
markers and the agreed L01–L15 key matrix. Verify rebuild/lists-64.md before formatting.
Flat block IDs/indent/parentId own visual hierarchy, not nested DOM or markers.
A parent must precede its child and have lower indent; do not require depth-first
contiguity or reparent unrelated siblings when another branch outdents. Tab/ShiftTab
carry explicit descendants; Enter transfers direct children to immediate new sibling;
empty Enter/Backspace affect just current row and detach children at unchanged indent.
Lists are not semantic tasks/subtasks. Core/client/CLI/MCP share the same schema/save
path. No native64 pass inferred. A01–A05 Ctrl+A remains queued for3C, not implemented.

## Historical insertion decision65 — superseded by66

User explicitly corrected64: empty editable block CONVERTS in place; nonempty keeps
remaining text together, inserts chosen type below and focuses it. Paragraph/heading/
ordered/unordered list all use this. Separator63's object behavior stays unchanged.
Read rebuild/insertion-policy-65.md and S04–S06; earlier retain-focus/split instructions
for text are historical. Definitions declare empty/nonEmpty/focus policy; one shared
transaction executor and context history path implement it. insertionPolicies is a
workspace prop; no per-ID UI/cursor/save branches. Shared selectors own graph scope.
No native65 pass inferred. Lists still need scoped Mac checks after correction;
formatting later, Ctrl+A/block selection remains3C. OS mechanisms stay in adapters.

## Mandatory completion review — every change

User explicitly requires the WHOLE architecture check on every task, not only a
CLI/MCP test: remove superseded implementations; search for duplicate behavior/owners;
verify package/platform boundaries; confirm UI, CLI and MCP use the same accepted
Core and persistence path, with interactive history remaining context-owned. Verify
relevant real CLI/MCP client behavior and record the evidence. Keep one shared
indentation transform and one policy-driven insertion/conversion path where these
behaviors apply; no UI/native/CLI forks or leftover alternative handlers.
Distinguish automated/Linux evidence from actual Mac/manual results. A dedicated
Mac CLI/MCP read/write/conflict/save-reopen check is next after the current editor
correction, before formatting. Do not defer peer-client wiring until final UI.

## Current text controls66

Read rebuild/text-controls-66.md. Latest user approval replaces filled insert-below
with conversion IN PLACE for all text types. Retain remaining content, block identity,
indent/parentage and mapped caret; default text policy is convert/convert/inserted.
Objects retain their own policies; separator63 unchanged. One block-indentation
module/plugin serves all indentable BODY text; no list-only Tab handler remains.
C01 source CSS fixed, Mac visual check pending. After scoped editor checks, run the
dedicated Mac CLI/MCP read/write/conflict/save/reopen acceptance before formatting.

## Current selected-object UX67 — supersedes separator63

Read rebuild/object-selection-67.md. User now approves separator selection on insert
and click, Enter to normal paragraph below (reuse adjacent matching empty paragraph),
and Backspace/Delete deletion with nearby BODY destination, never title. Empty block
converts to separator; filled text preserved and separator placed after descendants.
One selected-object policy/executor and one shared object handler; do not restore63
retained-caret insertion or62 eager continuation. Tables retain their cell contract.
Selection mapping must survive selected target removal by Undo or peer writes without
binding-private patches or a dependency fork. Current67 Mac check precedes dedicated
Mac CLI/MCP acceptance and formatting.66 text conversion/indentation remains current.

## Dedicated real-client acceptance68

User67 passed the requested insert/select/Enter/type Mac check.68 is verification
only, not another editor feature or a host-comparison gate. Read rebuild/client-acceptance-68.md. tools/check-clients.mjs uses the current
bundled launcher/runtime and same reserved owner; never a new authority or direct DB
writer. Prepare creates one synthetic target, exercises both clients and conflicts;
verify checks accepted UI body marker; verify-reopen checks unchanged accepted root
and native process replacement. Operator confirms actual visual restoration. Native
process guards in Linux tests are stand-ins, not native evidence. Do not restart or
kill owner/windows automatically. No rebuild needed; keep latest session. After this
scoped Mac acceptance, proceed to already-agreed formatting; Ctrl+A remains3C.

## Actual68 acceptance complete

User terminal reports and reopen screenshot confirm the dedicated Mac CLI/MCP
milestone PASS: reads/writes, both stale conflicts, UI save visible to both clients,
same accepted root and visible note after native window process replacement. Owner
restart not performed. NEXT formatting; do not replay this milestone for bookkeeping.
Include these observation updates in next source delivery after68. Every-change
architecture/client review remains mandatory for that implementation.

## Current formatting69

Read rebuild/formatting-69.md. User approved toolbar actions F01–F07; presets only.
One shared PM executor handles toolbar and keyboard, central dispatcher groups context
history and returns focus. Keep mapped selection; no body/title React mirror, second
save handler or platform feature logic. Preset token/mark validation shared by schema,
JSON and raw-Y accepted paths; do not allow custom CSS or unknown marks to disappear
silently during parsing. Body text only, title keeps prior plain-looking/link rule.
Native69 check next.68 actual Mac client milestone complete; not another prerequisite
replay. Ctrl+A/marquee3C remains next capability after formatting acceptance.
AI active-app/focused-note/selection integration is deferred roadmap only. Targeted
ignore rules cover old generated schemas/r07 artifacts and worker credentials/state;
do not delete .dev.vars or hide whole source trees. No legacy resurrection.

## Current toolbar focus correction70

Read rebuild/toolbar-focus-70.md.69 Mac Bold/selection PASS; colour/link interaction
reported broken.70 owns the toolbar focus interaction before editor blur, preserving
controls through temporary native-popup/body/null focus. Dismiss on real outside
intent/focus or Escape; no timer or per-control/native branch. Keep PM range mapped,
UI URL draft local, command executor/history/Core/save unchanged. Native70 check next;
69 jsdom direct-focus test did not establish this focus interval.68 milestone remains
complete. Do not start3C before this correction's scoped Mac check.

## Current body selection71

Formatting70 actual controls/Undo/Redo/save/window-reopen PASS;68 client milestone
also complete.71 implements keyboard3C capability on one BodyBlockSelection explicit
ID model, not full-document AllSelection. Read rebuild/body-selection-71.md. First
Cmd/Ctrl+A current body block text, second all BODY IDs; title stays isolated; Escape
no caret; typing/replacement disabled in block mode; deletion only explicit IDs.
Generic deleteBlocks is shared with object67, preserving surviving child graph/indent.
History/relative sync guard handles custom selection without another saved fact or
Undo manager. No marquee/handles/group reorder yet: implement next using same model,
not a parallel state machine. Native keyboard check first; don't mark whole3C complete.

## Caret re-entry correction72

71 first Cmd+A/body/title exclusion native check works. Preserve bulk-delete no-caret
mode (assistant's alternate caret proposal was not implemented).72 moves text re-entry
to mouse-down with public PM hit testing, including empty paragraph boundary. Keep
one helper for click fallback, native drag/multi-click, object/table separation.
Selection guard is scoped to potential document changes; selection-only updates must
not oscillate hidden/All modes. No native binding internals/CSS blink/timer workaround.
Native slow/faded blink retest next; do not claim browser pixels from jsdom tests.
Read rebuild/caret-restore-72.md; marquee/handles still pending.

## Native caret capture73 — unresolved first click

72 user retest still fails:2–3 fast blinks only on first click after deleting ALL
body blocks, then normal. Preserve narrow repro.73 opt-in host-injected trace does
not change editor/UI behavior or rebuild bundle; use current same-session --reopen
with CLUTTER_CARET_TRACE=1. Read rebuild/caret-capture-73.md. Capture one12-second
first-click sequence; no note content/URLs/IDs/tokens/typed characters, metadata only,
explicit copy. Native cause still unresolved; next analyze report, not speculative
caret CSS/timers or marquee. Default off; remove temporary hook after resolution
unless justified as a development tool. Existing client/formatting passes remain.

## Current caret checkpoint74

74 analyzes the actual73 native trace:156 events,12,002ms,dropped0. The report
is usable; no recollection needed. Save/sync repeatedly left/re-entered block mode
and transparent/normal caret colour BEFORE the first post-delete click at5025ms.
One focus/selection restoration at5026ms; normal caret state by5027ms, no subsequent
JS focus/selection writes through12002ms. This does NOT establish a post-click JS
reset loop or measure native caret paint.72 remains native FAIL.

74 removes the live transparent caret from empty/no-caret body mode: editor becomes
noneditable but keeps keyboard focus/tabindex. Public key handlers still own commands;
selected nonempty body blocks keep normal copy behavior. Text click restores editable
TextSelection. Existing Y guard uses an internal AllSelection-derived presentation
shield, preserving body mode/editability through remote restores and preventing its
own selection dispatches re-entering protection. Saved BodyBlockSelection model,
Core/history/save and object67 semantics unchanged. Redundant already-focused focus
call and transparent caret CSS removed. No blink animation, timers, native OS branch,
private binding mutation, dependency change or second semantic owner.

Build 74 failed the Mac retest. After deleting all body blocks, the first click
left the caret without its normal blink. Clicking outside and back restored it.
Build 75 restores the editable text selection before focusing the editor. If the
inactive editor already held focus, it releases and reacquires focus once during
that click. This is a targeted focus workaround. The native blink is pending retest.

Build 75 caret retest passed on macOS. Build 76 uses shared block selection for
multiline title paste. See the current checkpoint and stage3 UX rules.
