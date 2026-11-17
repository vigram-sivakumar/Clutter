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
  default, optional restrictions, no per-Space enrollment codes. Task is a full page
  with body/properties/cover/media/embed scope, no subtasks/single placement as agreed.
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
