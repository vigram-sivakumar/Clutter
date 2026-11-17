# Resume Clutter Structured

## Current checkpoint — selected objects67, 17 November 2026

User reports66 “everything looks good except separator”; preserve that scoped
observation. Separator63 previously passed its old checks, but user now explicitly
supersedes its retained-caret/empty-placement rule. Text conversion and body-wide
indentation66 remain current.3A title/body remains user PASS.

**67: select the separator, Enter to continue.** Empty command block converts into
selected separator; filled source text stays intact and separator inserts after its
explicit descendants. No automatic continuation paragraph during insertion. Clicking
the separator selects/highlights it. Enter uses an immediately following empty normal
paragraph at the same indent/parent, or inserts one below and places the caret there.
Backspace/Delete remove the selected object: previous body text end, otherwise next
body text start, otherwise neighboring object selected; empty body gets a paragraph.
Never move to title. Unselected children survive with unchanged indent.
Read [architecture/checklist](rebuild/object-selection-67.md).

One registry focus policy and shared transaction executor select objects; one atomic
body-object keyboard/click handler continues/deletes them. Node selection is view-local.
Public Y/PM selection bridge guards selected nodes disappearing during Undo/peer writes;
no dependency fork, native feature logic, separate history/save or Core owner.

Validation:191 full Linux tests PASS; final16 focused editor tests PASS (including
2 subsequently added ordered/unordered parent/child continuation cases). Strict
Core/runtime TS and51-source boundaries PASS. Real CLI/MCP read accepted UI separator,
continuation/deletion; MCP removal of selected last object survives safely. Production
React/PM/Core/SQLite selection/continuation test PASS. No native/pixel/Windows/IME pass.

Apply67 over66; `npm run desktop -- --new`, no install. NEXT scoped Mac object check,
then dedicated real Mac CLI/MCP read/write/conflict/save/reopen acceptance BEFORE
formatting. Ctrl+A/body block selection A01–A05 remains3C, not implemented here.
C01 source fixed66; user67 says everything else looks good, but no separate full
multi-level ordered/unordered C01 visual checklist is inferred from that statement.


## Working agreement

**Mandatory AI rule for EVERY change:** apply the completion review in [AGENTS](AGENTS.md).
Remove superseded code, check duplicate behavior/owners and package/platform boundaries,
verify the one UI/CLI/MCP Core/persistence path and record relevant real peer-client
checks. Report automated versus native/manual evidence accurately. This is a standing
completion requirement, not an optional review or a one-time cleanup.

Discuss and agree UX before implementing each stage from stage3 onward. Ask ONE
question at a time and record answers. Latest explicit corrections supersede older
proposals. Do not ask the user to repeat the decisions in the UX document.

The UX document covers titles, title paste/feedback, slash commands, H1–H6, free list
indentation and keyboard behavior, hierarchical drag versus flat block selection,
marquee/additive selection, explicit-only deletion, inline tasks/page conversion,
single-file Image picker, table presets and deferred embeds. Important distinctions:

- Tab/Shift+Tab and parent dragging carry descendants; selection does not auto-select
  them, and Delete removes children only when explicitly selected.
- Marquee needs no Shift; crossing the starting block changes text selection into
  block selection. Shift+drag adds disjoint blocks to the prior selection.
- Multiline title paste appends ALL content to the body bottom, leaves no caret,
  scrolls there and highlights until any click. No three-second timer.
- Task titles edit inline until icon-driven page conversion; after conversion,
  title clicks open the task page and checkbox clicks still toggle completion.
- Images use an immediate ONE-file picker. Embed is deferred, including YouTube.
- Table presets2×2/3×3/4×4 live inside the slash menu. Existing
  [table interactions](table-interaction-contract.md) remain authoritative.

## Historical application baseline and observations

Delivered57 is the latest application baseline: stable surfaces/scoped UI lifecycle,
default duplicate-split restriction with an enabling option, and shared-owner native
windows. Its114 Linux tests, strict Core/runtime TS and42-source boundary checks
passed. These do not cover unimplemented stage3 UX.

User56 observation: “the flickering has stopped”. User57 observation: “it works”
after the requested split-disabled/new-window check. Preserve these scoped manual
passes. No raw compile log, all-window quit/refusal, protected-child recovery, IME
or installed-data/shipping qualification is inferred. Do not replay old manual or
host profiling suites for bookkeeping.58/59 are DOCUMENTATION ONLY; no rebuild needed.

Use synthetic Spaces until installed format/security/durability/identity/scale and
release gates close. Windows/browser composition and finished session-restoration
UX remain pending. No existing-user/data migration project is required.

## Worktrees and ownership

- Active Mac worktree: /Users/sivakuv3/Documents/Personal/projects/Clutter Structured,
  branch architecture/clutter-foundation.
- Existing application: /Users/sivakuv3/Documents/Personal/projects/Clutter Markdown,
  main. Do not modify/merge/switch/reset it as part of this work.
- No automatic commit or push. Deliver exact source-only incremental patches with
  literal-path staging manifests; do not stage broad generated/private directories.
- One Core/SpaceService and command catalogue; UI/CLI/MCP are peers. React owns
  surrounding components; PM owns editable DOM. Rust is a window/OS mechanism,
  not another semantic owner. No separate title/task persistence pipeline.
- No courtesy retention of old CM6/full-or-compact Markdown/vault architecture.
  The architecture selection is closed; do not restart host comparison research.

Read [working rules](AGENTS.md), [architecture](../architecture.md),
[development](../development.md), [product contracts](product-contracts.md),
[task behavior](product-behaviour.md) and [native progress](NATIVE-TEST-PROGRESS.md)
for their scopes. The current checkpoint and final UX record override historical
next-step instructions; historical qualification limits remain in force.
