# Resume Clutter Structured

## Current checkpoint — split policy and new windows57, 2026-11-17

USER56 VISUAL PASS: “the flickering has stopped”. Preserve this scoped observation;
it is not a raw native compile/IME/full lifecycle qualification report. User agreed
that Open in split is disabled for a note already displayed in the current tab,
with an explicit enabling option; new tab and new window remain available. User
then authorized proceeding. These are stage2 changes; stage3 UX/code has NOT begun.

57 implements default allowDuplicateNoteInTab:false in the shared navigation model
and NoteMenu. canSplit/split guard the rule at execution/rebase, not just the button.
Only current pane pages in the target tab count: history, cached contexts and other
tabs/windows do not. Restoring an existing layout does not delete duplicate views.
Normal current-pane opening and Back/Forward remain the agreed P-40 navigation;
this is split admission, not a new focus-existing-pane override for normal clicks.
Passing allowDuplicateNoteInTab:true to mountWorkspace/WindowWorkspace enables the
underlying supported same-note splits. Consistency tests explicitly retain that mode.

Open in new tab still creates another tab. Open in new window uses an injected UI
host port; the Tauri mechanism creates another window in the SAME native process and
uses the SAME Space endpoint/token/Core owner, with a fresh window ID and its own
layout/editor contexts. The browser entry passes the requested initial page only
when no saved layout exists. Native windows start hidden and show after UI ready
(or show its error state); no new semantic authority or app-to-CLI writer is added.

Native host now has per-window nonce-bound close guards and an all-window quit barrier.
A refused quit resumes already-prepared peer windows and polling. New-window requests
have IDs, native replay records, a bounded acknowledgement timeout, and a UI close
barrier. A request acknowledgement confirms window creation, not editor load/native
qualification. Child locator records contain only window/page IDs, written privately
before reveal; no bodies/tokens enter those records. New window does NOT mean a new
independent application process. Windows lifecycle policy remains shared UI/Core.

Developer same-session child recovery is addressable: after ALL native windows close,
npm run desktop:reopen -- --window-id CHILD_WINDOW_ID reuses its saved layout/context
IDs. Descriptors live under Git metadata clutter-structured53/windows/<session-hash>/.
The normal reopen still uses the original window. This is developer recovery plumbing,
not a finished recent-windows/automatic session-restoration UX. No descriptor cleanup
or installed Windows platform qualification is implied. Previous sessions retained.

114/114 Linux tests, strict Core/runtime TS and42-source boundary checks pass. Production
React/PM/Core/SQLite runs two real UI windows through an injected host adapter, confirms
the same owner instance, shared accepted edits, independent DOM/context/close guards,
and menu admission. Additional bridge VM tests cover scoped request/reply/close/resume,
timeout/no token in emitted address, and private session-scoped child locators. Enabled
same-note split consistency remains tested. Native Rust compilation and actual Tauri
window creation/quit were NOT run: this Linux environment has no Rust compiler. No
native57 pass inferred from JS tests. Official Tauri API references are in scoped evidence.
Evidence: [review](evidence/navigation-windows-57-2026-11-17/review.json).

NEXT: close prior dev windows, apply/commit57, npm run desktop -- --new (fresh synthetic
Space; no dependency install). First verify the native build succeeds. Open a note's
menu: split disabled for its current tab; new tab enabled; new window opens the same
note. Edit/save in either window and observe the other update. Closing the second
window must leave the first usable. Actual app quit/all-window refusal is a separate
native guard check, not a passing result yet. Report first scoped result; no old host
profiling/manual suite replay. After this navigation feedback, discuss stage3 UX ONE
question at a time before implementing editor/title/familiar-UI features.

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
