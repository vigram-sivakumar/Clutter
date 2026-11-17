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
