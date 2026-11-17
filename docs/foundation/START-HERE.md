# Resume Clutter Structured

## Current checkpoint — stable view lifecycle56, 2026-11-17

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

LATEST confirmed P-40 navigation (supersedes intermediate discussion):
Window -> Tabs -> each tab's split layout -> note panes. Ordinary opening stays in
the current tab's active pane with Back/Forward history. Only explicit note-menu
"Open in new tab" creates another tab; "Open in split view" adds a pane inside the
currently active tab. Same or different notes are supported. No default global
focus-existing-tab override, no per-pane tab strip, no auto-new-tab for normal clicks.

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
