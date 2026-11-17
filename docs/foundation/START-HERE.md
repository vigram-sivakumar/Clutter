# Resume Clutter Structured

## Current checkpoint — seamless note navigation55, 2026-11-17

User reports navigation54 works, but routine switching showed “Preparing view…”.
The confirmed requirement is natural note switching without blanking, flicker or
loading messages. This is a stage2 correction, not stage3 implementation.

55 keeps the current editor mounted while preparing a destination. New view IDs
are durably registered and destination contexts primed before publishing the route.
The previous content briefly stays read-only during preparation so typing cannot
land in the wrong note. Unaffected split-pane DOM stays mounted. Visited contexts
and their scoped identity promises are reused; returning to registered notes does
not wait for disk/transport layout bookkeeping. Those metadata updates are coalesced
for120ms; Save/Close checkpoint the latest state and serialize outstanding writes.
Failed preparation retains the previous visible note and supports retry. No second
body cache, Core owner, schema, dependency, native host or storage source change.

104/104 Linux integration tests, strict Core/runtime TypeScript and41-source boundary
checks pass. Production React/PM bundle with real Core/SQLite verifies stable old
DOM while registration is delayed, sibling-pane identity, navigation failure/retry,
warm navigation without disk acknowledgement and close waiting for metadata.
jsdom has no layout/presentation engine: Mac55 visual smoothness, caret, IME and
native close/reopen are pending. No timing/instant-switch or shipping claim.
Evidence: [review](evidence/note-transitions-55-2026-11-17/review.json).

NEXT: apply55, close the prior development window, npm run desktop -- --new (fresh
synthetic Space; earlier sessions retained). Create notes with different text; click
between them and use Back/Forward, then switch the active note in a split. Expect
no Preparing view/blank flash and the other pane to stay stable. Reopen this session
with npm run desktop:reopen. No old profiler/manual suite replay. After this scoped
feedback, discuss stage3 UX ONE question at a time before implementing that stage.

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
