# Development

Use `/Users/sivakuv3/Documents/Personal/projects/Clutter Structured` on
`architecture/clutter-foundation`. The `Clutter Markdown` worktree is `main`, the
existing application. They share Git history, not checked-out files/dependencies.
Do not merge/push/main-switch as part of routine rebuild work.

Install with `npm ci --ignore-scripts`. Root lock contains only the five new
workspaces and their exact reachable dependencies. No CM6/Lezer/Markdown parser,
legacy Tauri frontend plugins or old automation stack is required. Do not run a
blanket npm audit fix or install a new dependency graph to hide a missing lock entry.

| Command | Purpose |
| --- | --- |
| npm run desktop | Build/launch the new Tauri product entry on macOS ARM64 |
| npm run desktop:reopen | Reopen its same saved development Space/bundle |
| npm run desktop -- --new | Explicit different disposable Space after source changes; prior locator retained |
| npm run desktop:check | Facts-only platform/bootstrap requirements; no compilation/pass inferred |
| npm test | Core/editor/storage/transport/React integration tests; Node24.22.1 |
| npm run typecheck | Strict Core/runtime TypeScript checks |
| npm run check:boundaries | Package directions, retired source/dependency absence |

The native runner bootstraps checksum-pinned Node24.22.1, requires the previously
verified existing Rust1.90.0/Xcode environment, copies exact checked-in native
manifests/locks, uses npm ci and locked Cargo acquisition then locked/offline compile.
Its generated projects, runtime, bundles and locator live under Git metadata
clutter-structured53; nothing under node_modules/build outputs is source evidence.
No old experiment project/report/cache is required. Native dependency root crate names
remain the exact exported locked identity; this is one host, not a second app.

This delivery deliberately uses a fresh Structured development locator rather than
adapting old proof session paths or data. Old synthetic sessions are left untouched.
It does not migrate notes or reinterpret historical private metadata. Reopen only
after this entry has successfully launched once. Explicit --new is needed to compile
source changes if a previous Structured locator already exists.

Initial verification on Mac: create two pages, type distinguishable text in each,
switch back, close safely and reopen with npm run desktop:reopen. Confirm the same
pages/text. Do not replay old profiler/qualification suites. Native build, window
lifecycle and editor behavior are only claimed after actual observation.

R1 is a development slice. Current title is Untitled (title UX/implementation waits for the stage3 discussion); page
list/create/open and paragraphs are implemented. The rest of editor/feature UI,
actual installed storage paths/permissions/single-owner discovery, final format,
Windows/browser compositions, scale and release/distribution remain tracked.

## Navigation54

Normal note clicks navigate the current tab/active pane. Back/Forward are the header
arrow buttons for that pane. The ellipsis menu beside each sidebar note offers
Open in new tab and Open in split view; splits belong to the active tab. Click inside
a pane to make it the navigation target. Selecting a tab restores its own panes.
Use the same note in multiple views to check shared-content consistency separately
from the usual different-note comparison. Undo/Redo belong to each editor context.

The private per-window snapshot records IDs, histories and visited note references,
never note bodies. It lives in the marked development session outside source control.
Same-session reopen restores tabs/layout and stable recovery contexts. Native shape,
caret/scroll behavior and OS gestures still need their actual scoped checks; Linux
jsdom has no layout engine. No installed-storage qualification is inferred.

Apply54 then rebuild changed source with npm run desktop -- --new (previous sessions
retained; new synthetic Space is explicit). No dependency install is needed for54.
Reopen that new session with npm run desktop:reopen. Tab/pane closing, rearranging and
resizing are not implemented in this slice. From stage3 onward, agree UX first via
one question at a time; do not implement title/rich-text/final visual UI before then.

## Note transitions55

Routine note navigation must not blank the editor or display a loading placeholder.
55 primes destination contexts before publishing navigation, reuses retained contexts
for visited notes and keeps unaffected split editors mounted. While a cold destination
prepares, the previous editor remains visible/read-only. Already registered destinations
switch without waiting for another private metadata acknowledgement. Warm metadata
bookkeeping is coalesced for120ms; Save/Close checkpoint latest and wait for writes.
Failures retain the current route for retry. No note body is copied into React state.

Apply55 then npm run desktop -- --new; old sessions retained, no dependency install.
Mac visual smoothness is pending; jsdom checks DOM/lifecycle, not presentation.
Stage3 UX must be discussed one question at a time before implementation.

## View lifecycle56 (supersedes55 transition pausing)

56 retains existing pane editability during all normal preparation. It stages actual
PM views before reveal, keeps stable pane hosts and recent DOM surfaces, and scopes
operation/render state. New Page keeps its normal label during pending success.
Split insertion reveals ready content and layout together; existing-pane reflow is
expected. Late completions cannot override newer routes/focus. Close still freezes,
settles all operations and protects all retained contexts. Surface eviction retains
contexts/history; inactive DOM cache budget is16 after reservations settle.

No dependency install is needed. Close previous dev window; apply56 and rebuild with
npm run desktop -- --new (fresh synthetic Space, previous sessions retained). Check
New Page, split, normal note navigation, Back/Forward and tabs for no dimming/blank
flash. Mac presentation/IME/caret/scroll remains pending. Stage3 UX discussion first.

## Navigation/windows57

User56 reports flicker stopped.57 changes split admission: Open in split is disabled
if the note is displayed in the current tab; other tabs/history do not count. Shared
UI composition can opt into allowDuplicateNoteInTab:true; it defaults false.
Open in new tab creates a tab; Open in new window creates another Tauri window in
the same process/Space authority. No dependency install is needed. Rebuild source
with npm run desktop -- --new after closing previous dev windows.

Native57 compilation and actual window/quit checks must run on Mac; this Linux host
has no Rust compiler. The114 passing tests include two actual production UI bundles
sharing a real owner through an injected window adapter, not a Tauri launch. Check
menu admission and opening the same note in another window first. Shared editing,
closing one window while the other stays usable, and app quit/refusal are distinct
native observations. No profiler replay. Stage3 UX discussion still precedes code.

Normal npm run desktop:reopen restores the original window. For developer recovery
of a child, close ALL native windows, then use:

```bash
npm run desktop:reopen -- --window-id CHILD_WINDOW_ID
```

IDs/page references are retained in private Git metadata under
clutter-structured53/windows/<session-hash>/*.json; no bodies/tokens in descriptors.
This explicit developer path preserves context identity; recent-window/automatic
session restore UX has not been implemented. Keep synthetic data until release gates.

## Documentation58 — stage3 UX checkpoint

[Stage3 UX decisions](foundation/rebuild/stage3-ux.md) records current confirmed
behavior, final corrections and deferred scope. Read it with the resume checkpoint
before continuing. This delivery changes documentation only: no npm install,
application rebuild, new session or test replay is needed. Stage3 code has not begun;
formatting-toolbar actions remain the next unanswered UX question.

## Plan59 — stage3 implementation order

Read [the plan](foundation/rebuild/stage3-implementation-plan.md) with the updated
UX record. Toolbar actions and preset-only colours are confirmed. Next is3A: shared
structured title/body schema, Core/codec contract and one editing history, followed
by the real title/paste view. Later parts add common blocks/formatting, block
selection/drag, tasks/images and tables. No new architecture-selection or migration
phase.59 itself is docs only; no install/build/session change is required.
