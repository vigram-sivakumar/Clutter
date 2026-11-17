# Resume Clutter Structured

## Current checkpoint — native caret capture73, 17 November 2026

**72 native issue NOT fixed.** User still sees2–3 rapid caret blinks then normal,
**only on the first click after deleting ALL body blocks**. Earlier model regression
passes remain valid but do not establish native caret paint. No-caret bulk deletion
is retained.68 client and70 formatting native milestones remain complete.

**73 is an opt-in diagnostic, no new caret behavior.** Existing source host bootstrap
can inject a bounded12-second focus/selection observer into the immutable72 app on
normal same-session reopen. `CLUTTER_CARET_TRACE=1 npm run desktop:reopen`. No native
compile/new bundle/new Space or semantic writer. Default reopen has no trace panel.
Read [exact capture steps](rebuild/caret-capture-73.md).

User closes window normally, applies73, reopens same app with flag. Bottom-right
Caret trace (development): put body text in note first; Start; click body, Cmd+A twice,
Delete; click empty body ONCE and leave input alone while trace completes. Copy trace
and paste into chat. Native DOM focus/selection writes/selectionchange/hidden-mode/
caret-colour state only; no note text, URLs, IDs, credentials or literal typed chars.
400-row cap,12-second auto-stop; original native methods restored on stop/cap. Report
lists which methods were instrumented; unchanged state fields are omitted per row.

NEXT inspect this single actual native report before another caret correction; do
not move to marquee or label73 a bug fix. Instrumentation may affect timing, so user
should also say if the rapid blink did not occur during capture. No benchmark claims.
Temporary opt-in capture should be removed after cause is resolved unless retained
as a justified development diagnostic; never enable by default or ship silently.

Validation73:3 trace tests PASS,2 existing host bridge/reopen tests PASS,3 relevant
editor/real CLI/MCP regressions PASS; strict Core/runtime TS and57-source boundaries
PASS. No full-suite replay: existing editor/UI/Core/runtime/native/schema/dependency/
lock/bundled resources untouched. Prior72 full220 tests do not qualify native blink.


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

## Roadmap and housekeeping included69

User added deferred AI active-app/current-note/selection integration to roadmap;
see rebuild/README.md. Do not implement that in formatting. Targeted .gitignore
restores exclusions for retired generated schemas/r07 output and worker local secrets/
emulator state after user reported them untracked. No Mac files deleted or read;
.dev.vars stays local. 69 delivers the formatting implementation; native check is next.
