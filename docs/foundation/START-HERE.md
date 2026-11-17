# Resume Clutter Structured

## Current checkpoint — title/body capability60, 17 November 2026

**3A is implemented; targeted Mac verification is next.** Read
[the outcome and test checklist](rebuild/title-body-60.md), then the
[stage3 UX](rebuild/stage3-ux.md) and [implementation plan](rebuild/stage3-implementation-plan.md).
Do not restart the UX questionnaire or host/framework comparison.

One structured document now owns title and body in the same PM/Y context/history.
Plain title is derived for read/list/tab/sidebar; scalar title writes are rejected.
The current minimal UI is the working product carrier. Final Clutter layout/global
components follow after working capabilities; do not restore retired controllers.

**User workflow:** finish one capability, verify it, then move on. Complete scoped
Mac title/body checks before starting3B. Full stage3 is NOT complete. Next code part
is3B common blocks/formatting, following the existing UX; no feature expansion in60.

Schema2 is explicit: `content:{format:"clutter.page-json",schemaVersion:2,value:...}`.
Use `npm run desktop -- --new` after applying60. This compiles changed source into
a fresh synthetic Space. Old sessions remain with their original bundles; no
migration/reinterpretation. Native host/dependency locks are unchanged.

Validation:120 Linux tests (119 full-suite plus the final single-line paste check),
strict Core/runtime TS and43-source boundary checks passed. Actual React/PM/Core/
SQLite and real CLI/MCP processes are exercised; native build/caret/scroll/IME and
shipping qualification are NOT inferred. Preserve the prior scoped user56/57 passes
and intermittent native caret risk. Do not replay retired measurement suites.

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
