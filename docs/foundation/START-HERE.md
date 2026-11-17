# Resume Clutter Structured

## Current checkpoint — roadmap stage2 navigation54, 2026-11-17

User PASS after53: the new development window switches between notes. Do not infer
53 close/reopen, full native lifecycle or installed-data qualification from that.
53 removed the entire legacy full/compact Markdown/CM6/vault/persistence pipeline;
54 preserves the clean package split, one Core and exact dependency/native locks.

LATEST confirmed P-40 navigation (supersedes intermediate discussion):
Window -> Tabs -> each tab's split layout -> note panes. Ordinary opening stays in
the current tab's active pane with Back/Forward history. Only explicit note-menu
"Open in new tab" creates another tab; "Open in split view" adds a pane inside the
currently active tab. Same or different notes are supported. No default global
focus-existing-tab override, no per-pane tab strip, no auto-new-tab for normal clicks.

54 implements that navigation foundation: tab strip, per-pane Back/Forward, actual
note menus, multiple splits per tab, independent active-pane selection and restored
tab layouts. Editing contexts/bookmarks and in-memory viewports survive navigation;
Undo/Redo remain editor-context operations, separate from Back/Forward note history.

WindowNavigation owns only IDs/layout/history, never note bodies. A UI-injected
stateStore port persists versioned window metadata through the same private runtime.
Opaque runtime file storage is not another semantic document owner. UI-only endpoint,
bounded validation, monotonic revisions/exact retries and fsync/atomic replace protect
the metadata. New view identities are checkpointed before editing is enabled. Visited
note references survive forward-history branching so protected contexts remain
addressable. Existing registered editors remain usable after a failed close/layout
write; unregistered new views wait for Retry navigation. Close guards every retained
context, hidden tab and visited note plus unresolved creation/navigation writes.

102/102 Linux integration tests, strict Core/runtime TS and41-source package checks
pass. Real React bundle/PM DOM/SQLite/CLI/MCP checks include same-note convergence,
different-note splits, per-tab layout restore, hidden-tab failed protection, actual
owner restart + recovery in the original context, and layout-write failure/retry.
These are jsdom/integration results, not native macOS layout/IME/gesture/a11y proof.
No Chromium/host profiling replay or dependency upgrade. Scoped evidence is
[evidence](evidence/tab-navigation-54-2026-11-17/review.json).

NEXT user action: apply/commit54, close the previous development window and build
with npm run desktop -- --new to load changed source. This explicitly creates a new
synthetic Space; old builds/sessions/locators are retained. Future same-session reopen
uses npm run desktop:reopen. Initial native check: create two notes, normal-click
between them and use Back/Forward (one tab); then note menu -> new tab / split and
verify the split stays in its tab when switching. Synthetic text only. No old suite
replay. Native54 compile/interaction/close/reopen not yet reported.

This remains development UI, not restoration of Clutter's final visual design. Tab/
pane close/reordering/resizing and full window/installed-storage/feature UX remain
later work; do not imply they exist. Decoder bounds are prototype safety limits,
not agreed product limits. No stage3 title/rich-text/familiar-UI work has begun.

## Next stage — UX first, one question at a time

User explicitly requests a UX discussion BEFORE implementing each stage starting
with roadmap stage3 (editor and familiar UI / prior R2). After stage2 feedback,
ask ONE concrete UX question at a time, record answers, agree that stage's UX and
only then implement it. Preserve confirmed behaviors; don't re-ask settled rules.
Do not silently start title editing, block components or the real layout. No more
architecture/host-selection research as a prerequisite. Later stages cover full
features, desktop completion and data/release gates; no existing-user migration.

## Worktrees and authority

- /Users/sivakuv3/Documents/Personal/projects/Clutter Structured:
  architecture/clutter-foundation, active rebuild.
- /Users/sivakuv3/Documents/Personal/projects/Clutter Markdown:
  main, existing application. Same repository; separate checked-out files/builds.

No source is migrated from main. Its read-only5c532f8 snapshot was only a visual/
behavior reference. No automatic commit/push/merge/main switch. Root AGENTS.md,
ARCHITECTURE_RULES.md, docs/architecture.md and confirmed product contracts replace old
frozen class/API governance. Current checkpoint overrides dated historical next steps.
