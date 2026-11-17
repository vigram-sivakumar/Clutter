# Resume Clutter Structured

## Current checkpoint — slash block insertion61, 17 November 2026

**3A title/body is complete with scoped user Mac PASS.** All requested checks passed:
new-note title focus/Enter, Backspace boundary, Shift+Enter, Enter before existing
body, ordered Undo/Redo, multiline paste feedback and Save/close/reopen persistence.
See [title/body outcome](rebuild/title-body-60.md) and its evidence JSON.

**Current correction62:** user61 says everything looks good except separator focus,
then confirms separator must move caret into the line BELOW.62 now creates/reuses a
normal paragraph there, retaining inline suffix content and existing later headings.
Read [correction/checklist](rebuild/separator-62.md). Scoped Mac confirmation is next;
no new capability is added until this correction is checked.

Ordinary heading insertion still retains the original paragraph caret per S06. An
empty heading is actually created below with basic heading CSS; continued typing in
the original paragraph is not proof heading styles are absent. The automated UI
reproduces this sequence and verifies separator continuation is paragraph-sized.

**New UX queued:** two-stage Ctrl+A/body block selection with title exclusion and
Escape. See A01–A05 in [stage3 UX](rebuild/stage3-ux.md). This is3C, not implemented61.
Body Ctrl+A must never include title; Ctrl+A in title selects only title text.

Validation61:133 Linux tests, strict Core/runtime TS and45-source checks passed.
Correction62:56 editor tests plus1 production React/PM/Core/SQLite test passed;
45-source checks pass. No full-suite replay/changed native build is claimed for62. Actual PM/React/Core/
SQLite and CLI/MCP processes are tested. No native61 menu/caret/scroll/IME or shipping
qualification is inferred. Native source/dependencies/locks remain unchanged.

Apply62 over61 and run `npm run desktop -- --new` to build the changed source into
a fresh synthetic Space. Prior sessions remain with original bundles. One content
owner, no React body mirror, unchanged stable navigation/surface lifecycle. Final
Clutter components/layout follow working capability checks, not another writer.

## Working agreement

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
