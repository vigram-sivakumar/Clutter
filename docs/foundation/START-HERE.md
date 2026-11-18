# Resume Clutter Structured

## Current checkpoint — shared paste selection, build 76

The user confirmed the build 75 caret fix on macOS. Build 76 replaces the separate
multiline title-paste highlight with the same block selection used by Cmd/Ctrl+A.
Paste appends all lines, scrolls to the first appended block and selects exactly
the appended blocks. Cmd/Ctrl+A then includes the existing body blocks. The
title stays outside block selection. Future drag and marquee use this selection.

12 targeted editor checks passed, including accepted paste readback through real
CLI and MCP clients, undo, and the caret regressions. TypeScript and the 57-source
boundary audit passed. Mac acceptance for paste selection is pending.

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
  scrolls there and selects the appended blocks using the shared block selection.
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
