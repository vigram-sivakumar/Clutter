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
